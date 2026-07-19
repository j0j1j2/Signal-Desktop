# Repeatable View-Once Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve sent and received view-once media locally and allow it to be opened repeatedly without exposing it through normal save, copy, search, or gallery surfaces.

**Architecture:** Centralize the custom retention decision in a small pure policy function, then gate Signal's three view-once erase paths with it. Keep `isViewOnce` and the existing temporary-file lightbox, while allowing outgoing and already-viewed bubbles to reopen and suppressing duplicate receipts and linked-device sync events.

**Tech Stack:** TypeScript, Electron, React, Redux, Mocha/Chai, Playwright mock-server tests, pnpm, electron-builder, macOS codesign.

## Global Constraints

- Apply only to Signal view-once media, not disappearing-message timers.
- Preserve sent and received media across local viewing, linked-device open sync, application restart, and age-based cleanup.
- Keep `isViewOnce: true`; do not add media to search or the media gallery and do not enable save, copy, or export actions.
- Continue sending the standard first-open receipt and linked-device synchronization for incoming media, but never send duplicates on repeated local opens.
- Never transmit decrypted content or cryptographic keys to an additional server.
- Do not recover already-erased historical attachments.
- Do not revert or include unrelated existing worktree changes in feature commits.
- Replace `/Applications/Signal.app` transactionally after verification while preserving `~/Library/Application Support/Signal` and Keychain data.

---

### Task 1: Central View-Once Retention Policy

**Files:**

- Create: `ts/util/viewOnceRetention.std.ts`
- Create: `ts/test-node/util/viewOnceRetention_test.std.ts`

**Interfaces:**

- Produces: `shouldEraseViewOnceMedia(reason: ViewOnceEraseReason): boolean`.
- Consumes: the three existing erase reason strings from `EraseMessageReasonType`.

- [ ] **Step 1: Write the failing policy test**

```ts
import { assert } from 'chai';
import { shouldEraseViewOnceMedia } from '../../util/viewOnceRetention.std.ts';

describe('viewOnceRetention', () => {
  it('preserves view-once media for every automatic erase trigger', () => {
    assert.isFalse(shouldEraseViewOnceMedia('view-once-viewed'));
    assert.isFalse(shouldEraseViewOnceMedia('view-once-sent'));
    assert.isFalse(shouldEraseViewOnceMedia('view-once-expired'));
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `NODE_ENV=test NODE_OPTIONS='--import=tsx' LANG=en-us pnpm exec electron-mocha --timeout 10000 --extension ts,tsx,js,mjs --file ts/test-node/setup.preload.ts ts/test-node/util/viewOnceRetention_test.std.ts`

Expected: FAIL because `ts/util/viewOnceRetention.std.ts` does not exist.

- [ ] **Step 3: Implement the policy**

```ts
import type { EraseMessageReasonType } from '../types/Message.std.ts';

export type ViewOnceEraseReason = Extract<
  EraseMessageReasonType,
  'view-once-viewed' | 'view-once-sent' | 'view-once-expired'
>;

export function shouldEraseViewOnceMedia(
  _reason: ViewOnceEraseReason
): boolean {
  return false;
}
```

- [ ] **Step 4: Run the focused test**

Run: `NODE_ENV=test NODE_OPTIONS='--import=tsx' LANG=en-us pnpm exec electron-mocha --timeout 10000 --extension ts,tsx,js,mjs --file ts/test-node/setup.preload.ts ts/test-node/util/viewOnceRetention_test.std.ts`

Expected: PASS.

- [ ] **Step 5: Commit the policy**

```bash
git add ts/util/viewOnceRetention.std.ts ts/test-node/util/viewOnceRetention_test.std.ts
git commit -m "Add view-once retention policy"
```

### Task 2: Preserve Received Media and Avoid Duplicate Open Events

**Files:**

- Create: `ts/test-electron/services/MessageUpdater_test.preload.ts`
- Modify: `ts/services/MessageUpdater.preload.ts:81-166`

**Interfaces:**

- Consumes: `shouldEraseViewOnceMedia('view-once-viewed')` from Task 1.
- Preserves: `markViewOnceMessageViewed(message, { fromSync? }): Promise<void>`.

- [ ] **Step 1: Write a failing received-media test**

Create a valid incoming `MessageModel` with `isViewOnce: true`, one JPEG attachment with a local path, and `ReadStatus.Unread`. Register and save it, call `markViewOnceMessageViewed(message, { fromSync: true })` twice, and assert after both calls:

```ts
assert.strictEqual(message.get('readStatus'), ReadStatus.Viewed);
assert.isNotTrue(message.get('isErased'));
assert.deepEqual(message.get('attachments'), [attachment]);
```

Use `DataWriter.removeAll()`, `itemStorage.user.setAciAndDeviceId(generateAci(), 1)`, and `window.ConversationController.load()` in setup so queued message updates can complete safely.

- [ ] **Step 2: Run the focused Electron test and verify it fails**

Run: `pnpm test-electron -- --grep "MessageUpdater view-once retention"`

Expected: FAIL because the first open calls `eraseMessageContents` and removes the attachment.

- [ ] **Step 3: Gate erasure and duplicate side effects**

Update `markViewOnceMessageViewed` in this order:

```ts
const wasAlreadyViewed = message.get('readStatus') === ReadStatus.Viewed;
if (!wasAlreadyViewed) {
  message.set(markViewed(message.attributes));
}

