-- Phase 6 T5: metadata-only completion evidence, reviewer decision, and audited closure.
alter table public.fund_completion_evidence
  add column review_status text not null default 'pending' check (review_status in ('pending','accepted','rejected')),
  add column reviewed_by uuid references auth.users(id) on delete restrict,
  add column reviewed_at timestamptz,
  add column review_note text check (review_note is null or char_length(review_note)<=500),
  add column request_id text;
create unique index fund_completion_evidence_org_request_id
  on public.fund_completion_evidence(org_id,request_id) where request_id is not null;

alter table public.maintenance_requests
  add column reviewed_by uuid references auth.users(id) on delete restrict,
  add column reviewed_at timestamptz,
  add column closed_by uuid references auth.users(id) on delete restrict,
  add column closed_at timestamptz;

create or replace function public.submit_fund_completion_evidence(
  p_org uuid,p_actor uuid,p_request uuid,p_kind text,p_description text,p_file_ref text,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request public.maintenance_requests;
  v_evidence public.fund_completion_evidence;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','accountant','resident')) then
    raise exception using errcode='42501',message='completion evidence submitter role required';
  end if;
  if p_request_id is null or p_kind is null or p_kind not in ('photo','invoice','inspection','other')
    or p_description is null or char_length(trim(p_description)) not between 1 and 2000
    or (p_file_ref is not null and char_length(trim(p_file_ref))>500) then
    raise exception using errcode='22023',message='invalid completion evidence metadata';
  end if;
  select * into v_request from public.maintenance_requests where org_id=p_org and id=p_request for update;
  if not found then raise exception using errcode='P0002',message='maintenance request not found'; end if;
  select * into v_evidence from public.fund_completion_evidence where org_id=p_org and request_id=p_request_id;
  if found then
    if v_evidence.maintenance_request_id<>p_request or v_evidence.submitted_by<>p_actor
      or v_evidence.kind<>p_kind or v_evidence.description<>trim(p_description)
      or v_evidence.file_ref is distinct from nullif(trim(p_file_ref),'') then
      raise exception using errcode='23505',message='completion evidence request id was already used';
    end if;
    return jsonb_build_object('request',to_jsonb(v_request),'evidence',to_jsonb(v_evidence),
      'caution','Evidence supports, but does not prove, that work was done correctly.');
  end if;
  if v_request.status not in ('paid','evidence_submitted') then raise exception using errcode='23514',message='completion evidence requires paid state'; end if;
  insert into public.fund_completion_evidence(org_id,maintenance_request_id,kind,description,file_ref,submitted_by,request_id)
    values(p_org,p_request,p_kind,trim(p_description),nullif(trim(p_file_ref),''),p_actor,p_request_id) returning * into v_evidence;
  if v_request.status='paid' then
    update public.maintenance_requests set status='evidence_submitted',updated_at=pg_catalog.now()
      where org_id=p_org and id=p_request returning * into v_request;
    insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
      values(p_org,p_actor,'fund.maintenance.evidence_submitted','maintenance_request',p_request::text,
        jsonb_build_object('from','paid','to','evidence_submitted'),p_request_id);
  end if;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.completion_evidence.submitted','fund_completion_evidence',v_evidence.id::text,
      jsonb_build_object('maintenance_request_id',p_request,'kind',p_kind,'file_ref_present',v_evidence.file_ref is not null),p_request_id);
  return jsonb_build_object('request',to_jsonb(v_request),'evidence',to_jsonb(v_evidence),
    'caution','Evidence supports, but does not prove, that work was done correctly.');
end
$$;

