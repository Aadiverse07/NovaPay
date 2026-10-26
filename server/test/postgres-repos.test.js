import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresRepositories, moneyToMinor, minorToMoney } from '../src/repos/postgres.js';

test('money repository helpers use integer minor units and reject excessive precision', () => {
  assert.equal(moneyToMinor('10.01'), 1001);
  assert.equal(moneyToMinor('-0.25'), -25);
  assert.equal(minorToMoney(1001), '10.01');
  assert.throws(() => moneyToMinor('1.001'));
  assert.throws(() => moneyToMinor('999999999999999999.00'));
});

test('Postgres funds repository uses T4 service-only queue RPCs and maps maintenance context', async () => {
  const calls=[];
  const database={
    async rpc(name,args){calls.push({name,args});return name==='request_fund_maintenance_payment'?{approvalId:'APR-FUND-PAY-1',status:'pending'}:{status:'simulated'};},
    async select(table){return table==='approvals'?[{id:'APR-FUND-PAY-1',org_id:'org-a',proposal_type:'maintenance-payment',fund_maintenance_request_id:'request-1',request_payload:{mode:'SIMULATED'},amount_minor:9999,currency:'USD',status:'pending'}]:[];},
  };
  const repos=createPostgresRepositories(database);
  await repos.funds.requestMaintenancePayment({orgId:'org-a',actorId:'actor-a',requestId:'request-1',requestKey:'req-a'});
  await repos.funds.decideMaintenancePayment({orgId:'org-a',approvalId:'APR-FUND-PAY-1',reviewerId:'reviewer-a',decision:'approve',note:'ok',requestKey:'req-b'});
  const approval=await repos.approvals.get('APR-FUND-PAY-1','org-a');
  assert.deepEqual(calls.map(call=>call.name),['request_fund_maintenance_payment','decide_fund_maintenance_payment']);
  assert.equal(calls[0].args.p_request,'request-1');
  assert.equal(calls[1].args.p_decision,'approve');
  assert.equal(approval.proposalType,'maintenance-payment');
  assert.equal(approval.fundMaintenanceRequestId,'request-1');
  assert.deepEqual(approval.requestPayload,{mode:'SIMULATED'});
});

test('Postgres repositories scope tenant data and transactional calls by organization', async () => {
  const calls = [];
  const database = {
    async select(table, query) { calls.push({ kind: 'select', table, query }); return table === 'paypal_orders' ? [{ id: 'db-order', org_id: 'org-a', request_key: 'key-a', paypal_order_id: 'ORDER-A', amount_minor: 1000, currency: 'USD', status: 'CREATED', state: 'Created', approve_url: 'https://www.paypal.com/approve' }] : []; },
    async rpc(name, args) { calls.push({ kind: 'rpc', name, args }); return { id: 'APR-1', org_id: args.p_org, status: 'pending', proposal_type: 'refund', capture_id: 'CAP-1', amount_minor: 100, currency: 'USD' }; },
  };
  const repos = createPostgresRepositories(database);
  const order = await repos.orders.byRequestKey('key-a','org-a');
  assert.equal(order.id,'ORDER-A');
  assert.match(calls.at(-1).query,/org_id=eq\.org-a/);
  await repos.approvals.save('APR-1',{proposalType:'refund',captureId:'CAP-1',amount:'1.00',currency:'USD'},'org-a','user-a');
  assert.deepEqual(calls.at(-1).args,{p_org:'org-a',p_approval_id:'APR-1',p_capture_id:'CAP-1',p_amount_minor:100,p_currency:'USD',p_created_by:'user-a',p_request_payload:{proposalType:'refund',captureId:'CAP-1',amount:'1.00',currency:'USD'}});
  await repos.approvals.decide('APR-1','org-a','approve','reviewed','user-a','req-1');
  assert.equal(calls.at(-1).args.p_org,'org-a');
  await repos.listTransactions('org-a',{limit:25,offset:0,from:'2026-10-01T00:00:00Z',to:'2026-10-31T23:59:59Z'});
  assert.match(calls.at(-1).query,/org_id=eq\.org-a/);
  await repos.trialBalance('org-a','USD');
  assert.deepEqual(calls.at(-1),{kind:'rpc',name:'get_org_trial_balance',args:{p_org:'org-a',p_currency:'USD'}});
});

test('capture reads disambiguate the order foreign key in PostgREST embeds', async () => {
  const calls = [];
  const database = {
    async select(table, query) { calls.push({ table, query }); return []; },
  };
  const repos = createPostgresRepositories(database);
  await repos.captures.get('CAP-1', 'org-a');
  await repos.captures.all('org-a');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    const params = new URLSearchParams(call.query);
    assert.equal(call.table, 'paypal_captures');
    assert.equal(params.get('select'), '*,paypal_orders!paypal_captures_org_id_order_id_fkey(paypal_order_id)');
  }
});

