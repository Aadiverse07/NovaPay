import { createHash } from 'node:crypto';

export const AI_TOOL_MAX_CALLS = 3;
export const AI_TOOL_TIMEOUT_MS = 1500;
export const AI_TOOL_MAX_ROWS = 20;
export const AI_TOOL_MAX_RESULT_CHARS = 10000;

export const AI_READ_ONLY_TOOLS = Object.freeze([
  { name: 'get_transactions', description: 'Read recent transactions for the verified organization.' },
  { name: 'get_ledger_summary', description: 'Read the organization trial-balance summary.' },
  { name: 'get_fee_breakdown', description: 'Read ledger fee totals by reporting period.' },
  { name: 'get_refunds', description: 'Read completed and pending refund transactions.' },
  { name: 'get_invoices', description: 'Read invoice status and totals without customer contact details.' },
]);

const toolNames = new Set(AI_READ_ONLY_TOOLS.map((tool) => tool.name));
const safeDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));

function boundedLimit(value) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(1, Math.min(number, AI_TOOL_MAX_ROWS)) : 12;
}

function dateArgs(args = {}) {
  const from = safeDate(args.from) ? args.from : undefined;
  const to = safeDate(args.to) ? args.to : undefined;
  return from && to && from > to ? {} : { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function parsePeriod(message, now = new Date()) {
  const text = String(message || '').toLocaleLowerCase('en-US');
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  if (/\b(last|previous)\s+month\b/.test(text) || /\bmes pasado\b/.test(text)) {
    const start = new Date(Date.UTC(y, m - 1, 1)), end = new Date(Date.UTC(y, m, 0));
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  if (/\b(this|current)\s+month\b/.test(text) || /\beste mes\b/.test(text)) {
    return { from: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10) };
  }
  if (/\b(yesterday)\b/.test(text)) {
    const yesterday = new Date(date); yesterday.setUTCDate(d - 1);
    return { from: yesterday.toISOString().slice(0, 10), to: yesterday.toISOString().slice(0, 10) };
  }
  if (/\b(today)\b/.test(text)) return { from: date.toISOString().slice(0, 10), to: date.toISOString().slice(0, 10) };
  if (/\b(last|previous)\s+week\b/.test(text) || /\bsemana pasada\b/.test(text)) {
    const day = date.getUTCDay() || 7;
    const end = new Date(date); end.setUTCDate(d - day);
    const start = new Date(end); start.setUTCDate(end.getUTCDate() - 6);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }
  if (/\b(this|current)\s+week\b/.test(text) || /\besta semana\b/.test(text)) {
    const day = date.getUTCDay() || 7;
    const start = new Date(date); start.setUTCDate(d - day + 1);
    return { from: start.toISOString().slice(0, 10), to: date.toISOString().slice(0, 10) };
  }
  return {};
}

function amountString(row, field, fallback) {
  const value = row?.[field] ?? row?.[fallback];
  return value == null ? null : String(value);
}

function transactionEvidence(row) {
  const id = String(row?.id || '');
  if (!id) return null;
  return {
    id,
    recordType: 'transaction',
    type: String(row.source_type || row.type || ''),
    sourceId: String(row.source_id || row.sourceId || row.paypal_capture_id || row.paypal_refund_id || ''),
    status: String(row.status || ''),
    amountMinor: amountString(row, 'amount_minor', 'amountMinor'),
    feeMinor: amountString(row, 'fee_minor', 'feeMinor'),
    netMinor: amountString(row, 'net_minor', 'netMinor'),
    currency: String(row.currency || ''),
    occurredAt: String(row.occurred_at || row.occurredAt || ''),
  };
}

function invoiceEvidence(row, orgId) {
  const id = String(row?.id || '');
  if (!id) return null;
  const customerKey = String(row.customerEmail || row.customer_email || row.customerName || row.customer_name || '');
  const customerRef = customerKey
    ? createHash('sha256').update(orgId + ':' + customerKey.normalize('NFKC').trim().toLocaleLowerCase('en-US')).digest('hex').slice(0, 12)
    : null;
  return {
    id,
    recordType: 'invoice',
    customerRef,
    state: String(row.state || ''),
    currency: String(row.currency || ''),
    subtotalMinor: String(row.subtotalMinor ?? row.subtotal_minor ?? ''),
    taxMinor: String(row.taxMinor ?? row.tax_minor ?? ''),
    totalMinor: String(row.totalMinor ?? row.total_minor ?? ''),
    createdAt: String(row.createdAt || row.created_at || ''),
  };
}

function feeEvidence(row) {
  const period = String(row?.period || '');
  const currency = String(row?.currency || '');
  if (!period || !currency) return null;
  return {
    id: 'fee-summary:' + period + ':' + currency,
    recordType: 'fee_summary',
    period,
    currency,
    feeMinor: String(row.fee_minor ?? row.feeMinor ?? '0'),
  };
}

function trimResult(value, maxChars) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxChars) return value;
  if (Array.isArray(value)) {
    const rows = [];
    for (const row of value) {
      const candidate = [...rows, row];
      if (JSON.stringify(candidate).length > maxChars) break;
      rows.push(row);
    }
    return { rows, truncated: true };
  }
  if (value && Array.isArray(value.rows)) {
    const rows = [];
    for (const row of value.rows) {
      const candidate = { ...value, rows: [...rows, row], truncated: true };
      if (JSON.stringify(candidate).length > maxChars) break;
      rows.push(row);
    }
    return { ...value, rows, truncated: true };
  }
  return { unavailable: true, reason: 'result_size_limit' };
}

