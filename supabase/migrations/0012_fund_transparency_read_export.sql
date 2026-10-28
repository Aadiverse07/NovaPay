-- Phase 6 T6: tenant-scoped transparency and restricted audit export read RPCs.
revoke select on public.fund_campaigns,public.fund_contributions,public.fund_receipts,
  public.fund_allocations,public.fund_contractors,public.maintenance_requests,
  public.fund_quotations,public.fund_approvals_chain,public.fund_completion_evidence,
  public.fund_maintenance_payments,public.fund_transparency_settings
  from authenticated;

create or replace function public.get_fund_transparency(
  p_org uuid,p_actor uuid,p_campaign_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_campaigns jsonb;
  v_contributions jsonb;
  v_expenses jsonb;
begin
  if p_actor is null or not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor) then
    raise exception using errcode='42501',message='organization membership required';
  end if;
  if p_campaign_id is not null and not exists(select 1 from public.fund_campaigns where org_id=p_org and id=p_campaign_id) then
    raise exception using errcode='P0002',message='fund campaign not found';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaign',summary->'campaign' - 'organiser',
    'pledgedMinor',summary->'pledgedMinor','receivedMinor',summary->'receivedMinor',
    'allocatedMinor',summary->'allocatedMinor','approvedExpensesMinor',summary->'approvedExpensesMinor',
    'actualSpendingMinor',summary->'actualSpendingMinor','remainingMinor',summary->'remainingMinor','asOf',summary->'asOf'
  ) order by c.created_at desc),'[]'::jsonb) into v_campaigns
  from public.fund_campaigns c cross join lateral (select public.get_fund_campaign_summary(p_org,c.id) as summary) s
  where c.org_id=p_org and (p_campaign_id is null or c.id=p_campaign_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'campaignId',c.campaign_id,'amountMinor',c.amount_minor,'currency','USD','status',c.status,
    'donorRef',c.donor_ref,'createdAt',c.created_at,'countsAsFunds',c.status='received'
  ) order by c.created_at desc),'[]'::jsonb) into v_contributions
  from public.fund_contributions c where c.org_id=p_org and (p_campaign_id is null or c.campaign_id=p_campaign_id);
  select coalesce(jsonb_agg(x.expense order by x.created_at desc),'[]'::jsonb) into v_expenses from (
    select p.created_at,jsonb_build_object(
      'requestId',m.id,'campaignId',m.campaign_id,'title',m.title,'status',m.status,
      'amountMinor',p.amount_minor,'currency','USD',
      'approvals',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'step',a.step,'decision',a.decision,'decidedAt',a.decided_at) order by a.created_at)
        from public.fund_approvals_chain a where a.org_id=p.org_id and a.maintenance_request_id=m.id and a.decision='approved'),'[]'::jsonb),
      'paymentApproval',case when ga.id is null then null else jsonb_build_object('id',ga.id,'status',ga.status,'createdAt',ga.created_at) end,
      'quotation',case when q.id is null then null else jsonb_build_object('id',q.id,'amountMinor',q.amount_minor,'currency',q.currency) end,
      'invoice',null,
      'payment',jsonb_build_object('id',p.id,'mode',p.mode,'status',p.status,'amountMinor',p.amount_minor),
      'paymentReference',p.paypal_payout_ref,'ledgerEntryId',p.ledger_entry_id,
      'completionEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'reviewStatus',e.review_status,'submittedAt',e.submitted_at,'reviewedAt',e.reviewed_at) order by e.submitted_at)
        from public.fund_completion_evidence e where e.org_id=p.org_id and e.maintenance_request_id=m.id),'[]'::jsonb),
      'gaps',(select coalesce(jsonb_agg(jsonb_build_object('gap',g.gap) order by g.ordinal),'[]'::jsonb) from lateral (values
        (1,'no quotation or invoice',q.id is null),
        (2,'no payment approval',ga.id is null),
        (3,'no payment reference',p.paypal_payout_ref is null),
        (4,'simulated, no ledger entry',p.mode='SIMULATED' and p.ledger_entry_id is null),
        (5,'no ledger entry',p.mode<>'SIMULATED' and p.ledger_entry_id is null),
        (6,'no completion evidence',not exists(select 1 from public.fund_completion_evidence e where e.org_id=p.org_id and e.maintenance_request_id=m.id))
      ) as g(ordinal,gap,missing) where g.missing)
    ) as expense
    from public.fund_maintenance_payments p
    join public.maintenance_requests m on m.org_id=p.org_id and m.id=p.maintenance_request_id
    left join public.fund_quotations q on q.org_id=p.org_id and q.id=p.quotation_id
    left join public.approvals ga on ga.org_id=p.org_id and ga.fund_maintenance_request_id=m.id and ga.proposal_type='maintenance-payment'
    where p.org_id=p_org and (p_campaign_id is null or m.campaign_id=p_campaign_id)
  ) x;
  return jsonb_build_object(
    'orgId',p_org,'campaigns',v_campaigns,'contributions',v_contributions,'expenses',v_expenses,
    'namesShown',false,'legalCaution','Real-money pooled funds, donations, and third-party payouts depend on PayPal product eligibility and local rules. Sandbox demonstrates the workflow only.',
    'asOf',pg_catalog.now()
  );
end
$$;

create or replace function public.get_fund_audit_export(
  p_org uuid,p_actor uuid,p_from date default null,p_to date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if p_actor is null or not exists(select 1 from public.memberships where org_id=p_org and user_id=p_actor and role in ('owner','admin')) then
    raise exception using errcode='42501',message='audit export requires owner or admin role';
  end if;
  if p_from is not null and p_to is not null and p_from>p_to then
    raise exception using errcode='22023',message='audit export date range is invalid';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'createdAt',a.created_at,'action',a.action,'entity',a.entity,'entityId',a.entity_id,
    'actorId',a.actor_id,'requestId',a.request_id
  ) order by a.created_at,a.id),'[]'::jsonb) into v_rows
  from public.audit_log a where a.org_id=p_org
    and (p_from is null or a.created_at >= p_from::timestamptz)
    and (p_to is null or a.created_at < (p_to+1)::timestamptz);
  return v_rows;
end
$$;

revoke all on function public.get_fund_transparency(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_fund_audit_export(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function public.get_fund_transparency(uuid,uuid,uuid) to service_role;
grant execute on function public.get_fund_audit_export(uuid,uuid,date,date) to service_role;
