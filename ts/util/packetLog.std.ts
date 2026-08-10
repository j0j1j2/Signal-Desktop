// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// Custom (research/debug): a small in-memory ring buffer of the most recent
// Signal Content protos that came in (decrypted) or went out, so they can be
// inspected in the packet-log viewer. Wire bytes are never persisted; this only
// keeps a formatted snapshot in memory for the current session.

import { SignalService as Proto } from '../protobuf/index.std.ts';

export type PacketDirection = 'in' | 'out';

export type PacketEntry = Readonly<{
  direction: PacketDirection;
  at: number;
  type: string;
  json: string;
}>;

export type PacketEnvelope = Readonly<{
  id?: string;
  type?: number;
  source?: string;
  sourceServiceId?: string;
  sourceDevice?: number;
  destinationServiceId?: string;
  updatedPni?: string;
  timestamp?: number;
  serverGuid?: string;
  serverTimestamp?: number;
  receivedAtCounter?: number;
  receivedAtDate?: number;
  messageAgeSec?: number;
  groupId?: string;
  urgent?: boolean;
  story?: boolean;
  unidentifiedDeliveryReceived?: boolean;
  contentHint?: number;
  reportingToken?: Uint8Array<ArrayBuffer>;
}>;

const MAX_PACKETS = 500;
const packets: Array<PacketEntry> = [];

const KNOWN_CONTENT_FIELDS = [
  'dataMessage',
  'syncMessage',
  'receiptMessage',
  'typingMessage',
  'nullMessage',
  'callMessage',
  'callingMessage',
  'storyMessage',
  'editMessage',
  'decryptionErrorMessage',
  'pniSignatureMessage',
  'senderKeyDistributionMessage',
];

function deriveType(content: unknown): string {
  const oneof =
    content != null &&
    typeof content === 'object' &&
    'content' in (content as Record<string, unknown>)
      ? (content as { content?: unknown }).content
      : content;

  if (oneof != null && typeof oneof === 'object') {
    for (const field of KNOWN_CONTENT_FIELDS) {
      if ((oneof as Record<string, unknown>)[field] != null) {
        return field;
      }
    }
  }
  return 'unknown';
}

function bytesToHex(bytes: Uint8Array<ArrayBuffer>): string {
  let hex = '';
  const max = Math.min(bytes.byteLength, 512);
  for (let i = 0; i < max; i += 1) {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  if (bytes.byteLength > max) {
    return `0x${hex}… (${bytes.byteLength} bytes)`;
  }
  return `0x${hex}`;
}

export function packetReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return bytesToHex(Uint8Array.from(value));
  }
  if (
    value != null &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'Buffer' &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return bytesToHex(Uint8Array.from((value as { data: Array<number> }).data));
  }
  return value;
}

function format(content: unknown): string {
  try {
    return JSON.stringify(content, packetReplacer, 2);
  } catch (error) {
    return `Could not serialize packet: ${String(error)}`;
  }
}

function snapshotEnvelope(envelope: PacketEnvelope): Record<string, unknown> {
  const {
    id,
    type,
    source,
    sourceServiceId,
    sourceDevice,
    destinationServiceId,
    updatedPni,
    timestamp,
    serverGuid,
    serverTimestamp,
    receivedAtCounter,
    receivedAtDate,
    messageAgeSec,
    groupId,
    urgent,
    story,
    unidentifiedDeliveryReceived,
    contentHint,
    reportingToken,
  } = envelope;

  return {
    id,
    type,
    typeName: type == null ? undefined : Proto.Envelope.Type[type],
    source,
    sourceServiceId,
    sourceDevice,
    destinationServiceId,
    updatedPni,
    timestamp,
    serverGuid,
    serverTimestamp,
    receivedAtCounter,
    receivedAtDate,
    messageAgeSec,
    groupId,
    urgent,
    story,
    unidentifiedDeliveryReceived,
    contentHint,
    reportingToken,
  };
}

export function recordPacket(
  direction: PacketDirection,
  content: unknown,
  envelope?: PacketEnvelope
): void {
  try {
    packets.push({
      direction,
      at: Date.now(),
      type: deriveType(content),
      json: format(
        envelope
          ? {
              envelope: snapshotEnvelope(envelope),
              content,
            }
          : content
      ),
    });
    if (packets.length > MAX_PACKETS) {
      packets.splice(0, packets.length - MAX_PACKETS);
    }
  } catch {
    // Never let logging break the send/receive path.
  }
}

export function getPackets(): ReadonlyArray<PacketEntry> {
  return packets;
}

export function clearPackets(): void {
  packets.length = 0;
}
