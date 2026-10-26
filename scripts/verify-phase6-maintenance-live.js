import 'dotenv/config';
import fs from 'node:fs';
import { createApp } from '../server/src/app.js';
import { config } from '../server/src/config.js';

const journalPath = new URL('../docs/WORKLOG.md', import.meta.url);
const sb = config.SUPABASE_URL.replace(/\/$/, '');
const serviceKey = config.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = config.SUPABASE_ANON_KEY;
const serviceHeaders = { apikey: serviceKey, ...(serviceKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${serviceKey}` }), 'Content-Type': 'application/json' };
const anonHeaders = { apikey: anonKey, 'Content-Type': 'application/json' };
const fixture = {
  owner: { email: 'novapay-phase3-owner-a@example.test', role: 'owner' },
  approver: { email: 'novapay-phase3-approver@example.test', role: 'approver' },
  accountant: { email: 'novapay-phase3-accountant@example.test', role: 'accountant' },
};
const orgName = 'NovaPay Phase 3 Verification A';
const records = {
  contractor: 'T3 Fixed Live Verification Contractor',
  low: { title: 'T3 Fixed Live Self Approval', documentRef: 'T3-LIVE-QUOTE-LOW', amountMinor: 9999, requester: 'owner' },
  threshold: { title: 'T3 Fixed Live Dual Approval', documentRef: 'T3-LIVE-QUOTE-THRESHOLD', amountMinor: 10000, requester: 'accountant' },
};
const tokens = {};
const identities = {};
let orgId;
let apiBase;
let lastFinished = 'checkpoint 6f068d9';
const apiSteps = [];

function stamp() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date());
}
function updatePointer(current, next) {
  const file = fs.readFileSync(journalPath, 'utf8');
  const start = file.indexOf('## RESUME POINTER');
  const end = file.indexOf('\n\n', start);
  if (start < 0 || end < 0) return;
  const block = `## RESUME POINTER\n- Current task: Phase 6 T3 live maintenance workflow verification; user confirmed migration 0009 applied. Current action: ${current}.\n- Last finished step: ${lastFinished}.\n- Next step: ${next}.\n- Pending human action: none for T3 migration; do not provision new users or organizations.`;
  fs.writeFileSync(journalPath, file.slice(0, start) + block + file.slice(end));
}
function journal(kind, text) {
  fs.appendFileSync(journalPath, `${kind} — ${stamp()} Asia/Kolkata: ${text}\n`);
}
async function step(label, why, action) {
  updatePointer(label, `complete ${label}; then proceed with the next verifier action`);
  journal('ABOUT TO', `${label}. Reason: ${why}`);
  try {
    const result = await action();
    lastFinished = label;
    journal('RESULT', `PASS: ${label}; ${result?.detail || 'completed'}. NEXT: ${result?.next || 'continue the T3 verifier'}.`);
    updatePointer('continuing T3 verifier', result?.next || 'continue the T3 verifier');
    return result?.value;
  } catch (error) {
    const safe = String(error?.message || 'step failed').replace(/https?:\/\/\S+/g, '[URL]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]').slice(0, 140);
    journal('RESULT', `FAIL: ${label}; ${safe}. NEXT: inspect this step; reuse deterministic rows and do not recreate them.`);
    updatePointer(`failed at ${label}`, `inspect failure ${label}; resume with existing rows`);
    throw error;
  }
}
const q = (params) => new URLSearchParams(params).toString();
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, body };
}
async function service(path, options = {}) {
  return request(`${sb}${path}`, { ...options, headers: { ...serviceHeaders, ...(options.headers || {}) } });
}
async function authenticate(label) {
  const email = fixture[label].email;
  const generated = await step(`Generate one-time test link for fixed ${label} fixture`, 'authenticate the existing named user without resetting its password or sending email', () => service('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) }));
  if (generated.status !== 200 || !generated.body?.hashed_token) throw new Error(`fixed-${label}-magiclink-unavailable`);
  const verified = await step(`Exchange one-time link for fixed ${label} JWT`, 'obtain an ordinary user token in memory for API and RLS checks', () => request(`${sb}/auth/v1/verify`, { method: 'POST', headers: anonHeaders, body: JSON.stringify({ type: 'magiclink', token_hash: generated.body.hashed_token }) }));
  if (verified.status !== 200 || !verified.body?.access_token) throw new Error(`fixed-${label}-signin-failed`);
  tokens[label] = verified.body.access_token;
  return verified.body.user?.id;
}
async function api(label, path, { method = 'GET', body } = {}) {
  return request(`${apiBase}${path}`, {
    method,
    headers: { apikey: anonKey, Authorization: `Bearer ${tokens[label]}`, 'X-Org-Id': orgId, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function apiStep(label, actor, path, options = {}) {
  const result = await step(label, `exercise authenticated endpoint ${path} as a fixed ${actor} fixture`, async () => {
    const response = await api(actor, path, options);
    return { value: response, detail: `HTTP ${response.status}; error_code=${response.body?.error?.code || 'none'}` };
  });
  apiSteps.push({ label, status: result.status, body: result.body });
  return result;
}
async function lookup(path, label) {
  const result = await step(label, 'read existing fixed verifier fixture state without mutating it', () => service(`/rest/v1/${path}`));
  if (result.status !== 200 || !Array.isArray(result.body)) throw new Error(`${label}-failed`);
  return result.body;
}
function expectStatus(result, statuses, label) {
  if (!statuses.includes(result.status)) throw new Error(`${label}-unexpected-http-${result.status}`);
}
async function getRequest(def) {
  const rows = await lookup(`maintenance_requests?${q({ select: 'id,status,requested_by,chosen_quotation_id,estimate_minor,title', org_id: `eq.${orgId}`, title: `eq.${def.title}`, limit: '2' })}`, `Inspect deterministic request ${def.title}`);
  if (rows.length > 1) throw new Error('duplicate-deterministic-maintenance-request');
  if (rows.length) return rows[0];
  const created = await apiStep(`Create fixed request ${def.title}`, def.requester, '/api/funds/maintenance', { method: 'POST', body: { title: def.title, scope: 'Fixed live T3 workflow verification; no work or payment will be performed.', estimateMinor: def.amountMinor } });
  expectStatus(created, [201], 'create-request');
  return created.body.request;
}
async function getContractor() {
  const rows = await lookup(`fund_contractors?${q({ select: 'id,name', org_id: `eq.${orgId}`, name: `eq.${records.contractor}`, limit: '2' })}`, 'Inspect deterministic contractor');
  if (rows.length > 1) throw new Error('duplicate-deterministic-contractor');
  if (rows.length) return rows[0];
  const created = await apiStep('Create fixed verification contractor', 'accountant', '/api/funds/contractors', { method: 'POST', body: { name: records.contractor } });
  expectStatus(created, [201], 'create-contractor');
  return created.body.contractor;
}
async function getQuotation(def, requestId, contractorId) {
  const rows = await lookup(`fund_quotations?${q({ select: 'id,maintenance_request_id,amount_minor,document_ref', org_id: `eq.${orgId}`, maintenance_request_id: `eq.${requestId}`, document_ref: `eq.${def.documentRef}`, limit: '2' })}`, `Inspect deterministic quotation ${def.documentRef}`);
  if (rows.length > 1) throw new Error('duplicate-deterministic-quotation');
  if (rows.length) return rows[0];
  const created = await apiStep(`Add fixed quotation ${def.documentRef}`, 'accountant', `/api/funds/maintenance/${requestId}/quotations`, { method: 'POST', body: { contractorId, amountMinor: def.amountMinor, documentRef: def.documentRef } });
  expectStatus(created, [201], 'add-quotation');
  return created.body.quotation;
}
async function assertRejected(label, actor, requestId, suffix, body, status, code) {
  const result = await apiStep(label, actor, `/api/funds/maintenance/${requestId}/${suffix}`, { method: 'POST', body });
  expectStatus(result, [status], label);
  if (result.body?.error?.code !== code) throw new Error(`${label}-wrong-error-code`);
  return result;
}
async function currentRequest(requestId, label) {
  const rows = await lookup(`maintenance_requests?${q({ select: 'id,status,requested_by,chosen_quotation_id,estimate_minor', org_id: `eq.${orgId}`, id: `eq.${requestId}`, limit: '1' })}`, label);
  if (rows.length !== 1) throw new Error(`${label}-missing`);
  return rows[0];
}
async function ensureStage(def, row, ownQuote, foreignQuote, contractor) {
  const verifyPath = `/api/funds/maintenance/${row.id}/contractor-verification`;
  const scopePath = `/api/funds/maintenance/${row.id}/scope-approval`;
  if (row.status === 'requested') throw new Error(`quotation-not-present-for-${def.title}`);
  if (row.status === 'quoting') {
    if (def.requester === 'owner') {
      await assertRejected(`Reject requester self-approval ${def.title}`, 'owner', row.id, 'scope-approval', { quotationId: ownQuote.id }, 403, 'FUND_FORBIDDEN');
    }
    await assertRejected(`Reject skipped contractor verification ${def.title}`, 'approver', row.id, 'contractor-verification', {}, 409, 'FUND_STATE_CONFLICT');
    if (foreignQuote) await assertRejected(`Reject foreign quotation ${def.title}`, 'approver', row.id, 'scope-approval', { quotationId: foreignQuote.id }, 409, 'FUND_STATE_CONFLICT');
    const approved = await apiStep(`Approve scope ${def.title}`, 'approver', scopePath, { method: 'POST', body: { quotationId: ownQuote.id, note: 'Verified test scope.' } });
    expectStatus(approved, [200], 'scope-approval');
    row = await currentRequest(row.id, `Confirm scope state ${def.title}`);
  }
  if (row.status === 'scope_approved') {
    if (def.requester === 'owner') await assertRejected(`Reject requester contractor verification ${def.title}`, 'owner', row.id, 'contractor-verification', {}, 403, 'FUND_FORBIDDEN');
    const verifier = def.requester === 'accountant' ? 'owner' : 'approver';
    const verified = await apiStep(`Verify contractor ${def.title}`, verifier, verifyPath, { method: 'POST', body: {} });
    expectStatus(verified, [200], 'contractor-verification');
    row = await currentRequest(row.id, `Confirm verified state ${def.title}`);
  }
  if (row.status === 'contractor_verified') {
    if (def.amountMinor < 10000) {
      const approval = await apiStep(`Approve below-threshold payment ${def.title}`, 'approver', `/api/funds/maintenance/${row.id}/payment-approval`, { method: 'POST', body: { note: 'One distinct approver below threshold.' } });
      expectStatus(approval, [200], 'below-threshold-payment');
      if (approval.body?.status !== 'payment_approved' || approval.body?.required !== 1 || approval.body?.approvals !== 1) throw new Error('below-threshold-approval-count-mismatch');
    } else {
      const approvals = await lookup(`fund_approvals_chain?${q({ select: 'approver_id,step,decision', org_id: `eq.${orgId}`, maintenance_request_id: `eq.${row.id}`, step: 'eq.payment', decision: 'eq.approved' })}`, `Inspect distinct threshold approvals ${def.title}`);
      const distinct = new Set(approvals.map((item) => item.approver_id));
      if (!distinct.size) {
        const first = await apiStep(`Record first threshold approval ${def.title}`, 'approver', `/api/funds/maintenance/${row.id}/payment-approval`, { method: 'POST', body: { note: 'First distinct threshold approval.' } });
        expectStatus(first, [200], 'first-threshold-approval');
        if (first.body?.status !== 'contractor_verified' || first.body?.required !== 2 || first.body?.approvals !== 1) throw new Error('first-threshold-count-mismatch');
      }
    }
    row = await currentRequest(row.id, `Confirm payment approval stage ${def.title}`);
  }
  if (def.amountMinor >= 10000) {
    const approvals = await lookup(`fund_approvals_chain?${q({ select: 'approver_id,step,decision', org_id: `eq.${orgId}`, maintenance_request_id: `eq.${row.id}`, step: 'eq.payment', decision: 'eq.approved' })}`, `Inspect threshold approvals before completion ${def.title}`);
    const distinct = new Set(approvals.map((item) => item.approver_id));
    const ownerId = identities.owner;
    const approverId = identities.approver;
    if (distinct.size === 1 && distinct.has(approverId)) {
      const result = await assertRejected(`Reject duplicate threshold approver ${def.title}`, 'approver', row.id, 'payment-approval', { note: 'Duplicate approval probe.' }, 409, 'CONFLICT');
      if (result.body?.error?.code !== 'CONFLICT') throw new Error('duplicate-approval-not-rejected');
      const second = await apiStep(`Record second distinct threshold approval ${def.title}`, 'owner', `/api/funds/maintenance/${row.id}/payment-approval`, { method: 'POST', body: { note: 'Second distinct threshold approval.' } });
      expectStatus(second, [200], 'second-threshold-approval');
      if (second.body?.status !== 'payment_approved' || second.body?.required !== 2 || second.body?.approvals !== 2) throw new Error('second-threshold-count-mismatch');
    } else if (distinct.size < 2) {
      throw new Error('threshold-approval-state-cannot-resume-safely');
    }
  }
  row = await currentRequest(row.id, `Verify final state ${def.title}`);
  if (row.status !== 'payment_approved') throw new Error(`unexpected-final-state-${row.status}`);
  return row.status;
}

const oldLog = console.log;
console.log = () => {};
let server;
try {
  if (!config.hasSupabase) throw new Error('Supabase is not configured');
  identities.owner = await authenticate('owner');
  identities.approver = await authenticate('approver');
  identities.accountant = await authenticate('accountant');
  const organizations = await step('Find existing fixed T3 verification organization', 'reuse the established Phase 3 verification organization; never create another organization', () => service(`/rest/v1/organizations?${q({ select: 'id', name: `eq.${orgName}`, limit: '2' })}`));
  if (organizations.status !== 200 || organizations.body?.length !== 1) throw new Error('fixed-verification-org-not-found-or-ambiguous');
  orgId = organizations.body[0].id;
  for (const label of Object.keys(fixture)) {
    const member = await step(`Verify fixed ${label} membership role`, 'ensure the existing actor has the expected role in the one fixed verifier organization', () => service(`/rest/v1/memberships?${q({ select: 'role', org_id: `eq.${orgId}`, user_id: `eq.${identities[label]}`, limit: '1' })}`));
    if (member.status !== 200 || member.body?.[0]?.role !== fixture[label].role) throw new Error(`fixed-${label}-role-mismatch`);
  }
  const app = createApp({ config });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  apiBase = `http://127.0.0.1:${server.address().port}`;
  const health = await step('Check fresh local API health', 'exercise the current source code, including the SQLSTATE fix, on an ephemeral local port', () => request(`${apiBase}/api/status`));
  if (health.status !== 200) throw new Error('local-api-health-failed');
  const settings = await lookup(`fund_transparency_settings?${q({ select: 'two_person_approval_threshold_minor', org_id: `eq.${orgId}`, limit: '1' })}`, 'Check exact live two-person approval threshold');
  if (settings.length !== 1 || Number(settings[0].two_person_approval_threshold_minor) !== 10000) throw new Error('live-approval-threshold-is-not-10000');
  const contractor = await getContractor();
  const low = await getRequest(records.low);
  const threshold = await getRequest(records.threshold);
  if (low.requested_by !== identities[records.low.requester] || Number(low.estimate_minor) !== records.low.amountMinor) throw new Error('low-request-fixture-mismatch');
  if (threshold.requested_by !== identities[records.threshold.requester] || Number(threshold.estimate_minor) !== records.threshold.amountMinor) throw new Error('threshold-request-fixture-mismatch');
  const lowQuote = await getQuotation(records.low, low.id, contractor.id);
  const thresholdQuote = await getQuotation(records.threshold, threshold.id, contractor.id);
  if (lowQuote.maintenance_request_id !== low.id || thresholdQuote.maintenance_request_id !== threshold.id) throw new Error('quotation-request-link-mismatch');
  await step('Verify under-threshold T3 lifecycle', 'exercise requester self-approval rejection, skipped-state rejection, foreign-quotation rejection, contractor verification, and single-approver threshold', () => ensureStage(records.low, low, lowQuote, thresholdQuote, contractor));
  await step('Verify exact-threshold T3 lifecycle', 'exercise requester/accountant separation, contractor verification, duplicate approver rejection, and two distinct approvers at exactly 10000 minor units', () => ensureStage(records.threshold, threshold, thresholdQuote, lowQuote, contractor));
  const summary = { result: 'PASS', apiStatus: 200, ordinaryJwtRpcDenials: '6/6 HTTP 403 verified in preflight', lowAmountMinor: 9999, lowFinalStatus: 'payment_approved', thresholdAmountMinor: 10000, thresholdFinalStatus: 'payment_approved', thresholdApprovals: 2, thresholdApproversDistinct: true, apiSteps: apiSteps.length, fixtureUsersOrOrganizationsCreated: 0 };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} catch (error) {
  process.stdout.write(`FAIL ${String(error?.message || 'T3 live verification failed').replace(/https?:\/\/\S+/g, '[URL]').slice(0, 180)}; inspect docs/WORKLOG.md for the exact failed step.\n`);
  process.exitCode = 1;
} finally {
  console.log = oldLog;
  if (server) await new Promise((resolve) => server.close(resolve));
}
