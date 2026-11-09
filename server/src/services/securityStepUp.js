import { computeAccountRisk } from './accountRisk.js';
import { auditApiAction } from './audit.js';

export async function checkSensitiveAction({ req, repos, identity, config, action, now = new Date() }) {
  const risk=await computeAccountRisk({repos,orgId:req.orgId,userId:req.user.id,config,user:req.user,requestBurst:Boolean(req.securityRequestBurst?.burst),sensitiveAction:true,now});
  const deviceId=risk.sessionDeviceId;
  const device=deviceId?await repos.security.getDevice(req.orgId,req.user.id,deviceId):null;
  const required=(action==='refund'&&Boolean(config.STEP_UP_ALWAYS_FOR_REFUNDS))||risk.level==='medium'||risk.level==='high'||(risk.signals.newDevice&&!device?.trusted);
  if(!required)return {required:false,risk,deviceId};
  const valid=Boolean(deviceId)&&await repos.security.hasStepUpGrant(req.orgId,req.user.id,deviceId,now);
  if(valid)return {required:true,valid:true,risk,deviceId};
  await auditApiAction(identity,req,{action:'security.step_up_blocked',entity:'sensitive_action',entityId:action,metadata:{riskLevel:risk.level,riskScore:risk.score,reasons:risk.reasons}});
  return {required:true,valid:false,risk,deviceId,status:403,body:{error:{code:'STEP_UP_REQUIRED',message:`Confirm it's you before ${action==='refund'?'approving this refund':'sending this invoice'}.`},riskLevel:risk.level,reasons:risk.reasons}};
}
