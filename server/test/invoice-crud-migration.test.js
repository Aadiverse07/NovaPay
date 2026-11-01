import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../supabase/migrations/0018_invoice_crud.sql', import.meta.url), 'utf8');
const confirmationSql = await readFile(new URL('../../supabase/migrations/0017_document_invoice_confirmation.sql', import.meta.url), 'utf8');

test('0018 adds service-role-only idempotent invoice mutations with audit logging', () => {
  for (const name of ['create_invoice_draft_idempotent', 'update_invoice_draft', 'reopen_invoice_draft', 'delete_invoice_draft_idempotent', 'set_invoice_state']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(`, 'i'));
  }
  assert.match(sql, /insert into public\.audit_log[\s\S]*invoice\.created/i);
  assert.match(sql, /insert into public\.audit_log[\s\S]*invoice\.updated/i);
  assert.match(sql, /insert into public\.audit_log[\s\S]*invoice\.deleted/i);
  assert.match(sql, /action in \('create', 'delete'\)/i);
  assert.match(sql, /p_state='reviewed'\) or \(v_invoice\.state in \('reviewed','sent'\) and p_state='void'/i);
  assert.doesNotMatch(sql, /v_invoice\.state in \('draft','reviewed'\) and p_state='void'/i);
  assert.match(confirmationSql, /source_document_id uuid references public\.documents\(id\) on delete set null/i);
});
