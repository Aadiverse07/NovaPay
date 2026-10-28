create extension if not exists pgcrypto;
create schema if not exists private;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'accountant', 'approver', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_org_idx on public.memberships(user_id, org_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  request_id text not null,
  created_at timestamptz not null default now()
);
create index audit_log_org_created_idx on public.audit_log(org_id, created_at desc);

create or replace function private.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = (select auth.uid()))
$$;

create or replace function private.has_role(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = any(p_roles))
$$;

revoke all on function private.is_member(uuid) from public, anon;
revoke all on function private.has_role(uuid, text[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, text[]) to authenticated;

create or replace function private.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''))
  on conflict (id) do nothing;
  return new;
end
$$;
revoke all on function private.create_profile_for_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function private.create_profile_for_auth_user();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.audit_log enable row level security;

create policy organizations_select_member on public.organizations
  for select to authenticated using (private.is_member(id));
create policy organizations_update_admin on public.organizations
  for update to authenticated using (private.has_role(id, array['owner','admin'])) with check (private.has_role(id, array['owner','admin']));
create policy organizations_delete_owner on public.organizations
  for delete to authenticated using (private.has_role(id, array['owner']));

create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy memberships_select_member on public.memberships
  for select to authenticated using (private.is_member(org_id));
create policy memberships_insert_managers on public.memberships
  for insert to authenticated with check (
    private.has_role(org_id, array['owner']) or
    (private.has_role(org_id, array['admin']) and role <> 'owner')
  );
create policy memberships_update_managers on public.memberships
  for update to authenticated using (
    private.has_role(org_id, array['owner']) or
    (private.has_role(org_id, array['admin']) and role <> 'owner')
  ) with check (
    private.has_role(org_id, array['owner']) or
    (private.has_role(org_id, array['admin']) and role <> 'owner')
  );
create policy memberships_delete_managers on public.memberships
  for delete to authenticated using (
    private.has_role(org_id, array['owner']) or
    (private.has_role(org_id, array['admin']) and role <> 'owner')
  );

create policy audit_log_select_admin on public.audit_log
  for select to authenticated using (private.has_role(org_id, array['owner','admin']));

revoke all on public.organizations, public.profiles, public.memberships, public.audit_log from public, anon, authenticated;
grant select, update, delete on public.organizations to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select on public.audit_log to authenticated;
grant all on public.organizations, public.profiles, public.memberships to service_role;
revoke all on public.audit_log from service_role;
grant insert on public.audit_log to service_role;

create or replace function public.create_organization_for_user(p_user_id uuid, p_name text, p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
  v_count integer;
  v_existing_org uuid;
begin
  -- EXECUTE is revoked from PUBLIC, anon, and authenticated and granted only to service_role.
  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception using errcode = '22023', message = 'user does not exist';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalid organization name';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select count(*) into v_count from public.memberships where user_id = p_user_id;
  if v_count > 0 then
    select org_id into v_existing_org from public.memberships where user_id = p_user_id limit 1;
    if v_count = 1 and exists (select 1 from public.memberships where user_id = p_user_id and org_id = v_existing_org and role = 'owner') then
      return jsonb_build_object('organizationId', v_existing_org, 'created', false);
    end if;
    raise exception using errcode = '23505', message = 'account already belongs to an organization';
  end if;
  insert into public.organizations(name, created_by) values (trim(p_name), p_user_id) returning id into v_org_id;
  insert into public.memberships(org_id, user_id, role) values (v_org_id, p_user_id, 'owner');
  insert into public.audit_log(org_id, actor_id, action, entity, entity_id, metadata, request_id)
    values (v_org_id, p_user_id, 'organization.created', 'organization', v_org_id::text, jsonb_build_object('name', trim(p_name)), p_request_id);
  return jsonb_build_object('organizationId', v_org_id, 'created', true);
end
$$;
revoke all on function public.create_organization_for_user(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_organization_for_user(uuid, text, text) to service_role;
