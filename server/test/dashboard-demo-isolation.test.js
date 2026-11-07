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

test('AI proposal renderer resolves internal, source and capture transaction references', async () => {
  const [dashboard, financial] = await Promise.all([
    readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/financial-live.js', import.meta.url), 'utf8'),
  ]);
  assert.match(dashboard, /records\.find\(function\(r\)\{return String\(r\.id\|\|""\)===ref\|\|String\(r\.sourceId\|\|r\.source_id\|\|r\.captureId\|\|r\.capture_id\|\|""\)===ref\}\)/);
  assert.match(dashboard, /data-source-id=/);
  assert.match(dashboard, /data-capture-id=/);
  assert.match(dashboard, /var captureRef=String\(row\.sourceId\|\|row\.source_id\|\|row\.captureId\|\|row\.capture_id/);
  assert.match(dashboard, /NovaPayApi\.request\("\/api\/approvals\/register",\{method:"POST",body:\{approvalId:String\(proposal\.approvalId\|\|""\),proposalType:"refund",captureId:captureRef,amount:amount\.toFixed\(2\),currency:"USD"\}\}\)/);
  assert.match(financial, /tr\.dataset\.sourceId/);
  assert.match(financial, /tr\.dataset\.captureId/);
});

test('authenticated AI proposals with server approval IDs show a review link, not the legacy send card', async () => {
  const source = await readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8');
  assert.match(source, /if\(auth&&auth\.mode==="supabase"\)\{if\(!proposal\.approvalId\)return/);
  assert.match(source, /Proposal created and waiting for review\./);
  assert.match(source, /open\.textContent="Open Approvals"/);
  assert.match(source, /location\.hash="#approvals";if\(window\.NovaLive&&window\.NovaLive\.refreshApprovals\)window\.NovaLive\.refreshApprovals\(\)/);
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
