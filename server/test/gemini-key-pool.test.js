import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiKeyPool, nextLosAngelesMidnight, resolveGeminiCapabilities, resolveGeminiKeySlots } from '../src/services/geminiKeyPool.js';
import { createGeminiAdapter } from '../src/services/llm.js';
import { createGeminiDocumentOCRProvider } from '../src/services/documentOcr.js';
import { createGeminiDocumentEmbeddingProvider } from '../src/services/documentRag.js';

const success = (value = { ok: true }) => new Response(JSON.stringify(value), { status: 200 });
const quota = (body = { error: { status: 'RESOURCE_EXHAUSTED', message: 'PerDay quota exceeded' } }) => new Response(JSON.stringify(body), { status: 429 });
const parse = async ({ response }) => {
  if (!response.ok) throw Object.assign(new Error('provider failure'), { retryable: response.status >= 500 });
  return response.json();
};

test('legacy single-key config resolves to slot 1 and preserves the Gemini provider path', async () => {
  const slots = resolveGeminiKeySlots({ LLM_PROVIDER: 'gemini', LLM_API_KEY: ' legacy-key ' });
  assert.deepEqual(slots, [{ slot: 1, key: 'legacy-key' }]);
  const pool = createGeminiKeyPool({ keys: slots });
  const called = [];
  const result = await pool.generate({ models: ['one'], timeoutMs: 10, request: async (args) => { called.push(args.apiKey); return success(); }, parse });
  assert.deepEqual(called, ['legacy-key']);
  assert.equal(result.slot, 1);
});

test('key 1 serves every healthy request and keys 2 through 8 are untouched', async () => {
  const pool = createGeminiKeyPool({ keys: Array.from({ length: 8 }, (_, i) => `test-key-${i + 1}`) });
  const used = [];
  const request = async ({ apiKey }) => { used.push(apiKey); return success(); };
  await pool.generate({ models: ['model'], timeoutMs: 10, request, parse });
  await pool.generate({ models: ['model'], timeoutMs: 10, request, parse });
  assert.deepEqual(used, ['test-key-1', 'test-key-1']);
});

test('PerDay exhaustion switches the same request to key 2 and skips key 1 next time', async () => {
  let now = Date.UTC(2026, 10, 1, 12);
  const used = [];
  const pool = createGeminiKeyPool({ keys: ['test-key-1', 'test-key-2'], now: () => now, sleep: async () => {} });
  const request = async ({ apiKey }) => { used.push(apiKey); return apiKey === 'test-key-1' ? quota() : success(); };
  await pool.generate({ models: ['model'], timeoutMs: 10, request, parse });
  await pool.generate({ models: ['model'], timeoutMs: 10, request, parse });
  assert.deepEqual(used, ['test-key-1', 'test-key-2', 'test-key-2']);
  const reset = new Date(nextLosAngelesMidnight(now));
  const resetParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23', day: 'numeric' }).formatToParts(reset).map((part) => [part.type, part.value]));
  assert.equal(resetParts.hour, '00');
});

test('both models exhausting one key moves to the next key in the same request', async () => {
  const used = [];
  const pool = createGeminiKeyPool({ keys: ['test-key-1', 'test-key-2'] });
  const result = await pool.generate({ models: ['primary', 'fallback'], timeoutMs: 10, request: async ({ apiKey, model }) => {
    used.push(`${apiKey}/${model}`);
    return apiKey === 'test-key-1' ? quota({ error: { message: 'PerDay quota' } }) : success();
  }, parse });
  assert.deepEqual(used, ['test-key-1/primary', 'test-key-1/fallback', 'test-key-2/primary']);
  assert.equal(result.slot, 2);
});

test('per-minute retryDelay cooldown expires using an injectable clock without sleeping', async () => {
  let now = 0;
  const used = [];
  const pool = createGeminiKeyPool({ keys: ['test-key-1', 'test-key-2'], now: () => now, sleep: async () => {} });
  const request = async ({ apiKey }) => {
    used.push(apiKey);
    if (apiKey === 'test-key-1' && now < 5000) return quota({ error: { details: [{ retryDelay: '5s' }] } });
    return success();
  };
  await pool.generate({ models: ['model'], timeoutMs: 10, request, parse });
  await pool.generate({ models: ['model'], timeoutMs: 10, request, parse });
  now = 5001;
  await pool.generate({ models: ['model'], timeoutMs: 10, request, parse });
  assert.deepEqual(used, ['test-key-1', 'test-key-2', 'test-key-2', 'test-key-1']);
});

test('model fallback is tried on a key before that key is abandoned', async () => {
  const calls = [];
  const pool = createGeminiKeyPool({ keys: ['test-key-1', 'test-key-2'], sleep: async () => {} });
  const request = async ({ apiKey, model }) => {
    calls.push(`${apiKey}/${model}`);
    return model === 'primary' ? quota() : success();
  };
  const result = await pool.generate({ models: ['primary', 'fallback'], timeoutMs: 10, request, parse });
  assert.deepEqual(calls, ['test-key-1/primary', 'test-key-1/fallback']);
  assert.equal(result.model, 'fallback');
});

test('timeout and HTTP 500 retry only on the same key and never rotate', async () => {
  const used = [];
  const pool = createGeminiKeyPool({ keys: ['test-key-1', 'test-key-2'], sleep: async () => {} });
  await assert.rejects(pool.generate({ models: ['model'], timeoutMs: 10, request: async ({ apiKey }) => { used.push(apiKey); throw new Error('offline'); }, parse }), /offline/);
  assert.deepEqual(used, ['test-key-1', 'test-key-1']);
  used.length = 0;
  await assert.rejects(pool.generate({ models: ['model'], timeoutMs: 10, request: async ({ apiKey }) => { used.push(apiKey); return new Response('provider-error', { status: 500 }); }, parse }), /provider failure/);
  assert.deepEqual(used, ['test-key-1', 'test-key-1']);
});

