import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const data = require('../../src/dashboard-data.js');
const html = await readFile(new URL('../../dashboard.html', import.meta.url), 'utf8');
const live = await readFile(new URL('../../src/dashboard-live-data.js', import.meta.url), 'utf8');

test('local date formatting keeps the calendar day in Asia/Kolkata and America/Los_Angeles', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['Asia/Kolkata', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      assert.equal(data.localDate(new Date(2026, 10, 1)), '2026-11-01');
      assert.equal(data.localDate(new Date(2026, 9, 31)), '2026-10-31');
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('new dashboard sessions default to This month and date queries use local dates', () => {
  assert.match(html, /id="cashflow-tabs"[^>]*>[\s\S]*?<button type="button" class="active" data-range="month"/);
  assert.match(live, /data\.localDate\(start\)/);
  assert.match(live, /data\.localDate\(end\)/);
  assert.doesNotMatch(live, /!value\)\s*\{ start = new Date\(now\.getFullYear\(\), now\.getMonth\(\) - 1/);
});

test('dashboard refresh keeps rendered values on failure and drains the latest queued load', () => {
  assert.match(live, /if \(busy\) \{ queued = true; return; \}/);
  assert.match(live, /if \(queued\) \{ queued = false; load\(\); \}/);
  assert.doesNotMatch(live, /catch \(error\) \{ clearVisuals\(\)/);
});
