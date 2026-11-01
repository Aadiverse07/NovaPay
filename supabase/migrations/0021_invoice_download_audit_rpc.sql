-- Keep invoice download audit fail-closed without granting direct audit_log access.
create or replace function public.record_invoice_download_audit(
  p_org uuid,
  p_actor uuid,
  p_invoice uuid,
  p_request_id text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit_id uuid;
begin
  if p_request_id is null or length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'request id is required';
  end if;
  if not exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = p_actor
  ) then
    raise exception using errcode = '42501', message = 'organization membership required';
  end if;
  if not exists (
    select 1 from public.invoices
    where org_id = p_org and id = p_invoice
  ) then
    raise exception using errcode = 'P0002', message = 'invoice not found';
  end if;

  insert into public.audit_log(org_id, actor_id, action, entity, entity_id, metadata, request_id)
  values (p_org, p_actor, 'invoice.downloaded', 'invoice', p_invoice::text, '{}'::jsonb, p_request_id)
  returning id into v_audit_id;
  return v_audit_id;
end
$$;

revoke all on function public.record_invoice_download_audit(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_invoice_download_audit(uuid, uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
