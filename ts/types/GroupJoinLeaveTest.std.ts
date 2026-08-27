// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type GroupJoinLeaveTestPhase =
  | 'idle'
  | 'joining'
  | 'waiting-to-leave'
  | 'leaving'
  | 'waiting-to-join'
  | 'retrying'
  | 'stopping'
  | 'failed';

export type GroupJoinLeaveTestOptions = Readonly<{
  inviteLink: string;
  intervalMs: number;
}>;

export type GroupJoinLeaveTestSnapshot = Readonly<{
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
}>;
