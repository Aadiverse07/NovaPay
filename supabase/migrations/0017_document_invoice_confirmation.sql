alter table public.invoices
  add column source_document_id uuid references public.documents(id) on delete set null;

create unique index invoices_one_draft_per_source_document
  on public.invoices(org_id, source_document_id) where source_document_id is not null;

create or replace function public.confirm_document_invoice(
  p_org uuid,
  p_document uuid,
  p_actor uuid,
  p_invoice jsonb,
  p_lines jsonb,
  p_request_id text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_document public.documents;
  v_invoice public.invoices;
  v_created jsonb;
begin
  if not exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = p_actor and m.role in ('owner','admin','accountant')
  ) then
    raise exception using errcode = '42501', message = 'accountant membership required';
  end if;

  select * into v_document from public.documents d
  where d.org_id = p_org and d.id = p_document for update;
  if not found then raise exception using errcode = 'P0002', message = 'document not found'; end if;

  select * into v_invoice from public.invoices i
  where i.org_id = p_org and i.source_document_id = p_document;
  if found then return jsonb_build_object('invoice_id', v_invoice.id, 'state', v_invoice.state, 'already_confirmed', true); end if;
  if v_document.status <> 'processed' then
    raise exception using errcode = '22023', message = 'only processed documents can be confirmed';
  end if;
  if (p_invoice->>'created_by')::uuid <> p_actor then
    raise exception using errcode = '42501', message = 'invoice actor mismatch';
  end if;

  v_created := public.create_invoice_draft(p_org, p_invoice, p_lines);
  update public.invoices i set source_document_id = p_document
  where i.org_id = p_org and i.id = (v_created->>'id')::uuid
  returning * into v_invoice;

  update public.documents d set extraction = jsonb_set(
    coalesce(d.extraction, '{}'::jsonb), '{confirmation}',
    jsonb_build_object('confirmedAt', now(), 'confirmedBy', p_actor, 'invoiceDraftId', v_invoice.id), true
  ), updated_at = now()
  where d.org_id = p_org and d.id = p_document;

  insert into public.audit_log(org_id, actor_id, action, entity, entity_id, metadata, request_id)
  values (p_org, p_actor, 'document.confirmed', 'document', p_document::text,
    jsonb_build_object('invoiceDraftId', v_invoice.id), coalesce(p_request_id, ''));

  return jsonb_build_object('invoice_id', v_invoice.id, 'state', v_invoice.state, 'already_confirmed', false);
end
$$;

revoke all on function public.confirm_document_invoice(uuid,uuid,uuid,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.confirm_document_invoice(uuid,uuid,uuid,jsonb,jsonb,text) to service_role;
