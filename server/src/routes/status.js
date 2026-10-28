import { Router } from 'express';

export function statusRoutes({ config, paypal, repos }) {
  const router = Router();
  router.head('/status', (_req, res) => res.status(405).json({ error: 'Use GET for integration status.' }));
  router.head('/events', (_req, res) => res.status(405).json({ error: 'Use GET to read recent API activity.' }));
  router.get('/status', async (_req, res, next) => {
    try {
      let connected = false;
      if (config.hasPayPal) { try { await paypal.ppToken(); connected = true; } catch {} }
      res.json({ backend: true, mode: config.hasSupabase ? 'authenticated' : 'degraded', supabaseConfigured: Boolean(config.hasSupabase), paypal: config.hasPayPal, paypalConnected: connected, paypalIssue: !config.hasPayPal ? 'configuration-incomplete' : !connected ? 'connection-unavailable' : null, ai: config.hasAI, model: config.hasAI ? (config.resolvedLLMModel || config.LLM_MODEL || config.ANTHROPIC_MODEL) : null, webhookConfigured: Boolean(config.PAYPAL_WEBHOOK_ID), webhookEndpoint: '/api/webhook', captures: [] });
    } catch (error) { next(error); }
  });
  router.get('/events', async (req, res) => {
    try { return res.json(await repos.events.snapshot(req.orgId)); }
    catch { return res.json({ events: [], calls: [] }); }
  });
  return router;
}
