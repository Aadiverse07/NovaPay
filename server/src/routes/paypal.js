import { Router } from 'express';
import { approveUrl, isValidOrderAmount, paypalRequestId } from '../services/paypal.js';
import { moneyToMinor } from '../repos/postgres.js';
import { rbac } from '../middleware/auth.js';
import { auditApiAction } from '../services/audit.js';
import { decideApproval } from '../services/refunds.js';

export function paypalRoutes({ config, paypal, repos, identity, fx }) {
  const router = Router();
  router.post('/paypal/create-order', rbac(['owner', 'admin', 'accountant', 'approver']), async (req, res, next) => {
    try {
      if (!config.hasPayPal) return res.status(503).json({ error: 'PayPal sandbox credentials not set' });
      const body = req.body, raw = String(body.amount == null ? '' : body.amount), currency = String(body.currency || 'USD'), requestKey = String(body.requestKey || '');
      if (currency !== 'USD' || !isValidOrderAmount(raw)) return res.status(400).json({ error: 'Enter a valid amount from 0.01 to 10,000.00 USD.' });
      if (!/^[a-f0-9]{32}$/.test(requestKey)) return res.status(400).json({ error: 'A valid order request key is required. Retry from the Sandbox page.' });
      const amount = (moneyToMinor(raw) / 100).toFixed(2);
      const previous = await repos.orders.byRequestKey(requestKey, req.orgId);
      if (previous) {
        if (previous.amount !== amount || previous.currency !== 'USD') return res.status(409).json({ error: 'This order request key is already linked to another amount.' });
        if (previous.id && previous.approveUrl) return res.json({ orderId: previous.id, id: previous.id, status: previous.status, approveUrl: previous.approveUrl, amount: previous.amount, currency: 'USD' });
      } else {
        await repos.orders.save({ id: '', requestKey, amount, currency: 'USD', status: 'CREATING', state: 'Creating', approveUrl: '' }, req.orgId);
        await auditApiAction(identity, req, { action: 'paypal.order.create', entity: 'order', entityId: requestKey, metadata: { amount, currency: 'USD' } });
      }
      const data = await paypal.pp('POST', '/v2/checkout/orders', { intent: 'CAPTURE', purchase_units: [{ amount: { currency_code: 'USD', value: amount }, description: 'NovaPay sandbox test payment' }], payment_source: { paypal: { experience_context: { return_url: `http://localhost:${config.PORT}/dashboard.html#sandbox`, cancel_url: `http://localhost:${config.PORT}/dashboard.html#sandbox`, user_action: 'PAY_NOW' } } } }, paypalRequestId('order', `${req.orgId}:${requestKey}`), req.orgId);
      const link = (data.links || []).find((item) => item.rel === 'payer-action' || item.rel === 'approve'), url = approveUrl(link && link.href);
      if (!data.id || !url) return res.status(502).json({ error: 'PayPal returned an incomplete order. No buyer approval link is available.' });
      const order = await repos.orders.save({ id: String(data.id), requestKey, amount, currency: 'USD', status: String(data.status || 'CREATED'), approveUrl: url, state: 'Created', capture: null }, req.orgId);
      return res.json({ orderId: order.id, id: order.id, status: order.status, approveUrl: url, amount, currency: 'USD' });
    } catch (error) { return next(error); }
  });

  router.post('/paypal/capture', rbac(['owner', 'admin', 'accountant', 'approver']), async (req, res, next) => {
    try {
      if (!config.hasPayPal) return res.status(503).json({ error: 'PayPal sandbox credentials not set' });
      const orderId = String(req.body.orderId || '');
      if (!/^[A-Z0-9-]{5,64}$/.test(orderId)) return res.status(400).json({ error: 'A valid PayPal Sandbox order ID is required.' });
      const state = await repos.orders.beginCapture(orderId, req.orgId);
      if (state.result === 'missing') return res.status(404).json({ error: 'This order was not created in the current server session. Create a new sandbox order first.' });
      if (state.result === 'complete') {
        const capture = state.response;
        if (capture.status === 'COMPLETED') return res.json(capture);
        return res.status(409).json({ error: 'PayPal has not confirmed a completed capture for this order. Check PayPal Sandbox before retrying.', status: capture.status, retryBlocked: true });
      }
      if (state.result === 'busy') return res.status(409).json({ error: 'This order capture is already being processed.' });
      if (state.result === 'unavailable') return res.status(409).json({ error: 'This order is not available for another capture request.', retryBlocked: true });
      const order = state.order;
      await auditApiAction(identity, req, { action: 'paypal.capture', entity: 'order', entityId: orderId, metadata: { amount: order.amount, currency: order.currency } });
      let data;
      try { data = await paypal.pp('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, null, paypalRequestId('capture', orderId), req.orgId); }
      catch (error) {
        if (error.requestSent && !error.paypalResponse) { await repos.orders.updateState(orderId, req.orgId, 'Capture outcome uncertain'); return res.status(503).json({ error: 'The capture request outcome is uncertain. Check PayPal Sandbox before retrying.', retryBlocked: true }); }
        await repos.orders.updateState(orderId, req.orgId, 'Created'); throw error;
      }
      const capture = data?.purchase_units?.[0]?.payments?.captures?.[0];
      if (!capture?.id || !capture.amount?.value || !capture.amount?.currency_code) {
        await repos.orders.updateState(orderId, req.orgId, String(data.status || 'Capture unavailable'), String(data.status || 'Capture unavailable'));
        return res.status(502).json({ error: 'PayPal did not return complete capture details. No transaction was added; check the order in PayPal Sandbox.', status: String(data.status || 'Capture unavailable'), retryBlocked: true });
      }
      const breakdown = capture.seller_receivable_breakdown || {};
      const gross = String(breakdown.gross_amount?.value || capture.amount.value);
      const currency = String(breakdown.gross_amount?.currency_code || capture.amount.currency_code);
      const reportedCurrencies = [breakdown.gross_amount?.currency_code,breakdown.paypal_fee?.currency_code,breakdown.net_amount?.currency_code].filter(Boolean);
      let matchesOrder = false;
      try { matchesOrder = moneyToMinor(gross) === moneyToMinor(order.amount); } catch {}
      if (!matchesOrder || currency !== order.currency || reportedCurrencies.some((item) => item !== currency)) {
        await repos.orders.updateState(orderId, req.orgId, 'Capture details mismatch');
        return res.status(502).json({ error: 'PayPal capture details did not match the order amount and currency. No transaction was added.', retryBlocked: true });
      }
      const record = { id: String(capture.id), orderId, value: gross, currency, status: String(capture.status || 'UNKNOWN'), fee: breakdown.paypal_fee?.value == null ? undefined : String(breakdown.paypal_fee.value), net: breakdown.net_amount?.value == null ? undefined : String(breakdown.net_amount.value), occurredAt: capture.update_time || capture.create_time, providerPayload: { seller_receivable_breakdown: breakdown } };
      const stored = await repos.captures.add(record, req.orgId);
      if (breakdown.exchange_rate && fx) await fx.recordPayPalRate(req.orgId,breakdown.exchange_rate).catch(()=>{});
      const response = { captureId: stored.id, orderId, status: record.status, amount: record.value, currency: record.currency, ...(record.fee === undefined ? {} : { fee: record.fee }), refunded: stored.refunded || 0 };
      if (record.status === 'COMPLETED') {
        if (!identity?.database) { order.capture = response; order.state = record.status; }
        return res.json(response);
      }
      await repos.orders.updateState(orderId, req.orgId, record.status, record.status);
      return res.status(409).json({ error: 'PayPal returned the capture details but did not confirm completion. No transaction was added; check the order in PayPal Sandbox before retrying.', status: record.status, captureId: record.id, orderId, amount: record.value, currency: record.currency, ...(record.fee === undefined ? {} : { fee: record.fee }), retryBlocked: true });
    } catch (error) { return next(error); }
  });

  router.post('/paypal/refund', rbac(['owner', 'admin', 'approver']), async (req, res, next) => {
    try {
      if (!config.hasPayPal) return res.status(503).json({ error: 'PayPal sandbox credentials not set' });
      const body = req.body;
      if (String(body.proposalType || '') !== 'refund') return res.status(400).json({ error: 'Only an explicitly approved refund proposal can use this route.' });
      const approvalId = String(body.approvalId || ''), captureId = String(body.captureId || '');
      if (!/^APR-[A-Za-z0-9-]{1,80}$/.test(approvalId)) return res.status(400).json({ error: 'A valid approval reference is required.' });
      const approval = await repos.approvals.get(approvalId, req.orgId);
      if (!approval || approval.proposalType !== 'refund' || approval.captureId !== captureId || approval.currency !== String(body.currency || '') || approval.amount !== String(body.amount || '')) return res.status(403).json({ error: 'This refund does not match a server-registered approval, capture, amount, and currency.' });
      const capture = await repos.captures.get(captureId, req.orgId);
      if (!capture) return res.status(404).json({ error: 'The specified PayPal capture is not available in this backend session. No refund was sent.' });
      if (capture.status !== 'COMPLETED') return res.status(409).json({ error: 'The specified capture is not in a refundable completed state.' });
      if (String(body.currency || '') !== 'USD' || capture.currency !== 'USD') return res.status(400).json({ error: 'Refunds are currently supported only for USD sandbox captures.' });
      let refundMinor;
      try { refundMinor = moneyToMinor(body.amount); } catch { return res.status(400).json({ error: 'Refund amount must be a positive USD amount with at most two decimal places.' }); }
      if (!/^\d+(?:\.\d{1,2})?$/.test(String(body.amount || '')) || refundMinor <= 0) return res.status(400).json({ error: 'Refund amount must be a positive USD amount with at most two decimal places.' });
      if (approval.amount !== (refundMinor / 100).toFixed(2)) return res.status(403).json({ error: 'This refund does not match a server-registered approval, capture, amount, and currency.' });
      const result = await decideApproval({ repos, paypal, identity, req, approvalId, decision: 'approve', note: String(body.note || '').slice(0, 500) });
      return res.status(result.status).json(result.body);
    } catch (error) { return next(error); }
  });
  return router;
}
