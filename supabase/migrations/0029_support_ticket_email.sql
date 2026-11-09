-- Give support cases stable, organization-local human-readable numbers.
alter table public.support_tickets add column ticket_number bigint;
with numbered as (
  select id, row_number() over (partition by org_id order by created_at, id) as ticket_number
  from public.support_tickets
)
update public.support_tickets t set ticket_number=n.ticket_number from numbered n where n.id=t.id;
alter table public.support_tickets alter column ticket_number set not null;
create unique index support_tickets_org_ticket_number_uq on public.support_tickets(org_id,ticket_number);

create table public.support_ticket_counters (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  next_number bigint not null check (next_number > 0),
  updated_at timestamptz not null default now()
);
insert into public.support_ticket_counters(org_id,next_number)
select org_id,coalesce(max(ticket_number),0)+1 from public.support_tickets group by org_id
on conflict(org_id) do update set next_number=excluded.next_number,updated_at=now();
alter table public.support_ticket_counters enable row level security;
create policy support_ticket_counter_org_scope on public.support_ticket_counters
for all to authenticated using (exists(select 1 from public.memberships m where m.org_id=support_ticket_counters.org_id and m.user_id=auth.uid()))
with check (exists(select 1 from public.memberships m where m.org_id=support_ticket_counters.org_id and m.user_id=auth.uid()));
revoke all on public.support_ticket_counters from public,anon,authenticated;
grant all on public.support_ticket_counters to service_role;

create or replace function public.allocate_support_ticket_number(p_org_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare allocated bigint;
begin
  insert into public.support_ticket_counters(org_id,next_number)
  values(p_org_id,2)
  on conflict(org_id) do update set next_number=public.support_ticket_counters.next_number+1,updated_at=now()
  returning next_number-1 into allocated;
  return allocated;
end;
$$;
revoke all on function public.allocate_support_ticket_number(uuid) from public,anon,authenticated;
grant execute on function public.allocate_support_ticket_number(uuid) to service_role;

alter table public.support_ticket_messages
  add column email_kind text not null default 'reply' check(email_kind in ('ticket_received','reply','status')),
  add column email_status text not null default 'not_configured' check(email_status in ('sent','failed','not_configured')),
  add column email_error_class text;
create index support_ticket_messages_email_retry_idx on public.support_ticket_messages(org_id,ticket_id,created_at)
where not internal_note and email_status='failed';
notify pgrst, 'reload schema';
