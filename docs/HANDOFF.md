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

- No Phase 1 implementation item remains in progress. Live Supabase verification completed successfully with the authorized CLI; results are recorded in `docs/TEST-REPORT.md`.

## NOT STARTED / UNVERIFIED

- No additional live Phase 1 checks remain unverified by this handoff; see `docs/TEST-REPORT.md` for live Supabase results.

## TEST STATE

- Latest `npm test`: PASS, 30 tests passed, 0 failed (`npm test`), including unauthenticated malformed JSON -> 401.
- `find server -type f -name '*.js' -print0 | xargs -0 -n1 node --check`: PASS.
- `npm ci`: PASS, 0 vulnerabilities reported.
- `git diff --check`: PASS; rerun before commit.
- `node scripts/verify-phase1.js`: PASS; live test users and organizations were cleaned up.
- `npm start` smoke test: PASS after final edits; `/dashboard.html`, `/preview.html`, and `/api/status` each returned HTTP 200.
- Live SQL/RLS and two-user Supabase checks: PASS; details in `docs/TEST-REPORT.md`.
- Frontend diff check: no frontend paths appeared in the last `git diff --stat`.

## SUPABASE

The local `.env` contains a Supabase key pair and was loaded without displaying values. The backend accepts either legacy anon/service_role keys or current publishable/secret keys through `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. `0001_foundation.sql` is applied; live migration object and RLS checks passed. No key values are included here.

## DECISIONS

Phase decisions are recorded in `docs/DECISIONS.md`, including public config fields, key-format compatibility, REST transport for Node 18, public route exceptions, tenant-scoped memory state, role policy, idempotent transactional onboarding, rate limits, error envelopes, PayPal idempotency scoping, and AI data minimization.

## KNOWN BUGS / HALF-WORKING

- API IP limits and auth now run before `express.json()`; the malformed unauthenticated request test returns 401. Public status, public config, and webhook are exempt from auth and API rate limits.
- No known Phase 1 behavior is currently unverified; see the test report for the commands and results.
- Activity events from legacy unscoped in-memory entries are intentionally omitted from tenant `/api/events` results; public status returns no captures to avoid cross-tenant disclosure.
- Rate-limit counters are process-local and reset on restart.
- PII pattern redaction cannot reliably detect names or every free-form identifier; users must avoid entering them, as documented in `docs/RUNBOOK.md`.

## NEXT STEPS

1. Rerun the final Phase 1 gate and ensure no `.env` is staged.
2. Commit Phase 1 locally on `backend` only if the gate has no failures.
3. Ask the user whether to continue to Phase 2; do not push or merge.

## NEXT STEPS

1. Decide/complete the `server/src/app.js` auth-before-body-parser ordering and add a malformed unauthenticated request test.
2. Run `npm ci`, `node --check` for server JavaScript, and `npm test`.
3. Start the server and verify status, public config, static pages, and protected route behavior.
4. With local Supabase CLI and Docker, run `supabase start` and `supabase test db`; then verify the migration against a real project when credentials are available.
5. Check `git status`, ensure `.env` is not staged, review frontend diff is empty, then continue only after Phase 1 acceptance is verified.
