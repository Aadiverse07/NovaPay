import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVoiceGreeting, createIntroSpeaker } from '../../src/voice-greeting.js';
import { ASSISTANT_ACTION_REGISTRY } from '../src/ai/actions.js';

function store(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('intro capability sentence is derived from registered navigation views', () => {
  const greeting = buildVoiceGreeting(ASSISTANT_ACTION_REGISTRY, { communityFunds: true, maintenance: true });
  for (const view of ASSISTANT_ACTION_REGISTRY.views.filter((item) => !['dashboard', 'ai-assistant'].includes(item))) {
    const label = view === 'community-funds' ? 'community funds' : view === 'sandbox' ? 'PayPal Sandbox' : view.replaceAll('-', ' ');
    assert.ok(greeting.toLowerCase().includes(label.toLowerCase()), `registered view ${view} is named in the greeting`);
  }
});

test('first interaction greeting uses shared speech output once per session and replay remains available', async () => {
  const saved = store(), utterances = [], speechOutput = { speak(value) { utterances.push(value); return Promise.resolve({ ok: true }); } };
  const speaker = createIntroSpeaker({ registry: ASSISTANT_ACTION_REGISTRY, speechOutput, sessionStore: saved });
  assert.equal(speaker.speak(), true);
  assert.match(utterances[0], /tap the mic and tell me what you need/i);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved.getItem('novapay-voice-greeting-spoken'), 'true');
  assert.equal(speaker.speak(), false);
  assert.equal(speaker.replay(), true);
  assert.equal(utterances.length, 2);
});

test('blocked speech and unavailable browser speech fail without throwing', () => {
  const speaker = createIntroSpeaker({ registry: ASSISTANT_ACTION_REGISTRY, speechOutput: { speak() { throw new Error('blocked'); } }, sessionStore: store() });
  assert.equal(speaker.speak(), false);
  const unsupported = createIntroSpeaker({ registry: ASSISTANT_ACTION_REGISTRY, sessionStore: store() });
  assert.equal(unsupported.speak(), false);
});

test('a speech error clears the session marker so the user may retry', async () => {
  const saved = store(), utterances = [], speechOutput = { speak(value) { utterances.push(value); return Promise.resolve({ ok: false, error: 'network' }); } };
  const speaker = createIntroSpeaker({ registry: ASSISTANT_ACTION_REGISTRY, speechOutput, sessionStore: saved });
  speaker.speak(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saved.getItem('novapay-voice-greeting-spoken'), null);
  assert.equal(speaker.speak(), true);
});


test('intro directs users to tap the mic for voice input', () => {
  const greeting = buildVoiceGreeting(ASSISTANT_ACTION_REGISTRY);
  assert.match(greeting, /tap the mic and tell me what you need/i);
  assert.doesNotMatch(greeting, new RegExp(['Hey', 'NovaPay'].join(' '), 'i'));
});
