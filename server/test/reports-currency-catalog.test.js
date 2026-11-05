import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { fxPublicRoutes } from '../src/routes/fx.js';

const dashboard = await readFile(new URL('../../dashboard.html', import.meta.url), 'utf8');
const expectedCodes = ['AED','AFN','ARS','AUD','BDT','BHD','BRL','CAD','CHF','CLP','CNY','CZK','DKK','EGP','EUR','GBP','HKD','HUF','IDR','ILS','INR','IQD','JOD','JPY','KES','KRW','KWD','LKR','MAD','MXN','MYR','NGN','NOK','NPR','NZD','OMR','PHP','PKR','PLN','QAR','RUB','SAR','SEK','SGD','THB','TRY','TWD','TZS','UAH','USD','VND','ZAR'];
function optionValues(id) {
  const select = dashboard.match(new RegExp(`<select id="fx-${id}">([\\s\\S]*?)<\\/select>`));
  assert.ok(select, `#fx-${id} exists`);
  return [...select[1].matchAll(/<option value="([A-Z]{3})"([^>]*)>([^<]+)<\/option>/g)].map(([, code, attrs, label]) => ({ code, attrs, label }));
}

async function withPublicFx(fetchImpl, callback) {
  const app = express();
  app.use('/api', fxPublicRoutes({ currencyConverterUrl: 'https://currency.test', fetchImpl }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('Reports converter renders the full sorted catalog immediately with INR and USD defaults', () => {
  for (const id of ['from', 'to']) {
    const options = optionValues(id);
    assert.equal(options.length, expectedCodes.length);
    assert.deepEqual(options.map((item) => item.code), expectedCodes);
    assert.ok(options.every((item) => item.label.startsWith(`${item.code} - `)));
    assert.ok(options.every((item) => item.code !== 'IND'));
  }
  assert.match(optionValues('from').find((item) => item.code === 'INR').attrs, /selected/);
  assert.match(optionValues('to').find((item) => item.code === 'USD').attrs, /selected/);
});

test('Reports converter keeps its full static options when the live currency API fails', async () => {
  await withPublicFx(async () => ({ ok: false, status: 503, async json() { return { error: 'unavailable' }; } }), async (base) => {
    const response = await fetch(`${base}/api/fx/public/currencies`);
    assert.equal(response.status, 503);
    assert.equal(optionValues('from').length, 52);
    assert.equal(optionValues('to').length, 52);
  });
});

test('Reports converter refreshes its list from a successful live currency API response', async () => {
  const currencies = expectedCodes.map((code) => ({ code, name: optionValues('from').find((item) => item.code === code).label.split(' - ')[1], decimals: 2 }));
  await withPublicFx(async (input) => new Response(JSON.stringify(currencies), { status: 200, headers: { 'content-type': 'application/json' } }), async (base) => {
    const response = await fetch(`${base}/api/fx/public/currencies`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.currencies.length, 52);
    assert.deepEqual(body.currencies.map((item) => item.code), expectedCodes);
  });
});
