// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export async function runAccountSwitchTransaction({
  switchToNext,
  commit,
  restorePrevious,
}: Readonly<{
  switchToNext: () => Promise<void>;
  commit: () => void | Promise<void>;
  restorePrevious: () => Promise<void>;
}>): Promise<void> {
  try {
    await switchToNext();
    await commit();
  } catch (switchError) {
    try {
      await restorePrevious();
    } catch (restoreError) {
      throw new AggregateError(
        [switchError, restoreError],
        'Account switch and rollback both failed'
      );
    }
    throw switchError;
  }
}