function makeToolHandlers(repos, orgId) {
  return {
    async get_transactions(args) {
      const rows = await repos.listTransactions(orgId, { ...dateArgs(args), limit: boundedLimit(args.limit), offset: 0, ...(args.status ? { status: String(args.status).slice(0, 24).toUpperCase() } : {}), ...(args.type === 'capture' || args.type === 'refund' ? { type: args.type } : {}) });
      return (rows || []).map(transactionEvidence).filter(Boolean);
    },
    async get_ledger_summary(args) {
      const currency = ['USD'].includes(args.currency) ? args.currency : 'USD';
      const summary = await repos.trialBalance(orgId, currency);
      const totals = summary?.totals || {};
      return {
        id: 'trial-balance:' + currency,
        recordType: 'ledger_summary',
        currency,
        balanced: Boolean(summary?.balanced),
        debitMinor: String(totals.debitMinor ?? totals.debit_minor ?? '0'),
        creditMinor: String(totals.creditMinor ?? totals.credit_minor ?? '0'),
        accounts: (summary?.accounts || []).slice(0, AI_TOOL_MAX_ROWS).map((account) => ({
          code: String(account.code || ''),
          name: String(account.name || ''),
          debitMinor: String(account.debitMinor ?? account.debit_minor ?? '0'),
          creditMinor: String(account.creditMinor ?? account.credit_minor ?? '0'),
        })),
      };
    },
    async get_fee_breakdown(args) {
      if (!repos.reports?.rows) return [];
      const rows = await repos.reports.rows('report_fee_summary', orgId, dateArgs(args));
      return (rows || []).slice(0, AI_TOOL_MAX_ROWS).map(feeEvidence).filter(Boolean);
    },
    async get_refunds(args) {
      const rows = await repos.listTransactions(orgId, { ...dateArgs(args), limit: boundedLimit(args.limit), offset: 0, type: 'refund' });
      return (rows || []).map(transactionEvidence).filter(Boolean);
    },
    async get_invoices(args) {
      const state = ['draft', 'reviewed', 'sent', 'paid', 'void'].includes(args.state) ? args.state : undefined;
      const rows = await repos.invoices.list(orgId, { limit: boundedLimit(args.limit), offset: 0, ...(state ? { state } : {}) });
      return (rows || []).map((row) => invoiceEvidence(row, orgId)).filter(Boolean);
    },
  };
}

