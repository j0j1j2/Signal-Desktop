// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ContentHint } from '@signalapp/libsignal-client';
import { SignalService as Proto } from '../protobuf/index.std.ts';
import { messageSender } from '../textsecure/SendMessage.preload.ts';
import { getSendOptions } from './getSendOptions.preload.ts';
import { handleMessageSend } from './handleMessageSend.preload.ts';
import { createLogger } from '../logging/log.std.ts';
import type { MessageAttributesType } from '../model-types.d.ts';
import { MessageModel } from '../models/messages.preload.ts';
import { generateMessageId } from './generateMessageId.node.ts';
import { incrementMessageCounter } from './incrementMessageCounter.preload.ts';
import { ReadStatus } from '../messages/MessageReadStatus.std.ts';
import { SeenStatus } from '../MessageSeenStatus.std.ts';
import { SendStatus } from '../messages/MessageSendState.std.ts';
import { uploadAttachment } from './uploadAttachment.preload.ts';
import type { AttachmentWithHydratedData } from '../types/Attachment.std.ts';
import { processAttachment } from './processAttachment.preload.ts';

// Custom (research/debug): upload a user-picked file to the CDN and return the
// resulting AttachmentPointer object, ready to drop into DataMessage.attachments.
// We run the file through `processAttachment` (same as the normal composer) so
// images get width/height/blurHash and filenames are stripped — otherwise the
// recipient can't render them. The uploaded object is already a valid
// Proto.AttachmentPointer.Params in this codebase.
export async function uploadFileForProto(
  file: File
): Promise<{ name: string; pointer: Record<string, unknown> }> {
  const draft = await processAttachment(file, {
    generateScreenshot: true,
    flags: null,
  });
  if (!draft) {
    throw new Error('File could not be processed (possibly too large).');
  }

  const uploaded = await uploadAttachment(
    draft as unknown as AttachmentWithHydratedData
  );
  log.info(
    `uploadFileForProto: uploaded "${file.name}" (${draft.size} bytes, ${draft.contentType})`
  );
  return {
    name: file.name,
    pointer: uploaded as unknown as Record<string, unknown>,
  };
}

const log = createLogger('debugSendProto');

// uint64 proto fields must be BigInt (not plain JSON numbers). Convert the
// common ones the templates use, in place.
function toBigInt(value: unknown): bigint | unknown {
  if (value == null || typeof value === 'bigint') {
    return value;
  }
  try {
    return BigInt(value as string | number);
  } catch {
    return value;
  }
}

function coerceUint64Fields(dm: Record<string, unknown>): void {
  dm.timestamp = toBigInt(dm.timestamp);

  const quote = dm.quote as Record<string, unknown> | undefined;
  if (quote) {
    quote.id = toBigInt(quote.id);
  }

  const reaction = dm.reaction as Record<string, unknown> | undefined;
  if (reaction) {
    reaction.targetTimestamp = toBigInt(reaction.targetTimestamp);
  }

  const storyContext = dm.storyContext as Record<string, unknown> | undefined;
  if (storyContext) {
    storyContext.sentTimestamp = toBigInt(storyContext.sentTimestamp);
  }

  const del = dm.delete as Record<string, unknown> | undefined;
  if (del) {
    del.targetSentTimestamp = toBigInt(del.targetSentTimestamp);
  }

  if (Array.isArray(dm.preview)) {
    for (const preview of dm.preview as Array<Record<string, unknown>>) {
      if (preview && preview.date != null) {
        preview.date = toBigInt(preview.date);
      }
    }
  }
}

