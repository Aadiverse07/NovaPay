import { Router } from 'express';
import { z } from 'zod';
import { remainingRefundable } from '../services/paypal.js';
import { decideApproval } from '../services/refunds.js';
import { rbac } from '../middleware/auth.js';
import { auditApiAction } from '../services/audit.js';
import { validateBody } from '../middleware/validate.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { moneyToMinor } from '../repos/postgres.js';
import { decideInvoiceSend } from '../services/invoices.js';

const decisionSchema = z.object({ decision: z.enum(['approve','reject']), note: z.string().trim().max(500).default('') }).strict();

export function approvalRoutes({ config, repos, identity, paypal }) {
  const router = Router();
  router.get('/approvals', async (req, res, next) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const status = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : undefined;
      if (status && !['pending','processing','approved','rejected','completed','pending_verification','failed'].includes(status)) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Unsupported approval status.'));
      const [approvals,pendingCount] = await Promise.all([repos.approvals.list(req.orgId,{status,limit,offset}),repos.approvals.countPending(req.orgId)]);
      return res.json({ approvals, pendingCount, page: { limit, offset } });
    } catch (error) { return next(error); }
  });
  router.get('/approvals/pending-count', async (req, res, next) => {
    try { return res.json({ pendingCount: await repos.approvals.countPending(req.orgId) }); }
    catch (error) { return next(error); }
  });
  router.post('/approvals/register', rbac(['owner', 'admin', 'approver']), async (req, res, next) => {
    if (!config.hasPayPal) return res.status(503).json({ error: 'PayPal Sandbox credentials are unavailable; refund proposal cannot be registered for execution.' });
    const body = req.body;
    const approvalId = String(body.approvalId || ''), captureId = String(body.captureId || '');
    if (!/^APR-[A-Za-z0-9-]{1,80}$/.test(approvalId) || String(body.proposalType || '') !== 'refund') return res.status(400).json({ error: 'A valid refund proposal and approval reference are required.' });
    try {
      const capture = await repos.captures.get(captureId, req.orgId);
      if (!capture || capture.status !== 'COMPLETED') return res.status(404).json({ error: 'The proposal must reference an available completed PayPal capture.' });
      const raw = String(body.amount || '');
      if (String(body.currency || '') !== 'USD' || capture.currency !== 'USD' || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return res.status(400).json({ error: 'Only a valid USD amount can be linked to a USD sandbox capture.' });
      let minor;
      try { minor = moneyToMinor(raw); } catch { return res.status(400).json({ error: 'Only a valid USD amount can be linked to a USD sandbox capture.' }); }
      const value = (minor / 100).toFixed(2), remaining = remainingRefundable(capture);
      if (minor <= 0 || minor / 100 > remaining) return res.status(400).json({ error: `Refund amount exceeds the remaining captured amount (${Math.max(0, remaining).toFixed(2)} USD).` });
      const old = await repos.approvals.get(approvalId, req.orgId);
      if (old) {
        if (old.captureId !== captureId || old.amount !== value || old.currency !== 'USD') return res.status(409).json({ error: 'This approval reference is already linked to a different capture or amount.' });
        return res.json({ registered: true, approvalId, captureId, amount: value, currency: 'USD' });
      }
      await auditApiAction(identity, req, { action: 'approval.register', entity: 'approval', entityId: approvalId, metadata: { captureId, amount: value, currency: 'USD' } });
      await repos.approvals.save(approvalId, { proposalType: 'refund', captureId, amount: value, currency: 'USD', status: 'pending', requestPayload: body }, req.orgId, req.user.id);
      return res.json({ registered: true, approvalId, captureId, amount: value, currency: 'USD' });
    } catch (error) { return next(error); }
  });
  router.get('/approvals/:approvalId', async (req, res, next) => {
    try {
      const approval = await repos.approvals.get(req.params.approvalId, req.orgId);
      return approval ? res.json({ approval }) : res.status(404).json(structuredErrorBody('APPROVAL_NOT_FOUND','The approval was not found in this organization.'));
    } catch (error) { return next(error); }
  });
  router.post('/approvals/:approvalId/decision', rbac(['owner','admin','approver']), validateBody(decisionSchema), async (req, res, next) => {
    try {
      if (!config.hasPayPal && req.body.decision === 'approve') return res.status(503).json(structuredErrorBody('PAYPAL_NOT_CONFIGURED','PayPal Sandbox is unavailable; this approval cannot be executed.'));
      const existing = await repos.approvals.get(req.params.approvalId,req.orgId);
      if (existing?.proposalType === 'send-invoice') {
        const result=await decideInvoiceSend({repos,paypal,req,approvalId:req.params.approvalId,decision:req.body.decision,note:req.body.note});
        return res.status(result.status).json(result.body);
      }
      const result = await decideApproval({ repos, paypal, identity, req, approvalId: req.params.approvalId, decision: req.body.decision, note: req.body.note });
      return res.status(result.status).json(result.body);
    } catch (error) { return next(error); }
  });
  return router;
}
