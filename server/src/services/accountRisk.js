import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export function scoreAccountRisk(signals = {}, config = {}) {
  const weights = {
    newDevice: Number(config.SECURITY_RISK_WEIGHT_NEW_DEVICE ?? config.newDevice ?? 30),
    newIpRange: Number(config.SECURITY_RISK_WEIGHT_NEW_NETWORK ?? config.newIpRange ?? 20),
    failedLogins: Number(config.SECURITY_RISK_WEIGHT_FAILED_LOGINS ?? config.failedLogins ?? 20),
    recentCredentialChange: Number(config.SECURITY_RISK_WEIGHT_CREDENTIAL_CHANGE ?? config.recentCredentialChange ?? 25),
    sensitiveActionAfterNewDevice: Number(config.SECURITY_RISK_WEIGHT_SENSITIVE_ACTION ?? config.sensitiveActionAfterNewDevice ?? 20),
    requestBurst: Number(config.SECURITY_RISK_WEIGHT_REQUEST_BURST ?? config.requestBurst ?? 15),
  };
  const medium = Number(config.SECURITY_RISK_MEDIUM_THRESHOLD ?? config.mediumThreshold ?? 35);
  const high = Number(config.SECURITY_RISK_HIGH_THRESHOLD ?? config.highThreshold ?? 70);
  const reasons = [];
  const checks = [
    ['newDevice','A device not seen before signed in.'],
    ['newIpRange','The sign-in came from a new network range.'],
    ['failedLogins','Several failed sign-ins happened before this successful sign-in.'],
    ['recentCredentialChange','The sign-in followed a recent password reset or email change.'],
    ['sensitiveActionAfterNewDevice','A sensitive action followed a sign-in from a new device.'],
    ['requestBurst','The account made an unusual burst of requests.'],
  ];
  let score = 0;
  for (const [key, explanation] of checks) if (signals[key]) { score += Number(weights[key] || 0); reasons.push(explanation); }
  score = Math.min(100, Math.max(0, Math.round(score)));
  return { score, level: score >= high ? 'high' : score >= medium ? 'medium' : 'low', reasons };
}

function expandIpv6(ip) {
  const normalized = ip.toLowerCase().split('%')[0];
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const octets = normalized.slice(lastColon + 1).split('.').map(Number);
    if (octets.length === 4 && octets.every(Number.isInteger)) {
      return expandIpv6(normalized.slice(0, lastColon) + ':' + ((octets[0] << 8) | octets[1]).toString(16) + ':' + ((octets[2] << 8) | octets[3]).toString(16));
    }
  }
  const [left, right = ''] = normalized.split('::');
  const l = left ? left.split(':') : [], r = right ? right.split(':') : [];
  const middle = Array(Math.max(0, 8 - l.length - r.length)).fill('0');
  return [...l, ...middle, ...r].map((group) => parseInt(group || '0', 16).toString(16).padStart(4, '0'));
}

export function networkPrefix(ipValue) {
  const ip = String(ipValue || '').trim().replace(/^\[|\]$/g, '').split('%')[0];
  if (ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4) return networkPrefix(ip.slice(7));
  const version = isIP(ip);
  if (version === 4) {
    const octets = ip.split('.').map(Number);
    const local = octets[0] === 10 || octets[0] === 127 || octets[0] === 0 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 169 && octets[1] === 254);
    return local ? { prefix: 'local', label: 'Local network' } : { prefix: `${octets[0]}.${octets[1]}.${octets[2]}.0/24`, label: `IPv4 network ${octets[0]}.${octets[1]}.${octets[2]}.0/24` };
  }
  if (version === 6) {
    const groups = expandIpv6(ip);
    const local = ip === '::1' || (parseInt(groups[0], 16) & 0xfe00) === 0xfc00 || (parseInt(groups[0], 16) & 0xffc0) === 0xfe80 || ip.startsWith('::ffff:127.') || ip.startsWith('::ffff:10.');
    if (local) return { prefix: 'local', label: 'Local network' };
    const prefix = `${groups[0]}:${groups[1]}:${groups[2]}::/48`;
    return { prefix, label: `IPv6 network ${prefix}` };
  }
  return { prefix: 'unknown', label: 'Unknown network' };
}

export function hashNetwork(ip, salt) {
  const network = networkPrefix(ip);
  return { ipHash: createHash('sha256').update(`${salt}:${network.prefix}`).digest('hex'), networkLabel: network.label, networkPrefix: network.prefix };
}

export function hashUserAgent(value, salt) {
  return createHash('sha256').update(`${salt}:${String(value || 'unknown').slice(0, 500)}`).digest('hex');
}

export function createRequestBurstTracker({ windowMs = 60000, threshold = 30, now = () => Date.now() } = {}) {
  const requests = new Map();
  return {
    hit(userId) {
      const at=now(), times=(requests.get(userId)||[]).filter((time)=>at-time<windowMs);
      times.push(at);requests.set(userId,times);
      return { count:times.length, burst:times.length>=threshold };
    },
  };
}

export async function computeAccountRisk({ repos, orgId, userId, config = {}, user = {}, requestBurst = false, sensitiveAction = false, now = new Date() }) {
  const [logins,failedLogins,devices]=await Promise.all([
    repos.security.listLogins(orgId,userId,{limit:50,offset:0}),
    repos.security.failedLoginCount?.(orgId,userId,Number(config.SECURITY_FAILED_LOGIN_WINDOW_MINUTES||15))||0,
    repos.security.listDevices(orgId,userId),
  ]);
  const latest=logins?.[0], reasons=Array.isArray(latest?.risk_reasons)?latest.risk_reasons:[];
  const newDevice=Boolean(latest&&reasons.some((reason)=>/device not seen before/i.test(reason)));
  const newIpRange=Boolean(latest&&reasons.some((reason)=>/new network/i.test(reason)));
  const updatedAt=Date.parse(user.updatedAt||'');
  const age=now.getTime()-updatedAt;
  const recentCredentialChange=Number.isFinite(age)&&age>=0&&age<Number(config.SECURITY_CREDENTIAL_CHANGE_WINDOW_MINUTES||30)*60000;
  const loginAt=Date.parse(latest?.occurred_at||'');
  const sensitiveActionAfterNewDevice=Boolean(sensitiveAction&&newDevice&&Number.isFinite(loginAt)&&now.getTime()-loginAt<=Number(config.SECURITY_SENSITIVE_AFTER_NEW_DEVICE_MINUTES||15)*60000);
  const risk=scoreAccountRisk({newDevice,newIpRange,failedLogins:Number(failedLogins)>0,recentCredentialChange,sensitiveActionAfterNewDevice,requestBurst},config);
  return {...risk,signals:{newDevice,newIpRange,failedLogins:Number(failedLogins)>0,recentCredentialChange,sensitiveActionAfterNewDevice,requestBurst},devicesKnown:devices?.length||0,sessionDeviceId:latest?.device_id||null};
}
