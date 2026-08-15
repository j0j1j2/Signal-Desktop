// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createLogger } from '../logging/log.std.ts';
import type { ConversationModel } from '../models/conversations.preload.ts';
import type { MessageModel } from '../models/messages.preload.ts';
import { itemStorage } from '../textsecure/Storage.preload.ts';
import {
  formatCopycatMessage,
  getCopycatSourceBody,
  isCopycatSource,
} from '../util/copycatMode.std.ts';
import { isDownloaded } from '../util/Attachment.std.ts';
import {
  loadAttachmentData,
  loadStickerData,
} from '../util/migrations.preload.ts';
import { queueAttachmentDownloadsAndMaybeSaveMessage } from '../util/queueAttachmentDownloads.preload.ts';
import { AttachmentDownloadUrgency } from '../types/AttachmentDownload.std.ts';
import { sleep } from '../util/sleep.std.ts';
import { getMessageById } from './getMessageById.preload.ts';
import type { AttachmentType } from '../types/Attachment.std.ts';
import type { StickerWithHydratedData } from '../types/Stickers.preload.ts';
import type { ReactionAttributesType } from '../messageModifiers/Reactions.preload.ts';
import { ReactionSource } from '../reactions/ReactionSource.std.ts';
import { isStory } from './helpers.std.ts';
import { getAuthor } from './sources.preload.ts';

const log = createLogger('copycatMode');
const MEDIA_DOWNLOAD_TIMEOUT = 2 * 60 * 1000;
const MEDIA_DOWNLOAD_POLL_INTERVAL = 250;

function hasDownloadedMedia(message: MessageModel): boolean {
  const attachments = message.get('attachments') ?? [];
  const sticker = message.get('sticker');
  return (
    attachments.every(isDownloaded) &&
    (sticker == null || isDownloaded(sticker.data))
  );
}

async function pollForDownloadedMedia(
  message: MessageModel,
  deadline: number
): Promise<MessageModel | undefined> {
  const latestMessage = (await getMessageById(message.id)) ?? message;
  if (hasDownloadedMedia(latestMessage)) {
    return latestMessage;
  }
  if (Date.now() >= deadline) {
    return undefined;
  }

  await sleep(MEDIA_DOWNLOAD_POLL_INTERVAL);
  return pollForDownloadedMedia(message, deadline);
}

async function waitForDownloadedMedia(
  message: MessageModel
): Promise<MessageModel | undefined> {
  if (hasDownloadedMedia(message)) {
    return message;
  }

  await queueAttachmentDownloadsAndMaybeSaveMessage(message, {
    isManualDownload: true,
    urgency: AttachmentDownloadUrgency.IMMEDIATE,
  });

  const downloadedMessage = await pollForDownloadedMedia(
    message,
    Date.now() + MEDIA_DOWNLOAD_TIMEOUT
  );
  if (downloadedMessage) {
    return downloadedMessage;
  }

  log.warn(`Timed out downloading copycat media for message ${message.id}`);
  return undefined;
}

async function loadCopycatMedia(message: MessageModel): Promise<{
  attachments: Array<AttachmentType>;
  sticker?: StickerWithHydratedData;
}> {
  const hasMedia =
    (message.get('attachments')?.length ?? 0) > 0 ||
    message.get('sticker') != null;
  if (!hasMedia) {
    return { attachments: [] };
  }

  const downloadedMessage = await waitForDownloadedMedia(message);
  if (!downloadedMessage) {
    return { attachments: [] };
  }

  const attachments = await Promise.all(
    (downloadedMessage.get('attachments') ?? []).map(async attachment => ({
      ...(await loadAttachmentData(attachment)),
      path: undefined,
      thumbnail: undefined,
      thumbnailFromBackup: undefined,
      screenshot: undefined,
    }))
  );
  const sourceSticker = downloadedMessage.get('sticker');
  const loadedSticker = sourceSticker
    ? await loadStickerData(sourceSticker)
    : undefined;
  const sticker = loadedSticker
    ? {
        ...loadedSticker,
        data: {
          ...loadedSticker.data,
          path: undefined,
        },
      }
    : undefined;

  return { attachments, sticker };
}

export async function maybeEnqueueCopycatMessage(
  message: MessageModel,
  conversation: ConversationModel
): Promise<void> {
  const targetByConversationId = itemStorage.get(
    'copycatTargetByConversationId',
    {}
  );
  const targetServiceId = targetByConversationId[conversation.id];
  const sourceServiceId = message.get('sourceServiceId');
  const isSelectedSource = isCopycatSource({
    isViewOnce: Boolean(message.get('isViewOnce')),
    messageType: message.get('type'),
    sourceServiceId,
    targetServiceId,
  });
  const sourceBody = getCopycatSourceBody({
    body: message.get('body'),
    isViewOnce: Boolean(message.get('isViewOnce')),
    messageType: message.get('type'),
    sourceServiceId,
    targetServiceId,
  });

  if (
    !isSelectedSource ||
    !conversation.getAccepted() ||
    conversation.get('terminated')
  ) {
    return;
  }

  const senderName =
    getAuthor(message.attributes)?.getTitle() ?? sourceServiceId ?? 'Unknown';
  const quote = message.get('quote');
  const { attachments, sticker } = await loadCopycatMedia(message);
  if (sourceBody == null && attachments.length === 0 && sticker == null) {
    return;
  }

  const body = formatCopycatMessage(senderName, sourceBody ?? '');

  await conversation.queueJob(
    `copycatMode/${conversation.idForLogging()}`,
    async () => {
      if (sticker != null) {
        await conversation.enqueueMessageForSend(
          { attachments: [], body },
          {
            dontClearDraft: true,
            dontEnableProfileSharing: true,
            timestamp: Date.now(),
          }
        );
        await conversation.enqueueMessageForSend(
          { attachments: [], body: undefined, quote, sticker },
          {
            dontClearDraft: true,
            dontEnableProfileSharing: true,
            timestamp: Date.now() + 1,
          }
        );
        return;
      }

      await conversation.enqueueMessageForSend(
        {
          attachments,
          body,
          quote,
        },
        {
          dontClearDraft: true,
          dontEnableProfileSharing: true,
          timestamp: Date.now(),
        }
      );
    }
  );

  log.info(`Queued copycat message in ${conversation.idForLogging()}`);
}

export async function maybeEnqueueCopycatReaction(
  message: MessageModel,
  reaction: ReactionAttributesType,
  conversation: ConversationModel
): Promise<void> {
  if (
    reaction.source !== ReactionSource.FromSomeoneElse ||
    isStory(message.attributes)
  ) {
    return;
  }

  const sender = window.ConversationController.get(reaction.fromId);
  const senderServiceId = sender?.getServiceId();
  const targetServiceId = itemStorage.get('copycatTargetByConversationId', {})[
    conversation.id
  ];
  if (senderServiceId == null || senderServiceId !== targetServiceId) {
    return;
  }

  const { enqueueReactionForSend } =
    await import('../reactions/enqueueReactionForSend.preload.ts');
  await enqueueReactionForSend({
    allowBlocked: true,
    dontEnableProfileSharing: true,
    emoji: reaction.emoji,
    messageId: message.id,
    remove: Boolean(reaction.remove),
  });
  log.info(`Queued copycat reaction in ${conversation.idForLogging()}`);
}
