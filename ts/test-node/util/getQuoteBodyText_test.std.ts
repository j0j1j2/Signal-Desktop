// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';

import type { ReadonlyMessageAttributesType } from '../../model-types.d.ts';
import { getQuoteBodyText } from '../../util/getQuoteBodyText.std.ts';

describe('getQuoteBodyText', () => {
  const i18n = ((key: string) => key) as never;

  it('uses preserved original text for deleted messages', () => {
    const messageAttributes = {
      body: undefined,
      deletedForEveryone: true,
      originalBody: 'message before delete',
    } as ReadonlyMessageAttributesType;

    assert.strictEqual(
      getQuoteBodyText({
        messageAttributes,
        id: null,
        i18n,
      }),
      'message before delete'
    );
  });

  it('uses deleted-message text when deleted messages have no preserved original text', () => {
    const messageAttributes = {
      body: undefined,
      deletedForEveryone: true,
      originalBody: undefined,
    } as ReadonlyMessageAttributesType;

    assert.strictEqual(
      getQuoteBodyText({
        messageAttributes,
        id: null,
        i18n,
      }),
      'icu:message--deletedForEveryone--deletedSuffix'
    );
  });
});
