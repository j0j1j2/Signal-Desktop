// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import type { ReadonlyMessageAttributesType } from '../../model-types.d.ts';
import { canEditMessage } from '../../util/canEditMessage.dom.ts';

describe('canEditMessage', () => {
  it('allows an editable message with more than ten prior revisions', () => {
    const message = {
      body: 'latest revision',
      conversationId: 'conversation-id',
      editHistory: Array.from({ length: 25 }, () => ({})),
      sent_at: Date.now(),
      type: 'outgoing',
    } as unknown as ReadonlyMessageAttributesType;

    assert.isTrue(canEditMessage(message));
  });
});
