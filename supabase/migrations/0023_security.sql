create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, occurred_at timestamptz not null default now(),
  ip_hash text not null, user_agent_hash text not null, device_id text not null, success boolean not null,
  failure_reason text, risk_score integer not null default 0 check (risk_score between 0 and 100), risk_level text not null check (risk_level in ('low','medium','high'))
);
create index if not exists login_events_org_time_idx on public.login_events(org_id, occurred_at desc);
create table if not exists public.user_devices (
  org_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null, first_seen timestamptz not null default now(), last_seen timestamptz not null default now(), trusted boolean not null default false,
  primary key(org_id,user_id,device_id)
);
alter table public.login_events enable row level security;
alter table public.user_devices enable row level security;
create policy login_events_member_read on public.login_events for select to authenticated using (exists (select 1 from public.memberships m where m.org_id=login_events.org_id and m.user_id=auth.uid()));
create policy user_devices_owner_read on public.user_devices for select to authenticated using (user_id=auth.uid() and exists (select 1 from public.memberships m where m.org_id=user_devices.org_id and m.user_id=auth.uid()));
revoke all on public.login_events, public.user_devices from public, anon, authenticated;
grant select on public.login_events, public.user_devices to authenticated;
grant select, insert, update on public.login_events, public.user_devices to service_role;
notify pgrst, 'reload schema';
