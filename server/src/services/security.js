import { hashNetwork, hashUserAgent, scoreAccountRisk } from './accountRisk.js';
import { auditApiAction } from './audit.js';

export async function recordSecuritySession({ req, repos, config, identity, now = new Date() }) {
  const deviceId=req.body.deviceId, userId=req.user.id, orgId=req.orgId, at=now.toISOString();
  const priorCount=await repos.security.loginCount(orgId,userId);
  const knownDevice=await repos.security.getDevice(orgId,userId,deviceId);
  const network=hashNetwork(req.ip||req.socket?.remoteAddress||'',config.SECURITY_HASH_SALT);
  const newDevice=priorCount>0&&!knownDevice;
  const newNetwork=priorCount>0&&!await repos.security.hasNetwork(orgId,userId,network.ipHash)&&network.networkPrefix!=='local'&&network.networkPrefix!=='unknown';
  const updatedAt=Date.parse(req.user.updatedAt||'');
  const credentialWindow=Number(config.SECURITY_CREDENTIAL_CHANGE_WINDOW_MINUTES||30)*60000;
  const recentCredentialChange=Number.isFinite(updatedAt)&&now.getTime()-updatedAt>=0&&now.getTime()-updatedAt<credentialWindow;
  const risk=scoreAccountRisk({newDevice,newIpRange:newNetwork,recentCredentialChange},config);
  const row=await repos.security.recordLogin({org_id:orgId,user_id:userId,occurred_at:at,ip_hash:network.ipHash,user_agent_hash:hashUserAgent(req.get('user-agent')||'',config.SECURITY_HASH_SALT),device_id:deviceId,success:true,failure_reason:null,risk_score:risk.score,risk_level:risk.level,risk_reasons:risk.reasons,network_label:network.networkLabel});
  await repos.security.upsertDevice({org_id:orgId,user_id:userId,device_id:deviceId,last_seen:at,trusted:Boolean(knownDevice?.trusted)});
  await auditApiAction(identity,req,{action:'security.session_started',entity:'login_event',entityId:row?.id||null,metadata:{riskLevel:risk.level,riskScore:risk.score,newDevice}});
  return {loginEventId:row?.id||null,risk,newDevice,networkLabel:network.networkLabel};
}
