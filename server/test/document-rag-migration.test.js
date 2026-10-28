import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const url = new URL('../../supabase/migrations/0016_document_search_and_delete.sql', import.meta.url);
const sql = await readFile(url, 'utf8');
const foundation = await readFile(new URL('../../supabase/migrations/0015_documents_rag.sql', import.meta.url), 'utf8');

test('0016 allows budgeted embeddings and keeps usage reservation service-only', () => {
  assert.match(sql, /ai_usage_route_check check \(route in \('code','sql','ocr','embedding','retrieval','llm'\)\)/i);
  assert.match(sql, /create or replace function public\.reserve_ai_usage\([\s\S]*?p_route not in \('code','sql','ocr','embedding','retrieval','llm'\)/i);
  assert.match(sql, /revoke all on function public\.reserve_ai_usage\([^;]+ from public,anon,authenticated;/i);
  assert.match(sql, /grant execute on function public\.reserve_ai_usage\([^;]+ to service_role;/i);
});

test('0016 hybrid search is tenant-checked, processed-document-only, and service-role-only', () => {
  assert.match(sql, /function public\.search_document_chunks\([\s\S]*?security definer/i);
  assert.match(sql, /memberships m where m\.org_id=p_org and m\.user_id=p_user/i);
  assert.match(sql, /where c\.org_id=p_org and d\.status='processed'/i);
  assert.match(sql, /plainto_tsquery/i);
  assert.match(sql, /embedding operator\(extensions\.<=>\) p_embedding/i);
  assert.match(sql, /revoke all on function public\.search_document_chunks\([^;]+ from public,anon,authenticated;/i);
  assert.match(sql, /grant execute on function public\.search_document_chunks\([^;]+ to service_role;/i);
  assert.match(foundation, /foreign key \(org_id, document_id\) references public\.documents\(org_id, id\) on delete cascade/i);
});

test('0016 deletion requires accountant membership, audits, cascades rows, and is service-role-only', () => {
  assert.match(sql, /function public\.delete_document\([\s\S]*?security definer/i);
  assert.match(sql, /m\.role in \('owner','admin','accountant'\)/i);
  assert.match(sql, /delete from public\.documents where id=p_document and org_id=p_org/i);
  assert.match(sql, /'document\.deleted'/i);
  assert.match(sql, /revoke all on function public\.delete_document\([^;]+ from public,anon,authenticated;/i);
  assert.match(sql, /grant execute on function public\.delete_document\([^;]+ to service_role;/i);
});
