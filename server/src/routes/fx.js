import { Router } from 'express';
import { z } from 'zod';
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
  router.get('/fx/convert', validateQuery(schema), async (req, res, next) => {
    try { return res.json(await fx.convert({ orgId: req.orgId, ...req.validatedQuery })); }
    catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json(structuredErrorBody(error.code || 'FX_FAILED', error.message));
      return next(error);
    }
  });
  return router;
}
