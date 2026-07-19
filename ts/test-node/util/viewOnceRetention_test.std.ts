// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { shouldEraseViewOnceMedia } from '../../util/viewOnceRetention.std.ts';

describe('viewOnceRetention', () => {
  it('preserves view-once media for every automatic erase trigger', () => {
    const reasons = [
      'view-once-viewed',
      'view-once-sent',
      'view-once-expired',
    ] as const;

    for (const reason of reasons) {
      assert.isFalse(shouldEraseViewOnceMedia(reason), reason);
    }
  });
});
