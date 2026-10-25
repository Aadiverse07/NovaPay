import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/0006_fund_transparency.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');
const tables = [
  'fund_campaigns','fund_contributions','fund_receipts','fund_allocations','fund_contractors',
  'maintenance_requests','fund_quotations','fund_approvals_chain','fund_completion_evidence',
  'fund_maintenance_payments','fund_transparency_settings',
];

test('Phase 6 tables are tenant-scoped and expose only member reads to authenticated clients', () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\s*\\([\\s\\S]*?org_id uuid(?: not null)?`, 'i'), `${table} must carry org_id`);
    assert.match(sql, new RegExp(`alter table public\\.%I enable row level security`, 'i'));
    assert.match(sql, /for select to authenticated using \(private\.is_member\(org_id\)\)/i);
    assert.match(sql, /revoke all on public\.%I from public,anon,authenticated/i);
    assert.match(sql, /grant select on public\.%I to authenticated/i);
    assert.match(sql, /grant all on public\.%I to service_role/i);
  }
  assert.match(sql, /role in \('owner','admin','accountant','approver','viewer','donor','resident'\)/i);
});

test('Fund schema encodes contribution receipts, quotation selection, approvals, evidence, and defaults', () => {
  assert.match(sql, /unique \(org_id,paypal_capture_id\)/i);
  assert.match(sql, /unique \(org_id,contribution_id\)/i);
  assert.match(sql, /maintenance_requests_chosen_quotation_fk/i);
  assert.match(sql, /unique \(org_id,maintenance_request_id,step,approver_id\)/i);
  assert.match(sql, /two_person_approval_threshold_minor bigint not null default 10000/i);
  assert.match(sql, /minimum_quotation_count integer not null default 1/i);
  assert.match(sql, /organizations_seed_fund_transparency_settings/i);
  assert.match(sql, /from public,anon,authenticated,service_role/i);
});
