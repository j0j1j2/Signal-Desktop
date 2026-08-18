// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { useCallback, useState, type JSX } from 'react';

import { AxoButton } from '../../axo/AxoButton.dom.tsx';
import type { AccountProfile } from '../../types/AccountProfile.std.ts';
import type { LocalizerType } from '../../types/Util.std.ts';
import { toLogFormat } from '../../types/errors.std.ts';
import { drop } from '../../util/drop.std.ts';

/** @testexport */
export function _getOtherAccountProfiles(
  accountProfiles: ReadonlyArray<AccountProfile> | undefined
): ReadonlyArray<AccountProfile> {
  return accountProfiles?.filter(profile => !profile.isActive) ?? [];
}

export function InstallScreenAccountSwitcher({
  accountProfiles,
  i18n,
  switchAccountProfile,
}: {
  accountProfiles: ReadonlyArray<AccountProfile> | undefined;
  i18n: LocalizerType;
  switchAccountProfile: (profileId: string) => Promise<void>;
}): JSX.Element | null {
  const [pendingAccountProfileId, setPendingAccountProfileId] =
    useState<string>();
  const [accountSwitchError, setAccountSwitchError] = useState<string>();
  const otherAccountProfiles = _getOtherAccountProfiles(accountProfiles);

  const onSwitchAccount = useCallback(
    async (profileId: string): Promise<void> => {
      setPendingAccountProfileId(profileId);
      setAccountSwitchError(undefined);
      try {
        await switchAccountProfile(profileId);
      } catch (error) {
        setPendingAccountProfileId(undefined);
        setAccountSwitchError(toLogFormat(error));
      }
    },
    [switchAccountProfile]
  );

  if (!otherAccountProfiles.length) {
    return null;
  }

  return (
    <div className="module-InstallScreenAccountSwitcher">
      <span className="module-InstallScreenAccountSwitcher__label">
        {i18n('icu:Install__other-accounts')}
      </span>
      <div className="module-InstallScreenAccountSwitcher__actions">
        {otherAccountProfiles.map(profile => (
          <AxoButton.Root
            key={profile.id}
            variant="secondary"
            size="sm"
            disabled={pendingAccountProfileId != null}
            pending={pendingAccountProfileId === profile.id}
            aria-label={i18n('icu:Install__switch-account', {
              accountName: profile.name,
            })}
            onClick={() => drop(onSwitchAccount(profile.id))}
          >
            {profile.name}
          </AxoButton.Root>
        ))}
      </div>
      {accountSwitchError ? (
        <span className="module-InstallScreenAccountSwitcher__error">
          {i18n('icu:Install__switch-account-error')}
        </span>
      ) : null}
    </div>
  );
}
