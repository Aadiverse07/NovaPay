import { captureJournalLines, fundContributionJournalLines, refundJournalLines } from '../services/ledger.js';

const q = (values) => new URLSearchParams(values).toString();
const journalLinesPayload = (lines) => lines.map((line) => ({ account_code: line.accountCode, debit_minor: line.debitMinor, credit_minor: line.creditMinor, currency: line.currency }));

export function moneyToMinor(value) {
  const text = String(value ?? '');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Invalid money amount.');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  const result = Number(negative ? -minor : minor);
  if (!Number.isSafeInteger(result)) throw new Error('Money amount is too large.');
  return result;
}

export const minorToMoney = (minor) => (Number(minor) / 100).toFixed(2);

function mapOrder(row) {
  return row && ({ id: row.paypal_order_id, dbId: row.id, orgId: row.org_id, requestKey: row.request_key, fundContributionId: row.fund_contribution_id || null, amount: minorToMoney(row.amount_minor), currency: row.currency, status: row.status, state: row.state, approveUrl: row.approve_url, capture: row.capture_response || null });
}

function mapCapture(row) {
  return row && ({ id: row.paypal_capture_id, dbId: row.id, orderId: row.order_paypal_order_id || null, orgId: row.org_id, value: minorToMoney(row.amount_minor), amountMinor: Number(row.amount_minor), currency: row.currency, status: row.status, fee: row.fee_minor == null ? undefined : minorToMoney(row.fee_minor), net: row.net_minor == null ? undefined : minorToMoney(row.net_minor), refunded: Number(row.refunded_minor || 0) / 100, reserved: Number(row.reserved_minor || 0) / 100, refundedMinor: Number(row.refunded_minor || 0), reservedMinor: Number(row.reserved_minor || 0), providerPayload: row.provider_payload || {} });
}

function mapApproval(row) {
  return row && ({ approvalId: row.id, orgId: row.org_id, proposalType: row.proposal_type, captureId: row.capture_id, invoiceId: row.invoice_id || null, fundMaintenanceRequestId: row.fund_maintenance_request_id || null, requestPayload: row.request_payload || {}, amount: row.amount_minor == null ? null : minorToMoney(row.amount_minor), amountMinor: row.amount_minor == null ? null : Number(row.amount_minor), currency: row.currency, status: row.status, decisionNote: row.decision_note, reviewerId: row.reviewer_id, result: row.result || null, createdAt: row.created_at, createdBy: row.created_by });
}

function mapInvoice(row, lines = []) {
  return row && ({ id: row.id, orgId: row.org_id, invoiceNumber: row.invoice_number, state: row.state,
    customerName: row.customer_name, customerEmail: row.customer_email, currency: row.currency,
    subtotalMinor: Number(row.subtotal_minor), taxMinor: Number(row.tax_minor), totalMinor: Number(row.total_minor),
    subtotal: minorToMoney(row.subtotal_minor), tax: minorToMoney(row.tax_minor), total: minorToMoney(row.total_minor),
    paypalInvoiceId: row.paypal_invoice_id || null, paypalCaptureId: row.paypal_capture_id || null,
    createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
    lines: lines.map((line) => ({ id: line.id, description: line.description, quantity: String(line.quantity),
      unitPriceMinor: Number(line.unit_price_minor), unitPrice: minorToMoney(line.unit_price_minor), taxRate: String(line.tax_rate),
      subtotalMinor: Number(line.line_subtotal_minor), taxMinor: Number(line.tax_minor), totalMinor: Number(line.line_total_minor),
      subtotal: minorToMoney(line.line_subtotal_minor), tax: minorToMoney(line.tax_minor), total: minorToMoney(line.line_total_minor) })) });
}

