-- Phase 6 T4: queue-gated SIMULATED maintenance payment. No PayPal call or ledger posting occurs.
alter table public.approvals
  drop constraint if exists approvals_proposal_type_check;
alter table public.approvals
  add constraint approvals_proposal_type_check
  check (proposal_type in ('refund','dispute-evidence','hold-payout','send-invoice','maintenance-payment','other'));

alter table public.approvals
  add column fund_maintenance_request_id uuid;
alter table public.approvals
  add constraint approvals_fund_maintenance_request_fk
  foreign key (org_id,fund_maintenance_request_id)
  references public.maintenance_requests(org_id,id) on delete restrict;
create unique index approvals_one_maintenance_payment_per_request
  on public.approvals(org_id,fund_maintenance_request_id)
  where proposal_type='maintenance-payment' and fund_maintenance_request_id is not null;
create unique index fund_maintenance_payments_one_per_request
  on public.fund_maintenance_payments(org_id,maintenance_request_id);

create or replace function public.request_fund_maintenance_payment(
  p_org uuid,p_request uuid,p_actor uuid,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request public.maintenance_requests;
  v_quote public.fund_quotations;
  v_contractor public.fund_contractors;
  v_approval public.approvals;
  v_threshold bigint;
  v_required integer;
  v_count integer;
  v_approval_id text;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin','accountant','approver')) then
    raise exception using errcode='42501',message='maintenance payment request role required';
  end if;
  select * into v_request from public.maintenance_requests where org_id=p_org and id=p_request for update;
  if not found then raise exception using errcode='P0002',message='maintenance request not found'; end if;
  select * into v_approval from public.approvals
    where org_id=p_org and fund_maintenance_request_id=p_request and proposal_type='maintenance-payment' for update;
  if found then
    return jsonb_build_object('approvalId',v_approval.id,'proposalType',v_approval.proposal_type,'status',v_approval.status,
      'amountMinor',v_approval.amount_minor,'currency',coalesce(v_approval.currency,'USD'),'mode','SIMULATED','simulated',true,
      'gap','simulated, no ledger entry','result',v_approval.result);
  end if;
  if v_request.status<>'payment_approved' then raise exception using errcode='23514',message='maintenance payment requires payment_approved state'; end if;
  select * into v_quote from public.fund_quotations
    where org_id=p_org and id=v_request.chosen_quotation_id and maintenance_request_id=p_request;
  if not found then raise exception using errcode='23514',message='chosen quotation is unavailable'; end if;
  select * into v_contractor from public.fund_contractors where org_id=p_org and id=v_request.contractor_id;
  if not found or v_contractor.verification_status<>'verified' then raise exception using errcode='23514',message='contractor must be verified'; end if;
  select coalesce((select two_person_approval_threshold_minor from public.fund_transparency_settings where org_id=p_org),10000)
    into v_threshold;
  v_required:=case when v_quote.amount_minor>=v_threshold then 2 else 1 end;
  select count(distinct approver_id)::integer into v_count from public.fund_approvals_chain
    where org_id=p_org and maintenance_request_id=p_request and step='payment' and decision='approved';
  if v_count<v_required then raise exception using errcode='23514',message='payment approval threshold is not satisfied'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='request id is required'; end if;
  v_approval_id:='APR-FUND-PAY-'||replace(p_request::text,'-','');
  insert into public.approvals(org_id,id,proposal_type,amount_minor,currency,status,request_payload,created_by,fund_maintenance_request_id)
    values(p_org,v_approval_id,'maintenance-payment',v_quote.amount_minor,'USD','pending',
      jsonb_build_object('maintenanceRequestId',p_request,'quotationId',v_quote.id,'amountMinor',v_quote.amount_minor,
        'mode','SIMULATED','gap','simulated, no ledger entry'),p_actor,p_request);
  select * into v_approval from public.approvals where org_id=p_org and id=v_approval_id;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'fund.maintenance.payment_queued','maintenance_payment_approval',v_approval_id,
      jsonb_build_object('maintenance_request_id',p_request,'amount_minor',v_quote.amount_minor,'mode','SIMULATED'),p_request_id);
  return jsonb_build_object('approvalId',v_approval.id,'proposalType',v_approval.proposal_type,'status',v_approval.status,
    'amountMinor',v_quote.amount_minor,'currency','USD','mode','SIMULATED','simulated',true,'gap','simulated, no ledger entry');
end
$$;