if (shouldEraseViewOnceMedia('view-once-viewed')) {
  await eraseMessageContents(message, 'view-once-viewed');
}

if (wasAlreadyViewed) {
  log.info('markViewOnceMessageViewed: already viewed; retaining media');
  return;
}
```

Keep the existing `fromSync`, receipt, and `viewOnceOpenJobQueue` logic after this block. This sends events once on the first local incoming open, sends none for a sync-originated open, and sends none for repeated opens.

- [ ] **Step 4: Run the focused Electron test**

Run: `pnpm test-electron -- --grep "MessageUpdater view-once retention"`

Expected: PASS.

- [ ] **Step 5: Commit received retention**

```bash
git add ts/services/MessageUpdater.preload.ts ts/test-electron/services/MessageUpdater_test.preload.ts
git commit -m "Preserve received view-once media"
```

### Task 3: Preserve Sent and Aged Media

**Files:**

- Modify: `ts/jobs/helpers/sendNormalMessage.preload.ts:482-484`
- Modify: `ts/services/tapToViewMessagesDeletionService.preload.ts:146-148`
- Modify: `ts/test-node/util/viewOnceRetention_test.std.ts`

**Interfaces:**

- Consumes: `shouldEraseViewOnceMedia('view-once-sent' | 'view-once-expired')` from Task 1.

- [ ] **Step 1: Extend the policy test with explicit trigger coverage**

Use a typed exhaustive list so adding or changing a policy trigger requires updating the test:

```ts
const reasons = [
  'view-once-viewed',
  'view-once-sent',
  'view-once-expired',
] as const;

