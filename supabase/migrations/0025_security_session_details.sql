alter table public.login_events
  add column if not exists network_label text not null default 'Unknown network',
  add column if not exists risk_reasons jsonb not null default '[]'::jsonb;

alter table public.login_events
  add constraint login_events_risk_reasons_array
  check (jsonb_typeof(risk_reasons) = 'array');

notify pgrst, 'reload schema';
