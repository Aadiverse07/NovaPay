# Phase 1 handoff

Branch: `backend`. Current phase: Phase 1 — Foundation.

## DONE

- Foundation schema, membership roles, helper functions, RLS, trigger, onboarding RPC, and SQL isolation/privilege tests are written in `supabase/migrations/0001_foundation.sql`, `supabase/tests/0001_foundation.test.sql`, and `supabase/config.toml`.
- Supabase JWT validation, active-org membership lookup, role checks, Zod body helper, audit helper, and onboarding route are in `server/src/middleware/auth.js`, `server/src/middleware/validate.js`, `server/src/services/supabase.js`, `server/src/services/audit.js`, and `server/src/routes/onboarding.js`.
- Public config and degraded status are implemented in `server/src/app.js` and `server/src/routes/status.js`; only URL and anon/publishable key are returned.
- Per-IP/user API limits are in `server/src/app.js`; Supabase Auth limits remain external.
- Memory repositories and PayPal routes are tenant-scoped; approval, order, capture, and refund writes have role checks/audit calls in `server/src/repos/memory.js`, `server/src/routes/approvals.js`, and `server/src/routes/paypal.js`.
- AI context allow-list and common PII-pattern redaction are in `server/src/services/ai.js`; free-tier handling is documented in `docs/RUNBOOK.md`.
- Environment template, decisions, and frontend contract are updated in `.env.example`, `docs/DECISIONS.md`, and `docs/FRONTEND-CONTRACT.md`.
- Offline auth, tenancy, permissions, onboarding, audit, provider, and legacy-flow tests are in `server/test/`.
- No frontend files were intentionally changed.

## IN PROGRESS

- `server/src/app.js`: auth middleware and API rate limits currently run after `express.json()` and generic body validation. Left: move API IP limits/auth ahead of JSON parsing so unauthenticated malformed requests are rejected as 401 before parsing; re-run route and full tests. No code change for this reorder was made.

## NOT STARTED / UNVERIFIED

- Apply migration and run actual RLS tests against Supabase. No Supabase project credentials, Supabase CLI, Docker, or `psql` were available; no migration was applied to a live project.
- Verify actual provider JWT validation, membership lookup, onboarding RPC, and audit insert against a Supabase project.
- Re-run final completion gate after the pending middleware-order decision/change and confirm every contract detail against live routes.
- Acceptance: live Supabase-backed cross-tenant isolation and live onboarding are UNVERIFIED. Mocked API tests prove 403 for a non-member and viewer denial; SQL tests are written but not executed.

## TEST STATE

- Last `npm test`: PASS, 29 tests passed, 0 failed (`npm test`). This included mocked route, role, request-ID/log redaction, Supabase REST adapter, AI, and legacy PayPal-flow tests.
- `node --check` across `server/**/*.js`: PASS on the last full check; subsequent route changes were loaded by the passing test run.
- `npm ci`: PASS, dependencies installed with 0 reported vulnerabilities.
- `git diff --check`: PASS on the last test run.
- `npm start` smoke test: PASS earlier in this phase for degraded `/api/status`, protected-route 503, public config shape, and serving `dashboard.html`/`preview.html`; not repeated after the final edits.
- SQL/RLS and real Supabase checks: UNVERIFIED. Exact commands after local Supabase setup: `supabase start` then `supabase test db`; apply to a linked project with `supabase db push` only when ready.
- Frontend diff check: no frontend paths appeared in the last `git diff --stat`.

## SUPABASE

No live Supabase key pair is configured or used in this work. The backend accepts either legacy anon/service_role keys or current publishable/secret keys through the same server-only variables: `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Unit tests use fake values only. `0001_foundation.sql` is written and has not been applied to a live project.

## DECISIONS

Phase decisions are recorded in `docs/DECISIONS.md`, including public config fields, key-format compatibility, REST transport for Node 18, public route exceptions, tenant-scoped memory state, role policy, idempotent transactional onboarding, rate limits, error envelopes, PayPal idempotency scoping, and AI data minimization.

## KNOWN BUGS / HALF-WORKING

- Auth currently parses JSON before checking credentials; see IN PROGRESS.
- Live RLS/provider behavior is unverified until a Supabase environment is available.
- Activity events from legacy unscoped in-memory entries are intentionally omitted from tenant `/api/events` results; public status returns no captures to avoid cross-tenant disclosure.
- Rate-limit counters are process-local and reset on restart.
- PII pattern redaction cannot reliably detect names or every free-form identifier; users must avoid entering them, as documented in `docs/RUNBOOK.md`.

## NEXT STEPS

1. Decide/complete the `server/src/app.js` auth-before-body-parser ordering and add a malformed unauthenticated request test.
2. Run `npm ci`, `node --check` for server JavaScript, and `npm test`.
3. Start the server and verify status, public config, static pages, and protected route behavior.
4. With local Supabase CLI and Docker, run `supabase start` and `supabase test db`; then verify the migration against a real project when credentials are available.
5. Check `git status`, ensure `.env` is not staged, review frontend diff is empty, then continue only after Phase 1 acceptance is verified.
