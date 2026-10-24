-- MANUAL, DESTRUCTIVE SQL. Test data only. Review the target names before running.
-- Removes legacy randomly named Phase 2 verifier tenants and the two fixed verifier tenants.
-- It deletes transaction/journal rows before organizations to satisfy their foreign keys;
-- journal_lines cascade from journal_entries. Audit rows are removed only for these test orgs.
-- Do not use this script for customer or production organizations.
do $$
declare
  target_org_ids uuid[];
  target_user_ids uuid[];
begin
  select
    coalesce(array_agg(id), '{}'::uuid[]),
    coalesce(array_agg(created_by), '{}'::uuid[])
  into target_org_ids, target_user_ids
  from public.organizations
  where name in (
    'NovaPay Phase 2 Verification A',
    'NovaPay Phase 2 Verification B'
  )
    or name ~ '^Phase 2 [AB] [0-9a-f]{8}$';

  delete from public.transactions where org_id = any(target_org_ids);
  delete from public.approvals where org_id = any(target_org_ids);
  delete from public.journal_entries where org_id = any(target_org_ids);
  delete from public.paypal_events where org_id = any(target_org_ids)
    or event_id like 'P2-BADSIG-%'
    or event_id like 'phase2-security-%';
  delete from public.reconciliation_runs where org_id = any(target_org_ids);
  delete from public.api_activity where org_id = any(target_org_ids);
  delete from public.paypal_orders where org_id = any(target_org_ids);
  delete from public.audit_log where org_id = any(target_org_ids);
  delete from public.organizations where id = any(target_org_ids);

  delete from auth.users
  where id = any(target_user_ids)
     or email in (
       'novapay-phase2-a@example.test',
       'novapay-phase2-b@example.test'
     )
     or email ~ '^novapay-phase2-[ab]-.*@example\.test$';
end
$$;
