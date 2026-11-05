import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');

test('interrupted dashboard view transitions clean up without an unhandled AbortError', () => {
  assert.match(dashboard, /function cleanupViewTransition\(\)\{panels\.forEach\(function\(p\)\{p\.classList\.remove\("module-transition-active"\)\}\);\}/);
  assert.match(dashboard, /function handleViewTransitionError\(error\)\{if\(error&&error\.name!=="AbortError"/);
  assert.match(dashboard, /transition\.ready\.catch\(handleViewTransitionError\);/);
  assert.match(dashboard, /transition\.updateCallbackDone\.catch\(handleViewTransitionError\);/);
  assert.match(dashboard, /transition\.finished\.then\(cleanupViewTransition,function\(error\)\{cleanupViewTransition\(\);handleViewTransitionError\(error\);\}\)/);
  assert.doesNotMatch(dashboard, /\.finished\.finally\(/);
});
