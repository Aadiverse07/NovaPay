export class OrdersRepo {
  constructor() { this.byId = new Map(); this.byRequest = new Map(); }
  get(id) { return this.byId.get(id); }
  byRequestKey(key) { return this.byRequest.get(key); }
  save(order) { this.byId.set(order.id, order); this.byRequest.set(order.requestKey, order); return order; }
}

export class CapturesRepo {
  constructor() { this.items = []; this.refunds = new Map(); this.locks = new Set(); }
  all() { return this.items; }
  get(id) { return this.items.find((capture) => capture.id === id); }
  add(capture) { if (!this.get(capture.id)) this.items.unshift(capture); return capture; }
  refund(approvalId) { return this.refunds.get(approvalId); }
  saveRefund(approvalId, result) { this.refunds.set(approvalId, result); }
  isLocked(approvalId) { return this.locks.has(approvalId); }
  lock(approvalId) { this.locks.add(approvalId); }
  unlock(approvalId) { this.locks.delete(approvalId); }
}

export class ApprovalsRepo {
  constructor() { this.items = new Map(); }
  get(id) { return this.items.get(id); }
  save(id, registration) { this.items.set(id, registration); return registration; }
}

export class EventsRepo {
  constructor() { this.events = []; this.calls = []; }
  addEvent(event) { this.events.unshift(event); this.events.length = Math.min(this.events.length, 30); }
  addCall(call) { this.calls.unshift(call); this.calls.length = Math.min(this.calls.length, 30); }
  snapshot() { return { events: this.events, calls: this.calls }; }
}

export function createRepositories() {
  return { orders: new OrdersRepo(), captures: new CapturesRepo(), approvals: new ApprovalsRepo(), events: new EventsRepo() };
}
