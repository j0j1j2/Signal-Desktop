// Copyright 2018 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';

import { app } from 'electron';

import { start } from './base_config.node.ts';

// Ephemeral settings belong to the application shell, not to a Signal account.
// In particular, this keeps the single BrowserWindow's bounds stable while the
// active account's database and attachments are switched underneath it.
const userDataPath = app.getPath('userData');
const targetPath = join(userDataPath, 'ephemeral.json');

export const ephemeralConfig = start({
  name: 'ephemeral',
  targetPath,
  throwOnFilesystemErrors: false,
});

export const get = ephemeralConfig.get.bind(ephemeralConfig);
export const remove = ephemeralConfig.remove.bind(ephemeralConfig);
export const set = ephemeralConfig.set.bind(ephemeralConfig);
