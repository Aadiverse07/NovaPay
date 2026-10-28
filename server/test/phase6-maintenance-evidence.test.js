import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { fundRoutes } from '../src/routes/funds.js';
import { createRepositories } from '../src/repos/memory.js';

const orgId='a0000000-0000-4000-8000-000000000009';
const actorByToken={
  'owner-token':{id:'owner-requester',role:'owner'},
  'accountant-token':{id:'accountant-user',role:'accountant'},
  'approver-token':{id:'approver-user',role:'approver'},
  'viewer-token':{id:'viewer-user',role:'viewer'},
};
const config={hasPayPal:false,PAYPAL_INVOICE_SEND_MODE:'simulated'};

test('T5 completion evidence requires paid state and reviewer acceptance before audited close',async()=>{
  const repos=createRepositories();
  const request=await repos.funds.createMaintenanceRequest({orgId,actorId:'owner-requester',title:'T5 evidence review test',scope:'A completed maintenance job for metadata-only evidence review.',estimateMinor:9999});
  const contractor=await repos.funds.createContractor({orgId,actorId:'accountant-user',name:'T5 verified contractor'});
  const quotation=await repos.funds.addQuotation({orgId,actorId:'accountant-user',requestId:request.id,contractorId:contractor.id,amountMinor:9999,documentRef:'T5-QUOTE'});
  await repos.funds.approveMaintenanceScope({orgId,actorId:'approver-user',requestId:request.id,quotationId:quotation.id});
  await repos.funds.verifyMaintenanceContractor({orgId,actorId:'approver-user',requestId:request.id});
  await repos.funds.approveMaintenancePayment({orgId,actorId:'approver-user',requestId:request.id});
  const queued=await repos.funds.requestMaintenancePayment({orgId,actorId:'accountant-user',requestId:request.id,requestKey:'t5-payment'});
  await repos.funds.decideMaintenancePayment({orgId,approvalId:queued.approvalId,reviewerId:'approver-user',decision:'approve',note:'Simulated T4 completion.',requestKey:'t5-payment-review'});
  assert.equal(request.status,'paid');

  const unpaid=await repos.funds.createMaintenanceRequest({orgId,actorId:'owner-requester',title:'T5 unpaid evidence block',scope:'Evidence must wait until paid.',estimateMinor:100});
  const app=express();let sequence=0;
  app.use(express.json());
  app.use((req,res,next)=>{req.id=`t5-request-${++sequence}`;const actor=actorByToken[(req.get('authorization')||'').replace(/^Bearer\s+/,'')];if(!actor)return res.status(401).json({error:'Unauthenticated'});req.user={id:actor.id};req.orgRole=actor.role;req.orgId=orgId;next();});
  app.use('/api',fundRoutes({config,repos,paypal:{async pp(){throw new Error('unexpected provider call');}}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(path,token,options={})=>fetch(`${base}${path}`,{...options,headers:{authorization:`Bearer ${token}`,...(options.body!==undefined?{'content-type':'application/json'}:{}),...options.headers}});
  try{
    const unpaidResponse=await call(`/api/funds/maintenance/${unpaid.id}/evidence`,'accountant-token',{method:'POST',body:JSON.stringify({kind:'photo',description:'Premature evidence'})});
    assert.equal(unpaidResponse.status,409);

    const viewer=await call(`/api/funds/maintenance/${request.id}/evidence`,'viewer-token',{method:'POST',body:JSON.stringify({kind:'inspection',description:'Checklist'})});
    assert.equal(viewer.status,403);

    const submit=async(description)=>call(`/api/funds/maintenance/${request.id}/evidence`,'accountant-token',{method:'POST',body:JSON.stringify({kind:'inspection',description,fileRef:'metadata/inspection-checklist.pdf'})});
    const first=await submit('Inspection checklist reviewed by the maintenance team.');
    assert.equal(first.status,201);const firstBody=await first.json();
    assert.equal(firstBody.request.status,'evidence_submitted');
    assert.equal(firstBody.evidence.review_status,'pending');
    assert.match(firstBody.caution,/supports, but does not prove/i);
    assert.equal(firstBody.evidence.file_ref,'metadata/inspection-checklist.pdf');
    assert.equal(firstBody.evidence.file_contents,undefined);

    const selfReview=await call(`/api/funds/maintenance/${request.id}/evidence/${firstBody.evidence.id}/review`,'owner-token',{method:'POST',body:JSON.stringify({decision:'accept'})});
    assert.equal(selfReview.status,403);
    const closeEarly=await call(`/api/funds/maintenance/${request.id}/close`,'approver-token',{method:'POST',body:'{}'});
    assert.equal(closeEarly.status,409);

    const rejected=await call(`/api/funds/maintenance/${request.id}/evidence/${firstBody.evidence.id}/review`,'approver-token',{method:'POST',body:JSON.stringify({decision:'reject',note:'Add the final inspection reference.'})});
    assert.equal(rejected.status,200);assert.equal((await rejected.json()).request.status,'evidence_submitted');

    const second=await submit('Final inspection reference and completion notes.');
    assert.equal(second.status,201);const secondBody=await second.json();
    const accepted=await call(`/api/funds/maintenance/${request.id}/evidence/${secondBody.evidence.id}/review`,'approver-token',{method:'POST',body:JSON.stringify({decision:'accept',note:'Reviewed; evidence supports the completion record.'})});
    assert.equal(accepted.status,200);const acceptedBody=await accepted.json();assert.equal(acceptedBody.request.status,'reviewed');

    const selfClose=await call(`/api/funds/maintenance/${request.id}/close`,'owner-token',{method:'POST',body:'{}'});
    assert.equal(selfClose.status,403);

    const close=await call(`/api/funds/maintenance/${request.id}/close`,'approver-token',{method:'POST',body:'{}'});
    assert.equal(close.status,200);const closedBody=await close.json();assert.equal(closedBody.closed,true);assert.equal(closedBody.request.status,'closed');
    const retry=await call(`/api/funds/maintenance/${request.id}/close`,'approver-token',{method:'POST',body:'{}'});
    assert.equal(retry.status,200);assert.equal((await retry.json()).request.status,'closed');
    const audits=await repos.funds.listFundAudit(orgId);
    for(const action of ['fund.maintenance.evidence_submitted','fund.completion_evidence.submitted','fund.completion_evidence.rejected','fund.completion_evidence.accepted','fund.maintenance.reviewed','fund.maintenance.closed'])assert.ok(audits.some(row=>row.action===action),`missing audit ${action}`);
  }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
