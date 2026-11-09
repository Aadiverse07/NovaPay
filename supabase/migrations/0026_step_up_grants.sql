create table public.step_up_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint step_up_grants_expiry_after_grant check (expires_at > granted_at),
  constraint step_up_grants_device_fk foreign key (org_id,user_id,device_id)
    references public.user_devices(org_id,user_id,device_id) on delete cascade,
  constraint step_up_grants_device_unique unique (org_id,user_id,device_id)
);
create index step_up_grants_user_expiry_idx on public.step_up_grants(org_id,user_id,expires_at desc);
alter table public.step_up_grants enable row level security;
create policy step_up_grants_select_self on public.step_up_grants for select to authenticated
  using (user_id=auth.uid() and exists(select 1 from public.memberships m where m.org_id=step_up_grants.org_id and m.user_id=auth.uid()));
revoke all on public.step_up_grants from public,anon,authenticated;
grant select on public.step_up_grants to authenticated;
grant select,insert,update,delete on public.step_up_grants to service_role;
notify pgrst, 'reload schema';