test('invalid 403 and API_KEY_INVALID disable the whole slot and continue to the next key', async () => {
  for (const response of [new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 }), new Response(JSON.stringify({ error: { status: 'API_KEY_INVALID' } }), { status: 400 }), new Response(JSON.stringify({ error: { status: 'UNAUTHENTICATED' } }), { status: 401 })]) {
    const used = [];
    const pool = createGeminiKeyPool({ keys: ['test-key-1', 'test-key-2'] });
    await pool.generate({ models: ['model'], timeoutMs: 10, request: async ({ apiKey }) => { used.push(apiKey); return apiKey === 'test-key-1' ? response.clone() : success(); }, parse });
    assert.deepEqual(used, ['test-key-1', 'test-key-2']);
  }
});

test('all eight exhausted fail safely within eight quota calls and logs never contain key text', async () => {
  const logs = [];
  const keys = Array.from({ length: 8 }, (_, i) => `test-secret-key-${i + 1}`);
  const pool = createGeminiKeyPool({ keys, events: { addCall(entry) { logs.push(entry.m); } } });
  let calls = 0;
  await assert.rejects(pool.generate({ models: ['one', 'two'], timeoutMs: 10, request: async () => { calls += 1; return quota(); }, parse }), (error) => {
    assert.equal(error.message.includes('test-secret-key'), false);
    return true;
  });
  assert.ok(calls <= 8 * 2);
  assert.doesNotMatch(JSON.stringify(logs), /test-secret-key/);
  assert.ok(logs.some((line) => /key #1 exhausted, switching to key #2/.test(line)));
  assert.equal(logs.filter((line) => /switching to key #/.test(line)).length, 7);
});

test('invalid key disable expires after 30 minutes', async () => {
  let now = 0;
  const used = [];
  const pool = createGeminiKeyPool({ keys: ['test-key-1', 'test-key-2'], now: () => now });
  await pool.generate({ models: ['model'], timeoutMs: 10, request: async ({ apiKey }) => {
    used.push(apiKey);
    return apiKey === 'test-key-1' && now === 0 ? new Response('{}', { status: 403 }) : success();
  }, parse });
  now = 30 * 60 * 1000 + 1;
  await pool.generate({ models: ['model'], timeoutMs: 10, request: async ({ apiKey }) => { used.push(apiKey); return success(); }, parse });
  assert.deepEqual(used, ['test-key-1', 'test-key-2', 'test-key-1']);
});

test('key parsing trims, deduplicates, and caps at eight slots', () => {
  const parsed = resolveGeminiKeySlots({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY_1: ' A ', GEMINI_API_KEY_2: 'A', GEMINI_API_KEY_3: ' B ' });
  assert.deepEqual(parsed, [{ slot: 1, key: 'A' }, { slot: 3, key: 'B' }]);
  const capped = resolveGeminiKeySlots(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`GEMINI_API_KEY_${i + 1}`, `key-${i + 1}`])));
  assert.equal(capped.length, 8);
  assert.deepEqual(resolveGeminiKeySlots({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'legacy-doc-key' }), [{ slot: 1, key: 'legacy-doc-key' }]);
  assert.deepEqual(resolveGeminiKeySlots({ LLM_PROVIDER: 'anthropic', GEMINI_API_KEY: ' legacy-doc-key ' }), [{ slot: 1, key: 'legacy-doc-key' }]);
  assert.deepEqual(resolveGeminiCapabilities({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY_4: 'key' }), { hasAI: true, hasDocumentOCR: true });
  assert.deepEqual(resolveGeminiCapabilities({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'key' }), { hasAI: true, hasDocumentOCR: false });
  assert.deepEqual(resolveGeminiCapabilities({ LLM_PROVIDER: 'anthropic', GEMINI_API_KEY_2: 'key' }), { hasAI: true, hasDocumentOCR: true });
  assert.deepEqual(resolveGeminiCapabilities({ LLM_PROVIDER: 'gemini' }), { hasAI: false, hasDocumentOCR: false });
});

test('OCR invalid-key cooldown is shared with embeddings', async () => {
  const used = [];
  const keyPool = createGeminiKeyPool({ keys: ['test-key-1', 'test-key-2'] });
  const ocr = createGeminiDocumentOCRProvider({ keyPool, async fetchImpl(_url, options) {
    const key = options.headers['x-goog-api-key']; used.push(`ocr:${key}`);
    return key === 'test-key-1' ? new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 }) : success({ candidates: [{ content: { parts: [{ text: '{"ocr":"ok"}' }] } }] });
  } });
  const embeddings = createGeminiDocumentEmbeddingProvider({ keyPool, async fetchImpl(_url, options) {
    const key = options.headers['x-goog-api-key']; used.push(`embedding:${key}`);
    return success({ embeddings: [{ values: Array(768).fill(0.1) }] });
  } });
  await ocr.extract({ mimeType: 'application/pdf', bytes: Buffer.from('%PDF-test') });
  await embeddings.embed(['sample']);
  const chat = createGeminiAdapter({ keyPool, model: 'gemini-3.5-flash-lite', fallbackModel: '', async fetchImpl(_url, options) {
    const key = options.headers['x-goog-api-key']; used.push(`chat:${key}`);
    return success({ candidates: [{ content: { parts: [{ text: '{"reply":"ok"}' }] } }] });
  } });
  await chat.generate({ system: 'system', prompt: 'question' });
  assert.deepEqual(used, ['ocr:test-key-1', 'ocr:test-key-2', 'embedding:test-key-2', 'chat:test-key-2']);
});
