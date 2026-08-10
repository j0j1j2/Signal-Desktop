// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReadonlyDeep } from 'type-fest';
import * as Bytes from '../Bytes.std.ts';
import type { MessageAttributesType } from '../model-types.d.ts';
import type { AttachmentType } from '../types/Attachment.std.ts';
import type { RawBodyRange } from '../types/BodyRange.std.ts';
import type { LinkPreviewType } from '../types/message/LinkPreviews.std.ts';

export const CONVERSATION_EXPORT_FORMAT =
  'signal-desktop-conversation-export' as const;
export const CONVERSATION_EXPORT_VERSION = 1;

export type ConversationExportMetadata = Readonly<{
  title: string;
  type: 'direct' | 'group';
}>;

export type ConversationExportSender = Readonly<{
  direction: 'incoming' | 'outgoing' | 'system';
  name?: string;
}>;

function withoutUndefined(
  value: Record<string, unknown>
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined)
  );
}

function getSafeAttachment(
  attachment: ReadonlyDeep<AttachmentType>
): Readonly<Record<string, unknown>> {
  const textAttachment = attachment.textAttachment
    ? withoutUndefined({
        text: attachment.textAttachment.text,
        textStyle: attachment.textAttachment.textStyle,
        textForegroundColor: attachment.textAttachment.textForegroundColor,
        textBackgroundColor: attachment.textAttachment.textBackgroundColor,
        color: attachment.textAttachment.color,
        gradient: attachment.textAttachment.gradient,
      })
    : undefined;

  return withoutUndefined({
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    size: attachment.size,
    duration: attachment.duration,
    width: attachment.width,
    height: attachment.height,
    caption: attachment.caption,
    flags: attachment.flags,
    isVoiceMessage: attachment.isVoiceMessage,
    pending: attachment.pending,
    error: attachment.error,
    isCorrupted: attachment.isCorrupted,
    wasTooBig: attachment.wasTooBig,
    textAttachment,
  });
}

function getSafeBodyRanges(
  bodyRanges: ReadonlyArray<ReadonlyDeep<RawBodyRange>> | undefined
): ReadonlyArray<Readonly<Record<string, unknown>>> | undefined {
  const formattingRanges = bodyRanges
    ?.filter(range => 'style' in range)
    .map(range =>
      withoutUndefined({
        start: range.start,
        length: range.length,
        style: 'style' in range ? range.style : undefined,
        spoilerId: 'spoilerId' in range ? range.spoilerId : undefined,
      })
    );

  return formattingRanges?.length ? formattingRanges : undefined;
}

function getSafePreview(
  preview: ReadonlyArray<ReadonlyDeep<LinkPreviewType>> | undefined
): ReadonlyArray<Readonly<Record<string, unknown>>> | undefined {
  return preview?.map(item =>
    withoutUndefined({
      title: item.title,
      description: item.description,
      domain: item.domain,
      url: item.url,
      date: item.date,
      image: item.image ? getSafeAttachment(item.image) : undefined,
    })
  );
}

function getSafeQuote(
  quote: ReadonlyDeep<MessageAttributesType['quote']>
): Readonly<Record<string, unknown>> | undefined {
  if (!quote) {
    return undefined;
  }

  return withoutUndefined({
    text: quote.text,
    isViewOnce: quote.isViewOnce,
    isPoll: quote.isPoll,
    referencedMessageNotFound: quote.referencedMessageNotFound,
    bodyRanges: getSafeBodyRanges(quote.bodyRanges),
    attachments: quote.attachments.map(attachment =>
      withoutUndefined({
        contentType: attachment.contentType,
        fileName: attachment.fileName,
        thumbnail: attachment.thumbnail
          ? getSafeAttachment(attachment.thumbnail)
          : undefined,
      })
    ),
  });
}

function getSafeEditHistory(
  editHistory: ReadonlyDeep<MessageAttributesType['editHistory']>
): ReadonlyArray<Readonly<Record<string, unknown>>> | undefined {
  return editHistory?.map(edit =>
    withoutUndefined({
      timestamp: edit.timestamp,
      receivedAt: edit.received_at,
      receivedAtMs: edit.received_at_ms,
      body: edit.body,
      bodyRanges: getSafeBodyRanges(edit.bodyRanges),
      attachments: edit.attachments?.map(getSafeAttachment),
      bodyAttachment: edit.bodyAttachment
        ? getSafeAttachment(edit.bodyAttachment)
        : undefined,
      preview: getSafePreview(edit.preview),
      quote: getSafeQuote(edit.quote),
    })
  );
}

