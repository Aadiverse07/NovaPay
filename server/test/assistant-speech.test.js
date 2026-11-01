import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/assistant-speech.js', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(source, { module, globalThis: {}, setTimeout, clearTimeout, Promise, String, Array, console });
const speech = module.exports;

function fakeDocument() {
  const listeners = {};
  return { listeners, addEventListener(name, fn) { listeners[name] = fn; } };
}

test('speech waits for a gesture and voices, logs selection and utterance lifecycle, chunks, and resolves', async () => {
  const doc = fakeDocument(), utterances = [], voiceEvents = {};
  let voices = [], resumeCalls = 0; const logs = [];
  const synthesis = { getVoices: () => voices, addEventListener(name, fn) { voiceEvents[name] = fn; }, removeEventListener() {}, resume() { resumeCalls += 1; }, speak(utterance) { utterances.push(utterance); setImmediate(() => { utterance.onstart(); utterance.onend(); }); } };
  class Utterance { constructor(text) { this.text = text; } }
  const output = speech.create({ synthesis, Utterance, document: doc, debug: true, storage: { getItem: () => null } });
  const oldDebug = console.debug; console.debug = (...args) => logs.push(args);
  let settled = false;
  const result = output.speak(('spoken answer ').repeat(40)).then((value) => { settled = true; return value; });
  assert.equal(settled, false); output.markGesture(); setImmediate(() => voiceEvents.voiceschanged());
  voices = [{ name: 'India English', lang: 'en-IN' }];
  const spoken = await result; console.debug = oldDebug; assert.equal(spoken.ok, true); assert.equal(spoken.error, null);
  assert.ok(utterances.length > 1); assert.ok(utterances.every((item) => item.text.length <= 220));
  assert.ok(resumeCalls > 0);
  assert.ok(logs.some(([tag, step, detail]) => step === 'speak call' && detail.textLength > 0));
  assert.ok(logs.some(([, step, detail]) => step === 'voice selection' && detail.voicesCount === 1 && detail.chosenVoice.name === 'India English'));
  assert.ok(logs.some(([, step]) => step === 'utterance onstart'));
  assert.ok(logs.some(([, step]) => step === 'utterance onend'));
});

test('speech falls back to the browser default when no voice appears and never speaks while muted', async () => {
  const voiceEvents = {}, utterances = []; let speaks = 0;
  const synthesis = { getVoices: () => [], addEventListener(name, fn) { voiceEvents[name] = fn; }, removeEventListener() {}, speak(utterance) { speaks += 1; utterances.push(utterance); setImmediate(() => utterance.onend()); } };
  class Utterance { constructor(text) { this.text = text; } }
  const output = speech.create({ synthesis, Utterance, storage: { getItem: () => null } });
  output.markGesture();
  const pending = output.speak('Opening the ledger.');
  setImmediate(() => voiceEvents.voiceschanged());
  const result = await pending;
  assert.equal(result.ok, true); assert.equal(speaks, 1); assert.equal(utterances[0].voice, undefined); assert.equal(utterances[0].lang, 'en-IN');
  output.setMuted(true);
  const muted = await output.speak('This must stay silent.');
  assert.equal(muted.ok, false); assert.equal(muted.error, 'muted'); assert.equal(speaks, 1);
});

test('empty or markup-only speech becomes a short plain-language sentence', async () => {
  const utterances = [];
  const synthesis = { getVoices: () => [{ lang: 'en-US', default: true }], speak(utterance) { utterances.push(utterance); setImmediate(() => utterance.onend()); } };
  class Utterance { constructor(text) { this.text = text; } }
  const output = speech.create({ synthesis, Utterance, storage: { getItem: () => null } });
  output.markGesture(); await output.speak('```json```');
  assert.equal(utterances[0].text, 'Done. I completed that request.');
  assert.equal(utterances[0].lang, 'en-US');
});

test('speech synthesis errors always resolve with an error category', async () => {
  const doc = fakeDocument();
  const synthesis = { getVoices: () => [{ lang: 'en-IN' }], speak(utterance) { setImmediate(() => utterance.onerror({ error: 'network' })); } };
  class Utterance { constructor(text) { this.text = text; } }
  const output = speech.create({ synthesis, Utterance, document: doc, storage: { getItem: () => null } });
  const result = output.speak('answer'); output.markGesture();
  const failed = await result; assert.equal(failed.ok, false); assert.equal(failed.error, 'network');
});

test('cancel resolves queued speech without waiting for a gesture', async () => {
  const output = speech.create({ document: fakeDocument(), storage: { getItem: () => null } });
  const pending = output.speak('queued answer');
  assert.equal(output.pending(), 1);
  output.cancel();
  const result = await pending; assert.equal(result.ok, false); assert.equal(result.error, 'interrupted');
  assert.equal(output.pending(), 0);
});

test('not-allowed TTS resolves the turn and retries once after a later gesture', async () => {
  const doc = fakeDocument(), attempts = [];
  const synthesis = { getVoices: () => [{ lang: 'en-IN' }], speak(utterance) { attempts.push(utterance); setImmediate(() => attempts.length === 1 ? utterance.onerror({ error: 'not-allowed' }) : utterance.onend()); } };
  class Utterance { constructor(text) { this.text = text; } }
  const output = speech.create({ synthesis, Utterance, document: doc, storage: { getItem: () => null } });
  output.markGesture();
  const result = await output.speak('retry answer');
  assert.equal(result.ok, false); assert.equal(result.error, 'not-allowed'); assert.equal(attempts.length, 1);
  output.markGesture(); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(attempts.length, 2); assert.equal(output.pending(), 0);
});
