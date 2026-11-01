import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';
import { buildInvoiceDraft } from '../src/services/invoices.js';

const org = 'a0000000-0000-4000-8000-000000000001';
const orgB = 'b0000000-0000-4000-8000-000000000002';
const users = new Map([
  ['owner-token', { id: 'user-owner', role: 'owner', org }],
  ['accountant-token', { id: 'user-accountant', role: 'accountant', org }],
  ['viewer-token', { id: 'user-viewer', role: 'viewer', org }],
  ['other-token', { id: 'user-other', role: 'owner', org: orgB }],
]);
const identity = {
  async verifyToken(token) { return users.get(token) ? { id: users.get(token).id } : null; },
  async membership(userId, orgId) { const user = [...users.values()].find((item) => item.id === userId); return user?.org === orgId ? { role: user.role, org_id: orgId } : null; },
};
const config = { PORT: 3000, STATIC_DIR: process.cwd(), hasPayPal: false, hasSupabase: true, hasAI: false, PAYPAL_INVOICE_SEND_MODE: 'live' };
const input = { invoiceNumber: 'INV-TEST-1', customerName: 'Sample Buyer', customerEmail: 'buyer@example.com', currency: 'INR', issueDate: '2026-11-01', dueDate: '2026-11-15', notes: 'Test', lines: [{ description: 'Work', quantity: '2', unitPrice: '50.00', taxRate: '0.1' }] };

function fakeRepos() {
  const repos = createRepositories(), rows = new Map(), keys = new Map(), audit = [];
  repos.invoices = {
    async list(scope) { return [...rows.values()].filter((row) => row.orgId === scope); },
    async get(scope, id) { const row = rows.get(id); return row?.orgId === scope ? row : null; },
    async createDraftIdempotent(scope, key, invoice, lines, actorId) {
      if (keys.has(`${scope}:${key}`)) return { invoice: await this.get(scope, keys.get(`${scope}:${key}`).id), replayed: true };
      const id = randomUUID(), row = { ...invoice, id, orgId: scope, state: 'draft', lines, subtotal: invoice.subtotal_minor / 100, tax: invoice.tax_minor / 100, total: invoice.total_minor / 100, createdBy: actorId };
      rows.set(id, row); keys.set(`${scope}:${key}`, { id, action: 'create' }); audit.push({ action: 'invoice.created', id }); return { invoice: row, replayed: false };
    },
    async updateDraft(scope, id, invoice, lines) { const row = await this.get(scope, id); Object.assign(row, invoice, { lines, subtotal: invoice.subtotal_minor / 100, tax: invoice.tax_minor / 100, total: invoice.total_minor / 100 }); audit.push({ action: 'invoice.updated', id }); return row; },
    async setState(scope, id, state) { const row = await this.get(scope, id); row.state = state; audit.push({ action: `invoice.${state}`, id }); return row; },
    async reopenDraft(scope, id) { const row = await this.get(scope, id); row.state = 'draft'; audit.push({ action: 'invoice.reopened', id }); return row; },
    async deleteDraftIdempotent(scope, id, key) {
      const prior = keys.get(`${scope}:${key}`);
      if (prior) { assert.equal(prior.action, 'delete'); assert.equal(prior.id, id); return { replayed: true }; }
      const row = await this.get(scope, id); if (!row) throw Object.assign(new Error('missing'), { statusCode: 404, code: 'INVOICE_NOT_FOUND' });
      assert.equal(row.state, 'draft'); audit.push({ action: 'invoice.deleted', id }); rows.delete(id); keys.set(`${scope}:${key}`, { id, action: 'delete' }); return { replayed: false };
    },
    async requestSendApproval(scope, id, approvalId, actorId, requestPayload) { return { approvalId, invoiceId: id, status: 'pending', requestPayload, createdBy: actorId }; },
  };
  return { repos, rows, keys, audit };
}

