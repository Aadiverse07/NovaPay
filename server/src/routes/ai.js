import { Router } from 'express';
import { z } from 'zod';
import { structuredErrorBody } from '../middleware/errorResponses.js';

const chatSchema = z.object({ message: z.string().trim().min(1).max(1000), context: z.unknown().optional() }).passthrough();

export function aiRoutes({ config, askAI }) {
  const router = Router();
  router.post('/ai/chat', async (req, res, next) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(structuredErrorBody('AI_MESSAGE_INVALID', 'Provide a non-empty message of at most 1000 characters.'));
    if (!config.hasAI) return res.status(503).json(structuredErrorBody('AI_UNAVAILABLE', 'The AI provider is not configured.'));
    try {
      // Legacy client context is accepted for compatibility but intentionally ignored.
      const verifiedContext = { orgId: req.orgId, role: req.orgRole, userId: req.user?.id };
      return res.json(await askAI(parsed.data.message, verifiedContext));
    } catch (error) { return next(error); }
  });
  return router;
}
