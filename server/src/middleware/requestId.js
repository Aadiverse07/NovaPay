import { randomUUID } from 'node:crypto';

export function requestId(req, res, next) {
  const supplied = req.get('x-request-id');
  req.id = supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}
