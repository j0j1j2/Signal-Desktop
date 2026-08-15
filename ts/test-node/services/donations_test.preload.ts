// Copyright 2025 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import { phoneNumberToCurrencyCode } from '../../services/donations.preload.ts';
import { subscriptionConfigurationResultZod } from '../../textsecure/WebAPI.preload.ts';

describe('donations', () => {
  describe('phoneNumberToCurrency', () => {
    it('handles US phone number', async () => {
      assert.strictEqual(phoneNumberToCurrencyCode('+18055550000'), 'USD');
    });
    it('handles Canada phone number', async () => {
      assert.strictEqual(phoneNumberToCurrencyCode('+17805550000'), 'CAD');
    });
    it('handles Puerto Rico phone number', async () => {
      assert.strictEqual(phoneNumberToCurrencyCode('+17875550000'), 'USD');
    });
    it('handles Guam phone number', async () => {
      assert.strictEqual(phoneNumberToCurrencyCode('+16715550000'), 'USD');
    });
    it('handles Aruba phone number', async () => {
      assert.strictEqual(phoneNumberToCurrencyCode('+2972870550'), 'AWG');
    });
    it('handles New Zealand phone number', async () => {
      assert.strictEqual(phoneNumberToCurrencyCode('+6492221111;'), 'NZD');
    });
  });

  describe('subscription configuration', () => {
    it('accepts levels without the removed top-level name field', () => {
      const result = subscriptionConfigurationResultZod.safeParse({
        currencies: {
          krw: {
            minimum: 4000,
            oneTime: { '1': [5000, 10000] },
            supportedPaymentMethods: ['CARD'],
          },
        },
        levels: {
          '1': {
            badge: {
              category: 'donor',
              description: 'Support Signal',
              id: 'BOOST',
              name: 'Signal Boost',
              svg: 'boost.svg',
              svgs: [
                { light: 'small-light.svg', dark: 'small-dark.svg' },
                { light: 'medium-light.svg', dark: 'medium-dark.svg' },
                { light: 'large-light.svg', dark: 'large-dark.svg' },
              ],
            },
          },
        },
      });

      assert.isTrue(result.success);
    });
  });
});
