// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as Bytes from '../Bytes.std.ts';
import { deriveGroupFields, parseGroupLink } from '../groups.preload.ts';
import {
  GroupInviteLinkRequiresApprovalError,
  joinViaLink,
} from '../groups/joinViaLink.preload.ts';
import { createLogger } from '../logging/log.std.ts';
import type { ConversationModel } from '../models/conversations.preload.ts';
import { itemStorage } from '../textsecure/Storage.preload.ts';
import type {
  GroupJoinLeaveTestOptions,
  GroupJoinLeaveTestPhase,
  GroupJoinLeaveTestSnapshot,
} from '../types/GroupJoinLeaveTest.std.ts';
import type { AciString } from '../types/ServiceId.std.ts';
import { toLogFormat } from '../types/errors.std.ts';
import { HTTPError } from '../types/HTTPError.std.ts';
import { SECOND } from '../util/durations/index.std.ts';
import { groupInvitesRoute } from '../util/signalRoutes.std.ts';
import { sleep } from '../util/sleep.std.ts';

const log = createLogger('GroupJoinLeaveTest');

const MIN_INTERVAL = 100;
const RETRY_INTERVAL = 10 * SECOND;
const MEMBERSHIP_TIMEOUT = 30 * SECOND;
const MEMBERSHIP_POLL_INTERVAL = 250;

type MutableSnapshot = {
  running: boolean;
  phase: GroupJoinLeaveTestPhase;
  groupId?: string;
  groupTitle?: string;
  intervalMs?: number;
  completedJoins: number;
  completedLeaves: number;
  failedOperations: number;
  lastError?: string;
  startedAt?: number;
};

export function normalizeGroupInviteCode(value: string): string {
  const trimmedValue = value.trim();
  const route = groupInvitesRoute.fromUrl(trimmedValue);
  return route?.args.inviteCode ?? trimmedValue;
}

export type GroupJoinLeaveTestDependencies = Readonly<{
  resolveGroupId: (inviteLink: string) => string;
  getAccountAci: () => AciString;
  getConversation: (groupId: string) => ConversationModel | undefined;
  join: (inviteLink: string) => Promise<void>;
  now: () => number;
  sleep: (duration: number) => Promise<void>;
}>;

function getDefaultDependencies(): GroupJoinLeaveTestDependencies {
  return {
    resolveGroupId: inviteLink => {
      const { masterKey } = parseGroupLink(inviteLink);
      const fields = deriveGroupFields(Bytes.fromBase64(masterKey));
      return Bytes.toBase64(fields.id);
    },
    getAccountAci: () => itemStorage.user.getCheckedAci(),
    getConversation: groupId =>
      window.ConversationController.get(groupId) ??
      window.ConversationController.getByDerivedGroupV2Id(groupId),
    join: inviteLink =>
      joinViaLink(inviteLink, {
        headless: true,
        requireNoApproval: true,
      }),
    now: () => Date.now(),
    sleep,
  };
}

function getInitialSnapshot(): MutableSnapshot {
  return {
    running: false,
    phase: 'idle',
    completedJoins: 0,
    completedLeaves: 0,
    failedOperations: 0,
  };
}

export class GroupJoinLeaveTestController {
  readonly #dependencies: GroupJoinLeaveTestDependencies;

  #snapshot = getInitialSnapshot();

  #stopRequested = false;

  constructor(dependencies = getDefaultDependencies()) {
    this.#dependencies = dependencies;
  }

  getSnapshot(): GroupJoinLeaveTestSnapshot {
    return { ...this.#snapshot };
  }

  start(options: GroupJoinLeaveTestOptions): GroupJoinLeaveTestSnapshot {
    if (this.#snapshot.running) {
      throw new Error('Group join/leave test is already running');
    }

    const inviteCode = normalizeGroupInviteCode(options.inviteLink);
    const groupId = this.#dependencies.resolveGroupId(inviteCode);
    if (!Number.isFinite(options.intervalMs)) {
      throw new Error('Group join/leave interval must be a finite number');
    }
    const intervalMs = Math.max(MIN_INTERVAL, options.intervalMs);
    const accountAci = this.#dependencies.getAccountAci();

    this.#stopRequested = false;
    this.#snapshot = {
      running: true,
      phase: 'joining',
      groupId,
      intervalMs,
      completedJoins: 0,
      completedLeaves: 0,
      failedOperations: 0,
      startedAt: this.#dependencies.now(),
    };

    void this.#run({ accountAci, groupId, intervalMs, inviteLink: inviteCode });
    return this.getSnapshot();
  }

  stop(): GroupJoinLeaveTestSnapshot {
    if (!this.#snapshot.running) {
      return this.getSnapshot();
    }

    this.#stopRequested = true;
    this.#snapshot.phase = 'stopping';
    return this.getSnapshot();
  }