export function createPostgresRepositories(database) {
  async function captureLinesForOrder(providerCapture, orderId, orgId = null) {
    const filters = { select: 'fund_contribution_id', paypal_order_id: `eq.${orderId}`, limit: '1' };
    if (orgId) filters.org_id = `eq.${orgId}`;
    const rows = await database.select('paypal_orders', q(filters));
    const buildLines = rows?.[0]?.fund_contribution_id ? fundContributionJournalLines : captureJournalLines;
    return journalLinesPayload(buildLines(providerCapture));
  }

  const orders = {
    async get(id, orgId) {
      const rows = await database.select('paypal_orders', q({ select: '*', org_id: `eq.${orgId}`, paypal_order_id: `eq.${id}`, limit: '1' }));
      return mapOrder(rows?.[0]);
    },
    async findByPayPalId(id) {
      const rows = await database.select('paypal_orders', q({ select: '*', paypal_order_id: `eq.${id}`, limit: '1' }));
      return mapOrder(rows?.[0]);
    },
    async byRequestKey(key, orgId) {
      const rows = await database.select('paypal_orders', q({ select: '*', org_id: `eq.${orgId}`, request_key: `eq.${key}`, limit: '1' }));
      return mapOrder(rows?.[0]);
    },
    async save(order, orgId) {
      const row = await database.rpc('record_paypal_order', { p_org: orgId, p_request_key: order.requestKey, p_paypal_order_id: order.id || '', p_amount_minor: moneyToMinor(order.amount), p_currency: order.currency, p_status: order.status, p_approve_url: order.approveUrl || null, p_state: order.state || 'Created' });
      return mapOrder(row);
    },
    async updateState(id, orgId, state, status) {
      return mapOrder(await database.rpc('set_paypal_order_state', { p_org: orgId, p_paypal_order_id: id, p_state: state, p_status: status || null }));
    },
    async beginCapture(id, orgId) {
      const result = await database.rpc('begin_paypal_capture', { p_org: orgId, p_paypal_order_id: id });
      if (result?.response) return { result: result.result, response: result.response };
      return { ...result, order: mapOrder(result?.order) };
    },
  };

  const captures = {
    async all(orgId) {
      const rows = await database.select('paypal_captures', q({ select: '*,paypal_orders!paypal_captures_org_id_order_id_fkey(paypal_order_id)', org_id: `eq.${orgId}`, order: 'created_at.desc' }));
      return (rows || []).map((row) => ({ ...mapCapture(row), orderId: row.paypal_orders?.paypal_order_id || null }));
    },
    async get(id, orgId) {
      const rows = await database.select('paypal_captures', q({ select: '*,paypal_orders!paypal_captures_org_id_order_id_fkey(paypal_order_id)', org_id: `eq.${orgId}`, paypal_capture_id: `eq.${id}`, limit: '1' }));
      const row = rows?.[0];
      return row ? { ...mapCapture(row), orderId: row.paypal_orders?.paypal_order_id || null } : null;
    },
    async add(capture, orgId) {
      const providerCapture = { id: capture.id, gross: capture.value, fee: capture.fee, net: capture.net, currency: capture.currency, amount: { value: capture.value, currency_code: capture.currency } };
      const lines = await captureLinesForOrder(providerCapture, capture.orderId, orgId);
      const result = await database.rpc('record_paypal_capture', { p_org: orgId, p_paypal_order_id: capture.orderId, p_capture: { id: capture.id, amount: { minor: moneyToMinor(capture.value) }, fee_minor: capture.fee == null ? null : moneyToMinor(capture.fee), net_minor: capture.net == null ? null : moneyToMinor(capture.net), currency: capture.currency, status: capture.status, occurred_at: capture.occurredAt || null, provider_payload: capture.providerPayload || {} }, p_lines: lines });
      return mapCapture(result?.capture);
    },
    async addFromWebhook(capture) {
      const providerCapture = { id: capture.id, gross: capture.value, fee: capture.fee, net: capture.net, currency: capture.currency, amount: { value: capture.value, currency_code: capture.currency } };
      const lines = await captureLinesForOrder(providerCapture, capture.orderId);
      const result = await database.rpc('record_fund_paypal_capture_event', { p_paypal_order_id: capture.orderId, p_capture: { id: capture.id, amount: { minor: moneyToMinor(capture.value) }, fee_minor: capture.fee == null ? null : moneyToMinor(capture.fee), net_minor: capture.net == null ? null : moneyToMinor(capture.net), currency: capture.currency, status: capture.status, occurred_at: capture.occurredAt || null, provider_payload: capture.providerPayload || {} }, p_lines: lines });
      return { orgId: result?.orgId, mismatch: Boolean(result?.mismatch), capture: mapCapture(result?.result?.capture) };
    },
    async refund(approvalId, orgId) {
      const rows = await database.select('approvals', q({ select: 'result', org_id: `eq.${orgId}`, id: `eq.${approvalId}`, limit: '1' }));
      return rows?.[0]?.result || null;
    },
    async saveRefund(approvalId, result, orgId) {
      await database.rpc('set_refund_outcome', { p_org: orgId, p_approval_id: approvalId, p_status: result.status === 'COMPLETED' ? 'completed' : 'pending_verification', p_result: result, p_error: result.error || null });
      return result;
    },
    isLocked() { return false; },
    lock() {},
    unlock() {},
  };

  const approvals = {
    async get(id, orgId) {
      const rows = await database.select('approvals', q({ select: '*', org_id: `eq.${orgId}`, id: `eq.${id}`, limit: '1' }));
      return mapApproval(rows?.[0]);
    },
    async save(id, registration, orgId, actorId = null) {
      const row = await database.rpc('register_refund_approval', { p_org: orgId, p_approval_id: id, p_capture_id: registration.captureId, p_amount_minor: moneyToMinor(registration.amount), p_currency: registration.currency, p_created_by: actorId, p_request_payload: registration });
      return mapApproval(row);
    },
    async createAIProposal({ orgId, actorId, proposalType, captureId = null, invoiceId = null, amount = null, currency = null, requestPayload }) {
      const row = await database.rpc('create_ai_proposal', {
        p_org: orgId,
        p_created_by: actorId,
        p_proposal_type: proposalType,
        p_capture_id: captureId,
        p_invoice_id: invoiceId,
        p_amount_minor: amount == null ? null : moneyToMinor(amount),
        p_currency: currency,
        p_request_payload: requestPayload,
      });
      return mapApproval(row);
    },
    async list(orgId, { status, limit = 50, offset = 0 } = {}) {
      const params = { select: '*', org_id: `eq.${orgId}`, order: 'created_at.desc', limit: String(limit), offset: String(offset) };
      if (status) params.status = `eq.${status}`;
      return (await database.select('approvals', q(params)) || []).map(mapApproval);
    },
    async countPending(orgId) {
      const rows = await database.select('approvals', q({ select: 'id', org_id: `eq.${orgId}`, status: 'eq.pending' }));
      return rows?.length || 0;
    },
    async decide(id, orgId, decision, note, reviewerId, requestId) {
      const result = await database.rpc('decide_refund_approval', { p_org: orgId, p_approval_id: id, p_decision: decision, p_note: note, p_reviewer: reviewerId, p_request_id: requestId });
      return { result: result?.result, approval: mapApproval(result?.approval) };
    },
    async decideInvoiceSend(id, orgId, decision, note, reviewerId, requestId) {
      const result = await database.rpc('decide_invoice_send_approval', { p_org: orgId, p_approval_id: id, p_decision: decision, p_note: note, p_reviewer: reviewerId, p_request_id: requestId });
      return { result: result?.result, approval: mapApproval(result?.approval) };
    },
    async finishRefund(id, orgId, refund) {
      return mapApproval(await database.rpc('finish_refund', { p_org: orgId, p_approval_id: id, p_refund: refund, p_lines: journalLinesPayload(refundJournalLines(refund)) }));
    },
    async setRefundOutcome(id, orgId, status, result) {
      return mapApproval(await database.rpc('set_refund_outcome', { p_org: orgId, p_approval_id: id, p_status: status, p_result: result || null, p_error: result?.error || null }));
    },
  };

  const events = {
    async receive(event) {
      return database.rpc('receive_paypal_event', { p_event_id: event.id, p_event_type: event.type, p_raw_body: event.rawBodyBase64, p_payload: event.payload, p_headers: event.headers });
    },
    async claim(id) {
      const row = await database.rpc('claim_paypal_event', { p_id: id });
      if (row?.raw_body && typeof row.raw_body === 'string' && row.raw_body.startsWith('\\\\x')) row.rawBody = Buffer.from(row.raw_body.slice(3),'hex').toString('utf8');
      else if (row?.raw_body && typeof row.raw_body === 'string' && row.raw_body.startsWith('\\x')) row.rawBody = Buffer.from(row.raw_body.slice(2),'hex').toString('utf8');
      else row.rawBody = row?.raw_body;
      return row;
    },
    async pending() { return database.rpc('list_pending_paypal_events', {}); },
    async anomalyCandidates(orgId) {
      return database.select('paypal_events', q({ select: 'event_id,processing_status,created_at', org_id: `eq.${orgId}`, processing_status: 'in.(queued,retry,processing,dead_letter)', order: 'created_at.asc', limit: '100' }));
    },
    async complete(id, verification, orgId, status, error = null) { return database.rpc('complete_paypal_event', { p_id: id, p_verification: verification, p_org: orgId, p_status: status, p_error: error }); },
    async snapshot(orgId) {
      const [rows, calls] = await Promise.all([
        database.select('paypal_events', q({ select: 'created_at,event_type,event_id,verification_status,org_id', org_id: `eq.${orgId}`, order: 'created_at.desc', limit: '30' })),
        database.select('api_activity', q({ select: 'occurred_at,message,ok', org_id: `eq.${orgId}`, order: 'occurred_at.desc', limit: '30' })),
      ]);
      return { events: (rows || []).map((row) => ({ t: row.created_at, type: row.event_type, id: row.event_id, verification: row.verification_status.toUpperCase() })), calls: (calls || []).map((row) => ({ t: row.occurred_at, m: row.message, ok: row.ok })) };
    },
    addEvent() {},
    async addCall(call, orgId = null) {
      await database.insert('api_activity', { org_id: orgId, message: String(call.m).slice(0, 200), ok: Boolean(call.ok) });
    },
  };

  const fxRates = {
    async get(orgId, base, quote) {
      const rows = await database.select('fx_rates', q({ select:'*',org_id:`eq.${orgId}`,base_currency:`eq.${base}`,quote_currency:`eq.${quote}`,limit:'1' }));
      return rows?.[0] || null;
    },
    async put(row) {
      const rows = await database.upsert('fx_rates',row,'org_id,base_currency,quote_currency');
      return rows?.[0] || row;
    },
  };

  const invoices = {
    async list(orgId,{limit=50,offset=0,state}={}) {
      const params={select:'*,invoice_lines(*)',org_id:`eq.${orgId}`,order:'created_at.desc',limit:String(limit),offset:String(offset)};
      if(state) params.state=`eq.${state}`;
      return (await database.select('invoices',q(params))||[]).map((row)=>mapInvoice(row,row.invoice_lines||[]));
    },
    async get(orgId,id) {
      const rows=await database.select('invoices',q({select:'*',org_id:`eq.${orgId}`,id:`eq.${id}`,limit:'1'}));
      if(!rows?.[0]) return null;
      const lines=await database.select('invoice_lines',q({select:'*',org_id:`eq.${orgId}`,invoice_id:`eq.${id}`,order:'created_at.asc'}));
      return mapInvoice(rows[0],lines||[]);
    },
    async createDraft(orgId,invoice,lines) {
      const row=await database.rpc('create_invoice_draft',{p_org:orgId,p_invoice:invoice,p_lines:lines});
      return this.get(orgId,row.id);
    },
    async setState(orgId,id,state,actorId,details={}) {
      const row=await database.rpc('set_invoice_state',{p_org:orgId,p_invoice_id:id,p_state:state,p_actor:actorId,p_details:details});
      return this.get(orgId,row.id);
    },
    async setPayPalDraft(orgId,id,paypalInvoiceId) {
      await database.rpc('set_invoice_paypal_draft',{p_org:orgId,p_invoice_id:id,p_paypal_invoice_id:paypalInvoiceId});
      return this.get(orgId,id);
    },
    async requestSendApproval(orgId,id,approvalId,actorId,payload) {
      return mapApproval(await database.rpc('request_invoice_send_approval',{p_org:orgId,p_invoice_id:id,p_approval_id:approvalId,p_actor:actorId,p_payload:payload}));
    },
    async completeSend(orgId,approvalId,paypalInvoiceId,result) {
      return mapApproval(await database.rpc('complete_invoice_send',{p_org:orgId,p_approval_id:approvalId,p_paypal_invoice_id:paypalInvoiceId,p_result:result}));
    },
    async failSend(orgId,approvalId,error) {
      return mapApproval(await database.rpc('fail_invoice_send',{p_org:orgId,p_approval_id:approvalId,p_error:{message:String(error).slice(0,200)}}));
    },
    async markPaid(paypalInvoiceId,event) { return database.rpc('mark_invoice_paid',{p_paypal_invoice_id:paypalInvoiceId,p_event:event}); },
  };

  const reports = {
    async rows(view,orgId,{from,to,limit=1000}={}) {
      const params={select:'*',org_id:`eq.${orgId}`,order:'period.asc',limit:String(limit)};
      if(from) params.period=`gte.${from.slice(0,10)}`;
      if(to) params.period=from?undefined:`lte.${to.slice(0,10)}`;
      if(from&&to) params.and=`(period.gte.${from.slice(0,10)},period.lte.${to.slice(0,10)})`;
      return database.select(view,q(Object.fromEntries(Object.entries(params).filter(([,v])=>v!==undefined))));
    },
  };

  const ai = {
    async listOrgIds() { return database.rpc('list_anomaly_org_ids', {}); },
    async dataVersion(orgId) {
      return database.rpc('get_ai_data_version', { p_org: orgId });
    },
    usage: {
      async reserve({ orgId, userId, route, model, inputTokens, userLimit, orgLimit }) {
        const result = await database.rpc('reserve_ai_usage', { p_org: orgId, p_user: userId, p_route: route, p_model: model, p_input_tokens: inputTokens, p_user_limit: userLimit, p_org_limit: orgLimit });
        return { allowed: Boolean(result?.allowed), usageId: result?.usageId || result?.usage_id || null, reason: result?.reason || null };
      },
      async complete(usageId, { inputTokens, outputTokens = 0, latencyMs = 0, model, status = 'completed' }) {
        return database.rpc('complete_ai_usage', { p_usage_id: usageId, p_input_tokens: inputTokens ?? null, p_output_tokens: outputTokens, p_latency_ms: latencyMs, p_model: model || null, p_status: status });
      },
      async recordCacheHit({ orgId, userId, route, model = null }) {
        return database.rpc('record_ai_cache_hit', { p_org: orgId, p_user: userId, p_route: route, p_model: model });
      },
    },
    cache: {
      async get(orgId, cacheKey, now = new Date()) {
        const rows = await database.select('ai_cache', q({ select: 'answer,data_version,expires_at', org_id: `eq.${orgId}`, cache_key: `eq.${cacheKey}`, expires_at: `gt.${new Date(now).toISOString()}`, limit: '1' }));
        return rows?.[0] ? { answer: rows[0].answer, dataVersion: rows[0].data_version, expiresAt: rows[0].expires_at } : null;
      },
      async put({ orgId, cacheKey, dataVersion, answer, expiresAt }) {
        const rows = await database.upsert('ai_cache', { org_id: orgId, cache_key: cacheKey, data_version: dataVersion, answer, expires_at: expiresAt }, 'org_id,cache_key');
        return rows?.[0] || null;
      },
    },
  };

  const anomalies = {
    async record(orgId, finding) {
      const result = await database.rpc('record_anomaly', { p_org: orgId, p_finding: finding });
      return { anomaly: result?.anomaly || result, inserted: Boolean(result?.inserted) };
    },
    async list(orgId, { limit = 100, offset = 0 } = {}) {
      return database.select('anomalies', q({ select: '*', org_id: `eq.${orgId}`, order: 'created_at.desc', limit: String(limit), offset: String(offset) }));
    },
  };

  const notifications = {
    async list(orgId, { status, limit = 50, offset = 0 } = {}) {
      const params = { select: '*', org_id: `eq.${orgId}`, order: 'created_at.desc', limit: String(limit), offset: String(offset) };
      if (status) params.status = `eq.${status}`;
      return database.select('notifications', q(params));
    },
    async setStatus(orgId, id, status) {
      return database.rpc('set_notification_status', { p_org: orgId, p_notification_id: id, p_status: status });
    },
  };

  const funds = {
    async listCampaigns(orgId) {
      return database.select('fund_campaigns', q({ select: 'id,org_id,title,purpose,target_minor,currency,deadline,organiser,status,created_at', org_id: `eq.${orgId}`, order: 'created_at.desc', limit: '100' }));
    },
    async createCampaign({ orgId, actorId, title, purpose, targetMinor, deadline, organiser, status, requestId }) {
      return database.rpc('create_fund_campaign', { p_org: orgId, p_actor: actorId, p_title: title, p_purpose: purpose, p_target_minor: targetMinor, p_deadline: deadline || null, p_organiser: organiser, p_status: status, p_request_id: requestId });
    },
    async createPledge({ orgId, actorId, campaignId, amountMinor, requestId }) {
      return database.rpc('create_fund_pledge', { p_org: orgId, p_actor: actorId, p_campaign_id: campaignId, p_amount_minor: amountMinor, p_request_id: requestId });
    },
    async getContribution(orgId, contributionId) {
      const rows = await database.select('fund_contributions', q({ select: '*', org_id: `eq.${orgId}`, id: `eq.${contributionId}`, limit: '1' }));
      return rows?.[0] || null;
    },
    async linkContributionOrder({ orgId, actorId, contributionId, requestKey, orderId, approveUrl, requestId }) {
      return database.rpc('link_fund_contribution_order', { p_org: orgId, p_actor: actorId, p_contribution_id: contributionId, p_request_key: requestKey, p_paypal_order_id: orderId, p_approve_url: approveUrl, p_request_id: requestId });
    },
    async campaignSummary(orgId, campaignId) {
      return database.rpc('get_fund_campaign_summary', { p_org: orgId, p_campaign_id: campaignId });
    },
    async createMaintenanceRequest({ orgId, actorId, campaignId, title, scope, estimateMinor, requestId }) {
      return database.rpc('create_fund_maintenance_request', { p_org: orgId, p_actor: actorId, p_campaign_id: campaignId || null, p_title: title, p_scope: scope, p_estimate_minor: estimateMinor ?? null, p_request_id: requestId });
    },
    async createContractor({ orgId, actorId, name, paymentDestinationRef, requestId }) {
      return database.rpc('create_fund_contractor', { p_org: orgId, p_actor: actorId, p_name: name, p_payment_destination_ref: paymentDestinationRef || null, p_request_id: requestId });
    },
    async addQuotation({ orgId, actorId, requestId, contractorId, amountMinor, documentRef, requestKey }) {
      return database.rpc('add_fund_quotation', { p_org: orgId, p_actor: actorId, p_request: requestId, p_contractor: contractorId, p_amount_minor: amountMinor, p_document_ref: documentRef || null, p_request_id: requestKey });
    },
    async approveMaintenanceScope({ orgId, actorId, requestId, quotationId, note, requestKey }) {
      return database.rpc('approve_fund_maintenance_scope', { p_org: orgId, p_actor: actorId, p_request: requestId, p_quotation: quotationId, p_note: note || null, p_request_id: requestKey });
    },
    async verifyMaintenanceContractor({ orgId, actorId, requestId, requestKey }) {
      return database.rpc('verify_fund_maintenance_contractor', { p_org: orgId, p_actor: actorId, p_request: requestId, p_request_id: requestKey });
    },
    async approveMaintenancePayment({ orgId, actorId, requestId, note, requestKey }) {
      return database.rpc('approve_fund_maintenance_payment', { p_org: orgId, p_actor: actorId, p_request: requestId, p_note: note || null, p_request_id: requestKey });
    },
    async requestMaintenancePayment({ orgId, actorId, requestId, requestKey }) {
      return database.rpc('request_fund_maintenance_payment', { p_org: orgId, p_request: requestId, p_actor: actorId, p_request_id: requestKey });
    },
    async decideMaintenancePayment({ orgId, approvalId, reviewerId, decision, note, requestKey }) {
      return database.rpc('decide_fund_maintenance_payment', { p_org: orgId, p_approval_id: approvalId, p_reviewer: reviewerId, p_decision: decision, p_note: note || null, p_request_id: requestKey });
    },
    async submitCompletionEvidence({ orgId, actorId, requestId, kind, description, fileRef, requestKey }) {
      return database.rpc('submit_fund_completion_evidence', { p_org: orgId, p_actor: actorId, p_request: requestId, p_kind: kind, p_description: description, p_file_ref: fileRef || null, p_request_id: requestKey });
    },
    async reviewCompletionEvidence({ orgId, actorId, requestId, evidenceId, decision, note, requestKey }) {
      return database.rpc('review_fund_completion_evidence', { p_org: orgId, p_actor: actorId, p_request: requestId, p_evidence: evidenceId, p_decision: decision, p_note: note || null, p_request_id: requestKey });
    },
    async closeMaintenanceRequest({ orgId, actorId, requestId, requestKey }) {
      return database.rpc('close_fund_maintenance_request', { p_org: orgId, p_actor: actorId, p_request: requestId, p_request_id: requestKey });
    },
  };

  return {
    orders, captures, approvals, events, fxRates, invoices, reports, ai, anomalies, notifications, funds,
    async listTransactions(orgId, filters) {
      const params = { select: '*', org_id: `eq.${orgId}`, order: 'occurred_at.desc', limit: String(filters.limit), offset: String(filters.offset) };
      if (filters.status) params.status = `eq.${filters.status}`;
      if (filters.type) params.source_type = `eq.${filters.type}`;
      const dates = [];
      if (filters.from) dates.push(`occurred_at.gte.${filters.from}`);
      if (filters.to) dates.push(`occurred_at.lte.${filters.to}`);
      if (dates.length === 1) params.occurred_at = dates[0].slice('occurred_at.'.length);
      if (dates.length === 2) params.and = `(${dates.join(',')})`;
      return database.select('transactions', q(params));
    },
    async listLedgerEntries(orgId, filters) {
      const params = { select: '*', org_id: `eq.${orgId}`, order: 'created_at.desc', limit: String(filters.limit), offset: String(filters.offset) };
      const dates = [];
      if (filters.from) dates.push(`created_at.gte.${filters.from}`);
      if (filters.to) dates.push(`created_at.lte.${filters.to}`);
      if (dates.length === 1) params.created_at = dates[0].slice('created_at.'.length);
      if (dates.length === 2) params.and = `(${dates.join(',')})`;
      const entries = await database.select('journal_entries', q(params));
      if (!entries?.length) return [];
      const ids = `in.(${entries.map((entry) => entry.id).join(',')})`;
      const lines = await database.select('journal_lines', q({ select: '*,accounts(code,name,account_type)', org_id: `eq.${orgId}`, journal_entry_id: ids }));
      return entries.map((entry) => ({ ...entry, lines: (lines || []).filter((line) => line.journal_entry_id === entry.id) }));
    },
    async trialBalance(orgId, currency = 'USD') {
      return database.rpc('get_org_trial_balance', { p_org: orgId, p_currency: currency });
    },
    async reconcile(orgId, currency = 'USD') { return database.rpc('reconcile_org_financials', { p_org: orgId, p_currency: currency }); },
    async listReconciliations(orgId) { return database.select('reconciliation_runs', q({ select: '*', org_id: `eq.${orgId}`, order: 'started_at.desc', limit: '20' })); },
  };
}
