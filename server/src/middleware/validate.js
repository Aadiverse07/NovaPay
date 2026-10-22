import { structuredErrorBody } from './errorResponses.js';

export function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR', 'The request body is invalid.'));
    req.body = parsed.data;
    return next();
  };
}
