import { Router } from 'express';
import { approveUrl, isValidOrderAmount, paypalRequestId, remainingRefundable } from '../services/paypal.js';
import { rbac } from '../middleware/auth.js';
import { auditApiAction } from '../services/audit.js';

export function paypalRoutes({ config, paypal, repos, identity }) {
  const router = Router();
  router.post('/paypal/create-order', rbac(['owner', 'admin', 'accountant', 'approver']), async (req, res, next) => {
    try {
      if (!config.hasPayPal) return res.status(503).json({ error: 'PayPal sandbox credentials not set' });
      const body = req.body, raw = String(body.amount == null ? '' : body.amount), currency = String(body.currency || 'USD'), requestKey = String(body.requestKey || '');
      if (currency !== 'USD' || !isValidOrderAmount(raw)) return res.status(400).json({ error: 'Enter a valid amount from 0.01 to 10,000.00 USD.' });
      if (!/^[a-f0-9]{32}$/.test(requestKey)) return res.status(400).json({ error: 'A valid order request key is required. Retry from the Sandbox page.' });
      const amount = Number(raw).toFixed(2), previous = repos.orders.byRequestKey(requestKey, req.orgId);
      if (previous) {
        if (previous.amount !== amount || previous.currency !== 'USD') return res.status(409).json({ error: 'This order request key is already linked to another amount.' });
        return res.json({ orderId: previous.id, id: previous.id, status: previous.status, approveUrl: previous.approveUrl, amount: previous.amount, currency: 'USD' });
      }
      await auditApiAction(identity, req, { action: 'paypal.order.create', entity: 'order', entityId: requestKey, metadata: { amount, currency: 'USD' } });
      const data = await paypal.pp('POST', '/v2/checkout/orders', { intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: amount }, description: 'NovaPay sandbox test payment' }], payment_source: { paypal: { experience_context: { return_url: `http://localhost:${config.PORT}/dashboard.html#sandbox`, cancel_url: `http://localhost:${config.PORT}/dashboard.html#sandbox`, user_action: 'PAY_NOW' } } } }, paypalRequestId('order', `${req.orgId}:${requestKey}`));
      const link = (data.links || []).find((item) => item.rel === 'payer-action' || item.rel === 'approve'), url = approveUrl(link && link.href);
      if (!data.id || !url) return res.status(502).json({ error: 'PayPal returned an incomplete order. No buyer approval link is available.' });
      const order = { id: String(data.id), requestKey, amount, currency: 'USD', status: String(data.status || 'CREATED'), approveUrl: url, state: 'Created', capture: null };
      repos.orders.save(order, req.orgId);
      return res.json({ orderId: order.id, id: order.id, status: order.status, approveUrl: url, amount, currency: 'USD' });
    } catch (error) { return next(error); }
  });

  router.post('/paypal/capture', rbac(['owner', 'admin', 'accountant', 'approver']), async (req, res, next) => {
    try {
      if (!config.hasPayPal) return res.status(503).json({ error: 'PayPal sandbox credentials not set' });
      const orderId = String(req.body.orderId || '');
      if (!/^[A-Z0-9-]{5,64}$/.test(orderId)) return res.status(400).json({ error: 'A valid PayPal Sandbox order ID is required.' });
      const order = repos.orders.get(orderId, req.orgId);
      if (!order) return res.status(404).json({ error: 'This order was not created in the current server session. Create a new sandbox order first.' });
      if (order.capture) {
        if (order.capture.status === 'COMPLETED') return res.json(order.capture);
        return res.status(409).json({ error: 'PayPal has not confirmed a completed capture for this order. Check PayPal Sandbox before retrying.', status: order.capture.status, retryBlocked: true });
      }
      if (order.state === 'Capturing') return res.status(409).json({ error: 'This order capture is already being processed.' });
      if (order.state !== 'Created') return res.status(409).json({ error: 'This order is not available for another capture request.', retryBlocked: true });
      await auditApiAction(identity, req, { action: 'paypal.capture', entity: 'order', entityId: orderId, metadata: { amount: order.amount, currency: order.currency } });
      order.state = 'Capturing'; let data;
      try { data = await paypal.pp('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, null, paypalRequestId('capture', orderId)); }
      catch (error) {
        if (error.requestSent && !error.paypalResponse) { order.state = 'Capture outcome uncertain'; return res.status(503).json({ error: 'The capture request outcome is uncertain. Check PayPal Sandbox before retrying.', retryBlocked: true }); }
        order.state = 'Created'; throw error;
      }
      const capture = data && data.purchase_units && data.purchase_units[0] && data.purchase_units[0].payments && data.purchase_units[0].payments.captures && data.purchase_units[0].payments.captures[0];
      if (!capture || !capture.id || !capture.amount || !capture.amount.value || !capture.amount.currency_code) { order.state = String(data.status || 'Capture unavailable'); return res.status(502).json({ error: 'PayPal did not return complete capture details. No transaction was added; check the order in PayPal Sandbox.', status: order.state, retryBlocked: true }); }
      const value = Number(capture.amount.value);
      if (!Number.isFinite(value) || value <= 0 || Number(value.toFixed(2)) !== Number(order.amount) || String(capture.amount.currency_code) !== order.currency) { order.state = 'Capture details mismatch'; return res.status(502).json({ error: 'PayPal capture details did not match the order amount and currency. No transaction was added.', retryBlocked: true }); }
      const record = { id: String(capture.id), orderId, value: String(capture.amount.value), currency: String(capture.amount.currency_code), status: String(capture.status || 'UNKNOWN'), fee: capture.seller_receivable_breakdown && capture.seller_receivable_breakdown.paypal_fee ? String(capture.seller_receivable_breakdown.paypal_fee.value) : undefined, refunded: 0, reserved: 0 };
      order.capture = { captureId: record.id, orderId, status: record.status, amount: record.value, currency: record.currency, fee: record.fee, refunded: 0 }; order.state = record.status;
      if (record.status === 'COMPLETED') repos.captures.add(record, req.orgId);
      if (record.status !== 'COMPLETED') return res.status(409).json({ error: 'PayPal returned the capture details but did not confirm completion. No transaction was added; check PayPal Sandbox before retrying.', status: record.status, captureId: record.id, orderId, amount: record.value, currency: record.currency, fee: record.fee, retryBlocked: true });
      return res.json(order.capture);
    } catch (error) { return next(error); }
  });

  router.post('/paypal/refund', rbac(['owner', 'admin', 'approver']), async (req, res, next) => {
    try {
      if (!config.hasPayPal) return res.status(503).json({ error: 'PayPal sandbox credentials not set' });
      const body = req.body;
      if (String(body.proposalType || '') !== 'refund') return res.status(400).json({ error: 'Only an explicitly approved refund proposal can use this route.' });
      const approvalId = String(body.approvalId || ''), captureId = String(body.captureId || '');
      if (!/^APR-[A-Za-z0-9-]{1,80}$/.test(approvalId)) return res.status(400).json({ error: 'A valid approval reference is required.' });
      const registration = repos.approvals.get(approvalId, req.orgId);
      if (!registration || registration.proposalType !== 'refund' || registration.captureId !== captureId || registration.currency !== String(body.currency || '') || registration.amount !== String(body.amount || '')) return res.status(403).json({ error: 'This refund does not match a server-registered approval, capture, amount, and currency.' });
      const capture = repos.captures.get(captureId, req.orgId);
      if (!capture) return res.status(404).json({ error: 'The specified PayPal capture is not available in this backend session. No refund was sent.' });
      if (capture.status !== 'COMPLETED') return res.status(409).json({ error: 'The specified capture is not in a refundable completed state.' });
      if (String(body.currency || '') !== 'USD' || capture.currency !== 'USD') return res.status(400).json({ error: 'Refunds are currently supported only for USD sandbox captures.' });
      const raw = String(body.amount || '');
      if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return res.status(400).json({ error: 'Refund amount must be a positive USD amount with at most two decimal places.' });
      const amount = Number(raw), amountString = amount.toFixed(2);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Refund amount must be greater than zero.' });
      const existing = repos.captures.refund(approvalId, req.orgId);
      if (existing) {
        if (existing.captureId !== captureId || existing.amount !== amountString) return res.status(409).json({ error: 'This approval reference was already used for a different refund request.' });
        if (existing.status === 'COMPLETED') return res.json(existing);
        return res.status(409).json({ error: existing.error || 'PayPal returned a non-completed refund status. Check PayPal Sandbox before retrying.', status: existing.status, retryBlocked: true });
      }
      if (repos.captures.isLocked(approvalId, req.orgId)) return res.status(409).json({ error: 'This approval is already being submitted. Wait for the current request to finish.' });
      const refundable = remainingRefundable(capture);
      if (!Number.isFinite(refundable) || amount > refundable) return res.status(400).json({ error: `Refund amount exceeds the remaining captured amount (${Math.max(0, refundable).toFixed(2)} USD).` });
      await auditApiAction(identity, req, { action: 'paypal.refund', entity: 'capture', entityId: captureId, metadata: { approvalId, amount: amountString, currency: 'USD' } });
      repos.captures.lock(approvalId, req.orgId); capture.reserved = Number((Number(capture.reserved || 0) + amount).toFixed(2)); registration.status = 'Submitting';
      try {
        const data = await paypal.pp('POST', `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { amount: { value: amountString, currency_code: 'USD' }, note_to_payer: String(body.note || 'Refund approved in NovaPay').slice(0, 255) }, paypalRequestId('refund', `${req.orgId}:${approvalId}`));
        const result = { refundId: data.id, status: String(data.status || 'UNKNOWN'), captureId, amount: amountString, currency: 'USD' };
        if (result.status === 'COMPLETED' && result.refundId) { capture.reserved = Number((Number(capture.reserved || 0) - amount).toFixed(2)); capture.refunded = Number((Number(capture.refunded || 0) + amount).toFixed(2)); registration.status = 'Completed'; registration.resultId = result.refundId; repos.captures.saveRefund(approvalId, result, req.orgId); return res.json(result); }
        registration.status = 'Pending verification'; repos.captures.saveRefund(approvalId, { captureId, amount: amountString, status: result.status, error: `PayPal returned ${result.status}. Verify the refund in PayPal Sandbox; duplicate submission is blocked.` }, req.orgId);
        return res.status(409).json({ error: `PayPal returned ${result.status}, not COMPLETED. Verify the refund in PayPal Sandbox; this approval will not be submitted twice.`, status: result.status, retryBlocked: true });
      } catch (error) {
        if (error.requestSent && !error.paypalResponse) { registration.status = 'Pending verification'; repos.captures.saveRefund(approvalId, { captureId, amount: amountString, status: 'UNKNOWN', error: 'The PayPal request outcome is uncertain. Verify the capture in PayPal Sandbox; duplicate submission is blocked.' }, req.orgId); return res.status(503).json({ error: 'PayPal request outcome is uncertain. Verify PayPal Sandbox before taking further action.', retryBlocked: true }); }
        capture.reserved = Math.max(0, Number((Number(capture.reserved || 0) - amount).toFixed(2))); registration.status = 'Pending'; throw error;
      } finally { repos.captures.unlock(approvalId, req.orgId); }
    } catch (error) { return next(error); }
  });
  return router;
}
