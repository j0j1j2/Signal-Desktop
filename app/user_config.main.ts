// Copyright 2017 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { app } from 'electron';

import { start, type ConfigType } from './base_config.node.ts';
import config from './config.main.ts';
import * as Errors from '../ts/types/errors.std.ts';
import OS from '../ts/util/os/osMain.node.ts';
import { AccountProfileManager } from './account_profiles.node.ts';

let userData: string | undefined;
// Use separate data directory for benchmarks & development
if (config.has('storagePath')) {
  userData = String(config.get('storagePath'));
} else if (config.has('storageProfile')) {
  userData = join(
    app.getPath('appData'),
    // oxlint-disable-next-line typescript/restrict-template-expressions
    `Signal-${config.get('storageProfile')}`
  );
} else if (OS.isAppImage()) {
  userData = join(app.getPath('appData'), `${app.getName()} AppImage`);
}

if (userData !== undefined) {
  try {
    mkdirSync(userData, { recursive: true });
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error('Failed to create userData', Errors.toLogFormat(error));
  }

  app.setPath('userData', userData);
}

const defaultUserDataPath = app.getPath('userData');
export const accountProfileManager = new AccountProfileManager(
  defaultUserDataPath
);

// Use console.log because logger isn't fully initialized yet
// oxlint-disable-next-line no-console
console.log(`userData: ${defaultUserDataPath}`);
// oxlint-disable-next-line no-console
console.log(`activeAccountData: ${accountProfileManager.getActiveDataPath()}`);

let currentUserConfig = createUserConfig(
  accountProfileManager.getActiveDataPath()
);

function createUserConfig(userDataPath: string) {
  return start({
    name: 'user',
    targetPath: join(userDataPath, 'config.json'),
    throwOnFilesystemErrors: true,
  });
}

// This stable facade is intentionally retained by modules that install long-lived
// IPC callbacks. Switching the backing config keeps those callbacks account-scoped.
export const userConfig: ConfigType = {
  get: (keyPath: string) => currentUserConfig.get(keyPath),
  set: (keyPath: string, value: unknown) =>
    currentUserConfig.set(keyPath, value),
  remove: () => currentUserConfig.remove(),
  _getCachedValue: () => currentUserConfig._getCachedValue(),
};

export function switchUserDataPath(userDataPath: string): void {
  mkdirSync(userDataPath, { recursive: true });
  currentUserConfig = createUserConfig(userDataPath);
}

export function getActiveUserDataPath(): string {
  return accountProfileManager.getActiveDataPath();
}

export const get = userConfig.get;
export const remove = userConfig.remove;
export const set = userConfig.set;
