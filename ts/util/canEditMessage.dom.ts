// Copyright 2023 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReadonlyMessageAttributesType } from '../model-types.d.ts';
import { DAY } from './durations/index.std.ts';
import { isMoreRecentThan } from './timestamp.std.ts';
import { isOutgoing, isPoll } from '../messages/helpers.std.ts';
import { isMessageNoteToSelf } from './isMessageNoteToSelf.dom.ts';

export function canEditMessage(
  message: ReadonlyMessageAttributesType
): boolean {
  return (
    !message.sms &&
    !message.deletedForEveryone &&
    isOutgoing(message) &&
    !isPoll(message) &&
    (isMoreRecentThan(message.sent_at, DAY) || isMessageNoteToSelf(message)) &&
    Boolean(message.body)
  );
}
