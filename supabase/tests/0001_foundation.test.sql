begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.organizations(id, name, created_by) values
  ('a0000000-0000-4000-8000-000000000001', 'Org A', '10000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'Org B', '20000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;
insert into public.memberships(org_id, user_id, role) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'viewer'),
  ('b0000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'owner')
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.organizations), 1, 'org A cannot see org B');
select is((select count(*)::integer from public.memberships), 1, 'org A user cannot see org B membership');
select is(private.is_member('a0000000-0000-4000-8000-000000000001'), true, 'member helper recognizes own organization');
select is(private.is_member('b0000000-0000-4000-8000-000000000002'), false, 'member helper rejects another organization');
select is(private.has_role('a0000000-0000-4000-8000-000000000001', array['approver']), false, 'viewer is not an approver');
select ok(has_table_privilege('authenticated', 'public.audit_log', 'SELECT'), 'authenticated users have the read grant for admin-policy audit queries');
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'INSERT') and not has_table_privilege('authenticated', 'public.audit_log', 'UPDATE') and not has_table_privilege('authenticated', 'public.audit_log', 'DELETE'), 'authenticated users cannot write audit rows');
select ok(has_table_privilege('service_role', 'public.audit_log', 'INSERT') and not has_table_privilege('service_role', 'public.audit_log', 'UPDATE') and not has_table_privilege('service_role', 'public.audit_log', 'DELETE') and not has_table_privilege('service_role', 'public.audit_log', 'SELECT'), 'API service role has insert-only audit access');

select * from finish();
rollback;