create or replace function public.decide_fund_maintenance_payment(
  p_org uuid,p_approval_id text,p_reviewer uuid,p_decision text,p_note text,p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_approval public.approvals;
  v_request public.maintenance_requests;
  v_quote public.fund_quotations;
  v_contractor public.fund_contractors;
  v_chain_approval public.fund_approvals_chain;
  v_payment public.fund_maintenance_payments;
  v_threshold bigint;
  v_required integer;
  v_count integer;
  v_result jsonb;
  v_request_id uuid;
begin
  if not exists(select 1 from public.memberships where org_id=p_org and user_id=p_reviewer and role in ('owner','admin','approver')) then
    raise exception using errcode='42501',message='maintenance payment reviewer role required';
  end if;
  if p_decision not in ('approve','reject') then raise exception using errcode='22023',message='invalid payment decision'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='request id is required'; end if;
  select fund_maintenance_request_id into v_request_id from public.approvals
    where org_id=p_org and id=p_approval_id and proposal_type='maintenance-payment';
  if not found then raise exception using errcode='P0002',message='maintenance payment approval not found'; end if;
  select * into v_request from public.maintenance_requests where org_id=p_org and id=v_request_id for update;
  if not found then raise exception using errcode='P0002',message='maintenance request not found'; end if;
  select * into v_approval from public.approvals
    where org_id=p_org and id=p_approval_id and proposal_type='maintenance-payment' for update;
  if not found then raise exception using errcode='P0002',message='maintenance payment approval not found'; end if;
  if v_approval.status='completed' and p_decision='approve' then return coalesce(v_approval.result,'{}'::jsonb); end if;
  if v_approval.status='rejected' and p_decision='reject' then
    return jsonb_build_object('approvalId',v_approval.id,'status','rejected','mode','SIMULATED','simulated',true,'gap','simulated, no ledger entry');
  end if;
  if v_approval.status<>'pending' then raise exception using errcode='23514',message='maintenance payment approval is already decided'; end if;
  if p_note is not null and char_length(p_note)>500 then raise exception using errcode='22023',message='approval note is too long'; end if;
  if p_decision='reject' then
    update public.approvals set status='rejected',decision_note=nullif(trim(p_note),''),reviewer_id=p_reviewer,decided_at=pg_catalog.now(),updated_at=pg_catalog.now()
      where org_id=p_org and id=p_approval_id returning * into v_approval;
    insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
      values(p_org,p_reviewer,'fund.maintenance.payment_rejected','maintenance_payment_approval',v_approval.id,
        jsonb_build_object('maintenance_request_id',v_approval.fund_maintenance_request_id,'mode','SIMULATED'),p_request_id);
    return jsonb_build_object('approvalId',v_approval.id,'status','rejected','mode','SIMULATED','simulated',true,'gap','simulated, no ledger entry');
  end if;
  if v_request.status<>'payment_approved' then raise exception using errcode='23514',message='maintenance request is not payment_approved'; end if;
  if v_request.requested_by=p_reviewer then raise exception using errcode='42501',message='requester cannot approve own request'; end if;
  select * into v_quote from public.fund_quotations
    where org_id=p_org and id=v_request.chosen_quotation_id and maintenance_request_id=v_request.id;
  if not found then raise exception using errcode='23514',message='chosen quotation is unavailable'; end if;
  select * into v_contractor from public.fund_contractors where org_id=p_org and id=v_request.contractor_id;
  if not found or v_contractor.verification_status<>'verified' then raise exception using errcode='23514',message='contractor must be verified'; end if;
  select coalesce((select two_person_approval_threshold_minor from public.fund_transparency_settings where org_id=p_org),10000)
    into v_threshold;
  v_required:=case when v_quote.amount_minor>=v_threshold then 2 else 1 end;
  select count(distinct approver_id)::integer into v_count from public.fund_approvals_chain
    where org_id=p_org and maintenance_request_id=v_request.id and step='payment' and decision='approved';
  if v_count<v_required then raise exception using errcode='23514',message='payment approval threshold is not satisfied'; end if;
  select * into v_chain_approval from public.fund_approvals_chain
    where org_id=p_org and maintenance_request_id=v_request.id and step='payment' and decision='approved'
    order by decided_at desc,id desc limit 1;
  if not found then raise exception using errcode='23514',message='payment approval record is unavailable'; end if;
  select * into v_payment from public.fund_maintenance_payments where org_id=p_org and maintenance_request_id=v_request.id;
  if not found then
    insert into public.fund_maintenance_payments(org_id,maintenance_request_id,quotation_id,amount_minor,approval_id,mode,status)
      values(p_org,v_request.id,v_quote.id,v_quote.amount_minor,v_chain_approval.id,'SIMULATED','paid') returning * into v_payment;
    update public.maintenance_requests set status='paid',updated_at=pg_catalog.now() where org_id=p_org and id=v_request.id;
  end if;
  v_result:=jsonb_build_object('approvalId',v_approval.id,'status','simulated','mode','SIMULATED','simulated',true,
    'paymentId',v_payment.id,'maintenanceRequestId',v_request.id,'amountMinor',v_payment.amount_minor,'currency','USD',
    'paypalPayoutRef',null,'ledgerEntryId',null,'gap','simulated, no ledger entry',
    'legalCaution','Real-money pooled funds and third-party payouts depend on PayPal product eligibility and local rules. Sandbox demonstrates the workflow only.');
  update public.approvals set status='completed',decision_note=nullif(trim(p_note),''),reviewer_id=p_reviewer,
    decided_at=pg_catalog.now(),result=v_result,updated_at=pg_catalog.now()
    where org_id=p_org and id=p_approval_id;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_reviewer,'fund.maintenance.payment_simulated','fund_maintenance_payment',v_payment.id::text,
      jsonb_build_object('maintenance_request_id',v_request.id,'amount_minor',v_payment.amount_minor,'mode','SIMULATED',
        'ledger_entry_id',null,'gap','simulated, no ledger entry'),p_request_id);
  return v_result;
end
$$;

revoke all on function public.request_fund_maintenance_payment(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.decide_fund_maintenance_payment(uuid,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.request_fund_maintenance_payment(uuid,uuid,uuid,text) to service_role;
grant execute on function public.decide_fund_maintenance_payment(uuid,text,uuid,text,text,text) to service_role;
