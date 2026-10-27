create table public.fx_rates (
  org_id uuid not null references public.organizations(id) on delete cascade,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text not null check (quote_currency ~ '^[A-Z]{3}$'),
  rate numeric(30,15) not null check (rate > 0),
  fetched_at timestamptz not null,
  source text not null,
  primary key (org_id, base_currency, quote_currency)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_number text not null,
  state text not null default 'draft' check (state in ('draft','reviewed','sent','paid','void')),
  customer_name text not null,
  customer_email text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  total_minor bigint not null check (total_minor > 0),
  paypal_invoice_id text,
  paypal_payment_id text,
  paypal_capture_id text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, invoice_number),
  unique (paypal_invoice_id)
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  invoice_id uuid not null,
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  tax_rate numeric(7,4) not null default 0 check (tax_rate between 0 and 1),
  line_subtotal_minor bigint not null check (line_subtotal_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  line_total_minor bigint not null check (line_total_minor >= 0),
  created_at timestamptz not null default now(),
  foreign key (org_id, invoice_id) references public.invoices(org_id, id) on delete cascade
);

create table public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  invoice_id uuid not null,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (org_id, invoice_id) references public.invoices(org_id, id) on delete cascade
);

alter table public.invoices add constraint invoices_capture_fk
  foreign key (org_id,paypal_capture_id) references public.paypal_captures(org_id,paypal_capture_id);

create or replace function private.link_invoice_capture()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.invoices set paypal_capture_id=new.paypal_capture_id,updated_at=now()
  where org_id=new.org_id and paypal_payment_id=new.paypal_capture_id and paypal_capture_id is null;
  return new;
end
$$;
revoke all on function private.link_invoice_capture() from public,anon,authenticated,service_role;
create trigger invoices_link_capture after insert on public.paypal_captures
for each row execute function private.link_invoice_capture();

alter table public.approvals add column invoice_id uuid;
alter table public.approvals add constraint approvals_invoice_fk
  foreign key (org_id, invoice_id) references public.invoices(org_id, id) on delete cascade;

alter table public.fx_rates enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_events enable row level security;

create policy fx_rates_select_member on public.fx_rates for select to authenticated using (private.is_member(org_id));
create policy invoices_select_member on public.invoices for select to authenticated using (private.is_member(org_id));
create policy invoice_lines_select_member on public.invoice_lines for select to authenticated using (private.is_member(org_id));
create policy invoice_events_select_member on public.invoice_events for select to authenticated using (private.is_member(org_id));

revoke all on public.fx_rates, public.invoices, public.invoice_lines, public.invoice_events from public, anon, authenticated;
grant select on public.fx_rates, public.invoices, public.invoice_lines, public.invoice_events to authenticated;
grant all on public.fx_rates, public.invoices, public.invoice_lines, public.invoice_events to service_role;
grant all on public.approvals to service_role;

