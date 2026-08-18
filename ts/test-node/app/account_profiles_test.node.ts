// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert } from 'chai';

import { AccountProfileManager } from '../../../app/account_profiles.node.ts';

describe('AccountProfileManager', () => {
  let temporaryDirectory: string;
  let defaultUserDataPath: string;

  beforeEach(() => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'signal-accounts-'));
    defaultUserDataPath = join(temporaryDirectory, 'Signal');
  });

  afterEach(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('creates a default profile without moving the existing data directory', () => {
    const manager = new AccountProfileManager(defaultUserDataPath);
    const snapshot = manager.getSnapshot();

    assert.strictEqual(snapshot.activeProfileId, 'default');
    assert.strictEqual(manager.getActiveDataPath(), defaultUserDataPath);
    assert.deepEqual(
      snapshot.profiles.map(({ id, name, isActive }) => ({
        id,
        name,
        isActive,
      })),
      [{ id: 'default', name: 'Primary', isActive: true }]
    );
  });

  it('persists a newly created and activated account profile', () => {
    const manager = new AccountProfileManager(defaultUserDataPath);
    const created = manager.create('Work');
    manager.setActive(created.id);

    const reloaded = new AccountProfileManager(defaultUserDataPath);
    assert.strictEqual(reloaded.getActiveProfileId(), created.id);
    assert.strictEqual(
      reloaded.getSnapshot().profiles.find(profile => profile.id === created.id)
        ?.name,
      'Work'
    );
    assert.match(
      reloaded.getActiveDataPath(),
      new RegExp(`Signal-profiles.${created.id}$`)
    );
  });

  it('persists presentation details for the active account', () => {
    const manager = new AccountProfileManager(defaultUserDataPath);
    const imageDataUrl = `data:image/png;base64,${Buffer.from('image').toString(
      'base64'
    )}`;

    manager.updateActivePresentation({
      title: 'Alice',
      profileName: 'Alice Profile',
      phoneNumber: '+12025550123',
      color: 'A200',
      avatarDataUrl: imageDataUrl,
      badge: {
        name: 'Supporter',
        lightImageDataUrl: imageDataUrl,
        darkImageDataUrl: imageDataUrl,
      },
    });

    const reloaded = new AccountProfileManager(defaultUserDataPath);
    assert.deepEqual(reloaded.getSnapshot().profiles[0]?.presentation, {
      title: 'Alice',
      profileName: 'Alice Profile',
      phoneNumber: '+12025550123',
      color: 'A200',
      avatarDataUrl: imageDataUrl,
      badge: {
        name: 'Supporter',
        lightImageDataUrl: imageDataUrl,
        darkImageDataUrl: imageDataUrl,
      },
    });
  });

  it('deletes an inactive profile and its local data', () => {
    const manager = new AccountProfileManager(defaultUserDataPath);
    const created = manager.create('Temporary');
    const profileDataPath = manager.getDataPath(created.id);
    writeFileSync(join(profileDataPath, 'account-data'), 'private');

    manager.remove(created.id);

    assert.isFalse(existsSync(profileDataPath));
    assert.notInclude(
      manager.getSnapshot().profiles.map(profile => profile.id),
      created.id
    );
    assert.notInclude(
      new AccountProfileManager(defaultUserDataPath)
        .getSnapshot()
        .profiles.map(profile => profile.id),
      created.id
    );
  });

  it('does not delete the default or active profile', () => {
    const manager = new AccountProfileManager(defaultUserDataPath);
    const created = manager.create('Active');

    assert.throws(() => manager.remove('default'), 'default account');
    manager.setActive(created.id);
    assert.throws(() => manager.remove(created.id), 'active account');
    assert.isTrue(existsSync(manager.getDataPath(created.id)));
  });

  it('rejects empty names and unknown profile ids', () => {
    const manager = new AccountProfileManager(defaultUserDataPath);

    assert.throws(() => manager.create('   '), 'cannot be empty');
    assert.throws(() => manager.setActive('missing'), 'Unknown account');
  });

  it('falls back safely when the registry is malformed', () => {
    const manager = new AccountProfileManager(defaultUserDataPath);
    manager.create('Secondary');

    const registryPath = join(defaultUserDataPath, 'account-profiles.json');
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    registry.activeProfileId = 'missing';
    // The registry writer is tested through public mutations above. This direct
    // mutation verifies that a partial/corrupt switch never selects an unknown path.
    writeFileSync(registryPath, JSON.stringify(registry));

    const recovered = new AccountProfileManager(defaultUserDataPath);
    assert.strictEqual(recovered.getActiveProfileId(), 'default');
    assert.strictEqual(recovered.getActiveDataPath(), defaultUserDataPath);
  });

  it('does not commit an active profile when saving the registry fails', () => {
    const manager = new AccountProfileManager(defaultUserDataPath);
    const created = manager.create('Secondary');
    const registryPath = join(defaultUserDataPath, 'account-profiles.json');
    rmSync(registryPath);
    mkdirSync(registryPath);

    assert.throws(() => manager.setActive(created.id));
    assert.strictEqual(manager.getActiveProfileId(), 'default');
    assert.strictEqual(manager.getActiveDataPath(), defaultUserDataPath);
  });
});
