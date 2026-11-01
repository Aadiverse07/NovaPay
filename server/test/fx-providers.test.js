import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createFxService } from '../src/services/fx.js';
import { fxRoutes } from '../src/routes/fx.js';

function fixtureService({ failFrankfurter = false } = {}) {
  const rows = new Map(); const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(input); calls.push(url.hostname + url.pathname + url.search);
    if (url.hostname === 'api.frankfurter.dev') {
      if (url.pathname.endsWith('/currencies')) return response({ USD: 'US dollar', INR: 'Indian rupee', JPY: 'Japanese yen', KWD: 'Kuwaiti dinar' });
      if (failFrankfurter) return { ok: false, async json() { return {}; } };
      const base = url.searchParams.get('base'), quote = url.searchParams.get('symbols');
      const pairs = { 'INR:USD': '0.0105', 'USD:INR': '95.25', 'USD:JPY': '149.5', 'USD:KWD': '0.3075' };
      return response({ rates: { [quote]: pairs[`${base}:${quote}`] } });
    }
    if (url.hostname === 'open.er-api.com') {
      if (url.pathname === '/v6/latest/USD') return response({ result: 'success', rates: { INR: 95.25, JPY: 149.5, KWD: 0.3075 } });
      return response({ result: 'success', rates: { USD: 0.0105, INR: 1, JPY: 1.57, KWD: 0.0032 } });
    }
    throw new Error('unexpected provider');
  };
  const service = createFxService({ rates: { async get(_org, base, quote) { return rows.get(`${base}:${quote}`) || null; }, async put(row) { rows.set(`${row.base_currency}:${row.quote_currency}`, row); } }, fetchImpl, sleep: async () => {} });
  return { service, calls };
}
function response(body) { return { ok: true, async json() { return body; } }; }

test('live FX conversion covers both INR directions and zero/three-decimal currencies', async () => {
  const { service } = fixtureService();
  assert.equal((await service.convert({ orgId: 'org', amount: '100.00', base: 'INR', quote: 'USD' })).convertedAmount, '1.05 USD');
  assert.equal((await service.convert({ orgId: 'org', amount: '1.00', base: 'USD', quote: 'INR' })).convertedAmount, '95.25 INR');
  assert.equal((await service.convert({ orgId: 'org', amount: '1', base: 'USD', quote: 'JPY' })).convertedAmount, '150 JPY');
  assert.equal((await service.convert({ orgId: 'org', amount: '1.00', base: 'USD', quote: 'KWD' })).convertedAmount, '0.308 KWD');
});

test('same currency is identity, decimals are exact, and unknown codes are rejected', async () => {
  const { service } = fixtureService();
  const same = await service.convert({ orgId: 'org', amount: '12.34', base: 'INR', quote: 'INR' });
  assert.equal(same.rate, '1'); assert.equal(same.convertedAmount, '12.34 INR');
  assert.equal((await service.convert({ orgId: 'org', amount: '10.01', base: 'INR', quote: 'USD' })).convertedAmount, '0.11 USD');
  await assert.rejects(service.convert({ orgId: 'org', amount: '1', base: 'ZZZ', quote: 'USD' }), (error) => error.code === 'FX_CURRENCY_UNSUPPORTED');
  await assert.rejects(service.convert({ orgId: 'org', amount: '100000000000000', base: 'USD', quote: 'INR' }), (error) => error.code === 'FX_AMOUNT_INVALID');
});

test('provider fallback is used after primary failure and cached rates avoid another provider read', async () => {
  const { service, calls } = fixtureService({ failFrankfurter: true });
  const first = await service.convert({ orgId: 'org', amount: '2.00', base: 'USD', quote: 'INR' });
  assert.equal(first.source, 'open.er-api.com'); assert.equal(first.convertedAmount, '190.50 INR');
  const before = calls.length;
  await service.convert({ orgId: 'org', amount: '3.00', base: 'USD', quote: 'INR' });
  assert.equal(calls.length, before);
});

test('currency catalog merges provider support and includes currency names and exponents', async () => {
  const { service } = fixtureService(); const currencies = await service.currencies();
  const inr = currencies.find((item) => item.code === 'INR'), jpy = currencies.find((item) => item.code === 'JPY'), kwd = currencies.find((item) => item.code === 'KWD');
  assert.equal(inr.name, 'Indian rupee'); assert.equal(inr.exponent, 2); assert.equal(jpy.exponent, 0); assert.equal(kwd.exponent, 3);
  assert.equal(inr.providers.frankfurter, true); assert.equal(inr.providers.openErApi, true);
});

test('authenticated currency-list route returns merged currency metadata', async () => {
  const { service } = fixtureService(); const app = express();
  app.use((req, _res, next) => { req.user = { id: 'owner' }; req.orgId = 'org'; next(); });
  app.use('/api', fxRoutes({ fx: service }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/fx/currencies`), body = await response.json();
    assert.equal(response.status, 200); assert.ok(body.currencies.some((item) => item.code === 'INR' && item.exponent === 2));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('authenticated Reports converter fetches both currency options and conversion from API, not a fixed rate', async () => {
  const modules = await readFile(new URL('../../src/modules.js', import.meta.url), 'utf8');
  const authStart = modules.indexOf('async function updateFxLive()');
  const authBranchEnd = modules.indexOf('function scheduleFx()', authStart);
  const fxStart = modules.indexOf('fxResult.textContent="Loading rate…"', authStart);
  const authenticatedBlock = modules.slice(fxStart, authBranchEnd);
  assert.match(authenticatedBlock, /NovaPayApi\.request\("\/api\/fx\/currencies"\)/);
  assert.match(authenticatedBlock, /NovaPayApi\.request\("\/api\/fx\/convert\?/);
  assert.doesNotMatch(authenticatedBlock, /83\.333333|0\.012|Illustrative reference rate/);
  assert.match(modules, /if\(auth\.mode==="demo"\)[\s\S]*?demoRate=/);
});
