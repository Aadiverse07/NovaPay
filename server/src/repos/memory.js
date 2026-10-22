export class OrdersRepo {
  constructor() { this.byId = new Map(); this.byRequest = new Map(); }
  key(orgId, id) { return `${orgId}:${id}`; }
  get(id, orgId) { return this.byId.get(this.key(orgId, id)); }
  byRequestKey(key, orgId) { return this.byRequest.get(this.key(orgId, key)); }
  save(order, orgId) { order.orgId = orgId; this.byId.set(this.key(orgId, order.id), order); this.byRequest.set(this.key(orgId, order.requestKey), order); return order; }
}

export class CapturesRepo {
  constructor() { this.items = []; this.refunds = new Map(); this.locks = new Set(); }
  key(orgId, id) { return `${orgId}:${id}`; }
  all(orgId) { return this.items.filter((capture) => capture.orgId === orgId); }
  get(id, orgId) { return this.items.find((capture) => capture.id === id && capture.orgId === orgId); }
  add(capture, orgId) { capture.orgId = orgId; if (!this.get(capture.id, orgId)) this.items.unshift(capture); return capture; }
  refund(approvalId, orgId) { return this.refunds.get(this.key(orgId, approvalId)); }
  saveRefund(approvalId, result, orgId) { this.refunds.set(this.key(orgId, approvalId), result); }
  isLocked(approvalId, orgId) { return this.locks.has(this.key(orgId, approvalId)); }
  lock(approvalId, orgId) { this.locks.add(this.key(orgId, approvalId)); }
  unlock(approvalId, orgId) { this.locks.delete(this.key(orgId, approvalId)); }
}

export class ApprovalsRepo {
  constructor() { this.items = new Map(); }
  key(orgId, id) { return `${orgId}:${id}`; }
  get(id, orgId) { return this.items.get(this.key(orgId, id)); }
  save(id, registration, orgId) { registration.orgId = orgId; this.items.set(this.key(orgId, id), registration); return registration; }
}

export class EventsRepo {
  constructor() { this.events = []; this.calls = []; }
  addEvent(event) { this.events.unshift(event); this.events.length = Math.min(this.events.length, 30); }
  addCall(call) { this.calls.unshift(call); this.calls.length = Math.min(this.calls.length, 30); }
  snapshot(orgId) { return { events: this.events.filter((event) => event.orgId === orgId), calls: this.calls.filter((call) => call.orgId === orgId) }; }
}

export function createRepositories() {
  return { orders: new OrdersRepo(), captures: new CapturesRepo(), approvals: new ApprovalsRepo(), events: new EventsRepo() };
}
