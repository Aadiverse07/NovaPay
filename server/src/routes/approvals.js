import { Router } from 'express';
import { remainingRefundable } from '../services/paypal.js';

export function approvalRoutes({ config, repos }) {
  const router = Router();
  router.post('/approvals/register', (req, res) => {
    if (!config.hasPayPal) return res.status(503).json({ error: 'PayPal Sandbox credentials are unavailable; refund proposal cannot be registered for execution.' });
    const body = req.body;
    const approvalId = String(body.approvalId || ''), captureId = String(body.captureId || '');
    if (!/^APR-[A-Za-z0-9-]{1,80}$/.test(approvalId) || String(body.proposalType || '') !== 'refund') return res.status(400).json({ error: 'A valid refund proposal and approval reference are required.' });
    const capture = repos.captures.get(captureId);
    if (!capture || capture.status !== 'COMPLETED') return res.status(404).json({ error: 'The proposal must reference an available completed PayPal capture.' });
    const raw = String(body.amount || '');
    if (String(body.currency || '') !== 'USD' || capture.currency !== 'USD' || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return res.status(400).json({ error: 'Only a valid USD amount can be linked to a USD sandbox capture.' });
    const amount = Number(raw), value = amount.toFixed(2), remaining = remainingRefundable(capture);
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) return res.status(400).json({ error: `Refund amount exceeds the remaining captured amount (${Math.max(0, remaining).toFixed(2)} USD).` });
    const old = repos.approvals.get(approvalId);
    if (old) {
      if (old.captureId !== captureId || old.amount !== value || old.currency !== 'USD') return res.status(409).json({ error: 'This approval reference is already linked to a different capture or amount.' });
      return res.json({ registered: true, approvalId, captureId, amount: value, currency: 'USD' });
    }
    repos.approvals.save(approvalId, { proposalType: 'refund', captureId, amount: value, currency: 'USD', status: 'Pending' });
    return res.json({ registered: true, approvalId, captureId, amount: value, currency: 'USD' });
  });
  return router;
}
