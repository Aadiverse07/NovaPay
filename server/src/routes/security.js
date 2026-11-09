import { Router } from 'express';
import { z } from 'zod';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { recordSecuritySession } from '../services/security.js';

const schema = z.object({ text: z.string().min(1).max(5000) }).strict();
export function inspectSuspiciousMessage(text) {
  const value = String(text || '');
  const reasons = [];
  if (/\b(immediately|urgent|act now|within \d+ hours?|account will be (?:closed|suspended)|final warning)\b/i.test(value)) reasons.push('The message uses urgency or threatens account access.');
  const urls = value.match(/https?:\/\/[^\s<>()"']+/gi) || [];
  if (urls.some((url) => { try { const host = new URL(url).hostname.toLowerCase(); return host !== 'paypal.com' && !host.endsWith('.paypal.com'); } catch { return true; } })) reasons.push('The message includes a link outside the official paypal.com domain.');
  if (/\b(password|passcode|one[- ]time (?:password|code)|otp|verification code)\b/i.test(value) && /\b(send|share|reply|provide|enter|tell us)\b/i.test(value)) reasons.push('The message asks you to share a password or one-time code.');
  return { suspicious: reasons.length > 0, reasons, notice: 'This is a heuristic check, not a guarantee.' };
}

const sessionSchema = z.object({ deviceId: z.string().uuid() }).strict();
export function securityRoutes({ config = {}, identity, repos } = {}) {
  const router = Router();
  router.post('/security/session-start', async (req,res,next) => {
    const parsed=sessionSchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','A valid device ID is required.'));
    try { return res.status(201).json(await recordSecuritySession({req,repos,config,identity})); }
    catch(error){return next(error)}
  });
  router.post('/security/check-message', (req,res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Provide a message of up to 5,000 characters.'));
    return res.json(inspectSuspiciousMessage(parsed.data.text));
  });
  router.post('/security/csp-report', (_req,res) => res.status(204).end());
  return router;
}
