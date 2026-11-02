import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('legacy transaction fixtures and local refund simulation are restricted to explicit demo mode', async () => {
  const source = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /function addDemoRecords\(\)\{\s*if\(!window\.NovaPayAuth\|\|window\.NovaPayAuth\.mode!=="demo"\)return/);
  assert.match(source, /confirm\.addEventListener\("click",function\(\)\{\s*if\(window\.NovaPayAuth&&window\.NovaPayAuth\.mode==="supabase"\)/);
  assert.match(source, /window\.NovaPayAuth&&window\.NovaPayAuth\.mode==="demo"\?txData\[id\]:null/);
});

test('authenticated data export does not invent an organization role or default currency', async () => {
  const source = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');
  const exportBlock = source.slice(source.indexOf('var data={exportedAt:'), source.indexOf('downloadFile("novapay-my-data.json"'));
  assert.match(exportBlock, /role:"Not included in browser export"/);
  assert.doesNotMatch(exportBlock, /role:"Business Owner"|currency:"INR"/);
  assert.match(exportBlock, /currencyDisplay:"per-record"/);
});

test('Settings role and profile use authenticated membership/session instead of fixed sample identity', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../../dashboard.html', import.meta.url), 'utf8'),
    readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="set-role" value="Loading workspace role/);
  assert.doesNotMatch(html, /NovaPay Sample Workspace|id="set-role" value="Business Owner"/);
  assert.match(source, /request\("\/api\/onboarding",\{requiresOrg:false\}\)/);
  assert.match(source, /client\.auth\.updateUser\(\{data:\{full_name:n\}\}\)/);
  assert.match(source, /"Supabase account"/);
});

test('transaction detail AI errors do not echo browser row fields or create fake approval proposals', async () => {
  const source = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /AI backend unavailable\. Available transaction data:/);
  assert.match(source, /AI service unavailable\. Please retry\./);
  assert.match(source, /There is no actionable AI finding to send\./);
});

test('Settings password updates use Supabase Auth and account deletion stays demo-only', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('../../dashboard.html', import.meta.url), 'utf8'),
    readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /NovaPayAuth\.updatePassword\(next\)/);
  assert.match(source, /button\.hidden=!demo/);
  assert.match(source, /if\(window\.NovaPayAuth&&NovaPayAuth\.mode==="supabase"\)\{showToast\("Account deletion is not available/);
  assert.match(html, /Delete demo profile/);
  assert.match(html, /does not include server-side organization records/);
});
