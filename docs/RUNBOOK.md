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

## Phase 4 AI limits and model selection

AI model calls are limited by `AI_DAILY_USER_LIMIT` (default 5 per user per UTC day) and `AI_DAILY_ORG_LIMIT` (default 20 per organization per UTC day). Input is capped by `AI_MAX_INPUT_CHARS` (default 1,000); output is capped by `AI_MAX_OUTPUT_TOKENS` (default 400); safe-answer cache TTL uses `AI_CACHE_TTL_SECONDS` (default 300). Provider calls are recorded in `ai_usage`; deterministic `code` and `sql` routes bypass the model and record zero model tokens. Cache hits are recorded separately and do not consume provider-call budgets. Proposals and unsafe/insufficient answers are never cached.

Set `LLM_PROVIDER=gemini` and `LLM_API_KEY` for the free-tier Gemini adapter. The current model allow-list is `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite`; choose between them with `LLM_MODEL` and `LLM_FALLBACK_MODEL`. Only use the currently verified free-tier models recorded in `docs/DECISIONS.md`; the adapter rejects models outside the allow-list. To change models, update `.env`, check Google's current model lifecycle and pricing pages, record the date/source/decision in `docs/DECISIONS.md`, and rerun `npm test`. Anthropic is optional and is selected only with `LLM_PROVIDER=anthropic`; do not use it for FREE-ONLY verification.

The migration `0005_ai.sql` gives authenticated JWT clients member-scoped SELECT only on AI/anomaly data. All writes use backend service-role RPCs. Apply it through the Supabase SQL Editor only after reviewing it and run `npm run check:migrations` first. Live verification uses fixed named test accounts; do not delete their organizations or append-only audit rows during cleanup.
