-- Read a small maintenance activity projection without granting table SELECT on audit_log.
create or replace function public.get_fund_maintenance_activity(
  p_org uuid,
  p_actor uuid,
  p_request uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if p_actor is null or not exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = p_actor
  ) then
    raise exception using errcode = '42501', message = 'organization membership required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'entityId', a.entity_id,
    'actorId', a.actor_id,
    'action', a.action,
    'at', a.created_at
  ) order by a.created_at, a.id), '[]'::jsonb)
  into v_rows
  from public.audit_log a
  where a.org_id = p_org
    and a.entity = 'maintenance_request'
    and (p_request is null or a.entity_id = p_request::text);

  return v_rows;
end
$$;

revoke all on function public.get_fund_maintenance_activity(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_fund_maintenance_activity(uuid, uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
