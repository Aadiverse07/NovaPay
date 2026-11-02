import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantContextSchema, chatSchema } from '../src/routes/ai.js';

test('AI chat accepts ten history turns of 800 characters and bounded transaction context', () => {
  const valid = chatSchema.safeParse({ message: 'Question', history: Array.from({ length: 10 }, () => ({ role: 'user', text: 'x'.repeat(800) })), context: { view: 'transactions', selection: 'CAP-1', selectedTransactionIds: Array(10).fill('CAP-1'), filteredTransactionIds: [] } });
  assert.equal(valid.success, true);
  assert.equal(chatSchema.safeParse({ message: 'Question', history: Array(11).fill({ role: 'user', text: 'x' }) }).success, false);
  assert.equal(chatSchema.safeParse({ message: 'Question', history: [{ role: 'user', text: 'x'.repeat(801) }] }).success, false);
  assert.equal(chatSchema.safeParse({ message: 'Question', context: { selection: 'CAP-1', rawGridFilterModel: {} } }).success, true, 'legacy context remains accepted but is not forwarded');
  assert.equal(assistantContextSchema.safeParse({ selectedTransactionIds: Array(11).fill('CAP-1') }).success, false);
  assert.equal(assistantContextSchema.safeParse({ selectedTransactionIds: Array(10).fill('CAP-1'), filteredTransactionIds: [] }).success, true);
});
