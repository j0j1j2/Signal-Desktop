// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { _getPreferredBadge } from '../../../state/selectors/badges.preload.ts';
import { getFakeBadge } from '../../../test-helpers/getFakeBadge.std.ts';

describe('state/selectors/badges', () => {
  it('uses the profile badge reference as the visibility authority', () => {
    const catalogBadge = {
      ...getFakeBadge({ id: 'donor' }),
      expiresAt: Date.now() + 60_000,
      isVisible: false,
    };

    const result = _getPreferredBadge({ donor: catalogBadge }, [
      { id: 'donor', isVisible: true },
    ]);

    assert.exists(result);
    assert.propertyVal(result, 'isVisible', true);
  });

  it('does not return a profile badge marked invisible', () => {
    const catalogBadge = {
      ...getFakeBadge({ id: 'donor' }),
      expiresAt: Date.now() + 60_000,
      isVisible: true,
    };

    const result = _getPreferredBadge({ donor: catalogBadge }, [
      { id: 'donor', isVisible: false },
    ]);

    assert.isUndefined(result);
  });
});
