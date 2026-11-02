import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const conversation = require('../../src/assistant-conversation.js');
const assistantClient = require('../../src/assistant-client.js');

test('session conversation store is scoped, bounded, and redacts common secrets and identifiers', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const store = conversation.create(storage);
  store.load('org-a:user-a');
  for (let index = 0; index < 25; index += 1) store.append(index % 2 ? 'assistant' : 'user', `turn ${index} ada@example.com 4111111111111111`);
  assert.equal(store.turns().length, 20);
  assert.match(store.turns().at(-1).text, /\[email\]/);
  assert.match(store.turns().at(-1).text, /\[redacted number\]/);
  store.load('org-a:user-b');
  assert.equal(store.turns().length, 0);
  assert.equal(values.size, 0, 'switching user scope removes the old scoped transcript');
});

test('assistant sends only the last ten bounded turns and capped transaction IDs', async () => {
  const calls = [];
  await assistantClient.send({ async request(...args) { calls.push(args); return { answer: 'Done.' }; } }, 'follow up', {
    context: { view: 'transactions', selectedTransactionIds: Array.from({ length: 12 }, (_, i) => `CAP-${i}`), filteredTransactionIds: ['CAP-F'] },
    history: Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `t${i}`.padEnd(900, 'x') })),
  });
  const body = calls[0][1].body;
  assert.equal(body.history.length, 10);
  assert.equal(body.history[0].text.length, 800);
  assert.equal(body.context.selectedTransactionIds.length, 10);
  assert.deepEqual(body.context.filteredTransactionIds, ['CAP-F']);
});
