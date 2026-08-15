// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReadonlyDeep } from 'type-fest';

export type ConversationJobQueueTypeCount = ReadonlyDeep<{
  type: string;
  count: number;
}>;

export type ConversationJobQueueDebugRow = ReadonlyDeep<{
  conversationId: string;
  title: string;
  persistedCount: number;
  inMemoryPendingCount: number;
  runningCount: number;
  oldestTimestamp: number | undefined;
  jobsByType: ReadonlyArray<ConversationJobQueueTypeCount>;
}>;

export type ConversationJobQueueDebugSnapshot = ReadonlyDeep<{
  capturedAt: number;
  concurrency: number;
  persistedCount: number;
  inMemoryPendingCount: number;
  runningCount: number;
  conversations: ReadonlyArray<ConversationJobQueueDebugRow>;
}>;
