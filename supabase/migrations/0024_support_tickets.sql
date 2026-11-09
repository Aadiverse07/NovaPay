alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check check (role in ('owner','admin','accountant','approver','viewer','support'));

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id), assignee_id uuid references auth.users(id), subject text not null,
  category text not null check(category in ('payment_failure','refund','account','invoice','other')),
  priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
  status text not null default 'open' check(status in ('open','in_progress','waiting_on_user','resolved','closed')),
  related_type text check(related_type in ('transaction','approval','failure','invoice')), related_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), resolved_at timestamptz
);
create index support_tickets_org_created_idx on public.support_tickets(org_id,created_at desc);
create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade, author_id uuid not null references auth.users(id),
  body text not null check(char_length(body) between 1 and 4000), internal_note boolean not null default false, created_at timestamptz not null default now()
);
create index support_ticket_messages_ticket_time_idx on public.support_ticket_messages(org_id,ticket_id,created_at);
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
create policy support_ticket_select on public.support_tickets for select to authenticated using (
  exists(select 1 from public.memberships m where m.org_id=support_tickets.org_id and m.user_id=auth.uid()) and
  (created_by=auth.uid() or private.has_role(org_id,array['owner','admin','support']))
);
create policy support_message_select on public.support_ticket_messages for select to authenticated using (
  exists(select 1 from public.support_tickets t where t.id=ticket_id and t.org_id=support_ticket_messages.org_id and
    (t.created_by=auth.uid() or private.has_role(org_id,array['owner','admin','support']))) and
  (not internal_note or private.has_role(org_id,array['owner','admin','support']))
);
revoke all on public.support_tickets, public.support_ticket_messages from public,anon,authenticated;
grant select,insert,update on public.support_tickets, public.support_ticket_messages to authenticated;
grant all on public.support_tickets, public.support_ticket_messages to service_role;
notify pgrst, 'reload schema';
