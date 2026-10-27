import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/0005_ai.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');

test('Phase 4 tables have RLS, member-only reads, and no authenticated write grants', () => {
  for (const table of ['ai_usage', 'ai_cache', 'anomalies', 'notifications']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`create policy ${table}_select_member on public\\.${table}\\s+for select to authenticated using \\(private\\.is_member\\(org_id\\)\\)`, 'i'));
  }
  assert.match(sql, /revoke all on public\.ai_usage,public\.ai_cache,public\.anomalies,public\.notifications from public,anon,authenticated/i);
  assert.match(sql, /grant select on public\.ai_usage,public\.ai_cache,public\.anomalies,public\.notifications to authenticated/i);
  assert.match(sql, /grant all on public\.ai_usage,public\.ai_cache,public\.anomalies,public\.notifications to service_role/i);
});

test('every new SECURITY DEFINER RPC revokes client execution and grants only service_role', () => {
  const functions = [
    'get_ai_data_version', 'reserve_ai_usage', 'complete_ai_usage', 'record_ai_cache_hit',
    'create_ai_proposal', 'record_anomaly', 'set_notification_status', 'list_anomaly_org_ids',
  ];
  for (const name of functions) {
    const declaration = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?security definer`, 'i');
    const revoke = new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon,authenticated`, 'i');
    const grant = new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role`, 'i');
    assert.match(sql, declaration, `${name} must be SECURITY DEFINER`);
    assert.match(sql, revoke, `${name} must revoke client execution`);
    assert.match(sql, grant, `${name} must grant service_role execution`);
  }
  assert.doesNotMatch(sql, /grant execute on function public\.[^(]+\([^;]+ to (?:public|anon|authenticated)/i);
});
