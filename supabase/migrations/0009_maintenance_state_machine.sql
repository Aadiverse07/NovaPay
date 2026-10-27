-- Phase 6 T3: enforce maintenance workflow and approval transitions in the service layer.
-- Legacy statuses remain accepted for existing rows; new requests use the state machine below.
alter table public.maintenance_requests
  add column requested_by uuid references auth.users(id) on delete restrict;
alter table public.maintenance_requests drop constraint if exists maintenance_requests_status_check;
alter table public.maintenance_requests add constraint maintenance_requests_status_check
  check (status in ('requested','quoting','scope_approved','contractor_verified','payment_approved','paid','evidence_submitted','reviewed','closed','proposed','approved','in_progress','completed','cancelled'));

create or replace function public.create_fund_maintenance_request(
  p_org uuid,p_actor uuid,p_campaign_id uuid,p_title text,p_scope text,p_estimate_minor bigint,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.maintenance_requests;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','accountant','approver','resident')) then
    raise exception using errcode='42501',message='maintenance request role required';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 160
    or p_scope is null or char_length(trim(p_scope)) not between 1 and 4000
    or (p_estimate_minor is not null and p_estimate_minor<=0) or p_request_id is null then
    raise exception using errcode='22023',message='invalid maintenance request';
  end if;
  if p_campaign_id is not null and not exists(select 1 from public.fund_campaigns where org_id=p_org and id=p_campaign_id) then
    raise exception using errcode='P0002',message='maintenance campaign not found';
  end if;
  insert into public.maintenance_requests(org_id,campaign_id,title,scope,status,estimate_minor,requested_by)
    values(p_org,p_campaign_id,trim(p_title),trim(p_scope),'requested',p_estimate_minor,p_actor) returning * into v_row;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.maintenance.requested','maintenance_request',v_row.id::text,jsonb_build_object('status','requested'),p_request_id);
  return to_jsonb(v_row);
end
$$;

create or replace function public.create_fund_contractor(
  p_org uuid,p_actor uuid,p_name text,p_payment_destination_ref text,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.fund_contractors;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','accountant')) then
    raise exception using errcode='42501',message='contractor management role required';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 160
    or (p_payment_destination_ref is not null and char_length(p_payment_destination_ref)>200) or p_request_id is null then
    raise exception using errcode='22023',message='invalid contractor';
  end if;
  insert into public.fund_contractors(org_id,name,verification_status,payment_destination_ref)
    values(p_org,trim(p_name),'unverified',nullif(trim(p_payment_destination_ref),'')) returning * into v_row;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.contractor.created','fund_contractor',v_row.id::text,jsonb_build_object('verification_status','unverified'),p_request_id);
  return to_jsonb(v_row);
end
$$;

create or replace function public.add_fund_quotation(
  p_org uuid,p_actor uuid,p_request uuid,p_contractor uuid,p_amount_minor bigint,p_document_ref text,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.maintenance_requests; v_row public.fund_quotations;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','accountant')) then
    raise exception using errcode='42501',message='quotation management role required';
  end if;
  select * into v_request from public.maintenance_requests where org_id=p_org and id=p_request for update;
  if not found then raise exception using errcode='P0002',message='maintenance request not found'; end if;
  if v_request.status not in ('requested','quoting') then raise exception using errcode='23514',message='quotation is not allowed in this maintenance state'; end if;
  if not exists(select 1 from public.fund_contractors where org_id=p_org and id=p_contractor) then
    raise exception using errcode='P0002',message='quotation contractor not found';
  end if;
  if p_amount_minor is null or p_amount_minor<=0 or (p_document_ref is not null and char_length(p_document_ref)>500) or p_request_id is null then
    raise exception using errcode='22023',message='invalid quotation';
  end if;
  insert into public.fund_quotations(org_id,maintenance_request_id,contractor_id,amount_minor,document_ref)
    values(p_org,p_request,p_contractor,p_amount_minor,nullif(trim(p_document_ref),'')) returning * into v_row;
  if v_request.status='requested' then
    update public.maintenance_requests set status='quoting',updated_at=now() where org_id=p_org and id=p_request;
    insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
      values(p_org,p_actor,'fund.maintenance.quoting','maintenance_request',p_request::text,jsonb_build_object('from','requested','to','quoting'),p_request_id);
  end if;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.maintenance.quotation_added','fund_quotation',v_row.id::text,jsonb_build_object('maintenance_request_id',p_request,'amount_minor',p_amount_minor),p_request_id);
  return to_jsonb(v_row);
end
$$;

create or replace function public.approve_fund_maintenance_scope(
  p_org uuid,p_actor uuid,p_request uuid,p_quotation uuid,p_note text,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.maintenance_requests; v_quote public.fund_quotations; v_row public.fund_approvals_chain;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','approver')) then
    raise exception using errcode='42501',message='scope approver role required';
  end if;
  select * into v_request from public.maintenance_requests where org_id=p_org and id=p_request for update;
  if not found then raise exception using errcode='P0002',message='maintenance request not found'; end if;
  if v_request.status<>'quoting' then raise exception using errcode='23514',message='scope approval requires quoting state'; end if;
  if v_request.requested_by=p_actor then raise exception using errcode='42501',message='requester cannot approve own request'; end if;
  select * into v_quote from public.fund_quotations where org_id=p_org and id=p_quotation and maintenance_request_id=p_request;
  if not found then raise exception using errcode='23514',message='chosen quotation must belong to request'; end if;
  if p_note is not null and char_length(p_note)>500 then raise exception using errcode='22023',message='approval note is too long'; end if;
  insert into public.fund_approvals_chain(org_id,maintenance_request_id,step,approver_id,decision,note)
    values(p_org,p_request,'scope',p_actor,'approved',nullif(trim(p_note),'')) returning * into v_row;
  update public.maintenance_requests set status='scope_approved',chosen_quotation_id=v_quote.id,contractor_id=v_quote.contractor_id,updated_at=now()
    where org_id=p_org and id=p_request;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.maintenance.scope_approved','maintenance_request',p_request::text,jsonb_build_object('from','quoting','to','scope_approved','quotation_id',v_quote.id),p_request_id);
  return jsonb_build_object('request',to_jsonb(v_request)||jsonb_build_object('status','scope_approved','chosen_quotation_id',v_quote.id,'contractor_id',v_quote.contractor_id),'approval',to_jsonb(v_row));
end
$$;

create or replace function public.verify_fund_maintenance_contractor(
  p_org uuid,p_actor uuid,p_request uuid,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.maintenance_requests; v_quote public.fund_quotations; v_contractor public.fund_contractors;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','approver')) then
    raise exception using errcode='42501',message='contractor verifier role required';
  end if;
  select * into v_request from public.maintenance_requests where org_id=p_org and id=p_request for update;
  if not found then raise exception using errcode='P0002',message='maintenance request not found'; end if;
  if v_request.status<>'scope_approved' then raise exception using errcode='23514',message='contractor verification requires scope_approved state'; end if;
  if v_request.requested_by=p_actor then raise exception using errcode='42501',message='requester cannot verify own request'; end if;
  select * into v_quote from public.fund_quotations where org_id=p_org and id=v_request.chosen_quotation_id and maintenance_request_id=p_request;
  if not found then raise exception using errcode='23514',message='chosen quotation is unavailable'; end if;
  update public.fund_contractors set verification_status='verified',verified_by=p_actor,verified_at=now()
    where org_id=p_org and id=v_quote.contractor_id returning * into v_contractor;
  if not found then raise exception using errcode='P0002',message='contractor not found'; end if;
  update public.maintenance_requests set status='contractor_verified',updated_at=now() where org_id=p_org and id=p_request;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.contractor.verified','fund_contractor',v_contractor.id::text,jsonb_build_object('verified_at',v_contractor.verified_at),p_request_id);
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.maintenance.contractor_verified','maintenance_request',p_request::text,jsonb_build_object('from','scope_approved','to','contractor_verified','contractor_id',v_contractor.id),p_request_id);
  return jsonb_build_object('request',to_jsonb(v_request)||jsonb_build_object('status','contractor_verified'),'contractor',to_jsonb(v_contractor));
end
$$;

create or replace function public.approve_fund_maintenance_payment(
  p_org uuid,p_actor uuid,p_request uuid,p_note text,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.maintenance_requests; v_quote public.fund_quotations; v_row public.fund_approvals_chain; v_threshold bigint; v_required integer; v_count integer;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','approver')) then
    raise exception using errcode='42501',message='payment approver role required';
  end if;
  select * into v_request from public.maintenance_requests where org_id=p_org and id=p_request for update;
  if not found then raise exception using errcode='P0002',message='maintenance request not found'; end if;
  if v_request.status<>'contractor_verified' then raise exception using errcode='23514',message='payment approval requires contractor_verified state'; end if;
  if v_request.requested_by=p_actor then raise exception using errcode='42501',message='requester cannot approve own request'; end if;
  select * into v_quote from public.fund_quotations where org_id=p_org and id=v_request.chosen_quotation_id and maintenance_request_id=p_request;
  if not found then raise exception using errcode='23514',message='chosen quotation is unavailable'; end if;
  if p_note is not null and char_length(p_note)>500 then raise exception using errcode='22023',message='approval note is too long'; end if;
  if exists(select 1 from public.fund_approvals_chain where org_id=p_org and maintenance_request_id=p_request and step='payment' and approver_id=p_actor and decision='approved') then
    raise exception using errcode='23505',message='approver already approved this payment';
  end if;
  insert into public.fund_approvals_chain(org_id,maintenance_request_id,step,approver_id,decision,note)
    values(p_org,p_request,'payment',p_actor,'approved',nullif(trim(p_note),'')) returning * into v_row;
  select coalesce((select two_person_approval_threshold_minor from public.fund_transparency_settings where org_id=p_org),10000) into v_threshold;
  v_required:=case when v_quote.amount_minor>=v_threshold then 2 else 1 end;
  select count(distinct approver_id)::integer into v_count from public.fund_approvals_chain
    where org_id=p_org and maintenance_request_id=p_request and step='payment' and decision='approved';
  if v_count>=v_required then
    update public.maintenance_requests set status='payment_approved',updated_at=now() where org_id=p_org and id=p_request;
    insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
      values(p_org,p_actor,'fund.maintenance.payment_approved','maintenance_request',p_request::text,jsonb_build_object('from','contractor_verified','to','payment_approved','amount_minor',v_quote.amount_minor,'approvals',v_count),p_request_id);
  end if;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.maintenance.payment_approval_recorded','fund_approval',v_row.id::text,jsonb_build_object('maintenance_request_id',p_request,'approvals',v_count,'required',v_required),p_request_id);
  return jsonb_build_object('status',case when v_count>=v_required then 'payment_approved' else 'contractor_verified' end,'approvals',v_count,'required',v_required,'approval',to_jsonb(v_row));
end
$$;

revoke all on function public.create_fund_maintenance_request(uuid,uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.create_fund_contractor(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.add_fund_quotation(uuid,uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated;
revoke all on function public.approve_fund_maintenance_scope(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.verify_fund_maintenance_contractor(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.approve_fund_maintenance_payment(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_fund_maintenance_request(uuid,uuid,uuid,text,text,bigint,text) to service_role;
grant execute on function public.create_fund_contractor(uuid,uuid,text,text,text) to service_role;
grant execute on function public.add_fund_quotation(uuid,uuid,uuid,uuid,bigint,text,text) to service_role;
grant execute on function public.approve_fund_maintenance_scope(uuid,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.verify_fund_maintenance_contractor(uuid,uuid,uuid,text) to service_role;
grant execute on function public.approve_fund_maintenance_payment(uuid,uuid,uuid,text,text) to service_role;
