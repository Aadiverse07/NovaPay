import { Router } from 'express';
import { z } from 'zod';
import { minorToMoney } from '../repos/postgres.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { paymentCheckForTransaction } from '../services/paymentCheck.js';

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  type: z.enum(['capture','refund']).optional(),
  status: z.string().min(1).max(30).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict();
const currencySchema = z.enum(['USD']);

function queryPage(query, res, allowed = ['limit','offset','type','status','from','to']) {
  const result = pageSchema.pick(Object.fromEntries(allowed.map((key) => [key, true]))).strict().safeParse(query);
  if (!result.success) { res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Query filters are invalid.')); return null; }
  if (result.data.from && result.data.to && Date.parse(result.data.from) > Date.parse(result.data.to)) { res.status(400).json(structuredErrorBody('VALIDATION_ERROR','The from date must not be after the to date.')); return null; }
  return result.data;
}

function transactionShape(row) {
  return {
    id: row.id,
    type: row.source_type,
    sourceId: row.source_id,
    orderId: row.paypal_order_id || null,
    captureId: row.paypal_capture_id || null,
    refundId: row.paypal_refund_id || null,
    status: row.status,
    amount: minorToMoney(row.amount_minor),
    fee: row.fee_minor == null ? null : minorToMoney(row.fee_minor),
    net: row.net_minor == null ? null : minorToMoney(row.net_minor),
    currency: row.currency,
    occurredAt: row.occurred_at,
    data_source: 'paypal-sandbox',
  };
}

export function financialRoutes({ repos }) {
  const router = Router();
  router.get('/transactions', async (req, res, next) => {
    const filters = queryPage(req.query, res);
    if (!filters) return;
    if (filters.status && !['COMPLETED','PENDING','FAILED','REFUNDED'].includes(filters.status.toUpperCase())) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Unsupported transaction status.'));
    try {
      const rows = await repos.listTransactions(req.orgId,{ ...filters, status: filters.status?.toUpperCase() });
      const page = rows || [];
      const captureIds = [...new Set(page.filter((row) => row.source_type === 'capture').map((row) => row.paypal_capture_id || row.source_id).filter(Boolean))];
      let anomalies = [], webhookEvents = [], captures = [], signalLoadFailed = false;
      try {
        [anomalies, webhookEvents, captures] = await Promise.all([
          captureIds.length && repos.anomalies?.list(req.orgId, { limit: 1000, offset: 0 }) || [],
          repos.events?.paymentCheckSignals ? repos.events.paymentCheckSignals(req.orgId, captureIds) : [],
          repos.captures?.paymentCheckData ? repos.captures.paymentCheckData(req.orgId, captureIds) : [],
        ]);
      } catch (error) {
        signalLoadFailed = true;
        console.error(JSON.stringify({ level: 'error', event: 'payment_check_signals_unavailable', requestId: req.requestId || null, errorName: error?.name || 'Error', code: error?.code || 'SIGNAL_LOOKUP_FAILED' }));
      }
      const captureById = new Map((captures || []).map((capture) => [String(capture.id), capture]));
      const transactions = page.map((row) => {
        const captureId = row.paypal_capture_id || row.source_id;
        const events = (webhookEvents || []).filter((event) => String(event.capture_id || event.captureId || event.payload?.resource?.id || '') === String(captureId || ''));
        const capture = captureById.get(String(captureId || ''));
        const signal = signalLoadFailed
          ? { state: 'needs_review', reasons: ['review_signals_unavailable: Payment review signals could not be loaded; retry before relying on this status.'] }
          : paymentCheckForTransaction({ ...row, provider_payload: capture?.providerPayload || row.provider_payload }, anomalies || [], events);
        return { ...transactionShape(row), paymentCheck: signal };
      });
      return res.json({ transactions, page: { limit: filters.limit, offset: filters.offset } });
    } catch (error) { return next(error); }
  });
  router.get('/ledger/entries', async (req, res, next) => {
    const filters = queryPage(req.query, res, ['limit','offset','from','to']);
    if (!filters) return;
    try {
      const entries = await repos.listLedgerEntries(req.orgId,filters);
      return res.json({ entries, page: { limit: filters.limit, offset: filters.offset } });
    } catch (error) { return next(error); }
  });
  router.get('/ledger/trial-balance', async (req, res, next) => {
    const currency = currencySchema.safeParse(req.query.currency || 'USD');
    if (!currency.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Currency must be USD in this phase.'));
    try { return res.json(await repos.trialBalance(req.orgId,currency.data)); }
    catch (error) { return next(error); }
  });
  router.get('/reconciliation', async (req, res, next) => {
    const currency = currencySchema.safeParse(req.query.currency || 'USD');
    if (!currency.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Currency must be USD in this phase.'));
    try {
      const run = await repos.reconcile(req.orgId,currency.data);
      return res.json({ run, data_source: 'paypal-sandbox' });
    } catch (error) { return next(error); }
  });
  return router;
}
