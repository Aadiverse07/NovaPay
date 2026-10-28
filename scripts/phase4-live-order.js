import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { config } from '../server/src/config.js';

const supabase = config.SUPABASE_URL.replace(/\/$/, '');
const api = process.env.NOVAPAY_API_URL || `http://127.0.0.1:${config.PORT}`;
const serviceKey = config.SUPABASE_SERVICE_ROLE_KEY;
const serviceHeaders = { apikey: serviceKey, ...(serviceKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${serviceKey}` }), 'Content-Type': 'application/json' };
const anonHeaders = { apikey: config.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
const email = 'novapay-phase3-owner-a@example.test';
const orgName = 'NovaPay Phase 3 Verification A';

async function request(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(20000) });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch {}
    return { status: response.status, body };
  } catch { return { status: 0, body: null }; }
}
function params(values) { return new URLSearchParams(values).toString(); }
async function supa(path, options = {}) { return request(supabase + path, { ...options, headers: { ...serviceHeaders, ...(options.headers || {}) } }); }
async function main() {
  if (!config.hasSupabase || !config.hasPayPal || !config.PAYPAL_WEBHOOK_ID) throw new Error('required configuration unavailable');
  const status = await request(api + '/api/status');
  if (status.status !== 200) throw new Error('NovaPay API status unavailable');

  let user = null;
  for (let page = 1; page <= 20 && !user; page++) {
    const list = await request(`${supabase}/auth/v1/admin/users?page=${page}&per_page=100`, { headers: serviceHeaders });
    if (list.status !== 200 || !Array.isArray(list.body?.users)) throw new Error('fixed verifier user lookup unavailable');
    user = list.body.users.find((item) => item.email?.toLowerCase() === email);
    if (list.body.users.length < 100) break;
  }
  if (!user?.id) throw new Error('fixed verifier user does not exist');
  const orgResult = await supa('/rest/v1/organizations?' + params({ select: 'id', name: `eq.${orgName}`, limit: '2' }));
  if (orgResult.status !== 200 || orgResult.body?.length !== 1) throw new Error('fixed verifier organization lookup failed');
  const orgId = orgResult.body[0].id;
  const member = await supa('/rest/v1/memberships?' + params({ select: 'role', org_id: `eq.${orgId}`, user_id: `eq.${user.id}`, limit: '1' }));
  if (member.status !== 200 || member.body?.[0]?.role !== 'owner') throw new Error('fixed verifier owner membership missing');

  // Reset only the password on the pre-existing dedicated test user; never create users or orgs.
  const password = randomBytes(32).toString('base64url');
  const reset = await request(`${supabase}/auth/v1/admin/users/${user.id}`, { method: 'PUT', headers: serviceHeaders, body: JSON.stringify({ password, email_confirm: true }) });
  if (reset.status !== 200) throw new Error('fixed verifier user sign-in preparation failed');
  const login = await request(`${supabase}/auth/v1/token?grant_type=password`, { method: 'POST', headers: anonHeaders, body: JSON.stringify({ email, password }) });
  if (login.status !== 200 || !login.body?.access_token) throw new Error('fixed verifier sign-in failed');
  const headers = { ...anonHeaders, Authorization: `Bearer ${login.body.access_token}`, 'X-Org-Id': orgId };

  const requestKey = createHash('sha256').update(`novapay-phase4-single-live-order:${orgId}`).digest('hex').slice(0, 32);
  const order = await request(`${api}/api/paypal/create-order`, { method: 'POST', headers, body: JSON.stringify({ amount: '1.00', currency: 'USD', requestKey }) });
  if (order.status !== 200 || !order.body?.orderId || !order.body?.approveUrl) throw new Error(`sandbox order creation/recovery failed (HTTP ${order.status})`);
  const orderId = order.body.orderId;

  const linkedOrder = await supa('/rest/v1/paypal_orders?' + params({ select: 'capture_id', org_id: `eq.${orgId}`, paypal_order_id: `eq.${orderId}`, limit: '1' }));
  if (linkedOrder.status !== 200 || linkedOrder.body?.length !== 1) throw new Error('capture state lookup failed');
  const existingCapture = linkedOrder.body[0].capture_id
    ? await supa('/rest/v1/paypal_captures?' + params({ select: 'paypal_capture_id,status', org_id: `eq.${orgId}`, id: `eq.${linkedOrder.body[0].capture_id}`, limit: '1' }))
    : { status: 200, body: [] };
  if (existingCapture.status !== 200) throw new Error('capture state lookup failed');
  let captureId = existingCapture.body?.[0]?.paypal_capture_id || null;
  if (!captureId) {
    console.log(`PAYPAL_APPROVAL_URL=${order.body.approveUrl}`);
    console.log('Open that URL, sign in as the US Personal Sandbox buyer sb-jzrsh53532685@personal.example.com, pay the $1.00 order with the Visa card, and return here.');
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = (await rl.question('After completing buyer approval, type approved: ')).trim().toLowerCase();
    rl.close();
    if (answer !== 'approved') { console.log('UNVERIFIED: buyer approval not confirmed; order retained for safe resume.'); process.exitCode = 2; return; }
    const captured = await request(`${api}/api/paypal/capture`, { method: 'POST', headers, body: JSON.stringify({ orderId }) });
    if (captured.status !== 200 || captured.body?.status !== 'COMPLETED' || !captured.body?.captureId) throw new Error(`capture did not complete (HTTP ${captured.status})`);
    captureId = captured.body.captureId;
  }

  const deadline = Date.now() + 150000;
  let verifiedEvent = null;
  while (Date.now() < deadline) {
    const events = await supa('/rest/v1/paypal_events?' + params({ select: 'event_id,event_type,verification_status,processing_status,payload', org_id: `eq.${orgId}`, order: 'created_at.desc', limit: '100' }));
    if (events.status === 200 && Array.isArray(events.body)) {
      verifiedEvent = events.body.find((row) => row.verification_status === 'verified' && row.processing_status === 'processed' && (row.payload?.resource?.id === captureId || row.payload?.resource?.supplementary_data?.related_ids?.capture_id === captureId));
      if (verifiedEvent) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!verifiedEvent) throw new Error('no verified processed PayPal capture webhook observed within timeout');
  const transaction = await supa('/rest/v1/transactions?' + params({ select: 'id,source_id,source_type,status,amount_minor,fee_minor,net_minor,currency,occurred_at', org_id: `eq.${orgId}`, source_type: 'eq.capture', source_id: `eq.${captureId}`, limit: '1' }));
  const journal = await supa('/rest/v1/journal_entries?' + params({ select: 'id,source_id,source_type', org_id: `eq.${orgId}`, source_type: 'eq.capture', source_id: `eq.${captureId}`, limit: '2' }));
  if (transaction.status !== 200 || transaction.body?.length !== 1 || journal.status !== 200 || journal.body?.length !== 1) throw new Error('capture transaction or journal entry not posted exactly once');
  const record = transaction.body[0];
  console.log(JSON.stringify({ result: 'PASS', orderCreatedOrResumed: true, captureCompleted: true, webhookVerification: 'verified', webhookProcessing: 'processed', transactionCount: 1, journalEntryCount: 1, amountMinor: record.amount_minor, feeMinor: record.fee_minor, netMinor: record.net_minor, currency: record.currency, occurredAt: record.occurred_at, captureRetained: true, refundAttempted: false }));
}

try { await main(); }
catch (error) {
  const message = String(error?.message || 'live flow failed').replace(/https?:\/\/\S+/g, '[URL]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]').slice(0, 220);
  console.error(`FAIL ${message}; provider bodies and credentials suppressed.`);
  process.exitCode = 1;
}
