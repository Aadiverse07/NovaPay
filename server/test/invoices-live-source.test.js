import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../../src/invoices-live.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../dashboard.html', import.meta.url), 'utf8');

test('invoice list waits for Supabase auth and loads only organization API data', () => {
  assert.match(source, /if \(auth && auth\.ready\) await auth\.ready/);
  assert.match(source, /auth\.mode !== "supabase" \|\| !auth\.isAuthenticated\(\)/);
  assert.match(source, /api\.request\("\/api\/invoices\?limit=100"\)/);
  assert.match(source, /document\.addEventListener\("novapay:auth", load\)/);
  assert.doesNotMatch(source, /sampleInvoice|illustrativeInvoice|seedInvoices/i);
});

test('invoice loading and errors never present placeholder zeros as organization totals and expose Retry', () => {
  assert.match(source, /function setKpisUnavailable\(\)/);
  assert.match(source, /node\.textContent = "—"/);
  assert.match(source, /Invoice data could not be loaded\./);
  assert.match(source, /retry\.hidden = false/);
  assert.match(html, /id="invoice-live-retry"/);
  assert.match(source, /No invoices in this organization yet\./);
});
