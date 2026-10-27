import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import { fundRoutes } from '../src/routes/funds.js';
import { createRepositories } from '../src/repos/memory.js';

const orgId='a0000000-0000-4000-8000-000000000010';
const otherOrg='a0000000-0000-4000-8000-000000000011';
const actors={
  'owner-token':{id:'owner-user',role:'owner'},
  'admin-token':{id:'admin-user',role:'admin'},
  'approver-token':{id:'approver-user',role:'approver'},
  'accountant-token':{id:'accountant-user',role:'accountant'},
  'donor-token':{id:'donor-user',role:'donor'},
  'resident-token':{id:'resident-user',role:'resident'},
  'viewer-token':{id:'viewer-user',role:'viewer'},
};
const config={hasPayPal:true,PAYPAL_INVOICE_SEND_MODE:'simulated'};

test('T6 transparency is org-scoped, privacy-safe, gap-explicit, and audit export is role-gated/formula-safe',async()=>{
  const repos=createRepositories();
  const campaign=await repos.funds.createCampaign({orgId,actorId:'owner-user',title:'Community Roof Project',purpose:'Replace common-area roofing.',targetMinor:50000,organiser:'Private Organizer Name',status:'active'});
  const contribution=await repos.funds.createPledge({orgId,actorId:'accountant-user',campaignId:campaign.id,amountMinor:2500,requestId:'t6-pledge'});
  contribution.donor_ref='private-donor@example.test';contribution.donorRef='private-donor@example.test';

  const request=await repos.funds.createMaintenanceRequest({orgId,actorId:'owner-user',campaignId:campaign.id,title:'Roof repair expense',scope:'Repair the common-area roof.',estimateMinor:9999});
  const contractor=await repos.funds.createContractor({orgId,actorId:'accountant-user',name:'Private Contractor Name'});
  const quote=await repos.funds.addQuotation({orgId,actorId:'accountant-user',requestId:request.id,contractorId:contractor.id,amountMinor:9999,documentRef:'PRIVATE-DOC-REF'});
  await repos.funds.approveMaintenanceScope({orgId,actorId:'approver-user',requestId:request.id,quotationId:quote.id});
  await repos.funds.verifyMaintenanceContractor({orgId,actorId:'approver-user',requestId:request.id});
  await repos.funds.approveMaintenancePayment({orgId,actorId:'approver-user',requestId:request.id});
  const approval=await repos.funds.requestMaintenancePayment({orgId,actorId:'accountant-user',requestId:request.id,requestKey:'t6-payment'});
  await repos.funds.decideMaintenancePayment({orgId,approvalId:approval.approvalId,reviewerId:'approver-user',decision:'approve',note:'Approved.',requestKey:'t6-decision'});

  const app=express();app.use(express.json());let sequence=0;
  app.use((req,res,next)=>{
    req.id=`t6-request-${++sequence}`;const actor=actors[(req.get('authorization')||'').replace(/^Bearer\s+/,'')];
    if(!actor)return res.status(401).json({error:'Unauthenticated'});
    const selectedOrg=req.get('x-org-id')||orgId;if(selectedOrg!==orgId)return res.status(403).json({error:{code:'ORG_FORBIDDEN',message:'Not a member.'}});
    req.user={id:actor.id};req.orgRole=actor.role;req.orgId=selectedOrg;next();
  });
  repos.funds.auditExport=async()=>[{
    id:'audit-1',createdAt:'2026-10-26T12:00:00Z',action:'=HYPERLINK("https://evil.test","x")',entity:'maintenance_request',entityId:request.id,actorId:'approver-user',requestId:'request-123',metadata:{donorRef:'private-donor@example.test'},
  }];
  app.use('/api',fundRoutes({config,repos,paypal:{async pp(){throw new Error('unexpected provider call');}}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(path,token,options={})=>fetch(`${base}${path}`,{...options,headers:{authorization:`Bearer ${token}`,'x-org-id':orgId,...(options.body!==undefined?{'content-type':'application/json'}:{}),...options.headers}});
  try{
    const view=await call('/api/funds/transparency','resident-token');assert.equal(view.status,200);
    const body=await view.json();assert.equal(body.namesShown,false);assert.equal(body.campaigns.length,1);
    assert.equal(body.campaigns[0].campaign.organiser,undefined);assert.equal(JSON.stringify(body).includes('Private Organizer Name'),false);
    assert.equal(body.contributions[0].donorRef,undefined);assert.equal(body.contributions[0].donorRefHash,createHash('sha256').update(`${orgId}:private-donor@example.test`).digest('hex'));
    assert.equal(JSON.stringify(body).includes('private-donor@example.test'),false);assert.equal(JSON.stringify(body).includes('Private Contractor Name'),false);assert.equal(JSON.stringify(body).includes('PRIVATE-DOC-REF'),false);
    assert.equal(body.expenses.length,1);const expense=body.expenses[0];assert.equal(expense.quotation.id,quote.id);assert.equal(expense.payment.mode,'SIMULATED');assert.equal(expense.paymentReference,null);assert.equal(expense.ledgerEntryId,null);assert.equal(expense.paymentApproval.id,approval.approvalId);
    assert.ok(expense.gaps.some(row=>row.gap==='no payment reference'));assert.ok(expense.gaps.some(row=>row.gap==='simulated, no ledger entry'));assert.ok(expense.gaps.some(row=>row.gap==='no completion evidence'));

    const filtered=await call(`/api/funds/transparency?campaignId=${otherOrg}`,'donor-token');assert.equal(filtered.status,404);
    const crossOrg=await call('/api/funds/transparency','resident-token',{headers:{'x-org-id':otherOrg}});assert.equal(crossOrg.status,403);
    const write=await call('/api/funds/transparency','resident-token',{method:'POST',body:'{}'});assert.equal(write.status,404);

    const denied=await call('/api/funds/transparency/audit.csv','resident-token');assert.equal(denied.status,403);
    const csv=await call('/api/funds/transparency/audit.csv?from=2026-10-01&to=2026-10-31','admin-token');assert.equal(csv.status,200);assert.match(csv.headers.get('content-type'),/text\/csv/);
    const csvBody=await csv.text();assert.ok(csvBody.includes(`"'=HYPERLINK(""https://evil.test"",""x"")"`));assert.ok(csvBody.includes('""'));assert.equal(csvBody.includes('private-donor@example.test'),false);assert.equal(csvBody.includes('approver-user'),false);assert.equal(csvBody.includes('donorRef'),false);
  }finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