test('fund-linked synchronous and webhook captures send Donations account lines', async () => {
  const calls = [];
  const database = {
    async select(table, query) {
      calls.push({ kind: 'select', table, query });
      return table === 'paypal_orders' ? [{ id: 'db-order', org_id: 'org-a', paypal_order_id: 'ORDER-FUND', fund_contribution_id: 'contribution-1' }] : [];
    },
    async rpc(name, args) {
      calls.push({ kind: 'rpc', name, args });
      return name === 'record_paypal_capture'
        ? { capture: { paypal_capture_id: 'CAP-FUND', amount_minor: 1000, currency: 'USD', status: 'COMPLETED', org_id: 'org-a' } }
        : { orgId: 'org-a', result: { capture: { paypal_capture_id: 'CAP-FUND', amount_minor: 1000, currency: 'USD', status: 'COMPLETED', org_id: 'org-a' } } };
    },
  };
  const repos = createPostgresRepositories(database);
  const capture = { id: 'CAP-FUND', orderId: 'ORDER-FUND', value: '10.00', fee: '0.59', net: '9.41', currency: 'USD', status: 'COMPLETED' };
  await repos.captures.add(capture, 'org-a');
  await repos.captures.addFromWebhook(capture);
  const postings = calls.filter((call) => call.kind === 'rpc');
  assert.deepEqual(postings.map((call) => call.name), ['record_paypal_capture', 'record_fund_paypal_capture_event']);
  for (const { args } of postings) {
    assert.equal(args.p_lines.find((line) => line.account_code === '4100')?.credit_minor, 1000);
    assert.equal(args.p_lines.some((line) => line.account_code === '4000'), false);
  }
});

test('approval repository exposes its public approvalId field for persistence checks', async () => {
  const database = {
    async select(table) { return table === 'approvals' ? [{ id:'APR-RESTORED', org_id:'org-a', proposal_type:'refund', capture_id:'CAP-1', amount_minor:100, currency:'USD', status:'pending' }] : []; },
  };
  const repos = createPostgresRepositories(database);
  const [approval] = await repos.approvals.list('org-a');
  assert.equal(approval.approvalId, 'APR-RESTORED');
});

test('AI proposal persistence uses the scoped pending-approval RPC with minor-unit amounts', async () => {
  const calls = [];
  const database = { async rpc(name, args) { calls.push({ name, args }); return { id: 'AI-APR-1', org_id: args.p_org, proposal_type: args.p_proposal_type, capture_id: args.p_capture_id, amount_minor: args.p_amount_minor, currency: args.p_currency, status: 'pending', created_by: args.p_created_by, request_payload: args.p_request_payload }; } };
  const repos = createPostgresRepositories(database);
  const approval = await repos.approvals.createAIProposal({ orgId: 'org-a', actorId: 'user-a', proposalType: 'refund', captureId: 'CAP-1', amount: '7.00', currency: 'USD', requestPayload: { source: 'ai', evidenceIds: ['TRX-1'] } });
  assert.equal(calls[0].name, 'create_ai_proposal');
  assert.deepEqual(calls[0].args, { p_org: 'org-a', p_created_by: 'user-a', p_proposal_type: 'refund', p_capture_id: 'CAP-1', p_invoice_id: null, p_amount_minor: 700, p_currency: 'USD', p_request_payload: { source: 'ai', evidenceIds: ['TRX-1'] } });
  assert.equal(approval.approvalId, 'AI-APR-1');
  assert.equal(approval.amount, '7.00');
  assert.equal(approval.status, 'pending');
});

test('capture and refund persistence send the pure ledger mapping into atomic database RPCs', async () => {
  const calls = [];
  const database = {
    async select() { return [{ fund_contribution_id: null }]; },
    async rpc(name, args) { calls.push({ name, args }); return { capture: { paypal_capture_id: 'CAP-1', amount_minor: 1000, currency: 'USD', status: 'COMPLETED' }, approval: { id: 'APR-1', amount_minor: 1000, currency: 'USD', status: 'completed' } }; },
  };
  const repos = createPostgresRepositories(database);
  await repos.captures.add({ id: 'CAP-1', orderId: 'ORDER-1', value: '10.00', fee: '0.50', net: '9.50', currency: 'USD', status: 'COMPLETED' }, 'org-a');
  assert.equal(calls[0].name, 'record_paypal_capture');
  assert.deepEqual(calls[0].args.p_lines, [
    { account_code: '1000', debit_minor: 950, credit_minor: 0, currency: 'USD' },
    { account_code: '5000', debit_minor: 50, credit_minor: 0, currency: 'USD' },
    { account_code: '4000', debit_minor: 0, credit_minor: 1000, currency: 'USD' },
  ]);
  await repos.approvals.finishRefund('APR-1','org-a',{ id:'REF-1',status:'COMPLETED',amount:{value:'10.00',currency_code:'USD'},seller_payable_breakdown:{gross_amount:{value:'10.00'},paypal_fee:{value:'-0.25'},net_amount:{value:'10.25'}} });
  assert.equal(calls[1].name, 'finish_refund');
  assert.deepEqual(calls[1].args.p_lines, [
    { account_code: '4050', debit_minor: 1000, credit_minor: 0, currency: 'USD' },
    { account_code: '1000', debit_minor: 0, credit_minor: 1025, currency: 'USD' },
    { account_code: '5000', debit_minor: 25, credit_minor: 0, currency: 'USD' },
  ]);
});

