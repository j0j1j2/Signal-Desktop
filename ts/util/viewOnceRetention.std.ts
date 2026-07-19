// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { EraseMessageReasonType } from '../types/Message.std.ts';

export type ViewOnceEraseReason = Extract<
  EraseMessageReasonType,
  'view-once-viewed' | 'view-once-sent' | 'view-once-expired'
>;

export function shouldEraseViewOnceMedia(
  _reason: ViewOnceEraseReason
): boolean {
  // Custom: this private client retains view-once media locally.
  return false;
}

export function shouldBlockViewOnceOpen({
  isError,
  isExpired,
  isViewed,
}: Readonly<{
  isError: boolean;
  isExpired: boolean;
  isViewed: boolean;
}>): boolean {
  return !isViewed && (isError || isExpired);
}

export function isViewOnceMediaLocallyAvailable(
  state: Readonly<{
    attachmentPath: string | undefined;
    isErased: boolean;
  }>
): boolean {
  // Retained attachment data is authoritative for this private client. Older
  // messages whose files were actually erased have no attachment path.
  return Boolean(state.attachmentPath);
}
