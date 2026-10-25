import { moneyToMinor, minorToMoney } from '../repos/postgres.js';

export const FX_LABEL = 'indicative, not a guaranteed settlement rate';
const RATE_TTL_MS = 24 * 60 * 60 * 1000;
const PROVIDER_MIN_INTERVAL_MS = 1000;

function decimalParts(value) {
  const text = String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,15})?$/.test(text)) throw new Error('Invalid decimal rate.');
  const [whole, fraction = ''] = text.split('.');
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
}

export function convertMinorUnits(amountMinor, rateText) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('Invalid amount.');
  const { numerator, denominator } = decimalParts(rateText);
  const product = BigInt(amountMinor) * numerator;
  const rounded = (product + denominator / 2n) / denominator;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error('Converted amount is too large.');
  return result;
}

export function createFxService({ rates, fetchImpl = fetch, now = () => Date.now(), providerBase = 'https://api.frankfurter.dev/v1', sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  let nextProviderCallAt = 0;
  const inFlight = new Map();

  async function rateFor(orgId, base, quote) {
    if (base === quote) return { rate: '1', source: 'identity', timestamp: new Date(now()).toISOString() };
    const cached = await rates.get(orgId, base, quote);
    if (cached && now() - Date.parse(cached.fetched_at) < RATE_TTL_MS) {
      return { rate: String(cached.rate), source: cached.source, timestamp: cached.fetched_at };
    }
    const key = `${orgId}:${base}:${quote}`;
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = (async () => {
      // Reserve the next slot before awaiting so concurrent pairs cannot share a slot.
      const current = now();
      const slot = Math.max(current, nextProviderCallAt);
      nextProviderCallAt = slot + PROVIDER_MIN_INTERVAL_MS;
      const wait = slot - current;
      if (wait) await sleep(wait);
      const url = new URL(`${providerBase}/latest`);
      url.searchParams.set('base', base);
      url.searchParams.set('symbols', quote);
      let response;
      try { response = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } }); }
      catch { throw Object.assign(new Error('The exchange-rate provider is unavailable.'), { statusCode: 503, code: 'FX_PROVIDER_UNAVAILABLE' }); }
      if (!response.ok) throw Object.assign(new Error('The exchange-rate provider did not return a rate.'), { statusCode: 503, code: 'FX_PROVIDER_UNAVAILABLE' });
      const data = await response.json().catch(() => null);
      const rate = data?.rates?.[quote];
      if (!rate || !/^(?:0|[1-9]\d*)(?:\.\d{1,15})?$/.test(String(rate))) throw Object.assign(new Error('The exchange-rate provider returned an invalid rate.'), { statusCode: 503, code: 'FX_RATE_INVALID' });
      const fetchedAt = new Date(now()).toISOString();
      const saved = { org_id: orgId, base_currency: base, quote_currency: quote, rate: String(rate), fetched_at: fetchedAt, source: 'Frankfurter' };
      await rates.put(saved);
      return { rate: String(rate), source: 'Frankfurter', timestamp: fetchedAt };
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }

  async function convert({ orgId, amount, base, quote }) {
    const amountMinor = moneyToMinor(amount);
    if (amountMinor <= 0) throw Object.assign(new Error('Amount must be greater than zero.'), { statusCode: 400, code: 'FX_AMOUNT_INVALID' });
    const rate = await rateFor(orgId, base, quote);
    const convertedMinor = convertMinorUnits(amountMinor, rate.rate);
    return {
      amount: minorToMoney(amountMinor), baseCurrency: base,
      convertedAmount: minorToMoney(convertedMinor), quoteCurrency: quote,
      rate: rate.rate, source: rate.source, timestamp: rate.timestamp, label: FX_LABEL,
      fees: [],
    };
  }

  async function recordPayPalRate(orgId, exchangeRate) {
    const base = String(exchangeRate?.source_currency || '').toUpperCase();
    const quote = String(exchangeRate?.target_currency || '').toUpperCase();
    const rate = String(exchangeRate?.value || '');
    if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote) || base === quote) return false;
    decimalParts(rate);
    const fetchedAt = new Date(now()).toISOString();
    await rates.put({ org_id: orgId, base_currency: base, quote_currency: quote, rate, fetched_at: fetchedAt, source: 'PayPal capture' });
    return true;
  }

  return { convert, rateFor, recordPayPalRate };
}
