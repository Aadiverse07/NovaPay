import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVoiceController } from '../../src/voice-assistant.js';

class FakeRecognition {
  static instances = [];
  constructor() { this.starts = 0; this.stops = 0; FakeRecognition.instances.push(this); }
  start() { this.starts += 1; this.onstart?.(); }
  stop() { this.stops += 1; this.onend?.(); }
  abort() {}
}
function fakeTimers() {
  let id = 0; const pending = new Map();
  return {
    setTimeout(fn, delay) { const key = ++id; pending.set(key, { fn, delay }); return key; },
    clearTimeout(key) { pending.delete(key); },
    runDelay(delay) { const item = [...pending].find(([, value]) => value.delay === delay); if (!item) return false; pending.delete(item[0]); item[1].fn(); return true; },
    size() { return pending.size; },
  };
}
function event(text, final = true) {
  const item = [{ transcript: text }]; item.isFinal = final;
  return { resultIndex: 0, results: [item] };
}
async function settle() { await new Promise((resolve) => setImmediate(resolve)); }
function setup(overrides = {}) {
  FakeRecognition.instances = [];
  const timers = fakeTimers(), queries = [], states = [], transcripts = [], spoken = [], cancellations = [];
  const controller = createVoiceController({
    Recognition: FakeRecognition, speechOutput: { speak(text) { spoken.push(text); return Promise.resolve({ ok: true }); }, cancel() { cancellations.push(true); } },
    onQuery: async (text, metadata) => { queries.push({ text, metadata }); return { reply: 'A short answer.', actions: [{ id: 'nav.open', args: { view: 'ledger' } }] }; },
    onState: (snapshot) => states.push(snapshot), onTranscript: (text, kind) => transcripts.push({ text, kind }),
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, ...overrides,
  });
  return { controller, timers, queries, states, transcripts, spoken, cancellations, recognition: () => FakeRecognition.instances[0] };
}

test('tap starts one non-continuous en-IN recognizer and a second start is ignored', () => {
  const state = setup();
  assert.equal(state.controller.start(), true);
  assert.equal(state.controller.start(), false);
  assert.equal(FakeRecognition.instances.length, 1);
  assert.equal(state.recognition().starts, 1);
  assert.equal(state.recognition().continuous, false);
  assert.equal(state.recognition().interimResults, true);
  assert.equal(state.recognition().lang, 'en-IN');
  state.controller.stop();
});

test('final spoken transcript reaches the same handler text and actions as typed input', async () => {
  const typedCalls = [], spokenCalls = [];
  const handleQuery = async (text) => {
    const result = { reply: 'Opening Ledger.', actions: [{ id: 'nav.open', tier: 0, args: { view: 'ledger' } }] };
    typedCalls.push({ text, result }); return result;
  };
  const state = setup({ onQuery: async (text) => { spokenCalls.push({ text, result: await handleQuery(text) }); return spokenCalls.at(-1).result; } });
  await handleQuery('open ledger'); const typed = typedCalls.at(-1);
  state.controller.start(); state.recognition().onresult(event('open ledger'));
  await settle(); await settle();
  assert.deepEqual(spokenCalls.at(-1), typed);
  assert.deepEqual(state.spoken, ['Opening Ledger.']);
  assert.equal(state.controller.getState(), 'idle');
});

test('a deterministic fast-path module reply is spoken', async () => {
  const spoken = [], cancellations = [];
  const state = setup({
    speechOutput: { speak(text) { assert.equal(FakeRecognition.instances[0].stops, 1, 'recognizer stops before TTS starts'); spoken.push(text); return Promise.resolve({ ok: true }); }, cancel() { cancellations.push(true); } },
    onQuery: async () => ({ reply: 'Opening the ledger.', speak: 'Opening the ledger.', route: 'code', actions: [{ id: 'nav.open', args: { view: 'ledger' } }] }),
  });
  state.controller.start(); state.recognition().onresult(event('open ledger'));
  await settle(); await settle();
  assert.deepEqual(spoken, ['Opening the ledger.']); assert.equal(cancellations.length, 0);
  assert.equal(state.controller.getState(), 'idle');
});

test('an empty response.speak falls back to a short plain-text reply exactly once', async () => {
  const speechCalls = [];
  const state = setup({ speechOutput: { speak(text) { speechCalls.push(text); return Promise.resolve({ ok: true }); }, cancel() {} }, onQuery: async () => ({ reply: 'The organization received 125.00 INR today. Evidence: record 123.', speak: '', route: 'sql' }) });
  state.controller.start(); state.recognition().onresult(event('how much did I receive today?'));
  await settle(); await settle();
  assert.deepEqual(speechCalls, ['The organization received 125.00 INR today.']);
  assert.equal(state.controller.getState(), 'idle');
});

