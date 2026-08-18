// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { strict as assert } from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { MINUTE } from '../../util/durations/index.std.ts';
import type { AccountProfilesSnapshot } from '../../types/AccountProfile.std.ts';
import type { App } from '../playwright.node.ts';
import { Bootstrap } from '../bootstrap.node.ts';

describe('account switching', function (this: Mocha.Suite) {
  this.timeout(2 * MINUTE);

  let bootstrap: Bootstrap;
  let app: App;

  beforeEach(async () => {
    bootstrap = new Bootstrap({ contactCount: 0 });
    await bootstrap.init();
    app = await bootstrap.link();
  });

  afterEach(async function (this: Mocha.Context) {
    if (!bootstrap) {
      return;
    }
    await bootstrap.maybeSaveLogs(this.currentTest, app);
    await app.close();
    await bootstrap.teardown();
  });

  it('hot-swaps account runtimes in the same process and window', async () => {
    const page = await app.getWindow();
    const initialPid = app.getProcessId();
    const initialDataPath = await page.evaluate<string>(
      'window.SignalCI.getUserDataPath()'
    );
    assert(initialDataPath);
    await page.evaluate(`
      localStorage.setItem('windowOpacity', '73');
      localStorage.setItem('accountScopedProbe', 'primary');
    `);

    await page.locator('.NavTabs__ItemIcon--Settings').click();
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    await page.getByRole('button', { name: 'Accounts' }).click();
    const addAccountButton = page.getByRole('button', { name: 'Add account' });
    await addAccountButton.waitFor();

    let initialSnapshot: AccountProfilesSnapshot | undefined;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop
      initialSnapshot = await page.evaluate<AccountProfilesSnapshot>(
        'window.SignalCI.getAccountProfiles()'
      );
      if (
        initialSnapshot?.profiles.find(profile => profile.id === 'default')
          ?.presentation?.title
      ) {
        break;
      }
      // oxlint-disable-next-line no-await-in-loop
      await page.waitForTimeout(100);
    }
    assert(initialSnapshot);
    const primaryPresentation = initialSnapshot.profiles.find(
      profile => profile.id === 'default'
    )?.presentation;
    assert(primaryPresentation?.title, JSON.stringify(initialSnapshot));

    await addAccountButton.click();

    const createdSnapshot = await page.evaluate<AccountProfilesSnapshot>(
      'window.SignalCI.getAccountProfiles()'
    );
    assert(createdSnapshot);
    const secondary = createdSnapshot.profiles.find(
      profile => profile.name === 'New Account'
    );
    assert(secondary);
    assert.deepEqual(
      createdSnapshot.profiles.find(profile => profile.id === 'default')
        ?.presentation,
      primaryPresentation
    );
    assert.equal(createdSnapshot.activeProfileId, 'default');

    const visibleAccountsPanel = page.locator('.Preferences__content:visible');
    const secondaryRow = visibleAccountsPanel.locator(
      `.PreferencesAccounts__item[data-profile-id="${secondary.id}"]`
    );
    await secondaryRow.waitFor();

    const switchedToSecondary = page.waitForEvent('load');
    const secondaryAppLoaded = app.waitUntilLoaded();
    await secondaryRow.getByRole('button', { name: 'Switch' }).click();
    await Promise.all([switchedToSecondary, secondaryAppLoaded]);

    const secondarySnapshot = await page.evaluate<AccountProfilesSnapshot>(
      'window.SignalCI.getAccountProfiles()'
    );
    assert(secondarySnapshot);
    assert.equal(secondarySnapshot.activeProfileId, secondary.id);
    const secondaryDataPath = await page.evaluate<string>(
      'window.SignalCI.getUserDataPath()'
    );
    assert.notEqual(secondaryDataPath, initialDataPath);
    const badgeProbePath = join(
      secondaryDataPath,
      'badges.noindex',
      'account-switch-probe.svg'
    );
    mkdirSync(join(secondaryDataPath, 'badges.noindex'), { recursive: true });
    writeFileSync(
      badgeProbePath,
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="green"/></svg>'
    );
    assert.equal(
      await page.evaluate(
        source =>
          new Promise<boolean>(resolve => {
            const image = new globalThis.Image();
            image.onload = () => resolve(image.naturalWidth === 24);
            image.onerror = () => resolve(false);
            image.src = source;
          }),
        pathToFileURL(badgeProbePath).href
      ),
      true,
      'the file protocol must allow badge images from the active profile'
    );
    assert.equal(existsSync(join(secondaryDataPath, 'ephemeral.json')), false);
    assert.deepEqual(
      await page.evaluate(`({
        windowOpacity: localStorage.getItem('windowOpacity'),
        accountScopedProbe: localStorage.getItem('accountScopedProbe'),
      })`),
      { windowOpacity: '73', accountScopedProbe: null }
    );
    assert.equal(app.getProcessId(), initialPid);
    assert.equal(await app.getWindow(), page);

    const returnToPrimaryButton = page.getByRole('button', {
      name: 'Switch to Primary',
    });
    await returnToPrimaryButton.waitFor();
    const switchedToPrimary = page.waitForEvent('load');
    await returnToPrimaryButton.click();
    await switchedToPrimary;

    const primarySnapshot = await page.evaluate<AccountProfilesSnapshot>(
      'window.SignalCI.getAccountProfiles()'
    );
    assert(primarySnapshot);
    assert.equal(primarySnapshot.activeProfileId, 'default');
    assert.equal(
      await page.evaluate<string>('window.SignalCI.getUserDataPath()'),
      initialDataPath
    );
    assert.equal(app.getProcessId(), initialPid);
    assert.equal(await app.getWindow(), page);

    await page.locator('.NavTabs__ItemIcon--Settings').click();
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    await page.getByRole('button', { name: 'Accounts' }).click();
    const restoredAccountsPanel = page.locator('.Preferences__content:visible');
    const restoredSecondaryRow = restoredAccountsPanel.locator(
      `.PreferencesAccounts__item[data-profile-id="${secondary.id}"]`
    );
    await restoredSecondaryRow
      .getByRole('button', { name: 'Edit alias' })
      .click();
    const aliasInput = restoredSecondaryRow.getByRole('textbox', {
      name: 'Account alias',
    });
    await aliasInput.fill('Work');
    await restoredSecondaryRow.getByRole('button', { name: 'Save' }).click();
    await restoredSecondaryRow.getByText('Work', { exact: true }).waitFor();

    const renamedSnapshot = await page.evaluate<AccountProfilesSnapshot>(
      'window.SignalCI.getAccountProfiles()'
    );
    assert(renamedSnapshot);
    assert.equal(
      renamedSnapshot.profiles.find(profile => profile.id === secondary.id)
        ?.name,
      'Work'
    );

    await restoredSecondaryRow.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('heading', { name: 'Delete Work?' }).waitFor();
    await page.getByRole('button', { name: 'Delete account' }).click();
    await restoredSecondaryRow.waitFor({ state: 'detached' });
    assert.equal(existsSync(secondaryDataPath), false);
    assert.equal(
      (
        await page.evaluate<AccountProfilesSnapshot>(
          'window.SignalCI.getAccountProfiles()'
        )
      ).profiles.some(profile => profile.id === secondary.id),
      false
    );

    const screenshotPath = process.env.SIGNAL_ACCOUNT_SWITCH_SCREENSHOT;
    if (screenshotPath) {
      await page.getByRole('button', { name: 'Add account' }).waitFor();
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  });
});
