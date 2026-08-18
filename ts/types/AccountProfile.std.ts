// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { AvatarColorType } from './Colors.std.ts';

export type AccountProfileBadgePresentation = Readonly<{
  name: string;
  lightImageDataUrl: string;
  darkImageDataUrl: string;
}>;

export type AccountProfilePresentation = Readonly<{
  title?: string;
  profileName?: string;
  phoneNumber?: string;
  color?: AvatarColorType;
  avatarDataUrl?: string;
  badge?: AccountProfileBadgePresentation;
}>;

export type AccountProfile = Readonly<{
  id: string;
  name: string;
  createdAt: number;
  isDefault: boolean;
  isActive: boolean;
  presentation?: AccountProfilePresentation;
}>;

export type AccountProfilesSnapshot = Readonly<{
  profiles: ReadonlyArray<AccountProfile>;
  activeProfileId: string;
}>;
