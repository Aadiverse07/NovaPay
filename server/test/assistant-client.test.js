import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/assistant-client.js', import.meta.url), 'utf8');
const dashboardSource = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(source, { module, globalThis: {}, window: {} });
const client = module.exports;

test('authenticated assistant request sends message only through the auth-aware API client', async () => {
  const calls = [];
  const result = await client.send({ async request(...args) { calls.push(args); return { answer: 'There are no matching rows.', route: 'sql', reason: 'structured_refunds_query', citations: ['invoice-42'], insufficient_evidence: true }; } }, 'Show refunds this month');
  assert.equal(JSON.stringify(calls), JSON.stringify([['/api/ai/chat', { method: 'POST', body: { message: 'Show refunds this month' } }]]));
  assert.equal(result.reply, 'There are no matching rows.');
  assert.equal(result.route, 'sql');
  assert.equal(result.reason, 'structured_refunds_query');
  assert.deepEqual(result.evidence, ['invoice-42']);
});

test('voice requests add only bounded view, interruption and recent-turn metadata', async () => {
  const calls = [];
  await client.send({ async request(...args) { calls.push(args); return { answer: 'A short answer.' }; } }, 'Open invoices', {
    context: { view: 'ai-assistant', selection: 'invoice-id-only' },
    interrupted: { previousReply: 'Earlier answer', spokenChars: 42 },
    history: [{ role: 'user', text: 'Earlier question' }, { role: 'assistant', text: 'Earlier answer' }],
  });
  const body = calls[0][1].body;
  assert.equal(body.message, 'Open invoices');
  assert.equal(JSON.stringify(body.context), JSON.stringify({ view: 'ai-assistant', selection: 'invoice-id-only' }));
  assert.equal(JSON.stringify(body.interrupted), JSON.stringify({ previousReply: 'Earlier answer', spokenChars: 42 }));
  assert.equal(JSON.stringify(body.history), JSON.stringify([{ role: 'user', text: 'Earlier question' }, { role: 'assistant', text: 'Earlier answer' }]));
  assert.equal(JSON.stringify(Object.keys(body).sort()), JSON.stringify(['context', 'history', 'interrupted', 'message']));
});

test('local assistant fallback is permitted only in explicit demo mode without a session', () => {
  assert.equal(client.canUseDemoFallback({ mode: 'demo' }, null), true);
  assert.equal(client.canUseDemoFallback({ mode: 'supabase' }, null), false);
  assert.equal(client.canUseDemoFallback({ mode: 'demo' }, { access_token: 'session' }), false);
  assert.equal(client.canUseDemoFallback({ mode: 'unavailable' }, null), false);
});

test('assistant errors are user-readable and never converted into canned answers', () => {
  assert.match(client.errorMessage({ status: 429, code: 'AI_DAILY_LIMIT' }), /daily request limit/);
  assert.match(client.errorMessage({ status: 401, code: 'AUTH_REQUIRED' }), /session expired.*Sign in again/i);
  assert.match(client.errorMessage({ status: 503, code: 'AI_TEMPORARILY_UNAVAILABLE' }), /provider is temporarily unavailable/i);
  assert.match(client.errorMessage({ code: 'API_UNAVAILABLE' }), /offline/i);
});

test('backend response route labels and citation ids normalize without client-scraped records', () => {
  const response = client.normalize({ answer: 'Hello.', route: 'retrieval', reason: 'evidence_based_explanation', citations: ['real-record-id'] });
  assert.equal(client.routeLabels[response.route], 'Retrieval');
  assert.deepEqual(response.evidence, ['real-record-id']);
});

test('dashboard confines local fallback to demo mode and does not scrape or attach browser content', () => {
  assert.match(dashboardSource, /if\(session\)return NovaLive\.assistantChat\(q,voiceMetadata\)/);
  assert.match(dashboardSource, /if\(window\.NovaPayAssistantClient\.canUseDemoFallback\(auth,session\)&&auth\.isAuthenticated\(\)\)/);
  assert.match(dashboardSource, /return localAnswer\(q,records\)/);
  assert.doesNotMatch(dashboardSource, /Attached file content|FileReader|aiAttachmentText/);
});

test('assistant action UI enforces confirmation tiers and audits before writes', () => {
  const confirmation = dashboardSource.indexOf('auditAssistantAction(action,"confirmed").then(function(){return executeAssistantAction(action)})');
  const tierTwo = dashboardSource.indexOf('else if(definition.tier===2)');
  const tierZero = dashboardSource.indexOf('executeAssistantAction(action).then(function(){card.remove()}', tierTwo);
  assert.ok(confirmation > 0, 'Tier 1 must be confirmed and audited before execution');
  assert.ok(tierTwo > confirmation && tierZero > tierTwo);
  assert.match(dashboardSource, /setTimeout\(function\(\)\{completed=true;confirm\.disabled=true;cancel\.disabled=true;copy\.textContent="Confirmation expired/);
  assert.match(dashboardSource, /\/api\/ai\/actions\/audit/);
});
