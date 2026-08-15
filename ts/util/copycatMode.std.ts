// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

const COPYCAT_MESSAGE_MARKER = '\u2063';

export function isCopycatMessageBody(body: string | undefined): boolean {
  return body?.endsWith(COPYCAT_MESSAGE_MARKER) ?? false;
}

export function isCopycatSource({
  isViewOnce,
  messageType,
  sourceServiceId,
  targetServiceId,
}: {
  isViewOnce: boolean;
  messageType: string | undefined;
  sourceServiceId: string | undefined;
  targetServiceId: string | undefined;
}): boolean {
  return (
    messageType === 'incoming' &&
    sourceServiceId != null &&
    sourceServiceId === targetServiceId &&
    !isViewOnce
  );
}

export function getCopycatSourceBody({
  body,
  isViewOnce,
  messageType,
  sourceServiceId,
  targetServiceId,
}: {
  body: string | undefined;
  isViewOnce: boolean;
  messageType: string | undefined;
  sourceServiceId: string | undefined;
  targetServiceId: string | undefined;
}): string | undefined {
  if (
    !isCopycatSource({
      isViewOnce,
      messageType,
      sourceServiceId,
      targetServiceId,
    }) ||
    body == null ||
    isCopycatMessageBody(body)
  ) {
    return undefined;
  }

  const trimmedBody = body.trim();
  return trimmedBody.length > 0 ? trimmedBody : undefined;
}

export function formatCopycatMessage(senderName: string, body: string): string {
  const normalizedSenderName = senderName.replace(/\s+/g, ' ').trim();
  const displayedSenderName = normalizedSenderName || 'Unknown';
  return `[${displayedSenderName}]: ${body}${COPYCAT_MESSAGE_MARKER}`;
}
