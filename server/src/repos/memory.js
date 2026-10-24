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
  addFromWebhook(capture) { const order = this.orders?.findByPayPalId(capture.orderId); if (!order) throw new Error('verified capture does not match a stored PayPal order'); return { orgId: order.orgId, capture: this.add(capture, order.orgId) }; }
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
}

export function createRepositories() {
  const captures = new CapturesRepo();
  const orders = new OrdersRepo();
  captures.orders = orders;
  const repos = { orders, captures, approvals: new ApprovalsRepo(captures), events: new EventsRepo() };
  repos.listTransactions = async (orgId, filters) => repos.captures.all(orgId).slice(filters.offset, filters.offset + filters.limit).map((capture) => ({ id: capture.id, org_id: orgId, source_type: 'capture', source_id: capture.id, status: capture.status, amount_minor: Math.round(Number(capture.value) * 100), fee_minor: capture.fee == null ? null : Math.round(Number(capture.fee) * 100), net_minor: capture.net == null ? null : Math.round(Number(capture.net) * 100), currency: capture.currency, occurred_at: capture.occurredAt || new Date().toISOString() }));
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
