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

export function aiRoutes({ config, askAI, identity }) {
  const router = Router();
  const actionAttempts = new Map();
  const actionAuditSchema = z.object({ actionId: z.string().min(1).max(80), tier: z.number().int().min(0).max(2), outcome: z.enum(['confirmed', 'proposed', 'cancelled', 'completed', 'failed']) }).strict();
  async function auditAssistantAction(req, action, outcome) {
    try {
      if (!identity?.audit) throw new Error('audit service unavailable');
      await identity.audit({ orgId: req.orgId, actorId: req.user.id, action: `assistant.${outcome}`, entity: 'assistant_action', entityId: null, metadata: { actionId: action.id, tier: action.tier, outcome }, requestId: req.id });
    } catch {
      console.log(JSON.stringify({ level: 'error', event: 'assistant_action_audit_failed', requestId: req.id, actionId: action.id, tier: action.tier, outcome }));
      throw Object.assign(new Error('Assistant action could not be audited.'), { assistantAuditFailure: true });
    }
  }
  router.post('/ai/actions/audit', async (req, res, next) => {
    const parsed = actionAuditSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: 'ASSISTANT_ACTION_INVALID', message: 'Assistant action audit details are invalid.' } });
    try {
      const { actionId, tier, outcome } = parsed.data;
      const definition = globalThis.NovaPayAssistantActions?.registry.find((item) => item.id === actionId);
      if (!definition || definition.tier !== tier || !definition.roles.includes(req.orgRole)) return res.status(403).json({ error: { code: 'ASSISTANT_ACTION_FORBIDDEN', message: 'This action is not available for your role.' } });
      if (tier > 0 && ['confirmed', 'proposed'].includes(outcome)) {
        const now = Date.now(), recent = (actionAttempts.get(req.user.id) || []).filter((stamp) => now - stamp < 60000);
        for (const [userId, stamps] of actionAttempts) { const live = stamps.filter((stamp) => now - stamp < 60000); if (live.length) actionAttempts.set(userId, live); else actionAttempts.delete(userId); }
        if (recent.length >= 5) return res.status(429).json({ error: { code: 'ASSISTANT_ACTION_RATE_LIMITED', message: 'Too many assistant actions. Try again in a minute.' } });
        recent.push(now); actionAttempts.set(req.user.id, recent);
      }
      await auditAssistantAction(req, { id: actionId, tier }, outcome);
      return res.json({ recorded: true });
    } catch (error) { if (error.assistantAuditFailure) return res.status(503).json({ error: { code: 'ASSISTANT_AUDIT_FAILED', message: 'NovaPay could not safely record this action, so it was not performed.' }, requestId: req.id }); return next(error); }
  });
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
      for (const action of (Array.isArray(result.actions) ? result.actions : [])) await auditAssistantAction(req, action, 'offered');
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
    } catch (error) { if (error.assistantAuditFailure) return res.status(503).json({ error: { code: 'ASSISTANT_AUDIT_FAILED', message: 'NovaPay could not safely record this action, so no action was offered.' }, requestId: req.id }); return next(error); }
  });
  return router;
}
