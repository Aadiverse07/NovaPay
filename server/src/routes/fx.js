import { Router } from 'express';
import { z } from 'zod';
import { validateQuery } from '../middleware/validate.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';

const schema = z.object({
  amount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
  base: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  quote: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
}).strict();

export function fxRoutes({ fx }) {
  const router = Router();
  router.get('/fx/convert', validateQuery(schema), async (req, res, next) => {
    try { return res.json(await fx.convert({ orgId: req.orgId, ...req.validatedQuery })); }
    catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json(structuredErrorBody(error.code || 'FX_FAILED', error.message));
      return next(error);
    }
  });
  return router;
}
