import { Router } from 'express';
import { z } from 'zod';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { classifyAIIntent } from '../ai/router.js';

const chatSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  context: z.unknown().optional(),
  interrupted: z.object({ previousReply: z.string().max(1000).optional(), spokenChars: z.number().int().min(0).max(2000).optional() }).optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(500) }).strict()).max(6).optional(),
}).passthrough();

export function aiRoutes({ config, askAI }) {
  const router = Router();
  router.post('/ai/chat', async (req, res, next) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(structuredErrorBody('AI_MESSAGE_INVALID', 'Provide a non-empty message of at most 1000 characters.'));
    try {
      // Legacy client context is accepted for compatibility but intentionally ignored.
      const verifiedContext = { orgId: req.orgId, role: req.orgRole, userId: req.user?.id };
      const classification = classifyAIIntent(parsed.data.message);
      const result = await askAI(parsed.data.message, verifiedContext, {
        context: parsed.data.context && typeof parsed.data.context === 'object' ? { view: parsed.data.context.view, selection: parsed.data.context.selection } : undefined,
        interrupted: parsed.data.interrupted,
        history: parsed.data.history,
      });
      return res.json({
        answer: result.reply,
        ...(result.speak ? { speak: result.speak } : {}),
        route: result.route || classification.route,
        reason: result.reason || classification.reason,
        citations: result.evidence || [],
        ...(result.proposal ? { proposal: result.proposal } : {}),
        ...(Array.isArray(result.actions) && result.actions.length ? { actions: result.actions } : {}),
        usage: result.usage || { model: result.model || null, inputTokens: 0, outputTokens: 0 },
        cached: Boolean(result.cached),
        ...(result.stale ? { stale: true } : {}),
        ...(result.insufficientEvidence ? { insufficient_evidence: true } : {}),
        ...(result.limited ? { limited: true } : {}),
        ...(result.unavailable ? { unavailable: true } : {}),
      });
    } catch (error) { return next(error); }
  });
  return router;
}
