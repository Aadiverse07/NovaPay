begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('30000000-0000-4000-8000-000000000003','authenticated','authenticated','phase2-core@example.test','',now(),'{}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;
insert into public.organizations(id,name,created_by)
values ('c0000000-0000-4000-8000-000000000003','Phase 2 Core Test','30000000-0000-4000-8000-000000000003') on conflict (id) do nothing;
insert into public.memberships(org_id,user_id,role)
values ('c0000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','owner') on conflict do nothing;

select is((select count(*)::integer from public.accounts where org_id='c0000000-0000-4000-8000-000000000003'),9,'each organization receives the nine default accounts');
select throws_ok($$
do $block$
declare v_entry uuid;
begin
  insert into public.journal_entries(org_id,source_type,source_id,description,currency)
  values ('c0000000-0000-4000-8000-000000000003','test','unbalanced','Unbalanced test','USD') returning id into v_entry;
  insert into public.journal_lines(org_id,journal_entry_id,account_id,debit_minor,credit_minor,currency)
  select 'c0000000-0000-4000-8000-000000000003',v_entry,id,100,0,'USD' from public.accounts
  where org_id='c0000000-0000-4000-8000-000000000003' and code='1000';
  set constraints all immediate;
end
$block$;
$$,'23514',null,'the deferred constraint trigger rejects an unbalanced journal entry');

set local role service_role;
select public.record_paypal_order('c0000000-0000-4000-8000-000000000003','phase2-test-key','ORDER-PHASE2-TEST',10000,'USD','CREATED','https://www.paypal.com/approve','Created');
select public.record_paypal_capture('c0000000-0000-4000-8000-000000000003','ORDER-PHASE2-TEST','{"id":"CAPTURE-PHASE2-TEST","amount":{"minor":10000},"fee_minor":300,"net_minor":9700,"currency":"USD","status":"COMPLETED","provider_payload":{}}'::jsonb,'[{"account_code":"1000","debit_minor":9700,"credit_minor":0,"currency":"USD"},{"account_code":"5000","debit_minor":300,"credit_minor":0,"currency":"USD"},{"account_code":"4000","debit_minor":0,"credit_minor":10000,"currency":"USD"}]'::jsonb);
select public.record_paypal_capture('c0000000-0000-4000-8000-000000000003','ORDER-PHASE2-TEST','{"id":"CAPTURE-PHASE2-TEST","amount":{"minor":10000},"fee_minor":300,"net_minor":9700,"currency":"USD","status":"COMPLETED","provider_payload":{}}'::jsonb,'[{"account_code":"1000","debit_minor":9700,"credit_minor":0,"currency":"USD"},{"account_code":"5000","debit_minor":300,"credit_minor":0,"currency":"USD"},{"account_code":"4000","debit_minor":0,"credit_minor":10000,"currency":"USD"}]'::jsonb);
select public.record_paypal_capture('c0000000-0000-4000-8000-000000000003','ORDER-PHASE2-TEST','{"id":"CAPTURE-PHASE2-TEST","amount":{"minor":10000},"fee_minor":300,"net_minor":9700,"currency":"USD","status":"COMPLETED","provider_payload":{}}'::jsonb,'[{"account_code":"1000","debit_minor":9700,"credit_minor":0,"currency":"USD"},{"account_code":"5000","debit_minor":300,"credit_minor":0,"currency":"USD"},{"account_code":"4000","debit_minor":0,"credit_minor":10000,"currency":"USD"}]'::jsonb);
select public.record_paypal_capture('c0000000-0000-4000-8000-000000000003','ORDER-PHASE2-TEST','{"id":"CAPTURE-PHASE2-TEST","amount":{"minor":10000},"fee_minor":300,"net_minor":9700,"currency":"USD","status":"COMPLETED","provider_payload":{}}'::jsonb,'[{"account_code":"1000","debit_minor":9700,"credit_minor":0,"currency":"USD"},{"account_code":"5000","debit_minor":300,"credit_minor":0,"currency":"USD"},{"account_code":"4000","debit_minor":0,"credit_minor":10000,"currency":"USD"}]'::jsonb);
select public.record_paypal_capture('c0000000-0000-4000-8000-000000000003','ORDER-PHASE2-TEST','{"id":"CAPTURE-PHASE2-TEST","amount":{"minor":10000},"fee_minor":300,"net_minor":9700,"currency":"USD","status":"COMPLETED","provider_payload":{}}'::jsonb,'[{"account_code":"1000","debit_minor":9700,"credit_minor":0,"currency":"USD"},{"account_code":"5000","debit_minor":300,"credit_minor":0,"currency":"USD"},{"account_code":"4000","debit_minor":0,"credit_minor":10000,"currency":"USD"}]'::jsonb);
select public.record_paypal_capture('c0000000-0000-4000-8000-000000000003','ORDER-PHASE2-TEST','{"id":"CAPTURE-PHASE2-TEST","amount":{"minor":10000},"fee_minor":300,"net_minor":9700,"currency":"USD","status":"COMPLETED","provider_payload":{}}'::jsonb,'[{"account_code":"1000","debit_minor":9700,"credit_minor":0,"currency":"USD"},{"account_code":"5000","debit_minor":300,"credit_minor":0,"currency":"USD"},{"account_code":"4000","debit_minor":0,"credit_minor":10000,"currency":"USD"}]'::jsonb);
set constraints all immediate;
select is((select count(*)::integer from public.journal_entries where org_id='c0000000-0000-4000-8000-000000000003' and source_type='capture' and source_id='CAPTURE-PHASE2-TEST'),1,'five replays of one capture create exactly one journal entry');
reset role;

select * from finish();
rollback;
