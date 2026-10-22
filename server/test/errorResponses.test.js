import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyErrorBody, structuredErrorBody } from '../src/middleware/errorResponses.js';

test('legacy Phase 0 error keeps its string and adds a sibling route/status code', () => {
  assert.deepEqual(legacyErrorBody('POST', '/api/paypal/create-order', 400, 'Keep this exact message.'), {
    error: 'Keep this exact message.',
    code: 'LEGACY_POST_API_PAYPAL_CREATE_ORDER_400',
  });
});

test('new Phase 1 errors use the structured error object shape', () => {
  assert.deepEqual(structuredErrorBody('VALIDATION_ERROR', 'Amount is invalid.'), {
    error: { code: 'VALIDATION_ERROR', message: 'Amount is invalid.' },
  });
});
