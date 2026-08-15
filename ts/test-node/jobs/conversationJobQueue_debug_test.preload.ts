// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import * as sinon from 'sinon';

import { conversationJobQueue } from '../../jobs/conversationJobQueue.preload.ts';
import { jobQueueDatabaseStore } from '../../jobs/JobQueueDatabaseStore.preload.ts';
import type { StoredJob } from '../../jobs/types.std.ts';
import type { ConversationController } from '../../ConversationController.preload.ts';

const normalMessageJob: StoredJob = {
  id: 'debug-normal-message-job',
  timestamp: 100,
  queueType: 'conversation',
  data: {
    type: 'NormalMessage',
    conversationId: 'conversation-a',
    messageId: 'message-a',
  },
};

const deleteForEveryoneJob: StoredJob = {
  id: 'debug-delete-for-everyone-job',
  timestamp: 200,
  queueType: 'conversation',
  data: {
    type: 'DeleteForEveryone',
    conversationId: 'conversation-b',
    isAdminDelete: false,
    targetMessageId: 'message-b',
    recipients: [],
  },
};

describe('conversationJobQueue debugger', () => {
  const sandbox = sinon.createSandbox();
  let previousConversationController: ConversationController;

  beforeEach(() => {
    previousConversationController = window.ConversationController;
    window.ConversationController = {
      get: () => undefined,
    } as unknown as ConversationController;
  });

  afterEach(() => {
    conversationJobQueue.setDebugConcurrency(1);
    window.ConversationController = previousConversationController;
    sandbox.restore();
  });

  it('groups persisted jobs by conversation and type', async () => {
    sandbox
      .stub(jobQueueDatabaseStore, 'getJobs')
      .resolves([normalMessageJob, deleteForEveryoneJob]);

    const snapshot = await conversationJobQueue.getDebugSnapshot();

    assert.strictEqual(snapshot.concurrency, 1);
    assert.strictEqual(snapshot.persistedCount, 2);
    assert.strictEqual(snapshot.conversations.length, 2);
    assert.deepInclude(snapshot.conversations[0], {
      conversationId: 'conversation-a',
      title: 'conversation-a',
      persistedCount: 1,
      oldestTimestamp: 100,
    });
    assert.deepEqual(snapshot.conversations[0]?.jobsByType, [
      { type: 'NormalMessage', count: 1 },
    ]);
    assert.deepInclude(snapshot.conversations[1], {
      conversationId: 'conversation-b',
      title: 'conversation-b',
      persistedCount: 1,
      oldestTimestamp: 200,
    });
    assert.deepEqual(snapshot.conversations[1]?.jobsByType, [
      { type: 'DeleteForEveryone', count: 1 },
    ]);
  });

  it('cancels only jobs from the selected conversation', async () => {
    sandbox
      .stub(jobQueueDatabaseStore, 'getJobs')
      .resolves([normalMessageJob, deleteForEveryoneJob]);
    const deleteJob = sandbox.stub(jobQueueDatabaseStore, 'delete').resolves();

    const result =
      await conversationJobQueue.cancelPendingJobs('conversation-a');

    assert.deepEqual(result, {
      canceledJobCount: 1,
      normalMessageIds: ['message-a'],
    });
    sinon.assert.calledOnceWithExactly(deleteJob, normalMessageJob.id);
  });

  it('changes temporary concurrency and rejects unsafe values', async () => {
    sandbox.stub(jobQueueDatabaseStore, 'getJobs').resolves([]);

    conversationJobQueue.setDebugConcurrency(4);

    assert.strictEqual(
      (await conversationJobQueue.getDebugSnapshot()).concurrency,
      4
    );
    assert.throws(
      () => conversationJobQueue.setDebugConcurrency(0),
      'must be an integer from 1 to 10'
    );
    assert.throws(
      () => conversationJobQueue.setDebugConcurrency(11),
      'must be an integer from 1 to 10'
    );
  });
});
