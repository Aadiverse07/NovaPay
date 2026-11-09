create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  account_hash text not null,
  ip_hash text not null,
  occurred_at timestamptz not null default now(),
  success boolean not null,
  failure_count integer not null default 0,
  lock_count integer not null default 0,
  locked_until timestamptz,
  user_id uuid references auth.users(id) on delete set null
);
create index login_attempts_account_time_idx on public.login_attempts(account_hash, occurred_at desc);
create index login_attempts_ip_time_idx on public.login_attempts(ip_hash, occurred_at desc);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from public, anon, authenticated;
grant select, insert on public.login_attempts to service_role;

create or replace function public.record_login_attempt(
  p_org_id uuid, p_user_id uuid, p_account_hash text, p_ip_hash text, p_success boolean,
  p_threshold integer default 5, p_window_minutes integer default 15, p_base_lock_minutes integer default 15
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_now timestamptz := now();
  v_failures integer := 0;
  v_lock_count integer := 0;
  v_locked_until timestamptz := null;
  v_previous_lock_count integer := 0;
begin
  if p_account_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid login attempt key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_account_hash, 0));
  if p_success then
    insert into public.login_attempts(org_id,user_id,account_hash,ip_hash,success) values(p_org_id,p_user_id,p_account_hash,p_ip_hash,true);
    return jsonb_build_object('locked',false,'failure_count',0,'lock_count',0);
  end if;
  select coalesce(max(locked_until),null), coalesce(max(lock_count),0)
    into v_locked_until,v_previous_lock_count from public.login_attempts
    where account_hash=p_account_hash and locked_until is not null and occurred_at >= v_now - interval '30 days';
  select count(*)::integer into v_failures from public.login_attempts
    where success=false and occurred_at >= v_now - make_interval(mins=>greatest(1,least(p_window_minutes,120)))
      and (account_hash=p_account_hash or ip_hash=p_ip_hash);
  v_failures := v_failures + 1;
  if v_locked_until <= v_now then v_locked_until := null; end if;
  if v_locked_until is null and v_failures >= greatest(2,least(p_threshold,20)) then
    v_lock_count := v_previous_lock_count + 1;
    v_locked_until := v_now + make_interval(mins=>least(1440,greatest(1,p_base_lock_minutes) * power(2,least(6,v_lock_count-1))::integer));
  else
    v_lock_count := v_previous_lock_count;
  end if;
  insert into public.login_attempts(org_id,user_id,account_hash,ip_hash,success,failure_count,lock_count,locked_until)
    values(p_org_id,p_user_id,p_account_hash,p_ip_hash,false,v_failures,v_lock_count,v_locked_until);
  return jsonb_build_object('locked',v_locked_until is not null and v_locked_until>v_now,'failure_count',v_failures,'lock_count',v_lock_count,'locked_until',v_locked_until);
end; $$;
revoke all on function public.record_login_attempt(uuid,uuid,text,text,boolean,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.record_login_attempt(uuid,uuid,text,text,boolean,integer,integer,integer) to service_role;
notify pgrst, 'reload schema';
