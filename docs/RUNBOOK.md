# Backend runbook

## Local setup

Use Node.js 18 or newer. Run `npm ci`, then `npm start` (or `npm run dev`). The service listens on `PORT` (default 3000) and serves the existing pages from `STATIC_DIR` (default repository root). Run `npm test` for offline tests.

Copy `.env.example` to the ignored local `.env` for provider configuration. Never put credentials in `.env.example`, source files, browser code, logs, or commits. The service-role key is server-only. `GET /api/public-config` exposes exactly `SUPABASE_URL` and `SUPABASE_ANON_KEY`; it never exposes the service-role key.

To enable authenticated endpoints, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` together in `.env`. Partial configuration fails at startup. With all three omitted, `GET /api/status` reports `mode: "degraded"` and `supabaseConfigured: false`; protected API routes return 503. PayPal and AI settings remain optional.

Supabase Auth's own signup, login, password reset, and email verification limits remain enabled. NovaPay adds in-memory per-IP and per-user API limits; these counters reset when the process restarts. Configure Supabase's free plan limits in the Supabase dashboard and check current quota/availability before using the service.

## Supabase migration and RLS verification

Apply `supabase/migrations/0001_foundation.sql` to a Supabase project using `supabase db push`. Run the SQL isolation checks with `supabase test db`. These commands require the Supabase CLI and a local Docker-compatible runtime for local database tests.

Phase 2 adds `supabase/migrations/0002_financial_core.sql`. Review the migration before applying it to any project. It creates the organization-scoped ledger and PayPal persistence tables, default accounts, balance trigger, and service-only RPCs. Apply migrations in order with `npx supabase db push` only after confirming the linked project and migration target. Run `npx supabase test db` with Docker available to execute the pgTAP balance and replay checks. A live migration or PayPal Sandbox exercise is not part of offline `npm test`; record those results separately in `docs/TEST-REPORT.md`.

## AI data handling

Gemini free-tier use is the default. Free-tier availability and quotas can change and are controlled by Google. Do not send real customer, payment-card, bank, or other sensitive personal data to the free-tier AI provider. The backend allow-lists transaction fields, excludes buyer names and arbitrary context, and redacts common email, phone, government-ID, and payment-number formats from questions. Avoid entering names or other identifiers that automated pattern redaction cannot reliably detect. Use synthetic or redacted data for tests and demos. Anthropic remains an optional, explicitly selected adapter and is outside the free-only default.
