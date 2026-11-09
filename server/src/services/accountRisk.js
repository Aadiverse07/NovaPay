export const DEFAULT_RISK_WEIGHTS = Object.freeze({ newDevice: 30, newIpRange: 20, failedLogins: 20, recentCredentialChange: 25, sensitiveActionAfterNewDevice: 20, requestBurst: 15 });

export function scoreAccountRisk(signals = {}, weights = DEFAULT_RISK_WEIGHTS) {
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
  return { score, level: score >= 70 ? 'high' : score >= 35 ? 'medium' : 'low', reasons };
}

export function recentStepUp(auth = {}, now = Date.now(), maxAgeSeconds = 300) {
  const authTime = Number(auth.authTime || auth.auth_time || 0);
  const factors = Array.isArray(auth.amr) ? auth.amr.map((item) => typeof item === 'string' ? item : item?.method) : [];
  return Number.isFinite(authTime) && authTime > 0 && now / 1000 - authTime <= maxAgeSeconds && (auth.aal === 'aal2' || factors.includes('totp') || factors.includes('password'));
}

export function requiresSensitiveStepUp({ riskLevel = 'low', newDevice = false, hasRecentStepUp = false } = {}) {
  return !hasRecentStepUp && (riskLevel === 'medium' || riskLevel === 'high' || newDevice);
}
