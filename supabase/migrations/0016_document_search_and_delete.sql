-- Phase 5 Part 3: budgeted embeddings, tenant-scoped hybrid retrieval, and audited document deletion.
-- Apply only after operator review; migrations are not run by application startup.

alter table public.ai_usage drop constraint if exists ai_usage_route_check;
alter table public.ai_usage add constraint ai_usage_route_check check (route in ('code','sql','ocr','embedding','retrieval','llm'));

create or replace function public.reserve_ai_usage(
  p_org uuid,p_user uuid,p_route text,p_model text,p_input_tokens integer,p_user_limit integer,p_org_limit integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_day timestamptz := date_trunc('day',now() at time zone 'utc') at time zone 'utc';
  v_user_count integer;
  v_org_count integer;
  v_id uuid;
begin
  if p_org is null or p_user is null or not exists(select 1 from public.memberships where org_id=p_org and user_id=p_user) then
    raise exception using errcode='42501',message='organization membership required';
  end if;
  if p_route is null or p_route not in ('code','sql','ocr','embedding','retrieval','llm') or p_model is null or length(p_model)>120 or p_input_tokens is null or p_input_tokens<0 or p_user_limit is null or p_user_limit<1 or p_org_limit is null or p_org_limit<1 then
    raise exception using errcode='22023',message='invalid AI usage reservation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  select count(*) into v_user_count from public.ai_usage where org_id=p_org and user_id=p_user and created_at>=v_day and not cache_hit;
  select count(*) into v_org_count from public.ai_usage where org_id=p_org and created_at>=v_day and not cache_hit;
  if v_user_count>=p_user_limit then return jsonb_build_object('allowed',false,'reason','user_limit'); end if;
  if v_org_count>=p_org_limit then return jsonb_build_object('allowed',false,'reason','org_limit'); end if;
  insert into public.ai_usage(org_id,user_id,route,model,input_tokens,status)
    values(p_org,p_user,p_route,p_model,p_input_tokens,'reserved') returning id into v_id;
  return jsonb_build_object('allowed',true,'usageId',v_id);
end
$$;
revoke all on function public.reserve_ai_usage(uuid,uuid,text,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_usage(uuid,uuid,text,text,integer,integer,integer) to service_role;

create or replace function public.search_document_chunks(
  p_org uuid,p_user uuid,p_query text,p_embedding extensions.vector(768),p_limit integer default 8
) returns table(chunk_id uuid,document_id uuid,chunk_index integer,filename text,content text,lexical_rank real,semantic_similarity real)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_org is null or p_user is null or not exists(select 1 from public.memberships m where m.org_id=p_org and m.user_id=p_user) then
    raise exception using errcode='42501',message='organization membership required';
  end if;
  if p_query is null or char_length(p_query) not between 1 and 1000 or p_embedding is null or p_limit is null or p_limit not between 1 and 12 then
    raise exception using errcode='22023',message='invalid document search';
  end if;
  return query
  with eligible as (
    select c.id,c.document_id,c.chunk_index,c.content,c.embedding,d.filename
    from public.document_chunks c
    join public.documents d on d.org_id=c.org_id and d.id=c.document_id
    where c.org_id=p_org and d.status='processed' and c.embedding is not null
  ), lexical as (
    select e.id,ts_rank_cd(to_tsvector('english',e.content),plainto_tsquery('english',p_query)) as rank_value
    from eligible e
    where to_tsvector('english',e.content) @@ plainto_tsquery('english',p_query)
    order by rank_value desc limit p_limit*3
  ), lexical_ranked as (
    select l.id,l.rank_value,row_number() over(order by l.rank_value desc,l.id) as position from lexical l
  ), semantic_ranked as (
    select e.id,1-(e.embedding OPERATOR(extensions.<=>) p_embedding) as similarity,row_number() over(order by e.embedding OPERATOR(extensions.<=>) p_embedding,e.id) as position
    from eligible e order by e.embedding OPERATOR(extensions.<=>) p_embedding,e.id limit p_limit*3
  ), signals as (
    select id,1.0/(60+position) as score from lexical_ranked
    union all
    select id,1.0/(60+position) as score from semantic_ranked
  ), fused as (
    select id,sum(score) as score from signals group by id order by sum(score) desc limit p_limit
  )
  select e.id,e.document_id,e.chunk_index,e.filename,e.content,
         coalesce(l.rank_value,0)::real,coalesce(s.similarity,0)::real
  from fused f join eligible e on e.id=f.id
  left join lexical_ranked l on l.id=f.id
  left join semantic_ranked s on s.id=f.id
  order by f.score desc,e.id;
end
$$;
revoke all on function public.search_document_chunks(uuid,uuid,text,extensions.vector,integer) from public,anon,authenticated;
grant execute on function public.search_document_chunks(uuid,uuid,text,extensions.vector,integer) to service_role;

create or replace function public.delete_document(p_org uuid,p_document uuid,p_actor uuid,p_request_id text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_path text;
begin
  if p_org is null or p_document is null or p_actor is null or not exists(
    select 1 from public.memberships m where m.org_id=p_org and m.user_id=p_actor and m.role in ('owner','admin','accountant')
  ) then
    raise exception using errcode='42501',message='accountant membership required';
  end if;
  select d.storage_path into v_path from public.documents d where d.id=p_document and d.org_id=p_org for update;
  if not found then return null; end if;
  delete from public.documents where id=p_document and org_id=p_org;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_actor,'document.deleted','document',p_document::text,jsonb_build_object('storagePathRemoved',true),coalesce(p_request_id,''));
  return v_path;
end
$$;
revoke all on function public.delete_document(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.delete_document(uuid,uuid,uuid,text) to service_role;
