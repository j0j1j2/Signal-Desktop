// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import { VIDEO_MP4 } from '../../../types/MIME.std.ts';
import {
  actions as conversationActions,
  MESSAGE_DELETED,
} from '../../../state/ducks/conversations.preload.ts';
import {
  reducer,
  type LightboxStateType,
} from '../../../state/ducks/lightbox.preload.ts';

const MESSAGE_ID = 'message-id';
const CONVERSATION_ID = 'conversation-id';

function getOpenVideoState(): LightboxStateType {
  return {
    isShowingLightbox: true,
    isViewOnce: false,
    media: [
      {
        type: 'media',
        index: 0,
        attachment: {
          contentType: VIDEO_MP4,
          isPermanentlyUndownloadable: false,
          size: 1,
          url: 'attachment://video',
        },
        message: {
          id: MESSAGE_ID,
          type: 'incoming',
          conversationId: CONVERSATION_ID,
          receivedAt: 1,
          receivedAtMs: 1,
          sentAt: 1,
          source: undefined,
          sourceServiceId: undefined,
          isErased: false,
          sendStateByConversationId: undefined,
          readStatus: undefined,
          errors: undefined,
        },
      },
    ],
    hasPrevMessage: false,
    hasNextMessage: false,
    selectedIndex: 0,
    playbackDisabled: false,
  };
}

describe('lightbox reducer', () => {
  it('keeps open media visible when its message is deleted for everyone', () => {
    const state = getOpenVideoState();
    const updated = reducer(
      state,
      conversationActions.messageChanged(MESSAGE_ID, CONVERSATION_ID, {
        id: MESSAGE_ID,
        type: 'incoming',
        sent_at: 1,
        received_at: 1,
        timestamp: 1,
        conversationId: CONVERSATION_ID,
        deletedForEveryone: true,
      })
    );

    assert.strictEqual(updated, state);
  });

  it('still closes open media when its message is locally deleted', () => {
    const state = getOpenVideoState();
    const updated = reducer(state, {
      type: MESSAGE_DELETED,
      payload: { id: MESSAGE_ID, conversationId: CONVERSATION_ID },
    });

    assert.deepEqual(updated, { isShowingLightbox: false });
  });
});
