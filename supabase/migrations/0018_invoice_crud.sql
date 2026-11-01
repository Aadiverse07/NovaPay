alter table public.invoices
  add column issue_date date not null default current_date,
  add column due_date date not null default (current_date + 14),
  add column notes text not null default '',
  add constraint invoices_due_after_issue check (due_date >= issue_date);

create table public.invoice_crud_requests (
  org_id uuid not null references public.organizations(id) on delete cascade,
  request_key uuid not null,
  action text not null check (action in ('create', 'delete')),
  invoice_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (org_id, request_key)
);
alter table public.invoice_crud_requests enable row level security;
revoke all on public.invoice_crud_requests from public, anon, authenticated;
grant all on public.invoice_crud_requests to service_role;

create or replace function public.create_invoice_draft_idempotent(
  p_org uuid, p_request_key uuid, p_invoice jsonb, p_lines jsonb, p_actor uuid, p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices; v_created jsonb; v_existing public.invoice_crud_requests;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_request_key::text, 0));
  select * into v_existing from public.invoice_crud_requests where org_id=p_org and request_key=p_request_key;
  if found then
    if v_existing.action <> 'create' then raise exception using errcode='23505', message='idempotency key was used for another action'; end if;
    select * into v_invoice from public.invoices where org_id=p_org and id=v_existing.invoice_id;
    if not found then raise exception using errcode='P0002', message='invoice no longer exists'; end if;
    return jsonb_build_object('invoice',to_jsonb(v_invoice),'replayed',true);
  end if;
  if (p_invoice->>'created_by')::uuid <> p_actor then raise exception using errcode='42501', message='invoice actor mismatch'; end if;
  v_created := public.create_invoice_draft(p_org,p_invoice,p_lines);
  update public.invoices set
    issue_date=coalesce(nullif(p_invoice->>'issue_date','')::date,current_date),
    due_date=coalesce(nullif(p_invoice->>'due_date','')::date,current_date+14),
    notes=coalesce(p_invoice->>'notes','')
  where org_id=p_org and id=(v_created->>'id')::uuid returning * into v_invoice;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'invoice.created','invoice',v_invoice.id::text,jsonb_build_object('invoiceNumber',v_invoice.invoice_number,'state',v_invoice.state),coalesce(p_request_id,''));
  insert into public.invoice_crud_requests(org_id,request_key,action,invoice_id) values(p_org,p_request_key,'create',v_invoice.id);
  return jsonb_build_object('invoice',to_jsonb(v_invoice),'replayed',false);
end
$$;

create or replace function public.update_invoice_draft(
  p_org uuid, p_invoice_id uuid, p_invoice jsonb, p_lines jsonb, p_actor uuid, p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices; v_line jsonb; v_subtotal bigint:=0; v_tax bigint:=0; v_total bigint:=0;
begin
  select * into v_invoice from public.invoices where org_id=p_org and id=p_invoice_id for update;
  if not found then raise exception using errcode='P0002',message='invoice not found'; end if;
  if v_invoice.state<>'draft' then raise exception using errcode='22023',message='only draft invoices can be edited'; end if;
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1 then raise exception using errcode='22023',message='invoice requires lines'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_subtotal:=v_subtotal+(v_line->>'line_subtotal_minor')::bigint;
    v_tax:=v_tax+(v_line->>'tax_minor')::bigint;
    v_total:=v_total+(v_line->>'line_total_minor')::bigint;
  end loop;
  if v_subtotal<>(p_invoice->>'subtotal_minor')::bigint or v_tax<>(p_invoice->>'tax_minor')::bigint or v_total<>(p_invoice->>'total_minor')::bigint then
    raise exception using errcode='22023',message='invoice totals do not match computed lines';
  end if;
  update public.invoices set invoice_number=p_invoice->>'invoice_number',customer_name=p_invoice->>'customer_name',
    customer_email=p_invoice->>'customer_email',currency=p_invoice->>'currency',subtotal_minor=v_subtotal,tax_minor=v_tax,total_minor=v_total,
    issue_date=(p_invoice->>'issue_date')::date,due_date=(p_invoice->>'due_date')::date,notes=coalesce(p_invoice->>'notes',''),updated_at=now()
    where org_id=p_org and id=p_invoice_id returning * into v_invoice;
  delete from public.invoice_lines where org_id=p_org and invoice_id=p_invoice_id;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    insert into public.invoice_lines(org_id,invoice_id,description,quantity,unit_price_minor,tax_rate,line_subtotal_minor,tax_minor,line_total_minor)
      values(p_org,p_invoice_id,v_line->>'description',(v_line->>'quantity')::numeric,(v_line->>'unit_price_minor')::bigint,
        (v_line->>'tax_rate')::numeric,(v_line->>'line_subtotal_minor')::bigint,(v_line->>'tax_minor')::bigint,(v_line->>'line_total_minor')::bigint);
  end loop;
  insert into public.invoice_events(org_id,invoice_id,event_type,actor_id,details) values(p_org,p_invoice_id,'draft.updated',p_actor,'{}'::jsonb);
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'invoice.updated','invoice',p_invoice_id::text,jsonb_build_object('state','draft'),coalesce(p_request_id,''));
  return to_jsonb(v_invoice);
