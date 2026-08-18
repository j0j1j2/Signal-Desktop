// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, type JSX } from 'react';
import { useSelector } from 'react-redux';

import { BadgeImageTheme } from '../../badges/BadgeImageTheme.std.ts';
import { getBadgeImageFileLocalPath } from '../../badges/getBadgeImageFileLocalPath.std.ts';
import { createLogger } from '../../logging/log.std.ts';
import type { AccountProfilePresentation } from '../../types/AccountProfile.std.ts';
import { drop } from '../../util/drop.std.ts';
import { getPreferredBadgeSelector } from '../selectors/badges.preload.ts';
import { getMe } from '../selectors/conversations.dom.ts';

const log = createLogger('AccountProfilePresentationSync');

async function resolveImage(
  source: string | undefined
): Promise<string | undefined> {
  if (!source) {
    return undefined;
  }
  return window.SignalContext.accountProfiles.resolveImage(source);
}

export function AccountProfilePresentationSync(): JSX.Element | null {
  const me = useSelector(getMe);
  const getPreferredBadge = useSelector(getPreferredBadgeSelector);
  const badge = getPreferredBadge(me.badges);

  useEffect(() => {
    if (!me.isMe || !me.title) {
      return;
    }

    async function syncPresentation(): Promise<void> {
      try {
        const lightBadgePath = getBadgeImageFileLocalPath(
          badge,
          24,
          BadgeImageTheme.Light
        );
        const darkBadgePath = getBadgeImageFileLocalPath(
          badge,
          24,
          BadgeImageTheme.Dark
        );
        const [avatarDataUrl, lightBadgeDataUrl, darkBadgeDataUrl] =
          await Promise.all([
            resolveImage(me.avatarUrl),
            resolveImage(lightBadgePath ?? darkBadgePath),
            resolveImage(darkBadgePath ?? lightBadgePath),
          ]);

        const presentation: AccountProfilePresentation = {
          avatarDataUrl,
          color: me.color,
          phoneNumber: me.phoneNumber,
          profileName: me.profileName,
          title: me.title,
          badge:
            badge && lightBadgeDataUrl && darkBadgeDataUrl
              ? {
                  name: badge.name,
                  lightImageDataUrl: lightBadgeDataUrl,
                  darkImageDataUrl: darkBadgeDataUrl,
                }
              : undefined,
        };
        await window.SignalContext.accountProfiles.updatePresentation(
          presentation
        );
      } catch (error) {
        log.warn('Unable to update the active account presentation', error);
      }
    }

    drop(syncPresentation());
  }, [badge, me]);

  return null;
}
