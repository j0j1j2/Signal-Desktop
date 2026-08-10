// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  clearPackets,
  getPackets,
  recordPacket,
} from '../../util/packetLog.std.ts';

describe('packetLog', () => {
  afterEach(() => {
    clearPackets();
  });

  it('includes incoming envelope metadata alongside decoded content', () => {
    const envelope = {
      id: 'envelope-id',
      type: 6,
      sourceServiceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceDevice: 2,
      destinationServiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      timestamp: 1234,
      serverGuid: 'server-guid',
      serverTimestamp: 5678,
      receivedAtCounter: 9,
      receivedAtDate: 6789,
      messageAgeSec: 3,
      urgent: true,
      story: false,
      unidentifiedDeliveryReceived: true,
      contentHint: 1,
      reportingToken: Uint8Array.from([0xab, 0xcd]),
      // These large/internal fields must not be copied into the packet snapshot.
      content: Uint8Array.from([1, 2, 3]),
      certificate: { private: 'value' },
    };
    const content = {
      content: {
        dataMessage: {
          body: 'hello',
        },
      },
    };

    recordPacket('in', content, envelope);

    const [entry] = getPackets();
    assert.exists(entry);
    const decoded = JSON.parse(entry.json) as {
      envelope: Record<string, unknown>;
      content: typeof content;
    };

    assert.deepEqual(decoded.content, content);
    assert.include(decoded.envelope, {
      id: 'envelope-id',
      type: 6,
      typeName: 'UNIDENTIFIED_SENDER',
      sourceServiceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceDevice: 2,
      destinationServiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      timestamp: 1234,
      serverGuid: 'server-guid',
      serverTimestamp: 5678,
      unidentifiedDeliveryReceived: true,
    });
    assert.strictEqual(decoded.envelope.reportingToken, '0xabcd');
    assert.notProperty(decoded.envelope, 'content');
    assert.notProperty(decoded.envelope, 'certificate');
  });

  it('keeps outgoing content snapshots unchanged without an envelope', () => {
    const content = {
      content: {
        typingMessage: {
          action: 1,
        },
      },
    };

    recordPacket('out', content);

    const [entry] = getPackets();
    assert.exists(entry);
    assert.deepEqual(JSON.parse(entry.json), content);
  });
});
