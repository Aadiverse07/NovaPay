import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const greeting = await readFile(new URL('../../src/voice-greeting.js', import.meta.url), 'utf8');
const intro = await readFile(new URL('../../src/intro.js', import.meta.url), 'utf8');

test('voice greeting listens on the intro event target and handles a completion fired before module startup', () => {
  assert.match(intro, /window\.dispatchEvent\(new Event\("novapay:opening-done"\)\)/);
  assert.match(greeting, /window\.addEventListener\('novapay:opening-done', onOpeningDone, \{ once: true \}\)/);
  assert.match(greeting, /if \(window\.__npOpeningDone\) onOpeningDone\(\);/);
  assert.match(greeting, /window\.removeEventListener\('novapay:opening-done', onOpeningDone\)/);
  assert.doesNotMatch(greeting, /document\.addEventListener\('novapay:opening-done'/);
});