export function createReadOnlyAITools({ repos, orgId, maxCalls = AI_TOOL_MAX_CALLS, timeoutMs = AI_TOOL_TIMEOUT_MS, maxResultChars = AI_TOOL_MAX_RESULT_CHARS }) {
  if (!orgId) throw new Error('Verified organization context is required.');
  const handlers = makeToolHandlers(repos, orgId);
  const callLimit = Math.max(0, Math.min(Number(maxCalls) || 0, AI_TOOL_MAX_CALLS));
  return {
    async execute(calls = []) {
      const results = [];
      const seen = new Set();
      let executed = 0;
      for (const call of Array.isArray(calls) ? calls : []) {
        const name = call?.name;
        if (!toolNames.has(name)) {
          results.push({ name: String(name || '').slice(0, 60), error: 'tool_not_allowed' });
          continue;
        }
        const args = call?.args && typeof call.args === 'object' && !Array.isArray(call.args) ? call.args : {};
        const signature = name + ':' + JSON.stringify(args);
        if (seen.has(signature)) {
          results.push({ name, error: 'duplicate_tool_call' });
          continue;
        }
        seen.add(signature);
        if (executed >= callLimit) {
          results.push({ name, error: 'tool_call_limit_reached' });
          continue;
        }
        executed += 1;
        let timer;
        try {
          const work = Promise.resolve().then(() => handlers[name](args));
          const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('tool_timeout')), timeoutMs); });
          const value = await Promise.race([work, timeout]);
          results.push({ name, result: trimResult(value, maxResultChars) });
        } catch (error) {
          results.push({ name, error: error?.message === 'tool_timeout' ? 'tool_timeout' : 'tool_unavailable' });
        } finally {
          clearTimeout(timer);
        }
      }
      return { results, callsUsed: executed };
    },
  };
}

export function planEvidenceTools({ intent, message, now = new Date() }) {
  const args = { ...parsePeriod(message, now), limit: 12 };
  if (intent === 'fx' || intent === 'arithmetic') return [];
  if (intent === 'refunds') return [{ name: 'get_refunds', args }];
  if (intent === 'fees') return [{ name: 'get_fee_breakdown', args }];
  if (intent === 'top_customers' || intent === 'invoice_status') return [{ name: 'get_invoices', args }];
  if (intent === 'balance') return [{ name: 'get_ledger_summary', args: { currency: 'USD' } }];
  if (intent === 'transactions') return [{ name: 'get_transactions', args }];
  const text = String(message || '').toLocaleLowerCase('en-US');
  if (/\b(fee|fees|charge|charges)\b/i.test(text)) return [{ name: 'get_fee_breakdown', args }, { name: 'get_transactions', args }];
  if (/\b(refund|refunds|refunded)\b/i.test(text)) return [{ name: 'get_refunds', args }, { name: 'get_transactions', args }];
  if (/\b(invoice|invoices)\b/i.test(text)) return [{ name: 'get_invoices', args }];
  if (/\b(balance|ledger|account)\b/i.test(text)) return [{ name: 'get_ledger_summary', args: { currency: 'USD' } }, { name: 'get_transactions', args }];
  return [{ name: 'get_transactions', args }, { name: 'get_ledger_summary', args: { currency: 'USD' } }];
}

export async function buildAIEvidence({ repos, orgId, intent, message, now, toolLimits = {} }) {
  const tools = createReadOnlyAITools({ repos, orgId, ...toolLimits });
  const toolResults = await tools.execute(planEvidenceTools({ intent, message, now }));
  const records = toolResults.results.flatMap((item) => Array.isArray(item.result) ? item.result : item.result?.rows || (item.result && !item.error ? [item.result] : []));
  const ids = [...new Set(records.flatMap((record) => [record.id, record.sourceId].filter((id) => typeof id === 'string' && id)))];
  return {
    records: trimResult(records, toolLimits.maxResultChars || AI_TOOL_MAX_RESULT_CHARS),
    ids,
    toolCalls: toolResults.callsUsed,
    toolErrors: toolResults.results.filter((result) => result.error).map(({ name, error }) => ({ name, error })),
  };
}
