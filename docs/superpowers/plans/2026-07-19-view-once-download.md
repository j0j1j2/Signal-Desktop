# View-Once Media Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow retained incoming and outgoing view-once images and videos to be saved from the Lightbox with its Save button or `Cmd+S`/`Ctrl+S`.

**Architecture:** Reuse the existing Lightbox `saveAttachment` callback and the standard conversation attachment-save pipeline. Remove only the view-once save guards; keep forwarding, context-menu export, retention, encryption, and unavailable-historical-media behavior unchanged.

**Tech Stack:** TypeScript, React, Redux, Electron, Playwright mock-server tests, pnpm, electron-builder, macOS codesign.

## Global Constraints

- Apply only to locally retained Signal view-once images and videos.
- Enable only the Lightbox Save button and `Cmd+S`/`Ctrl+S`.
- Keep forwarding and message context-menu download unavailable for view-once media.
- Use the existing dangerous-file checks, native save dialog, platform quarantine metadata, and saved-file toast.
- Never transmit decrypted content or cryptographic keys to an additional server.
- Do not attempt to recover historical attachments whose local files were already erased.
- Commit all source and test changes before building the binary.
- Replace `/Applications/Signal.app` while preserving `~/Library/Application Support/Signal` and Keychain data.

---

### Task 1: Enable Lightbox Save For View-Once Media

**Files:**

- Modify: `ts/test-mock/messaging/lightbox_test.node.ts:227-280`
- Modify: `ts/components/Lightbox.dom.tsx:239-255,747-763`

**Interfaces:**

- Consumes: existing `SaveAttachmentActionCreatorType` passed to `Lightbox`.
- Preserves: `saveAttachment(attachment, timestamp, index)` and `handleForward` behavior.
- Produces: a visible Save control and active save shortcut for view-once Lightbox media.

- [ ] **Step 1: Add failing received and sent UI assertions**

After each view-once Lightbox becomes visible in the existing received and sent
repeat-open tests, add:

```ts
const Save = Lightbox.getByRole('button', { name: 'Save' });
await expect(Save).toBeVisible();
await expect(Lightbox.getByRole('button', { name: 'Forward' })).toHaveCount(0);
```

Keep the existing close and repeat-open assertions so the test also protects
the retained-media behavior.

- [ ] **Step 2: Run the focused mock tests and verify RED**

Run:

```bash
pnpm test-mock -- --grep "view-once media"
```

Expected: FAIL because the Lightbox has no button named `Save` when
`isViewOnce` is true.

- [ ] **Step 3: Remove only the view-once save guards**

Change `handleSave` so it always routes the current media item through the
existing action:

```ts
const handleSave = useCallback(
  (event: KeyboardEvent | ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();

    const mediaItem = media[selectedIndex];
    strictAssert(mediaItem, 'Missing mediaItem');
    const { attachment: attachmentToSave, message, index } = mediaItem;

    saveAttachment(attachmentToSave, message.sentAt, index + 1);
  },
  [media, saveAttachment, selectedIndex]
);
```

Render the Save button unconditionally while leaving the Forward conditional
unchanged:

```tsx
<button
  aria-label={i18n('icu:save')}
  className="Lightbox__button Lightbox__button--save"
  onClick={handleSave}
  type="button"
/>
```

The existing keydown handler already calls `handleSave` for `Cmd+S`/`Ctrl+S`,
so removing the handler guard enables the shortcut without a second code path.

- [ ] **Step 4: Run focused tests and static checks**

Run:

```bash
pnpm test-mock -- --grep "view-once media"
pnpm exec prettier --check ts/components/Lightbox.dom.tsx ts/test-mock/messaging/lightbox_test.node.ts
pnpm exec oxlint ts/components/Lightbox.dom.tsx ts/test-mock/messaging/lightbox_test.node.ts
pnpm check:types
```

Expected: all commands PASS without errors.

- [ ] **Step 5: Commit implementation and tests**

```bash
git add ts/components/Lightbox.dom.tsx ts/test-mock/messaging/lightbox_test.node.ts
git commit -m "Allow saving retained view-once media"
```

### Task 2: Verify, Build, And Replace The Installed App

**Files:**

- Verify: committed repository state
- Build output: `release/mac-arm64/Signal.app`
- Replace: `/Applications/Signal.app`

**Interfaces:**

- Consumes: committed Task 1 implementation and the existing production build pipeline.
- Produces: a running installed arm64 Signal application containing the committed feature.

- [ ] **Step 1: Run regression verification**

```bash
pnpm test-mock -- --grep "view-once media"
NODE_ENV=test NODE_OPTIONS='--import=tsx' LANG=en-us pnpm exec electron-mocha --timeout 10000 --extension ts,tsx,js,mjs --file ts/test-node/setup.preload.ts ts/test-node/util/viewOnceRetention_test.std.ts
pnpm test-electron -- --grep "MessageUpdater view-once retention"
pnpm check:types
pnpm exec prettier --check ts/components/Lightbox.dom.tsx ts/test-mock/messaging/lightbox_test.node.ts docs/superpowers/specs/2026-07-19-view-once-download-design.md docs/superpowers/plans/2026-07-19-view-once-download.md
```

Expected: every command PASS.

- [ ] **Step 2: Confirm the build input is committed and clean**

```bash
git status --porcelain
git log -1 --oneline
```

Expected: `git status --porcelain` prints nothing and HEAD is the Task 1
implementation commit or a later verification-only commit.

- [ ] **Step 3: Build the native arm64 production application**

```bash
pnpm build -- --arm64
```

Expected: exit code 0 and `release/mac-arm64/Signal.app` exists.

- [ ] **Step 4: Verify the built application before installation**

```bash
test -x release/mac-arm64/Signal.app/Contents/MacOS/Signal
codesign --verify --deep --strict release/mac-arm64/Signal.app
shasum -a 256 release/mac-arm64/Signal.app/Contents/Resources/app.asar
```

Expected: executable exists, codesign verification exits 0, and an app.asar
SHA-256 is printed.

- [ ] **Step 5: Replace the installed application transactionally**

```bash
osascript -e 'tell application "Signal" to quit' || true
while pgrep -x Signal >/dev/null; do sleep 1; done
rm -rf /Applications/Signal.app.previous
if test -d /Applications/Signal.app; then mv /Applications/Signal.app /Applications/Signal.app.previous; fi
ditto release/mac-arm64/Signal.app /Applications/Signal.app
```

Do not modify `~/Library/Application Support/Signal` or Keychain entries. If
copy or validation fails, remove the incomplete new bundle and move
`/Applications/Signal.app.previous` back into place.

- [ ] **Step 6: Verify and launch the installed replacement**

```bash
codesign --verify --deep --strict /Applications/Signal.app
test "$(shasum -a 256 release/mac-arm64/Signal.app/Contents/Resources/app.asar | awk '{print $1}')" = "$(shasum -a 256 /Applications/Signal.app/Contents/Resources/app.asar | awk '{print $1}')"
open -a /Applications/Signal.app
sleep 5
pgrep -x Signal
mdls -name kMDItemVersion /Applications/Signal.app
```

Expected: codesign verification passes, built and installed app.asar hashes
match, Signal has a running PID, and the installed version is printed.

- [ ] **Step 7: Remove the previous bundle after successful launch**

```bash
rm -rf /Applications/Signal.app.previous
git status --porcelain
```

Expected: the previous bundle is removed and the repository remains clean.
