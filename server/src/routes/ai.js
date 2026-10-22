import { Router } from 'express';

export function aiRoutes({ config, askAI }) {
  const router = Router();
  router.post('/ai/chat', async (req, res, next) => {
    if (!config.hasAI) return res.status(503).json({ error: 'LLM_API_KEY not set' });
    try { return res.json(await askAI(String(req.body.message || '').slice(0, 500), req.body.context || {})); } catch (error) { return next(error); }
  });
  return router;
}
