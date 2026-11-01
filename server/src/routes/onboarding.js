import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validate.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';

const onboardingSchema = z.object({ organizationName: z.string().trim().min(2).max(120) }).strict();

export function onboardingRoutes({ identity }) {
  const router = Router();
  router.get('/onboarding', async (req, res) => {
    if (!req.user.emailConfirmedAt) return res.status(403).json(structuredErrorBody('EMAIL_NOT_CONFIRMED', 'Verify your email before setting up a workspace.'));
    try {
      const organizations = await identity.organizationsForUser(req.user.id);
      return res.json({ organizations: organizations.map((row) => ({ organizationId: row.org_id, role: row.role })) });
    } catch {
      return res.status(503).json(structuredErrorBody('WORKSPACE_LOOKUP_FAILED', 'Your workspace could not be loaded.'));
    }
  });
  router.post('/onboarding', validateBody(onboardingSchema), async (req, res) => {
    if (!req.user.emailConfirmedAt) return res.status(403).json(structuredErrorBody('EMAIL_NOT_CONFIRMED', 'Verify your email before creating a workspace.'));
    try {
      const result = await identity.onboard(req.user.id, req.body.organizationName, req.id);
      return res.status(result.created ? 201 : 200).json({ organizationId: result.organizationId, role: 'owner', created: result.created });
    } catch (error) {
      if (error.message === 'ONBOARDING_ALREADY_COMPLETED') return res.status(409).json(structuredErrorBody('ONBOARDING_ALREADY_COMPLETED', 'This account already belongs to an organization.'));
      return res.status(503).json(structuredErrorBody('ONBOARDING_FAILED', 'Organization onboarding could not be completed.'));
    }
  });
  return router;
}
