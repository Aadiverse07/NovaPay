import { Router } from 'express';
import { z } from 'zod';
import { structuredErrorBody } from '../middleware/errorResponses.js';
import { rbac } from '../middleware/auth.js';
import { recordSecuritySession } from '../services/security.js';
import { computeAccountRisk } from '../services/accountRisk.js';
import { accountLoginHash, loginAttemptKeys } from '../services/loginThrottle.js';
import { auditApiAction } from '../services/audit.js';

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
const visibleLogin = (row) => ({id:row.id,occurred_at:row.occurred_at,device_id:row.device_id,device_label:`Device …${String(row.device_id||'').slice(-6)}`,network_label:row.network_label||'Unknown network',success:Boolean(row.success),risk_score:Number(row.risk_score||0),risk_level:row.risk_level||'low',risk_reasons:Array.isArray(row.risk_reasons)?row.risk_reasons:[]});
export function securityRoutes({ config = {}, identity, repos } = {}) {
  const router = Router();
  router.get('/security/overview',async(req,res,next)=>{
    try{
      const [risk,devices,logins]=await Promise.all([computeAccountRisk({repos,orgId:req.orgId,userId:req.user.id,config,user:req.user,requestBurst:Boolean(req.securityRequestBurst?.burst)}),repos.security.listDevices(req.orgId,req.user.id),repos.security.listLogins(req.orgId,req.user.id,{limit:10,offset:0})]);
      const keys=loginAttemptKeys(req.user.email,req.ip||req.socket?.remoteAddress,config.SECURITY_HASH_SALT||'');
      const lockedUntil=await repos.security.loginLock(keys.accountHash,keys.ipHash);
      return res.json({risk:{score:risk.score,level:risk.level,reasons:risk.reasons},devices,logins:logins.map(visibleLogin),lockedUntil,role:req.orgRole});
    }catch(error){return next(error)}
  });
  router.get('/security/logins',async(req,res,next)=>{
    const parsed=z.object({limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(10000).default(0)}).safeParse(req.query);
    if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Login history pagination is invalid.'));
    try{return res.json({logins:(await repos.security.listLogins(req.orgId,req.user.id,parsed.data)).map(visibleLogin)})}catch(error){return next(error)}
  });
  router.get('/security/devices/:id',async(req,res,next)=>{
    const parsed=z.string().uuid().safeParse(req.params.id);if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','A valid device ID is required.'));
    try{const device=await repos.security.getDevice(req.orgId,req.user.id,parsed.data);return device?res.json({device}):res.status(404).json(structuredErrorBody('DEVICE_NOT_FOUND','That device was not found.'))}catch(error){return next(error)}
  });
  router.get('/security/devices',async(req,res,next)=>{try{return res.json({devices:await repos.security.listDevices(req.orgId,req.user.id)})}catch(error){return next(error)}});
  router.delete('/security/devices/:id',async(req,res,next)=>{
    const parsed=z.string().uuid().safeParse(req.params.id);if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','A valid device ID is required.'));
    try{const device=await repos.security.getDevice(req.orgId,req.user.id,parsed.data);if(!device)return res.status(404).json(structuredErrorBody('DEVICE_NOT_FOUND','That device was not found.'));await repos.security.deleteDevice(req.orgId,req.user.id,parsed.data);await auditApiAction(identity,req,{action:'security.device_removed',entity:'user_device',entityId:parsed.data});return res.json({removed:true})}catch(error){return next(error)}
  });
  router.get('/security/members',rbac(['owner','admin']),async(req,res,next)=>{try{const members=await repos.security.listOrgMembers(req.orgId);const rows=await Promise.all(members.map(async(member)=>({userId:member.user_id,role:member.role,lockedUntil:await repos.security.memberLock(req.orgId,member.user_id)})));return res.json({members:rows})}catch(error){return next(error)}});
  router.post('/security/members/:id/unlock',rbac(['owner','admin']),async(req,res,next)=>{
    const parsed=z.string().uuid().safeParse(req.params.id);if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','A valid member ID is required.'));
    try{
      const members=await repos.security.listOrgMembers(req.orgId);if(!members.some(member=>member.user_id===parsed.data))return res.status(404).json(structuredErrorBody('MEMBER_NOT_FOUND','That member was not found in this workspace.'));
      const user=await identity?.getUserById?.(parsed.data);if(!user?.email)return res.status(404).json(structuredErrorBody('MEMBER_EMAIL_UNAVAILABLE','The member account could not be resolved.'));
      await repos.security.clearAccountLock(accountLoginHash(user.email,config.SECURITY_HASH_SALT||''));
      await auditApiAction(identity,req,{action:'security.login_unlocked',entity:'user',entityId:parsed.data,metadata:{memberRole:members.find(member=>member.user_id===parsed.data)?.role}});
      return res.json({unlocked:true,userId:parsed.data});
    }catch(error){return next(error)}
  });
  router.post('/security/session-start', async (req,res,next) => {
    const parsed=sessionSchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','A valid device ID is required.'));
    try { return res.status(201).json(await recordSecuritySession({req,repos,config,identity})); }
    catch(error){return next(error)}
  });
  router.post('/security/step-up',async(req,res,next)=>{
    const parsed=stepUpSchema.safeParse(req.body);
    if(!parsed.success){await auditApiAction(identity,req,{action:'security.step_up_failed',entity:'user',entityId:req.user.id,metadata:{reason:'invalid_request'}});return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Re-authentication details are invalid.'))}
    const {method,deviceId}=parsed.data;
    try{
      const device=await repos.security.getDevice(req.orgId,req.user.id,deviceId);
      if(!device){await auditApiAction(identity,req,{action:'security.step_up_failed',entity:'user',entityId:req.user.id,metadata:{reason:'device_session_missing'}});return res.status(403).json(structuredErrorBody('DEVICE_SESSION_REQUIRED','This device session is not registered. Sign in again and retry.'))}
      const verifiedUserId=method==='password'
        ? await identity?.verifyReauthPassword?.(req.user.email,parsed.data.password)
        : await identity?.verifyStepUpEmailOtp?.(req.user.email,parsed.data.code);
      if(verifiedUserId!==req.user.id){await auditApiAction(identity,req,{action:'security.step_up_failed',entity:'user',entityId:req.user.id,metadata:{method}});return res.status(403).json(structuredErrorBody('STEP_UP_INVALID','Password or email code could not be verified.'))}
      const now=new Date(),expiresAt=new Date(now.getTime()+Number(config.STEP_UP_TTL_MINUTES||10)*60000);
      const grant=await repos.security.grantStepUp({org_id:req.orgId,user_id:req.user.id,device_id:deviceId,granted_at:now.toISOString(),expires_at:expiresAt.toISOString()});
      await auditApiAction(identity,req,{action:'security.step_up_granted',entity:'step_up_grant',entityId:grant?.id||null,metadata:{method,expiresAt:expiresAt.toISOString()}});
      return res.json({granted:true,expiresAt:expiresAt.toISOString()});
    }catch(error){await auditApiAction(identity,req,{action:'security.step_up_failed',entity:'user',entityId:req.user.id,metadata:{reason:'verification_unavailable'}}).catch(()=>{});return next(error)}
  });
  router.post('/security/step-up/otp',async(req,res,next)=>{
    try{
      const email=req.user.email;
      if(!email){await auditApiAction(identity,req,{action:'security.step_up_failed',entity:'user',entityId:req.user.id,metadata:{reason:'email_unavailable'}});return res.status(400).json(structuredErrorBody('STEP_UP_EMAIL_UNAVAILABLE','A verified email address is not available.'))}
      const result=await identity?.sendStepUpOtp?.(email);
      if(!result){await auditApiAction(identity,req,{action:'security.step_up_failed',entity:'user',entityId:req.user.id,metadata:{reason:'email_code_unavailable'}});return res.status(503).json(structuredErrorBody('STEP_UP_OTP_UNAVAILABLE','An email code could not be sent. Try again later.'))}
      await auditApiAction(identity,req,{action:'security.step_up_otp_sent',entity:'user',entityId:req.user.id});
      return res.json({sent:true,message:'A re-authentication code was sent to your account email.'});
    }catch(error){await auditApiAction(identity,req,{action:'security.step_up_failed',entity:'user',entityId:req.user.id,metadata:{reason:'email_code_unavailable'}}).catch(()=>{});return next(error)}
  });
  router.post('/security/check-message', (req,res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(structuredErrorBody('VALIDATION_ERROR','Provide a message of up to 5,000 characters.'));
    return res.json(inspectSuspiciousMessage(parsed.data.text));
  });
  router.post('/security/csp-report', (_req,res) => res.status(204).end());
  return router;
}
