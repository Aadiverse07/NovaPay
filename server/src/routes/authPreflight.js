import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { loginAttemptKeys } from '../services/loginThrottle.js';

const domainsPath = fileURLToPath(new URL('../../config/disposable-email-domains.txt', import.meta.url));
const disposableDomains = new Set(readFileSync(domainsPath, 'utf8').split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter((line) => line && !line.startsWith('#')));
const policies = {
  signup: { windowMs: 60 * 60_000, email: 5, ip: 10 },
  resend: { windowMs: 60 * 60_000, email: 3, ip: 10 },
  verify: { windowMs: 15 * 60_000, email: 10, ip: 30 },
  recovery: { windowMs: 60 * 60_000, email: 3, ip: 10 },
  login: { windowMs: 15 * 60_000, email: 100, ip: 100 },
};

export function authPreflightRoutes({ now = Date.now, buckets = new Map(), repos, identity, config = {} } = {}) {
  const router = Router();
  router.get('/auth/preflight', async (req, res, next) => {
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
    if(flow==='login'&&repos?.security){
      const keys=loginAttemptKeys(email,req.ip||req.socket.remoteAddress,config.SECURITY_HASH_SALT||'');
      let locked;
      try{locked=await repos.security.loginLock(keys.accountHash,keys.ipHash)}catch(error){return next(error)}
      if(locked)return res.status(429).set('Retry-After',String(Math.max(1,Math.ceil((Date.parse(locked)-Date.now())/1000)))).json(structuredErrorBody('LOGIN_TEMPORARILY_UNAVAILABLE','Sign-in could not be completed. Wait a little and try again.'));
    }
    return res.json({ allowed: true });
  });
  router.post('/auth/login-attempt',async(req,res,next)=>{
    const parsed=z.object({email:z.string().email().max(254),success:z.boolean()}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Sign-in could not be completed.'));
    if(!repos?.security)return res.status(503).json(structuredErrorBody('AUTH_UNAVAILABLE','Sign-in could not be completed.'));
    try{
      let userId=null;
      if(parsed.data.success){
        const match=/^Bearer ([A-Za-z0-9._~-]+)$/.exec(req.get('authorization')||'');
        const user=match&&await identity?.verifyToken?.(match[1]);
        if(!user||String(user.email||'').trim().toLowerCase()!==parsed.data.email.trim().toLowerCase())return res.status(401).json(structuredErrorBody('AUTH_INVALID','Sign-in could not be completed.'));
        userId=user.id;
      }
      const keys=loginAttemptKeys(parsed.data.email,req.ip||req.socket.remoteAddress,config.SECURITY_HASH_SALT||'');
      const outcome=await repos.security.recordLoginAttempt({orgId:null,userId,...keys,success:parsed.data.success,config});
      if(outcome.locked){
        let prior=null;try{prior=await repos.security.loginIdentityForHash?.(keys.accountHash)}catch{}
        if(prior?.orgId&&prior?.userId){try{await identity?.audit?.({orgId:prior.orgId,actorId:prior.userId,action:'security.login_locked',entity:'login_attempt',entityId:null,metadata:{failureCount:outcome.failureCount,lockCount:outcome.lockCount},requestId:req.id})}catch{}}
      }
      return res.json({recorded:true,locked:Boolean(outcome.locked),message:outcome.locked?'Sign-in could not be completed. Wait a little and try again.':undefined});
    }catch(error){return next(error)}
  });
  return router;
}
