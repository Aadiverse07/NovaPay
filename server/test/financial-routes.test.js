import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';

const org = 'a0000000-0000-4000-8000-000000000001';
const otherOrg = 'b0000000-0000-4000-8000-000000000002';
const config = { PORT: 3000, STATIC_DIR: process.cwd(), PAYPAL_CLIENT_ID:'test', PAYPAL_CLIENT_SECRET:'test', hasPayPal:true, hasSupabase:true, hasAI:false };
const users = new Map([['owner-token',{id:'user-owner',role:'owner',org}],['viewer-token',{id:'user-viewer',role:'viewer',org}],['other-token',{id:'user-other',role:'owner',org:otherOrg}]]);
const identity = {
  async verifyToken(token) { return users.get(token) ? {id:users.get(token).id} : null; },
  async membership(userId,orgId) { const user = [...users.values()].find((entry)=>entry.id===userId); return user?.org===orgId ? {role:user.role,org_id:orgId,user_id:userId} : null; },
};

async function withApi(repos, paypal, run) {
  const app=createApp({config,repos,identity,paypal,askAI:async()=>({reply:'ok',evidence:[],proposal:null})});
  const server=app.listen(0,'127.0.0.1'); await new Promise((resolve)=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(path,token='owner-token',orgId=org,options={})=>fetch(`${base}${path}`,{...options,headers:{authorization:`Bearer ${token}`,'x-org-id':orgId,...(options.body?{'content-type':'application/json'}:{}),...options.headers}});
  call.base=base;
  try { await run({base,call}); } finally { await new Promise((resolve)=>server.close(resolve)); }
}

test('Phase 2 read APIs validate filters, enforce tenant membership, and return structured errors', async()=>{
  const repos=createRepositories();
  await withApi(repos,{},async({call})=>{
    const unauth=await fetch(`${call.base}/api/transactions`);
    assert.equal(unauth.status,401);
    assert.deepEqual(await unauth.json(),{error:{code:'AUTH_REQUIRED',message:'A valid Supabase bearer token is required.'}});
    const invalid=await call('/api/transactions?limit=not-a-number');
    assert.equal(invalid.status,400); assert.equal((await invalid.json()).error.code,'VALIDATION_ERROR');
    const transactions=await call('/api/transactions?limit=10');
    assert.equal(transactions.status,200); assert.deepEqual((await transactions.json()).transactions,[]);
    const badEntries=await call('/api/ledger/entries?offset=-1');
    assert.equal(badEntries.status,400); assert.equal((await badEntries.json()).error.code,'VALIDATION_ERROR');
    const unsupportedEntryFilter=await call('/api/ledger/entries?type=capture');
    assert.equal(unsupportedEntryFilter.status,400); assert.equal((await unsupportedEntryFilter.json()).error.code,'VALIDATION_ERROR');
    const entries=await call('/api/ledger/entries');
    assert.equal(entries.status,200); assert.deepEqual((await entries.json()).entries,[]);
    const foreign=await call('/api/ledger/trial-balance','other-token',org);
    assert.equal(foreign.status,403); assert.equal((await foreign.json()).error.code,'ORG_FORBIDDEN');
    const balance=await call('/api/ledger/trial-balance');
    assert.equal(balance.status,200); assert.equal((await balance.json()).balanced,true);
    const reconciliation=await call('/api/reconciliation');
    assert.equal(reconciliation.status,200); assert.equal((await reconciliation.json()).run.status,'clean');
    const approvals=await call('/api/approvals');
    assert.equal(approvals.status,200); assert.equal((await approvals.json()).pendingCount,0);
  });
});

test('financial database failures return safe structured errors without provider details or stacks', async()=>{
  const repos=createRepositories();
  const sentinel='database-provider-secret-sentinel';
  repos.listTransactions=async()=>{ throw Object.assign(new Error(sentinel),{statusCode:503,code:'DATABASE_UNAVAILABLE'}); };
  await withApi(repos,{},async({call})=>{
    const response=await call('/api/transactions');
    const text=await response.text();
    assert.equal(response.status,503);
    assert.deepEqual(JSON.parse(text),{error:{code:'DATABASE_UNAVAILABLE',message:'The request could not be completed.'}});
    assert.equal(text.includes(sentinel),false);
    assert.equal(text.includes(' at '),false);
  });
});

test('refund registration rejects over-capture amount and concurrent approval sends one PayPal refund', async()=>{
  const repos=createRepositories();
  repos.captures.add({id:'CAPTURE-ROUTE-1',orderId:'ORDER-ROUTE-1',value:'10.00',currency:'USD',status:'COMPLETED',refunded:0,reserved:0},org);
  let paypalCalls=0; let usedRequestId;
  const paypal={async pp(_method,_url,_body,requestId){paypalCalls+=1;usedRequestId=requestId;await new Promise((resolve)=>setTimeout(resolve,30));return {id:'REFUND-ROUTE-1',status:'COMPLETED',amount:{value:'4.00',currency_code:'USD'},seller_payable_breakdown:{gross_amount:{value:'4.00'},paypal_fee:{value:'0.00'},net_amount:{value:'4.00'}}};}};
  await withApi(repos,paypal,async({call})=>{
    const body={approvalId:'APR-ROUTE-1',proposalType:'refund',captureId:'CAPTURE-ROUTE-1',amount:'11.00',currency:'USD'};
    const over=await call('/api/approvals/register','owner-token',org,{method:'POST',body:JSON.stringify(body)});
    assert.equal(over.status,400);
    const viewer=await call('/api/approvals/APR-ROUTE-1/decision','viewer-token',org,{method:'POST',body:JSON.stringify({decision:'approve'})});
    assert.equal(viewer.status,403); assert.equal((await viewer.json()).error.code,'ROLE_FORBIDDEN');
    const registered=await call('/api/approvals/register','owner-token',org,{method:'POST',body:JSON.stringify({...body,amount:'4.00'})});
    assert.equal(registered.status,200);
    const [first,second]=await Promise.all([
      call('/api/approvals/APR-ROUTE-1/decision','owner-token',org,{method:'POST',body:JSON.stringify({decision:'approve',note:'reviewed'})}),
      call('/api/approvals/APR-ROUTE-1/decision','owner-token',org,{method:'POST',body:JSON.stringify({decision:'approve',note:'reviewed'})}),
    ]);
    const statuses=[first.status,second.status].sort();
    assert.deepEqual(statuses,[200,409]);
    assert.equal(paypalCalls,1);
    assert.match(usedRequestId,/^np-[a-f0-9]{32}$/);
    const repeated=await call('/api/approvals/APR-ROUTE-1/decision','owner-token',org,{method:'POST',body:JSON.stringify({decision:'approve'})});
    assert.equal(repeated.status,200);
    assert.equal((await repeated.json()).refundId,'REFUND-ROUTE-1');
    assert.equal(paypalCalls,1);
    const count=await call('/api/approvals/pending-count');
    assert.deepEqual(await count.json(),{pendingCount:0});
  });
});
