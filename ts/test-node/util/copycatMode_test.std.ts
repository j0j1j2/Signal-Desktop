// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import {
  formatCopycatMessage,
  getCopycatSourceBody,
  isCopycatMessageBody,
  isCopycatSource,
} from '../../util/copycatMode.std.ts';

describe('copycatMode', () => {
  const targetServiceId = 'target-service-id';

  it('accepts incoming text only from the selected sender', () => {
    assert.isTrue(
      isCopycatSource({
        isViewOnce: false,
        messageType: 'incoming',
        sourceServiceId: targetServiceId,
        targetServiceId,
      })
    );
    assert.isFalse(
      isCopycatSource({
        isViewOnce: true,
        messageType: 'incoming',
        sourceServiceId: targetServiceId,
        targetServiceId,
      })
    );

    assert.strictEqual(
      getCopycatSourceBody({
        body: ' hello ',
        isViewOnce: false,
        messageType: 'incoming',
        sourceServiceId: targetServiceId,
        targetServiceId,
      }),
      'hello'
    );

    for (const overrides of [
      { messageType: 'outgoing' },
      { sourceServiceId: 'someone-else' },
      { isViewOnce: true },
      { body: '   ' },
    ]) {
      assert.isUndefined(
        getCopycatSourceBody({
          body: 'hello',
          isViewOnce: false,
          messageType: 'incoming',
          sourceServiceId: targetServiceId,
          targetServiceId,
          ...overrides,
        })
      );
    }
  });

  it('formats the repeated message and prevents loops', () => {
    const body = formatCopycatMessage('  Alice   Example  ', 'hello');
    assert.strictEqual(body, '[Alice Example]: hello\u2063');
    assert.isTrue(isCopycatMessageBody(body));
    assert.isFalse(isCopycatMessageBody('[Alice Example]: hello'));
    assert.isUndefined(
      getCopycatSourceBody({
        body,
        isViewOnce: false,
        messageType: 'incoming',
        sourceServiceId: targetServiceId,
        targetServiceId,
      })
    );
  });
});
