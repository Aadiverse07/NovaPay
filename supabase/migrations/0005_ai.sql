-- Phase 4 AI budgets/cache, anomaly notifications, and pending AI approvals.
-- All writes are performed through server-side service_role repositories/RPCs.

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  route text not null check (route in ('code','sql','ocr','retrieval','llm')),
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  cost_estimate numeric(12,6) not null default 0 check (cost_estimate >= 0),
  cache_hit boolean not null default false,
  status text not null default 'reserved' check (status in ('reserved','completed','error','invalid_response','cache_hit')),
  created_at timestamptz not null default now()
);
create index ai_usage_org_created_idx on public.ai_usage(org_id,created_at desc);
create index ai_usage_user_created_idx on public.ai_usage(org_id,user_id,created_at desc);

create table public.ai_cache (
  org_id uuid not null references public.organizations(id) on delete cascade,
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  data_version text not null,
  answer jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (org_id,cache_key)
);
create index ai_cache_expiry_idx on public.ai_cache(expires_at);

create table public.anomalies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rule text not null check (char_length(rule) between 1 and 80),
  severity text not null check (severity in ('info','warning','high','critical')),
  evidence_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_ids)='array'),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  status text not null default 'open' check (status in ('open','acknowledged','dismissed')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (org_id,dedupe_key)
);
create index anomalies_org_created_idx on public.anomalies(org_id,created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  anomaly_id uuid references public.anomalies(id) on delete cascade,
  rule text not null check (char_length(rule) between 1 and 80),
  severity text not null check (severity in ('info','warning','high','critical')),
  evidence_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_ids)='array'),
  status text not null default 'unread' check (status in ('unread','read','dismissed')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  unique (org_id,anomaly_id)
);
create index notifications_org_status_created_idx on public.notifications(org_id,status,created_at desc);

alter table public.ai_usage enable row level security;
alter table public.ai_cache enable row level security;
alter table public.anomalies enable row level security;
alter table public.notifications enable row level security;

create policy ai_usage_select_member on public.ai_usage
  for select to authenticated using (private.is_member(org_id));
create policy ai_cache_select_member on public.ai_cache
  for select to authenticated using (private.is_member(org_id));
create policy anomalies_select_member on public.anomalies
  for select to authenticated using (private.is_member(org_id));
create policy notifications_select_member on public.notifications
  for select to authenticated using (private.is_member(org_id));

revoke all on public.ai_usage,public.ai_cache,public.anomalies,public.notifications from public,anon,authenticated;
grant select on public.ai_usage,public.ai_cache,public.anomalies,public.notifications to authenticated;
grant all on public.ai_usage,public.ai_cache,public.anomalies,public.notifications to service_role;

create or replace function public.get_ai_data_version(p_org uuid)
returns text language sql stable security definer set search_path = '' as $$
  select md5(concat_ws('|',
    (select count(*)::text||':'||coalesce(max(created_at)::text,'') from public.journal_entries where org_id=p_org),
    (select count(*)::text||':'||coalesce(max(updated_at)::text,'') from public.invoices where org_id=p_org),
    (select count(*)::text||':'||coalesce(max(created_at)::text,'') from public.transactions where org_id=p_org)
  ))
$$;

