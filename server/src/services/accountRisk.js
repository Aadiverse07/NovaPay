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

export function recentStepUp(auth = {}, now = Date.now(), maxAgeSeconds = 300) {
  const authTime = Number(auth.authTime || auth.auth_time || 0);
  const factors = Array.isArray(auth.amr) ? auth.amr.map((item) => typeof item === 'string' ? item : item?.method) : [];
  return Number.isFinite(authTime) && authTime > 0 && now / 1000 - authTime <= maxAgeSeconds && (auth.aal === 'aal2' || factors.includes('totp') || factors.includes('password'));
}

export function requiresSensitiveStepUp({ riskLevel = 'low', newDevice = false, hasRecentStepUp = false } = {}) {
  return !hasRecentStepUp && (riskLevel === 'medium' || riskLevel === 'high' || newDevice);
}