  async #run({
    accountAci,
    groupId,
    intervalMs,
    inviteLink,
  }: {
    accountAci: AciString;
    groupId: string;
    intervalMs: number;
    inviteLink: string;
  }): Promise<void> {
    log.warn(`Starting group join/leave test for groupv2(${groupId})`);

    try {
      while (!this.#stopRequested) {
        if (this.#dependencies.getAccountAci() !== accountAci) {
          throw new Error('Active account changed while the test was running');
        }

        const conversation = this.#dependencies.getConversation(groupId);
        if (conversation && this.#isMemberOrPending(conversation, accountAci)) {
          // The loop intentionally performs one group mutation at a time.
          // oxlint-disable-next-line no-await-in-loop
          await this.#leave(conversation, groupId, accountAci);
          if (this.#stopRequested) {
            break;
          }
          this.#snapshot.phase = 'waiting-to-join';
        } else {
          // The loop intentionally performs one group mutation at a time.
          // oxlint-disable-next-line no-await-in-loop
          await this.#join(inviteLink, groupId, accountAci);
          if (this.#stopRequested) {
            break;
          }
          this.#snapshot.phase = 'waiting-to-leave';
        }

        this.#snapshot.lastError = undefined;
        // Each transition must settle before the next one begins.
        // oxlint-disable-next-line no-await-in-loop
        await this.#delay(intervalMs);
      }
    } catch (error) {
      if (!this.#stopRequested) {
        this.#snapshot.failedOperations += 1;
        this.#snapshot.lastError = toLogFormat(error);
        log.error(
          `Group join/leave test failed for groupv2(${groupId})`,
          toLogFormat(error)
        );

        if (
          error instanceof GroupInviteLinkRequiresApprovalError ||
          (error instanceof HTTPError &&
            (error.code === 403 || error.code === 423))
        ) {
          this.#snapshot.running = false;
          this.#snapshot.phase = 'failed';
          return;
        }

        this.#snapshot.phase = 'retrying';
        await this.#delay(Math.max(intervalMs, RETRY_INTERVAL));
        if (!this.#stopRequested) {
          void this.#run({ accountAci, groupId, intervalMs, inviteLink });
          return;
        }
      }
    }

    this.#snapshot.running = false;
    this.#snapshot.phase = 'idle';
    log.warn(`Stopped group join/leave test for groupv2(${groupId})`);
  }

  async #join(
    inviteLink: string,
    groupId: string,
    accountAci: AciString
  ): Promise<void> {
    this.#snapshot.phase = 'joining';
    await this.#dependencies.join(inviteLink);
    const joined = await this.#waitForMembership(groupId, accountAci, true);
    if (!joined) {
      return;
    }

    const conversation = this.#dependencies.getConversation(groupId);
    this.#snapshot.groupTitle = conversation?.getTitle();
    this.#snapshot.completedJoins += 1;
  }

  async #leave(
    conversation: ConversationModel,
    groupId: string,
    accountAci: AciString
  ): Promise<void> {
    this.#snapshot.phase = 'leaving';
    if (conversation.isMemberAwaitingApproval(accountAci)) {
      await conversation.cancelJoinRequest();
    } else {
      await conversation.leaveGroupV2();
    }
    const left = await this.#waitForMembership(groupId, accountAci, false);
    if (!left) {
      return;
    }
    this.#snapshot.groupTitle = conversation.getTitle();
    this.#snapshot.completedLeaves += 1;
  }

  async #waitForMembership(
    groupId: string,
    accountAci: AciString,
    expected: boolean
  ): Promise<boolean> {
    const startedAt = this.#dependencies.now();
    for (;;) {
      const conversation = this.#dependencies.getConversation(groupId);
      const isMember = Boolean(
        conversation && this.#isMemberOrPending(conversation, accountAci)
      );
      if (isMember === expected) {
        return true;
      }
      if (this.#stopRequested) {
        return false;
      }
      if (this.#dependencies.now() - startedAt >= MEMBERSHIP_TIMEOUT) {
        throw new Error(
          `Timed out waiting for group membership to become ${String(expected)}`
        );
      }
      // Polling is deliberately sequential and bounded by MEMBERSHIP_TIMEOUT.
      // oxlint-disable-next-line no-await-in-loop
      await this.#delay(MEMBERSHIP_POLL_INTERVAL);
    }
  }

  #isMemberOrPending(
    conversation: ConversationModel,
    accountAci: AciString
  ): boolean {
    return (
      conversation.hasMember(accountAci) ||
      conversation.isMemberPending(accountAci) ||
      conversation.isMemberAwaitingApproval(accountAci)
    );
  }

  async #delay(duration: number): Promise<void> {
    const deadline = this.#dependencies.now() + duration;
    while (!this.#stopRequested && this.#dependencies.now() < deadline) {
      const remaining = deadline - this.#dependencies.now();
      // Short sleeps make Stop responsive without resolving one promise twice.
      // oxlint-disable-next-line no-await-in-loop
      await this.#dependencies.sleep(
        Math.min(MEMBERSHIP_POLL_INTERVAL, remaining)
      );
    }
  }
}

export const groupJoinLeaveTest = new GroupJoinLeaveTestController();
