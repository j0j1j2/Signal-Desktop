// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type AccountProfile = Readonly<{
  id: string;
  name: string;
  createdAt: number;
  isDefault: boolean;
  isActive: boolean;
}>;

export type AccountProfilesSnapshot = Readonly<{
  profiles: ReadonlyArray<AccountProfile>;
  activeProfileId: string;
}>;
