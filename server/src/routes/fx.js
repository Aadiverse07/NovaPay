import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { validateQuery } from '../middleware/validate.js';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { currencyMinorUnitExponent } from '../ai/money-units.js';

const schema = z.object({
  amount: z.string().regex(/^\d{1,12}(?:\.\d{1,6})?$/),
  base: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  quote: z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
}).strict().superRefine((value, context) => {
  const exponent = currencyMinorUnitExponent(value.base);
  const fractionLength = value.amount.split('.')[1]?.length || 0;
  if (exponent === null || fractionLength > exponent) context.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Amount precision exceeds the base currency minor units.' });
});

export function fxRoutes({ fx }) {
  const router = Router();
  router.use('/fx', rateLimit({ windowMs: 60 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (req) => `${req.user.id}:${req.orgId}`, message: { error: { code: 'FX_RATE_LIMITED', message: 'Currency requests are temporarily rate limited.' } } }));
  router.get('/fx/currencies', async (_req, res, next) => {
    try { return res.json({ currencies: await fx.currencies(), cachedForSeconds: 21600 }); }
    catch (error) { return res.status(error.statusCode || 503).json(structuredErrorBody(error.code || 'FX_CURRENCIES_UNAVAILABLE', error.message || 'Currency providers are unavailable.')); }
  });
  router.get('/fx/convert', validateQuery(schema), async (req, res, next) => {
    try { return res.json(await fx.convert({ orgId: req.orgId, ...req.validatedQuery })); }
    catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json(structuredErrorBody(error.code || 'FX_FAILED', error.message));
      return next(error);
    }
  });
  return router;
}
