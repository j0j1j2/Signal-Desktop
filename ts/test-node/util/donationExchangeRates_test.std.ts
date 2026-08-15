// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { assert } from 'chai';
import { oneTimeDonationAmountsZod } from '../../types/Donations.std.ts';
import {
  getCheapestDonationCurrency,
  getDonationExchangeRatesUrl,
  parseDonationExchangeRates,
} from '../../util/donationExchangeRates.std.ts';

describe('donationExchangeRates', () => {
  it('builds a normalized Frankfurter URL and parses its response', () => {
    const requestedUrl = getDonationExchangeRatesUrl({
      baseCurrency: 'krw',
      currencies: ['usd', 'KRW', 'eur', 'usd'],
    });
    const rates = parseDonationExchangeRates([
      {
        date: '2026-08-14',
        base: 'KRW',
        quote: 'USD',
        rate: 0.00071,
      },
    ]);

    assert.strictEqual(requestedUrl?.origin, 'https://api.frankfurter.dev');
    assert.strictEqual(requestedUrl?.searchParams.get('base'), 'KRW');
    assert.strictEqual(requestedUrl?.searchParams.get('quotes'), 'EUR,USD');
    assert.lengthOf(rates, 1);
  });

  it('finds the lowest minimum after converting to the base currency', () => {
    const donationAmountsConfig = oneTimeDonationAmountsZod.parse({
      krw: {
        minimum: 4000,
        oneTime: { '1': [5000] },
        supportedPaymentMethods: ['CARD'],
      },
      usd: {
        minimum: 3,
        oneTime: { '1': [5] },
        supportedPaymentMethods: ['CARD'],
      },
      lbp: {
        minimum: 3000,
        oneTime: { '1': [6000] },
        supportedPaymentMethods: ['CARD'],
      },
    });

    const recommendation = getCheapestDonationCurrency({
      baseCurrency: 'krw',
      donationAmountsConfig,
      exchangeRates: [
        {
          date: '2026-08-14',
          base: 'KRW',
          quote: 'USD',
          rate: 0.00071,
        },
        {
          date: '2026-08-14',
          base: 'KRW',
          quote: 'LBP',
          rate: 63.5,
        },
      ],
    });

    assert.strictEqual(recommendation?.currency, 'lbp');
    assert.strictEqual(recommendation?.minimumAmount, 3000);
    assert.approximately(
      recommendation?.convertedMinimumAmount ?? 0,
      47.244,
      0.001
    );
    assert.strictEqual(recommendation?.baseCurrency, 'krw');
    assert.strictEqual(recommendation?.rateDate, '2026-08-14');
  });

  it('ignores donation currencies missing from the rate response', () => {
    const donationAmountsConfig = oneTimeDonationAmountsZod.parse({
      krw: {
        minimum: 4000,
        oneTime: { '1': [5000] },
        supportedPaymentMethods: ['CARD'],
      },
      xyz: {
        minimum: 1,
        oneTime: { '1': [1] },
        supportedPaymentMethods: ['CARD'],
      },
    });

    const recommendation = getCheapestDonationCurrency({
      baseCurrency: 'krw',
      donationAmountsConfig,
      exchangeRates: [],
    });

    assert.strictEqual(recommendation?.currency, 'krw');
  });
});