test('muted voice does not speak and a speech error always returns the state to idle', async () => {
  const muted = setup({ muted: true }); muted.controller.start(); muted.recognition().onresult(event('open ledger'));
  await settle(); await settle();
  assert.deepEqual(muted.spoken, []); assert.equal(muted.controller.getState(), 'idle');
  const failed = setup({ speechOutput: { speak: async () => ({ ok: false, error: 'network' }), cancel() {} } });
  failed.controller.start(); failed.recognition().onresult(event('open ledger'));
  await settle(); await settle();
  assert.equal(failed.controller.getState(), 'idle');
  assert.match(failed.states.at(-1).message, /speech playback failed/i);
});

test('interim result followed by silence submits exactly one query and shows the live text', async () => {
  const state = setup(); state.controller.start();
  state.recognition().onresult(event('how much did I receive today', false));
  assert.equal(state.transcripts.at(-1).kind, 'interim');
  assert.equal(state.transcripts.at(-1).text, 'how much did I receive today');
  assert.equal(state.timers.runDelay(1200), true);
  state.recognition().onend(); await settle(); await settle();
  assert.deepEqual(state.queries.map((item) => item.text), ['how much did I receive today']);
  assert.equal(state.controller.getState(), 'idle');
});

test('mic tap while speaking does not cancel the active reply or start a competing recognizer', async () => {
  let resolveSpeech; const cancellation = [];
  const state = setup({ speechOutput: { speak() { return new Promise((resolve) => { resolveSpeech = resolve; }); }, cancel() { cancellation.push(true); } } });
  state.controller.start(); state.recognition().onresult(event('open ledger')); await settle();
  assert.equal(state.controller.getState(), 'speaking');
  assert.equal(state.controller.start(), false);
  assert.equal(cancellation.length, 0);
  assert.equal(FakeRecognition.instances.length, 1);
  assert.equal(state.recognition().starts, 1);
  assert.equal(state.controller.getState(), 'speaking');
  resolveSpeech?.({ ok: false, error: 'interrupted' });
  await settle();
  assert.equal(state.controller.getState(), 'idle');
});

test('network speech-service error stops immediately and exposes the fallback status', () => {
  const state = setup(); state.controller.start();
  state.recognition().onerror({ error: 'network' });
  assert.equal(state.controller.getState(), 'idle');
  assert.match(state.states.at(-1).message, /Brave blocks it.*Use Chrome\/Edge/);
  assert.equal(state.controller.isEnabled(), false);
  assert.equal(FakeRecognition.instances.length, 1);
});

test('15 second thinking limit always clears the turn', () => {
  const state = setup({ onQuery: () => new Promise(() => {}) }); state.controller.start();
  state.recognition().onresult(event('open invoices'));
  assert.equal(state.timers.runDelay(15000), true);
  assert.notEqual(state.controller.getState(), 'thinking');
  assert.match(state.spoken[0], /taking too long/i);
});

test('removed listening logic and duplicate recognizers are absent', async () => {
  const files = await Promise.all(['../../src/voice-assistant.js', '../../src/assistant-client.js', '../../src/voice-greeting.js', '../../src/dashboard.js', '../../src/assistant-speech.js', '../../src/voice-indicator.js'].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  const combined = files.join('\n');
  assert.doesNotMatch(combined, new RegExp([['wake','Query'].join(''), 'Listening for .{0,20}NovaPay', 'just say.{0,20}NovaPay'].join('|'), 'i'));
  assert.equal((combined.match(/new Recognition\s*\(/g) || []).length, 1);
  assert.doesNotMatch(files[3] + files[4] + files[5], /new (?:window\.)?(?:webkit)?SpeechRecognition|new SpeechRecognition/);
});

test('no-speech and permission errors end the tapped session without retrying', () => {
  for (const code of ['no-speech', 'aborted', 'not-allowed', 'service-not-allowed']) {
    const state = setup(); state.controller.start(); state.recognition().onerror({ error: code });
    assert.equal(state.controller.getState(), 'idle');
    assert.equal(state.controller.isEnabled(), false);
    assert.equal(state.recognition().starts, 1);
    if (code === 'not-allowed') assert.match(state.states.at(-1).message, /Microphone permission is blocked/);
    if (code === 'service-not-allowed') assert.match(state.states.at(-1).message, /Brave blocks it/);
  }
});

test('cancel before browser onstart prevents a late recognizer session from reopening listening', () => {
  const state = setup(); state.controller.start();
  const recognizer = state.recognition(), lateStart = recognizer.onstart;
  state.controller.stop();
  lateStart();
  assert.equal(state.controller.getState(), 'idle');
  assert.equal(state.controller.isEnabled(), false);
});
