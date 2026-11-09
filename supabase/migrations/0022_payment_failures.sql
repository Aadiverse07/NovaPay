create table if not exists public.payment_failures (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  occurred_at timestamptz not null default now(), operation text not null check (operation in ('create_order','capture','refund','webhook')),
  reference_id text, category text not null, code text not null, http_status integer, retryable boolean not null default false,
  provider_issues jsonb not null default '[]'::jsonb, debug_id text, request_id text
);
create index if not exists payment_failures_org_occurred_idx on public.payment_failures(org_id, occurred_at desc);
alter table public.payment_failures enable row level security;
create policy payment_failures_org_select on public.payment_failures for select to authenticated
using (exists (select 1 from public.memberships m where m.org_id = payment_failures.org_id and m.user_id = auth.uid()));
revoke all on public.payment_failures from public, anon, authenticated;
grant select on public.payment_failures to authenticated;
grant select, insert on public.payment_failures to service_role;
notify pgrst, 'reload schema';
