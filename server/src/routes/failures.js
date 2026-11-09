import { Router } from 'express';
import { z } from 'zod';
import { rbac } from '../middleware/auth.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100000).default(0) });
export function failureRoutes({ repos }) {
  const router = Router();
  router.get('/failures', rbac(['owner','admin','accountant','approver']), async (req,res,next) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Failure pagination is invalid.'));
    try { return res.json({ failures: await repos.failures.list(req.orgId, parsed.data), page: { limit: parsed.data.limit, offset: parsed.data.offset } }); }
    catch (error) { return next(error); }
  });
  return router;
}
