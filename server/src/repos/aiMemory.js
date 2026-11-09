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

// Short-lived conversation state is process-local and keyed by both trusted
// identity fields. It is never persisted to the database or shared across users.
export class AIConversationMemoryRepo {
  constructor({ ttlMs = 30 * 60 * 1000, maxTurns = 20, maxText = 800, maxEntries = 1000, now = () => Date.now() } = {}) {
    this.rows = new Map(); this.ttlMs = ttlMs; this.maxTurns = maxTurns; this.maxText = maxText; this.maxEntries = maxEntries; this.now = now;
  }
  key(orgId, userId) { return `${orgId}:${userId}`; }
  async get(orgId, userId) {
    if (!orgId || !userId) return null;
    for (const [key, row] of this.rows) if (this.now() - row.updatedAt > this.ttlMs) this.rows.delete(key);
    const key = this.key(orgId, userId), row = this.rows.get(key);
    if (!row) return null;
    if (this.now() - row.updatedAt > this.ttlMs) { this.rows.delete(key); return null; }
    return structuredClone(row.value);
  }
  async save(orgId, userId, value) {
    if (!orgId || !userId) return null;
    const key = this.key(orgId, userId), prior = await this.get(orgId, userId);
    const incoming = (Array.isArray(value.turns) ? value.turns : []).filter((turn) => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.text === 'string').map((turn) => ({ role: turn.role, text: turn.text.slice(0, this.maxText) }));
    const turns = [...(prior?.turns || []), ...incoming].slice(-this.maxTurns);
    const next = { ...value, turns };
    if (!this.rows.has(key) && this.rows.size >= this.maxEntries) this.rows.delete(this.rows.keys().next().value);
    this.rows.set(key, { value: structuredClone(next), updatedAt: this.now() });
    return structuredClone(next);
  }
  async clear(orgId, userId) { return this.rows.delete(this.key(orgId, userId)); }
}

export class MemoryNotificationsRepo {
  constructor() { this.rows = new Map(); this.sequence = 0; }
  key(orgId, id) { return `${orgId}:${id}`; }
  addForAnomaly(orgId, anomaly) {
    const id = `NTF-${++this.sequence}`;
    const row = { id, orgId, anomalyId: anomaly.id, rule: anomaly.rule, severity: anomaly.severity, evidenceIds: anomaly.evidenceIds, status: 'unread', createdAt: anomaly.createdAt };
    this.rows.set(this.key(orgId, id), row);
    return row;
  }
  addSupport(orgId, ticketId, recipientUserId, rule = 'support_ticket_update', ticketNumber = null, now = new Date()) {
    const id = `NTF-${++this.sequence}`;
    const row = { id, orgId, recipientUserId: recipientUserId || null, anomalyId: null, rule, severity: 'info', evidenceIds: [`support_ticket:${ticketId}`, ...(ticketNumber?[`ticket_number:${ticketNumber}`]:[])], status: 'unread', createdAt: now.toISOString() };
    this.rows.set(this.key(orgId, id), row);
    return row;
  }
  addSecurity(orgId,recipientUserId,loginEventId,risk,now=new Date()) { const id=`NTF-${++this.sequence}`,row={id,orgId,recipientUserId,anomalyId:null,rule:'security_new_device',severity:risk.level==='high'?'high':'warning',evidenceIds:[`login_event:${loginEventId}`],status:'unread',createdAt:now.toISOString(),metadata:{riskLevel:risk.level,score:risk.score,reasons:risk.reasons}};this.rows.set(this.key(orgId,id),row);return row; }
  async list(orgId, userId, options = {}) {
    if(userId&&typeof userId==='object'){options=userId;userId=null}
    const {status,limit=50,offset=0}=options;
    return [...this.rows.values()].filter((row) => row.orgId === orgId && (!row.recipientUserId||row.recipientUserId===userId) && (!status || row.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(offset, offset + limit);
  }
  async setStatus(orgId, id, status, userId, now = new Date()) {
    const row = this.rows.get(this.key(orgId, id));
    if (!row||row.recipientUserId&&row.recipientUserId!==userId) return null;
    row.status = status;
    if (status === 'read') row.readAt = now.toISOString();
    if (status === 'dismissed') row.dismissedAt = now.toISOString();
    return row;
  }
}

export class MemoryAnomaliesRepo {
  constructor(notifications) { this.rows = new Map(); this.sequence = 0; this.notifications = notifications; }
  key(orgId, dedupeKey) { return `${orgId}:${dedupeKey}`; }
  async record(orgId, finding, now = new Date()) {
    const key = this.key(orgId, finding.dedupeKey);
    const existing = this.rows.get(key);
    if (existing) return { anomaly: existing, inserted: false };
    const anomaly = { id: `ANM-${++this.sequence}`, orgId, ...finding, createdAt: now.toISOString() };
    this.rows.set(key, anomaly);
    this.notifications.addForAnomaly(orgId, anomaly);
    return { anomaly, inserted: true };
  }
  async list(orgId, { limit = 100, offset = 0 } = {}) {
    return [...this.rows.values()].filter((row) => row.orgId === orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(offset, offset + limit);
  }
}

export function makeMemoryAIVersion(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
