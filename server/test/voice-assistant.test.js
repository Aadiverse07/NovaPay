import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVoiceController } from '../../src/voice-assistant.js';

class FakeRecognition {
  static instances = [];
  constructor() { this.starts = 0; this.stops = 0; FakeRecognition.instances.push(this); }
  start() { this.starts += 1; this.onstart?.(); }
  stop() { this.stops += 1; }
  abort() {}
}
class FakeUtterance { constructor(text) { this.text = text; } }
function fakeTimers() {
  let id = 0; const scheduled = new Map();
  return {
    setTimeout(fn, delay) { const key = ++id; scheduled.set(key, { fn, delay }); return key; },
    clearTimeout(key) { scheduled.delete(key); },
    runDelay(delay) { const item = [...scheduled].find(([, value]) => value.delay === delay); if (!item) return false; scheduled.delete(item[0]); item[1].fn(); return true; },
    runNext() { const item = scheduled.entries().next().value; if (!item) return false; scheduled.delete(item[0]); item[1].fn(); return true; },
    size() { return scheduled.size; },
  };
}
function result(text, isFinal = true) { const item = [{ transcript: text }]; item.isFinal = isFinal; return item; }
async function settle() { await new Promise((resolve) => setImmediate(resolve)); }
function setup(overrides = {}) {
  FakeRecognition.instances = [];
  const timers = fakeTimers(), utterances = [], states = [], queries = [], synthesis = {
    cancelCount: 0, getVoices: () => [{ lang: 'en-US' }], cancel() { this.cancelCount += 1; }, speak(utterance) { utterances.push(utterance); },
  };
  const controller = createVoiceController({ Recognition: FakeRecognition, synthesis, Utterance: FakeUtterance, muted: true,
    onState: (state) => states.push(state), onQuery: async (message, metadata) => { queries.push({ message, metadata }); return { reply: 'A short answer.', speak: 'A short answer.' }; },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, ...overrides });
  return { controller, timers, utterances, states, queries, synthesis, recognition: () => FakeRecognition.instances[0] };
}

test('one recognizer handles supported wake phrases and waits for the end of speech', async () => {
  for (const phrase of ['Hey NovaPay, open ledger', 'hey nova pay open ledger', 'ok novapay open ledger', 'hi novapay open ledger', 'hey nova open ledger']) {
    const state = setup(); state.controller.start();
    state.recognition().onresult({ resultIndex: 0, results: [result(phrase)] });
    assert.equal(state.queries.length, 0, 'a silence window precedes the request');
    assert.equal(state.timers.runDelay(1200), true);
    await settle();
    assert.equal(state.queries[0].message, 'open ledger');
    assert.equal(state.recognition().starts, 1, 'the controller creates and starts one recognizer');
    state.controller.destroy();
  }
});