for (const reason of reasons) {
  assert.isFalse(shouldEraseViewOnceMedia(reason), reason);
}
```

- [ ] **Step 2: Gate outgoing post-send erasure**

```ts
if (isViewOnce && shouldEraseViewOnceMedia('view-once-sent')) {
  await eraseMessageContents(message, 'view-once-sent');
}
```

- [ ] **Step 3: Disable the age-out scheduler through the same policy**

```ts
#shouldRun(): boolean {
  return (
    shouldEraseViewOnceMedia('view-once-expired') &&
    !this.#isPaused &&
    !window.SignalContext.isTestOrMockEnvironment()
  );
}
```

This prevents age-out database queries and timers while leaving the service surface intact for upstream compatibility.

- [ ] **Step 4: Run the policy and type checks**

Run: `NODE_ENV=test NODE_OPTIONS='--import=tsx' LANG=en-us pnpm exec electron-mocha --timeout 10000 --extension ts,tsx,js,mjs --file ts/test-node/setup.preload.ts ts/test-node/util/viewOnceRetention_test.std.ts && pnpm check:types`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit sent and age retention**

```bash
git add ts/jobs/helpers/sendNormalMessage.preload.ts ts/services/tapToViewMessagesDeletionService.preload.ts ts/test-node/util/viewOnceRetention_test.std.ts
git commit -m "Preserve sent and aged view-once media"
```

### Task 4: Reopen Viewed and Outgoing Media in the Existing Lightbox

**Files:**

- Modify: `ts/components/conversation/Message.dom.tsx:2760-2820,3178-3240`
- Modify: `ts/state/ducks/lightbox.preload.ts:180-270`
- Modify: `ts/test-mock/helpers.node.ts:198-246`
- Modify: `ts/test-mock/messaging/lightbox_test.node.ts`

**Interfaces:**

- Preserves: `showLightboxForViewOnceMedia(messageId: string)`.
- Extends: mock `sendTextMessage` with optional `isViewOnce?: boolean` and maps it to `Proto.DataMessage.isViewOnce`.

- [ ] **Step 1: Write an incoming repeat-open Playwright test**

Extend the mock helper signature and DataMessage fixture:

```ts
isViewOnce?: boolean;
// ...
isViewOnce: isViewOnce ?? false,
```

In `lightbox_test.node.ts`, send a JPEG attachment back from the pinned contact with `text: undefined` and `isViewOnce: true`. Click its timestamp-addressed timeline message, verify `.Lightbox` is visible, close through the button named `Close`, then click the same message and verify `.Lightbox` is visible again.

- [ ] **Step 2: Run the mock test and verify the second open fails**

Run: `pnpm test-mock -- --grep "reopens received view-once media"`

Expected: FAIL because a viewed incoming bubble currently shows the expired toast instead of opening the lightbox.

- [ ] **Step 3: Allow outgoing and viewed bubbles to open**

In `Message.handleOpen`, remove the early outgoing and `ReadStatus.Viewed` toast branches. Keep invalid, expired, and download-state checks, then call `showLightboxForViewOnceMedia(id)` for any locally available non-erased view-once attachment.

In `renderTapToViewIcon`, retain the existing `outgoing` and `viewed` icon states but do not apply the disabled container style solely because of either state. The labels continue to identify the item as view-once media.

- [ ] **Step 4: Avoid incoming receipt logic for a locally opened outgoing item**

Import `isIncoming` into `lightbox.preload.ts` and change the first-open call to:

```ts
if (isIncoming(message.attributes)) {
  await markViewOnceMessageViewed(message);
}
```

Outgoing media uses the same temporary-copy viewer without changing incoming read status or sending a view-once-open event about the user's own sent item.

- [ ] **Step 5: Add and run an outgoing retained-media Playwright case**

Attach one JPEG, enable the `View once` button, click `Send message`, wait for the outgoing timestamped bubble, click it, and assert that `.Lightbox` is visible. Close and reopen it once more.

Run: `pnpm test-mock -- --grep "view-once media"`

Expected: both received and outgoing repeat-open cases PASS.

- [ ] **Step 6: Commit lightbox behavior**

```bash
git add ts/components/conversation/Message.dom.tsx ts/state/ducks/lightbox.preload.ts ts/test-mock/helpers.node.ts ts/test-mock/messaging/lightbox_test.node.ts
git commit -m "Allow repeated view-once media playback"
```

### Task 5: Regression Verification, Build, and Transactional Installation

**Files:**

- Verify only; no source file is expected unless a failing check identifies a scoped defect.

**Interfaces:**

- Produces: installed `/Applications/Signal.app` with identifier `org.whispersystems.signal-desktop` and preserved profile data.

- [ ] **Step 1: Run focused and broad verification**

```bash
NODE_ENV=test NODE_OPTIONS='--import=tsx' LANG=en-us pnpm exec electron-mocha --timeout 10000 --extension ts,tsx,js,mjs --file ts/test-node/setup.preload.ts ts/test-node/util/viewOnceRetention_test.std.ts
pnpm test-electron -- --grep "MessageUpdater view-once retention|fullTextSearch"
pnpm test-mock -- --grep "view-once media"
pnpm check:types
pnpm lint-prettier
```

Expected: all commands PASS. Confirm the existing full-text-search test still excludes `isViewOnce = true`.

- [ ] **Step 2: Build the Apple Silicon production bundle**

Run: `SKIP_SIGNING_SCRIPT=1 pnpm build:release -- --mac --arm64`

If generated assets are stale, first run `pnpm generate`, then repeat the build. Expected output: `release/mac-arm64/Signal.app`.

- [ ] **Step 3: Verify the new bundle before installation**

```bash
test "$(defaults read "$PWD/release/mac-arm64/Signal.app/Contents/Info" CFBundleIdentifier)" = "org.whispersystems.signal-desktop"
file release/mac-arm64/Signal.app/Contents/MacOS/Signal | grep arm64
codesign --verify --deep --strict release/mac-arm64/Signal.app
```

Expected: correct bundle identifier, arm64 executable, and valid ad-hoc signature.

- [ ] **Step 4: Replace the installed app transactionally**

Record the profile directory metadata, quit Signal through Apple Events, wait for its processes to exit, move `/Applications/Signal.app` to a unique temporary path under `/Applications`, and copy the new bundle with `ditto`. Do not modify `~/Library/Application Support/Signal`.

Verify the copied app with `codesign --verify --deep --strict` and the bundle identifier check. On any failure, remove the new bundle and move the backup back into place.

- [ ] **Step 5: Launch and smoke-test the installed app**

Run `open -a /Applications/Signal.app`, wait for the main process, confirm the process executable is `/Applications/Signal.app/Contents/MacOS/Signal`, and verify the existing profile directory still exists with unchanged ownership. Inspect the latest application log for startup-fatal errors.

After successful launch verification, delete the temporary old app bundle. Keep user profile data untouched.

- [ ] **Step 6: Record final repository state**

Run `git status --short`, `git log -6 --oneline`, and report feature commits, verification results, installed bundle identifier/architecture, and any unrelated pre-existing dirty files left unchanged.