// Custom (research/debug): encode a manually-provided DataMessage object into a
// Content proto and send it, unmodified, to every recipient of a conversation
// through the normal encryption pipeline (singleProtoJobQueue). Intended for
// protocol research/testing against your own or consenting test accounts.
//
// Note: this does NOT create a local copy in your own timeline — it only puts
// the encrypted Content on the wire to recipients.
export async function sendRawDataMessage(
  conversationId: string,
  dataMessage: Record<string, unknown>,
  { echo = false }: { echo?: boolean } = {}
): Promise<{ recipients: number; timestamp: number }> {
  const conversation = window.ConversationController.get(conversationId);
  if (!conversation) {
    throw new Error(
      `sendRawDataMessage: conversation ${conversationId} not found`
    );
  }

  const timestamp = Date.now();
  // Default the DataMessage timestamp to the envelope timestamp unless the
  // caller explicitly set one, so recipients will accept the message.
  const payload: Record<string, unknown> = { timestamp, ...dataMessage };
  // uint64 fields (timestamp, quote.id, reaction.targetTimestamp, …) must be
  // BigInt for the encoder, not plain JSON numbers.
  coerceUint64Fields(payload);

  // Group messages need the groupV2 context (master key + revision) so
  // recipients route the message to the right group. Inject it automatically
  // for group conversations unless the caller supplied their own.
  const groupV2Info = conversation.getGroupV2Info();
  if (groupV2Info != null && payload.groupV2 == null) {
    payload.groupV2 = {
      masterKey: groupV2Info.masterKey,
      revision: groupV2Info.revision,
    };
  }

  const contentObject = {
    content: { dataMessage: payload },
    pniSignatureMessage: null,
    senderKeyDistributionMessage: null,
  } as unknown as Proto.Content.Params;

  const recipients = conversation.getRecipients();
  log.info(
    `sendRawDataMessage: sending custom DataMessage to ${recipients.length} recipient(s) in ${conversationId}`
  );

  // Send directly (not via singleProtoJobQueue) so the ENVELOPE timestamp
  // matches DataMessage.timestamp — otherwise recipients reject the message and
  // it never appears for them.
  for (const serviceId of recipients) {
    const member = window.ConversationController.get(String(serviceId));
    if (!member) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const options = await getSendOptions(member.attributes);
    // eslint-disable-next-line no-await-in-loop
    await handleMessageSend(
      messageSender.sendIndividualProto({
        contentHint: ContentHint.Resendable,
        serviceId,
        options,
        proto: contentObject,
        timestamp,
        urgent: true,
      }),
      { messageIds: [], sendType: 'message' }
    );
  }

  // Custom: optionally also store a local outgoing copy so the sender sees the
  // message in their own timeline (rendered in a distinct color via
  // rawProtoEcho). Best-effort — only fields Signal understands will render.
  if (echo) {
    const sendStateByConversationId: Record<
      string,
      { status: SendStatus; updatedAt: number }
    > = {};
    for (const serviceId of recipients) {
      const member = window.ConversationController.get(String(serviceId));
      if (member) {
        sendStateByConversationId[member.id] = {
          status: SendStatus.Sent,
          updatedAt: timestamp,
        };
      }
    }

    const body =
      typeof payload.body === 'string' ? payload.body : undefined;

    // Map a proto-style quote into the local QuotedMessageType so the echo
    // bubble renders the quoted reply too.
    const rawQuote = dataMessage.quote as Record<string, unknown> | undefined;
    const quote = rawQuote
      ? {
          id: rawQuote.id != null ? Number(rawQuote.id) : null,
          authorAci:
            typeof rawQuote.authorAci === 'string'
              ? rawQuote.authorAci
              : undefined,
          text: typeof rawQuote.text === 'string' ? rawQuote.text : undefined,
          attachments: [],
          isViewOnce: false,
          referencedMessageNotFound: false,
        }
      : undefined;

    const attrs = {
      ...generateMessageId(incrementMessageCounter()),
      conversationId,
      type: 'outgoing',
      sent_at: timestamp,
      timestamp,
      received_at_ms: timestamp,
      body: body ?? (quote ? undefined : '[raw protobuf]'),
      quote,
      sendStateByConversationId,
      readStatus: ReadStatus.Read,
      seenStatus: SeenStatus.NotApplicable,
      rawProtoEcho: true,
    } as unknown as MessageAttributesType;

    const model = window.MessageCache.register(new MessageModel(attrs));
    await window.MessageCache.saveMessage(model.attributes, {
      forceSave: true,
    });
    await conversation.addSingleMessage(model.attributes, {
      isJustSent: true,
    });
    conversation.debouncedUpdateLastMessage();
  }

  return { recipients: recipients.length, timestamp };
}
