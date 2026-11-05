import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { validateQuery } from '../middleware/validate.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { currencyMinorUnitExponent } from '../ai/money-units.js';

const schema = z.object({
  amount: z.string().regex(/^\d{1,12}(?:\.\d{1,6})?$/),
  base: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  quote: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
}).strict().superRefine((value, context) => {
  const exponent = currencyMinorUnitExponent(value.base);
  const fractionLength = value.amount.split('.')[1]?.length || 0;
  if (exponent === null || fractionLength > exponent) context.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Amount precision exceeds the base currency minor units.' });
});

function createConverterProxy({ currencyConverterUrl, fetchImpl }) {
  const converterUrl = new URL(currencyConverterUrl);
  async function request(path) {
    let response;
    try {
      response = await fetchImpl(new URL(path, converterUrl), { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
    } catch {
      throw Object.assign(new Error('Currency converter service is temporarily unavailable.'), { statusCode: 503, code: 'FX_SERVICE_UNAVAILABLE' });
    }
    let body;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) throw Object.assign(new Error(body?.error || 'Currency converter service is temporarily unavailable.'), { statusCode: response.status >= 500 ? 503 : response.status, code: 'FX_SERVICE_ERROR' });
    return body;
  }
  async function currencies() {
    const items = await request('/api/currencies');
    if (!Array.isArray(items) || items.some((item) => !item || !/^[A-Z]{3}$/.test(item.code) || typeof item.name !== 'string' || !Number.isInteger(item.decimals))) throw Object.assign(new Error('Currency converter returned an invalid currency list.'), { statusCode: 502, code: 'FX_SERVICE_INVALID_RESPONSE' });
    return items.map((item) => ({ code: item.code, name: item.name, exponent: item.decimals, providers: { currencyConverter: true } }));
  }
  async function convert({ amount, base, quote }) {
    const url = new URL('/api/convert', converterUrl);
    url.search = new URLSearchParams({ amount, from: base, to: quote }).toString();
    const result = await request(url.pathname + url.search);
    if (!result || result.from !== base || result.to !== quote || typeof result.result !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(result.result) || !Number.isFinite(Number(result.rate)) || !result.rateAsOf) throw Object.assign(new Error('Currency converter returned an invalid conversion.'), { statusCode: 502, code: 'FX_SERVICE_INVALID_RESPONSE' });
    return { amount, baseCurrency: base, convertedAmount: `${result.result} ${quote}`, quoteCurrency: quote, rate: String(result.rate), source: String(result.source || 'Currency converter'), timestamp: result.rateAsOf, label: 'indicative, not a guaranteed settlement rate', fees: [] };
  }
  return { currencies, convert };
}

function registerCurrencyProxyRoutes(router, proxy, prefix) {
  router.get(`${prefix}/currencies`, async (_req, res) => {
    try { return res.json({ currencies: await proxy.currencies(), cachedForSeconds: 21600 }); }
    catch (error) { return res.status(error.statusCode || 503).json(structuredErrorBody(error.code || 'FX_CURRENCIES_UNAVAILABLE', error.message || 'Currency providers are unavailable.')); }
  });
  router.get(`${prefix}/convert`, validateQuery(schema), async (req, res, next) => {
    try { return res.json(await proxy.convert(req.validatedQuery)); }
    catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json(structuredErrorBody(error.code || 'FX_FAILED', error.message));
      return next(error);
    }
  });
}

export function fxPublicRoutes({ currencyConverterUrl = 'https://currency-4mff.onrender.com', fetchImpl = fetch } = {}) {
  const router = Router();
  router.use('/fx/public', rateLimit({ windowMs: 60 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  registerCurrencyProxyRoutes(router, createConverterProxy({ currencyConverterUrl, fetchImpl }), '/fx/public');
  return router;
}

export function fxRoutes({ fx, currencyConverterUrl = 'https://currency-4mff.onrender.com', fetchImpl = fetch }) {
  const router = Router();
  const proxy = createConverterProxy({ currencyConverterUrl, fetchImpl });
  router.use('/fx', rateLimit({ windowMs: 60 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (req) => `${req.user.id}:${req.orgId}`, message: { error: { code: 'FX_RATE_LIMITED', message: 'Currency requests are temporarily rate limited.' } } }));
  registerCurrencyProxyRoutes(router, proxy, '/fx');
  return router;
}
