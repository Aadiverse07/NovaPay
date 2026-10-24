import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAIResponse, EMPTY_REPLY, UNSAFE_REPLY, sanitizeAIContext, redactSensitiveText, createAIService } from '../src/services/ai.js';

test('AI sanitizer safely handles malformed JSON', () => {
  assert.deepEqual(sanitizeAIResponse('{bad'), { reply: UNSAFE_REPLY, evidence: [], proposal: null });
});

test('AI sanitizer handles empty reply', () => {
  assert.deepEqual(sanitizeAIResponse('{"reply":"  ","evidence":["known"]}', { transactions: [{ id: 'known' }] }), { reply: EMPTY_REPLY, evidence: [], proposal: null });
});

test('AI sanitizer maps unknown proposal types to other', () => {
  assert.deepEqual(sanitizeAIResponse('{"reply":"Review this.","proposal":{"type":"execute-payment","txId":"known"}}', { transactions: [{ id: 'known' }] }), { reply: 'Review this.', evidence: [], proposal: { type: 'other', txId: 'known', title: 'AI suggestion', reason: 'No reason supplied.' } });
});

test('AI sanitizer removes foreign evidence IDs and keeps known IDs', () => {
  assert.deepEqual(sanitizeAIResponse('{"reply":"These records show the result.","evidence":["known","foreign","known"]}', { transactions: [{ id: 'known' }] }), { reply: 'These records show the result.', evidence: ['known', 'known'], proposal: null });
});

test('AI context drops buyer and unknown fields; user text redacts common sensitive values', async () => {
  const context = sanitizeAIContext({ transactions: [{ id: 'CAPTURE_123', type: 'Payment', status: 'COMPLETED', gross: '10.00', currency: 'USD', buyer: 'Ada Lovelace', email: 'ada@example.com', notes: 'private note' }] });
  assert.deepEqual(context, { transactions: [{ id: 'CAPTURE_123', type: 'Payment', status: 'COMPLETED', gross: '10.00', currency: 'USD' }] });
  const redacted = redactSensitiveText('Contact ada@example.com at +1 (415) 555-0123; card 4111 1111 1111 1111');
  assert.doesNotMatch(redacted, /ada@example|415|4111/);
  assert.match(redacted, /\[REDACTED_EMAIL\]/);
  let prompt = '';
  const askAI = createAIService({ config: {}, events: null, provider: { async generate(input) { prompt = input.prompt; return '{"reply":"safe","evidence":[],"proposal":null}'; } } });
  await askAI('Is ada@example.com linked to this payment?', { transactions: [{ id: 'CAPTURE_123', buyer: 'Ada Lovelace' }] });
  assert.doesNotMatch(prompt, /ada@example|Ada Lovelace/);
});

test('PII redaction masks Unicode names, addresses, phone, account/card numbers, and tokens without near-match over-redaction', () => {
  const source = 'José Núñez at 17 Main Street called +1 (415) 555-0123; acct 1234 5678 9012 3456; token=secret-token-value. Annual totals include Annette.';
  const result = redactSensitiveText(source, ['José Núñez', 'Ann']);
  for (const value of ['José Núñez', 'Main Street', '415', '1234 5678', 'secret-token-value', 'Ann at']) assert.doesNotMatch(result, new RegExp(value));
  assert.match(result, /\[REDACTED_PERSON\]/);
  assert.match(result, /\[REDACTED_ADDRESS\]/);
  assert.match(result, /\[REDACTED_PHONE\]/);
  assert.match(result, /\[REDACTED_ACCOUNT_OR_CARD\]/);
  assert.match(result, /\[REDACTED_TOKEN\]/);
  assert.match(result, /Annette/);
  assert.match(result, /Annual/);
});
