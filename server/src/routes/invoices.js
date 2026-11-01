import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { rbac } from '../middleware/auth.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { buildInvoiceDraft, invoiceMoney } from '../services/invoices.js';
import { createInvoicePdf } from '../services/invoicePdf.js';

const writers = ['owner', 'admin', 'accountant'];
const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const lineSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.union([z.string(), z.number()]).transform(String).refine((value) => /^\d{1,7}(?:\.\d{1,3})?$/.test(value)),
  unitPrice: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  taxRate: z.union([z.string(), z.number()]).optional().transform((value) => value == null ? '0' : String(value)).refine((value) => /^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/.test(value)),
});
const invoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(25),
  customerName: z.string().trim().min(1).max(160),
  customerEmail: z.string().email().max(254),
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  issueDate: date,
  dueDate: date,
  notes: z.string().max(2000).optional().default(''),
  lines: z.array(lineSchema).min(1).max(100),
}).superRefine((value, context) => {
  if (value.dueDate < value.issueDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'Due date must be on or after issue date.' });
});

const sendError = (res, error, next) => {
  if (error?.statusCode) return res.status(error.statusCode).json(structuredErrorBody(error.code || 'INVOICE_ERROR', error.message));
  return next(error);
};
const invoiceError = (res, code, message, status = 409) => res.status(status).json(structuredErrorBody(code, message));
function validateInvoiceBody(req, res, next) {
  const parsed = invoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    return res.status(400).json({ ...structuredErrorBody('VALIDATION_ERROR', 'The invoice contains fields that need attention.'), fields });
  }
  req.body = parsed.data;
  return next();
}

