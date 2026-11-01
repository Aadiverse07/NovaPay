import { currencyMinorUnitExponent, decimalAmountToMinor, formatMinorAmount } from '../ai/money-units.js';

export const FX_LABEL = 'indicative, not a guaranteed settlement rate';
const RATE_TTL_MS = 6 * 60 * 60 * 1000;
const PROVIDER_MIN_INTERVAL_MS = 1000;
const ISO_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

function decimalParts(value) {
  const text = String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,15})?$/.test(text)) throw new Error('Invalid decimal rate.');
  const [whole, fraction = ''] = text.split('.');
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
}

function multiplyRates(left, right) {
  const a = decimalParts(left), b = decimalParts(right);
  const numerator = a.numerator * b.numerator, denominator = a.denominator * b.denominator;
  const scale = 10n ** 12n;
  const scaled = (numerator * scale + denominator / 2n) / denominator;
  const whole = scaled / scale, fraction = String(scaled % scale).padStart(12, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function convertMinorUnits(amountMinor, rateText, baseExponent = 2, quoteExponent = 2) {
  if (!/^\d+$/.test(String(amountMinor)) || BigInt(amountMinor) < 0n || !Number.isInteger(baseExponent) || !Number.isInteger(quoteExponent) || baseExponent < 0 || quoteExponent < 0) throw new Error('Invalid amount.');
  const { numerator, denominator } = decimalParts(rateText);
  const quoteScale = 10n ** BigInt(quoteExponent), baseScale = 10n ** BigInt(baseExponent);
  const scaledDenominator = denominator * baseScale;
  const product = BigInt(amountMinor) * numerator * quoteScale;
  const rounded = (product + scaledDenominator / 2n) / scaledDenominator;
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error('Converted amount is too large.');
  return result;
}

export function createFxService({ rates, fetchImpl = fetch, now = () => Date.now(), providerBase = 'https://api.frankfurter.dev/v1', fallbackBase = 'https://open.er-api.com/v6', sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  let nextProviderCallAt = 0, currencyCache = null, currencyCacheAt = 0;
  const inFlight = new Map();

  async function throttle() {
    const current = now(), slot = Math.max(current, nextProviderCallAt);
    nextProviderCallAt = slot + PROVIDER_MIN_INTERVAL_MS;
    if (slot > current) await sleep(slot - current);
  }

  async function jsonWithRetry(url) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      await throttle();
      try {
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('provider_http_error');
        const body = await response.json();
        if (!body || typeof body !== 'object') throw new Error('provider_invalid_json');
        return body;
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('provider_unavailable');
  }

  async function currencyList() {
    if (currencyCache && now() - currencyCacheAt < RATE_TTL_MS) return currencyCache;
    const [primaryResult, fallbackResult] = await Promise.allSettled([
      jsonWithRetry(`${providerBase}/currencies`),
      jsonWithRetry(`${fallbackBase}/latest/USD`),
    ]);
    const primary = primaryResult.status === 'fulfilled' ? primaryResult.value : null;
    const fallback = fallbackResult.status === 'fulfilled' ? fallbackResult.value : null;
    if (!primary && !fallback) throw Object.assign(new Error('Currency providers are unavailable.'), { statusCode: 503, code: 'FX_CURRENCIES_UNAVAILABLE' });
    const codes = new Set();
    if (primary && typeof primary === 'object') Object.keys(primary).forEach((code) => codes.add(code.toUpperCase()));
    Object.keys(fallback?.rates || {}).forEach((code) => codes.add(code.toUpperCase()));
    codes.add('USD');
    const displayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
    currencyCache = [...codes].filter((code) => ISO_CURRENCIES.has(code)).sort().map((code) => ({
      code,
      name: primary?.[code] || displayNames.of(code) || code,
      exponent: currencyMinorUnitExponent(code),
      providers: { frankfurter: Boolean(primary?.[code]), openErApi: code === 'USD' || Object.hasOwn(fallback?.rates || {}, code) },
    }));
    currencyCacheAt = now();
    return currencyCache;
  }

  async function knownCurrency(code) {
    const upper = String(code || '').toUpperCase();
    if (!ISO_CURRENCIES.has(upper) || currencyMinorUnitExponent(upper) === null) return false;
    return ISO_CURRENCIES.has(upper) && currencyMinorUnitExponent(upper) !== null;
  }

  async function providerRate(provider, base, quote) {
    if (provider === 'Frankfurter') {
      const url = new URL(`${providerBase}/latest`); url.searchParams.set('base', base); url.searchParams.set('symbols', quote);
      const body = await jsonWithRetry(url);
      const value = body?.rates?.[quote];
      if (value && /^(?:0|[1-9]\d*)(?:\.\d{1,15})?$/.test(String(value))) return String(value);
      throw new Error('pair_unsupported');
    }
    const direct = await jsonWithRetry(`${fallbackBase}/latest/${encodeURIComponent(base)}`);
    const directRate = direct?.rates?.[quote];
    if (direct?.result === 'success' && directRate && /^(?:0|[1-9]\d*)(?:\.\d{1,15})?$/.test(String(directRate))) return String(directRate);
    if (base !== 'USD' && quote !== 'USD') {
      const [toUsd, fromUsd] = await Promise.all([
        jsonWithRetry(`${fallbackBase}/latest/${encodeURIComponent(base)}`),
        jsonWithRetry(`${fallbackBase}/latest/USD`),
      ]);
      const left = toUsd?.rates?.USD, right = fromUsd?.rates?.[quote];
      if (toUsd?.result === 'success' && fromUsd?.result === 'success' && left && right) return multiplyRates(String(left), String(right));
    }
    throw new Error('pair_unsupported');
  }

  async function rateFor(orgId, base, quote) {
    if (base === quote) return { rate: '1', source: 'identity', timestamp: new Date(now()).toISOString() };
    const cached = await rates.get(orgId, base, quote);
    if (cached && now() - Date.parse(cached.fetched_at) < RATE_TTL_MS) return { rate: String(cached.rate), source: cached.source, timestamp: cached.fetched_at };
    const key = `${orgId}:${base}:${quote}`;
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = (async () => {
      let rate, source, lastError;
      try { rate = await providerRate('Frankfurter', base, quote); source = 'Frankfurter (ECB reference)'; }
      catch (error) {
        lastError = error;
        try { rate = await providerRate('open.er-api.com', base, quote); source = base !== 'USD' && quote !== 'USD' ? 'open.er-api.com (USD cross rate)' : 'open.er-api.com'; }
        catch { throw Object.assign(new Error('No exchange rate is available for this currency pair.'), { statusCode: 503, code: 'FX_PAIR_UNAVAILABLE', cause: lastError }); }
      }
      const fetchedAt = new Date(now()).toISOString();
      await rates.put({ org_id: orgId, base_currency: base, quote_currency: quote, rate: String(rate), fetched_at: fetchedAt, source });
      return { rate: String(rate), source, timestamp: fetchedAt };
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  }

  async function convert({ orgId, amount, base, quote }) {
    if (!(await knownCurrency(base)) || !(await knownCurrency(quote))) throw Object.assign(new Error('Choose a supported ISO currency code.'), { statusCode: 400, code: 'FX_CURRENCY_UNSUPPORTED' });
    let amountMinor;
    try { amountMinor = decimalAmountToMinor(amount, base); }
    catch { throw Object.assign(new Error('Amount is invalid for the selected currency.'), { statusCode: 400, code: 'FX_AMOUNT_INVALID' }); }
    if (amountMinor <= 0n || amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) throw Object.assign(new Error('Enter a positive amount within the supported limit.'), { statusCode: 400, code: 'FX_AMOUNT_INVALID' });
    const rate = await rateFor(orgId, base, quote);
    const convertedMinor = convertMinorUnits(amountMinor, rate.rate, currencyMinorUnitExponent(base), currencyMinorUnitExponent(quote));
    return { amount: formatMinorAmount(amountMinor, base), baseCurrency: base, convertedAmount: formatMinorAmount(convertedMinor, quote), quoteCurrency: quote, rate: rate.rate, source: rate.source, timestamp: rate.timestamp, label: FX_LABEL, fees: [] };
  }

  async function recordPayPalRate(orgId, exchangeRate) {
    const base = String(exchangeRate?.source_currency || '').toUpperCase(), quote = String(exchangeRate?.target_currency || '').toUpperCase(), rate = String(exchangeRate?.value || '');
    if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote) || base === quote) return false;
    decimalParts(rate);
    await rates.put({ org_id: orgId, base_currency: base, quote_currency: quote, rate, fetched_at: new Date(now()).toISOString(), source: 'PayPal capture' });
    return true;
  }

  return { convert, rateFor, recordPayPalRate, currencies: currencyList };
}
