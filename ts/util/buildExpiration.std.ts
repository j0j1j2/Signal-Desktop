// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { LoggerType } from '../types/Logging.std.ts';
import { isNotUpdatable } from './version.std.ts';
import { DAY } from './durations/index.std.ts';

const SIXTY_DAYS = 60 * DAY;

export type GetBuildExpirationTimestampOptionsType = Readonly<{
  version: string;
  packagedBuildExpiration: number;
  remoteBuildExpiration: number | undefined;
  autoDownloadUpdate: boolean;
  logger: LoggerType;
}>;

export function getBuildExpirationTimestamp({
  version,
  packagedBuildExpiration,
  remoteBuildExpiration,
  autoDownloadUpdate,
  logger,
}: GetBuildExpirationTimestampOptionsType): number {
  const localBuildExpiration =
    isNotUpdatable(version) || autoDownloadUpdate
      ? packagedBuildExpiration
      : packagedBuildExpiration - SIXTY_DAYS;

  // Log the expiration date in this selector because it invalidates only
  // if one of the arguments changes.
  let result: number;
  let type: string;
  if (remoteBuildExpiration && remoteBuildExpiration < localBuildExpiration) {
    type = 'remote';
    result = remoteBuildExpiration;
  } else {
    type = 'local';
    result = localBuildExpiration;
  }
  logger.info(`Build expires (${type}): ${new Date(result).toISOString()}`);
  return result;
}

export type HasBuildExpiredOptionsType = Readonly<{
  buildExpirationTimestamp: number;
  autoDownloadUpdate: boolean;
  now: number;
  logger: LoggerType;
}>;

export function hasBuildExpired(
  _options: HasBuildExpiredOptionsType
): boolean {
  // Custom: never treat this build as expired. Disables the "This version of
  // Signal Desktop has expired" warning dialog and the expired-build send
  // block. This is a locally-built, non-updating fork, so the official ~90-day
  // build expiry is just noise.
  return false;
}
