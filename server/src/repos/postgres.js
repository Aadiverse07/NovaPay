import { captureJournalLines, refundJournalLines } from '../services/ledger.js';

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
  return row && ({ id: row.paypal_order_id, dbId: row.id, orgId: row.org_id, requestKey: row.request_key, amount: minorToMoney(row.amount_minor), currency: row.currency, status: row.status, state: row.state, approveUrl: row.approve_url, capture: row.capture_response || null });
}

function mapCapture(row) {
  return row && ({ id: row.paypal_capture_id, dbId: row.id, orderId: row.order_paypal_order_id || null, orgId: row.org_id, value: minorToMoney(row.amount_minor), amountMinor: Number(row.amount_minor), currency: row.currency, status: row.status, fee: row.fee_minor == null ? undefined : minorToMoney(row.fee_minor), net: row.net_minor == null ? undefined : minorToMoney(row.net_minor), refunded: Number(row.refunded_minor || 0) / 100, reserved: Number(row.reserved_minor || 0) / 100, refundedMinor: Number(row.refunded_minor || 0), reservedMinor: Number(row.reserved_minor || 0), providerPayload: row.provider_payload || {} });
}

function mapApproval(row) {
  return row && ({ approvalId: row.id, orgId: row.org_id, proposalType: row.proposal_type, captureId: row.capture_id, amount: row.amount_minor == null ? null : minorToMoney(row.amount_minor), amountMinor: row.amount_minor == null ? null : Number(row.amount_minor), currency: row.currency, status: row.status, decisionNote: row.decision_note, reviewerId: row.reviewer_id, result: row.result || null, createdAt: row.created_at, createdBy: row.created_by });
}

export function createPostgresRepositories(database) {
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
      const rows = await database.select('paypal_captures', q({ select: '*,paypal_orders(paypal_order_id)', org_id: `eq.${orgId}`, order: 'created_at.desc' }));
      return (rows || []).map((row) => ({ ...mapCapture(row), orderId: row.paypal_orders?.paypal_order_id || null }));
    },
    async get(id, orgId) {
      const rows = await database.select('paypal_captures', q({ select: '*,paypal_orders(paypal_order_id)', org_id: `eq.${orgId}`, paypal_capture_id: `eq.${id}`, limit: '1' }));
      const row = rows?.[0];
      return row ? { ...mapCapture(row), orderId: row.paypal_orders?.paypal_order_id || null } : null;
    },
    async add(capture, orgId) {
      const providerCapture = { id: capture.id, gross: capture.value, fee: capture.fee, net: capture.net, currency: capture.currency, amount: { value: capture.value, currency_code: capture.currency } };
      const result = await database.rpc('record_paypal_capture', { p_org: orgId, p_paypal_order_id: capture.orderId, p_capture: { id: capture.id, amount: { minor: moneyToMinor(capture.value) }, fee_minor: capture.fee == null ? null : moneyToMinor(capture.fee), net_minor: capture.net == null ? null : moneyToMinor(capture.net), currency: capture.currency, status: capture.status, occurred_at: capture.occurredAt || null, provider_payload: capture.providerPayload || {} }, p_lines: journalLinesPayload(captureJournalLines(providerCapture)) });
      return mapCapture(result?.capture);
    },
    async addFromWebhook(capture) {
      const providerCapture = { id: capture.id, gross: capture.value, fee: capture.fee, net: capture.net, currency: capture.currency, amount: { value: capture.value, currency_code: capture.currency } };
      const result = await database.rpc('record_paypal_capture_event', { p_paypal_order_id: capture.orderId, p_capture: { id: capture.id, amount: { minor: moneyToMinor(capture.value) }, fee_minor: capture.fee == null ? null : moneyToMinor(capture.fee), net_minor: capture.net == null ? null : moneyToMinor(capture.net), currency: capture.currency, status: capture.status, occurred_at: capture.occurredAt || null, provider_payload: capture.providerPayload || {} }, p_lines: journalLinesPayload(captureJournalLines(providerCapture)) });
      return { orgId: result?.orgId, capture: mapCapture(result?.result?.capture) };
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

  return {
    orders, captures, approvals, events,
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
