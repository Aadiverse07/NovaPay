import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { config } = await import('../server/src/config.js');
const serviceKey = config.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = config.SUPABASE_ANON_KEY;
const serviceHeaders = {
  apikey: serviceKey,
  ...(serviceKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${serviceKey}` }),
  'Content-Type': 'application/json',
};
const publicHeaders = { apikey: anonKey, 'Content-Type': 'application/json' };
const apiBase = process.env.NOVAPAY_API_URL || `http://127.0.0.1:${config.PORT}`;
const webhookUrl = process.env.NOVAPAY_WEBHOOK_URL || `${apiBase}/api/webhook`;
const suffix = randomUUID();
const startedAt = new Date().toISOString();
const runId = suffix.replaceAll('-', '');
const artifacts = { users: [], orgs: [], webhookEvents: [], extraOrgs: [], extraEvent: `phase2-security-${runId}`, captureId: null, orderId: null };
const results = [];
let serverProcess;
let helperProcess;
let outcome = 'FAIL';

if (!config.hasSupabase || !config.hasPayPal || !config.PAYPAL_WEBHOOK_ID) {
  console.error('UNVERIFIED: Supabase, PayPal Sandbox, and webhook configuration are required.');
  process.exit(2);
}

function record(name, pass, detail = '') {
  const status = typeof pass === 'string' ? pass : pass ? 'PASS' : 'FAIL';
  results.push({ name, status });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
  if (status === 'FAIL') outcome = 'FAIL';
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { response, status: response.status, body, text };
}

async function serviceRequest(pathname, options = {}) {
  const { headers = {}, ...rest } = options;
  return request(`${config.SUPABASE_URL}${pathname}`, { ...rest, headers: { ...serviceHeaders, ...headers } });
}

function userHeaders(token, orgId) {
  return { ...publicHeaders, Authorization: `Bearer ${token}`, ...(orgId ? { 'X-Org-Id': orgId } : {}) };
}

async function api(pathname, { token, orgId, method = 'GET', body } = {}) {
  return request(`${apiBase}${pathname}`, {
    method,
    headers: { ...(token ? userHeaders(token, orgId) : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function waitForApi(url, child = null) {
  for (let i = 0; i < 50; i += 1) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error('server-start-failed');
    try {
      const result = await request(`${url}/api/status`);
      if (result.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('server-unavailable');
}

async function ensureMainApi() {
  try {
    const status = await request(`${apiBase}/api/status`);
    if (status.status === 200) return;
  } catch {}
  serverProcess = spawn(process.execPath, ['server/index.js'], { cwd: root, env: process.env, stdio: 'ignore' });
  await waitForApi(apiBase, serverProcess);
}

async function adminCreateUser(email, password) {
  const result = await request(`${config.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: serviceHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (![200, 201].includes(result.status) || !result.body?.id) throw new Error('throwaway-user-create-failed');
  artifacts.users.push(result.body.id);
  return result.body.id;
}

async function signIn(email, password) {
  const result = await request(`${config.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: publicHeaders, body: JSON.stringify({ email, password }),
  });
  if (result.status !== 200 || !result.body?.access_token) throw new Error('throwaway-user-signin-failed');
  return result.body.access_token;
}

async function onboard(token, label) {
  const result = await api('/api/onboarding', { token, method: 'POST', body: { organizationName: `Phase 2 ${label} ${runId.slice(0, 8)}` } });
  if (![200, 201].includes(result.status) || !result.body?.organizationId) throw new Error(`throwaway-org-${label}-create-failed`);
  artifacts.orgs.push(result.body.organizationId);
  return result.body.organizationId;
}

async function checkPhase2Objects() {
  const tables = ['accounts','journal_entries','journal_lines','transactions','paypal_orders','paypal_captures','paypal_events','approvals','reconciliation_runs'];
  let present = true;
  for (const table of tables) {
    const result = await serviceRequest(`/rest/v1/${table}?select=id&limit=0`);
    if (result.status !== 200) present = false;
  }
  record('Phase 2 financial tables available in live REST schema', present);
}

async function checkRpcPermissions(userId, userToken, orgId) {
  const fakeId = `APR-${runId}`;
  const args = [
    ['create_organization_for_user',{ p_user_id:userId,p_name:'Phase 2 probe',p_request_id:runId }],
    ['create_organization_for_user_phase1',{ p_user_id:userId,p_name:'Phase 2 probe',p_request_id:runId }],
    ['record_paypal_order',{ p_org:orgId,p_request_key:runId,p_paypal_order_id:`P2-${runId.slice(0,12)}`,p_amount_minor:100,p_currency:'USD',p_status:'CREATED',p_approve_url:null,p_state:'Created' }],
    ['set_paypal_order_state',{ p_org:orgId,p_paypal_order_id:`P2-${runId.slice(0,12)}`,p_state:'Created',p_status:'CREATED' }],
    ['begin_paypal_capture',{ p_org:orgId,p_paypal_order_id:`P2-${runId.slice(0,12)}` }],
    ['record_paypal_capture',{ p_org:orgId,p_paypal_order_id:`P2-${runId.slice(0,12)}`,p_capture:{},p_lines:[] }],
    ['record_paypal_capture_event',{ p_paypal_order_id:`P2-${runId.slice(0,12)}`,p_capture:{},p_lines:[] }],
    ['register_refund_approval',{ p_org:orgId,p_approval_id:fakeId,p_capture_id:'missing',p_amount_minor:1,p_currency:'USD',p_created_by:userId,p_request_payload:{} }],
    ['decide_refund_approval',{ p_org:orgId,p_approval_id:fakeId,p_decision:'approve',p_note:'probe',p_reviewer:userId,p_request_id:runId }],
    ['finish_refund',{ p_org:orgId,p_approval_id:fakeId,p_refund:{},p_lines:[] }],
    ['set_refund_outcome',{ p_org:orgId,p_approval_id:fakeId,p_status:'failed',p_result:{},p_error:'probe' }],
    ['receive_paypal_event',{ p_event_id:artifacts.extraEvent,p_event_type:'PHASE2.SECURITY.PROBE',p_raw_body:'e30=',p_payload:{},p_headers:{} }],
    ['claim_paypal_event',{ p_id:randomUUID() }],
    ['complete_paypal_event',{ p_id:randomUUID(),p_verification:'failed',p_org:null,p_status:'failed',p_error:'probe' }],
    ['list_pending_paypal_events',{}],
    ['reconcile_org_financials',{ p_org:orgId,p_currency:'USD' }],
    ['get_org_trial_balance',{ p_org:orgId,p_currency:'USD' }],
  ];
  let allDenied = true;
  for (const [name, body] of args) {
    const result = await request(`${config.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: userHeaders(userToken), body: JSON.stringify(body),
    });
    const denied = result.status === 401 || result.status === 403;
    allDenied &&= denied;
    if (name.startsWith('create_organization_for_user') && result.body?.organizationId) artifacts.extraOrgs.push(result.body.organizationId);
  }
  record('Ordinary JWT denied on all Phase 2 posting/refund/financial RPCs', allDenied, `${args.length} RPCs tested`);
}

async function checkCrossTenant(userTokenB, orgA) {
  const tables = ['accounts','journal_entries','journal_lines','transactions','paypal_orders','paypal_captures','paypal_events','approvals','reconciliation_runs'];
  let isolated = true;
  for (const table of tables) {
    const query = new URLSearchParams({ select: 'id', org_id: `eq.${orgA}`, limit: '5' });
    const result = await request(`${config.SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: userHeaders(userTokenB) });
    isolated &&= result.status === 200 && Array.isArray(result.body) && result.body.length === 0;
  }
  record('Org B cannot read Org A Phase 2 tables via user JWT/RLS', isolated, `${tables.length} tables checked`);
}

async function checkUnbalancedEntry(orgId) {
  const result = await serviceRequest('/rest/v1/journal_entries', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ org_id:orgId,source_type:'phase2_probe',source_id:runId,description:'Unbalanced verification probe',currency:'USD' }),
  });
  record('Database deferred trigger rejects an unbalanced journal entry', result.status >= 400 && result.status < 500, `HTTP ${result.status}`);
}

async function countCaptureEntries(orgId, captureId) {
  const query = new URLSearchParams({ select: 'id',org_id: `eq.${orgId}`,source_type: 'eq.capture',source_id: `eq.${captureId}` });
  const result = await serviceRequest(`/rest/v1/journal_entries?${query}`);
  if (result.status !== 200 || !Array.isArray(result.body)) throw new Error('capture-ledger-query-failed');
  return result.body.length;
}

async function waitForCaptureWebhook(captureId, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const query = new URLSearchParams({ select:'id,event_id,event_type,raw_body,payload,headers,verification_status,processing_status,org_id', order:'created_at.desc', limit:'100' });
    const result = await serviceRequest(`/rest/v1/paypal_events?${query}`);
    if (result.status === 200 && Array.isArray(result.body)) {
      const row = result.body.find((event) => event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && event.payload?.resource?.id === captureId);
      if (row) {
        artifacts.webhookEvents.push(row.event_id);
        if (row.verification_status === 'verified' && row.processing_status === 'processed') return row;
        if (['failed','error','dead_letter'].includes(row.verification_status) || row.processing_status === 'dead_letter') return row;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

function decodeBytea(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex').toString('utf8');
  if (value.startsWith('\\\\x')) return Buffer.from(value.slice(3), 'hex').toString('utf8');
  return value;
}

async function replayWebhookFiveTimes(row) {
  const rawBody = decodeBytea(row.raw_body);
  if (!rawBody || !row.headers) throw new Error('webhook-replay-material-unavailable');
  const headers = { 'Content-Type':'application/json' };
  for (const name of ['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time']) {
    if (row.headers[name]) headers[name] = row.headers[name];
  }
  const before = await countCaptureEntries(orgA, artifacts.captureId);
  const statuses = [];
  for (let i = 0; i < 5; i += 1) {
    const result = await request(webhookUrl, { method:'POST',headers,body:rawBody });
    statuses.push(result.status);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const after = await countCaptureEntries(orgA, artifacts.captureId);
  record('Same verified webhook replayed five times produces exactly one capture journal entry', statuses.every((status) => status === 200) && before === 1 && after === 1, `HTTP ${statuses.join('/')} · entries ${before}→${after}`);
}

async function startHelperServer(port) {
  const child = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio:'ignore' });
  await waitForApi(`http://127.0.0.1:${port}`, child);
  return child;
}

async function assertPersistentState(url, token, orgId, orderRequestKey, orderId, captureId, approvalId) {
  const reloadedOrder = await request(`${url}/api/paypal/create-order`, {
    method:'POST', headers:userHeaders(token,orgId),
    body:JSON.stringify({amount:'1.00',currency:'USD',requestKey:orderRequestKey}),
  });
  const transactions = await request(`${url}/api/transactions?type=capture&limit=100`, { headers:userHeaders(token,orgId) });
  const approvals = await request(`${url}/api/approvals?limit=100`, { headers:userHeaders(token,orgId) });
  const entries = await request(`${url}/api/ledger/entries?limit=100`, { headers:userHeaders(token,orgId) });
  const captureQuery = new URLSearchParams({select:'paypal_capture_id',org_id:`eq.${orgId}`,paypal_capture_id:`eq.${captureId}`,limit:'1'});
  const captures = await serviceRequest(`/rest/v1/paypal_captures?${captureQuery}`);
  return reloadedOrder.status === 200 && reloadedOrder.body?.orderId === orderId
    && transactions.status === 200 && transactions.body?.transactions?.some((row) => row.captureId === captureId)
    && captures.status === 200 && captures.body?.length === 1
    && approvals.status === 200 && approvals.body?.approvals?.some((row) => row.id === approvalId)
    && entries.status === 200 && entries.body?.entries?.some((row) => row.source_type === 'capture' && row.source_id === captureId);
}

async function checkRestartPersistence(token, orgId, requestKey, orderId, captureId, approvalId) {
  const port = 34871;
  helperProcess = await startHelperServer(port);
  let ok = await assertPersistentState(`http://127.0.0.1:${port}`,token,orgId,requestKey,orderId,captureId,approvalId);
  helperProcess.kill('SIGTERM'); await once(helperProcess,'exit'); helperProcess = null;
  helperProcess = await startHelperServer(port);
  ok &&= await assertPersistentState(`http://127.0.0.1:${port}`,token,orgId,requestKey,orderId,captureId,approvalId);
  helperProcess.kill('SIGTERM'); await once(helperProcess,'exit'); helperProcess = null;
  record('Capture and ledger data survive a backend process restart', ok);
}

async function run() {
  await checkPhase2Objects();
  await ensureMainApi();
  const userAEmail = `novapay-phase2-a-${suffix}@example.test`;
  const userBEmail = `novapay-phase2-b-${suffix}@example.test`;
  const passA = randomBytes(32).toString('base64url');
  const passB = randomBytes(32).toString('base64url');
  const userA = await adminCreateUser(userAEmail, passA);
  const userB = await adminCreateUser(userBEmail, passB);
  const [tokenA, tokenB] = await Promise.all([signIn(userAEmail,passA),signIn(userBEmail,passB)]);
  orgA = await onboard(tokenA,'A');
  const orgB = await onboard(tokenB,'B');
  record('Throwaway Phase 2 test organizations prepared', true);

  await checkRpcPermissions(userA,tokenA,orgA);
  await checkCrossTenant(tokenB,orgA);
  await checkUnbalancedEntry(orgA);

  const requestKey = randomBytes(16).toString('hex');
  const create = await api('/api/paypal/create-order',{token:tokenA,orgId:orgA,method:'POST',body:{amount:'1.00',currency:'USD',requestKey}});
  if (create.status !== 200 || !create.body?.approveUrl || !create.body?.orderId) throw new Error('sandbox-order-create-failed');
  artifacts.orderId = create.body.orderId;
  console.log(`BUYER ACTION REQUIRED: open ${create.body.approveUrl} in a browser, sign in with a PayPal Sandbox buyer, approve the $1.00 payment, and return here. No real payment is involved.`);
  const rl = createInterface({ input:stdin, output:stdout });
  await rl.question('After approving and returning from PayPal, press Enter to continue: ');
  rl.close();

  const capture = await api('/api/paypal/capture',{token:tokenA,orgId:orgA,method:'POST',body:{orderId:artifacts.orderId}});
  if (capture.status !== 200 || !capture.body?.captureId || capture.body.status !== 'COMPLETED') throw new Error('sandbox-capture-failed');
  artifacts.captureId = capture.body.captureId;
  record('PayPal Sandbox order captured',true);

  const captureEntries = await countCaptureEntries(orgA,artifacts.captureId);
  record('Capture posted exactly once to the live ledger',captureEntries === 1,`entries=${captureEntries}`);
  await checkRestartPersistence(tokenA,orgA,artifacts.captureId);

  const webhook = await waitForCaptureWebhook(artifacts.captureId);
  const verified = webhook?.verification_status === 'verified' && webhook?.processing_status === 'processed';
  record('PayPal capture webhook verified and processed',webhook ? verified : 'UNVERIFIED',webhook ? `verification=${webhook.verification_status}; processing=${webhook.processing_status}` : 'no matching event observed within 120 seconds');
  if (verified) await replayWebhookFiveTimes(webhook);
  else record('Same verified webhook replayed five times produces exactly one capture journal entry','UNVERIFIED','No verified webhook event available to replay.');

  const overId = `APR-OVER-${runId.slice(0,16)}`;
  const over = await api('/api/approvals/register',{token:tokenA,orgId:orgA,method:'POST',body:{proposalType:'refund',approvalId:overId,captureId:artifacts.captureId,amount:(Number(capture.body.amount)+0.01).toFixed(2),currency:'USD'}});
  record('Refund amount above captured amount is rejected',over.status === 400,`HTTP ${over.status}`);

  const approvalId = `APR-LIVE-${runId.slice(0,16)}`;
  const registration = await api('/api/approvals/register',{token:tokenA,orgId:orgA,method:'POST',body:{proposalType:'refund',approvalId,captureId:artifacts.captureId,amount:'0.01',currency:'USD'}});
  if (registration.status !== 200 || !registration.body?.registered) throw new Error('refund-approval-register-failed');
  await checkRestartPersistence(tokenA,orgA,requestKey,artifacts.orderId,artifacts.captureId,approvalId);
  const since = new Date().toISOString();
  const decisions = await Promise.all([
    api(`/api/approvals/${approvalId}/decision`,{token:tokenA,orgId:orgA,method:'POST',body:{decision:'approve',note:'Phase 2 sandbox verification'}}),
    api(`/api/approvals/${approvalId}/decision`,{token:tokenA,orgId:orgA,method:'POST',body:{decision:'approve',note:'Phase 2 sandbox verification'}}),
  ]);
  await new Promise((resolve) => setTimeout(resolve,1500));
  const logsQuery = new URLSearchParams({select:'message',org_id:`eq.${orgA}`,occurred_at:`gte.${since}`,limit:'100'});
  const logs = await serviceRequest(`/rest/v1/api_activity?${logsQuery}`);
  const refundCalls = (logs.body || []).filter((row) => String(row.message).includes(`/v2/payments/captures/${artifacts.captureId}/refund`)).length;
  const savedApproval = await serviceRequest(`/rest/v1/approvals?${new URLSearchParams({select:'status,result',org_id:`eq.${orgA}`,id:`eq.${approvalId}`,limit:'1'})}`);
  const refundId = savedApproval.body?.[0]?.result?.id;
  record('Double Approve produces one completed PayPal Sandbox refund',refundCalls === 1 && Boolean(refundId) && decisions.some((r) => r.status === 200),`providerCalls=${refundCalls}; HTTP=${decisions.map((r)=>r.status).join('/')}`);

  const trial = await api('/api/ledger/trial-balance',{token:tokenA,orgId:orgA});
  record('Trial balance debits equal credits',trial.status === 200 && trial.body?.balanced === true && trial.body?.totals?.debitMinor === trial.body?.totals?.creditMinor);
  const reconciliation = await api('/api/reconciliation',{token:tokenA,orgId:orgA});
  record('Reconciliation is clean',reconciliation.status === 200 && reconciliation.body?.run?.status === 'clean',`status=${reconciliation.body?.run?.status || reconciliation.status}`);
  outcome = results.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL';
}

async function cleanup() {
  for (const eventId of new Set([artifacts.extraEvent,...artifacts.webhookEvents])) {
    try { await serviceRequest(`/rest/v1/paypal_events?event_id=eq.${encodeURIComponent(eventId)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}); } catch {}
  }
  for (const orgId of new Set([...artifacts.orgs,...artifacts.extraOrgs])) {
    try { await serviceRequest(`/rest/v1/organizations?id=eq.${encodeURIComponent(orgId)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}); } catch {}
  }
  for (const userId of artifacts.users) {
    try { const result=await request(`${config.SUPABASE_URL}/auth/v1/admin/users/${userId}`,{method:'DELETE',headers:serviceHeaders}); if (!result.response.ok) outcome='FAIL'; } catch { outcome='FAIL'; }
  }
  if (helperProcess) { const exited=once(helperProcess,'exit'); helperProcess.kill('SIGTERM'); await exited.catch(()=>{}); helperProcess=null; }
  if (serverProcess) { const exited=once(serverProcess,'exit'); serverProcess.kill('SIGTERM'); await exited.catch(()=>{}); serverProcess=null; }
  console.log(`Cleanup complete: ${artifacts.users.length} throwaway users, ${artifacts.orgs.length} organizations, and tracked probe events removed.`);
}

let orgA;
try {
  await run();
} catch (error) {
  console.error(`Verification stopped at ${String(error?.message || 'unknown-error').replace(/^check-failed:/,'')}. No credentials or provider response bodies are printed.`);
} finally {
  await cleanup();
}

console.log(`Phase 2 live verification result: ${outcome}`);
for (const item of results) console.log(`${item.status} ${item.name}`);
if (outcome !== 'PASS') process.exitCode = 1;