create or replace function public.reserve_ai_usage(
  p_org uuid,p_user uuid,p_route text,p_model text,p_input_tokens integer,p_user_limit integer,p_org_limit integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_day timestamptz := date_trunc('day',now() at time zone 'utc') at time zone 'utc';
  v_user_count integer;
  v_org_count integer;
  v_id uuid;
begin
  if p_org is null or p_user is null or not exists(select 1 from public.memberships where org_id=p_org and user_id=p_user) then
    raise exception using errcode='42501',message='organization membership required';
  end if;
  if p_route is null or p_route not in ('code','sql','ocr','retrieval','llm') or p_model is null or length(p_model)>120 or p_input_tokens is null or p_input_tokens<0 or p_user_limit is null or p_user_limit<1 or p_org_limit is null or p_org_limit<1 then
    raise exception using errcode='22023',message='invalid AI usage reservation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  select count(*) into v_user_count from public.ai_usage where org_id=p_org and user_id=p_user and created_at>=v_day and not cache_hit;
  select count(*) into v_org_count from public.ai_usage where org_id=p_org and created_at>=v_day and not cache_hit;
  if v_user_count>=p_user_limit then return jsonb_build_object('allowed',false,'reason','user_limit'); end if;
  if v_org_count>=p_org_limit then return jsonb_build_object('allowed',false,'reason','org_limit'); end if;
  insert into public.ai_usage(org_id,user_id,route,model,input_tokens,status)
    values(p_org,p_user,p_route,p_model,p_input_tokens,'reserved') returning id into v_id;
  return jsonb_build_object('allowed',true,'usageId',v_id);
end
$$;

create or replace function public.complete_ai_usage(
  p_usage_id uuid,p_input_tokens integer default null,p_output_tokens integer default 0,p_latency_ms integer default 0,p_model text default null,p_status text default 'completed'
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status is null or p_status not in ('completed','error','invalid_response') or coalesce(p_input_tokens,0)<0 or p_output_tokens is null or p_output_tokens<0 or p_latency_ms is null or p_latency_ms<0 then
    raise exception using errcode='22023',message='invalid AI usage completion';
  end if;
  update public.ai_usage set input_tokens=coalesce(p_input_tokens,input_tokens),output_tokens=p_output_tokens,latency_ms=p_latency_ms,
    model=coalesce(p_model,model),status=p_status,cost_estimate=0
    where id=p_usage_id and status='reserved';
  return found;
end
$$;

create or replace function public.record_ai_cache_hit(p_org uuid,p_user uuid,p_route text,p_model text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_user) then
    raise exception using errcode='42501',message='organization membership required';
  end if;
  if p_route is null or p_route not in ('code','sql','ocr','retrieval','llm') then raise exception using errcode='22023',message='invalid AI route'; end if;
  insert into public.ai_usage(org_id,user_id,route,model,cache_hit,status)
    values(p_org,p_user,p_route,p_model,true,'cache_hit') returning id into v_id;
  return v_id;
end
$$;

create or replace function public.create_ai_proposal(
  p_org uuid,p_created_by uuid,p_proposal_type text,p_capture_id text,p_invoice_id uuid,p_amount_minor bigint,p_currency text,p_request_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_capture public.paypal_captures;
  v_invoice public.invoices;
  v_row public.approvals;
  v_id text := 'AI-'||replace(gen_random_uuid()::text,'-','');
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_created_by) then
    raise exception using errcode='42501',message='organization membership required';
  end if;
  if p_proposal_type is null or p_proposal_type not in ('refund','dispute-evidence','hold-payout','send-invoice','other') or coalesce(jsonb_typeof(p_request_payload)<>'object',true) then
    raise exception using errcode='22023',message='invalid AI proposal';
  end if;
  if coalesce(jsonb_typeof(p_request_payload->'evidenceIds')<>'array',true) or coalesce(jsonb_array_length(p_request_payload->'evidenceIds')=0,true) then
    raise exception using errcode='22023',message='proposal evidence is required';
  end if;
  if p_proposal_type='refund' then
    select * into v_capture from public.paypal_captures where org_id=p_org and paypal_capture_id=p_capture_id for update;
    if not found or v_capture.status<>'COMPLETED' or p_amount_minor is null or p_amount_minor<=0
       or p_currency<>v_capture.currency or p_amount_minor>v_capture.amount_minor-v_capture.refunded_minor-v_capture.reserved_minor then
      raise exception using errcode='22023',message='refund proposal does not match remaining completed capture';
    end if;
  elsif p_proposal_type='send-invoice' then
    select * into v_invoice from public.invoices where org_id=p_org and id=p_invoice_id for update;
    if not found or v_invoice.state<>'reviewed' or p_capture_id is not null or p_amount_minor is not null then
      raise exception using errcode='22023',message='invoice proposal requires a reviewed invoice';
    end if;
  elsif p_capture_id is not null or p_invoice_id is not null or p_amount_minor is not null or p_currency is not null then
    raise exception using errcode='22023',message='unexpected financial fields on non-financial proposal';
  end if;
  insert into public.approvals(org_id,id,proposal_type,capture_id,invoice_id,amount_minor,currency,status,request_payload,created_by)
    values(p_org,v_id,p_proposal_type,p_capture_id,p_invoice_id,p_amount_minor,p_currency,'pending',p_request_payload,p_created_by)
    returning * into v_row;
  return to_jsonb(v_row);
end
$$;

create or replace function public.record_anomaly(p_org uuid,p_finding jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row public.anomalies;
  v_inserted boolean := false;
begin
  if not exists(select 1 from public.organizations where id=p_org) or coalesce(jsonb_typeof(p_finding)<>'object',true)
     or coalesce(jsonb_typeof(p_finding->'evidenceIds')<>'array',true) or coalesce(jsonb_typeof(p_finding->'details')<>'object',true) then
    raise exception using errcode='22023',message='invalid anomaly finding';
  end if;
  insert into public.anomalies(org_id,rule,severity,evidence_ids,details,status,dedupe_key)
    values(p_org,p_finding->>'rule',p_finding->>'severity',p_finding->'evidenceIds',p_finding->'details',coalesce(p_finding->>'status','open'),p_finding->>'dedupeKey')
    on conflict(org_id,dedupe_key) do nothing returning * into v_row;
  v_inserted := found;
  if not v_inserted then
    select * into v_row from public.anomalies where org_id=p_org and dedupe_key=p_finding->>'dedupeKey';
  else
    insert into public.notifications(org_id,anomaly_id,rule,severity,evidence_ids,status)
      values(p_org,v_row.id,v_row.rule,v_row.severity,v_row.evidence_ids,'unread');
  end if;
  return jsonb_build_object('inserted',v_inserted,'anomaly',to_jsonb(v_row));
end
$$;

create or replace function public.set_notification_status(p_org uuid,p_notification_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.notifications;
begin
  if p_status is null or p_status not in ('read','dismissed') then raise exception using errcode='22023',message='invalid notification status'; end if;
  update public.notifications set status=p_status,
    read_at=case when p_status='read' then coalesce(read_at,now()) else read_at end,
    dismissed_at=case when p_status='dismissed' then coalesce(dismissed_at,now()) else dismissed_at end
    where org_id=p_org and id=p_notification_id returning * into v_row;
  if not found then return null; end if;
  return to_jsonb(v_row);
end
$$;

create or replace function public.list_anomaly_org_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(id order by id),'{}'::uuid[]) from public.organizations
$$;

revoke all on function public.get_ai_data_version(uuid) from public,anon,authenticated;
revoke all on function public.reserve_ai_usage(uuid,uuid,text,text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_ai_usage(uuid,integer,integer,integer,text,text) from public,anon,authenticated;
revoke all on function public.record_ai_cache_hit(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.create_ai_proposal(uuid,uuid,text,text,uuid,bigint,text,jsonb) from public,anon,authenticated;
revoke all on function public.record_anomaly(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.set_notification_status(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.list_anomaly_org_ids() from public,anon,authenticated;
grant execute on function public.get_ai_data_version(uuid) to service_role;
grant execute on function public.reserve_ai_usage(uuid,uuid,text,text,integer,integer,integer) to service_role;
grant execute on function public.complete_ai_usage(uuid,integer,integer,integer,text,text) to service_role;
grant execute on function public.record_ai_cache_hit(uuid,uuid,text,text) to service_role;
grant execute on function public.create_ai_proposal(uuid,uuid,text,text,uuid,bigint,text,jsonb) to service_role;
grant execute on function public.record_anomaly(uuid,jsonb) to service_role;
grant execute on function public.set_notification_status(uuid,uuid,text) to service_role;
grant execute on function public.list_anomaly_org_ids() to service_role;
