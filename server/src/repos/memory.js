import { AIUsageRepo, AICacheRepo, MemoryAnomaliesRepo, MemoryNotificationsRepo, makeMemoryAIVersion } from './aiMemory.js';
import { randomUUID } from 'node:crypto';

const toMinor = (value) => value == null ? null : Math.round(Number(value) * 100);

export class OrdersRepo {
  constructor() { this.byId = new Map(); this.byRequest = new Map(); }
  key(orgId, id) { return `${orgId}:${id}`; }
  get(id, orgId) { return this.byId.get(this.key(orgId, id)); }
  findByPayPalId(id) { return [...this.byId.values()].find((order) => order.id === id) || null; }
  byRequestKey(key, orgId) { return this.byRequest.get(this.key(orgId, key)); }
  save(order, orgId) { order.orgId = orgId; this.byId.set(this.key(orgId, order.id), order); this.byRequest.set(this.key(orgId, order.requestKey), order); return order; }
  beginCapture(id, orgId) {
    const order = this.get(id, orgId);
    if (!order) return { result: 'missing' };
    if (order.capture?.status === 'COMPLETED') return { result: 'complete', response: order.capture };
    if (order.state === 'Capturing') return { result: 'busy' };
    if (order.state !== 'Created') return { result: 'unavailable', state: order.state };
    order.state = 'Capturing';
    return { result: 'started', order };
  }
  updateState(id, orgId, state, status) { const order = this.get(id, orgId); if (order) { order.state = state; if (status) order.status = status; } return order; }
}

export class CapturesRepo {
  constructor() { this.items = []; this.refunds = new Map(); this.locks = new Set(); }
  key(orgId, id) { return `${orgId}:${id}`; }
  all(orgId) { return this.items.filter((capture) => capture.orgId === orgId); }
  get(id, orgId) { return this.items.find((capture) => capture.id === id && capture.orgId === orgId); }
  add(capture, orgId) { capture.orgId = orgId; if (!this.get(capture.id, orgId)) this.items.unshift(capture); return capture; }
  async addFromWebhook(capture) {
    const order = this.orders?.findByPayPalId(capture.orderId);
    if (!order) throw new Error('verified capture does not match a stored PayPal order');
    if (order.fundContributionId && this.funds) {
      const contribution = await this.funds.getContribution(order.orgId, order.fundContributionId);
      if (!contribution) throw new Error('verified capture contribution link is missing');
      if (toMinor(capture.value) !== contribution.amountMinor || capture.currency !== 'USD') {
        contribution.captureMismatch = true;
        contribution.captureMismatchReason = 'Verified PayPal capture amount or currency does not match the pledge.';
        return { orgId: order.orgId, mismatch: true };
      }
      const stored = this.add(capture, order.orgId);
      if (capture.status === 'COMPLETED' && contribution.status === 'pledged') {
        contribution.status = 'received';
        contribution.paypalCaptureId = capture.id;
        contribution.receivedAt = capture.occurredAt || new Date().toISOString();
        contribution.captureMismatch = false;
        contribution.receipt ||= { receiptNumber: `RCP-${contribution.id.replaceAll('-', '').slice(0,16).toUpperCase()}`, issuedAt: contribution.receivedAt };
      }
      return { orgId: order.orgId, capture: stored, mismatch: false };
    }
    return { orgId: order.orgId, capture: this.add(capture, order.orgId), mismatch: false };
  }
  refund(approvalId, orgId) { return this.refunds.get(this.key(orgId, approvalId)); }
  saveRefund(approvalId, result, orgId) { this.refunds.set(this.key(orgId, approvalId), result); }
  isLocked(approvalId, orgId) { return this.locks.has(this.key(orgId, approvalId)); }
  lock(approvalId, orgId) { this.locks.add(this.key(orgId, approvalId)); }
  unlock(approvalId, orgId) { this.locks.delete(this.key(orgId, approvalId)); }
}

