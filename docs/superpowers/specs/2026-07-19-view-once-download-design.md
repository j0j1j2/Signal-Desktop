# View-Once Media Download Design

## Goal

Allow sent and received view-once images and videos retained by this private
client to be saved from the existing Lightbox. The feature must use the same
filesystem safety and user feedback path as ordinary Signal media.

## Scope

- Show the existing Save button for view-once media in the Lightbox.
- Enable the existing `Cmd+S`/`Ctrl+S` Lightbox shortcut for view-once media.
- Save both incoming and outgoing retained view-once images and videos.
- Keep forwarding and message context-menu download unavailable for view-once
  media.
- Do not attempt to recover historical media whose local attachment file was
  already deleted.

## Architecture

`Lightbox.dom.tsx` already receives the standard `saveAttachment` action and
uses it for ordinary media. View-once media is blocked by two local UI guards:
`handleSave` returns early when `isViewOnce` is true, and the Save button is
not rendered in that state. Remove only those two guards.

The existing action remains responsible for suggested filename generation,
dangerous-extension checks, reading locally encrypted attachment data, showing
the native save dialog, adding platform quarantine metadata, and displaying the
saved-file toast. No view-once-specific filesystem or IPC path will be added.

## Data Flow

1. The retained attachment opens in the existing Lightbox.
2. The user selects Save or presses `Cmd+S`/`Ctrl+S`.
3. `handleSave` selects the current `MediaItemType` and invokes
   `saveAttachment(attachment, sentAt, index + 1)`.
4. The standard conversation action reads and decrypts the local attachment,
   opens the native save dialog, writes the selected file, and reports success.

## Error Handling

- Canceling the native dialog produces no file and no success toast.
- Dangerous extensions continue to be rejected by the existing action.
- Read, decrypt, IPC, and write failures continue through the existing Signal
  attachment-save error handling.
- A view-once message without a retained local attachment never reaches this
  flow because it cannot open in the Lightbox.

## Security And Privacy

This does not change Signal Protocol encryption or transmit plaintext to a new
server. It expands the local endpoint retention policy: a user can explicitly
export media that this custom client already retains and can repeatedly view.
Platform quarantine metadata remains applied to exported files.

## Testing

- Add a focused pure UI policy test that initially fails because view-once Save
  is unavailable, then passes after the guards are removed.
- Extend the mock Lightbox flow to verify the Save control is visible for both
  received and sent view-once media.
- Verify the Forward control remains hidden for view-once media.
- Run focused tests, TypeScript checks, formatting/lint checks for changed
  files, the existing view-once tests, and the production macOS build.

## Installation

Build from the committed worktree, stop the running Signal process, replace
`/Applications/Signal.app` with the newly built application, preserve existing
application support and Keychain data, launch the replacement, and verify the
installed executable and bundle metadata.
