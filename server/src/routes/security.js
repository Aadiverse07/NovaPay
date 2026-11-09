import { Router } from 'express';
import { z } from 'zod';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { recordSecuritySession } from '../services/security.js';

const schema = z.object({ text: z.string().min(1).max(5000) }).strict();
export function inspectSuspiciousMessage(text) {
  const value = String(text || '');
  const reasons = [];
  if (/\b(immediately|urgent|act now|within \d+ hours?|account will be (?:closed|suspended)|final warning)\b/i.test(value)) reasons.push('The message uses urgency or threatens account access.');
  const urls = value.match(/https?:\/\/[^\s<>()"']+/gi) || [];
  if (urls.some((url) => { try { const host = new URL(url).hostname.toLowerCase(); return host !== 'paypal.com' && !host.endsWith('.paypal.com'); } catch { return true; } })) reasons.push('The message includes a link outside the official paypal.com domain.');
  if (/\b(password|passcode|one[- ]time (?:password|code)|otp|verification code)\b/i.test(value) && /\b(send|share|reply|provide|enter|tell us)\b/i.test(value)) reasons.push('The message asks you to share a password or one-time code.');
  return { suspicious: reasons.length > 0, reasons, notice: 'This is a heuristic check, not a guarantee.' };
}

const sessionSchema = z.object({ deviceId: z.string().uuid() }).strict();
const stepUpSchema = z.discriminatedUnion('method',[
  z.object({method:z.literal('password'),password:z.string().min(1).max(256),deviceId:z.string().uuid()}).strict(),
  z.object({method:z.literal('email_otp'),code:z.string().regex(/^\d{6,8}$/),deviceId:z.string().uuid()}).strict(),
]);
export function securityRoutes({ config = {}, identity, repos } = {}) {
  const router = Router();
  router.post('/security/session-start', async (req,res,next) => {
    const parsed=sessionSchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','A valid device ID is required.'));
    try { return res.status(201).json(await recordSecuritySession({req,repos,config,identity})); }
    catch(error){return next(error)}
  });
  router.post('/security/step-up',async(req,res,next)=>{
    const parsed=stepUpSchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Re-authentication details are invalid.'));
    const {method,deviceId}=parsed.data;
    try{
      const device=await repos.security.getDevice(req.orgId,req.user.id,deviceId);
      if(!device)return res.status(403).json(structuredErrorBody('DEVICE_SESSION_REQUIRED','This device session is not registered. Sign in again and retry.'));
      const verifiedUserId=method==='password'
        ? await identity?.verifyReauthPassword?.(req.user.email,parsed.data.password)
        : await identity?.verifyStepUpEmailOtp?.(req.user.email,parsed.data.code);
      if(verifiedUserId!==req.user.id){await auditApiAction(identity,req,{action:'security.step_up_failed',entity:'user',entityId:req.user.id,metadata:{method}});return res.status(403).json(structuredErrorBody('STEP_UP_INVALID','Password or email code could not be verified.'))}
      const now=new Date(),expiresAt=new Date(now.getTime()+Number(config.STEP_UP_TTL_MINUTES||10)*60000);
      const grant=await repos.security.grantStepUp({org_id:req.orgId,user_id:req.user.id,device_id:deviceId,granted_at:now.toISOString(),expires_at:expiresAt.toISOString()});
      await auditApiAction(identity,req,{action:'security.step_up_granted',entity:'step_up_grant',entityId:grant?.id||null,metadata:{method,expiresAt:expiresAt.toISOString()}});
      return res.json({granted:true,expiresAt:expiresAt.toISOString()});
    }catch(error){return next(error)}
  });
  router.post('/security/step-up/otp',async(req,res,next)=>{
    try{
      const email=req.user.email;
      if(!email)return res.status(400).json(structuredErrorBody('STEP_UP_EMAIL_UNAVAILABLE','A verified email address is not available.'));
      const result=await identity?.sendStepUpOtp?.(email);
      if(!result)return res.status(503).json(structuredErrorBody('STEP_UP_OTP_UNAVAILABLE','An email code could not be sent. Try again later.'));
      await auditApiAction(identity,req,{action:'security.step_up_otp_sent',entity:'user',entityId:req.user.id});
      return res.json({sent:true,message:'A re-authentication code was sent to your account email.'});
    }catch(error){return next(error)}
  });
  router.post('/security/check-message', (req,res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Provide a message of up to 5,000 characters.'));
    return res.json(inspectSuspiciousMessage(parsed.data.text));
  });
  router.post('/security/csp-report', (_req,res) => res.status(204).end());
  return router;
}
