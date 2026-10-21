import { Router } from 'express';

export function webhookRoutes({ paypal, repos }) {
  const router = Router();
  router.post('/webhook', async (req, res) => {
    const body = req.body;
    if (!body.event_type || typeof body.event_type !== 'string' || body.event_type.length > 200) return res.status(400).json({ error: 'Webhook event type is missing or invalid.' });
    const verification = await paypal.verifyWebhook(req.headers, body);
    repos.events.addEvent({ t: new Date().toISOString(), type: body.event_type, id: typeof body.id === 'string' ? body.id.slice(0, 200) : '', verification });
    res.json({ ok: true, verification });
  });
  return router;
}
