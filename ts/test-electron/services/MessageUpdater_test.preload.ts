// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import * as sinon from 'sinon';
import { v7 } from 'uuid';

import { markViewOnceMessageViewed } from '../../services/MessageUpdater.preload.ts';
import { MessageModel } from '../../models/messages.preload.ts';
import { ReadStatus } from '../../messages/MessageReadStatus.std.ts';
import { IMAGE_JPEG } from '../../types/MIME.std.ts';
import { DataWriter } from '../../sql/Client.preload.ts';
import { itemStorage } from '../../textsecure/Storage.preload.ts';
import { generateAci } from '../../test-helpers/serviceIdUtils.std.ts';
import { setBatchingStrategy } from '../../util/messageBatcher.preload.ts';
import {
  conversationJobQueue,
  conversationQueueJobEnum,
} from '../../jobs/conversationJobQueue.preload.ts';
import { viewOnceOpenJobQueue } from '../../jobs/viewOnceOpenJobQueue.preload.ts';

describe('MessageUpdater view-once retention', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    await DataWriter.removeAll();
    await itemStorage.user.setAciAndDeviceId(generateAci(), 1);
    await window.ConversationController.load();
    setBatchingStrategy(false);
  });

  afterEach(async () => {
    sandbox.restore();
    setBatchingStrategy(true);
    await DataWriter.removeAll();
  });

  it('keeps received media after first and repeated open processing', async () => {
    const now = Date.now();
    const attachment = {
      contentType: IMAGE_JPEG,
      path: 'retained-view-once.jpg',
      size: 128,
    };
    const message = window.MessageCache.register(
      new MessageModel({
        id: v7(),
        type: 'incoming',
        conversationId: 'view-once-conversation',
        sent_at: now,
        received_at: now,
        received_at_ms: now,
        timestamp: now,
        isViewOnce: true,
        attachments: [attachment],
        readStatus: ReadStatus.Unread,
      })
    );
    await window.MessageCache.saveMessage(message.attributes, {
      forceSave: true,
    });

    await markViewOnceMessageViewed(message, { fromSync: true });
    await markViewOnceMessageViewed(message, { fromSync: true });

    assert.strictEqual(message.get('readStatus'), ReadStatus.Viewed);
    assert.isNotTrue(message.get('isErased'));
    assert.deepEqual(message.get('attachments'), [attachment]);
  });

  it('queues first-open events only once across repeated local opens', async () => {
    const now = Date.now();
    const sourceAci = generateAci();
    const conversation = await window.ConversationController.getOrCreateAndWait(
      sourceAci,
      'private'
    );
    const message = window.MessageCache.register(
      new MessageModel({
        id: v7(),
        type: 'incoming',
        conversationId: conversation.id,
        sourceServiceId: sourceAci,
        sent_at: now,
        received_at: now,
        received_at_ms: now,
        timestamp: now,
        isViewOnce: true,
        attachments: [
          {
            contentType: IMAGE_JPEG,
            path: 'retained-view-once.jpg',
            size: 128,
          },
        ],
        readStatus: ReadStatus.Unread,
      })
    );
    await window.MessageCache.saveMessage(message.attributes, {
      forceSave: true,
    });

    sandbox
      .stub(window.ConversationController, 'doWeHaveOtherDevices')
      .returns(true);
    const receiptAdd = sandbox.stub(conversationJobQueue, 'add').resolves();
    const syncAdd = sandbox.stub(viewOnceOpenJobQueue, 'add').resolves();

    await markViewOnceMessageViewed(message);
    await markViewOnceMessageViewed(message);

    sinon.assert.calledOnceWithExactly(
      receiptAdd,
      sinon.match({ type: conversationQueueJobEnum.enum.Receipts })
    );
    sinon.assert.calledOnce(syncAdd);
  });
});
