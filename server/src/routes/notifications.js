import { Router } from 'express';
import { z } from 'zod';
import { rbac } from '../middleware/auth.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  status: z.enum(['unread', 'read', 'dismissed']).optional(),
}).strict();

export function notificationRoutes({ repos, runAnomalyScan }) {
  const router = Router();
  router.get('/notifications', async (req, res, next) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Notification filters are invalid.'));
    try {
      const notifications = await repos.notifications.list(req.orgId, parsed.data);
      return res.json({ notifications, page: { limit: parsed.data.limit, offset: parsed.data.offset } });
    } catch (error) { return next(error); }
  });

  router.post('/notifications/:id/:action', async (req, res, next) => {
    const id = z.string().min(1).max(100).safeParse(req.params.id);
    const action = z.enum(['read', 'dismiss']).safeParse(req.params.action);
    if (!id.success || !action.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'Notification action is invalid.'));
    try {
      const notification = await repos.notifications.setStatus(req.orgId, id.data, action.data === 'read' ? 'read' : 'dismissed');
      if (!notification) return res.status(404).json(structuredErrorBody('NOTIFICATION_NOT_FOUND', 'The notification was not found.'));
      return res.json({ notification });
    } catch (error) { return next(error); }
  });

  router.post('/anomalies/run', rbac(['owner', 'admin', 'accountant']), async (req, res, next) => {
    try { return res.json(await runAnomalyScan(req.orgId)); }
    catch (error) { return next(error); }
  });
  return router;
}