export class ApprovalsRepo {
  constructor(captures) { this.items = new Map(); this.captures = captures; }
  key(orgId, id) { return `${orgId}:${id}`; }
  get(id, orgId) { return this.items.get(this.key(orgId, id)); }
  save(id, registration, orgId) { registration.orgId = orgId; this.items.set(this.key(orgId, id), registration); return registration; }
  async createAIProposal({ orgId, actorId, proposalType, captureId = null, invoiceId = null, amount = null, currency = null, requestPayload }) {
    const approvalId = `AI-${randomUUID()}`;
    const approval = { approvalId, orgId, proposalType, captureId, invoiceId, amount, currency, status: 'pending', requestPayload, createdBy: actorId, createdAt: new Date().toISOString() };
    this.items.set(this.key(orgId, approvalId), approval);
    return approval;
  }
  list(orgId, { status, limit = 50, offset = 0 } = {}) { return [...this.items.values()].filter((item) => item.orgId === orgId && (!status || item.status?.toLowerCase() === status)).slice(offset, offset + limit); }
  countPending(orgId) { return this.list(orgId, { status: 'pending' }).length; }
  decide(id, orgId, decision, note, reviewerId) {
    const approval = this.get(id, orgId);
    if (!approval) return { result: 'missing', approval: null };
    if (['processing','completed','pending_verification'].includes(approval.status?.toLowerCase())) return { result: 'already_submitted', approval };
    if (approval.status?.toLowerCase() !== 'pending') return { result: 'already_decided', approval };
    approval.status = decision === 'approve' ? 'Processing' : 'Rejected';
    approval.decisionNote = note; approval.reviewerId = reviewerId;
    if (decision === 'approve') {
      const capture = this.captures?.get(approval.captureId, orgId);
      if (capture) capture.reserved = Number((Number(capture.reserved || 0) + Number(approval.amount)).toFixed(2));
    }
    return { result: 'decided', approval };
  }
  finishRefund(id, orgId, refund) {
    const approval = this.get(id, orgId);
    const capture = approval && this.captures?.get(approval.captureId, orgId);
    if (approval) { approval.status = 'Completed'; approval.result = refund; }
    if (capture) { capture.reserved = Math.max(0, Number((Number(capture.reserved || 0) - Number(approval.amount)).toFixed(2))); capture.refunded = Number((Number(capture.refunded || 0) + Number(approval.amount)).toFixed(2)); }
    return approval;
  }
  setRefundOutcome(id, orgId, status, result) {
    const approval = this.get(id, orgId);
    const capture = approval && this.captures?.get(approval.captureId, orgId);
    if (capture && ['approved','pending','failed'].includes(status)) capture.reserved = Math.max(0, Number((Number(capture.reserved || 0) - Number(approval.amount)).toFixed(2)));
    if (approval) { approval.status = status; approval.result = result; }
    return approval;
  }
}

export class EventsRepo {
  constructor() { this.events = []; this.calls = []; }
  addEvent(event) { if (!this.events.some((old) => old.id && event.id && old.id === event.id)) this.events.unshift(event); this.events.length = Math.min(this.events.length, 30); }
  addCall(call, orgId = call.orgId) { if (orgId) call.orgId = orgId; this.calls.unshift(call); this.calls.length = Math.min(this.calls.length, 30); }
  snapshot(orgId) { return { events: this.events.filter((event) => event.orgId === orgId), calls: this.calls.filter((call) => call.orgId === orgId) }; }
  async receive(event) { this.addEvent({ t: new Date().toISOString(), type: event.type, id: event.id, verification: 'UNVERIFIED', orgId: null, rawBody: event.rawBody, headers: event.headers, payload: event.payload, processingStatus: 'queued', attempts: 0 }); return event.id; }
  async claim(id) { const event = this.events.find((row) => row.id === id); if (!event || !['queued','retry'].includes(event.processingStatus)) return null; event.processingStatus = 'processing'; event.attempts += 1; return event; }
  async pending() { return this.events.filter((row) => ['queued','retry'].includes(row.processingStatus)); }
  async complete(id, verification, orgId, status, error) { const event = this.events.find((row) => row.id === id); if (event) Object.assign(event, { verification, orgId, processingStatus: status, lastError: error }); }
  async anomalyCandidates(orgId) { return this.events.filter((row) => row.orgId === orgId); }
}

