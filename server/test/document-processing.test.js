import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';

const orgId = 'a0000000-0000-4000-8000-000000000001';
const documentId = 'a0000000-0000-4000-8000-000000000101';
const duplicateId = 'a0000000-0000-4000-8000-000000000102';
const actorId = 'a0000000-0000-4000-8000-000000000201';
const config = {
  PORT: 3000, STATIC_DIR: process.cwd(), hasSupabase: true, hasPayPal: false, hasAI: false,
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test-key', SUPABASE_SERVICE_ROLE_KEY: 'server-test-key',
  GEMINI_API_KEY: 'test-gemini-key', DOCUMENT_OCR_MODEL: 'gemini-3.5-flash-lite', DOCUMENT_OCR_TIMEOUT_MS: 5000,
  DOCUMENT_MAX_FILE_MB: 10, DOCUMENT_MAX_PAGES: 10, DOCUMENT_MAX_CONCURRENT_JOBS_PER_ORG: 2,
  AI_DAILY_USER_LIMIT: 3, AI_DAILY_ORG_LIMIT: 6,
};
const extraction = {
  documentType: 'invoice', vendorName: 'Sample Vendor', invoiceNumber: 'INV-100', invoiceDate: '2026-10-20', currency: 'USD',
  subtotal: '12.00', tax: '1.00', total: '13.00', lineItems: [{ description: 'Paper', quantity: '2', unitPrice: '6.00', amount: '12.00' }],
  confidence: { vendorName: 0.99, invoiceNumber: 0.9, invoiceDate: 0.9, currency: 0.99, subtotal: 0.95, tax: 0.8, total: 0.95 },
};

async function setup(t, overrides = {}) {
  const doc = { id: documentId, org_id: orgId, uploaded_by: actorId, filename: 'sample.pdf', mime_type: 'application/pdf', byte_size: 512, page_count: 1, storage_path: `${orgId}/${documentId}/sample.pdf`, sha256: 'a'.repeat(64), status: 'uploaded', duplicate_of: null, extraction: {}, updated_at: new Date().toISOString() };
  const calls = [];
  const patches = [];
  const audit = [];
  const storage = [];
  let providerCalls = 0;
  const db = {
    async select(table, query) {
      calls.push({ type: 'select', table, query });
      if (table !== 'documents') return [];
      if (query.includes('sha256=eq.') && overrides.duplicate) return [{ id: duplicateId }];
      if (query.includes('&id=eq.')) return doc.status === 'deleted' ? [] : [{ ...doc }];
      return [];
    },
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args });
      if (name === 'claim_document_processing') return overrides.claim || { claimed: true };
      if (name === 'reserve_ai_usage' && overrides.reserveError) throw Object.assign(new Error('reservation unavailable'), { statusCode: 503, code: 'DATABASE_UNAVAILABLE' });
      if (name === 'reserve_ai_usage') return overrides.reservation || { allowed: true, usageId: 'usage-test-1' };
      if (name === 'complete_ai_usage') return true;
      throw new Error(`unexpected rpc ${name}`);
    },
    async patch(table, query, values) {
      patches.push({ table, query, values });
      Object.assign(doc, values);
      return [{ ...doc }];
    },
  };
  const identity = {
    async verifyToken(token) { return token ? { id: token === 'viewer-token' ? 'viewer' : actorId } : null; },
    async membership(userId, selectedOrg) { return selectedOrg === orgId ? { role: userId === 'viewer' ? 'viewer' : 'accountant' } : null; },
    database: db,
    storage: { async download(bucket, objectPath) { storage.push({ bucket, objectPath }); return Buffer.from('%PDF-test'); } },
    async audit(event) { audit.push(event); },
  };
  const provider = { async extract(args) { providerCalls += 1; calls.push({ type: 'ocr', args }); return overrides.ocrResult || { text: JSON.stringify(extraction), model: 'gemini-3.5-flash-lite', usage: { inputTokens: 280, outputTokens: 100 } }; } };
  const app = createApp({ config, repos: createRepositories(), identity, askAI: async () => ({ reply: '', evidence: [] }), documentOCRProvider: provider });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (token = 'accountant-token') => fetch(`${base}/api/documents/${documentId}/process`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId } });
  return { send, doc, calls, patches, audit, storage, providerCalls: () => providerCalls, identity, provider };
}

