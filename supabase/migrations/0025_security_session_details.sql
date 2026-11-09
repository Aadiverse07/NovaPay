alter table public.login_events
  add column if not exists network_label text not null default 'Unknown network',
  add column if not exists risk_reasons jsonb not null default '[]'::jsonb;

alter table public.notifications add column if not exists recipient_user_id uuid references auth.users(id) on delete cascade;
create index if not exists notifications_recipient_org_status_idx on public.notifications(org_id,recipient_user_id,status,created_at desc);

alter table public.login_events
  add constraint login_events_risk_reasons_array
  check (jsonb_typeof(risk_reasons) = 'array');

notify pgrst, 'reload schema';
