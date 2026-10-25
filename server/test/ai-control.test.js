import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIService, AI_DAILY_LIMIT_REPLY, AI_INPUT_LIMIT_REPLY } from '../src/services/ai.js';
import { createRepositories } from '../src/repos/memory.js';

const capture = (id, fee = '1.00') => ({ id, value: '10.00', fee, net: '9.00', currency: 'USD', status: 'COMPLETED', occurredAt: '2026-10-24T00:00:00Z' });
const answerFor = (fee = '1.00') => JSON.stringify({ reply: `The fee was $${fee}.`, evidence: ['CAP-1'], proposal: null });

function setup({ userLimit = 5, orgLimit = 20, maxInput = 1000, ttl = 300, onGenerate } = {}) {
  const repos = createRepositories();
  repos.captures.add(capture('CAP-1'), 'org-a');
  repos.captures.add(capture('CAP-1'), 'org-b');
  let calls = 0;
  const provider = { async generate(input) { calls += 1; return onGenerate ? onGenerate(input, calls) : { text: answerFor(), model: 'fake-model', usage: { inputTokens: 4, outputTokens: 3 } }; } };
  const askAI = createAIService({
    config: { AI_DAILY_USER_LIMIT: userLimit, AI_DAILY_ORG_LIMIT: orgLimit, AI_MAX_INPUT_CHARS: maxInput, AI_MAX_OUTPUT_TOKENS: 80, AI_CACHE_TTL_SECONDS: ttl, resolvedLLMModel: 'gemini-3.5-flash-lite' },
    repos, provider,
  });
  return { askAI, repos, calls: () => calls };
}

test('daily user budget blocks a second distinct provider request with zero second call', async () => {
  const state = setup({ userLimit: 1 });
  const first = await state.askAI('Why did we pay this fee?', { orgId: 'org-a', userId: 'user-a' });
  const second = await state.askAI('Explain this fee another way', { orgId: 'org-a', userId: 'user-a' });
  assert.equal(first.insufficientEvidence, false);
  assert.equal(second.limited, true);
  assert.equal(second.code, 'AI_USER_DAILY_LIMIT');
  assert.equal(second.reply, AI_DAILY_LIMIT_REPLY);
  assert.equal(state.calls(), 1);
});

test('concurrent reservations cannot exceed the organization budget', async () => {
  const state = setup({ orgLimit: 1 });
  const results = await Promise.all([
    state.askAI('Why did we pay this fee?', { orgId: 'org-a', userId: 'user-a' }),
    state.askAI('Explain the recorded fee please', { orgId: 'org-a', userId: 'user-b' }),
  ]);
  assert.equal(results.filter((row) => row.limited).length, 1);
  assert.equal(state.calls(), 1);
  assert.equal(state.repos.ai.usage.rows.filter((row) => !row.cacheHit).length, 1);
});

test('repeat safe answer is cached, but changed data version and another org miss', async () => {
  const state = setup();
  const first = await state.askAI('Why did we pay this fee?', { orgId: 'org-a', userId: 'user-a' });
  const repeated = await state.askAI(' WHY did we pay this   fee? ', { orgId: 'org-a', userId: 'user-b' });
  assert.equal(first.cached, false);
  assert.equal(repeated.cached, true);
  assert.equal(repeated.cacheHit, true);
  assert.equal(state.calls(), 1);
  assert.equal(state.repos.ai.usage.rows.at(-1).cacheHit, true);

  const otherOrg = await state.askAI('Why did we pay this fee?', { orgId: 'org-b', userId: 'user-a' });
  assert.equal(otherOrg.cached, false);
  assert.equal(state.calls(), 2);

  state.repos.captures.get('CAP-1', 'org-a').fee = '2.00';
  const changed = await state.askAI('Why did we pay this fee?', { orgId: 'org-a', userId: 'user-c' });
  assert.equal(changed.insufficientEvidence, true);
  assert.equal(state.calls(), 3);
});

test('proposals, insufficient evidence, expired cache and too-long input are not cached or sent', async () => {
  let response = JSON.stringify({ reply: 'Review this payment.', evidence: ['CAP-1'], proposal: { type: 'refund', txId: 'CAP-1' } });
  const state = setup({ ttl: 30, maxInput: 100, onGenerate: async () => ({ text: response, model: 'fake-model' }) });
  const context = { orgId: 'org-a', userId: 'user-a' };
  const proposal = await state.askAI('Consider a refund proposal', context);
  assert.ok(proposal.proposal);
  await state.askAI('Consider a refund proposal', context);
  assert.equal(state.calls(), 2);
  assert.equal([...state.repos.ai.cache.rows.values()].length, 0);

  const tooLong = await state.askAI('x'.repeat(101), context);
  assert.equal(tooLong.reply, AI_INPUT_LIMIT_REPLY);
  assert.equal(state.calls(), 2);

  response = JSON.stringify({ reply: 'The fee was $1.00.', evidence: ['CAP-1'], proposal: null });
  await state.askAI('Explain what this fee means and its amount', context);
  const beforeExpired = state.calls();
  const stored = [...state.repos.ai.cache.rows.values()][0];
  stored.expiresAt = new Date(Date.now() - 1000).toISOString();
  await state.askAI('Explain what this fee means and its amount', context);
  assert.equal(state.calls(), beforeExpired + 1);
});

test('daily usage resets at the UTC date boundary', async () => {
  const usage = setup({ userLimit: 1 }).repos.ai.usage;
  const first = await usage.reserve({ orgId: 'org-a', userId: 'user-a', route: 'retrieval', model: 'free', inputTokens: 1, userLimit: 1, orgLimit: 1, now: new Date('2026-10-24T23:59:59Z') });
  const nextDay = await usage.reserve({ orgId: 'org-a', userId: 'user-a', route: 'retrieval', model: 'free', inputTokens: 1, userLimit: 1, orgLimit: 1, now: new Date('2026-10-25T00:00:00Z') });
  assert.equal(first.allowed, true);
  assert.equal(nextDay.allowed, true);
});
