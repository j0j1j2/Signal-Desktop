// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { _getOtherAccountProfiles } from '../../components/installScreen/InstallScreenAccountSwitcher.dom.tsx';
import type { AccountProfile } from '../../types/AccountProfile.std.ts';

describe('InstallScreenAccountSwitcher', () => {
  const primary: AccountProfile = {
    id: 'default',
    name: 'Primary',
    createdAt: 1,
    isDefault: true,
    isActive: true,
  };

  it('has no return target during a completely fresh installation', () => {
    assert.deepEqual(_getOtherAccountProfiles([primary]), []);
  });

  it('offers existing accounts while linking an additional account', () => {
    const newAccount: AccountProfile = {
      id: 'new-account',
      name: 'New Account',
      createdAt: 2,
      isDefault: false,
      isActive: true,
    };
    const inactivePrimary = { ...primary, isActive: false };

    assert.deepEqual(
      _getOtherAccountProfiles([inactivePrimary, newAccount]),
      [inactivePrimary]
    );
  });
});
