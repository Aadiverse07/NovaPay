import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';

const orgId = 'a0000000-0000-4000-8000-000000000001';
const config = {
  PORT: 3000, STATIC_DIR: process.cwd(), hasSupabase: true, hasPayPal: false, hasAI: false,
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test-key', SUPABASE_SERVICE_ROLE_KEY: 'server-test-key',
  DOCUMENT_MAX_FILE_MB: 1, DOCUMENT_MAX_PAGES: 10, DOCUMENT_MAX_UPLOADS_PER_ORG_PER_HOUR: 20,
};

async function pdfWithPages(count) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < count; index += 1) pdf.addPage();
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

async function setup(t, rpcImpl = async (_name, args) => ({ id: args.p_document, status: 'uploaded' })) {
  const storageCalls = [];
  const auditCalls = [];
  const identity = {
    async verifyToken(token) { return token ? { id: token === 'viewer-token' ? 'viewer' : 'accountant' } : null; },
    async membership(userId, selectedOrg) { return selectedOrg === orgId ? { role: userId === 'viewer' ? 'viewer' : 'accountant' } : null; },
    database: { async rpc(...args) { return rpcImpl(...args); } },
    storage: {
      async upload(...args) { storageCalls.push(['upload', ...args]); },
      async remove(...args) { storageCalls.push(['remove', ...args]); },
    },
    async audit(event) { auditCalls.push(event); },
  };
  const app = createApp({ config, repos: createRepositories(), identity });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (token, bytes, mime = 'application/pdf') => fetch(`${base}/api/documents`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-org-id': orgId, 'content-type': mime, 'x-file-name': '../../private invoice.pdf' }, body: bytes,
  });
  return { send, storageCalls, auditCalls };
}

test('document upload accepts a valid PDF for accountant and records a private org-scoped object', async (t) => {
  const state = await setup(t);
  const response = await state.send('accountant-token', await pdfWithPages(2));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.document.status, 'uploaded');
  assert.equal(state.storageCalls[0][0], 'upload');
  assert.equal(state.storageCalls[0][1], 'novapay-documents');
  assert.match(state.storageCalls[0][2], new RegExp(`^${orgId}/[0-9a-f-]{36}/`));
  assert.equal(state.auditCalls.length, 0, 'audit is inserted atomically by reserve_document_upload');
});

test('document upload rejects viewer, mismatched MIME, and more than configured pages before storage', async (t) => {
  const state = await setup(t);
  const pdf = await pdfWithPages(1);
  assert.equal((await state.send('viewer-token', pdf)).status, 403);
  assert.equal((await state.send('accountant-token', pdf, 'image/png')).status, 400);
  assert.equal((await state.send('accountant-token', await pdfWithPages(11))).status, 413);
  assert.equal(state.storageCalls.length, 0);
});

test('document upload enforces byte cap and removes uploaded object when DB reservation fails', async (t) => {
  const tooLarge = await setup(t);
  assert.equal((await tooLarge.send('accountant-token', Buffer.alloc(1024 * 1024 + 1))).status, 413);
  assert.equal(tooLarge.storageCalls.length, 0);

  const failing = await setup(t, async () => { throw Object.assign(new Error('limit'), { statusCode: 429, code: 'DOCUMENT_UPLOAD_RATE_LIMITED' }); });
  const response = await failing.send('accountant-token', await pdfWithPages(1));
  assert.equal(response.status, 429);
  assert.deepEqual(failing.storageCalls.map(([action]) => action), ['upload', 'remove']);
});

test('migration 0015 reserves uploads transactionally, audits upload, and gates function to service role', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../../supabase/migrations/0015_documents_rag.sql', import.meta.url), 'utf8');
  assert.match(sql, /create extension if not exists vector/i);
  assert.match(sql, /embedding extensions\.vector\(768\)/i);
  assert.match(sql, /novapay_documents_insert_accountant/i);
  assert.match(sql, /document\.uploaded/);
  assert.match(sql, /revoke all on function public\.reserve_document_upload\([^;]+ from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.reserve_document_upload\([^;]+ to service_role/i);
  assert.match(sql, /claim_document_processing\(p_org uuid, p_document uuid, p_actor uuid, p_concurrent_limit integer\)/i);
  assert.match(sql, /revoke all on function public\.claim_document_processing\(uuid,uuid,uuid,integer\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.claim_document_processing\(uuid,uuid,uuid,integer\) to service_role/i);
});