create or replace function public.review_fund_completion_evidence(
  p_org uuid,p_actor uuid,p_request uuid,p_evidence uuid,p_decision text,p_note text,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request public.maintenance_requests;
  v_evidence public.fund_completion_evidence;
  v_pending integer;
  v_accepted integer;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','approver')) then
    raise exception using errcode='42501',message='completion evidence reviewer role required';
  end if;
  if p_decision is null or p_decision not in ('accept','reject') or p_request_id is null or (p_note is not null and char_length(p_note)>500) then
    raise exception using errcode='22023',message='invalid completion evidence review';
  end if;
  select * into v_request from public.maintenance_requests where org_id=p_org and id=p_request for update;
  if not found then raise exception using errcode='P0002',message='maintenance request not found'; end if;
  select * into v_evidence from public.fund_completion_evidence
    where org_id=p_org and id=p_evidence and maintenance_request_id=p_request for update;
  if not found then raise exception using errcode='P0002',message='completion evidence not found'; end if;
  if v_request.requested_by=p_actor or v_evidence.submitted_by=p_actor then
    raise exception using errcode='42501',message='requester or evidence submitter cannot review this evidence';
  end if;
  if v_evidence.review_status<>'pending' then
    if (p_decision='accept' and v_evidence.review_status='accepted') or (p_decision='reject' and v_evidence.review_status='rejected') then
      return jsonb_build_object('request',to_jsonb(v_request),'evidence',to_jsonb(v_evidence),
        'caution','Evidence supports, but does not prove, that work was done correctly.');
    end if;
    raise exception using errcode='23514',message='completion evidence was already reviewed';
  end if;
  if v_request.status<>'evidence_submitted' then raise exception using errcode='23514',message='request is not awaiting evidence review'; end if;
  update public.fund_completion_evidence set review_status=case when p_decision='accept' then 'accepted' else 'rejected' end,
    reviewed_by=p_actor,reviewed_at=pg_catalog.now(),review_note=nullif(trim(p_note),'')
    where org_id=p_org and id=p_evidence returning * into v_evidence;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.completion_evidence.'||v_evidence.review_status,'fund_completion_evidence',v_evidence.id::text,
      jsonb_build_object('maintenance_request_id',p_request,'review_note',v_evidence.review_note),p_request_id);
  select count(*) filter(where review_status='pending')::integer,
    count(*) filter(where review_status='accepted')::integer into v_pending,v_accepted
    from public.fund_completion_evidence where org_id=p_org and maintenance_request_id=p_request;
  if v_pending=0 and v_accepted>0 then
    update public.maintenance_requests set status='reviewed',reviewed_by=p_actor,reviewed_at=pg_catalog.now(),updated_at=pg_catalog.now()
      where org_id=p_org and id=p_request returning * into v_request;
    insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
      values(p_org,p_actor,'fund.maintenance.reviewed','maintenance_request',p_request::text,
        jsonb_build_object('from','evidence_submitted','to','reviewed','accepted_evidence_count',v_accepted),p_request_id);
  end if;
  return jsonb_build_object('request',to_jsonb(v_request),'evidence',to_jsonb(v_evidence),
    'caution','Evidence supports, but does not prove, that work was done correctly.');
end
$$;

create or replace function public.close_fund_maintenance_request(
  p_org uuid,p_actor uuid,p_request uuid,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.maintenance_requests;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','approver')) then
    raise exception using errcode='42501',message='maintenance close reviewer role required';
  end if;
  if p_request_id is null then raise exception using errcode='22023',message='request id is required'; end if;
  select * into v_request from public.maintenance_requests where org_id=p_org and id=p_request for update;
  if not found then raise exception using errcode='P0002',message='maintenance request not found'; end if;
  if v_request.requested_by=p_actor then raise exception using errcode='42501',message='requester cannot close own maintenance request'; end if;
  if v_request.status='closed' then return jsonb_build_object('request',to_jsonb(v_request),'closed',true); end if;
  if v_request.status<>'reviewed' or v_request.reviewed_by is null then raise exception using errcode='23514',message='request must be reviewed before close'; end if;
  if not exists(select 1 from public.fund_completion_evidence where org_id=p_org and maintenance_request_id=p_request and review_status='accepted') then
    raise exception using errcode='23514',message='accepted completion evidence is required before close';
  end if;
  update public.maintenance_requests set status='closed',closed_by=p_actor,closed_at=pg_catalog.now(),updated_at=pg_catalog.now()
    where org_id=p_org and id=p_request returning * into v_request;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.maintenance.closed','maintenance_request',p_request::text,
      jsonb_build_object('from','reviewed','to','closed','reviewed_by',v_request.reviewed_by),p_request_id);
  return jsonb_build_object('request',to_jsonb(v_request),'closed',true);
end
$$;

revoke all on function public.submit_fund_completion_evidence(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.review_fund_completion_evidence(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.close_fund_maintenance_request(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.submit_fund_completion_evidence(uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.review_fund_completion_evidence(uuid,uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.close_fund_maintenance_request(uuid,uuid,uuid,text) to service_role;
