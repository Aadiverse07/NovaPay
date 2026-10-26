import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepositories } from '../src/repos/memory.js';

async function preparedRequest(repos,{amountMinor=10000,requester='requester'}={}) {
  const request=await repos.funds.createMaintenanceRequest({orgId:'org-t3',actorId:requester,title:'Repair roof',scope:'Replace damaged roof tiles.',estimateMinor:amountMinor});
  const contractor=await repos.funds.createContractor({orgId:'org-t3',actorId:'manager',name:'Verified later contractor'});
  const quotation=await repos.funds.addQuotation({orgId:'org-t3',actorId:'manager',requestId:request.id,contractorId:contractor.id,amountMinor,documentRef:'quote-1'});
  return {request,contractor,quotation};
}

test('maintenance workflow allows only the next legal T3 transitions',async()=>{
  const repos=createRepositories();const {request,contractor,quotation}=await preparedRequest(repos);
  assert.equal(request.status,'quoting');
  assert.equal(request.status,'quoting');
  assert.equal(quotation.maintenance_request_id,request.id);
  const scoped=await repos.funds.approveMaintenanceScope({orgId:'org-t3',actorId:'approver-1',requestId:request.id,quotationId:quotation.id,note:'Scope approved.'});
  assert.equal(scoped.request.status,'scope_approved');
  const verified=await repos.funds.verifyMaintenanceContractor({orgId:'org-t3',actorId:'admin-1',requestId:request.id});
  assert.equal(verified.request.status,'contractor_verified');
  assert.equal(verified.contractor.verification_status,'verified');
  assert.equal(verified.contractor.verified_by,'admin-1');
  assert.ok(verified.contractor.verified_at);
  assert.equal((await repos.funds.approveMaintenancePayment({orgId:'org-t3',actorId:'approver-1',requestId:request.id})).status,'contractor_verified');
  assert.equal((await repos.funds.approveMaintenancePayment({orgId:'org-t3',actorId:'approver-2',requestId:request.id})).status,'payment_approved');
  assert.equal(request.status,'payment_approved');
});

test('maintenance workflow rejects skipped states, foreign quotations, requester self-approval, and duplicate approvers',async()=>{
  const repos=createRepositories();const {request,contractor,quotation}=await preparedRequest(repos);
  await assert.rejects(repos.funds.approveMaintenanceScope({orgId:'org-t3',actorId:'requester',requestId:request.id,quotationId:quotation.id}),/requester cannot approve/i);
  await assert.rejects(repos.funds.verifyMaintenanceContractor({orgId:'org-t3',actorId:'admin-1',requestId:request.id}),/requires scope_approved/);
  await assert.rejects(repos.funds.approveMaintenanceScope({orgId:'org-t3',actorId:'approver-1',requestId:request.id,quotationId:'not-a-quote'}),/must belong/);
  await repos.funds.approveMaintenanceScope({orgId:'org-t3',actorId:'approver-1',requestId:request.id,quotationId:quotation.id});
  await assert.rejects(repos.funds.verifyMaintenanceContractor({orgId:'org-t3',actorId:'requester',requestId:request.id}),/requester cannot verify/i);
  await repos.funds.verifyMaintenanceContractor({orgId:'org-t3',actorId:'admin-1',requestId:request.id});
  await assert.rejects(repos.funds.approveMaintenancePayment({orgId:'org-t3',actorId:'requester',requestId:request.id}),/requester cannot approve/i);
  await repos.funds.approveMaintenancePayment({orgId:'org-t3',actorId:'approver-1',requestId:request.id});
  await assert.rejects(repos.funds.approveMaintenancePayment({orgId:'org-t3',actorId:'approver-1',requestId:request.id}),/already approved/);
  assert.equal(request.status,'contractor_verified');
  assert.ok(contractor);
});

test('payment approval threshold is two distinct approvers at exactly 10000 minor units',async()=>{
  const repos=createRepositories();
  const atThreshold=await preparedRequest(repos,{amountMinor:10000});
  await repos.funds.approveMaintenanceScope({orgId:'org-t3',actorId:'approver-a',requestId:atThreshold.request.id,quotationId:atThreshold.quotation.id});
  await repos.funds.verifyMaintenanceContractor({orgId:'org-t3',actorId:'admin-a',requestId:atThreshold.request.id});
  const first=await repos.funds.approveMaintenancePayment({orgId:'org-t3',actorId:'approver-a',requestId:atThreshold.request.id});
  assert.deepEqual({status:first.status,approvals:first.approvals,required:first.required},{status:'contractor_verified',approvals:1,required:2});

  const below=await preparedRequest(repos,{amountMinor:9999,requester:'requester-b'});
  await repos.funds.approveMaintenanceScope({orgId:'org-t3',actorId:'approver-b',requestId:below.request.id,quotationId:below.quotation.id});
  await repos.funds.verifyMaintenanceContractor({orgId:'org-t3',actorId:'admin-b',requestId:below.request.id});
  const one=await repos.funds.approveMaintenancePayment({orgId:'org-t3',actorId:'approver-b',requestId:below.request.id});
  assert.deepEqual({status:one.status,approvals:one.approvals,required:one.required},{status:'payment_approved',approvals:1,required:1});
});
