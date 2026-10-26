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

## Phase 6 T5 completion evidence

Migration `supabase/migrations/0011_completion_evidence_review.sql` adds review metadata and service-role-only RPCs for metadata submission, evidence review, and closing a maintenance request. Run `npm run check:migrations` and `npm test` before applying it. In the intended Supabase project's SQL Editor, run the complete numbered migration once; then verify the new columns with a read-only query against `information_schema.columns` for `fund_completion_evidence.review_status`, `maintenance_requests.reviewed_by`, and `maintenance_requests.closed_by`. Do not grant authenticated write privileges or upload file contents. The live verifier uses the existing fixed Phase 3 test org and a paid T4 request; it writes metadata only and appends audit records, which must not be deleted.


## Phase 6 T6 transparency/export

Migration `supabase/migrations/0012_fund_transparency_read_export.sql` revokes authenticated SELECT on Phase 6 fund tables and adds service-role-only, member-checked transparency and owner/admin audit-export RPCs. Run `npm run check:migrations` and `npm test` before applying it. In the intended Supabase project's SQL Editor, run the complete migration once. Verify the read RPCs are callable through the backend and that authenticated donor/resident JWTs receive 401/403 for direct SELECT from `fund_contributions`, `fund_maintenance_payments`, and `fund_completion_evidence`; ordinary JWT calls to both RPCs must receive HTTP 403. Run `node scripts/verify-phase6-transparency-live.js` after application. It reuses fixed owner/approver/accountant users and the fixed verifier organization; it creates donor/resident test users only if the fixed emails do not already exist, and never creates another organization. Test metadata/audit rows are append-only and should remain for reruns.


## Phase 6 T7 routes and operations

Migrations 0012 (`fund_transparency_read_export`), 0013 (`fix_transparency_campaign_json`), and 0014 (`fix_transparency_approval_order`) are user-confirmed applied and T6 live-verified. 0013 replaces ambiguous JSONB key removal with explicit safe campaign fields; 0014 orders approval-chain rows by the actual `decided_at` column. Keep all applied migration files immutable. The T6 verifier (`node scripts/verify-phase6-transparency-live.js`) passed without a manual schema-cache reload.

All protected API routes inherit 300 requests/IP/15 minutes and 240 requests/authenticated user/15 minutes; therefore payment and approval actions are rate-limited. The app reports structured 429 codes `RATE_LIMITED` and `USER_RATE_LIMITED`. These limits use in-memory stores and reset at process restart. Fund mutations validate with Zod, enforce minimum roles in `server/src/routes/funds.js`, call service-role-only RPCs, and append `audit_log` rows for state changes. Read the route-by-route examples, role matrix, error shapes and SIMULATED gaps in `docs/FRONTEND-CONTRACT.md`.
