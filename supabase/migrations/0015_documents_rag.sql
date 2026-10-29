-- Phase 5 Part 1: private document intake and RAG storage foundation.
-- Apply only after explicit operator review; this file is not run by application startup.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;

create table public.documents (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  filename text not null check (char_length(filename) between 1 and 120),
  mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  page_count integer not null check (page_count between 1 and 10),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploaded' check (status in ('uploading','uploaded','processing','processed','failed','rejected')),
  duplicate_of uuid references public.documents(id) on delete set null,
  extraction jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);
create index documents_org_created_idx on public.documents(org_id, created_at desc);
create index documents_org_sha256_idx on public.documents(org_id, sha256);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  document_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (char_length(content) between 1 and 12000),
  embedding extensions.vector(768),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint document_chunks_document_fk foreign key (org_id, document_id) references public.documents(org_id, id) on delete cascade,
  unique (document_id, chunk_index)
);
create index document_chunks_org_document_idx on public.document_chunks(org_id, document_id);

create table public.document_search_hits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  query_hash text not null check (query_hash ~ '^[0-9a-f]{64}$'),
  chunk_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint document_search_hits_document_fk foreign key (org_id, document_id) references public.documents(org_id, id) on delete cascade
);
create index document_search_hits_org_created_idx on public.document_search_hits(org_id, created_at desc);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.document_search_hits enable row level security;
create policy documents_select_member on public.documents for select to authenticated using (private.is_member(org_id));
create policy document_chunks_select_member on public.document_chunks for select to authenticated using (private.is_member(org_id));
create policy document_search_hits_select_self on public.document_search_hits for select to authenticated using (user_id = (select auth.uid()) and private.is_member(org_id));
revoke all on public.documents, public.document_chunks, public.document_search_hits from public, anon, authenticated;
grant select on public.documents, public.document_chunks, public.document_search_hits to authenticated;
grant all on public.documents, public.document_chunks, public.document_search_hits to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('novapay-documents', 'novapay-documents', false, 10485760, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy novapay_documents_select_member on storage.objects for select to authenticated using (
  bucket_id = 'novapay-documents' and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then private.is_member(((storage.foldername(name))[1])::uuid)
    else false end
);
create policy novapay_documents_insert_accountant on storage.objects for insert to authenticated with check (
  bucket_id = 'novapay-documents' and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then private.has_role(((storage.foldername(name))[1])::uuid, array['owner','admin','accountant'])
    else false end
);
create policy novapay_documents_delete_accountant on storage.objects for delete to authenticated using (
  bucket_id = 'novapay-documents' and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then private.has_role(((storage.foldername(name))[1])::uuid, array['owner','admin','accountant'])
    else false end
);

create or replace function public.reserve_document_upload(
  p_org uuid, p_document uuid, p_owner uuid, p_filename text, p_mime_type text,
  p_byte_size bigint, p_page_count integer, p_storage_path text, p_sha256 text, p_hourly_limit integer, p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_org is null or p_document is null or p_owner is null or p_hourly_limit is null or p_hourly_limit < 1
    or not exists(select 1 from public.memberships m where m.org_id=p_org and m.user_id=p_owner and m.role in ('owner','admin','accountant')) then
    raise exception using errcode='42501',message='accountant membership required';
  end if;
  if p_filename is null or char_length(p_filename) not between 1 and 120 or p_mime_type is null or p_mime_type not in ('application/pdf','image/png','image/jpeg')
    or p_byte_size is null or p_byte_size not between 1 and 10485760 or p_page_count is null or p_page_count not between 1 and 10
    or p_storage_path is null or p_storage_path !~ ('^'||p_org::text||'/'||p_document::text||'/')
    or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid document upload';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  if (select count(*) from public.documents d where d.org_id=p_org and d.created_at >= now()-interval '1 hour') >= p_hourly_limit then
    raise exception using errcode='P0001',message='document upload rate limit reached';
  end if;
  insert into public.documents(id,org_id,uploaded_by,filename,mime_type,byte_size,page_count,storage_path,sha256,status)
    values(p_document,p_org,p_owner,p_filename,p_mime_type,p_byte_size,p_page_count,p_storage_path,p_sha256,'uploaded') returning id into v_id;
  insert into public.audit_log(org_id,actor_id,action,entity,entity_id,metadata,request_id)
    values(p_org,p_owner,'document.uploaded','document',v_id::text,
      jsonb_build_object('mimeType',p_mime_type,'byteSize',p_byte_size,'pageCount',p_page_count),coalesce(p_request_id,''));
  return jsonb_build_object('id',v_id,'status','uploaded','filename',p_filename,'mimeType',p_mime_type,'byteSize',p_byte_size,'pageCount',p_page_count);
end
$$;
revoke all on function public.reserve_document_upload(uuid,uuid,uuid,text,text,bigint,integer,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.reserve_document_upload(uuid,uuid,uuid,text,text,bigint,integer,text,text,integer,text) to service_role;

create or replace function public.claim_document_processing(p_org uuid, p_document uuid, p_actor uuid, p_concurrent_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_org is null or p_document is null or p_actor is null or p_concurrent_limit is null or p_concurrent_limit < 1
    or not exists(select 1 from public.memberships m where m.org_id=p_org and m.user_id=p_actor and m.role in ('owner','admin','accountant')) then
    raise exception using errcode='42501',message='accountant membership required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text,0));
  select count(*) into v_count from public.documents d where d.org_id=p_org and d.status='processing';
  if v_count >= p_concurrent_limit then return jsonb_build_object('claimed',false,'reason','concurrency_limit'); end if;
  update public.documents set status='processing',updated_at=now()
    where id=p_document and org_id=p_org and status='uploaded';
  if not found then return jsonb_build_object('claimed',false,'reason','not_available'); end if;
  return jsonb_build_object('claimed',true,'documentId',p_document);
end
$$;
revoke all on function public.claim_document_processing(uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_document_processing(uuid,uuid,uuid,integer) to service_role;