test('document processing validates and stores OCR, reports arithmetic warnings, and logs usage', async (t) => {
  const state = await setup(t, { ocrResult: { text: JSON.stringify({ ...extraction, total: '14.00' }), model: 'gemini-3.5-flash-lite', usage: { inputTokens: 280, outputTokens: 100 } } });
  const response = await state.send();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.document.status, 'processed');
  assert.equal(body.document.extraction.validation.arithmetic, 'warning');
  assert.deepEqual(body.document.extraction.validation.warnings, ['subtotal_plus_tax_mismatch']);
  assert.equal(state.providerCalls(), 1);
  assert.deepEqual(state.storage, [{ bucket: 'novapay-documents', objectPath: `${orgId}/${documentId}/sample.pdf` }]);
  const reservation = state.calls.find((call) => call.name === 'reserve_ai_usage');
  assert.equal(reservation.args.p_route, 'ocr');
  assert.equal(reservation.args.p_user_limit, 3);
  assert.equal(reservation.args.p_org_limit, 6);
  const completion = state.calls.find((call) => call.name === 'complete_ai_usage');
  assert.equal(completion.args.p_status, 'completed');
  assert.equal(completion.args.p_input_tokens, 280);
});

test('already processed document returns cached extraction without another OCR or usage call', async (t) => {
  const state = await setup(t);
  state.doc.status = 'processed';
  state.doc.extraction = { fields: extraction, validation: { fields: 'valid' } };
  const response = await state.send();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).cached, true);
  assert.equal(state.providerCalls(), 0);
  assert.equal(state.calls.some((call) => call.name === 'reserve_ai_usage'), false);
});

test('AI daily budget denial releases the processing claim and does not call OCR', async (t) => {
  const state = await setup(t, { reservation: { allowed: false, reason: 'user_limit' } });
  const response = await state.send();
  assert.equal(response.status, 429);
  assert.equal(state.doc.status, 'uploaded');
  assert.equal(state.providerCalls(), 0);
  assert.equal(state.calls.find((call) => call.name === 'reserve_ai_usage').args.p_route, 'ocr');
});

test('AI reservation outage or missing usage ID releases the processing claim', async (t) => {
  const outage = await setup(t, { reserveError: true });
  assert.equal((await outage.send()).status, 503);
  assert.equal(outage.doc.status, 'uploaded');
  assert.equal(outage.providerCalls(), 0);

  const missing = await setup(t, { reservation: { allowed: true } });
  assert.equal((await missing.send()).status, 503);
  assert.equal(missing.doc.status, 'uploaded');
  assert.equal(missing.providerCalls(), 0);
});

test('organization concurrency cap blocks OCR before usage reservation', async (t) => {
  const state = await setup(t, { claim: { claimed: false, reason: 'concurrency_limit' } });
  const response = await state.send();
  assert.equal(response.status, 409);
  assert.equal(state.providerCalls(), 0);
  assert.equal(state.calls.some((call) => call.name === 'reserve_ai_usage'), false);
});

test('same-org hash match marks a duplicate rejected and writes a rejection audit without calling OCR', async (t) => {
  const state = await setup(t, { duplicate: true });
  const response = await state.send();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'DUPLICATE_DOCUMENT');
  assert.equal(state.doc.status, 'rejected');
  assert.equal(state.doc.duplicate_of, duplicateId);
  assert.equal(state.audit[0].action, 'document.rejected');
  assert.equal(state.providerCalls(), 0);
  assert.equal(state.calls.some((call) => call.name === 'claim_document_processing'), false);
});

test('viewer cannot process documents and malformed provider output is stored only as a safe error code', async (t) => {
  const viewer = await setup(t);
  assert.equal((await viewer.send('viewer-token')).status, 403);
  assert.equal(viewer.providerCalls(), 0);

  const invalid = await setup(t, { ocrResult: { text: '{bad json', model: 'gemini-3.5-flash-lite' } });
  const response = await invalid.send();
  assert.equal(response.status, 502);
  assert.equal(invalid.doc.status, 'failed');
  assert.deepEqual(invalid.doc.extraction, { errorCode: 'OCR_INVALID_RESPONSE' });
  assert.equal(invalid.calls.find((call) => call.name === 'complete_ai_usage').args.p_status, 'invalid_response');
});
