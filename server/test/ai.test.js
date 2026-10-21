import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAIResponse, EMPTY_REPLY, UNSAFE_REPLY } from '../src/services/ai.js';

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
