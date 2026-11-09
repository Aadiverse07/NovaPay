export class LoginThrottle {
  constructor({ threshold = 5, baseDelayMs = 1000, maxDelayMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
    this.threshold = threshold; this.baseDelayMs = baseDelayMs; this.maxDelayMs = maxDelayMs; this.now = now; this.accounts = new Map(); this.ips = new Map();
  }
  waitMs(accountKey, ipKey) { return Math.max(this.delay(this.accounts.get(accountKey)), this.delay(this.ips.get(ipKey))); }
  delay(state) { if (!state || state.failures < this.threshold || state.lockedUntil <= this.now()) return 0; return state.lockedUntil - this.now(); }
  fail(accountKey, ipKey) {
    for (const [map,key] of [[this.accounts,accountKey],[this.ips,ipKey]]) {
      const old = map.get(key) || { failures: 0, lockedUntil: 0 };
      old.failures += 1;
      if (old.failures >= this.threshold) old.lockedUntil = this.now() + Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** Math.min(10, old.failures - this.threshold));
      map.set(key, old);
    }
    return { code: 'LOGIN_TEMPORARILY_UNAVAILABLE', message: 'Sign-in could not be completed. Wait a little and try again.' };
  }
  success(accountKey, ipKey) { this.accounts.delete(accountKey); this.ips.delete(ipKey); }
}
import { createHash } from 'node:crypto';
import { hashNetwork } from './accountRisk.js';

export function loginAttemptKeys(email, ip, salt) {
  const normalized=String(email||'').trim().toLowerCase();
  return {
    accountHash:createHash('sha256').update(`${salt}:account:${normalized}`).digest('hex'),
    ...hashNetwork(ip,salt),
  };
}

export function accountLoginHash(email,salt) {
  return createHash('sha256').update(`${salt}:account:${String(email||'').trim().toLowerCase()}`).digest('hex');
}
