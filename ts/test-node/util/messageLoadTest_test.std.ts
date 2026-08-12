// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import {
  formatMessageLoadTestBody,
  isValidMessageLoadTestOptions,
  MESSAGE_LOAD_TEST_MAX_INTERVAL_MS,
  MESSAGE_LOAD_TEST_MIN_INTERVAL_MS,
} from '../../util/messageLoadTest.std.ts';

describe('messageLoadTest', () => {
  describe('isValidMessageLoadTestOptions', () => {
    it('accepts options at the safety limits', () => {
      assert.isTrue(
        isValidMessageLoadTestOptions({
          intervalMs: MESSAGE_LOAD_TEST_MIN_INTERVAL_MS,
          messagePrefix: 'Load test',
        })
      );
      assert.isTrue(
        isValidMessageLoadTestOptions({
          intervalMs: MESSAGE_LOAD_TEST_MAX_INTERVAL_MS,
          messagePrefix: 'Load test',
        })
      );
    });

    it('rejects values outside the safety limits', () => {
      assert.isFalse(
        isValidMessageLoadTestOptions({
          intervalMs: MESSAGE_LOAD_TEST_MIN_INTERVAL_MS - 1,
          messagePrefix: 'Load test',
        })
      );
      assert.isFalse(
        isValidMessageLoadTestOptions({
          intervalMs: MESSAGE_LOAD_TEST_MIN_INTERVAL_MS,
          messagePrefix: '   ',
        })
      );
    });
  });

  it('formats a trimmed message without a sequence number', () => {
    assert.strictEqual(formatMessageLoadTestBody('  Load test  '), 'Load test');
  });
});