async function withApi(repos, callback) {
  const app = createApp({ config, repos, identity, paypal: { async pp() { throw new Error('PayPal must not be called'); } }, askAI: async () => ({}) });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, token = 'owner-token', orgId = org, options = {}) => fetch(base + path, { ...options, headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  try { await callback(call); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('invoice builder computes line, tax and grand totals from inputs', () => {
  const draft = buildInvoiceDraft({ ...input, clientTotal: 999999, lines: input.lines }, 'user-owner');
  assert.equal(draft.invoice.subtotal_minor, 10000);
  assert.equal(draft.invoice.tax_minor, 1000);
  assert.equal(draft.invoice.total_minor, 11000);
  assert.equal(draft.lines[0].line_total_minor, 11000);
});

test('invoice CRUD enforces roles and tenant scope, idempotency, state transitions and audits', async () => {
  const { repos, rows, audit } = fakeRepos();
  await withApi(repos, async (call) => {
    const key = randomUUID();
    const invalid = await call('/api/invoices', 'owner-token', org, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ ...input, customerName: '' }) });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).fields[0].path, 'customerName');
    const denied = await call('/api/invoices', 'viewer-token', org, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify(input) });
    assert.equal(denied.status, 403);
    const created = await call('/api/invoices', 'owner-token', org, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ ...input, subtotal: '999999', total: '999999' }) });
    assert.equal(created.status, 201);
    const invoice = (await created.json()).invoice;
    assert.equal(invoice.total, 110);
    assert.equal(rows.size, 1);
    const repeated = await call('/api/invoices', 'owner-token', org, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(input) });
    assert.equal(repeated.status, 200);
    assert.equal(rows.size, 1);
    const viewerDelete = await call(`/api/invoices/${invoice.id}`, 'viewer-token', org, { method: 'DELETE', headers: { 'Idempotency-Key': randomUUID() } });
    assert.equal(viewerDelete.status, 403);
    const foreignRead = await call(`/api/invoices/${invoice.id}`, 'other-token', orgB);
    const foreignEdit = await call(`/api/invoices/${invoice.id}`, 'other-token', orgB, { method: 'PATCH', body: JSON.stringify(input) });
    assert.equal(foreignRead.status, 404);
    assert.equal(foreignEdit.status, 404);
    const updated = await call(`/api/invoices/${invoice.id}`, 'accountant-token', org, { method: 'PATCH', body: JSON.stringify({ ...input, lines: [{ ...input.lines[0], unitPrice: '100.00' }] }) });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).invoice.total, 220);
    const review = await call(`/api/invoices/${invoice.id}/review`, 'owner-token', org, { method: 'POST', body: '{}' });
    assert.equal(review.status, 200);
    assert.equal((await review.json()).invoice.state, 'reviewed');
    assert.equal((await call(`/api/invoices/${invoice.id}`, 'owner-token', org, { method: 'PATCH', body: JSON.stringify(input) })).status, 409);
    const reopened = await call(`/api/invoices/${invoice.id}/reopen`, 'owner-token', org, { method: 'POST', body: '{}' });
    assert.equal((await reopened.json()).invoice.state, 'draft');
    const sending = await call(`/api/invoices/${invoice.id}/send-approval`, 'owner-token', org, { method: 'POST', body: '{}' });
    assert.equal(sending.status, 409);
    await call(`/api/invoices/${invoice.id}/review`, 'owner-token', org, { method: 'POST', body: '{}' });
    const approval = await call(`/api/invoices/${invoice.id}/send-approval`, 'owner-token', org, { method: 'POST', body: '{}' });
    assert.equal(approval.status, 201);
    assert.equal((await approval.json()).delivered, false);
    assert.equal(audit.filter((row) => row.id === invoice.id).length, 5);
    const voided = await call(`/api/invoices/${invoice.id}/void`, 'owner-token', org, { method: 'POST', body: '{}' });
    assert.equal((await voided.json()).invoice.state, 'void');
    assert.equal((await call(`/api/invoices/${invoice.id}`, 'owner-token', org, { method: 'PATCH', body: JSON.stringify(input) })).status, 409);
  });
});

test('draft deletion is idempotent; reviewed invoices must be voided and paid invoices stay read-only', async () => {
  const { repos, rows, audit } = fakeRepos();
  await withApi(repos, async (call) => {
    const created = await call('/api/invoices', 'owner-token', org, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify(input) });
    const invoice = (await created.json()).invoice;
    const deleteKey = randomUUID();
    const first = await call(`/api/invoices/${invoice.id}`, 'owner-token', org, { method: 'DELETE', headers: { 'Idempotency-Key': deleteKey } });
    const retry = await call(`/api/invoices/${invoice.id}`, 'owner-token', org, { method: 'DELETE', headers: { 'Idempotency-Key': deleteKey } });
    assert.equal(first.status, 200); assert.equal(retry.status, 200);
    assert.equal(rows.size, 0); assert.equal(audit.filter((row) => row.action === 'invoice.deleted').length, 1);
    const reviewedId = randomUUID(); rows.set(reviewedId, { id: reviewedId, orgId: org, state: 'reviewed' });
    const blocked = await call(`/api/invoices/${reviewedId}`, 'owner-token', org, { method: 'DELETE', headers: { 'Idempotency-Key': randomUUID() } });
    assert.equal(blocked.status, 409);
    const paidId = randomUUID(); rows.set(paidId, { id: paidId, orgId: org, state: 'paid' });
    assert.equal((await call(`/api/invoices/${paidId}/void`, 'owner-token', org, { method: 'POST', body: '{}' })).status, 409);
    assert.equal((await call(`/api/invoices/${paidId}`, 'owner-token', org, { method: 'DELETE', headers: { 'Idempotency-Key': randomUUID() } })).status, 409);
    assert.equal((await call(`/api/invoices/${paidId}`, 'owner-token', org, { method: 'PATCH', body: JSON.stringify(input) })).status, 409);
    const sentId = randomUUID(); rows.set(sentId, { id: sentId, orgId: org, state: 'sent' });
    assert.equal((await call(`/api/invoices/${sentId}`, 'owner-token', org, { method: 'DELETE', headers: { 'Idempotency-Key': randomUUID() } })).status, 409);
    assert.equal((await call(`/api/invoices/${sentId}`, 'owner-token', org, { method: 'PATCH', body: JSON.stringify(input) })).status, 409);
    assert.equal((await call(`/api/invoices/${sentId}/void`, 'owner-token', org, { method: 'POST', body: '{}' })).status, 200);
    const voidId = randomUUID(); rows.set(voidId, { id: voidId, orgId: org, state: 'void' });
    assert.equal((await call(`/api/invoices/${voidId}`, 'owner-token', org, { method: 'DELETE', headers: { 'Idempotency-Key': randomUUID() } })).status, 409);
    assert.equal((await call(`/api/invoices/${voidId}`, 'owner-token', org, { method: 'PATCH', body: JSON.stringify(input) })).status, 409);
  });
});
