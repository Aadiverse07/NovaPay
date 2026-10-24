import { createHash } from 'node:crypto';

const utcDay = (value) => new Date(value).toISOString().slice(0, 10);

export class AIUsageRepo {
  constructor() { this.rows = []; this.sequence = 0; }

  async reserve({ orgId, userId, route, model, inputTokens, userLimit, orgLimit, now = new Date() }) {
    const day = utcDay(now);
    const dayRows = this.rows.filter((row) => row.day === day && !row.cacheHit);
    const userCount = dayRows.filter((row) => row.orgId === orgId && row.userId === userId).length;
    const orgCount = dayRows.filter((row) => row.orgId === orgId).length;
    if (userCount >= userLimit) return { allowed: false, reason: 'user_limit' };
    if (orgCount >= orgLimit) return { allowed: false, reason: 'org_limit' };
    const row = { id: `AIU-${++this.sequence}`, orgId, userId, route, model, inputTokens, outputTokens: 0, latencyMs: 0, costEstimate: 0, cacheHit: false, status: 'reserved', day, createdAt: new Date(now).toISOString() };
    this.rows.push(row);
    return { allowed: true, usageId: row.id };
  }

  async complete(id, { inputTokens, outputTokens = 0, latencyMs = 0, model, status = 'completed' } = {}) {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return false;
    Object.assign(row, { ...(inputTokens !== undefined ? { inputTokens } : {}), outputTokens, latencyMs, ...(model ? { model } : {}), status, costEstimate: 0 });
    return true;
  }

  async recordCacheHit({ orgId, userId, route, model = null, now = new Date() }) {
    const row = { id: `AIU-${++this.sequence}`, orgId, userId, route, model, inputTokens: 0, outputTokens: 0, latencyMs: 0, costEstimate: 0, cacheHit: true, status: 'cache_hit', day: utcDay(now), createdAt: new Date(now).toISOString() };
    this.rows.push(row);
    return row;
  }
}

export class AICacheRepo {
  constructor() { this.rows = new Map(); }
  key(orgId, key) { return `${orgId}:${key}`; }
  async get(orgId, cacheKey, now = new Date()) {
    const key = this.key(orgId, cacheKey);
    const row = this.rows.get(key);
    if (!row) return null;
    if (Date.parse(row.expiresAt) <= new Date(now).getTime()) { this.rows.delete(key); return null; }
    return row;
  }
  async put(row) {
    this.rows.set(this.key(row.orgId, row.cacheKey), row);
    return row;
  }
}

export function makeMemoryAIVersion(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
