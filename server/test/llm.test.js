import test from 'node:test';
import assert from 'node:assert/strict';
import { createAIService } from '../src/services/ai.js';
import { createFakeLLMAdapter, createGeminiAdapter, createLLMAdapter } from '../src/services/llm.js';

test('AI service calls the provider interface and preserves sanitization guardrails', async () => {
  const provider = createFakeLLMAdapter({ response: JSON.stringify({ reply: 'A supported result.', evidence: ['CAP-1', 'foreign'], proposal: null }) });
  const repos = { async listTransactions(orgId) { assert.equal(orgId, 'org-a'); return [{ id: 'CAP-1', source_id: 'PAYPAL-CAP-1', source_type: 'capture', amount_minor: 1000, currency: 'USD', status: 'COMPLETED', occurred_at: '2026-10-01T00:00:00Z' }]; }, async trialBalance() { return { balanced: true, totals: {} }; } };
  const askAI = createAIService({ config: {}, repos, provider });
  const result = await askAI('What happened?', { orgId: 'org-a', transactions: [{ id: 'CLIENT-ORG-B-RECORD' }] });
  assert.deepEqual(result, { reply: 'A supported result.', evidence: ['CAP-1'], proposal: null, insufficientEvidence: false });
  assert.equal(provider.calls.length, 1);
  assert.match(provider.calls[0].prompt, /What happened\?/);
  assert.match(provider.calls[0].prompt, /PAYPAL-CAP-1/);
  assert.doesNotMatch(provider.calls[0].prompt, /CLIENT-ORG-B-RECORD/);
  assert.match(provider.calls[0].system, /Never execute or call financial APIs/);
});

test('Gemini adapter falls back to the configured model after a primary failure', async () => {
  const requested = [];
  const adapter = createGeminiAdapter({
    apiKey: 'test-key', model: 'primary-model', fallbackModel: 'fallback-model',
    fetchImpl: async (url) => {
      requested.push(String(url));
      if (String(url).includes('primary-model')) return new Response('{"error":{"message":"private provider detail"}}', { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"reply":"fallback"}' }] } }] }), { status: 200 });
    },
  });
  const result = await adapter.generate({ system: 'system', prompt: 'question' });
  assert.equal(result.model, 'fallback-model');
  assert.equal(result.text, '{"reply":"fallback"}');
  assert.equal(requested.length, 2);
  assert.match(requested[0], /primary-model:generateContent/);
  assert.match(requested[1], /fallback-model:generateContent/);
});

test('Gemini adapter retries throttling once with bounded backoff, then uses one fallback', async () => {
  const requested = [];
  const waits = [];
  const adapter = createGeminiAdapter({
    apiKey: 'test-key', model: 'primary-model', fallbackModel: 'free-fallback', sleep: async (ms) => waits.push(ms),
    fetchImpl: async (url) => {
      requested.push(String(url));
      if (String(url).includes('primary-model')) return new Response('{"error":{"message":"secret response"}}', { status: 429 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"reply":"ok"}' }] } }] }), { status: 200 });
    },
  });
  const result = await adapter.generate({ system: 'system', prompt: 'question' });
  assert.equal(result.model, 'free-fallback');
  assert.equal(requested.length, 3);
  assert.deepEqual(waits, [120]);
});

test('Gemini adapter bounds timeouts, retries once, and never logs response bodies or API keys', async () => {
  let calls = 0;
  const logs = [];
  const adapter = createGeminiAdapter({
    apiKey: 'never-log-this-key', model: 'primary-model', timeoutMs: 5, sleep: async () => {},
    events: { addCall(value) { logs.push(value.m); } },
    fetchImpl: async () => { calls += 1; return new Promise(() => {}); },
  });
  await assert.rejects(adapter.generate({ system: 'system', prompt: 'question' }), /LLM provider/);
  assert.equal(calls, 2);
  assert.equal(logs.length, 2);
  assert.doesNotMatch(JSON.stringify(logs), /never-log-this-key|response body/);
});

test('Gemini adapter uses the fallback once for malformed and empty provider responses', async () => {
  const requested = [];
  const adapter = createGeminiAdapter({
    apiKey: 'test-key', model: 'primary-model', fallbackModel: 'free-fallback', sleep: async () => {},
    fetchImpl: async (url) => {
      requested.push(String(url));
      if (String(url).includes('primary-model')) return new Response('not-json', { status: 200 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [] } }] }), { status: 200 });
    },
  });
  await assert.rejects(adapter.generate({ system: 'system', prompt: 'question' }), /LLM provider/);
  assert.equal(requested.length, 2);
});

test('default provider is Gemini and Anthropic is selected only by explicit configuration', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"reply":"ok"}' }] } }] }), { status: 200 });
  };
  const gemini = createLLMAdapter({ config: { LLM_API_KEY: 'key', LLM_MODEL: 'gemini-3.5-flash-lite', LLM_FALLBACK_MODEL: '' }, fetchImpl });
  await gemini.generate({ system: 'system', prompt: 'question' });
  assert.match(calls[0], /generativelanguage.googleapis.com/);

  const anthropic = createLLMAdapter({ config: { LLM_PROVIDER: 'anthropic', LLM_API_KEY: 'key', LLM_MODEL: 'claude-test' }, fetchImpl: async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ content: [{ text: '{"reply":"ok"}' }] }), { status: 200 });
  } });
  await anthropic.generate({ system: 'system', prompt: 'question' });
  assert.match(calls[1], /api\.anthropic\.com/);
});

test('Gemini runtime configuration rejects models outside the verified free-tier allow-list', () => {
  assert.throws(() => createLLMAdapter({ config: { LLM_PROVIDER: 'gemini', LLM_API_KEY: 'key', LLM_MODEL: 'paid-model', LLM_FALLBACK_MODEL: '' } }), /verified free-tier allow-list/);
  assert.throws(() => createLLMAdapter({ config: { LLM_PROVIDER: 'gemini', LLM_API_KEY: 'key', LLM_MODEL: 'gemini-3.5-flash-lite', LLM_FALLBACK_MODEL: 'paid-model' } }), /verified free-tier allow-list/);
});
