import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/novapay-live.js', import.meta.url), 'utf8');
const helperSource = source.match(/function readableError\(error,action\)\{[\s\S]*?\n  \}/)?.[0];
assert.ok(helperSource, 'readableError helper should be defined');
const readableError = vm.runInNewContext(`(${helperSource})`);

test('structured API errors render a readable message, never [object Object]', () => {
  const message = readableError({ error: { code: 'PAYPAL_UNAVAILABLE', message: 'PayPal Sandbox is unavailable.' } });
  assert.equal(message, 'PayPal Sandbox is unavailable.');
  assert.notEqual(message, '[object Object]');
});

test('PayPal role and organization errors are translated into plain language', () => {
  assert.equal(readableError({ code: 'ROLE_FORBIDDEN' }, 'create order'), "Your role can't create orders.");
  assert.equal(readableError({ code: 'ORG_HEADER_REQUIRED' }), 'Choose an organization first.');
  assert.equal(readableError({ code: 'ORG_FORBIDDEN' }), "You don't have access to this organization.");
});

test('authenticated PayPal, approval and event calls use NovaPayApi while status stays public', () => {
  assert.match(source, /window\.NovaPayApi\.request\(path,/);
  assert.match(source, /if\(path==="\/api\/status"\)return fetch\(path\)/);
  for (const path of ['/api/paypal/create-order', '/api/paypal/capture', '/api/paypal/refund', '/api/approvals/register', '/api/events']) {
    assert.ok(source.includes(`api("${path}`), `expected ${path} to use api helper`);
  }
});
