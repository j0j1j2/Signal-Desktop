// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';
import type { ReadonlyDeep } from 'type-fest';
import type {
  DonationCurrencyRecommendation,
  OneTimeDonationHumanAmounts,
} from '../types/Donations.std.ts';
import { humanDonationAmountSchema } from '../types/Donations.std.ts';
import { parseUnknown } from './schemas.std.ts';

const FRANKFURTER_RATES_URL = 'https://api.frankfurter.dev/v2/rates';

const exchangeRateSchema = z.object({
  date: z.string(),
  base: z.string(),
  quote: z.string(),
  rate: z.number().positive(),
});

const exchangeRatesSchema = z.array(exchangeRateSchema);

export type DonationExchangeRate = z.infer<typeof exchangeRateSchema>;

export function getDonationExchangeRatesUrl({
  baseCurrency,
  currencies,
}: {
  baseCurrency: string;
  currencies: ReadonlyArray<string>;
}): URL | undefined {
  const normalizedBase = baseCurrency.toUpperCase();
  const quotes = Array.from(
    new Set(currencies.map(currency => currency.toUpperCase()))
  )
    .filter(currency => currency !== normalizedBase)
    .toSorted();

  if (quotes.length === 0) {
    return undefined;
  }

  const url = new URL(FRANKFURTER_RATES_URL);
  url.searchParams.set('base', normalizedBase);
  url.searchParams.set('quotes', quotes.join(','));

  return url;
}

export function parseDonationExchangeRates(
  value: unknown
): ReadonlyArray<DonationExchangeRate> {
  return parseUnknown(exchangeRatesSchema, value);
}

export function getCheapestDonationCurrency({
  baseCurrency,
  donationAmountsConfig,
  exchangeRates,
}: {
  baseCurrency: string;
  donationAmountsConfig: ReadonlyDeep<OneTimeDonationHumanAmounts>;
  exchangeRates: ReadonlyArray<DonationExchangeRate>;
}): DonationCurrencyRecommendation | undefined {
  const normalizedBase = baseCurrency.toLowerCase();
  const ratesByCurrency = new Map(
    exchangeRates
      .filter(rate => rate.base.toLowerCase() === normalizedBase)
      .map(rate => [rate.quote.toLowerCase(), rate] as const)
  );

  let recommendation: DonationCurrencyRecommendation | undefined;

  for (const [currency, { minimum }] of Object.entries(donationAmountsConfig)) {
    const normalizedCurrency = currency.toLowerCase();
    const exchangeRate = ratesByCurrency.get(normalizedCurrency);

    let convertedMinimum: number;
    let rateDate: string;
    if (normalizedCurrency === normalizedBase) {
      convertedMinimum = minimum;
      rateDate = new Date().toISOString().slice(0, 10);
    } else if (exchangeRate) {
      // Frankfurter returns quote-currency units per one base-currency unit.
      convertedMinimum = minimum / exchangeRate.rate;
      rateDate = exchangeRate.date;
    } else {
      continue;
    }

    const candidate: DonationCurrencyRecommendation = {
      currency: normalizedCurrency,
      minimumAmount: minimum,
      baseCurrency: normalizedBase,
      convertedMinimumAmount: humanDonationAmountSchema.parse(convertedMinimum),
      rateDate,
    };

    if (
      recommendation == null ||
      candidate.convertedMinimumAmount <
        recommendation.convertedMinimumAmount ||
      (candidate.convertedMinimumAmount ===
        recommendation.convertedMinimumAmount &&
        candidate.currency < recommendation.currency)
    ) {
      recommendation = candidate;
    }
  }

  return recommendation;
}
