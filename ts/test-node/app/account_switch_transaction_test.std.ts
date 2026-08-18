// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { runAccountSwitchTransaction } from '../../../app/account_switch_transaction.std.ts';

describe('runAccountSwitchTransaction', () => {
  it('commits after the replacement runtime is ready', async () => {
    const calls = new Array<string>();

    await runAccountSwitchTransaction({
      switchToNext: async () => {
        calls.push('switch');
      },
      commit: () => {
        calls.push('commit');
      },
      restorePrevious: async () => {
        calls.push('restore');
      },
    });

    assert.deepEqual(calls, ['switch', 'commit']);
  });

  it('restores the previous runtime when switching fails', async () => {
    const calls = new Array<string>();
    const switchError = new Error('switch failed');

    const result = runAccountSwitchTransaction({
      switchToNext: async () => {
        calls.push('switch');
        throw switchError;
      },
      commit: () => {
        calls.push('commit');
      },
      restorePrevious: async () => {
        calls.push('restore');
      },
    });

    await assert.isRejected(result, switchError);
    assert.deepEqual(calls, ['switch', 'restore']);
  });

  it('preserves both errors when rollback also fails', async () => {
    const switchError = new Error('switch failed');
    const restoreError = new Error('restore failed');

    const result = runAccountSwitchTransaction({
      switchToNext: async () => {
        throw switchError;
      },
      commit: () => undefined,
      restorePrevious: async () => {
        throw restoreError;
      },
    });

    try {
      await result;
      assert.fail('Expected transaction to fail');
    } catch (error) {
      assert.instanceOf(error, AggregateError);
      assert.deepEqual(error.errors, [switchError, restoreError]);
    }
  });
});
