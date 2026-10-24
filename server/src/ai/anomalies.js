import { createHash } from 'node:crypto';

const money = (value) => {
  try { const result = BigInt(String(value ?? '0')); return result >= 0n ? result : null; } catch { return null; }
};
const occurred = (row) => Date.parse(row?.occurred_at || row?.occurredAt || row?.created_at || row?.createdAt || '');
const type = (row) => String(row?.source_type || row?.type || '').toLowerCase();
const done = (row) => String(row?.status || '').toUpperCase() === 'COMPLETED';

function finding(rule, severity, evidenceIds, details, day) {
  const evidence = [...new Set(evidenceIds.map(String).filter(Boolean))].sort();
  const dedupeKey = createHash('sha256').update(`${rule}:${day}:${evidence.join(',')}`).digest('hex');
  return { rule, severity, evidenceIds: evidence, details, dedupeKey, status: 'open' };
}

function feeSpikeFindings(rows, config, now) {
  const captures = rows.filter((row) => type(row) === 'capture' && done(row) && money(row.amount_minor) > 0n && money(row.fee_minor) !== null)
    .sort((a, b) => occurred(a) - occurred(b));
  const windowStart = now.getTime() - 30 * 86400000;
  const multiplier = BigInt(Math.round(Number(config.ANOMALY_FEE_SPIKE_MULTIPLIER || 2) * 1000000));
  const minSamples = Number(config.ANOMALY_FEE_SPIKE_MIN_SAMPLES || 3);
  const out = [];
  for (let index = 0; index < captures.length; index += 1) {
    const row = captures[index], at = occurred(row), amount = money(row.amount_minor), fee = money(row.fee_minor);
    if (!Number.isFinite(at) || at > now.getTime() || at < windowStart) continue;
    const baseline = captures.slice(0, index).filter((old) => old.currency === row.currency && occurred(old) >= windowStart && occurred(old) < at && money(old.amount_minor) > 0n && money(old.fee_minor) !== null);
    if (baseline.length < minSamples) continue;
    const totalFees = baseline.reduce((sum, old) => sum + money(old.fee_minor), 0n);
    const totalGross = baseline.reduce((sum, old) => sum + money(old.amount_minor), 0n);
    if (totalGross && fee * totalGross * 1000000n >= totalFees * amount * multiplier) {
      out.push(finding('fee_rate_spike', 'warning', [row.id], { currency: row.currency, observedFeeMinor: String(fee), observedGrossMinor: String(amount), baselineSamples: baseline.length, thresholdMultiplier: Number(multiplier) / 1000000 }, now.toISOString().slice(0, 10)));
    }
  }
  return out;
}

function duplicateFindings(rows, config, now) {
  const windowMs = Number(config.ANOMALY_DUPLICATE_WINDOW_MINUTES || 10) * 60000;
  const buckets = new Map();
  for (const row of rows) {
    if (!done(row) || !['capture', 'payment'].includes(type(row))) continue;
    const payerRef = String(row.payer_ref || row.payerRef || row.payer_id || row.payerId || '');
    const amount = money(row.amount_minor);
    const at = occurred(row);
    if (!payerRef || amount === null || !Number.isFinite(at) || at > now.getTime() || at < now.getTime() - windowMs) continue;
    const key = `${row.currency}:${amount}:${payerRef}`;
    const bucket = buckets.get(key) || [];
    bucket.push({ id: row.id, at });
    buckets.set(key, bucket);
  }
  const out = [];
  for (const [key, group] of buckets) {
    group.sort((a, b) => a.at - b.at);
    if (group.length < 2) continue;
    for (let index = 1; index < group.length; index += 1) {
      if (group[index].at - group[index - 1].at > windowMs) continue;
      out.push(finding('duplicate_amount_payer', 'warning', [group[index - 1].id, group[index].id], { currency: key.split(':')[0], amountMinor: key.split(':')[1], windowMinutes: Number(config.ANOMALY_DUPLICATE_WINDOW_MINUTES || 10) }, now.toISOString().slice(0, 10)));
    }
  }
  return out;
}

