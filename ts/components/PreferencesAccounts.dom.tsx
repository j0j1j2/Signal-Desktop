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
import { AxoConfirmDialog } from '../axo/AxoConfirmDialog.dom.tsx';
import { BadgeCategory } from '../badges/BadgeCategory.std.ts';
import { BadgeImageTheme } from '../badges/BadgeImageTheme.std.ts';
import type { BadgeType } from '../badges/types.std.ts';
import type { ConversationType } from '../state/ducks/conversations.preload.ts';
import type {
  AccountProfileBadgePresentation,
  AccountProfilesSnapshot,
} from '../types/AccountProfile.std.ts';
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

/** @testexport */
export function _getStoredBadge(
  badge: AccountProfileBadgePresentation | undefined
): BadgeType | undefined {
  if (!badge) {
    return undefined;
  }
  const image = {
    [BadgeImageTheme.Light]: {
      localPath: badge.lightImageDataUrl,
      url: badge.lightImageDataUrl,
    },
    [BadgeImageTheme.Dark]: {
      localPath: badge.darkImageDataUrl,
      url: badge.darkImageDataUrl,
    },
  };
  return {
    category: BadgeCategory.Other,
    descriptionTemplate: '',
    id: 'stored-account-profile-badge',
    images: [image, image, image],
    name: badge.name,
  };
}

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
  const [pendingProfileId, setPendingProfileId] = useState<string>();
  const [editingProfileId, setEditingProfileId] = useState<string>();
  const [aliasDraft, setAliasDraft] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string>();
  const [isDeleting, setIsDeleting] = useState(false);
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
      await window.SignalContext.accountProfiles.create(
        i18n('icu:Preferences__Accounts__NewAccountDefaultName')
      );
      await refresh();
    } catch (createError) {
      setError(toLogFormat(createError));
    } finally {
      setIsCreating(false);
    }
  }, [i18n, refresh]);

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

  const deleteTarget = snapshot?.profiles.find(
    profile => profile.id === deleteTargetId
  );

  const deleteProfile = useCallback(async () => {
    if (!deleteTargetId) {
      return;
    }
    setError(undefined);
    setIsDeleting(true);
    try {
      const updatedSnapshot =
        await window.SignalContext.accountProfiles.remove(deleteTargetId);
      setSnapshot(updatedSnapshot);
      setDeleteTargetId(undefined);
    } catch (deleteError) {
      setError(toLogFormat(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTargetId]);

  const isBusy =
    isCreating || isRenaming || isDeleting || pendingProfileId != null;

  return (
    <>
      {deleteTarget ? (
        <AxoConfirmDialog.Root
          open
          onOpenChange={open => {
            if (!open && !isDeleting) {
              setDeleteTargetId(undefined);
            }
          }}
          title={i18n('icu:Preferences__Accounts__DeleteTitle', {
            accountName: deleteTarget.name,
          })}
          description={i18n('icu:Preferences__Accounts__DeleteDescription')}
        >
          <AxoConfirmDialog.Cancel disabled={isDeleting} />
          <AxoConfirmDialog.Action
            variant="destructive"
            disabled={isDeleting}
            pending={isDeleting}
            onClick={() => drop(deleteProfile())}
          >
            {i18n('icu:Preferences__Accounts__DeleteConfirm')}
          </AxoConfirmDialog.Action>
        </AxoConfirmDialog.Root>
      ) : null}
      <SettingsRow title={i18n('icu:Preferences__Accounts__Profiles')}>
        <p className="Preferences__padding">
          {i18n('icu:Preferences__Accounts__Description')}
        </p>
        <ul className="PreferencesAccounts__list">
          {snapshot?.profiles.map((profile, index) => {
            const storedPresentation = profile.presentation;
            const avatarUrl = profile.isActive
              ? activeAccountIdentity.avatarUrl
              : storedPresentation?.avatarDataUrl;
            const profileBadge = profile.isActive
              ? badge
              : _getStoredBadge(storedPresentation?.badge);
            const color = profile.isActive
              ? activeAccountIdentity.color
              : storedPresentation?.color;
            const phoneNumber = profile.isActive
              ? activeAccountIdentity.phoneNumber
              : storedPresentation?.phoneNumber;
            const profileName = profile.isActive
              ? activeAccountIdentity.profileName
              : storedPresentation?.profileName;
            const title =
              (profile.isActive
                ? activeAccountIdentity.title
                : storedPresentation?.title) ||
              profileName ||
              profile.name;

            return (
              <li
                className="PreferencesAccounts__item"
                data-profile-id={profile.id}
                key={profile.id}
              >
                <div className="PreferencesAccounts__avatar">
                  <Avatar
                    avatarPlaceholderGradient={[
                      `hsl(${(index * 67 + 215) % 360} 55% 58%)`,
                      `hsl(${(index * 67 + 245) % 360} 60% 44%)`,
                    ]}
                    avatarUrl={avatarUrl}
                    badge={profileBadge}
                    color={color}
                    conversationType="direct"
                    i18n={i18n}
                    phoneNumber={phoneNumber}
                    profileName={profileName}
                    size={AvatarSize.FORTY_EIGHT}
                    theme={theme}
                    title={title}
                  />
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
                    {title !== profile.name ? (
                      <span className="PreferencesAccounts__profile-title">
                        {title}
                      </span>
                    ) : null}
                    {phoneNumber ? <span>{phoneNumber}</span> : null}
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
                      {!profile.isDefault && !profile.isActive ? (
                        <AxoButton.Root
                          variant="borderless-destructive"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => setDeleteTargetId(profile.id)}
                        >
                          {i18n('icu:Preferences__Accounts__Delete')}
                        </AxoButton.Root>
                      ) : null}
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
            );
          })}
        </ul>
        <div className="PreferencesAccounts__add-account">
          <AxoButton.Root
            variant="secondary"
            size="md"
            disabled={isBusy}
            pending={isCreating}
            onClick={createProfile}
          >
            {i18n('icu:Preferences__Accounts__AddAccount')}
          </AxoButton.Root>
        </div>
        {error && <p className="Preferences--accounts--error">{error}</p>}
      </SettingsRow>
    </>
  );
}
