import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { describe } = createRequire(import.meta.url)('../../src/voice-indicator.js');

test('connected states show the green-light-in-red-ring look with a live label', () => {
  assert.deepEqual(describe({ enabled: true, state: 'idle', message: 'x' }), { connected: true, text: 'Listening', sub: '' });
  assert.equal(describe({ enabled: true, state: 'capturing' }).text, 'Listening');
  assert.equal(describe({ enabled: true, state: 'thinking' }).text, 'Thinking…');
  assert.equal(describe({ enabled: true, state: 'speaking' }).text, 'Speaking…');
});

test('anything else is the red line "Not connected" with a reason', () => {
  assert.deepEqual(describe(null), { connected: false, text: 'Not connected', sub: 'Tap to turn on' });
  assert.equal(describe({ enabled: false, state: 'off' }).sub, 'Tap to turn on');
  const blocked = describe({ enabled: false, state: 'paused', problem: true, message: 'Microphone is blocked.' });
  assert.equal(blocked.connected, false); assert.equal(blocked.sub, 'Microphone is blocked.');
  const offline = describe({ enabled: true, state: 'idle', problem: true, message: 'Cannot reach the browser’s speech service.' });
  assert.equal(offline.connected, false);
  assert.equal(describe({ enabled: true, state: 'idle' }, false).sub, 'Voice needs Chrome or Edge');
});
