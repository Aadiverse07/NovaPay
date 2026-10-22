import { Router } from 'express';

export function statusRoutes({ config, paypal, repos }) {
  const router = Router();
  router.head('/status', (_req, res) => res.status(405).json({ error: 'Use GET for integration status.' }));
  router.head('/events', (_req, res) => res.status(405).json({ error: 'Use GET to read recent API activity.' }));
  router.get('/status', async (_req, res, next) => {
    try {
      let connected = false;
      if (config.hasPayPal) { try { await paypal.ppToken(); connected = true; } catch {} }
      res.json({ backend: true, paypal: config.hasPayPal, paypalConnected: connected, paypalIssue: !config.hasPayPal ? 'configuration-incomplete' : !connected ? 'connection-unavailable' : null, ai: config.hasAI, model: config.hasAI ? (config.resolvedLLMModel || config.LLM_MODEL || config.ANTHROPIC_MODEL) : null, webhookConfigured: Boolean(config.PAYPAL_WEBHOOK_ID), webhookEndpoint: '/api/webhook', captures: repos.captures.all().map((capture) => ({ captureId: capture.id, orderId: capture.orderId, amount: capture.value, currency: capture.currency, status: capture.status, fee: capture.fee, refunded: capture.refunded || 0, reserved: capture.reserved || 0 })) });
    } catch (error) { next(error); }
  });
  router.get('/events', (_req, res) => res.json(repos.events.snapshot()));
  return router;
}
