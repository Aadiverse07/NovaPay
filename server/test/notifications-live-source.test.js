import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('notification bell replaces static alerts with authenticated org API data and empty/error states', async () => {
  const [html, moduleSource] = await Promise.all([
    readFile(new URL('../../dashboard.html', import.meta.url), 'utf8'),
    readFile(new URL('../../src/notifications-live.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="notification-items"/);
  assert.match(html, /No notifications for this organization/);
  assert.doesNotMatch(html, /Proposals ready for review|NovaPay AI insight ready|2 new/);
  assert.match(html, /src="src\/notifications-live\.js"/);
  assert.match(moduleSource, /api\.request\("\/api\/notifications\?limit=50&offset=0"\)/);
  assert.match(moduleSource, /api\.request\("\/api\/notifications\/" \+ encodeURIComponent\(row\.id\) \+ "\/read"/);
  assert.match(moduleSource, /Couldn't load organization notifications/);
  assert.match(moduleSource, /auth\.mode !== "supabase"/);
});

test('Run scan controls use the authenticated client, role gate, live status, and refresh affected views', async () => {
  const [html, moduleSource] = await Promise.all([
    readFile(new URL('../../dashboard.html', import.meta.url), 'utf8'),
    readFile(new URL('../../src/notifications-live.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="notif-run-scan"[^>]*hidden>Run scan/);
  assert.match(html, /id="tx-run-scan"[^>]*hidden>Run scan/);
  assert.match(html, /id="notif-scan-status"[^>]*aria-live="polite"/);
  assert.match(html, /id="tx-scan-status"[^>]*aria-live="polite"/);
  assert.match(moduleSource, /api\.request\("\/api\/anomalies\/run", \{ method: "POST", body: \{\} \}\)/);
  assert.match(moduleSource, /\["owner", "admin", "accountant"\]/);
  assert.match(moduleSource, /Your role can't run scans\. Ask an owner, admin or accountant\./);
  assert.match(moduleSource, /Scan complete: no new findings \(already recorded today\)\./);
  assert.match(moduleSource, /api\.invalidate\(\["notifications", "transactions"\]\)/);
  assert.match(moduleSource, /window\.NovaPayFinancialViews\.loadTransactions\(\)/);
  assert.match(moduleSource, /button\.textContent = "Scanning…"/);
});