create or replace function public.create_invoice_draft(p_org uuid, p_invoice jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices; v_line jsonb; v_subtotal bigint:=0; v_tax bigint:=0; v_total bigint:=0;
begin
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1 then raise exception using errcode='22023',message='invoice requires lines'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_subtotal:=v_subtotal+(v_line->>'line_subtotal_minor')::bigint;
    v_tax:=v_tax+(v_line->>'tax_minor')::bigint;
    v_total:=v_total+(v_line->>'line_total_minor')::bigint;
  end loop;
  if v_subtotal<>(p_invoice->>'subtotal_minor')::bigint or v_tax<>(p_invoice->>'tax_minor')::bigint or v_total<>(p_invoice->>'total_minor')::bigint then
    raise exception using errcode='22023',message='invoice totals do not match computed lines';
  end if;
  insert into public.invoices(org_id,invoice_number,customer_name,customer_email,currency,subtotal_minor,tax_minor,total_minor,created_by)
  values(p_org,p_invoice->>'invoice_number',p_invoice->>'customer_name',p_invoice->>'customer_email',p_invoice->>'currency',
    (p_invoice->>'subtotal_minor')::bigint,(p_invoice->>'tax_minor')::bigint,(p_invoice->>'total_minor')::bigint,(p_invoice->>'created_by')::uuid)
  returning * into v_invoice;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.invoice_lines(org_id,invoice_id,description,quantity,unit_price_minor,tax_rate,line_subtotal_minor,tax_minor,line_total_minor)
    values(p_org,v_invoice.id,v_line->>'description',(v_line->>'quantity')::numeric,(v_line->>'unit_price_minor')::bigint,
      (v_line->>'tax_rate')::numeric,(v_line->>'line_subtotal_minor')::bigint,(v_line->>'tax_minor')::bigint,(v_line->>'line_total_minor')::bigint);
  end loop;
  insert into public.invoice_events(org_id,invoice_id,event_type,actor_id,details) values(p_org,v_invoice.id,'draft.created',v_invoice.created_by,'{}'::jsonb);
  return to_jsonb(v_invoice);
end
$$;

create or replace function public.set_invoice_state(p_org uuid,p_invoice_id uuid,p_state text,p_actor uuid,p_details jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where org_id=p_org and id=p_invoice_id for update;
  if not found then raise exception using errcode='P0002',message='invoice not found'; end if;
  if not ((v_invoice.state='draft' and p_state='reviewed') or (v_invoice.state in ('draft','reviewed') and p_state='void')) then
    raise exception using errcode='22023',message='invalid invoice state transition';
  end if;
  update public.invoices set state=p_state,updated_at=now() where org_id=p_org and id=p_invoice_id returning * into v_invoice;
  insert into public.invoice_events(org_id,invoice_id,event_type,actor_id,details) values(p_org,p_invoice_id,'state.'||p_state,p_actor,coalesce(p_details,'{}'::jsonb));
  return to_jsonb(v_invoice);
end
$$;

create or replace function public.set_invoice_paypal_draft(p_org uuid,p_invoice_id uuid,p_paypal_invoice_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices;
begin
  update public.invoices set paypal_invoice_id=p_paypal_invoice_id,updated_at=now()
  where org_id=p_org and id=p_invoice_id and state='reviewed'
    and (paypal_invoice_id is null or paypal_invoice_id=p_paypal_invoice_id)
  returning * into v_invoice;
  if not found then raise exception using errcode='22023',message='invoice cannot be linked to this PayPal draft'; end if;
  return to_jsonb(v_invoice);
end
$$;

create or replace function public.request_invoice_send_approval(p_org uuid,p_invoice_id uuid,p_approval_id text,p_actor uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices; v_approval public.approvals;
begin
  select * into v_invoice from public.invoices where org_id=p_org and id=p_invoice_id for update;
  if not found or v_invoice.state<>'reviewed' then raise exception using errcode='22023',message='invoice must be reviewed'; end if;
  select * into v_approval from public.approvals where org_id=p_org and invoice_id=p_invoice_id and proposal_type='send-invoice' and status in ('pending','processing') order by created_at desc limit 1;
  if found then return to_jsonb(v_approval); end if;
  insert into public.approvals(org_id,id,proposal_type,invoice_id,created_by,request_payload)
  values(p_org,p_approval_id,'send-invoice',p_invoice_id,p_actor,p_payload) on conflict(org_id,id) do nothing;
  select * into v_approval from public.approvals where org_id=p_org and id=p_approval_id;
  if v_approval.proposal_type<>'send-invoice' or v_approval.invoice_id<>p_invoice_id then raise exception using errcode='23505',message='approval id already used'; end if;
  insert into public.invoice_events(org_id,invoice_id,event_type,actor_id,details) values(p_org,p_invoice_id,'send.requested',p_actor,jsonb_build_object('approvalId',p_approval_id));
  return to_jsonb(v_approval);
end
$$;

create or replace function public.decide_invoice_send_approval(p_org uuid,p_approval_id text,p_decision text,p_note text,p_reviewer uuid,p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_approval public.approvals;
begin
  select * into v_approval from public.approvals where org_id=p_org and id=p_approval_id and proposal_type='send-invoice' for update;
  if not found then raise exception using errcode='P0002',message='invoice approval not found'; end if;
  if v_approval.status<>'pending' then return jsonb_build_object('result','already_decided','approval',to_jsonb(v_approval)); end if;
  if p_decision not in ('approve','reject') then raise exception using errcode='22023',message='invalid decision'; end if;
  update public.approvals set status=case when p_decision='approve' then 'processing' else 'rejected' end,
    decision_note=p_note,reviewer_id=p_reviewer,decided_at=now(),updated_at=now()
  where org_id=p_org and id=p_approval_id returning * into v_approval;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_reviewer,'approval.'||p_decision,'invoice',v_approval.invoice_id::text,jsonb_build_object('approvalId',p_approval_id,'note',p_note),p_request_id);
  insert into public.invoice_events(org_id,invoice_id,event_type,actor_id,details)
    values(p_org,v_approval.invoice_id,'send.approval.'||p_decision,p_reviewer,jsonb_build_object('approvalId',p_approval_id,'note',p_note));
  return jsonb_build_object('result','decided','approval',to_jsonb(v_approval));
end
$$;

create or replace function public.complete_invoice_send(p_org uuid,p_approval_id text,p_paypal_invoice_id text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_approval public.approvals; v_invoice public.invoices;
begin
  select * into v_approval from public.approvals where org_id=p_org and id=p_approval_id and proposal_type='send-invoice' for update;
  if not found or v_approval.status not in ('processing','completed') then raise exception using errcode='22023',message='invoice approval is not processing'; end if;
  if v_approval.status='completed' then return to_jsonb(v_approval); end if;
  select * into v_invoice from public.invoices where org_id=p_org and id=v_approval.invoice_id for update;
  if not found or v_invoice.state not in ('reviewed','sent','paid') then raise exception using errcode='22023',message='invoice state changed'; end if;
  update public.invoices set state=case when state='reviewed' then 'sent' else state end,
    paypal_invoice_id=p_paypal_invoice_id,sent_at=coalesce(sent_at,now()),updated_at=now()
    where org_id=p_org and id=v_approval.invoice_id returning * into v_invoice;
  update public.approvals set status='completed',result=p_result,updated_at=now() where org_id=p_org and id=p_approval_id returning * into v_approval;
  insert into public.invoice_events(org_id,invoice_id,event_type,actor_id,details)
    values(p_org,v_invoice.id,'sent',v_approval.reviewer_id,jsonb_build_object('paypalInvoiceId',p_paypal_invoice_id));
  return to_jsonb(v_approval);
end
$$;

create or replace function public.fail_invoice_send(p_org uuid,p_approval_id text,p_error jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_approval public.approvals;
begin
  update public.approvals set status='failed',result=p_error,updated_at=now()
  where org_id=p_org and id=p_approval_id and proposal_type='send-invoice' returning * into v_approval;
  if not found then raise exception using errcode='P0002',message='invoice approval not found'; end if;
  return to_jsonb(v_approval);
end
$$;

create or replace function public.mark_invoice_paid(p_paypal_invoice_id text,p_event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices; v_resource jsonb; v_payment_id text; v_status text;
begin
  v_resource:=coalesce(p_event->'resource','{}'::jsonb);
  v_status:=upper(coalesce(v_resource->>'status',''));
  if v_status not in ('PAID','PAID_EXTERNAL','MARKED_AS_PAID') then return jsonb_build_object('updated',false); end if;
  v_payment_id:=coalesce(v_resource->'payments'->0->>'payment_id',v_resource->'payments'->0->>'transaction_id');
  update public.invoices set state='paid',paid_at=now(),paypal_payment_id=v_payment_id,
    paypal_capture_id=(select c.paypal_capture_id from public.paypal_captures c where c.org_id=invoices.org_id and c.paypal_capture_id=v_payment_id limit 1),updated_at=now()
  where paypal_invoice_id=p_paypal_invoice_id and state in ('reviewed','sent') returning * into v_invoice;
  if not found then return jsonb_build_object('updated',false); end if;
  insert into public.invoice_events(org_id,invoice_id,event_type,details)
    values(v_invoice.org_id,v_invoice.id,'paid.webhook',jsonb_build_object('eventId',p_event->>'id','eventType',p_event->>'event_type','status',v_status,'payments',coalesce(v_resource->'payments','[]'::jsonb)));
  return jsonb_build_object('updated',true,'orgId',v_invoice.org_id,'invoiceId',v_invoice.id);
end
$$;

do $$
declare f record;
begin
  for f in select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('create_invoice_draft','set_invoice_state','set_invoice_paypal_draft','request_invoice_send_approval','decide_invoice_send_approval','complete_invoice_send','fail_invoice_send','mark_invoice_paid')
  loop
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated',f.proname,f.args);
    execute format('grant execute on function public.%I(%s) to service_role',f.proname,f.args);
  end loop;
end
$$;

create view public.report_profit_and_loss with (security_invoker = true) as
select e.org_id,date_trunc('month',e.created_at)::date as period,e.currency,a.code,a.name,a.account_type,
  sum(case when a.account_type='revenue' then l.credit_minor-l.debit_minor
           when a.account_type='contra_revenue' then l.debit_minor-l.credit_minor
           when a.account_type='expense' then l.debit_minor-l.credit_minor else 0 end)::bigint as amount_minor
from public.journal_entries e join public.journal_lines l on l.org_id=e.org_id and l.journal_entry_id=e.id
join public.accounts a on a.org_id=l.org_id and a.id=l.account_id
where a.account_type in ('revenue','contra_revenue','expense')
group by e.org_id,date_trunc('month',e.created_at)::date,e.currency,a.code,a.name,a.account_type;

create view public.report_fee_summary with (security_invoker = true) as
select org_id,period,currency,sum(amount_minor)::bigint as fee_minor
from public.report_profit_and_loss where code='5000'
group by org_id,period,currency;

create view public.report_trial_balance with (security_invoker = true) as
select e.org_id,date_trunc('month',e.created_at)::date as period,e.currency,a.code,a.name,a.account_type,
  sum(l.debit_minor)::bigint as debit_minor,sum(l.credit_minor)::bigint as credit_minor,
  sum(l.debit_minor-l.credit_minor)::bigint as balance_minor
from public.journal_entries e join public.journal_lines l on l.org_id=e.org_id and l.journal_entry_id=e.id
join public.accounts a on a.org_id=l.org_id and a.id=l.account_id
group by e.org_id,date_trunc('month',e.created_at)::date,e.currency,a.code,a.name,a.account_type;

create view public.report_refunds_summary with (security_invoker = true) as
select e.org_id,date_trunc('month',e.created_at)::date as period,e.currency,
  count(distinct e.id)::bigint as refund_count,
  sum(case when a.code='4050' then l.debit_minor-l.credit_minor else 0 end)::bigint as refund_minor
from public.journal_entries e join public.journal_lines l on l.org_id=e.org_id and l.journal_entry_id=e.id
join public.accounts a on a.org_id=l.org_id and a.id=l.account_id
where e.source_type='refund' and a.code='4050'
group by e.org_id,date_trunc('month',e.created_at)::date,e.currency;

create view public.report_cash_movement with (security_invoker = true) as
select e.org_id,date_trunc('month',e.created_at)::date as period,e.currency,
  sum(case when a.code in ('1000','1010') then l.debit_minor-l.credit_minor else 0 end)::bigint as cash_movement_minor
from public.journal_entries e join public.journal_lines l on l.org_id=e.org_id and l.journal_entry_id=e.id
join public.accounts a on a.org_id=l.org_id and a.id=l.account_id
where a.code in ('1000','1010')
group by e.org_id,date_trunc('month',e.created_at)::date,e.currency;

grant select on public.report_profit_and_loss,public.report_trial_balance,public.report_fee_summary,public.report_refunds_summary,public.report_cash_movement to authenticated,service_role;
