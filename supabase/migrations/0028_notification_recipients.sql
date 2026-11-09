drop policy if exists notifications_select_member on public.notifications;
create policy notifications_select_member on public.notifications for select to authenticated using (
  private.is_member(org_id) and (recipient_user_id is null or recipient_user_id=auth.uid())
);

create or replace function public.set_notification_status_for_user(p_org uuid,p_notification_id uuid,p_status text,p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.notifications;
begin
  if p_status is null or p_status not in ('read','dismissed') then raise exception using errcode='22023',message='invalid notification status'; end if;
  update public.notifications set status=p_status,
    read_at=case when p_status='read' then coalesce(read_at,now()) else read_at end,
    dismissed_at=case when p_status='dismissed' then coalesce(dismissed_at,now()) else dismissed_at end
    where org_id=p_org and id=p_notification_id and (recipient_user_id is null or recipient_user_id=p_user)
    returning * into v_row;
  if not found then return null; end if;
  return to_jsonb(v_row);
end $$;
revoke all on function public.set_notification_status_for_user(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.set_notification_status_for_user(uuid,uuid,text,uuid) to service_role;
notify pgrst, 'reload schema';
