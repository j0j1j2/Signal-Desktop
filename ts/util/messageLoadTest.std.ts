// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export const MESSAGE_LOAD_TEST_DEFAULT_INTERVAL_MS = 10;
export const MESSAGE_LOAD_TEST_MIN_INTERVAL_MS = 10;
export const MESSAGE_LOAD_TEST_MAX_INTERVAL_MS = 5000;

export type MessageLoadTestOptions = Readonly<{
  intervalMs: number;
  messagePrefix: string;
}>;

export function isValidMessageLoadTestOptions(
  options: MessageLoadTestOptions
): boolean {
  const { intervalMs, messagePrefix } = options;

  return (
    Number.isSafeInteger(intervalMs) &&
    intervalMs >= MESSAGE_LOAD_TEST_MIN_INTERVAL_MS &&
    intervalMs <= MESSAGE_LOAD_TEST_MAX_INTERVAL_MS &&
    messagePrefix.trim().length > 0
  );
}

export function formatMessageLoadTestBody(messagePrefix: string): string {
  return messagePrefix.trim();
}
