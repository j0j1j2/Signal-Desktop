// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from 'node:crypto';
import { chmod, open, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { FileHandle } from 'node:fs/promises';
import fsExtra from 'fs-extra';
import type { ReadonlyDeep } from 'type-fest';
import { DataReader } from '../sql/Client.preload.ts';
import type { MessageAttributesType } from '../model-types.d.ts';
import { createLogger } from '../logging/log.std.ts';
import { promptOSAuth } from './promptOSAuth.preload.ts';
import { showSaveDialog } from '../windows/main/attachments.preload.ts';
import {
  CONVERSATION_EXPORT_FORMAT,
  CONVERSATION_EXPORT_VERSION,
  createConversationExportParticipantIdAssigner,
  getConversationExportFilename,
  getConversationExportMessage,
  stringifyConversationExportValue,
  type ConversationExportMetadata,
  type ConversationExportSender,
} from './exportConversation.std.ts';

const log = createLogger('exportConversation');
const PAGE_SIZE = 500;

export type ExportConversationOptions = Readonly<{
  conversationId: string;
  conversation: ConversationExportMetadata;
  includeStoryReplies: boolean;
}>;

export type ExportConversationResult = Readonly<{
  fullPath: string;
  exportedMessageCount: number;
}>;

function getSender(
  message: ReadonlyDeep<MessageAttributesType>,
  getParticipantId: (identity: string | undefined) => string | undefined,
  ourConversationId: string,
  ourName: string
): ConversationExportSender {
  const isOutgoing = message.type === 'outgoing';
  let direction: ConversationExportSender['direction'] = 'system';
  if (isOutgoing || message.type === 'incoming') {
    direction = 'message';
  }

  const serviceId = message.sourceServiceId;
  let senderConversation;
  if (serviceId) {
    senderConversation = window.ConversationController.get(serviceId);
  } else if (message.source) {
    senderConversation = window.ConversationController.get(message.source);
  }

  return {
    direction,
    id: getParticipantId(
      isOutgoing
        ? ourConversationId
        : (senderConversation?.id ?? serviceId ?? message.source)
    ),
    name: isOutgoing ? ourName : senderConversation?.getTitle(),
  };
}

async function closeQuietly(file: FileHandle | undefined): Promise<void> {
  if (!file) {
    return;
  }
  try {
    await file.close();
  } catch {
    // The original export error is more useful.
  }
}

export async function exportConversationToDisk(
  options: ExportConversationOptions
): Promise<ExportConversationResult | null> {
  const authResult = await promptOSAuth('plaintext-export');
  if (authResult === 'unauthorized') {
    log.warn('exportConversationToDisk: OS authorization was denied');
    return null;
  }
  if (authResult !== 'success') {
    log.warn(
      `exportConversationToDisk: OS authorization returned ${authResult}; continuing`
    );
  }

  const saveResult = await showSaveDialog(
    getConversationExportFilename(options.conversation.title)
  );
  if (saveResult.canceled || !saveResult.filePath) {
    return null;
  }

  const fullPath = saveResult.filePath;
  const temporaryPath = join(
    dirname(fullPath),
    `.${basename(fullPath)}.${randomUUID()}.partial`
  );

  let file: FileHandle | undefined;
  let complete = false;
  let exportedMessageCount = 0;
  let wroteMessage = false;
  let hasMore = true;
  const getParticipantId = createConversationExportParticipantIdAssigner();
  const ourConversation =
    window.ConversationController.getOurConversationOrThrow();
  const ourName =
    ourConversation.getProfileName() ?? ourConversation.getTitle();
  let cursor:
    | Readonly<{ id: string; receivedAt: number; sentAt: number }>
    | undefined;

  try {
    file = await open(temporaryPath, 'wx', 0o600);
    await file.write(
      `{\n  "format": ${JSON.stringify(CONVERSATION_EXPORT_FORMAT)},`
    );
    await file.write(`\n  "version": ${CONVERSATION_EXPORT_VERSION},`);
    await file.write(
      `\n  "exportedAt": ${JSON.stringify(new Date().toISOString())},`
    );
    await file.write(
      `\n  "conversation": ${stringifyConversationExportValue(
        options.conversation
      )},`
    );
    await file.write('\n  "messages": [');

    while (hasMore) {
      // Fetch in chronological order so the file can be written incrementally.
      // oxlint-disable-next-line no-await-in-loop
      const page = await DataReader.getNewerMessagesByConversation({
        conversationId: options.conversationId,
        includeStoryReplies: options.includeStoryReplies,
        limit: PAGE_SIZE,
        messageId: cursor?.id,
        receivedAt: cursor?.receivedAt,
        sentAt: cursor?.sentAt,
        storyId: undefined,
      });

      if (page.length === 0) {
        break;
      }

      for (const message of page) {
        const exportedMessage = getConversationExportMessage(
          message,
          getSender(message, getParticipantId, ourConversation.id, ourName)
        );
        const serialized = stringifyConversationExportValue(exportedMessage)
          .split('\n')
          .map(line => `    ${line}`)
          .join('\n');

        // oxlint-disable-next-line no-await-in-loop
        await file.write(`${wroteMessage ? ',' : ''}\n${serialized}`);
        wroteMessage = true;
        exportedMessageCount += 1;
      }

      const lastMessage = page.at(-1);
      if (!lastMessage) {
        break;
      }
      cursor = {
        id: lastMessage.id,
        receivedAt: lastMessage.received_at,
        sentAt: lastMessage.sent_at,
      };

      if (page.length < PAGE_SIZE) {
        hasMore = false;
      }
    }

    await file.write(wroteMessage ? '\n  ],' : '],');
    await file.write(`\n  "messageCount": ${exportedMessageCount}\n}\n`);
    await file.sync();
    await file.close();
    file = undefined;
    await chmod(temporaryPath, 0o600);
    await fsExtra.move(temporaryPath, fullPath, { overwrite: true });
    complete = true;

    return {
      fullPath,
      exportedMessageCount,
    };
  } finally {
    await closeQuietly(file);
    if (!complete) {
      await rm(temporaryPath, { force: true });
    }
  }
}
