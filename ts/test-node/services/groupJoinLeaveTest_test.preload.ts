// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import type { ConversationModel } from '../../models/conversations.preload.ts';
import {
  GroupJoinLeaveTestController,
  type GroupJoinLeaveTestDependencies,
} from '../../services/groupJoinLeaveTest.preload.ts';
import { generateAci } from '../../test-helpers/serviceIdUtils.std.ts';

async function waitForStopped(
  controller: GroupJoinLeaveTestController
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!controller.getSnapshot().running) {
      return;
    }
    // Let the controller's asynchronous transition continue.
    // oxlint-disable-next-line no-await-in-loop
    await new Promise<void>(resolve => {
      setTimeout(resolve, 0);
    });
  }
  assert.fail('Group join/leave controller did not stop');
}

describe('GroupJoinLeaveTestController', () => {
  it('alternates join and leave until stopped', async () => {
    const actions = new Array<'join' | 'leave'>();
    const accountAci = generateAci();
    let isMember = false;
    let now = 0;
    let resolvedInviteCode: string | undefined;
    let joinedInviteCode: string | undefined;

    const conversation = {
      hasMember: () => isMember,
      isMemberPending: () => false,
      isMemberAwaitingApproval: () => false,
      getTitle: () => 'Loop Test Group',
      leaveGroupV2: async () => {
        actions.push('leave');
        isMember = false;
        if (actions.length === 4) {
          controller.stop();
        }
      },
      cancelJoinRequest: async () => {
        throw new Error('Unexpected pending approval state');
      },
    } as unknown as ConversationModel;

    const dependencies: GroupJoinLeaveTestDependencies = {
      resolveGroupId: inviteCode => {
        resolvedInviteCode = inviteCode;
        return 'test-group-id';
      },
      getAccountAci: () => accountAci,
      getConversation: () => conversation,
      join: async inviteCode => {
        joinedInviteCode = inviteCode;
        actions.push('join');
        isMember = true;
      },
      now: () => now,
      sleep: async duration => {
        now += duration;
      },
    };
    const controller = new GroupJoinLeaveTestController(dependencies);

    controller.start({
      inviteLink: 'https://signal.group/#test',
      intervalMs: 100,
    });
    await waitForStopped(controller);

    assert.deepEqual(actions, ['join', 'leave', 'join', 'leave']);
    assert.strictEqual(resolvedInviteCode, 'test');
    assert.strictEqual(joinedInviteCode, 'test');
    assert.deepInclude(controller.getSnapshot(), {
      running: false,
      phase: 'idle',
      groupTitle: 'Loop Test Group',
      completedJoins: 2,
      completedLeaves: 2,
      failedOperations: 0,
    });
  });

  it('leaves first when the account is already a member', async () => {
    const actions = new Array<'join' | 'leave'>();
    const accountAci = generateAci();
    let isMember = true;
    let now = 0;

    const conversation = {
      hasMember: () => isMember,
      isMemberPending: () => false,
      isMemberAwaitingApproval: () => false,
      getTitle: () => 'Existing Group',
      leaveGroupV2: async () => {
        actions.push('leave');
        isMember = false;
        controller.stop();
      },
      cancelJoinRequest: async () => undefined,
    } as unknown as ConversationModel;

    const controller = new GroupJoinLeaveTestController({
      resolveGroupId: () => 'existing-group-id',
      getAccountAci: () => accountAci,
      getConversation: () => conversation,
      join: async () => {
        actions.push('join');
        isMember = true;
      },
      now: () => now,
      sleep: async duration => {
        now += duration;
      },
    });

    controller.start({
      inviteLink: 'https://signal.group/#test',
      intervalMs: 100,
    });
    await waitForStopped(controller);

    assert.deepEqual(actions, ['leave']);
    assert.strictEqual(controller.getSnapshot().completedLeaves, 1);
  });
});
