-- Correct fund contribution capture classification without changing posted journal rows.
-- Every affected capture receives two new entries: an exact reversal of the original capture
-- and a repost with account 4000 mapped to Donations (4100).
do $fund_accounting$
declare
  v_fund record;
  v_reversal_id uuid;
  v_repost_id uuid;
  v_donations_account_id uuid;
  v_line_count integer;
  v_debits bigint;
  v_credits bigint;
  v_sales_net bigint;
begin
  for v_fund in
    select distinct fc.org_id, pc.paypal_capture_id, pc.amount_minor, pc.currency, je.id as original_entry_id
    from public.fund_contributions fc
    join public.paypal_orders po
      on po.org_id=fc.org_id and po.fund_contribution_id=fc.id
    join public.paypal_captures pc
      on pc.org_id=po.org_id and pc.order_id=po.id and pc.paypal_capture_id=fc.paypal_capture_id
    join public.journal_entries je
      on je.org_id=pc.org_id and je.source_type='capture' and je.source_id=pc.paypal_capture_id
    where fc.status='received'
      and fc.paypal_capture_id is not null
      and not exists (
        select 1 from public.journal_entries prior
        where prior.org_id=fc.org_id
          and prior.source_type='fund_reclassification_reversal'
          and prior.source_id=pc.paypal_capture_id
      )
      and exists (
        select 1
        from public.journal_lines jl
        join public.accounts a on a.org_id=jl.org_id and a.id=jl.account_id
        where jl.org_id=je.org_id and jl.journal_entry_id=je.id
          and a.code='4000' and jl.credit_minor>0
      )
  loop
    select id into v_donations_account_id
      from public.accounts
      where org_id=v_fund.org_id and code='4100';
    if v_donations_account_id is null then
      raise exception 'Donations account 4100 is missing for org %', v_fund.org_id;
    end if;

    select count(*)::integer, coalesce(sum(debit_minor),0), coalesce(sum(credit_minor),0)
      into v_line_count, v_debits, v_credits
      from public.journal_lines
      where org_id=v_fund.org_id and journal_entry_id=v_fund.original_entry_id;
    if v_line_count<2 or v_debits<>v_credits then
      raise exception 'Original fund capture journal entry % is not balanced', v_fund.original_entry_id;
    end if;

    select coalesce(sum(jl.credit_minor-jl.debit_minor),0)
      into v_sales_net
      from public.journal_lines jl
      join public.accounts a on a.org_id=jl.org_id and a.id=jl.account_id
      where jl.org_id=v_fund.org_id and jl.journal_entry_id=v_fund.original_entry_id and a.code='4000';
    if v_sales_net<>v_fund.amount_minor then
      raise exception 'Sales Revenue line does not equal fund capture amount for %', v_fund.paypal_capture_id;
    end if;

    insert into public.journal_entries(org_id,source_type,source_id,description,currency)
      values(v_fund.org_id,'fund_reclassification_reversal',v_fund.paypal_capture_id,
        'Reverse misclassified fund capture '||v_fund.paypal_capture_id,v_fund.currency)
      on conflict(org_id,source_type,source_id) do nothing
      returning id into v_reversal_id;
    if v_reversal_id is not null then
      insert into public.journal_lines(org_id,journal_entry_id,account_id,debit_minor,credit_minor,currency)
        select jl.org_id,v_reversal_id,jl.account_id,jl.credit_minor,jl.debit_minor,jl.currency
        from public.journal_lines jl
        where jl.org_id=v_fund.org_id and jl.journal_entry_id=v_fund.original_entry_id;
    end if;

    insert into public.journal_entries(org_id,source_type,source_id,description,currency)
      values(v_fund.org_id,'fund_reclassification_repost',v_fund.paypal_capture_id,
        'Repost fund capture to Donations account 4100 '||v_fund.paypal_capture_id,v_fund.currency)
      on conflict(org_id,source_type,source_id) do nothing
      returning id into v_repost_id;
    if v_repost_id is not null then
      insert into public.journal_lines(org_id,journal_entry_id,account_id,debit_minor,credit_minor,currency)
        select jl.org_id,v_repost_id,
          case when a.code='4000' then v_donations_account_id else jl.account_id end,
          jl.debit_minor,jl.credit_minor,jl.currency
        from public.journal_lines jl
        join public.accounts a on a.org_id=jl.org_id and a.id=jl.account_id
        where jl.org_id=v_fund.org_id and jl.journal_entry_id=v_fund.original_entry_id;
    end if;
  end loop;
end
$fund_accounting$;
