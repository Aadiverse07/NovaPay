-- Restore only the INSERT privilege required for server-side invoice download audits.
revoke all on public.audit_log from public, anon, authenticated, service_role;
grant insert on public.audit_log to service_role;