export function invoiceRoutes({ repos }) {
  const router = Router();
  const invoiceDownloadLimit = rateLimit({
    windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    message: { error: { code: 'INVOICE_DOWNLOAD_RATE_LIMITED', message: 'Invoice downloads are temporarily rate limited.' } },
  });
  router.get('/invoices', async (req, res, next) => {
    const limit = Number(req.query.limit ?? 50), offset = Number(req.query.offset ?? 0), state = req.query.state;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000 || state && !['draft', 'reviewed', 'sent', 'paid', 'void'].includes(String(state))) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Invoice filters are invalid.'));
    try { return res.json({ invoices: await repos.invoices.list(req.orgId, { limit, offset, state: state || undefined }), page: { limit, offset }, role: req.orgRole }); }
    catch (error) { return next(error); }
  });
  router.get('/invoices/:invoiceId/download', invoiceDownloadLimit, async (req, res, next) => {
    if (!uuid.safeParse(req.params.invoiceId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Invoice ID is invalid.'));
    try {
      const invoice = await repos.invoices.get(req.orgId, req.params.invoiceId);
      if (!invoice) return invoiceError(res, 'INVOICE_NOT_FOUND', 'The invoice was not found.', 404);
      const pdf = await createInvoicePdf(invoice);
      await repos.invoices.auditDownload(req.orgId, req.user.id, invoice.id, req.id);
      const safeNumber = String(invoice.invoiceNumber || 'invoice').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 50);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${safeNumber}.pdf"`);
      res.setHeader('Content-Length', pdf.length);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(pdf);
    } catch (error) {
      const auditFailure = error?.code === 'INVOICE_AUDIT_WRITE_FAILED';
      console.error(JSON.stringify({ level: 'error', event: 'invoice_pdf_download_failed', requestId: req.id, status: error?.statusCode || 500, errorName: error?.name || 'Error', code: error?.code || error?.databaseCode || 'INTERNAL_ERROR', databaseCode: error?.databaseCode || null, databaseMessage: error?.databaseMessage || null, message: auditFailure ? 'Invoice download audit insert failed.' : 'Invoice PDF generation failed.' }));
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      return res.status(status).json({ error: { code: error?.code || 'INVOICE_PDF_FAILED', message: auditFailure ? 'Invoice audit could not be recorded; no PDF was sent.' : status >= 500 ? 'Invoice PDF generation failed.' : error.message, requestId: req.id } });
    }
  });
  router.post('/invoices', rbac(writers), validateInvoiceBody, async (req, res, next) => {
    const key = uuid.safeParse(req.get('Idempotency-Key') || '');
    if (!key.success) return res.status(400).json(structuredErrorBody('IDEMPOTENCY_KEY_REQUIRED', 'A UUID Idempotency-Key is required to create an invoice.'));
    try {
      const draft = buildInvoiceDraft(req.body, req.user.id);
      const result = await repos.invoices.createDraftIdempotent(req.orgId, key.data, draft.invoice, draft.lines, req.user.id, req.id);
      return res.status(result.replayed ? 200 : 201).json({ invoice: result.invoice, replayed: result.replayed });
    } catch (error) { return sendError(res, error, next); }
  });
  router.get('/invoices/:invoiceId', async (req, res, next) => {
    if (!uuid.safeParse(req.params.invoiceId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Invoice ID is invalid.'));
    try { const invoice = await repos.invoices.get(req.orgId, req.params.invoiceId); return invoice ? res.json({ invoice }) : invoiceError(res, 'INVOICE_NOT_FOUND', 'The invoice was not found.', 404); }
    catch (error) { return next(error); }
  });
  router.patch('/invoices/:invoiceId', rbac(writers), validateInvoiceBody, async (req, res, next) => {
    if (!uuid.safeParse(req.params.invoiceId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Invoice ID is invalid.'));
    try {
      const current = await repos.invoices.get(req.orgId, req.params.invoiceId);
      if (!current) return invoiceError(res, 'INVOICE_NOT_FOUND', 'The invoice was not found.', 404);
      if (current.state === 'reviewed') return invoiceError(res, 'INVOICE_REOPEN_REQUIRED', 'Move this reviewed invoice back to draft before editing.');
      if (current.state !== 'draft') return invoiceError(res, 'INVOICE_READ_ONLY', 'Sent, paid and void invoices are read-only.');
      const draft = buildInvoiceDraft(req.body, req.user.id);
      const invoice = await repos.invoices.updateDraft(req.orgId, current.id, draft.invoice, draft.lines, req.user.id, req.id);
      return res.json({ invoice });
    } catch (error) { return sendError(res, error, next); }
  });
  router.post('/invoices/:invoiceId/review', rbac(writers), async (req, res, next) => {
    if (!uuid.safeParse(req.params.invoiceId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Invoice ID is invalid.'));
    try {
      const current = await repos.invoices.get(req.orgId, req.params.invoiceId);
      if (!current) return invoiceError(res, 'INVOICE_NOT_FOUND', 'The invoice was not found.', 404);
      if (current.state === 'reviewed') return res.json({ invoice: current });
      if (current.state !== 'draft') return invoiceError(res, 'INVOICE_INVALID_TRANSITION', 'Only a draft invoice can be reviewed.');
      const invoice = await repos.invoices.setState(req.orgId, current.id, 'reviewed', req.user.id, { requestId: req.id });
      return res.json({ invoice });
    } catch (error) { return next(error); }
  });
  router.post('/invoices/:invoiceId/reopen', rbac(writers), async (req, res, next) => {
    if (!uuid.safeParse(req.params.invoiceId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Invoice ID is invalid.'));
    try {
      const current = await repos.invoices.get(req.orgId, req.params.invoiceId);
      if (!current) return invoiceError(res, 'INVOICE_NOT_FOUND', 'The invoice was not found.', 404);
      if (current.state === 'draft') return res.json({ invoice: current });
      if (current.state !== 'reviewed') return invoiceError(res, 'INVOICE_READ_ONLY', 'Sent, paid and void invoices cannot return to draft.');
      return res.json({ invoice: await repos.invoices.reopenDraft(req.orgId, current.id, req.user.id, req.id) });
    } catch (error) { return next(error); }
  });
  router.delete('/invoices/:invoiceId', rbac(writers), async (req, res, next) => {
    if (!uuid.safeParse(req.params.invoiceId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Invoice ID is invalid.'));
    const key = uuid.safeParse(req.get('Idempotency-Key') || '');
    if (!key.success) return res.status(400).json(structuredErrorBody('IDEMPOTENCY_KEY_REQUIRED', 'A UUID Idempotency-Key is required to delete an invoice.'));
    try {
      const current = await repos.invoices.get(req.orgId, req.params.invoiceId);
      if (!current) {
        // Let the database recognize a replay of this exact idempotency key after the row was deleted.
        const replay = await repos.invoices.deleteDraftIdempotent(req.orgId, req.params.invoiceId, key.data, req.user.id, req.id);
        return res.json({ deleted: true, replayed: Boolean(replay.replayed) });
      }
      if (current.state === 'reviewed' || current.state === 'sent') return invoiceError(res, 'INVOICE_MUST_BE_VOIDED', 'Reviewed or sent invoices must be voided, not deleted.');
      if (current.state !== 'draft') return invoiceError(res, 'INVOICE_READ_ONLY', 'Paid or void invoices cannot be deleted.');
      const result = await repos.invoices.deleteDraftIdempotent(req.orgId, current.id, key.data, req.user.id, req.id);
      return res.json({ deleted: true, replayed: Boolean(result.replayed) });
    } catch (error) { return sendError(res, error, next); }
  });
  router.post('/invoices/:invoiceId/send-approval', rbac(writers), async (req, res, next) => {
    if (!uuid.safeParse(req.params.invoiceId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Invoice ID is invalid.'));
    try {
      const current = await repos.invoices.get(req.orgId, req.params.invoiceId);
      if (!current) return invoiceError(res, 'INVOICE_NOT_FOUND', 'The invoice was not found.', 404);
      if (current.state !== 'reviewed') return invoiceError(res, 'INVOICE_NOT_REVIEWED', 'Only a reviewed invoice can request approval to send.');
      const approvalId = `APR-INV-${randomUUID()}`;
      const approval = await repos.invoices.requestSendApproval(req.orgId, current.id, approvalId, req.user.id, { invoiceId: current.id, sendMode: 'SIMULATED' });
      return res.status(201).json({ approval, sendMode: 'SIMULATED', delivered: false });
    } catch (error) { return next(error); }
  });
  router.post('/invoices/:invoiceId/void', rbac(writers), async (req, res, next) => {
    if (!uuid.safeParse(req.params.invoiceId).success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Invoice ID is invalid.'));
    try {
      const current = await repos.invoices.get(req.orgId, req.params.invoiceId);
      if (!current) return invoiceError(res, 'INVOICE_NOT_FOUND', 'The invoice was not found.', 404);
      if (current.state === 'void') return res.json({ invoice: current });
      if (current.state !== 'reviewed' && current.state !== 'sent') return invoiceError(res, 'INVOICE_INVALID_TRANSITION', 'Only a reviewed or sent invoice can be voided.');
      return res.json({ invoice: await repos.invoices.setState(req.orgId, current.id, 'void', req.user.id, { requestId: req.id }) });
    } catch (error) { return next(error); }
  });
  return router;
}

export const formatInvoiceMoney = invoiceMoney;
