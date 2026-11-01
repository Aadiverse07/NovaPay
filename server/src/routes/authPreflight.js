import { Router } from 'express';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { structuredErrorBody } from '../middleware/errorResponses.js';

const domainsPath = fileURLToPath(new URL('../../config/disposable-email-domains.txt', import.meta.url));
const disposableDomains = new Set(readFileSync(domainsPath, 'utf8').split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter((line) => line && !line.startsWith('#')));
const policies = {
  signup: { windowMs: 60 * 60_000, email: 5, ip: 10 },
  resend: { windowMs: 60 * 60_000, email: 3, ip: 10 },
  verify: { windowMs: 15 * 60_000, email: 10, ip: 30 },
  recovery: { windowMs: 60 * 60_000, email: 3, ip: 10 },
};

export function authPreflightRoutes({ now = Date.now, buckets = new Map() } = {}) {
  const router = Router();
  router.get('/auth/preflight', (req, res) => {
    const flow = String(req.query.flow || '');
    const email = String(req.query.email || '').trim().toLowerCase();
    const domain = email.split('@')[1] || '';
    if (!policies[flow]) return res.status(400).json(structuredErrorBody('AUTH_FLOW_INVALID', 'Choose a supported email verification action.'));
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json(structuredErrorBody('EMAIL_INVALID', 'Enter a valid email address.'));
    if (flow === 'signup' && disposableDomains.has(domain)) return res.status(422).json(structuredErrorBody('DISPOSABLE_EMAIL_BLOCKED', 'Use a non-disposable email address to create an account.'));
    const policy = policies[flow];
    const at = now();
    const emailHash = createHash('sha256').update(email).digest('hex');
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    const keys = [[`${flow}:email:${emailHash}`, policy.email], [`${flow}:ip:${ip}`, policy.ip]];
    let waitMs = 0;
    for (const [key, limit] of keys) {
      let item = buckets.get(key);
      if (!item || at - item.startedAt >= policy.windowMs) item = { startedAt: at, count: 0 };
      if (item.count >= limit) waitMs = Math.max(waitMs, policy.windowMs - (at - item.startedAt));
      item.count += 1;
      buckets.set(key, item);
    }
    if (waitMs) return res.status(429).set('Retry-After', String(Math.max(1, Math.ceil(waitMs / 1000)))).json(structuredErrorBody('AUTH_RATE_LIMITED', 'Too many email verification attempts. Wait before trying again.'));
    return res.json({ allowed: true });
  });
  return router;
}
