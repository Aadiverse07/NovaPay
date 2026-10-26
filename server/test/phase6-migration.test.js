import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../supabase/migrations/0006_fund_transparency.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');
const contributionMigrationUrl = new URL('../../supabase/migrations/0007_fund_contributions.sql', import.meta.url);
const contributionSql = await readFile(contributionMigrationUrl, 'utf8');
const accountingMigrationUrl = new URL('../../supabase/migrations/0008_fund_contribution_accounting.sql', import.meta.url);
const accountingSql = await readFile(accountingMigrationUrl, 'utf8');
const maintenanceMigrationUrl = new URL('../../supabase/migrations/0009_maintenance_state_machine.sql', import.meta.url);
const maintenanceSql = await readFile(maintenanceMigrationUrl, 'utf8');
const paymentMigrationUrl = new URL('../../supabase/migrations/0010_simulated_maintenance_payments.sql', import.meta.url);
const paymentSql = await readFile(paymentMigrationUrl, 'utf8');
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

test('Phase 6 SECURITY DEFINER RPCs are executable only by service_role', () => {
  const names = ['create_fund_campaign','create_fund_pledge','link_fund_contribution_order','record_fund_paypal_capture_event','get_fund_campaign_summary'];
  for (const name of names) {
    assert.match(contributionSql,new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?security definer`,'i'),`${name} must be SECURITY DEFINER`);
    assert.match(contributionSql,new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon,authenticated;`,'i'),`${name} must revoke client execution`);
    assert.match(contributionSql,new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role;`,'i'),`${name} must grant service_role execution`);
  }
  assert.doesNotMatch(contributionSql,/grant execute on function public\.[^(]+\([^;]+ to (?:public|anon|authenticated)/i);
});

test('fund account correction uses append-only reversal and repost entries', () => {
  assert.match(accountingSql, /fund_reclassification_reversal/i);
  assert.match(accountingSql, /fund_reclassification_repost/i);
  assert.match(accountingSql, /a\.code='4000'\s+then v_donations_account_id/i);
  assert.match(accountingSql, /where org_id=v_fund\.org_id and code='4100'/i);
  assert.match(accountingSql, /not exists\s*\([\s\S]*?fund_reclassification_reversal/i);
  assert.match(accountingSql, /on conflict\(org_id,source_type,source_id\) do nothing/ig);
  assert.doesNotMatch(accountingSql, /\b(?:update|delete)\s+(?:from\s+)?public\.journal_(?:entries|lines)\b/i);
});

test('T3 maintenance RPCs enforce the state graph and are service_role-only', () => {
  const names=['create_fund_maintenance_request','create_fund_contractor','add_fund_quotation','approve_fund_maintenance_scope','verify_fund_maintenance_contractor','approve_fund_maintenance_payment'];
  for(const name of names){
    assert.match(maintenanceSql,new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?security definer`,'i'),`${name} must be SECURITY DEFINER`);
    assert.match(maintenanceSql,new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon,authenticated;`,'i'),`${name} must revoke client execution`);
    assert.match(maintenanceSql,new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role;`,'i'),`${name} must grant service_role only`);
  }
  assert.match(maintenanceSql,/requested','quoting','scope_approved','contractor_verified','payment_approved','paid','evidence_submitted','reviewed','closed/i);
  assert.match(maintenanceSql,/requested_by=p_actor/);
  assert.match(maintenanceSql,/count\(distinct approver_id\)/i);
  assert.match(maintenanceSql,/v_quote\.amount_minor>=v_threshold/);
  assert.match(maintenanceSql,/maintenance_request_id\s*=\s*p_request/i);
});

test('T4 payment queue RPCs are service_role-only and simulated payments never post to the ledger', () => {
  const names=['request_fund_maintenance_payment','decide_fund_maintenance_payment'];
  for(const name of names){
    assert.match(paymentSql,new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?security definer`,'i'),`${name} must be SECURITY DEFINER`);
    assert.match(paymentSql,new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public,anon,authenticated;`,'i'),`${name} must revoke client execution`);
    assert.match(paymentSql,new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role;`,'i'),`${name} must grant service_role only`);
  }
  assert.match(paymentSql,/proposal_type='maintenance-payment'/i);
  assert.match(paymentSql,/fund_maintenance_request_id/);
  assert.match(paymentSql,/fund_maintenance_payments_one_per_request/);
  assert.match(paymentSql,/v_quote\.amount_minor/);
  assert.match(paymentSql,/count\(distinct approver_id\)/i);
  assert.match(paymentSql,/mode,status\)\s*values\([\s\S]*?'SIMULATED','paid'/i);
  assert.match(paymentSql,/ledger_entry_id',null/);
  assert.match(paymentSql,/simulated, no ledger entry/i);
  assert.doesNotMatch(paymentSql,/insert into public\.journal_(?:entries|lines)/i);
  assert.doesNotMatch(paymentSql,/api-m\.sandbox\.paypal\.com/i);
});
