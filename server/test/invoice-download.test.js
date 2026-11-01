import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';
import { createInvoicePdf, formatInvoiceMinor } from '../src/services/invoicePdf.js';

const orgA = 'a0000000-0000-4000-8000-000000000001';
const orgB = 'b0000000-0000-4000-8000-000000000002';
const invoiceId = 'c0000000-0000-4000-8000-000000000003';
const fixture = {
  id: invoiceId, orgId: orgA, invoiceNumber: 'INV-TEST-8', state: 'draft', currency: 'INR',
  customerName: '<script>alert(1)</script> & Zoë', customerEmail: 'billing@example.test', issueDate: '2026-11-01', dueDate: '2026-11-15',
  subtotalMinor: 13440, taxMinor: 0, totalMinor: 13440, notes: '<b>Safe literal note</b>', sourceDocumentId: null,
  lines: [{ description: '<b>Consulting</b> & review', quantity: '1', unitPriceMinor: 13440, totalMinor: 13440 }],
  events: [{ type: 'draft.created', occurredAt: '2026-11-01T10:00:00.000Z' }],
};
const tokens = new Map([['viewer-token', { id: 'viewer', org: orgA, role: 'viewer' }], ['owner-token', { id: 'owner', org: orgA, role: 'owner' }], ['other-token', { id: 'other', org: orgB, role: 'owner' }]]);
const identity = {
  async verifyToken(token) { return tokens.has(token) ? { id: tokens.get(token).id } : null; },
  async membership(userId, orgId) { const member = [...tokens.values()].find((item) => item.id === userId); return member?.org === orgId ? { org_id: orgId, role: member.role } : null; },
};
const config = { PORT: 3000, STATIC_DIR: process.cwd(), hasPayPal: false, hasSupabase: true, hasAI: false };

test('invoice money formatter uses the ISO currency exponent', () => {
  assert.equal(formatInvoiceMinor(13440, 'INR'), '134.40 INR');
  assert.equal(formatInvoiceMinor(13440, 'JPY'), '13,440 JPY');
  assert.equal(formatInvoiceMinor(13440, 'KWD'), '13.440 KWD');
});

test('viewer can fetch an org-scoped PDF; response is audited and auth/tenant boundaries hold', async () => {
  const repos = createRepositories(), audits = [];
  let requestedScope;
  repos.invoices.get = async (scope, id) => { requestedScope = [scope, id]; return scope === orgA && id === invoiceId ? fixture : null; };
  repos.invoices.auditDownload = async (scope, actor, id, requestId) => audits.push({ scope, actor, id, requestId });
  const app = createApp({ config, repos, identity, paypal: { async pp() { throw new Error('unexpected PayPal'); } }, askAI: async () => ({}) });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (token, orgId, path = `/api/invoices/${invoiceId}/download`) => fetch(base + path, { headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId } });
  try {
    assert.equal((await fetch(base + `/api/invoices/${invoiceId}/download`)).status, 401);
    const foreign = await call('other-token', orgB); assert.equal(foreign.status, 404);
    const detail = await call('viewer-token', orgA, `/api/invoices/${invoiceId}`);
    assert.equal(detail.status, 200); assert.deepEqual((await detail.json()).invoice.events, fixture.events);
    const response = await call('viewer-token', orgA, `/api/invoices/${invoiceId}/download?totalMinor=99999999`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(response.headers.get('content-disposition'), /^attachment; filename="invoice-INV-TEST-8\.pdf"$/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
    const pdf = await PDFDocument.load(bytes); assert.equal(pdf.getPageCount(), 1);
    assert.deepEqual(requestedScope, [orgA, invoiceId]);
    assert.equal(audits.length, 1); assert.deepEqual({ scope: audits[0].scope, id: audits[0].id }, { scope: orgA, id: invoiceId });
    assert.equal(JSON.stringify(audits).includes(fixture.customerEmail), false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('long and special invoice text plus many lines produce paginated PDF without treating text as HTML', async () => {
  const longInvoice = {
    ...fixture,
    customerName: '<img src=x onerror=alert(1)> '.repeat(30) + 'Zoë & Co',
    notes: '<script>ignore</script> '.repeat(120),
    lines: Array.from({ length: 110 }, (_, index) => ({ description: `Line ${index + 1} <b>safe</b> ` + 'extra detail '.repeat(8), quantity: '1', unitPriceMinor: 13440, totalMinor: 13440 })),
  };
  const bytes = await createInvoicePdf(longInvoice);
  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 1);
});

test('View action is connected to the live detail loader and download action', async () => {
  const [client, detail] = await Promise.all([
    readFile(new URL('../../src/invoices-live.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/invoice-detail.js', import.meta.url), 'utf8'),
  ]);
  assert.match(client, /actionButton\(actions, "View", "view"\)/);
  assert.match(client, /NovaPayInvoiceDetail\.showLoading/);
  assert.match(client, /NovaPayInvoiceDetail\.open\(view\.invoice/);
  assert.match(client, /responseType: "blob"/);
  assert.match(detail, /event\.key === "Escape"/);
  assert.match(detail, /returnFocus\.focus\(\)/);
  assert.match(detail, /detail\.textContent = value == null[\s\S]+String\(value\)/);
});
