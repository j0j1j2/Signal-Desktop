// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import type { MessageAttributesType } from '../../model-types.d.ts';
import { DurationInSeconds } from '../../util/durations/index.std.ts';
import {
  conversationExportJsonReplacer,
  getConversationExportFilename,
  getConversationExportMessage,
  stringifyConversationExportValue,
} from '../../util/exportConversation.std.ts';

function message(
  overrides: Partial<MessageAttributesType> = {}
): MessageAttributesType {
  return {
    conversationId: 'conversation-id',
    id: 'message-id',
    received_at: 1,
    sent_at: 2,
    timestamp: 2,
    type: 'incoming',
    ...overrides,
  };
}

describe('exportConversation', () => {
  it('creates a safe JSON filename', () => {
    const result = getConversationExportFilename(' Alice/Bob:*? ');

    assert.match(result, /^Alice_Bob___ - \d{4}-\d{2}-\d{2}\.json$/);
    assert.notMatch(result, /[/:*?]/);
  });

  it('includes message content but excludes account and device metadata', () => {
    const privateAci = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const result = getConversationExportMessage(
      message({
        body: 'hello',
        expireTimer: DurationInSeconds.fromSeconds(60),
        isViewOnce: true,
        source: '+821012345678',
        sourceServiceId: privateAci as MessageAttributesType['sourceServiceId'],
        sourceDevice: 2,
        serverGuid: 'private-server-guid',
        attachments: [
          {
            contentType: 'image/jpeg',
            size: 123,
            fileName: 'photo.jpg',
            path: '/Users/exporter/private/photo.jpg',
            localKey: 'private-local-key',
            digest: 'private-digest',
            cdnKey: 'private-cdn-key',
          },
        ] as MessageAttributesType['attachments'],
        quote: {
          id: 42,
          author: '+821099999999',
          authorAci: privateAci as never,
          isViewOnce: false,
          referencedMessageNotFound: false,
          text: 'quoted text',
          attachments: [],
        },
        reactions: [
          {
            emoji: '👍' as never,
            fromId: 'private-conversation-id',
            targetTimestamp: 2,
            timestamp: 3,
          },
        ],
        dataMessage: new Uint8Array([1, 2, 3]),
        logger: { ignored: true },
      }),
      {
        direction: 'incoming',
        name: 'Alice',
      }
    );

    assert.equal(result.direction, 'incoming');
    assert.equal(result.senderName, 'Alice');
    const attributes = result.attributes as Record<string, unknown>;
    assert.equal(attributes.body, 'hello');
    assert.equal(attributes.expireTimer, 60);
    assert.equal(attributes.isViewOnce, true);
    assert.deepEqual(attributes.attachments, [
      {
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        size: 123,
      },
    ]);

    const json = stringifyConversationExportValue(result);
    for (const privateValue of [
      'source',
      '+821012345678',
      '+821099999999',
      privateAci,
      'private-server-guid',
      'private-conversation-id',
      '/Users/exporter/private/photo.jpg',
      'private-local-key',
      'private-digest',
      'private-cdn-key',
      'conversation-id',
      'message-id',
    ]) {
      assert.notInclude(json, privateValue);
    }
  });

  it('encodes bigint and bytes as tagged JSON values', () => {
    const result = JSON.parse(
      JSON.stringify(
        {
          sequence: 42n,
          bytes: new Uint8Array([1, 2, 255]),
        },
        conversationExportJsonReplacer
      )
    );

    assert.deepEqual(result, {
      sequence: { type: 'bigint', value: '42' },
      bytes: { type: 'bytes', encoding: 'base64', value: 'AQL/' },
    });
  });
});
