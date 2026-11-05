import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const dashboardData = require('../../src/dashboard-data.js');
const live = await readFile(new URL('../../src/reports-live.js', import.meta.url), 'utf8');

test('report range dates use local calendar dates in Asia/Kolkata', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Kolkata';
  try {
    assert.equal(dashboardData.localDate(new Date(2026, 10, 1)), '2026-11-01');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
  assert.match(live, /dashboard\.localDate\(from\)/);
  assert.match(live, /dashboard\.localDate\(now\)/);
});

test('overlapping report refreshes let only the newest request render', () => {
  assert.match(live, /request = \+\+sequence/);
  assert.match(live, /if \(request !== sequence\) return;/);
  assert.doesNotMatch(live, /if \(loading\) return/);
  assert.doesNotMatch(live, /status\("Loading organization reports…"\); if \(retry\) retry\.hidden = true; clearValues\(\)/);
  assert.match(live, /Couldn't refresh organization reports\. Showing the last loaded values\./);
});
