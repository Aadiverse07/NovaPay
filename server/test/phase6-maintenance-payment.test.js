import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { approvalRoutes } from '../src/routes/approvals.js';
import { fundRoutes } from '../src/routes/funds.js';
import { createRepositories } from '../src/repos/memory.js';

const orgId='a0000000-0000-4000-8000-000000000001';
const actorByToken={
  'accountant-token':{id:'accountant-user',role:'accountant'},
  'approver-token':{id:'approver-user',role:'approver'},
  'owner-token':{id:'owner-user',role:'owner'},
  'viewer-token':{id:'viewer-user',role:'viewer'},
};
const config={hasPayPal:false,PAYPAL_INVOICE_SEND_MODE:'simulated'};

test('T4 payment request enters existing approvals queue and completes once as SIMULATED without a ledger entry',async()=>{
  const repos=createRepositories();
  const request=await repos.funds.createMaintenanceRequest({orgId,actorId:'accountant-user',title:'T4 simulated payment request',scope:'A verified maintenance request for T4 payment gate tests.',estimateMinor:9999});
  const contractor=await repos.funds.createContractor({orgId,actorId:'accountant-user',name:'T4 verified contractor'});
  const quotation=await repos.funds.addQuotation({orgId,actorId:'accountant-user',requestId:request.id,contractorId:contractor.id,amountMinor:9999,documentRef:'T4-QUOTE'});
  await repos.funds.approveMaintenanceScope({orgId,actorId:'approver-user',requestId:request.id,quotationId:quotation.id});
  await repos.funds.verifyMaintenanceContractor({orgId,actorId:'owner-user',requestId:request.id});
  await repos.funds.approveMaintenancePayment({orgId,actorId:'approver-user',requestId:request.id});
  assert.equal(request.status,'payment_approved');

  const blocked=await repos.funds.createMaintenanceRequest({orgId,actorId:'accountant-user',title:'T4 blocked payment request',scope:'Must not bypass T3 approvals.',estimateMinor:1});
  const app=express();let sequence=0;let paypalCalls=0;
  app.use(express.json());
  app.use((req,res,next)=>{
    req.id=`t4-request-${++sequence}`;
    const actor=actorByToken[(req.get('authorization')||'').replace(/^Bearer\s+/,'')];
    if(!actor)return res.status(401).json({error:'Unauthenticated'});
    req.user={id:actor.id};req.orgRole=actor.role;req.orgId=orgId;next();
  });
  const paypal={async pp(){paypalCalls+=1;throw new Error('PayPal must not be called in SIMULATED mode');}};
  app.use('/api',approvalRoutes({config,repos,identity:{},paypal}));
  app.use('/api',fundRoutes({config,repos,paypal}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(path,token,options={})=>fetch(`${base}${path}`,{...options,headers:{authorization:`Bearer ${token}`,...(options.body!==undefined?{'content-type':'application/json'}:{}),...options.headers}});
  try{
    const blockedResponse=await call(`/api/funds/maintenance/${blocked.id}/payment`,'accountant-token',{method:'POST',body:'{}'});
    assert.equal(blockedResponse.status,409);
    assert.equal((await blockedResponse.json()).error.code,'INVALID_MAINTENANCE_STATE');

    const viewerResponse=await call(`/api/funds/maintenance/${request.id}/payment`,'viewer-token',{method:'POST',body:'{}'});
    assert.equal(viewerResponse.status,403);
    assert.equal((await viewerResponse.json()).error.code,'ROLE_FORBIDDEN');

    const queued=await call(`/api/funds/maintenance/${request.id}/payment`,'accountant-token',{method:'POST',body:'{}'});
    assert.equal(queued.status,202);
    const queuedBody=await queued.json();
    assert.equal(queuedBody.mode,'SIMULATED');assert.equal(queuedBody.simulated,true);assert.equal(queuedBody.gap,'simulated, no ledger entry');
    const approvalId=queuedBody.approval.approvalId;
    const queue=await call('/api/approvals','approver-token');
    const queueBody=await queue.json();
    assert.equal(queue.status,200);assert.equal(queueBody.pendingCount,1);
    assert.equal(queueBody.approvals[0].approvalId,approvalId);
    assert.equal(queueBody.approvals[0].proposalType,'maintenance-payment');
    assert.equal(queueBody.approvals[0].requestPayload.maintenanceRequestId,request.id);

    const decisionPath=`/api/approvals/${approvalId}/decision`;
    const approved=await call(decisionPath,'approver-token',{method:'POST',body:JSON.stringify({decision:'approve',note:'Approved simulated payment.'})});
    assert.equal(approved.status,200);
    const result=await approved.json();
    assert.equal(result.status,'simulated');assert.equal(result.mode,'SIMULATED');assert.equal(result.simulated,true);
    assert.equal(result.amountMinor,9999);assert.equal(result.paypalPayoutRef,null);assert.equal(result.ledgerEntryId,null);
    assert.equal(result.gap,'simulated, no ledger entry');

    const retry=await call(decisionPath,'approver-token',{method:'POST',body:JSON.stringify({decision:'approve',note:'Retry.'})});
    assert.equal(retry.status,200);assert.equal((await retry.json()).paymentId,result.paymentId);
    const duplicateQueue=await call(`/api/funds/maintenance/${request.id}/payment`,'accountant-token',{method:'POST',body:'{}'});
    assert.equal(duplicateQueue.status,202);assert.equal((await duplicateQueue.json()).approval.approvalId,approvalId);
    assert.equal((await repos.funds.listMaintenancePayments(orgId)).length,1);
    assert.equal((await repos.approvals.countPending(orgId)),0);
    assert.equal(paypalCalls,0);
  }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
