-- Phase 6 thin slice: organization-scoped fund transparency and maintenance records.
-- Writes are performed by the backend using service_role; authenticated clients are read-only.

alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('owner','admin','accountant','approver','viewer','donor','resident'));

create table public.fund_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  purpose text not null check (char_length(trim(purpose)) between 1 and 2000),
  target_minor bigint not null check (target_minor > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  deadline date,
  organiser text not null check (char_length(trim(organiser)) between 1 and 160),
  status text not null default 'draft' check (status in ('draft','active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,id)
);
create index fund_campaigns_org_status_idx on public.fund_campaigns(org_id,status,created_at desc);

create table public.fund_contractors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified')),
  verified_by uuid references auth.users(id) on delete restrict,
  verified_at timestamptz,
  payment_destination_ref text,
  created_at timestamptz not null default now(),
  check ((verification_status='verified' and verified_by is not null and verified_at is not null) or verification_status='unverified'),
  unique (org_id,id)
);

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 160),
  scope text not null check (char_length(trim(scope)) between 1 and 4000),
  status text not null default 'proposed' check (status in ('proposed','quoting','approved','in_progress','completed','cancelled')),
  estimate_minor bigint check (estimate_minor is null or estimate_minor > 0),
  chosen_quotation_id uuid,
  contractor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,id),
  foreign key (org_id,campaign_id) references public.fund_campaigns(org_id,id) on delete restrict,
  foreign key (org_id,contractor_id) references public.fund_contractors(org_id,id) on delete restrict
);
create index maintenance_requests_org_status_idx on public.maintenance_requests(org_id,status,created_at desc);

create table public.fund_contributions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'pledged' check (status in ('pledged','received')),
  donor_ref text not null default 'anonymous' check (char_length(donor_ref) between 1 and 120),
  paypal_capture_id text,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id,id),
  unique (org_id,paypal_capture_id),
  foreign key (org_id,campaign_id) references public.fund_campaigns(org_id,id) on delete restrict,
  check ((status='received' and received_at is not null) or (status='pledged' and received_at is null))
);
create index fund_contributions_org_campaign_idx on public.fund_contributions(org_id,campaign_id,created_at desc);

create table public.fund_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contribution_id uuid not null,
  receipt_number text not null check (char_length(trim(receipt_number)) between 1 and 80),
  issued_at timestamptz not null default now(),
  document_ref text,
  unique (org_id,id),
  unique (org_id,contribution_id),
  unique (org_id,receipt_number),
  foreign key (org_id,contribution_id) references public.fund_contributions(org_id,id) on delete restrict
);

create table public.fund_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null,
  maintenance_request_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now(),
  unique (org_id,id),
  unique (org_id,campaign_id,maintenance_request_id),
  foreign key (org_id,campaign_id) references public.fund_campaigns(org_id,id) on delete restrict,
  foreign key (org_id,maintenance_request_id) references public.maintenance_requests(org_id,id) on delete restrict
);

create table public.fund_quotations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  maintenance_request_id uuid not null,
  contractor_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'USD' check (currency='USD'),
  document_ref text,
  submitted_at timestamptz not null default now(),
  unique (org_id,id),
  unique (org_id,maintenance_request_id,contractor_id),
  foreign key (org_id,maintenance_request_id) references public.maintenance_requests(org_id,id) on delete restrict,
  foreign key (org_id,contractor_id) references public.fund_contractors(org_id,id) on delete restrict
);

alter table public.maintenance_requests add constraint maintenance_requests_chosen_quotation_fk
  foreign key (org_id,chosen_quotation_id) references public.fund_quotations(org_id,id) on delete restrict;

create table public.fund_approvals_chain (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  maintenance_request_id uuid not null,
  step text not null check (step in ('scope','payment')),
  approver_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected')),
  note text,
  decided_at timestamptz not null default now(),
  unique (org_id,id),
  unique (org_id,maintenance_request_id,step,approver_id),
  foreign key (org_id,maintenance_request_id) references public.maintenance_requests(org_id,id) on delete restrict
);

create table public.fund_completion_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  maintenance_request_id uuid not null,
  kind text not null check (kind in ('photo','invoice','inspection','other')),
  description text not null check (char_length(trim(description)) between 1 and 2000),
  file_ref text,
  submitted_by uuid references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (org_id,id),
  foreign key (org_id,maintenance_request_id) references public.maintenance_requests(org_id,id) on delete restrict
);

create table public.fund_maintenance_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  maintenance_request_id uuid not null,
  quotation_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  approval_id uuid not null,
  mode text not null check (mode in ('REAL','SIMULATED')),
  paypal_payout_ref text,
  ledger_entry_id uuid,
  status text not null default 'pending' check (status in ('pending','processing','paid','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,id),
  unique (org_id,paypal_payout_ref),
  foreign key (org_id,maintenance_request_id) references public.maintenance_requests(org_id,id) on delete restrict,
  foreign key (org_id,quotation_id) references public.fund_quotations(org_id,id) on delete restrict,
  foreign key (org_id,approval_id) references public.fund_approvals_chain(org_id,id) on delete restrict,
  foreign key (org_id,ledger_entry_id) references public.journal_entries(org_id,id) on delete restrict,
  check (mode='SIMULATED' or paypal_payout_ref is not null or status in ('pending','failed'))
);

create table public.fund_transparency_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  minimum_quotation_count integer not null default 1 check (minimum_quotation_count between 1 and 20),
  two_person_approval_threshold_minor bigint not null default 10000 check (two_person_approval_threshold_minor >= 0),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

insert into public.fund_transparency_settings(org_id)
  select id from public.organizations on conflict (org_id) do nothing;

create or replace function private.seed_fund_transparency_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fund_transparency_settings(org_id) values (new.id) on conflict (org_id) do nothing;
  return new;
end
$$;
revoke all on function private.seed_fund_transparency_settings() from public,anon,authenticated,service_role;
create trigger organizations_seed_fund_transparency_settings
  after insert on public.organizations for each row execute function private.seed_fund_transparency_settings();

do $$
declare t text;
begin
  foreach t in array array[
    'fund_campaigns','fund_contractors','maintenance_requests','fund_contributions','fund_receipts',
    'fund_allocations','fund_quotations','fund_approvals_chain','fund_completion_evidence',
    'fund_maintenance_payments','fund_transparency_settings'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(org_id))',t||'_select_member',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end
$$;