export function createRepositories() {
  const captures = new CapturesRepo();
  const orders = new OrdersRepo();
  captures.orders = orders;
  const campaignRows = new Map();
  const contributionRows = new Map();
  const maintenanceRows = new Map();
  const contractorRows = new Map();
  const quotationRows = new Map();
  const maintenanceApprovalRows = new Map();
  const maintenancePaymentRows = new Map();
  const completionEvidenceRows = new Map();
  const fundAuditRows = [];
  const approvalRepo = new ApprovalsRepo(captures);
  const maintenanceError = (code, statusCode, message) => Object.assign(new Error(message), { code, statusCode });
  const funds = {
    key(orgId, id) { return `${orgId}:${id}`; },
    async listCampaigns(orgId) { return [...campaignRows.values()].filter((row) => row.orgId === orgId); },
    async createCampaign(input) {
      const row = { id: randomUUID(), org_id: input.orgId, orgId: input.orgId, title: input.title, purpose: input.purpose, target_minor: input.targetMinor, targetMinor: input.targetMinor, currency: 'USD', deadline: input.deadline || null, organiser: input.organiser, status: input.status, created_by: input.actorId };
      campaignRows.set(this.key(input.orgId,row.id),row); return row;
    },
    async createPledge(input) {
      const campaign = campaignRows.get(this.key(input.orgId,input.campaignId));
      if (!campaign) throw Object.assign(new Error('campaign not found'),{statusCode:404});
      if (campaign.status !== 'active') throw Object.assign(new Error('campaign is not accepting contributions'),{statusCode:409});
      const row = { id: randomUUID(), org_id: input.orgId, orgId: input.orgId, campaign_id: input.campaignId, campaignId: input.campaignId, amount_minor: input.amountMinor, amountMinor: input.amountMinor, status: 'pledged', donor_ref: 'anonymous', donorRef: 'anonymous', created_by: input.actorId, createdBy: input.actorId, capture_mismatch: false, captureMismatch: false };
      contributionRows.set(this.key(input.orgId,row.id),row); return row;
    },
    async getContribution(orgId,id) { return contributionRows.get(this.key(orgId,id)) || null; },
    async linkContributionOrder(input) {
      const contribution = await this.getContribution(input.orgId,input.contributionId);
      const order = orders.byRequestKey(input.requestKey,input.orgId);
      if (!contribution || !order || order.id !== input.orderId || toMinor(order.amount) !== contribution.amountMinor) throw new Error('PayPal order does not match contribution');
      order.fundContributionId = contribution.id; order.approveUrl = input.approveUrl;
      contribution.paypalOrderId = input.orderId;
      return { contribution_id:contribution.id,paypal_order_id:input.orderId,approve_url:input.approveUrl };
    },
    async campaignSummary(orgId,id) {
      const campaign=campaignRows.get(this.key(orgId,id));
      if (!campaign) throw Object.assign(new Error('campaign not found'),{statusCode:404});
      const contributions=[...contributionRows.values()].filter((row)=>row.orgId===orgId&&row.campaignId===id);
      const pledgedMinor=contributions.filter((row)=>row.status==='pledged').reduce((sum,row)=>sum+row.amountMinor,0);
      const receivedMinor=contributions.filter((row)=>row.status==='received').reduce((sum,row)=>sum+row.amountMinor,0);
      return { campaign:{id:campaign.id,title:campaign.title,purpose:campaign.purpose,targetMinor:campaign.targetMinor,currency:'USD',deadline:campaign.deadline,organiser:campaign.organiser,status:campaign.status},pledgedMinor,receivedMinor,allocatedMinor:0,approvedExpensesMinor:0,actualSpendingMinor:0,remainingMinor:campaign.targetMinor-receivedMinor,asOf:new Date().toISOString(),legalCaution:'Real-money pooled funds, donations, and third-party payouts depend on PayPal product eligibility and local rules. Sandbox demonstrates the workflow only.' };
    },
    async createMaintenanceRequest(input) {
      if (input.campaignId && !campaignRows.has(this.key(input.orgId,input.campaignId))) throw maintenanceError('CAMPAIGN_NOT_FOUND',404,'Campaign was not found.');
      const row={id:randomUUID(),org_id:input.orgId,campaign_id:input.campaignId||null,title:input.title,scope:input.scope,status:'requested',estimate_minor:input.estimateMinor||null,requested_by:input.actorId,created_at:new Date().toISOString()};
      maintenanceRows.set(this.key(input.orgId,row.id),row);return row;
    },
    async createContractor(input) {
      const row={id:randomUUID(),org_id:input.orgId,name:input.name,verification_status:'unverified',verified_by:null,verified_at:null,payment_destination_ref:input.paymentDestinationRef||null};
      contractorRows.set(this.key(input.orgId,row.id),row);return row;
    },
    async addQuotation(input) {
      const request=maintenanceRows.get(this.key(input.orgId,input.requestId));const contractor=contractorRows.get(this.key(input.orgId,input.contractorId));
      if(!request)throw maintenanceError('MAINTENANCE_NOT_FOUND',404,'Maintenance request was not found.');
      if(!contractor)throw maintenanceError('CONTRACTOR_NOT_FOUND',404,'Contractor was not found.');
      if(!['requested','quoting'].includes(request.status))throw maintenanceError('INVALID_MAINTENANCE_STATE',409,'A quotation can only be added while requested or quoting.');
      const row={id:randomUUID(),org_id:input.orgId,maintenance_request_id:request.id,contractor_id:contractor.id,amount_minor:input.amountMinor,currency:'USD',document_ref:input.documentRef||null};
      quotationRows.set(this.key(input.orgId,row.id),row);if(request.status==='requested')request.status='quoting';return row;
    },
    async approveMaintenanceScope(input) {
      const request=maintenanceRows.get(this.key(input.orgId,input.requestId));const quote=quotationRows.get(this.key(input.orgId,input.quotationId));
      if(!request)throw maintenanceError('MAINTENANCE_NOT_FOUND',404,'Maintenance request was not found.');
      if(request.status!=='quoting')throw maintenanceError('INVALID_MAINTENANCE_STATE',409,'Scope approval requires quoting state.');
      if(request.requested_by===input.actorId)throw maintenanceError('SELF_APPROVAL_FORBIDDEN',403,'Requester cannot approve own request.');
      if(!quote||quote.maintenance_request_id!==request.id)throw maintenanceError('QUOTATION_NOT_FOR_REQUEST',409,'Chosen quotation must belong to this request.');
      const approval={id:randomUUID(),org_id:input.orgId,maintenance_request_id:request.id,step:'scope',approver_id:input.actorId,decision:'approved',note:input.note||null};
      maintenanceApprovalRows.set(this.key(input.orgId,approval.id),approval);request.chosen_quotation_id=quote.id;request.contractor_id=quote.contractor_id;request.status='scope_approved';return {request,approval};
    },
    async verifyMaintenanceContractor(input) {
      const request=maintenanceRows.get(this.key(input.orgId,input.requestId));
      if(!request)throw maintenanceError('MAINTENANCE_NOT_FOUND',404,'Maintenance request was not found.');
      if(request.status!=='scope_approved')throw maintenanceError('INVALID_MAINTENANCE_STATE',409,'Contractor verification requires scope_approved state.');
      if(request.requested_by===input.actorId)throw maintenanceError('SELF_APPROVAL_FORBIDDEN',403,'Requester cannot verify own request.');
      const contractor=contractorRows.get(this.key(input.orgId,request.contractor_id));
      if(!contractor)throw maintenanceError('CONTRACTOR_NOT_FOUND',404,'Chosen contractor was not found.');
      contractor.verification_status='verified';contractor.verified_by=input.actorId;contractor.verified_at=new Date().toISOString();request.status='contractor_verified';return {request,contractor};
    },
    async approveMaintenancePayment(input) {
      const request=maintenanceRows.get(this.key(input.orgId,input.requestId));
      if(!request)throw maintenanceError('MAINTENANCE_NOT_FOUND',404,'Maintenance request was not found.');
      if(request.status!=='contractor_verified')throw maintenanceError('INVALID_MAINTENANCE_STATE',409,'Payment approval requires contractor_verified state.');
      if(request.requested_by===input.actorId)throw maintenanceError('SELF_APPROVAL_FORBIDDEN',403,'Requester cannot approve own request.');
      const quote=quotationRows.get(this.key(input.orgId,request.chosen_quotation_id));if(!quote)throw maintenanceError('QUOTATION_NOT_FOUND',404,'Chosen quotation was not found.');
      const approvals=[...maintenanceApprovalRows.values()].filter(a=>a.org_id===input.orgId&&a.maintenance_request_id===request.id&&a.step==='payment'&&a.decision==='approved');
      if(approvals.some(a=>a.approver_id===input.actorId))throw maintenanceError('DUPLICATE_APPROVER',409,'This approver already approved the payment.');
      const approval={id:randomUUID(),org_id:input.orgId,maintenance_request_id:request.id,step:'payment',approver_id:input.actorId,decision:'approved',note:input.note||null};maintenanceApprovalRows.set(this.key(input.orgId,approval.id),approval);
      const required=quote.amount_minor>=10000?2:1;const count=approvals.length+1;if(count>=required)request.status='payment_approved';
      return {status:request.status,approvals:count,required,approval};
    },
    async requestMaintenancePayment(input) {
      const request=maintenanceRows.get(this.key(input.orgId,input.requestId));
      if(!request)throw maintenanceError('MAINTENANCE_NOT_FOUND',404,'Maintenance request was not found.');
      const existing=[...approvalRepo.items.values()].find(row=>row.orgId===input.orgId&&row.proposalType==='maintenance-payment'&&row.fundMaintenanceRequestId===request.id);
      if(existing)return existing;
      if(request.status!=='payment_approved')throw maintenanceError('INVALID_MAINTENANCE_STATE',409,'Payment request requires payment_approved state.');
      const quote=quotationRows.get(this.key(input.orgId,request.chosen_quotation_id));
      if(!quote)throw maintenanceError('QUOTATION_NOT_FOUND',409,'Chosen quotation was not found.');
      const contractor=contractorRows.get(this.key(input.orgId,request.contractor_id));
      if(!contractor||contractor.verification_status!=='verified')throw maintenanceError('CONTRACTOR_NOT_VERIFIED',409,'Contractor must be verified.');
      const approvals=[...maintenanceApprovalRows.values()].filter(a=>a.org_id===input.orgId&&a.maintenance_request_id===request.id&&a.step==='payment'&&a.decision==='approved');
      const required=quote.amount_minor>=10000?2:1;
      if(new Set(approvals.map(a=>a.approver_id)).size<required)throw maintenanceError('PAYMENT_APPROVALS_REQUIRED',409,'Payment approval threshold is not satisfied.');
      const approvalId=`APR-FUND-PAY-${request.id.replaceAll('-','')}`;
      const approval={approvalId,orgId:input.orgId,proposalType:'maintenance-payment',captureId:null,invoiceId:null,fundMaintenanceRequestId:request.id,amount:quote.amount_minor/100,amountMinor:quote.amount_minor,currency:'USD',status:'pending',requestPayload:{maintenanceRequestId:request.id,quotationId:quote.id,mode:'SIMULATED',gap:'simulated, no ledger entry'},createdBy:input.actorId,createdAt:new Date().toISOString()};
      approvalRepo.save(approvalId,approval,input.orgId);
      return approval;
    },
    async decideMaintenancePayment(input) {
      const approval=approvalRepo.get(input.approvalId,input.orgId);
      if(!approval||approval.proposalType!=='maintenance-payment')throw maintenanceError('PAYMENT_APPROVAL_NOT_FOUND',404,'Maintenance payment approval was not found.');
      if(approval.status==='completed'&&input.decision==='approve')return approval.result;
      if(approval.status==='rejected'&&input.decision==='reject')return approval.result;
      if(approval.status!=='pending')throw maintenanceError('PAYMENT_APPROVAL_DECIDED',409,'Maintenance payment approval is already decided.');
      if(input.decision==='reject'){
        approval.status='rejected';approval.decisionNote=input.note||'';approval.reviewerId=input.reviewerId;
        approval.result={approvalId:approval.approvalId,status:'rejected',mode:'SIMULATED',simulated:true,gap:'simulated, no ledger entry'};
        return approval.result;
      }
      const request=maintenanceRows.get(this.key(input.orgId,approval.fundMaintenanceRequestId));
      if(!request)throw maintenanceError('MAINTENANCE_NOT_FOUND',404,'Maintenance request was not found.');
      if(request.requested_by===input.reviewerId)throw maintenanceError('SELF_APPROVAL_FORBIDDEN',403,'Requester cannot approve own request.');
      if(request.status!=='payment_approved')throw maintenanceError('INVALID_MAINTENANCE_STATE',409,'Maintenance request is not payment_approved.');
      const quote=quotationRows.get(this.key(input.orgId,request.chosen_quotation_id));
      const contractor=contractorRows.get(this.key(input.orgId,request.contractor_id));
      if(!quote||!contractor||contractor.verification_status!=='verified')throw maintenanceError('PAYMENT_GATE_FAILED',409,'Chosen quotation and verified contractor are required.');
      const prior=[...maintenanceApprovalRows.values()].filter(a=>a.org_id===input.orgId&&a.maintenance_request_id===request.id&&a.step==='payment'&&a.decision==='approved');
      const required=quote.amount_minor>=10000?2:1;
      if(new Set(prior.map(a=>a.approver_id)).size<required)throw maintenanceError('PAYMENT_APPROVALS_REQUIRED',409,'Payment approval threshold is not satisfied.');
      const key=this.key(input.orgId,request.id);
      let payment=maintenancePaymentRows.get(key);
      if(!payment){
        const finalApproval=prior.at(-1);
        payment={id:randomUUID(),org_id:input.orgId,maintenance_request_id:request.id,quotation_id:quote.id,amount_minor:quote.amount_minor,approval_id:finalApproval.id,mode:'SIMULATED',paypal_payout_ref:null,ledger_entry_id:null,status:'paid'};
        maintenancePaymentRows.set(key,payment);request.status='paid';
      }
      approval.status='completed';approval.decisionNote=input.note||'';approval.reviewerId=input.reviewerId;
      approval.result={approvalId:approval.approvalId,status:'simulated',mode:'SIMULATED',simulated:true,paymentId:payment.id,maintenanceRequestId:request.id,amountMinor:payment.amount_minor,currency:'USD',paypalPayoutRef:null,ledgerEntryId:null,gap:'simulated, no ledger entry',legalCaution:'Real-money pooled funds and third-party payouts depend on PayPal product eligibility and local rules. Sandbox demonstrates the workflow only.'};
      return approval.result;
    },
    async listMaintenancePayments(orgId) { return [...maintenancePaymentRows.values()].filter(row=>row.org_id===orgId); },
    async submitCompletionEvidence(input) {
      const request=maintenanceRows.get(this.key(input.orgId,input.requestId));
      if(!request)throw maintenanceError('MAINTENANCE_NOT_FOUND',404,'Maintenance request was not found.');
      const existing=[...completionEvidenceRows.values()].find(row=>row.org_id===input.orgId&&row.request_id===input.requestKey);
      if(existing){
        if(existing.maintenance_request_id!==request.id||existing.submitted_by!==input.actorId||existing.kind!==input.kind||existing.description!==input.description||existing.file_ref!==(input.fileRef||null))throw maintenanceError('CONFLICT',409,'Evidence request ID was already used.');
        return {request,evidence:existing,caution:'Evidence supports, but does not prove, that work was done correctly.'};
      }
      if(!['paid','evidence_submitted'].includes(request.status))throw maintenanceError('INVALID_MAINTENANCE_STATE',409,'Completion evidence requires a paid maintenance request.');
      if(!['photo','invoice','inspection','other'].includes(input.kind)||!input.description?.trim()||input.description.trim().length>2000||(input.fileRef||'').trim().length>500)throw maintenanceError('INVALID_EVIDENCE',400,'Completion evidence metadata is invalid.');
      const evidence={id:randomUUID(),org_id:input.orgId,maintenance_request_id:request.id,kind:input.kind,description:input.description.trim(),file_ref:input.fileRef?.trim()||null,submitted_by:input.actorId,submitted_at:new Date().toISOString(),request_id:input.requestKey,review_status:'pending',reviewed_by:null,reviewed_at:null,review_note:null};
      completionEvidenceRows.set(this.key(input.orgId,evidence.id),evidence);
      if(request.status==='paid'){request.status='evidence_submitted';fundAuditRows.push({org_id:input.orgId,action:'fund.maintenance.evidence_submitted',requestId:request.id,actorId:input.actorId});}
      fundAuditRows.push({org_id:input.orgId,action:'fund.completion_evidence.submitted',evidenceId:evidence.id,actorId:input.actorId});
      return {request,evidence,caution:'Evidence supports, but does not prove, that work was done correctly.'};
    },
    async reviewCompletionEvidence(input) {
      const request=maintenanceRows.get(this.key(input.orgId,input.requestId));
      const evidence=completionEvidenceRows.get(this.key(input.orgId,input.evidenceId));
      if(!request||!evidence||evidence.maintenance_request_id!==request.id)throw maintenanceError('EVIDENCE_NOT_FOUND',404,'Completion evidence was not found.');
      if(request.requested_by===input.actorId||evidence.submitted_by===input.actorId)throw maintenanceError('SELF_REVIEW_FORBIDDEN',403,'Requester or evidence submitter cannot review this evidence.');
      if(!['accept','reject'].includes(input.decision))throw maintenanceError('INVALID_EVIDENCE_REVIEW',400,'Evidence review decision is invalid.');
      if(evidence.review_status!=='pending'){
        if((input.decision==='accept'&&evidence.review_status==='accepted')||(input.decision==='reject'&&evidence.review_status==='rejected'))return {request,evidence,caution:'Evidence supports, but does not prove, that work was done correctly.'};
        throw maintenanceError('EVIDENCE_ALREADY_REVIEWED',409,'Completion evidence was already reviewed.');
      }
      if(request.status!=='evidence_submitted')throw maintenanceError('INVALID_MAINTENANCE_STATE',409,'Request is not awaiting evidence review.');
      evidence.review_status=input.decision==='accept'?'accepted':'rejected';evidence.reviewed_by=input.actorId;evidence.reviewed_at=new Date().toISOString();evidence.review_note=input.note?.trim()||null;
      fundAuditRows.push({org_id:input.orgId,action:`fund.completion_evidence.${evidence.review_status}`,evidenceId:evidence.id,actorId:input.actorId});
      const rows=[...completionEvidenceRows.values()].filter(row=>row.org_id===input.orgId&&row.maintenance_request_id===request.id);
      if(!rows.some(row=>row.review_status==='pending')&&rows.some(row=>row.review_status==='accepted')){
        request.status='reviewed';request.reviewed_by=input.actorId;request.reviewed_at=new Date().toISOString();fundAuditRows.push({org_id:input.orgId,action:'fund.maintenance.reviewed',requestId:request.id,actorId:input.actorId});
      }
      return {request,evidence,caution:'Evidence supports, but does not prove, that work was done correctly.'};
    },
    async closeMaintenanceRequest(input) {
      const request=maintenanceRows.get(this.key(input.orgId,input.requestId));
      if(!request)throw maintenanceError('MAINTENANCE_NOT_FOUND',404,'Maintenance request was not found.');
      if(request.status==='closed')return {request,closed:true};
      if(request.status!=='reviewed'||!request.reviewed_by)throw maintenanceError('INVALID_MAINTENANCE_STATE',409,'Request must be reviewed before close.');
      if(request.requested_by===input.actorId)throw maintenanceError('SELF_REVIEW_FORBIDDEN',403,'Requester cannot close own maintenance request.');
      if(![...completionEvidenceRows.values()].some(row=>row.org_id===input.orgId&&row.maintenance_request_id===request.id&&row.review_status==='accepted'))throw maintenanceError('ACCEPTED_EVIDENCE_REQUIRED',409,'Accepted completion evidence is required before close.');
      request.status='closed';request.closed_by=input.actorId;request.closed_at=new Date().toISOString();fundAuditRows.push({org_id:input.orgId,action:'fund.maintenance.closed',requestId:request.id,actorId:input.actorId});
      return {request,closed:true};
    },
    async listCompletionEvidence(orgId,requestId) { return [...completionEvidenceRows.values()].filter(row=>row.org_id===orgId&&row.maintenance_request_id===requestId); },
    async listFundAudit(orgId) { return fundAuditRows.filter(row=>row.org_id===orgId); },
  };
  captures.funds = funds;
  const notifications = new MemoryNotificationsRepo();
  const repos = { orders, captures, approvals: approvalRepo, events: new EventsRepo(), notifications, funds };
  repos.anomalies = new MemoryAnomaliesRepo(notifications);
  repos.ai = {
    usage: new AIUsageRepo(),
    cache: new AICacheRepo(),
    async dataVersion(orgId) {
      return makeMemoryAIVersion({
        orders: [...orders.byId.values()].filter((row) => row.orgId === orgId).map(({ id, state, status, amount }) => ({ id, state, status, amount })),
        captures: captures.all(orgId).map(({ id, status, value, fee, net, refunded, reserved }) => ({ id, status, value, fee, net, refunded, reserved })),
        approvals: repos.approvals.list(orgId).map(({ approvalId, status, proposalType, amount, captureId, invoiceId }) => ({ approvalId, status, proposalType, amount, captureId, invoiceId })),
      });
    },
    async listOrgIds() {
      return [...new Set([
        ...[...orders.byId.values()].map((row) => row.orgId),
        ...captures.items.map((row) => row.orgId),
        ...repos.events.events.map((row) => row.orgId),
      ].filter(Boolean))];
    },
  };
  repos.listTransactions = async (orgId, filters = {}) => {
    const rows = repos.captures.all(orgId).map((capture) => ({ id: capture.id, org_id: orgId, source_type: 'capture', source_id: capture.id, status: capture.status, amount_minor: toMinor(capture.value), fee_minor: toMinor(capture.fee), net_minor: toMinor(capture.net), currency: capture.currency, occurred_at: capture.occurredAt || new Date().toISOString() }));
    for (const approval of repos.approvals.items.values()) {
      if (approval.orgId !== orgId || approval.status?.toLowerCase() !== 'completed' || !approval.result) continue;
      const refund = approval.result;
      const breakdown = refund.seller_payable_breakdown || {};
      rows.push({ id: String(refund.id || approval.approvalId), org_id: orgId, source_type: 'refund', source_id: String(refund.id || approval.approvalId), paypal_capture_id: approval.captureId, paypal_refund_id: refund.id || null, status: String(refund.status || 'COMPLETED'), amount_minor: toMinor(refund.amount?.value || approval.amount), fee_minor: toMinor(breakdown.paypal_fee?.value), net_minor: toMinor(breakdown.net_amount?.value), currency: String(refund.amount?.currency_code || approval.currency || 'USD'), occurred_at: refund.create_time || refund.update_time || approval.createdAt || new Date().toISOString() });
    }
    const parsed = rows.filter((row) => (!filters.type || row.source_type === filters.type) && (!filters.status || row.status === filters.status)
      && (!filters.from || Date.parse(row.occurred_at) >= Date.parse(filters.from)) && (!filters.to || Date.parse(row.occurred_at) <= Date.parse(filters.to)));
    parsed.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
    return parsed.slice(Number(filters.offset || 0), Number(filters.offset || 0) + Number(filters.limit || 50));
  };
  repos.listLedgerEntries = async () => [];
  repos.trialBalance = async (orgId, currency = 'USD') => ({ currency, accounts: [], totals: { debitMinor: 0, creditMinor: 0, debits: '0.00', credits: '0.00' }, balanced: true });
  repos.reconcile = async (orgId, currency = 'USD') => ({ org_id: orgId, status: 'clean', currency, details: {} });
  repos.listReconciliations = async () => [];
  const storedRates = new Map();
  repos.fxRates = {
    async get(orgId, base, quote) { return storedRates.get(`${orgId}:${base}:${quote}`) || null; },
    async put(row) { storedRates.set(`${row.org_id}:${row.base_currency}:${row.quote_currency}`,row); return row; },
  };
  repos.invoices = {
    async list() { return []; }, async get() { return null; }, async createDraft() { throw Object.assign(new Error('Invoice persistence requires Supabase.'),{statusCode:503,code:'DATABASE_UNAVAILABLE'}); },
    async setState() { return null; }, async setPayPalDraft() { return null; }, async requestSendApproval() { return null; }, async completeSend() { return null; }, async failSend() { return null; }, async markPaid() { return {updated:false}; },
  };
  repos.approvals.decideInvoiceSend = async () => ({result:'missing',approval:null});
  repos.reports = { async rows() { return []; } };
  return repos;
}
