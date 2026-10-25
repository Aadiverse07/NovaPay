create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','contra_revenue','expense')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (org_id, code),
  unique (org_id, id)
);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  description text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (org_id, source_type, source_id),
  unique (org_id, id)
);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  journal_entry_id uuid not null,
  account_id uuid not null,
  debit_minor bigint not null default 0 check (debit_minor >= 0),
  credit_minor bigint not null default 0 check (credit_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  check ((debit_minor > 0 and credit_minor = 0) or (credit_minor > 0 and debit_minor = 0)),
  foreign key (org_id, journal_entry_id) references public.journal_entries(org_id, id) on delete cascade,
  foreign key (org_id, account_id) references public.accounts(org_id, id),
  unique (journal_entry_id, account_id, currency, debit_minor, credit_minor)
);
create index journal_entries_org_created_idx on public.journal_entries(org_id, created_at desc);
create index journal_lines_org_account_idx on public.journal_lines(org_id, account_id, currency);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null check (source_type in ('capture','refund')),
  source_id text not null,
  paypal_order_id text,
  paypal_capture_id text,
  paypal_refund_id text,
  status text not null,
  amount_minor bigint not null check (amount_minor > 0),
  fee_minor bigint,
  net_minor bigint,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (org_id, source_type, source_id)
);
create index transactions_org_occurred_idx on public.transactions(org_id, occurred_at desc);

create table public.paypal_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  request_key text not null,
  paypal_order_id text,
  amount_minor bigint not null check (amount_minor between 1 and 1000000),
  currency text not null check (currency = 'USD'),
  status text not null default 'CREATING',
  state text not null default 'Creating',
  approve_url text,
  capture_id uuid,
  capture_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, request_key),
  unique (org_id, id),
  unique (org_id, paypal_order_id)
);
create unique index paypal_orders_provider_id_unique on public.paypal_orders(paypal_order_id) where paypal_order_id is not null;
alter table public.transactions add constraint transactions_order_fk foreign key (org_id, paypal_order_id) references public.paypal_orders(org_id, paypal_order_id);

create table public.paypal_captures (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null,
  paypal_capture_id text not null,
  amount_minor bigint not null check (amount_minor > 0),
  fee_minor bigint,
  net_minor bigint,
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  reserved_minor bigint not null default 0 check (reserved_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, paypal_capture_id),
  unique (org_id, id),
  foreign key (org_id, order_id) references public.paypal_orders(org_id, id) on delete cascade
);
alter table public.paypal_orders add constraint paypal_orders_capture_fk foreign key (org_id, capture_id) references public.paypal_captures(org_id, id) deferrable initially deferred;
alter table public.transactions add constraint transactions_capture_fk foreign key (org_id, paypal_capture_id) references public.paypal_captures(org_id, paypal_capture_id);

create table public.paypal_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paypal',
  event_id text not null,
  org_id uuid references public.organizations(id) on delete set null,
  event_type text not null,
  raw_body bytea not null,
  payload jsonb not null,
  headers jsonb not null default '{}'::jsonb,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified','failed','error')),
  processing_status text not null default 'queued' check (processing_status in ('queued','processing','processed','retry','dead_letter','unverified')),
  attempts integer not null default 0 check (attempts >= 0),
  processing_started_at timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
create index paypal_events_pending_idx on public.paypal_events(processing_status, next_attempt_at, created_at);

create table public.approvals (
  id text not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  proposal_type text not null check (proposal_type in ('refund','dispute-evidence','hold-payout','send-invoice','other')),
  capture_id text,
  amount_minor bigint,
  currency text,
  status text not null default 'pending' check (status in ('pending','processing','approved','rejected','completed','pending_verification','failed')),
  decision_note text,
  reviewer_id uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  result jsonb,
  request_payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, capture_id) references public.paypal_captures(org_id, paypal_capture_id)
);
create index approvals_org_status_created_idx on public.approvals(org_id, status, created_at desc);