test('dashboard lazy-load activation uses permission-aware voice enablement', async () => {
  const dashboard = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../../src/voice-assistant.js', import.meta.url), 'utf8');
  assert.match(dashboard, /controller&&controller\.enableVoice\)controller\.enableVoice\(\)/);
  assert.doesNotMatch(dashboard, /window\.NovaPayVoiceAssistantController=controller;[^\n]*controller\.start\(\)/);
  assert.match(controller, /getUserMedia\(\{ audio: \{ echoCancellation: true/);
  assert.match(controller, /controller\.enableVoice = startVoice/);
});

test('dashboard activity poll uses the authenticated API client', async () => {
  const live = await readFile(new URL('../../src/novapay-live.js', import.meta.url), 'utf8');
  assert.match(live, /NovaPayApi\?window\.NovaPayApi\.request\("\/api\/events"\)/);
});

test('recognized wake query reaches assistant callback and speaks its answer', async () => {
  const state = setup({ muted: false }); state.controller.start();
  state.recognition().onresult({ resultIndex: 0, results: [result('Hey NovaPay, open ledger')] });
  assert.equal(state.timers.runDelay(1200), true);
  await settle();
  assert.deepEqual(state.queries.map((item) => item.message), ['open ledger']);
  assert.equal(state.utterances[0].text, 'A short answer.');
  assert.equal(state.controller.getState(), 'speaking');
  state.controller.destroy();
});

test('long speech is split into bounded TTS utterances and returns to listening', async () => {
  const state = setup({ muted: false }); state.controller.start();
  state.controller.speak(('NovaPay can help with your records and reports. ').repeat(12));
  assert.equal(state.utterances.length, 1, 'only the current chunk is submitted to speech synthesis');
  assert.ok(state.utterances[0].text.length <= 220);
  let spokenChunks = 0;
  while (state.utterances.some((utterance) => utterance.onend && !utterance.__ended)) {
    const current = state.utterances.find((utterance) => utterance.onend && !utterance.__ended);
    current.__ended = true; spokenChunks += 1; current.onend();
  }
  assert.ok(spokenChunks >= 2);
  assert.equal(state.controller.getState(), 'idle');
  state.controller.destroy();
});

test('wake-only utterance prompts Yes and captures the next query', async () => {
  const state = setup({ muted: false }); state.controller.start();
  state.recognition().onresult({ resultIndex: 0, results: [result('Hey NovaPay')] });
  assert.equal(state.utterances[0].text, 'Yes?');
  state.recognition().onresult({ resultIndex: 0, results: [result('Yes')] });
  assert.equal(state.queries.length, 0, 'the microphone echo of the prompt is ignored');
  state.utterances[0].onend();
  state.recognition().onresult({ resultIndex: 0, results: [result('show refunds this month')] });
  assert.equal(state.timers.runDelay(1200), true); await settle();
  assert.equal(state.queries[0].message, 'show refunds this month');
});

test('barge-in cancels speech, carries interruption context and ignores assistant echo', async () => {
  const state = setup({ muted: false, onQuery: async (message, metadata) => { state.queries.push({ message, metadata }); return { reply: 'The earlier answer explains the payment details.', speak: 'The earlier answer explains the payment details.' }; } });
  state.controller.start();
  state.recognition().onresult({ resultIndex: 0, results: [result('Hey NovaPay explain fees')] });
  state.timers.runDelay(1200); await settle();
  const utterance = state.utterances[0]; utterance.onboundary({ charIndex: 12 });
  const cancelledBeforeEcho = state.synthesis.cancelCount;
  state.recognition().onresult({ resultIndex: 0, results: [result('The earlier answer explains the payment details.')] });
  assert.equal(state.synthesis.cancelCount, cancelledBeforeEcho, 'assistant echo is ignored');
  state.recognition().onresult({ resultIndex: 0, results: [result('no, open invoices instead')] });
  assert.equal(state.synthesis.cancelCount, cancelledBeforeEcho + 1);
  state.timers.runDelay(1200); await settle();
  assert.equal(state.queries.at(-1).message, 'no, open invoices instead');
  assert.equal(state.queries.at(-1).metadata.interrupted.previousReply, 'The earlier answer explains the payment details.');
  assert.equal(state.queries.at(-1).metadata.interrupted.spokenChars, 12);
});

test('spoken confirmation accepts only explicit yes/confirm and expires in 15 seconds', async () => {
  const state = setup(); let calls = 0; state.controller.start();
  state.controller.requestConfirmation(() => { calls += 1; }, 30000);
  assert.equal(state.timers.runDelay(15000), true);
  state.recognition().onresult({ resultIndex: 0, results: [result('yes')] });
  assert.equal(calls, 0);
  state.controller.requestConfirmation(() => { calls += 1; });
  state.recognition().onresult({ resultIndex: 0, results: [result('yes')] });
  await settle();
  assert.equal(calls, 1);
});

test('failed speech restarts are bounded and stop after five failures in 30 seconds', () => {
  let clock = 1000; const state = setup({ now: () => clock }); state.controller.start();
  let delay = 200;
  for (let index = 0; index < 5; index += 1) {
    clock += 100; state.recognition().onerror({ error: 'network' });
    if (index < 4) { state.recognition().onend(); assert.equal(state.timers.runDelay(delay), true); delay *= 2; }
  }
  assert.equal(state.controller.isEnabled(), false);
  assert.equal(state.controller.getState(), 'paused');
  assert.equal(FakeRecognition.instances.length, 1);
  assert.match(state.states.at(-1).message, /Voice paused/);
});

test('one failed session is counted once across error plus end events', () => {
  const state = setup(); state.controller.start();
  state.recognition().onerror({ error: 'network' });
  state.recognition().onend();
  assert.equal(state.controller.isEnabled(), true);
  assert.equal(state.controller.getState(), 'idle');
  assert.equal(state.timers.runDelay(200), true);
  assert.equal(state.controller.isEnabled(), true, 'a single browser session error cannot exhaust the restart cap');
  state.controller.destroy();
});

test('recognizer restart uses backoff and stop/destroy remove active behavior', () => {
  const state = setup(); state.controller.start(); state.recognition().onend();
  assert.equal(state.timers.runDelay(200), true);
  assert.equal(state.recognition().starts, 2);
  state.recognition().onend(); assert.equal(state.timers.runDelay(400), true);
  state.recognition().onend(); assert.equal(state.timers.runDelay(800), true);
  state.controller.stop(); assert.equal(state.controller.getState(), 'off');
  state.controller.destroy(); assert.equal(state.recognition().onresult, null);
});

// ---- Regression: voice never answered after login (silent auto-pause + brittle wake phrase + hidden errors) ----
test('quiet rooms do not pause voice: normal no-speech session ends restart quietly, forever', () => {
  let clock = 1000; const state = setup({ now: () => clock }); state.controller.start();
  for (let index = 0; index < 40; index += 1) {
    clock += 7000; state.recognition().onerror({ error: 'no-speech' }); state.recognition().onend();
    assert.equal(state.timers.runDelay(200), true, 'restart scheduled at the normal delay');
  }
  assert.equal(state.controller.isEnabled(), true);
  assert.notEqual(state.controller.getState(), 'paused');
  assert.equal(state.recognition().starts, 41);
  assert.equal(FakeRecognition.instances.length, 1);
});

test('instantly-ending sessions are still treated as failures and pause (no tight restart loop)', () => {
  let clock = 1000; const state = setup({ now: () => clock }); state.controller.start();
  for (let index = 0; index < 5; index += 1) { clock += 50; state.recognition().onend(); state.timers.runNext(); }
  assert.equal(state.controller.getState(), 'paused');
  assert.equal(state.states.at(-1).problem, true);
});

for (const [phrase, expected] of [
  ['Hey, NovaPay, open ledger', 'open ledger'],
  ['hey nova pay: show invoices', 'show invoices'],
  ['Hey Nova Pe open ledger', 'open ledger'],
  ['hey nova pai open ledger', 'open ledger'],
  ['Hey Noah pay open ledger', 'open ledger'],
  ['a nova pay open ledger', 'open ledger'],
  ['Hello NovaPay what is my trial balance', 'what is my trial balance'],
]) {
  test(`wake phrase variant is understood: ${phrase}`, async () => {
    const state = setup(); state.controller.start();
    state.recognition().onresult({ resultIndex: 0, results: [result(phrase)] });
    state.timers.runDelay(1200); await settle();
    assert.equal(state.queries.length, 1);
    assert.equal(state.queries[0].message, expected);
  });
}

test('speech-service and microphone problems are surfaced with a reason instead of failing silently', () => {
  const blocked = setup(); blocked.controller.start();
  blocked.recognition().onerror({ error: 'not-allowed' });
  assert.equal(blocked.controller.getState(), 'paused');
  assert.equal(blocked.states.at(-1).problem, true);
  assert.match(blocked.states.at(-1).message, /Microphone is blocked/);
  const offline = setup(); offline.controller.start();
  offline.recognition().onerror({ error: 'network' });
  assert.equal(offline.states.at(-1).problem, true);
  assert.match(offline.states.at(-1).message, /speech service/);
  offline.recognition().onresult({ resultIndex: 0, results: [result('hello there', false)] });
  assert.equal(offline.states.at(-1).problem, false, 'problem clears when audio flows again');
});
