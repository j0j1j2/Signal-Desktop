// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import {
  useCallback,
  useEffect,
  useState,
  type JSX,
  type KeyboardEvent,
} from 'react';

import { AxoButton } from '../axo/AxoButton.dom.tsx';
import type { BadgeType } from '../badges/types.std.ts';
import type { ConversationType } from '../state/ducks/conversations.preload.ts';
import type { AccountProfilesSnapshot } from '../types/AccountProfile.std.ts';
import type { LocalizerType } from '../types/I18N.std.ts';
import type { ThemeType } from '../types/Util.std.ts';
import { toLogFormat } from '../types/errors.std.ts';
import { drop } from '../util/drop.std.ts';
import { Avatar, AvatarSize } from './Avatar.dom.tsx';
import { SettingsRow } from './PreferencesUtil.dom.tsx';

type ActiveAccountIdentity = Pick<
  ConversationType,
  'avatarUrl' | 'color' | 'phoneNumber' | 'profileName' | 'title'
>;

export function PreferencesAccounts({
  activeAccountIdentity,
  badge,
  i18n,
  theme,
}: {
  activeAccountIdentity: ActiveAccountIdentity;
  badge: BadgeType | undefined;
  i18n: LocalizerType;
  theme: ThemeType;
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<AccountProfilesSnapshot>();
  const [newProfileName, setNewProfileName] = useState('');
  const [pendingProfileId, setPendingProfileId] = useState<string>();
  const [editingProfileId, setEditingProfileId] = useState<string>();
  const [aliasDraft, setAliasDraft] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setSnapshot(await window.SignalContext.accountProfiles.list());
  }, []);

  useEffect(() => {
    async function loadProfiles(): Promise<void> {
      try {
        await refresh();
      } catch (refreshError) {
        setError(toLogFormat(refreshError));
      }
    }
    drop(loadProfiles());
  }, [refresh]);

  const switchProfile = useCallback(async (profileId: string) => {
    setError(undefined);
    setPendingProfileId(profileId);
    try {
      await window.SignalContext.accountProfiles.switch(profileId);
    } catch (switchError) {
      setError(toLogFormat(switchError));
      setPendingProfileId(undefined);
    }
  }, []);

  const createProfile = useCallback(async () => {
    setError(undefined);
    setIsCreating(true);
    try {
      const profile =
        await window.SignalContext.accountProfiles.create(newProfileName);
      await switchProfile(profile.id);
    } catch (createError) {
      setError(toLogFormat(createError));
      setIsCreating(false);
    }
  }, [newProfileName, switchProfile]);

  const startRenaming = useCallback((profileId: string, name: string) => {
    setEditingProfileId(profileId);
    setAliasDraft(name);
    setError(undefined);
  }, []);

  const cancelRenaming = useCallback(() => {
    setEditingProfileId(undefined);
    setAliasDraft('');
  }, []);

  const saveAlias = useCallback(async () => {
    if (!editingProfileId || !aliasDraft.trim()) {
      return;
    }
    setError(undefined);
    setIsRenaming(true);
    try {
      const updatedSnapshot = await window.SignalContext.accountProfiles.rename(
        editingProfileId,
        aliasDraft
      );
      setSnapshot(updatedSnapshot);
      cancelRenaming();
    } catch (renameError) {
      setError(toLogFormat(renameError));
    } finally {
      setIsRenaming(false);
    }
  }, [aliasDraft, cancelRenaming, editingProfileId]);

  const onAliasKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        drop(saveAlias());
      } else if (event.key === 'Escape') {
        cancelRenaming();
      }
    },
    [cancelRenaming, saveAlias]
  );

  const isBusy = isCreating || isRenaming || pendingProfileId != null;

  return (
    <SettingsRow title={i18n('icu:Preferences__Accounts__Profiles')}>
      <p className="Preferences__padding">
        {i18n('icu:Preferences__Accounts__Description')}
      </p>
      <ul className="PreferencesAccounts__list">
        {snapshot?.profiles.map((profile, index) => (
          <li
            className="PreferencesAccounts__item"
            data-profile-id={profile.id}
            key={profile.id}
          >
            <div className="PreferencesAccounts__avatar">
              {profile.isActive ? (
                <Avatar
                  avatarUrl={activeAccountIdentity.avatarUrl}
                  badge={badge}
                  color={activeAccountIdentity.color}
                  conversationType="direct"
                  i18n={i18n}
                  phoneNumber={activeAccountIdentity.phoneNumber}
                  profileName={activeAccountIdentity.profileName}
                  size={AvatarSize.FORTY_EIGHT}
                  theme={theme}
                  title={activeAccountIdentity.title || profile.name}
                />
              ) : (
                <Avatar
                  avatarPlaceholderGradient={[
                    `hsl(${(index * 67 + 215) % 360} 55% 58%)`,
                    `hsl(${(index * 67 + 245) % 360} 60% 44%)`,
                  ]}
                  badge={undefined}
                  conversationType="direct"
                  i18n={i18n}
                  size={AvatarSize.FORTY_EIGHT}
                  title={profile.name}
                />
              )}
            </div>
            <div className="PreferencesAccounts__details">
              {editingProfileId === profile.id ? (
                <input
                  aria-label={i18n(
                    'icu:Preferences__Accounts__AliasInputLabel'
                  )}
                  autoFocus
                  className="PreferencesAccounts__alias-input"
                  disabled={isRenaming}
                  maxLength={64}
                  onChange={event => setAliasDraft(event.target.value)}
                  onKeyDown={onAliasKeyDown}
                  type="text"
                  value={aliasDraft}
                />
              ) : (
                <strong className="PreferencesAccounts__alias">
                  {profile.name}
                </strong>
              )}
              <div className="PreferencesAccounts__metadata">
                <span
                  className={
                    profile.isActive
                      ? 'PreferencesAccounts__status PreferencesAccounts__status--active'
                      : 'PreferencesAccounts__status'
                  }
                >
                  {i18n(
                    profile.isActive
                      ? 'icu:Preferences__Accounts__ActiveAccount'
                      : 'icu:Preferences__Accounts__InactiveAccount'
                  )}
                </span>
                {profile.isActive && activeAccountIdentity.phoneNumber ? (
                  <span>{activeAccountIdentity.phoneNumber}</span>
                ) : null}
              </div>
            </div>
            <div className="PreferencesAccounts__actions">
              {editingProfileId === profile.id ? (
                <>
                  <AxoButton.Root
                    variant="primary"
                    size="sm"
                    disabled={!aliasDraft.trim() || isRenaming}
                    pending={isRenaming}
                    onClick={saveAlias}
                  >
                    {i18n('icu:Preferences__Accounts__SaveAlias')}
                  </AxoButton.Root>
                  <AxoButton.Root
                    variant="borderless-secondary"
                    size="sm"
                    disabled={isRenaming}
                    onClick={cancelRenaming}
                  >
                    {i18n('icu:Preferences__Accounts__CancelAlias')}
                  </AxoButton.Root>
                </>
              ) : (
                <>
                  <AxoButton.Root
                    variant="borderless-primary"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => startRenaming(profile.id, profile.name)}
                  >
                    {i18n('icu:Preferences__Accounts__EditAlias')}
                  </AxoButton.Root>
                  {!profile.isActive ? (
                    <AxoButton.Root
                      variant="secondary"
                      size="sm"
                      disabled={isBusy}
                      pending={pendingProfileId === profile.id}
                      onClick={() => switchProfile(profile.id)}
                    >
                      {i18n('icu:Preferences__Accounts__Switch')}
                    </AxoButton.Root>
                  ) : null}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="PreferencesAccounts__add-account">
        <div className="PreferencesAccounts__new-account-input">
          <input
            aria-label={i18n('icu:Preferences__Accounts__NewAccountName')}
            type="text"
            maxLength={64}
            value={newProfileName}
            placeholder={i18n('icu:Preferences__Accounts__AccountName')}
            disabled={isBusy}
            onChange={event => setNewProfileName(event.target.value)}
          />
        </div>
        <AxoButton.Root
          variant="secondary"
          size="md"
          disabled={!newProfileName.trim() || isBusy}
          pending={isCreating}
          onClick={createProfile}
        >
          {i18n('icu:Preferences__Accounts__AddAccount')}
        </AxoButton.Root>
      </div>
      {error && <p className="Preferences--accounts--error">{error}</p>}
    </SettingsRow>
  );
}
