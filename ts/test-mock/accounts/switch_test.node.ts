// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
    const profileNameInput = page.getByRole('textbox', {
      name: 'New account profile name',
    });
    await profileNameInput.waitFor();
    await profileNameInput.fill('Secondary');

    const switchedToSecondary = page.waitForEvent('load');
    await page.getByRole('button', { name: 'Add account' }).click();
    await switchedToSecondary;

    const secondarySnapshot = await page.evaluate<AccountProfilesSnapshot>(
      'window.SignalCI.getAccountProfiles()'
    );
    assert(secondarySnapshot);
    const secondary = secondarySnapshot.profiles.find(
      profile => profile.name === 'Secondary'
    );
    assert(secondary);
    assert.equal(secondarySnapshot.activeProfileId, secondary.id);
    const secondaryDataPath = await page.evaluate<string>(
      'window.SignalCI.getUserDataPath()'
    );
    assert.notEqual(secondaryDataPath, initialDataPath);
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

    const switchedToPrimary = page.waitForEvent('load');
    await page.evaluate("void window.SignalCI.switchAccountProfile('default')");
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
    const visibleAccountsPanel = page.locator('.Preferences__content:visible');
    const secondaryRow = visibleAccountsPanel.locator(
      `.PreferencesAccounts__item[data-profile-id="${secondary.id}"]`
    );
    await secondaryRow.getByRole('button', { name: 'Edit alias' }).click();
    const aliasInput = secondaryRow.getByRole('textbox', {
      name: 'Account alias',
    });
    await aliasInput.fill('Work');
    await secondaryRow.getByRole('button', { name: 'Save' }).click();
    await secondaryRow.getByText('Work', { exact: true }).waitFor();

    const renamedSnapshot = await page.evaluate<AccountProfilesSnapshot>(
      'window.SignalCI.getAccountProfiles()'
    );
    assert(renamedSnapshot);
    assert.equal(
      renamedSnapshot.profiles.find(profile => profile.id === secondary.id)
        ?.name,
      'Work'
    );

    const screenshotPath = process.env.SIGNAL_ACCOUNT_SWITCH_SCREENSHOT;
    if (screenshotPath) {
      await page
        .getByRole('textbox', { name: 'New account profile name' })
        .waitFor();
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
  });
});
