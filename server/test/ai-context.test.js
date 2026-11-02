import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAIContext } from '../src/ai/contextResolver.js';
import { AIConversationMemoryRepo } from '../src/repos/aiMemory.js';
import { cacheKeyFor, createAIService } from '../src/services/ai.js';

test('follow-up resolver uses focus and prior filters without guessing ambiguous references', () => {
  const memory = { turns: [{ role: 'user', text: 'Show transactions this month' }], focus: { recordIds: ['CAP-1', 'CAP-2'] } };
  assert.deepEqual(resolveAIContext('explain that', memory), { message: 'Explain transaction CAP-1', unresolved: false, focusId: 'CAP-1' });
  assert.deepEqual(resolveAIContext('explain that one', memory), { message: 'Explain transaction CAP-1', unresolved: false, focusId: 'CAP-1' });
  assert.equal(resolveAIContext('same for refunds', memory).message, 'Show refunds this month');
  assert.equal(resolveAIContext('what about disputes?', memory).message, 'Show disputes this month');
  assert.equal(resolveAIContext('and last month?', memory).message, 'Show transactions last month');
  assert.equal(resolveAIContext('download it', memory).message, 'download record CAP-1');
  assert.equal(resolveAIContext('what about the refund one?', memory).focusId, 'CAP-1');
  assert.equal(resolveAIContext('explain that', { turns: [], focus: {} }).unresolved, true);
  assert.equal(resolveAIContext('the other one', memory).unresolved, true);
});

test('server conversation memory is isolated by org and user, expires idle sessions and caps turns', async () => {
  let now = 1000;
  const memory = new AIConversationMemoryRepo({ ttlMs: 100, maxTurns: 4, now: () => now });
  for (let index = 0; index < 6; index += 1) await memory.save('org-a', 'user-a', { focus: { recordIds: [`CAP-${index}`] }, turns: [{ role: 'user', text: `q${index}` }] });
  assert.deepEqual((await memory.get('org-a', 'user-a')).turns.map((turn) => turn.text), ['q2', 'q3', 'q4', 'q5']);
  assert.equal(await memory.get('org-b', 'user-a'), null);
  assert.equal(await memory.get('org-a', 'user-b'), null);
  now += 101;
  assert.equal(await memory.get('org-a', 'user-a'), null);
  assert.equal(memory.rows.size, 0);
});

test('AI follow-up is resolved before evidence and scoped record lookup; ambiguous requests use no provider call', async () => {
  const memory = new AIConversationMemoryRepo();
  const row = { id: 'CAP-1', source_type: 'capture', amount_minor: 1000, fee_minor: 100, net_minor: 900, currency: 'USD', status: 'COMPLETED', occurred_at: '2026-10-01T00:00:00Z' };
  const prompts = [];
  const repos = { ai: { memory }, async listTransactions(orgId) { assert.equal(orgId, 'org-a'); return [row]; }, async getTransactionById(orgId, id) { return orgId === 'org-a' && id === row.id ? row : null; } };
  const askAI = createAIService({ config: {}, repos, provider: { async generate({ prompt }) { prompts.push(prompt); return JSON.stringify({ reply: 'This recorded capture has a 1.00 USD amount.', evidence: ['CAP-1'], proposal: null }); } } });
  await askAI('Why did this fee change?', { orgId: 'org-a', userId: 'user-a', role: 'viewer' });
  await askAI('explain that', { orgId: 'org-a', userId: 'user-a', role: 'viewer' });
  assert.match(prompts[1], /Explain transaction CAP-1/);
  assert.equal((await askAI('explain that', { orgId: 'org-a', userId: 'user-b', role: 'viewer' })).unresolvedContext, true);
  assert.equal((await askAI('explain that', { orgId: 'org-b', userId: 'user-a', role: 'viewer' })).unresolvedContext, true);
  assert.equal(prompts.length, 2);
});

test('client grid selection becomes focus only after an org-scoped repository match', async () => {
  const memory = new AIConversationMemoryRepo();
  const row = { id: 'CAP-SELECTED', source_type: 'capture', amount_minor: 100, fee_minor: 0, net_minor: 100, currency: 'USD', status: 'COMPLETED', occurred_at: '2026-10-01T00:00:00Z' };
  const calls = [];
  const repos = { ai: { memory }, async listTransactions(orgId) { return orgId === 'org-a' ? [row] : []; }, async getTransactionsByIds(orgId, ids) { return orgId === 'org-a' && ids.includes(row.id) ? [row] : []; }, async getTransactionById(orgId, id) { return orgId === 'org-a' && id === row.id ? row : null; } };
  const askAI = createAIService({ config: {}, repos, provider: { async generate({ prompt }) { calls.push(prompt); return JSON.stringify({ reply: 'This capture is in the organization records.', evidence: ['CAP-SELECTED'], proposal: null }); } } });
  await askAI('explain that', { orgId: 'org-a', userId: 'owner-a', role: 'viewer' }, { context: { selection: row.id } });
  assert.match(calls[0], /Explain transaction CAP-SELECTED/);
  const other = await askAI('explain that', { orgId: 'org-b', userId: 'owner-b', role: 'viewer' }, { context: { selection: row.id } });
  assert.equal(other.unresolvedContext, true);
  assert.equal(calls.length, 1);
});

test('cache keys differ when the resolved focus record differs', () => {
  assert.notEqual(cacheKeyFor('org-a', 'llm', 'Explain transaction', 'v1', ['CAP-1']), cacheKeyFor('org-a', 'llm', 'Explain transaction', 'v1', ['CAP-2']));
});
