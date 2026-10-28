create or replace function public.mark_invoice_paid(p_paypal_invoice_id text,p_event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices;
  v_resource jsonb;
  v_payments jsonb;
  v_payment jsonb;
  v_payment_id text;
  v_status text;
  v_currency text;
  v_payment_currency text;
  v_amount_text text;
  v_received_minor bigint:=0;
  v_payment_minor bigint;
  v_has_payments boolean:=false;
  v_mismatch boolean:=false;
begin
  v_resource:=coalesce(p_event->'resource','{}'::jsonb);
  v_status:=upper(coalesce(v_resource->>'status',''));
  if v_status not in ('PAID','PAID_EXTERNAL','MARKED_AS_PAID') then
    return jsonb_build_object('updated',false,'reason','not_paid');
  end if;

  select * into v_invoice
  from public.invoices
  where paypal_invoice_id=p_paypal_invoice_id and state in ('reviewed','sent')
  for update;
  if not found then
    return jsonb_build_object('updated',false,'reason','invoice_not_found_or_already_paid');
  end if;

  v_currency:=upper(coalesce(v_resource->'amount'->>'currency_code',''));
  v_payments:=coalesce(v_resource->'payments','[]'::jsonb);
  if jsonb_typeof(v_payments)='array' and jsonb_array_length(v_payments)>0 then
    v_has_payments:=true;
    for v_payment in select value from jsonb_array_elements(v_payments) as p(value) loop
      v_payment_currency:=upper(coalesce(v_payment->'amount'->>'currency_code',''));
      v_amount_text:=coalesce(v_payment->'amount'->>'value','');
      if v_amount_text !~ '^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$' then
        v_mismatch:=true;
        continue;
      end if;
      v_payment_minor:=round(v_amount_text::numeric*100)::bigint;
      v_received_minor:=v_received_minor+v_payment_minor;
      if v_payment_currency<>v_invoice.currency then v_mismatch:=true; end if;
      if v_currency<>'' and v_currency<>v_payment_currency then v_mismatch:=true; end if;
    end loop;
  else
    v_amount_text:=coalesce(v_resource->'amount'->>'value','');
    if v_amount_text !~ '^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$' then
      v_mismatch:=true;
    else
      v_received_minor:=round(v_amount_text::numeric*100)::bigint;
    end if;
    if v_currency<>v_invoice.currency then v_mismatch:=true; end if;
  end if;

  if v_mismatch or v_received_minor<>v_invoice.total_minor then
    insert into public.invoice_events(org_id,invoice_id,event_type,details)
    values(v_invoice.org_id,v_invoice.id,'paid.amount_mismatch',jsonb_build_object(
      'eventId',p_event->>'id','eventType',p_event->>'event_type',
      'expectedMinor',v_invoice.total_minor,'receivedMinor',v_received_minor,
      'expectedCurrency',v_invoice.currency,'receivedCurrency',v_currency,
      'paymentsPresent',v_has_payments));
    return jsonb_build_object('updated',false,'mismatch',true,'orgId',v_invoice.org_id,
      'invoiceId',v_invoice.id,'expectedMinor',v_invoice.total_minor,
      'receivedMinor',v_received_minor,'expectedCurrency',v_invoice.currency,
      'receivedCurrency',v_currency);
  end if;

  v_payment_id:=coalesce(v_resource->'payments'->0->>'payment_id',v_resource->'payments'->0->>'transaction_id');
  update public.invoices set state='paid',paid_at=now(),paypal_payment_id=v_payment_id,
    paypal_capture_id=(select c.paypal_capture_id from public.paypal_captures c
      where c.org_id=invoices.org_id and c.paypal_capture_id=v_payment_id limit 1),updated_at=now()
  where org_id=v_invoice.org_id and id=v_invoice.id
  returning * into v_invoice;
  insert into public.invoice_events(org_id,invoice_id,event_type,details)
  values(v_invoice.org_id,v_invoice.id,'paid.webhook',jsonb_build_object(
    'eventId',p_event->>'id','eventType',p_event->>'event_type','status',v_status,
    'payments',coalesce(v_resource->'payments','[]'::jsonb)));
  return jsonb_build_object('updated',true,'orgId',v_invoice.org_id,'invoiceId',v_invoice.id);
end
$$;

revoke all on function public.mark_invoice_paid(text,jsonb) from public,anon,authenticated;
grant execute on function public.mark_invoice_paid(text,jsonb) to service_role;
