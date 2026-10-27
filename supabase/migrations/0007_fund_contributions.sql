-- Phase 6 T2: tie pledges to PayPal orders and verified ledger captures.

alter table public.fund_campaigns add column created_by uuid references auth.users(id) on delete restrict;
alter table public.fund_contributions
  add column created_by uuid references auth.users(id) on delete restrict,
  add column capture_mismatch boolean not null default false,
  add column capture_mismatch_reason text;
alter table public.paypal_orders add column fund_contribution_id uuid;
create unique index paypal_orders_fund_contribution_unique
  on public.paypal_orders(org_id,fund_contribution_id) where fund_contribution_id is not null;
alter table public.paypal_orders add constraint paypal_orders_fund_contribution_fk
  foreign key (org_id,fund_contribution_id) references public.fund_contributions(org_id,id) on delete restrict;

create or replace function public.create_fund_campaign(
  p_org uuid,p_actor uuid,p_title text,p_purpose text,p_target_minor bigint,p_deadline date,p_organiser text,p_status text,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.fund_campaigns;
begin
  if p_actor is null then raise exception using errcode='42501',message='campaign management role required'; end if;
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','accountant')) then
    raise exception using errcode='42501',message='campaign management role required';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 160 or p_purpose is null or char_length(trim(p_purpose)) not between 1 and 2000 or p_target_minor is null or p_target_minor<=0 or p_organiser is null or char_length(trim(p_organiser)) not between 1 and 160 or p_status not in ('draft','active') or p_request_id is null then
    raise exception using errcode='22023',message='invalid fund campaign';
  end if;
  insert into public.fund_campaigns(org_id,title,purpose,target_minor,currency,deadline,organiser,status,created_by)
    values(p_org,trim(p_title),trim(p_purpose),p_target_minor,'USD',p_deadline,trim(p_organiser),p_status,p_actor) returning * into v_row;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.campaign.created','fund_campaign',v_row.id::text,jsonb_build_object('target_minor',v_row.target_minor,'currency',v_row.currency),p_request_id);
  return to_jsonb(v_row);
end
$$;

create or replace function public.create_fund_pledge(
  p_org uuid,p_actor uuid,p_campaign_id uuid,p_amount_minor bigint,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_campaign public.fund_campaigns; v_row public.fund_contributions;
begin
  if p_actor is null then raise exception using errcode='42501',message='fund contribution role required'; end if;
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','accountant','approver')) then
    raise exception using errcode='42501',message='fund contribution role required';
  end if;
  select * into v_campaign from public.fund_campaigns where org_id=p_org and id=p_campaign_id for update;
  if not found then raise exception using errcode='P0002',message='campaign not found'; end if;
  if v_campaign.status<>'active' then raise exception using errcode='23514',message='campaign is not accepting contributions'; end if;
  if p_amount_minor is null or p_amount_minor<=0 or p_request_id is null then raise exception using errcode='22023',message='invalid fund pledge'; end if;
  insert into public.fund_contributions(org_id,campaign_id,amount_minor,status,donor_ref,created_by)
    values(p_org,p_campaign_id,p_amount_minor,'pledged','anonymous',p_actor) returning * into v_row;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.contribution.pledged','fund_contribution',v_row.id::text,jsonb_build_object('amount_minor',v_row.amount_minor,'currency',v_campaign.currency,'donor_ref',v_row.donor_ref),p_request_id);
  return to_jsonb(v_row);
end
$$;

create or replace function public.link_fund_contribution_order(
  p_org uuid,p_actor uuid,p_contribution_id uuid,p_request_key text,p_paypal_order_id text,p_approve_url text,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_contribution public.fund_contributions; v_order public.paypal_orders; v_new_link boolean;
begin
  if p_actor is null or not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','accountant','approver')) then
    raise exception using errcode='42501',message='fund contribution role required';
  end if;
  select * into v_contribution from public.fund_contributions where org_id=p_org and id=p_contribution_id for update;
  if not found or v_contribution.status<>'pledged' then raise exception using errcode='P0002',message='pledged contribution not found'; end if;
  select * into v_order from public.paypal_orders where org_id=p_org and request_key=p_request_key for update;
  if not found or v_order.paypal_order_id is distinct from p_paypal_order_id or v_order.amount_minor<>v_contribution.amount_minor or v_order.currency<>'USD' then
    raise exception using errcode='22023',message='PayPal order does not match contribution';
  end if;
  if v_order.fund_contribution_id is not null and v_order.fund_contribution_id<>p_contribution_id then raise exception using errcode='23505',message='PayPal order is already linked'; end if;
  if exists(select 1 from public.paypal_orders where org_id=p_org and fund_contribution_id=p_contribution_id and request_key<>p_request_key) then
    raise exception using errcode='23505',message='contribution already has a PayPal order';
  end if;
  if p_request_id is null then raise exception using errcode='22023',message='request id is required'; end if;
  v_new_link:=v_order.fund_contribution_id is null;
  update public.paypal_orders set fund_contribution_id=p_contribution_id,approve_url=p_approve_url where id=v_order.id returning * into v_order;
  if v_new_link then
    insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
      values(p_org,p_actor,'fund.contribution.order_linked','fund_contribution',p_contribution_id::text,jsonb_build_object('paypal_order_id',p_paypal_order_id),p_request_id);
  end if;
  return jsonb_build_object('contribution_id',p_contribution_id,'paypal_order_id',v_order.paypal_order_id,'approve_url',v_order.approve_url);
end
$$;

create or replace function public.record_fund_paypal_capture_event(p_paypal_order_id text,p_capture jsonb,p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.paypal_orders; v_contribution public.fund_contributions; v_result jsonb; v_capture_id text; v_minor bigint; v_currency text; v_changed boolean;
begin
  select * into v_order from public.paypal_orders where paypal_order_id=p_paypal_order_id for update;
  if not found then raise exception using errcode='P0002',message='event order not found'; end if;
  if v_order.fund_contribution_id is null then
    return public.record_paypal_capture_event(p_paypal_order_id,p_capture,p_lines);
  end if;
  select * into v_contribution from public.fund_contributions where org_id=v_order.org_id and id=v_order.fund_contribution_id for update;
  if not found then raise exception using errcode='P0002',message='linked contribution not found'; end if;
  v_capture_id:=p_capture->>'id';
  v_minor:=nullif(p_capture->'amount'->>'minor','')::bigint;
  v_currency:=p_capture->>'currency';
  if coalesce(v_minor,0)<=0 or v_capture_id is null then raise exception using errcode='22023',message='capture amount is invalid'; end if;
  if v_minor<>v_order.amount_minor or v_minor<>v_contribution.amount_minor or v_currency<>v_order.currency or v_currency<>'USD' then
    update public.fund_contributions set capture_mismatch=true,capture_mismatch_reason='Verified PayPal capture amount or currency does not match the pledge.'
      where org_id=v_order.org_id and id=v_contribution.id;
    return jsonb_build_object('orgId',v_order.org_id,'mismatch',true,'posted',false,'contributionId',v_contribution.id);
  end if;
  v_result:=public.record_paypal_capture_event(p_paypal_order_id,p_capture,p_lines);
  if p_capture->>'status'='COMPLETED' then
    update public.fund_contributions set status='received',paypal_capture_id=v_capture_id,received_at=coalesce(nullif(p_capture->>'occurred_at','')::timestamptz,now()),capture_mismatch=false,capture_mismatch_reason=null
      where org_id=v_order.org_id and id=v_contribution.id and status='pledged' and (paypal_capture_id is null or paypal_capture_id=v_capture_id);
    v_changed:=found;
    if v_contribution.paypal_capture_id is not null and v_contribution.paypal_capture_id<>v_capture_id then
      raise exception using errcode='23505',message='contribution is linked to a different capture';
    end if;
    if v_changed then
      insert into public.fund_receipts(org_id,contribution_id,receipt_number,issued_at)
        values(v_order.org_id,v_contribution.id,'RCP-'||upper(substr(replace(v_contribution.id::text,'-',''),1,16)),now())
        on conflict(org_id,contribution_id) do nothing;
      insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
        values(v_order.org_id,v_contribution.created_by,'fund.contribution.received','fund_contribution',v_contribution.id::text,jsonb_build_object('paypal_capture_id',v_capture_id,'amount_minor',v_contribution.amount_minor,'currency','USD'), 'paypal:'||v_capture_id);
    end if;
  end if;
  return jsonb_build_object('orgId',v_order.org_id,'mismatch',false,'posted',true,'contributionId',v_contribution.id,'result',v_result->'result');
end
$$;

create or replace function public.get_fund_campaign_summary(p_org uuid,p_campaign_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_campaign public.fund_campaigns; v_pledged bigint; v_received bigint; v_allocated bigint; v_approved bigint; v_spent bigint;
begin
  select * into v_campaign from public.fund_campaigns where org_id=p_org and id=p_campaign_id;
  if not found then raise exception using errcode='P0002',message='campaign not found'; end if;
  select coalesce(sum(amount_minor) filter(where status='pledged'),0),coalesce(sum(amount_minor) filter(where status='received'),0)
    into v_pledged,v_received from public.fund_contributions where org_id=p_org and campaign_id=p_campaign_id;
  select coalesce(sum(amount_minor),0) into v_allocated from public.fund_allocations where org_id=p_org and campaign_id=p_campaign_id;
  select coalesce(sum(p.amount_minor),0) into v_approved
    from public.fund_maintenance_payments p join public.maintenance_requests m on m.org_id=p.org_id and m.id=p.maintenance_request_id
    where p.org_id=p_org and m.campaign_id=p_campaign_id and exists (
      select 1 from public.fund_approvals_chain a where a.org_id=p.org_id and a.maintenance_request_id=p.maintenance_request_id and a.step='payment' and a.decision='approved'
    );
  select coalesce(sum(l.debit_minor-l.credit_minor),0) into v_spent
    from public.fund_maintenance_payments p join public.maintenance_requests m on m.org_id=p.org_id and m.id=p.maintenance_request_id
    join public.journal_entries e on e.org_id=p.org_id and e.id=p.ledger_entry_id
    join public.journal_lines l on l.org_id=e.org_id and l.journal_entry_id=e.id
    join public.accounts a on a.org_id=l.org_id and a.id=l.account_id
    where p.org_id=p_org and m.campaign_id=p_campaign_id and p.ledger_entry_id is not null and a.code='5100';
  return jsonb_build_object(
    'campaign',jsonb_build_object('id',v_campaign.id,'title',v_campaign.title,'purpose',v_campaign.purpose,'targetMinor',v_campaign.target_minor,'currency',v_campaign.currency,'deadline',v_campaign.deadline,'organiser',v_campaign.organiser,'status',v_campaign.status),
    'pledgedMinor',v_pledged,'receivedMinor',v_received,'allocatedMinor',v_allocated,'approvedExpensesMinor',v_approved,'actualSpendingMinor',v_spent,
    'remainingMinor',v_campaign.target_minor-v_received,'asOf',now(),
    'legalCaution','Real-money pooled funds, donations, and third-party payouts depend on PayPal product eligibility and local rules. Sandbox demonstrates the workflow only.'
  );
end
$$;

revoke all on function public.create_fund_campaign(uuid,uuid,text,text,bigint,date,text,text,text) from public,anon,authenticated;
revoke all on function public.create_fund_pledge(uuid,uuid,uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.link_fund_contribution_order(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.record_fund_paypal_capture_event(text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.get_fund_campaign_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_fund_campaign(uuid,uuid,text,text,bigint,date,text,text,text) to service_role;
grant execute on function public.create_fund_pledge(uuid,uuid,uuid,bigint,text) to service_role;
grant execute on function public.link_fund_contribution_order(uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.record_fund_paypal_capture_event(text,jsonb,jsonb) to service_role;
grant execute on function public.get_fund_campaign_summary(uuid,uuid) to service_role;
