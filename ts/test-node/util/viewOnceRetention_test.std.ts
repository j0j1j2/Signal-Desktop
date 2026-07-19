// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  isViewOnceMediaLocallyAvailable,
  shouldBlockViewOnceOpen,
  shouldEraseViewOnceMedia,
} from '../../util/viewOnceRetention.std.ts';

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

  it('allows viewed media to open even when the message is marked expired', () => {
    assert.isFalse(
      shouldBlockViewOnceOpen({
        isError: false,
        isExpired: true,
        isViewed: true,
      })
    );
  });

  it('blocks unavailable media that has not been viewed', () => {
    assert.isTrue(
      shouldBlockViewOnceOpen({
        isError: false,
        isExpired: true,
        isViewed: false,
      })
    );
  });

  it('uses the retained attachment path instead of the erased flag', () => {
    assert.isTrue(
      isViewOnceMediaLocallyAvailable({
        attachmentPath: 'retained/path',
        isErased: true,
      })
    );
    assert.isFalse(
      isViewOnceMediaLocallyAvailable({
        attachmentPath: undefined,
        isErased: true,
      })
    );
  });
});