create table public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  status text not null check (status in ('clean','mismatch','failed')),
  currency text not null,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index reconciliation_runs_org_started_idx on public.reconciliation_runs(org_id, started_at desc);

create table public.api_activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  message text not null,
  ok boolean not null default true
);
create index api_activity_org_occurred_idx on public.api_activity(org_id, occurred_at desc);

create or replace function private.assert_journal_entry_balanced(p_org uuid, p_entry uuid)
returns void language plpgsql set search_path = '' as $$
declare v_debits numeric; v_credits numeric; v_count bigint;
begin
  if not exists (select 1 from public.journal_entries e where e.org_id=p_org and e.id=p_entry) then return; end if;
  select count(*), coalesce(sum(l.debit_minor),0), coalesce(sum(l.credit_minor),0)
    into v_count, v_debits, v_credits
    from public.journal_lines l where l.org_id=p_org and l.journal_entry_id=p_entry;
  if v_count < 2 or v_debits = 0 or v_debits <> v_credits then
    raise exception using errcode='23514', message='journal entry must have at least two lines and equal debits and credits';
  end if;
end
$$;

create or replace function private.check_journal_entry_balance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'journal_entries' then
    perform private.assert_journal_entry_balanced(coalesce(new.org_id, old.org_id), coalesce(new.id, old.id));
  else
    perform private.assert_journal_entry_balanced(coalesce(new.org_id, old.org_id), coalesce(new.journal_entry_id, old.journal_entry_id));
    if tg_op = 'UPDATE' and (old.org_id,old.journal_entry_id) is distinct from (new.org_id,new.journal_entry_id) then
      perform private.assert_journal_entry_balanced(old.org_id,old.journal_entry_id);
    end if;
  end if;
  return null;
