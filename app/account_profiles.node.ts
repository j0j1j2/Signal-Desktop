// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { sync as writeFileSync } from 'write-file-atomic';

import type {
  AccountProfile,
  AccountProfilesSnapshot,
} from '../ts/types/AccountProfile.std.ts';

const DEFAULT_PROFILE_ID = 'default';
const REGISTRY_VERSION = 1;
const MAX_PROFILE_NAME_LENGTH = 64;

type StoredProfile = Readonly<{
  id: string;
  name: string;
  createdAt: number;
}>;

type StoredRegistry = Readonly<{
  version: typeof REGISTRY_VERSION;
  activeProfileId: string;
  profiles: ReadonlyArray<StoredProfile>;
}>;

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error('Account profile name cannot be empty');
  }
  if (normalized.length > MAX_PROFILE_NAME_LENGTH) {
    throw new Error(
      `Account profile name cannot exceed ${MAX_PROFILE_NAME_LENGTH} characters`
    );
  }
  return normalized;
}

function isStoredProfile(value: unknown): value is StoredProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const profile = value as Partial<StoredProfile>;
  return (
    typeof profile.id === 'string' &&
    (profile.id === DEFAULT_PROFILE_ID || /^[0-9a-f-]{36}$/.test(profile.id)) &&
    typeof profile.name === 'string' &&
    profile.name.trim().length > 0 &&
    profile.name.length <= MAX_PROFILE_NAME_LENGTH &&
    typeof profile.createdAt === 'number' &&
    Number.isFinite(profile.createdAt)
  );
}

export class AccountProfileManager {
  readonly #defaultUserDataPath: string;
  readonly #profilesRootPath: string;
  readonly #registryPath: string;
  #registry: StoredRegistry;

  constructor(defaultUserDataPath: string) {
    this.#defaultUserDataPath = defaultUserDataPath;
    this.#profilesRootPath = join(
      dirname(defaultUserDataPath),
      `${basename(defaultUserDataPath)}-profiles`
    );
    this.#registryPath = join(defaultUserDataPath, 'account-profiles.json');
    mkdirSync(defaultUserDataPath, { recursive: true });
    this.#registry = this.#load();
    mkdirSync(this.getActiveDataPath(), { recursive: true });
  }

  getSnapshot(): AccountProfilesSnapshot {
    return {
      activeProfileId: this.#registry.activeProfileId,
      profiles: this.#registry.profiles.map(profile => ({
        ...profile,
        isDefault: profile.id === DEFAULT_PROFILE_ID,
        isActive: profile.id === this.#registry.activeProfileId,
      })),
    };
  }

  getActiveProfileId(): string {
    return this.#registry.activeProfileId;
  }

  getActiveDataPath(): string {
    return this.getDataPath(this.#registry.activeProfileId);
  }

  getDataPath(profileId: string): string {
    this.#getStoredProfile(profileId);
    if (profileId === DEFAULT_PROFILE_ID) {
      return this.#defaultUserDataPath;
    }
    return join(this.#profilesRootPath, profileId);
  }

  create(name: string): AccountProfile {
    const profile: StoredProfile = {
      id: randomUUID(),
      name: normalizeName(name),
      createdAt: Date.now(),
    };
    const nextRegistry: StoredRegistry = {
      ...this.#registry,
      profiles: [...this.#registry.profiles, profile],
    };
    mkdirSync(join(this.#profilesRootPath, profile.id), { recursive: true });
    this.#save(nextRegistry);
    this.#registry = nextRegistry;
    return { ...profile, isDefault: false, isActive: false };
  }

  rename(profileId: string, name: string): void {
    this.#getStoredProfile(profileId);
    const normalizedName = normalizeName(name);
    const nextRegistry: StoredRegistry = {
      ...this.#registry,
      profiles: this.#registry.profiles.map(profile =>
        profile.id === profileId
          ? { ...profile, name: normalizedName }
          : profile
      ),
    };
    this.#save(nextRegistry);
    this.#registry = nextRegistry;
  }

  setActive(profileId: string): void {
    this.#getStoredProfile(profileId);
    mkdirSync(this.getDataPath(profileId), { recursive: true });
    const nextRegistry: StoredRegistry = {
      ...this.#registry,
      activeProfileId: profileId,
    };
    this.#save(nextRegistry);
    this.#registry = nextRegistry;
  }

  #getStoredProfile(profileId: string): StoredProfile {
    const profile = this.#registry.profiles.find(item => item.id === profileId);
    if (!profile) {
      throw new Error(`Unknown account profile: ${profileId}`);
    }
    return profile;
  }

  #load(): StoredRegistry {
    const fallback: StoredRegistry = {
      version: REGISTRY_VERSION,
      activeProfileId: DEFAULT_PROFILE_ID,
      profiles: [
        {
          id: DEFAULT_PROFILE_ID,
          name: 'Primary',
          createdAt: Date.now(),
        },
      ],
    };

    if (!existsSync(this.#registryPath)) {
      return fallback;
    }

    try {
      const parsed: unknown = JSON.parse(
        readFileSync(this.#registryPath, 'utf8')
      );
      if (!parsed || typeof parsed !== 'object') {
        return fallback;
      }
      const registry = parsed as Partial<StoredRegistry>;
      if (
        registry.version !== REGISTRY_VERSION ||
        typeof registry.activeProfileId !== 'string' ||
        !Array.isArray(registry.profiles) ||
        !registry.profiles.every(isStoredProfile) ||
        !registry.profiles.some(profile => profile.id === DEFAULT_PROFILE_ID) ||
        !registry.profiles.some(
          profile => profile.id === registry.activeProfileId
        )
      ) {
        return fallback;
      }
      return registry as StoredRegistry;
    } catch {
      return fallback;
    }
  }

  #save(registry: StoredRegistry): void {
    writeFileSync(
      this.#registryPath,
      JSON.stringify(registry, null, 2),
      'utf8'
    );
  }
}