function getSafeAttributes(
  message: ReadonlyDeep<MessageAttributesType>
): Readonly<Record<string, unknown>> {
  const poll = message.poll
    ? withoutUndefined({
        question: message.poll.question,
        options: message.poll.options,
        allowMultiple: message.poll.allowMultiple,
        terminatedAt: message.poll.terminatedAt,
        votes: message.poll.votes?.map(vote => ({
          optionIndexes: vote.optionIndexes,
          voteCount: vote.voteCount,
          timestamp: vote.timestamp,
        })),
      })
    : undefined;

  return withoutUndefined({
    type: message.type,
    sentAt: message.sent_at,
    receivedAt: message.received_at,
    receivedAtMs: message.received_at_ms,
    body: message.body,
    originalBody: message.originalBody,
    bodyRanges: getSafeBodyRanges(message.bodyRanges),
    originalBodyRanges: getSafeBodyRanges(message.originalBodyRanges),
    attachments: message.attachments?.map(getSafeAttachment),
    bodyAttachment: message.bodyAttachment
      ? getSafeAttachment(message.bodyAttachment)
      : undefined,
    preview: getSafePreview(message.preview),
    quote: getSafeQuote(message.quote),
    reactions: message.reactions?.map(reaction => ({
      emoji: reaction.emoji,
      targetTimestamp: reaction.targetTimestamp,
      timestamp: reaction.timestamp,
    })),
    sticker: message.sticker
      ? withoutUndefined({
          emoji: message.sticker.emoji,
          width: message.sticker.width,
          height: message.sticker.height,
          data: message.sticker.data
            ? getSafeAttachment(message.sticker.data)
            : undefined,
        })
      : undefined,
    poll,
    expireTimer: message.expireTimer,
    expirationStartTimestamp: message.expirationStartTimestamp,
    expirationDeprecated: message.expirationDeprecated,
    isViewOnce: message.isViewOnce,
    isTapToViewInvalid: message.isTapToViewInvalid,
    isErased: message.isErased,
    deletedForEveryone: message.deletedForEveryone,
    deletedForEveryoneTimestamp: message.deletedForEveryoneTimestamp,
    editMessageTimestamp: message.editMessageTimestamp,
    editHistory: getSafeEditHistory(message.editHistory),
    storyReaction: message.storyReaction
      ? {
          emoji: message.storyReaction.emoji,
          targetTimestamp: message.storyReaction.targetTimestamp,
        }
      : undefined,
    storyReplyAttachment: message.storyReplyContext?.attachment
      ? getSafeAttachment(message.storyReplyContext.attachment)
      : undefined,
    expirationTimerUpdate: message.expirationTimerUpdate
      ? { expireTimer: message.expirationTimerUpdate.expireTimer }
      : undefined,
    pollTerminateNotification: message.pollTerminateNotification,
    rawProtoEcho: message.rawProtoEcho,
  });
}

export function getConversationExportFilename(title: string): string {
  const sanitized = title
    .normalize('NFKC')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 96);

  return `${sanitized || 'Signal chat'} - ${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
}

export function getConversationExportMessage(
  message: ReadonlyDeep<MessageAttributesType>,
  sender: ConversationExportSender
): Readonly<Record<string, unknown>> {
  return withoutUndefined({
    direction: sender.direction,
    senderName: sender.name,
    attributes: getSafeAttributes(message),
  });
}

export function conversationExportJsonReplacer(
  _key: string,
  value: unknown
): unknown {
  if (typeof value === 'bigint') {
    return {
      type: 'bigint',
      value: value.toString(),
    };
  }

  if (value instanceof Uint8Array) {
    return {
      type: 'bytes',
      encoding: 'base64',
      value: Bytes.toBase64(Uint8Array.from(value)),
    };
  }

  if (value instanceof Error) {
    return {
      type: 'error',
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return value;
}

export function stringifyConversationExportValue(value: unknown): string {
  return JSON.stringify(value, conversationExportJsonReplacer, 2);
}
