// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { BadgeImageTheme } from '../../badges/BadgeImageTheme.std.ts';
import { getBadgeImageFileLocalPath } from '../../badges/getBadgeImageFileLocalPath.std.ts';
import { _getStoredBadge } from '../../components/PreferencesAccounts.dom.tsx';

describe('PreferencesAccounts', () => {
  it('reconstructs a stored badge at the account avatar display size', () => {
    const badge = _getStoredBadge({
      name: 'Supporter',
      lightImageDataUrl: 'data:image/png;base64,bGlnaHQ=',
      darkImageDataUrl: 'data:image/png;base64,ZGFyaw==',
    });

    assert.exists(badge);
    assert.strictEqual(
      getBadgeImageFileLocalPath(badge, 24, BadgeImageTheme.Light),
      'data:image/png;base64,bGlnaHQ='
    );
    assert.strictEqual(
      getBadgeImageFileLocalPath(badge, 24, BadgeImageTheme.Dark),
      'data:image/png;base64,ZGFyaw=='
    );
  });
});