end
$$;
revoke all on function private.assert_journal_entry_balanced(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.check_journal_entry_balance() from public,anon,authenticated,service_role;
create constraint trigger journal_entry_balance_on_entry
  after insert or update on public.journal_entries deferrable initially deferred
  for each row execute function private.check_journal_entry_balance();
create constraint trigger journal_entry_balance_on_line
  after insert or update or delete on public.journal_lines deferrable initially deferred
  for each row execute function private.check_journal_entry_balance();

create or replace function private.seed_default_accounts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.accounts(org_id,code,name,account_type,currency) values
    (new.id,'1000','PayPal Balance','asset','USD'),
    (new.id,'1010','PayPal Clearing','asset','USD'),
    (new.id,'1100','Accounts Receivable','asset','USD'),
    (new.id,'4000','Sales Revenue','revenue','USD'),
    (new.id,'4100','Donations','revenue','USD'),
    (new.id,'5000','PayPal Fees','expense','USD'),
    (new.id,'4050','Refunds','contra_revenue','USD'),
    (new.id,'2000','Accounts Payable','liability','USD'),
    (new.id,'5100','Maintenance Expense','expense','USD')
  on conflict (org_id,code) do nothing;
  return new;
end
$$;
revoke all on function private.seed_default_accounts() from public,anon,authenticated,service_role;
create trigger organizations_seed_financial_accounts after insert on public.organizations
  for each row execute function private.seed_default_accounts();
insert into public.accounts(org_id,code,name,account_type,currency)
select o.id, seed.code, seed.name, seed.account_type, 'USD'
from public.organizations o
cross join (values
  ('1000','PayPal Balance','asset'),('1010','PayPal Clearing','asset'),('1100','Accounts Receivable','asset'),
  ('4000','Sales Revenue','revenue'),('4100','Donations','revenue'),('5000','PayPal Fees','expense'),
  ('4050','Refunds','contra_revenue'),('2000','Accounts Payable','liability'),('5100','Maintenance Expense','expense')
) as seed(code,name,account_type)
on conflict (org_id,code) do nothing;

alter function public.create_organization_for_user(uuid,text,text) rename to create_organization_for_user_phase1;
create or replace function public.create_organization_for_user(p_user_id uuid, p_name text, p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_org uuid;
begin
  v_result := public.create_organization_for_user_phase1(p_user_id,p_name,p_request_id);
  v_org := (v_result->>'organizationId')::uuid;
  insert into public.accounts(org_id,code,name,account_type,currency) values
    (v_org,'1000','PayPal Balance','asset','USD'),(v_org,'1010','PayPal Clearing','asset','USD'),
    (v_org,'1100','Accounts Receivable','asset','USD'),(v_org,'4000','Sales Revenue','revenue','USD'),
    (v_org,'4100','Donations','revenue','USD'),(v_org,'5000','PayPal Fees','expense','USD'),
    (v_org,'4050','Refunds','contra_revenue','USD'),(v_org,'2000','Accounts Payable','liability','USD'),
    (v_org,'5100','Maintenance Expense','expense','USD') on conflict (org_id,code) do nothing;
  return v_result;
end
$$;
revoke all on function public.create_organization_for_user(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_organization_for_user(uuid,text,text) to service_role;
revoke all on function public.create_organization_for_user_phase1(uuid,text,text) from public,anon,authenticated,service_role;

create or replace function public.record_paypal_order(p_org uuid,p_request_key text,p_paypal_order_id text,p_amount_minor bigint,p_currency text,p_status text,p_approve_url text,p_state text default 'Created')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.paypal_orders;
begin
  if p_amount_minor not between 1 and 1000000 or p_currency <> 'USD' then raise exception using errcode='22023',message='invalid order amount'; end if;
  insert into public.paypal_orders(org_id,request_key,paypal_order_id,amount_minor,currency,status,approve_url,state)
    values(p_org,p_request_key,nullif(p_paypal_order_id,''),p_amount_minor,p_currency,p_status,p_approve_url,p_state)
    on conflict (org_id,request_key) do update set updated_at=now()
    returning * into v_row;
  if v_row.amount_minor<>p_amount_minor or v_row.currency<>p_currency then raise exception using errcode='23505',message='request key already used'; end if;
  if p_paypal_order_id is not null and p_paypal_order_id<>'' and v_row.paypal_order_id is null then
    update public.paypal_orders set paypal_order_id=p_paypal_order_id,status=p_status,approve_url=p_approve_url,state=p_state,updated_at=now()
      where org_id=p_org and id=v_row.id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end
$$;

create or replace function public.set_paypal_order_state(p_org uuid,p_paypal_order_id text,p_state text,p_status text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.paypal_orders;
begin
  update public.paypal_orders set state=p_state,status=coalesce(p_status,status),updated_at=now()
    where org_id=p_org and paypal_order_id=p_paypal_order_id returning * into v_row;
  if not found then raise exception using errcode='P0002',message='order not found'; end if;
  return to_jsonb(v_row);
end
$$;

create or replace function public.begin_paypal_capture(p_org uuid,p_paypal_order_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.paypal_orders;
begin
  select * into v_row from public.paypal_orders where org_id=p_org and paypal_order_id=p_paypal_order_id for update;
  if not found then return jsonb_build_object('result','missing'); end if;
  if v_row.capture_response is not null then return jsonb_build_object('result','complete','response',v_row.capture_response); end if;
  if v_row.state='Capturing' then return jsonb_build_object('result','busy'); end if;
  if v_row.state<>'Created' then return jsonb_build_object('result','unavailable','state',v_row.state); end if;
  update public.paypal_orders set state='Capturing',updated_at=now() where id=v_row.id returning * into v_row;
  return jsonb_build_object('result','started','order',to_jsonb(v_row));
end
$$;

create or replace function public.record_paypal_capture(p_org uuid,p_paypal_order_id text,p_capture jsonb,p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.paypal_orders; v_capture public.paypal_captures; v_id text; v_gross bigint; v_fee bigint; v_net bigint; v_currency text; v_status text; v_entry uuid; v_lines jsonb; v_existing jsonb;
begin
  select * into v_order from public.paypal_orders where org_id=p_org and paypal_order_id=p_paypal_order_id for update;
  if not found then raise exception using errcode='P0002',message='order not found'; end if;
  v_id := p_capture->>'id'; v_gross := (p_capture->'amount'->>'minor')::bigint;
  v_fee := nullif(p_capture->>'fee_minor','')::bigint; v_net := nullif(p_capture->>'net_minor','')::bigint;
  v_currency := p_capture->>'currency'; v_status := p_capture->>'status';
  if v_id is null or v_gross<=0 or v_currency<>v_order.currency or v_gross<>v_order.amount_minor then raise exception using errcode='22023',message='capture does not match order'; end if;
  select to_jsonb(c) into v_existing from public.paypal_captures c where c.org_id=p_org and c.paypal_capture_id=v_id;
  if v_existing is not null then return jsonb_build_object('capture',v_existing,'response',v_order.capture_response,'created',false); end if;
  insert into public.paypal_captures(org_id,order_id,paypal_capture_id,amount_minor,fee_minor,net_minor,currency,status,provider_payload)
    values(p_org,v_order.id,v_id,v_gross,v_fee,v_net,v_currency,v_status,p_capture->'provider_payload') returning * into v_capture;
  update public.paypal_orders set capture_id=v_capture.id,capture_response=jsonb_build_object('captureId',v_id,'orderId',p_paypal_order_id,'status',v_status,'amount',to_char(v_gross/100.0,'FM9999999990.00'),'currency',v_currency,'fee',case when v_fee is null then null else to_char(v_fee/100.0,'FM9999999990.00') end,'refunded',0),state=v_status,updated_at=now() where id=v_order.id;
  if v_status='COMPLETED' then
    insert into public.transactions(org_id,source_type,source_id,paypal_order_id,paypal_capture_id,status,amount_minor,fee_minor,net_minor,currency,occurred_at)
      values(p_org,'capture',v_id,p_paypal_order_id,v_id,v_status,v_gross,v_fee,v_net,v_currency,coalesce(nullif(p_capture->>'occurred_at','')::timestamptz,now())) on conflict(org_id,source_type,source_id) do nothing;
    insert into public.journal_entries(org_id,source_type,source_id,description,currency)
      values(p_org,'capture',v_id,'PayPal capture '||v_id,v_currency) on conflict(org_id,source_type,source_id) do nothing returning id into v_entry;
    if v_entry is not null then
      if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then raise exception using errcode='22023',message='capture posting lines are invalid'; end if;
      insert into public.journal_lines(org_id,journal_entry_id,account_id,debit_minor,credit_minor,currency)
      select p_org,v_entry,a.id,(l->>'debit_minor')::bigint,(l->>'credit_minor')::bigint,(l->>'currency')
      from jsonb_array_elements(p_lines) l join public.accounts a on a.org_id=p_org and a.code=l->>'account_code';
    end if;
  end if;
  select to_jsonb(c) into v_existing from public.paypal_captures c where c.id=v_capture.id;
  return jsonb_build_object('capture',v_existing,'response',(select capture_response from public.paypal_orders where id=v_order.id),'created',true);
end
$$;

create or replace function public.record_paypal_capture_event(p_paypal_order_id text,p_capture jsonb,p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_result jsonb;
begin
  select org_id into v_org from public.paypal_orders where paypal_order_id=p_paypal_order_id;
  if v_org is null then raise exception using errcode='P0002',message='event order not found'; end if;
  v_result:=public.record_paypal_capture(v_org,p_paypal_order_id,p_capture,p_lines);
  return jsonb_build_object('orgId',v_org,'result',v_result);
end
$$;

create or replace function public.register_refund_approval(p_org uuid,p_approval_id text,p_capture_id text,p_amount_minor bigint,p_currency text,p_created_by uuid,p_request_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_capture public.paypal_captures; v_row public.approvals;
begin
  select * into v_capture from public.paypal_captures where org_id=p_org and paypal_capture_id=p_capture_id for update;
  if not found or v_capture.status<>'COMPLETED' then raise exception using errcode='P0002',message='capture unavailable'; end if;
  if p_currency<>v_capture.currency or p_amount_minor<=0 then raise exception using errcode='22023',message='invalid refund'; end if;
  if p_amount_minor>v_capture.amount_minor-v_capture.refunded_minor-v_capture.reserved_minor then raise exception using errcode='22003',message='refund amount exceeds remaining amount'; end if;
  insert into public.approvals(org_id,id,proposal_type,capture_id,amount_minor,currency,request_payload,created_by)
    values(p_org,p_approval_id,'refund',p_capture_id,p_amount_minor,p_currency,p_request_payload,p_created_by)
    on conflict(org_id,id) do nothing;
  select * into v_row from public.approvals where org_id=p_org and id=p_approval_id;
  if v_row.capture_id<>p_capture_id or v_row.amount_minor<>p_amount_minor or v_row.currency<>p_currency then raise exception using errcode='23505',message='approval reference already linked differently'; end if;
  return to_jsonb(v_row);
end
$$;

create or replace function public.decide_refund_approval(p_org uuid,p_approval_id text,p_decision text,p_note text,p_reviewer uuid,p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.approvals; v_capture public.paypal_captures;
begin
  if p_decision not in ('approve','reject') then raise exception using errcode='22023',message='invalid decision'; end if;
  select * into v_row from public.approvals where org_id=p_org and id=p_approval_id for update;
  if not found then raise exception using errcode='P0002',message='approval not found'; end if;
  if v_row.status in ('processing','completed','pending_verification') then return jsonb_build_object('result','already_submitted','approval',to_jsonb(v_row)); end if;
  if v_row.status<>'pending' then return jsonb_build_object('result','already_decided','approval',to_jsonb(v_row)); end if;
  if p_decision='approve' then
    select * into v_capture from public.paypal_captures where org_id=p_org and paypal_capture_id=v_row.capture_id for update;
    if not found or v_row.amount_minor>v_capture.amount_minor-v_capture.refunded_minor-v_capture.reserved_minor then raise exception using errcode='22003',message='refund amount exceeds remaining amount'; end if;
    update public.paypal_captures set reserved_minor=reserved_minor+v_row.amount_minor where id=v_capture.id;
    update public.approvals set status='processing',decision_note=p_note,reviewer_id=p_reviewer,decided_at=now(),updated_at=now() where org_id=p_org and id=p_approval_id returning * into v_row;
  else
    update public.approvals set status='rejected',decision_note=p_note,reviewer_id=p_reviewer,decided_at=now(),updated_at=now() where org_id=p_org and id=p_approval_id returning * into v_row;
  end if;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_reviewer,'approval.'||p_decision,'approval',p_approval_id,jsonb_build_object('decision',p_decision,'note',p_note),p_request_id);
  return jsonb_build_object('result','decided','approval',to_jsonb(v_row));
end
$$;

create or replace function public.finish_refund(p_org uuid,p_approval_id text,p_refund jsonb,p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_approval public.approvals; v_capture public.paypal_captures; v_gross bigint; v_fee bigint; v_net bigint; v_id text; v_status text; v_entry uuid; v_lines jsonb;
begin
  select * into v_approval from public.approvals where org_id=p_org and id=p_approval_id for update;
  if not found then raise exception using errcode='P0002',message='approval not found'; end if;
  if v_approval.status='completed' then return to_jsonb(v_approval); end if;
  if v_approval.status not in ('processing','pending_verification') then raise exception using errcode='22023',message='approval is not processing'; end if;
  v_id:=p_refund->>'id'; v_status:=p_refund->>'status';
  v_gross:=coalesce(nullif(p_refund->'seller_payable_breakdown'->'gross_amount'->>'value','')::numeric*100,nullif(p_refund->'amount'->>'value','')::numeric*100)::bigint;
  v_fee:=nullif(p_refund->'seller_payable_breakdown'->'paypal_fee'->>'value','')::numeric*100;
  v_net:=nullif(p_refund->'seller_payable_breakdown'->'net_amount'->>'value','')::numeric*100;
  if v_id is null or v_status<>'COMPLETED' or v_gross<>v_approval.amount_minor then raise exception using errcode='22023',message='incomplete completed refund details'; end if;
  select * into v_capture from public.paypal_captures where org_id=p_org and paypal_capture_id=v_approval.capture_id for update;
  insert into public.transactions(org_id,source_type,source_id,paypal_capture_id,paypal_refund_id,status,amount_minor,fee_minor,net_minor,currency,occurred_at)
    values(p_org,'refund',v_id,v_approval.capture_id,v_id,v_status,v_gross,v_fee,v_net,v_approval.currency,coalesce(nullif(p_refund->>'update_time','')::timestamptz,now())) on conflict(org_id,source_type,source_id) do nothing;
  insert into public.journal_entries(org_id,source_type,source_id,description,currency)
    values(p_org,'refund',v_id,'PayPal refund '||v_id,v_approval.currency) on conflict(org_id,source_type,source_id) do nothing returning id into v_entry;
  if v_entry is not null then
    if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<2 then raise exception using errcode='22023',message='refund posting lines are invalid'; end if;
    insert into public.journal_lines(org_id,journal_entry_id,account_id,debit_minor,credit_minor,currency)
    select p_org,v_entry,a.id,(l->>'debit_minor')::bigint,(l->>'credit_minor')::bigint,(l->>'currency')
    from jsonb_array_elements(p_lines) l join public.accounts a on a.org_id=p_org and a.code=l->>'account_code';
  end if;
  update public.paypal_captures set reserved_minor=greatest(0,reserved_minor-v_approval.amount_minor),refunded_minor=refunded_minor+v_approval.amount_minor where id=v_capture.id;
  update public.approvals set status='completed',result=p_refund,updated_at=now() where org_id=p_org and id=p_approval_id returning * into v_approval;
  return to_jsonb(v_approval);
end
$$;

create or replace function public.set_refund_outcome(p_org uuid,p_approval_id text,p_status text,p_result jsonb,p_error text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.approvals; v_capture public.paypal_captures;
begin
  select * into v_row from public.approvals where org_id=p_org and id=p_approval_id for update;
  if not found then raise exception using errcode='P0002',message='approval not found'; end if;
  if p_status in ('approved','pending','failed') then
    select * into v_capture from public.paypal_captures where org_id=p_org and paypal_capture_id=v_row.capture_id for update;
    update public.paypal_captures set reserved_minor=greatest(0,reserved_minor-v_row.amount_minor) where id=v_capture.id;
  end if;
  update public.approvals set status=p_status,result=p_result,updated_at=now() where org_id=p_org and id=p_approval_id returning * into v_row;
  return to_jsonb(v_row);
end
$$;

create or replace function public.receive_paypal_event(p_event_id text,p_event_type text,p_raw_body text,p_payload jsonb,p_headers jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.paypal_events(provider,event_id,event_type,raw_body,payload,headers,verification_status,processing_status)
    values('paypal',p_event_id,p_event_type,decode(p_raw_body,'base64'),p_payload,p_headers,'unverified','queued')
    on conflict(provider,event_id) do update set event_id=excluded.event_id returning id into v_id;
  return v_id;
end
$$;

create or replace function public.claim_paypal_event(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.paypal_events;
begin
  update public.paypal_events set processing_status='processing',attempts=attempts+1,processing_started_at=now()
    where id=p_id and (processing_status in ('queued','retry') and (next_attempt_at is null or next_attempt_at<=now()) or (processing_status='processing' and processing_started_at<now()-interval '2 minutes'))
    returning * into v_row;
  if not found then return null; end if;
  return to_jsonb(v_row);
end
$$;

create or replace function public.complete_paypal_event(p_id uuid,p_verification text,p_org uuid,p_status text,p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.paypal_events set verification_status=p_verification,org_id=p_org,processing_status=p_status,
    last_error=p_error,processed_at=case when p_status='processed' then now() else processed_at end,
    next_attempt_at=case when p_status='retry' then now()+interval '30 seconds' else null end,processing_started_at=null where id=p_id;
end
$$;

create or replace function public.list_pending_paypal_events()
returns setof public.paypal_events language sql security definer set search_path = '' as $$
  select * from public.paypal_events where (processing_status in ('queued','retry') and (next_attempt_at is null or next_attempt_at<=now())) or (processing_status='processing' and processing_started_at<now()-interval '2 minutes') order by created_at limit 100
$$;

create or replace function public.reconcile_org_financials(p_org uuid,p_currency text default 'USD')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_expected_capture numeric; v_ledger_capture numeric; v_expected_refund numeric; v_ledger_refund numeric; v_status text; v_details jsonb; v_run public.reconciliation_runs;
begin
  select coalesce(sum(amount_minor),0) into v_expected_capture from public.transactions where org_id=p_org and source_type='capture' and status='COMPLETED' and currency=p_currency;
  select coalesce(sum(l.credit_minor-l.debit_minor),0) into v_ledger_capture from public.journal_entries e join public.journal_lines l on l.org_id=e.org_id and l.journal_entry_id=e.id join public.accounts a on a.org_id=l.org_id and a.id=l.account_id where e.org_id=p_org and e.source_type='capture' and e.currency=p_currency and a.code='4000';
  select coalesce(sum(amount_minor),0) into v_expected_refund from public.transactions where org_id=p_org and source_type='refund' and status='COMPLETED' and currency=p_currency;
  select coalesce(sum(l.debit_minor-l.credit_minor),0) into v_ledger_refund from public.journal_entries e join public.journal_lines l on l.org_id=e.org_id and l.journal_entry_id=e.id join public.accounts a on a.org_id=l.org_id and a.id=l.account_id where e.org_id=p_org and e.source_type='refund' and e.currency=p_currency and a.code='4050';
  v_status:=case when v_expected_capture=v_ledger_capture and v_expected_refund=v_ledger_refund then 'clean' else 'mismatch' end;
  v_details:=jsonb_build_object('capturedMinor',v_expected_capture,'ledgerCapturedMinor',v_ledger_capture,'refundedMinor',v_expected_refund,'ledgerRefundedMinor',v_ledger_refund);
  insert into public.reconciliation_runs(org_id,status,currency,details,completed_at) values(p_org,v_status,p_currency,v_details,now()) returning * into v_run;
  return to_jsonb(v_run);
end
$$;

create or replace function public.get_org_trial_balance(p_org uuid,p_currency text default 'USD')
returns jsonb language sql security definer set search_path = '' as $$
  with totals as (
    select a.id,a.code,a.name,a.account_type,
      coalesce(sum(l.debit_minor),0)::numeric as debit_minor,
      coalesce(sum(l.credit_minor),0)::numeric as credit_minor
    from public.accounts a left join public.journal_lines l on l.org_id=a.org_id and l.account_id=a.id and l.currency=p_currency
    where a.org_id=p_org and a.currency=p_currency group by a.id,a.code,a.name,a.account_type
  ), aggregate_totals as (
    select coalesce(sum(debit_minor),0) debit,coalesce(sum(credit_minor),0) credit from totals
  )
  select jsonb_build_object(
    'currency',p_currency,
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('code',code,'name',name,'type',account_type,'debitMinor',debit_minor,'creditMinor',credit_minor,'debit',to_char(debit_minor/100,'FM999999999999990.00'),'credit',to_char(credit_minor/100,'FM999999999999990.00')) order by code) from totals),'[]'::jsonb),
    'totals',(select jsonb_build_object('debitMinor',debit,'creditMinor',credit,'debits',to_char(debit/100,'FM999999999999990.00'),'credits',to_char(credit/100,'FM999999999999990.00')) from aggregate_totals),
    'balanced',(select debit=credit from aggregate_totals)
  )
$$;

alter table public.accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.transactions enable row level security;
alter table public.paypal_orders enable row level security;
alter table public.paypal_captures enable row level security;
alter table public.paypal_events enable row level security;
alter table public.approvals enable row level security;
alter table public.reconciliation_runs enable row level security;
alter table public.api_activity enable row level security;

do $$ declare t text; begin
  foreach t in array array['accounts','journal_entries','journal_lines','transactions','paypal_orders','paypal_captures','approvals','reconciliation_runs','api_activity'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(org_id))',t||'_select_member',t);
  end loop;
end $$;
create policy paypal_events_select_admin on public.paypal_events for select to authenticated using (org_id is not null and private.has_role(org_id,array['owner','admin']));
revoke all on public.accounts,public.journal_entries,public.journal_lines,public.transactions,public.paypal_orders,public.paypal_captures,public.paypal_events,public.approvals,public.reconciliation_runs,public.api_activity from public,anon,authenticated;
grant select on public.accounts,public.journal_entries,public.journal_lines,public.transactions,public.paypal_orders,public.paypal_captures,public.paypal_events,public.approvals,public.reconciliation_runs,public.api_activity to authenticated;
grant all on public.accounts,public.journal_entries,public.journal_lines,public.transactions,public.paypal_orders,public.paypal_captures,public.paypal_events,public.approvals,public.reconciliation_runs,public.api_activity to service_role;

revoke all on function public.record_paypal_order(uuid,text,text,bigint,text,text,text,text) from public,anon,authenticated;
revoke all on function public.set_paypal_order_state(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.begin_paypal_capture(uuid,text) from public,anon,authenticated;
revoke all on function public.record_paypal_capture(uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.record_paypal_capture_event(text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.register_refund_approval(uuid,text,text,bigint,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.decide_refund_approval(uuid,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.finish_refund(uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.set_refund_outcome(uuid,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.receive_paypal_event(text,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.claim_paypal_event(uuid) from public,anon,authenticated;
revoke all on function public.complete_paypal_event(uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.list_pending_paypal_events() from public,anon,authenticated;
revoke all on function public.reconcile_org_financials(uuid,text) from public,anon,authenticated;
revoke all on function public.get_org_trial_balance(uuid,text) from public,anon,authenticated;
grant execute on function public.record_paypal_order(uuid,text,text,bigint,text,text,text,text) to service_role;
grant execute on function public.set_paypal_order_state(uuid,text,text,text) to service_role;
grant execute on function public.begin_paypal_capture(uuid,text) to service_role;
grant execute on function public.record_paypal_capture(uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.record_paypal_capture_event(text,jsonb,jsonb) to service_role;
grant execute on function public.register_refund_approval(uuid,text,text,bigint,text,uuid,jsonb) to service_role;
grant execute on function public.decide_refund_approval(uuid,text,text,text,uuid,text) to service_role;
grant execute on function public.finish_refund(uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.set_refund_outcome(uuid,text,text,jsonb,text) to service_role;
grant execute on function public.receive_paypal_event(text,text,text,jsonb,jsonb) to service_role;
grant execute on function public.claim_paypal_event(uuid) to service_role;
grant execute on function public.complete_paypal_event(uuid,text,uuid,text,text) to service_role;
grant execute on function public.list_pending_paypal_events() to service_role;
grant execute on function public.reconcile_org_financials(uuid,text) to service_role;
grant execute on function public.get_org_trial_balance(uuid,text) to service_role;
