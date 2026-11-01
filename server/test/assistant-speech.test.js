import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../src/assistant-speech.js', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(source, { module, globalThis: {}, setTimeout, clearTimeout, Promise, String, Array });
const speech = module.exports;

function fakeDocument() {
  const listeners = {};
  return { listeners, addEventListener(name, fn) { listeners[name] = fn; } };
}

test('speech waits for a gesture and voices, chunks output, and resolves after end', async () => {
  const doc = fakeDocument(), utterances = [], voiceEvents = {};
  const synthesis = { getVoices: () => [], addEventListener(name, fn) { voiceEvents[name] = fn; }, removeEventListener() {}, speak(utterance) { utterances.push(utterance); setImmediate(() => utterance.onend()); } };
  class Utterance { constructor(text) { this.text = text; } }
  const output = speech.create({ synthesis, Utterance, document: doc, storage: { getItem: () => null } });
  let settled = false;
  const result = output.speak(('spoken answer ').repeat(40)).then((value) => { settled = true; return value; });
  assert.equal(settled, false); output.markGesture(); setImmediate(() => voiceEvents.voiceschanged());
  const spoken = await result; assert.equal(spoken.ok, true); assert.equal(spoken.error, null);
  assert.ok(utterances.length > 1); assert.ok(utterances.every((item) => item.text.length <= 220));
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
