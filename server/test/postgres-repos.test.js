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

test('approval repository exposes its public approvalId field for persistence checks', async () => {
  const database = {
    async select(table) { return table === 'approvals' ? [{ id:'APR-RESTORED', org_id:'org-a', proposal_type:'refund', capture_id:'CAP-1', amount_minor:100, currency:'USD', status:'pending' }] : []; },
  };
  const repos = createPostgresRepositories(database);
  const [approval] = await repos.approvals.list('org-a');
  assert.equal(approval.approvalId, 'APR-RESTORED');
});

test('capture and refund persistence send the pure ledger mapping into atomic database RPCs', async () => {
  const calls = [];
  const database = { async rpc(name, args) { calls.push({ name, args }); return { capture: { paypal_capture_id: 'CAP-1', amount_minor: 1000, currency: 'USD', status: 'COMPLETED' }, approval: { id: 'APR-1', amount_minor: 1000, currency: 'USD', status: 'completed' } }; } };
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