function refundRateFinding(rows, config, now) {
  const start = now.getTime() - 30 * 86400000;
  const eligible = rows.filter((row) => done(row) && occurred(row) >= start && occurred(row) <= now.getTime());
  const captures = eligible.filter((row) => type(row) === 'capture');
  const refunds = eligible.filter((row) => type(row) === 'refund');
  const currencies = new Set([...captures, ...refunds].map((row) => row.currency));
  const threshold = BigInt(Math.round(Number(config.ANOMALY_REFUND_RATE_THRESHOLD || 0.25) * 10000));
  const out = [];
  for (const currency of currencies) {
    const gross = captures.filter((row) => row.currency === currency).reduce((sum, row) => sum + (money(row.amount_minor) || 0n), 0n);
    const refunded = refunds.filter((row) => row.currency === currency).reduce((sum, row) => sum + (money(row.amount_minor) || 0n), 0n);
    if (gross > 0n && refunded * 10000n >= gross * threshold) {
      const ids = [...captures, ...refunds].filter((row) => row.currency === currency).map((row) => row.id);
      out.push(finding('refund_rate_spike', 'warning', ids, { currency, capturedMinor: String(gross), refundedMinor: String(refunded), thresholdRate: Number(threshold) / 10000, windowDays: 30 }, now.toISOString().slice(0, 10)));
    }
  }
  return out;
}

function largePayoutFindings(rows, config, now) {
  const threshold = BigInt(Number(config.ANOMALY_LARGE_PAYOUT_MINOR || 1000000));
  return rows.filter((row) => type(row) === 'payout' && done(row) && money(row.amount_minor) !== null && money(row.amount_minor) >= threshold)
    .map((row) => finding('large_payout', 'high', [row.id], { currency: row.currency, amountMinor: String(row.amount_minor), thresholdMinor: String(threshold) }, now.toISOString().slice(0, 10)));
}

function webhookFindings(events, config, now) {
  const thresholdMs = Number(config.ANOMALY_STALE_WEBHOOK_MINUTES || 10) * 60000;
  return (events || []).filter((row) => {
    const status = String(row.processing_status || row.processingStatus || '').toLowerCase();
    const age = now.getTime() - Date.parse(row.created_at || row.createdAt || '');
    return status === 'dead_letter' || (['queued', 'retry', 'processing'].includes(status) && Number.isFinite(age) && age >= thresholdMs);
  }).map((row) => {
    const status = String(row.processing_status || row.processingStatus || '').toLowerCase();
    const id = String(row.event_id || row.id || '');
    return finding(status === 'dead_letter' ? 'dead_letter_webhook' : 'stale_webhook', status === 'dead_letter' ? 'high' : 'warning', [id], { eventStatus: status, ageMinutes: Math.max(0, Math.floor((now.getTime() - Date.parse(row.created_at || row.createdAt)) / 60000)) }, now.toISOString().slice(0, 10));
  });
}

function reconciliationFinding(run, now) {
  if (!run || String(run.status).toLowerCase() !== 'mismatch') return [];
  const evidenceIds = Array.isArray(run.details?.evidenceIds) ? run.details.evidenceIds : [];
  return [finding('webhook_ledger_mismatch', 'high', [run.id ? `reconciliation:${run.id}` : `reconciliation:${now.toISOString().slice(0, 10)}`, ...evidenceIds], { status: 'mismatch', currency: run.currency || 'USD' }, now.toISOString().slice(0, 10))];
}

export function detectAnomalies({ transactions = [], events = [], reconciliation = null, config = {}, now = new Date() }) {
  const date = now instanceof Date ? now : new Date(now);
  return [
    ...feeSpikeFindings(transactions, config, date),
    ...duplicateFindings(transactions, config, date),
    ...refundRateFinding(transactions, config, date),
    ...largePayoutFindings(transactions, config, date),
    ...webhookFindings(events, config, date),
    ...reconciliationFinding(reconciliation, date),
  ];
}
