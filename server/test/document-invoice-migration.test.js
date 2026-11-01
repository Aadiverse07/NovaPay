import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/0017_document_invoice_confirmation.sql', import.meta.url);

test('0017 links one invoice draft per document and confirms atomically with audit', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /source_document_id uuid references public\.documents\(id\) on delete set null/i);
  assert.match(sql, /create unique index invoices_one_draft_per_source_document/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /public\.create_invoice_draft\(p_org, p_invoice, p_lines\)/i);
  assert.match(sql, /insert into public\.audit_log/i);
  assert.match(sql, /already_confirmed/i);
  assert.match(sql, /revoke all on function public\.confirm_document_invoice[^;]+ from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.confirm_document_invoice[^;]+ to service_role/i);
});