end
$$;

create or replace function public.reopen_invoice_draft(p_org uuid,p_invoice_id uuid,p_actor uuid,p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where org_id=p_org and id=p_invoice_id for update;
  if not found then raise exception using errcode='P0002',message='invoice not found'; end if;
  if v_invoice.state='draft' then return to_jsonb(v_invoice); end if;
  if v_invoice.state<>'reviewed' then raise exception using errcode='22023',message='only reviewed invoices can return to draft'; end if;
  update public.invoices set state='draft',updated_at=now() where org_id=p_org and id=p_invoice_id returning * into v_invoice;
  insert into public.invoice_events(org_id,invoice_id,event_type,actor_id,details) values(p_org,p_invoice_id,'state.draft',p_actor,'{}'::jsonb);
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'invoice.reopened','invoice',p_invoice_id::text,jsonb_build_object('from','reviewed','to','draft'),coalesce(p_request_id,''));
  return to_jsonb(v_invoice);
end
$$;

create or replace function public.delete_invoice_draft_idempotent(
  p_org uuid,p_invoice_id uuid,p_request_key uuid,p_actor uuid,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices; v_existing public.invoice_crud_requests;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_request_key::text,0));
  select * into v_existing from public.invoice_crud_requests where org_id=p_org and request_key=p_request_key;
  if found then
    if v_existing.action<>'delete' or v_existing.invoice_id<>p_invoice_id then raise exception using errcode='23505',message='idempotency key was used for another action'; end if;
    return jsonb_build_object('deleted',true,'replayed',true);
  end if;
  select * into v_invoice from public.invoices where org_id=p_org and id=p_invoice_id for update;
  if not found then raise exception using errcode='P0002',message='invoice not found'; end if;
  if v_invoice.state<>'draft' then raise exception using errcode='22023',message='only draft invoices can be deleted'; end if;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'invoice.deleted','invoice',p_invoice_id::text,jsonb_build_object('state','draft'),coalesce(p_request_id,''));
  delete from public.invoices where org_id=p_org and id=p_invoice_id;
  insert into public.invoice_crud_requests(org_id,request_key,action,invoice_id) values(p_org,p_request_key,'delete',p_invoice_id);
  return jsonb_build_object('deleted',true,'replayed',false);
end
$$;

create or replace function public.set_invoice_state(p_org uuid,p_invoice_id uuid,p_state text,p_actor uuid,p_details jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where org_id=p_org and id=p_invoice_id for update;
  if not found then raise exception using errcode='P0002',message='invoice not found'; end if;
  if v_invoice.state=p_state then return to_jsonb(v_invoice); end if;
  if not ((v_invoice.state='draft' and p_state='reviewed') or (v_invoice.state in ('reviewed','sent') and p_state='void')) then
    raise exception using errcode='22023',message='invalid invoice state transition';
  end if;
  update public.invoices set state=p_state,updated_at=now() where org_id=p_org and id=p_invoice_id returning * into v_invoice;
  insert into public.invoice_events(org_id,invoice_id,event_type,actor_id,details) values(p_org,p_invoice_id,'state.'||p_state,p_actor,coalesce(p_details,'{}'::jsonb));
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'invoice.'||p_state,'invoice',p_invoice_id::text,coalesce(p_details,'{}'::jsonb),coalesce(p_details->>'requestId',''));
  return to_jsonb(v_invoice);
end
$$;

revoke all on function public.create_invoice_draft_idempotent(uuid,uuid,jsonb,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.update_invoice_draft(uuid,uuid,jsonb,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.reopen_invoice_draft(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.delete_invoice_draft_idempotent(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.set_invoice_state(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_invoice_draft_idempotent(uuid,uuid,jsonb,jsonb,uuid,text) to service_role;
grant execute on function public.update_invoice_draft(uuid,uuid,jsonb,jsonb,uuid,text) to service_role;
grant execute on function public.reopen_invoice_draft(uuid,uuid,uuid,text) to service_role;
grant execute on function public.delete_invoice_draft_idempotent(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.set_invoice_state(uuid,uuid,text,uuid,jsonb) to service_role;
