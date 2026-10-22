import { Router } from 'express';
import express from 'express';
import { processPayPalEvent } from '../services/webhookProcessor.js';

const signatureHeaders = ['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'];

export function webhookRoutes({ paypal, repos, enqueue = (id) => setImmediate(() => { void processPayPalEvent({ eventId: id, repos, paypal }).catch(() => {}); }) }) {
  const router = Router();
  router.post('/webhook', express.raw({ type: 'application/json', limit: '64kb' }), async (req, res) => {
    let body;
    try { body = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''); }
    catch { return res.status(400).json({ error: 'Request body must be valid JSON.' }); }
    if (!body || typeof body !== 'object' || !body.event_type || typeof body.event_type !== 'string' || body.event_type.length > 200 || typeof body.id !== 'string' || !body.id) {
      return res.status(400).json({ error: 'Webhook event type is missing or invalid.' });
    }
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      const rawBodyBase64 = Buffer.isBuffer(req.body) ? req.body.toString('base64') : '';
      const headers = Object.fromEntries(signatureHeaders.map((name) => [name, req.get(name) || '']));
      const eventId = await repos.events.receive({ id: body.id.slice(0, 200), type: body.event_type, rawBody, rawBodyBase64, payload: body, headers });
      enqueue(eventId);
      return res.json({ ok: true, verification: 'UNVERIFIED' });
    } catch {
      return res.status(503).json({ error: { code: 'WEBHOOK_STORAGE_FAILED', message: 'The PayPal event could not be safely stored.' } });
    }
  });
  return router;
}