test('AI usage reservations and cache persistence stay scoped to the verified organization', async () => {
  const calls = [];
  const database = {
    async rpc(name, args) { calls.push({ kind: 'rpc', name, args }); return name === 'reserve_ai_usage' ? { allowed: true, usageId: 'usage-1' } : 'version-1'; },
    async select(table, query) { calls.push({ kind: 'select', table, query }); return [{ answer: { reply: 'safe' }, data_version: 'version-1', expires_at: '2026-10-25T00:00:00Z' }]; },
    async upsert(table, payload, conflict) { calls.push({ kind: 'upsert', table, payload, conflict }); return [payload]; },
  };
  const repos = createPostgresRepositories(database);
  const reservation = await repos.ai.usage.reserve({ orgId: 'org-a', userId: 'user-a', route: 'retrieval', model: 'gemini-3.5-flash-lite', inputTokens: 50, userLimit: 5, orgLimit: 20 });
  assert.deepEqual(reservation, { allowed: true, usageId: 'usage-1', reason: null });
  assert.deepEqual(calls[0], { kind: 'rpc', name: 'reserve_ai_usage', args: { p_org: 'org-a', p_user: 'user-a', p_route: 'retrieval', p_model: 'gemini-3.5-flash-lite', p_input_tokens: 50, p_user_limit: 5, p_org_limit: 20 } });
  await repos.ai.usage.complete('usage-1', { inputTokens: 45, outputTokens: 10, latencyMs: 250, model: 'gemini-3.5-flash-lite', status: 'completed' });
  assert.equal(calls[1].name, 'complete_ai_usage');
  assert.equal(calls[1].args.p_usage_id, 'usage-1');
  assert.equal(calls[1].args.p_input_tokens, 45);
  const cached = await repos.ai.cache.get('org-a', 'hash-1');
  assert.equal(cached.answer.reply, 'safe');
  assert.match(calls[2].query, /org_id=eq\.org-a/);
  assert.match(calls[2].query, /cache_key=eq\.hash-1/);
  await repos.ai.cache.put({ orgId: 'org-a', cacheKey: 'hash-1', dataVersion: 'version-1', answer: { reply: 'safe' }, expiresAt: '2026-10-25T00:00:00Z' });
  assert.equal(calls[3].payload.org_id, 'org-a');
  assert.equal(calls[3].conflict, 'org_id,cache_key');
});

test('anomaly records, notification actions, webhook inputs and scheduled org scans are scoped', async () => {
  const calls = [];
  const database = {
    async rpc(name, args) { calls.push({ kind: 'rpc', name, args }); if (name === 'record_anomaly') return { inserted: true, anomaly: { id: 'ANM-1', org_id: args.p_org } }; if (name === 'set_notification_status') return { id: args.p_notification_id, org_id: args.p_org, status: args.p_status }; return ['org-a']; },
    async select(table, query) { calls.push({ kind: 'select', table, query }); return table === 'notifications' ? [{ id: 'NTF-1', org_id: 'org-a', status: 'unread' }] : [{ event_id: 'EV-1', processing_status: 'retry' }]; },
  };
  const repos = createPostgresRepositories(database);
  const record = await repos.anomalies.record('org-a', { rule: 'stale_webhook', evidenceIds: ['EV-1'], dedupeKey: 'dedupe-1', details: {} });
  assert.equal(record.inserted, true);
  assert.equal(calls[0].args.p_org, 'org-a');
  const events = await repos.events.anomalyCandidates('org-a');
  assert.equal(events[0].event_id, 'EV-1');
  assert.match(calls[1].query, /org_id=eq\.org-a/);
  const notifications = await repos.notifications.list('org-a', { status: 'unread', limit: 10, offset: 0 });
  assert.equal(notifications[0].org_id, 'org-a');
  assert.match(calls[2].query, /org_id=eq\.org-a/);
  const updated = await repos.notifications.setStatus('org-a', 'NTF-1', 'dismissed');
  assert.equal(updated.status, 'dismissed');
  assert.deepEqual(await repos.ai.listOrgIds(), ['org-a']);
  assert.equal(calls[3].args.p_org, 'org-a');
  assert.equal(calls[4].name, 'list_anomaly_org_ids');
});
