# Repeatable View-Once Media Design

## Summary

This private Signal Desktop client will preserve locally sent and received
view-once media so the local user can open it repeatedly. The client will keep
the Signal protocol representation and view-once user interface, but it will
not erase the local message or attachment after viewing, sending, linked-device
open synchronization, or age-based cleanup.

This change intentionally differs from Signal's sender-intent privacy model.
It does not change end-to-end encryption and must not transmit decrypted media,
message contents, or cryptographic keys to any additional server.

## Scope

The change applies only to Signal view-once media.

It includes:

- Received view-once media.
- Sent view-once media retained after a successful send.
- Repeated viewing from the conversation timeline.
- Retention across application restarts.
- Retention when another linked device reports that the media was opened.
- Retention past the existing unopened view-once age-out period.

It excludes:

- Disappearing messages controlled by a conversation timer.
- Recovery of media whose attachment file was already erased.
- Adding view-once media to search or the media gallery.
- Enabling save, copy, or export actions that Signal disables for view-once
  media.
- Changing how recipients using other Signal clients handle sent view-once
  media.

## Trust Model

Signal continues to provide transport encryption and end-to-end message
encryption. Once content is decrypted on this device, the local user controls
its retention and repeated viewing. Decrypted content and cryptographic keys
remain local and are never sent to a custom analytics, logging, update, or
storage service.

The UI must continue to identify the item as view-once media. Retaining that
state preserves the sender's declared intent even though this client does not
enforce local deletion.

## Architecture

### View Processing

`markViewOnceMessageViewed` remains the single entry point for recording an
open. On the first local open it will:

1. Mark the message as viewed.
2. Send the normal viewed receipt for an incoming message.
3. Queue the normal view-once-open synchronization for linked devices.
4. Leave message attributes and attachment files intact.

Subsequent local opens will display the retained attachment without sending a
duplicate viewed receipt or duplicate linked-device synchronization event.
Calls originating from linked-device synchronization will update the local
viewed state without erasing message contents.

### Viewer Lifecycle

The view-once lightbox will continue copying the encrypted local attachment to
a temporary viewer file. Closing the lightbox will delete that temporary file.
The source attachment referenced by the message remains intact, allowing a new
temporary copy to be created on the next open.

The message retains `isViewOnce: true` and does not transition to
`isErased: true` as a result of viewing. Existing selectors can therefore keep
the media out of search, gallery, thumbnails, and normal attachment actions.

### Sent Media

The normal send pipeline will upload and send view-once media exactly as it
does now. After a successful send, it will not call the view-once erase path for
the local outgoing message. Its local attachment remains available through the
same view-once lightbox.

This does not affect the recipient's client. The wire message remains a
view-once message, and a standard Signal client may erase it after viewing.

### Age-Based Cleanup

The tap-to-view deletion service will not erase unopened view-once messages due
to age. The service may remain present for upstream compatibility, but it must
skip local view-once content under this custom retention policy.

This exception must be narrow. General attachment cleanup, explicit local
message deletion, database maintenance, and unrelated message expiration must
continue to work.

## Data Flow

### First Incoming Open

1. Resolve the message and validate it as view-once media.
2. Ensure the attachment is locally available, using the existing download
   behavior if necessary.
3. Copy the attachment to the temporary viewer directory.
4. Mark the message viewed and enqueue the standard receipt and linked-device
   synchronization.
5. Open the view-once lightbox.
6. Delete only the temporary viewer copy when the lightbox closes.

### Repeated Incoming Open

1. Resolve the same non-erased view-once message.
2. Copy its retained attachment to a new temporary viewer file.
3. Do not enqueue another receipt or open synchronization event.
4. Open the lightbox and delete only the temporary copy on close.

### Outgoing Send and Open

1. Process, upload, and send the view-once attachment normally.
2. Preserve the outgoing message and its local attachment after send success.
3. Open it through the existing view-once lightbox on demand.
4. Preserve the source attachment when the lightbox closes.

### Linked-Device Open

1. Receive the existing `ViewOnceOpen` sync message.
2. Mark the target message viewed if it is present.
3. Do not erase or clean up its attachment.

## Error Handling

- Missing messages, invalid view-once messages, and missing attachment paths
  retain the existing error behavior.
- Attachment download failures retain the existing retry and error UI.
- Receipt or linked-device synchronization failures are logged through the
  existing facilities and must never trigger local deletion.
- Temporary-file cleanup remains best effort and must not remove the source
  attachment.
- Already-erased historical messages remain expired because their deleted
  attachment bytes cannot be recovered by this feature.

## Testing

Focused automated tests will cover:

- First and repeated opens of received view-once media.
- A received message remaining non-erased with its attachment after viewing.
- Viewed receipts and linked-device open synchronization being queued once.
- A linked-device open synchronization marking viewed without erasing media.
- Sent view-once media retaining its local message and attachment after send.
- Age-based cleanup leaving unopened view-once media intact.
- View-once media remaining excluded from search and the media gallery.
- Normal media cleanup, explicit deletion, and already-erased view-once display
  behavior remaining unchanged.

Manual verification will cover image and video playback, repeated opening after
an application restart, and confirmation that save/copy/gallery actions remain
unavailable.

## Compatibility

The implementation will retain Signal's protobuf fields, receipt behavior, and
linked-device synchronization format. It will change only this client's local
retention policy. Custom code will be labeled narrowly so future upstream
merges can identify the intentional divergence.

## Local Installation

After implementation and verification, the new Apple Silicon application will
replace the existing `/Applications/Signal.app` installation. Installation
must preserve the existing user profile under
`~/Library/Application Support/Signal` and must not modify or remove Signal's
Keychain entries.

The replacement procedure is transactional:

1. Build and verify `release/mac-arm64/Signal.app` with the production bundle
   identifier `org.whispersystems.signal-desktop`.
2. Verify the application bundle's ad-hoc signature and packaged architecture.
3. Ask the running Signal application to quit and wait for all of its processes
   to exit.
4. Move the installed application bundle to a temporary rollback path.
5. Copy the new bundle to `/Applications/Signal.app` and verify the copied
   bundle.
6. Launch the replacement and confirm that it starts with the existing local
   profile.
7. Remove the temporary application backup only after successful launch
   verification.

If copying, signature verification, launch, or profile loading fails, the
installer must remove the failed replacement and restore the previous app
bundle. The profile directory is not part of the replacement operation and is
never deleted during rollback.
