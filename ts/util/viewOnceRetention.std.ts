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
