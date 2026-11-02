import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const source = await readFile(new URL('../../src/assistant-client.js', import.meta.url), 'utf8');
const dashboardSource = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(source, { module, globalThis: {}, window: {} });
const client = module.exports;
const speechOutputModule = createRequire(import.meta.url)('../../src/assistant-speech.js');

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
  assert.match(dashboardSource, /if\(session\)return Promise\.race\(\[NovaLive\.assistantChat\(q,voiceMetadata\)/);
  assert.match(dashboardSource, /if\(window\.NovaPayAssistantClient\.canUseDemoFallback\(auth,session\)&&auth\.isAuthenticated\(\)\)/);
  assert.match(dashboardSource, /return localAnswer\(q,records\)/);
  assert.doesNotMatch(dashboardSource, /Attached file content|FileReader|aiAttachmentText/);
});

test('dashboard shares scoped session history across typed/voice requests and exposes New chat', () => {
  assert.match(dashboardSource, /NovaPayAssistantConversation\.create\(sessionMemoryStorage\)/);
  assert.match(dashboardSource, /metadata\.history=turns\.slice\(-10\)/);
  assert.match(dashboardSource, /grid\.getSelectedIds/);
  assert.match(dashboardSource, /grid\.getFilteredIds/);
  assert.match(dashboardSource, /ai-new-chat/);
  assert.match(dashboardSource, /assistantConversation\.append\("user",q\).*assistantConversation\.append\("assistant",response\.reply\)/);
  assert.match(dashboardSource, /if\(event\.detail&&!event\.detail\.signedIn\).*assistantConversation\.clear\(\)/);
});

test('invoice create intent uses the shared typed/voice handler, explicit confirmation, and the authenticated draft endpoint', () => {
  assert.match(dashboardSource, /return Promise\.resolve\(\)\.then\(function\(\)\{return handleInvoiceAssistant\(q\)\}\)\.then\(function\(invoiceResponseValue\)\{return invoiceResponseValue\|\|ask\(q,metadata\)/, 'invoice action interception precedes the evidence-answer path');
  assert.match(dashboardSource, /pendingInvoiceDraft\.awaitingConfirmation/);
  assert.match(dashboardSource, /confirm\|yes\|confirmed/);
  assert.match(dashboardSource, /data\.submitting/);
  assert.match(dashboardSource, /auditAssistantAction\(action,"confirmed"\).*executeAssistantAction\(action\)/);
  assert.match(dashboardSource, /"\/api\/invoices"/);
  assert.match(dashboardSource, /"Idempotency-Key":key/);
  assert.match(dashboardSource, /renewInvoiceExpiry\(\).*120000/);
  assert.match(dashboardSource, /resetPendingInvoice\(\);return invoiceResponse\(q,"I cancelled the invoice draft/);
  assert.match(dashboardSource, /invoiceDraftIdempotencyKey=crypto\.randomUUID\(\)/);
  assert.match(dashboardSource, /lastCreatedInvoiceId=invoice\.id/);
  assert.match(dashboardSource, /change the amount to a new value/);
  assert.match(dashboardSource, /customerEmail/);
  assert.match(dashboardSource, /invoicePrompt\(missing\)/);
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

test('local quick commands parse navigation, stop, repeat, and help without a backend', () => {
  assert.equal(client.parseQuickCommand('open ledger').action.args.view, 'ledger');
  assert.equal(client.parseQuickCommand('show invoices').action.args.view, 'invoices');
  assert.equal(client.parseQuickCommand('open approvals').action.args.view, 'approvals');
  assert.equal(client.parseQuickCommand('take me to invoices').action.args.view, 'invoices');
  assert.equal(client.parseQuickCommand('stop').action.id, 'assistant.stopSpeaking');
  assert.equal(client.parseQuickCommand('repeat').action.id, 'assistant.repeat');
  assert.equal(client.parseQuickCommand('help').action.id, 'assistant.help');
  assert.equal(client.parseQuickCommand('show refunds last month'), null);
});

test('push-to-talk transcript enters the shared handler', async () => {
  const calls = [], handled = [];
  const response = await client.transcribeAndHandle({ async request(...args) { calls.push(args); return { transcript: 'show refunds this month' }; } }, new Blob(['audio'], { type: 'audio/webm' }), async (text, options) => { handled.push({ text, options }); return { reply: 'No live records yet.' }; });
  assert.equal(calls[0][0], '/api/ai/transcribe');
  assert.equal(calls[0][1].headers['X-Audio-Mime-Type'], 'audio/webm');
  assert.equal(handled[0].text, 'show refunds this month');
  assert.equal(handled[0].options.source, 'push-to-talk');
  assert.equal(handled[0].options.speak, true);
  assert.equal(response.reply, 'No live records yet.');
});

test('typed and recognized voice calls share the dashboard handler and quick commands precede API dispatch', () => {
  assert.match(dashboardSource, /function handleQuery\(q,options\)/);
  assert.match(dashboardSource, /handleQuery\(q,\{source:"typed",speak:true\}\)/);
  assert.match(dashboardSource, /onQuery:function\(message,metadata\)\{return handleQuery\(message,\{source:"voice",metadata:metadata,speak:false\}\)\}/);
  assert.match(dashboardSource, /transcribeAndHandle\(window\.NovaPayApi,blob,handleQuery/);
  assert.match(dashboardSource, /parseQuickCommand\(q\)/);
});

test('typed and PTT queries use the same handler and both speak the returned answer', async () => {
  const spoken = [], events = {};
  const output = speechOutputModule.create({
    synthesis: { getVoices: () => [{ lang: 'en-IN' }], speak(utterance) { spoken.push(utterance.text); setImmediate(() => utterance.onend()); } },
    Utterance: class { constructor(text) { this.text = text; } },
    document: { addEventListener(name, fn) { events[name] = fn; } }, storage: { getItem: () => null },
  });
  output.markGesture();
  const handleQuery = async (text, options) => { const reply = `NovaPay answered ${text}`; await output.speak(reply); return { reply, options }; };
  const typed = await handleQuery('open ledger', { source: 'typed', speak: true });
  const ptt = await client.transcribeAndHandle({ async request() { return { transcript: 'show refunds this month' }; } }, new Blob(['audio'], { type: 'audio/webm' }), handleQuery);
  assert.equal(typed.reply, 'NovaPay answered open ledger');
  assert.equal(ptt.reply, 'NovaPay answered show refunds this month');
  assert.deepEqual(spoken, ['NovaPay answered open ledger', 'NovaPay answered show refunds this month']);
  assert.equal(ptt.options.source, 'push-to-talk');
});

test('an authenticated chat response after the fake API fetch triggers exactly one shared speak', async () => {
  const calls = [], utterances = [], events = [];
  const output = speechOutputModule.create({
    synthesis: { getVoices: () => [{ lang: 'en-IN', localService: true }], resume() {}, speak(utterance) { utterances.push(utterance.text); setImmediate(() => { utterance.onstart(); utterance.onend(); }); } },
    Utterance: class { constructor(text) { this.text = text; } },
    document: { addEventListener(name, fn) { events.push(name); } }, storage: { getItem: () => null },
  });
  output.markGesture();
  const response = await client.send({ async request(path, options) { calls.push({ path, options }); return { answer: 'The organization received funds today.', speak: '', route: 'sql' }; } }, 'how much did I receive today?');
  const result = await output.speak(response.speak || response.reply);
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/api/ai/chat');
  assert.equal(result.ok, true); assert.deepEqual(utterances, ['The organization received funds today.']);
  assert.ok(events.includes('pointerdown'));
});
