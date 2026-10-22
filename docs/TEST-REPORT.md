# Phase 1 verification report

Date: 2026-10-22

## Local checks

- `npm ci`: PASS; 0 vulnerabilities reported.
- `find server -type f -name '*.js' -print0 | xargs -0 -n1 node --check`: PASS.
- `node --check scripts/verify-phase1.js`: PASS.
- `npm test`: PASS; 30 passed, 0 failed.
- `git diff --check`: PASS.

## Live Supabase checks

- Migration objects and grants: PASS by authenticated Supabase CLI SQL preflight. Required tables and onboarding RPC exist; `service_role` has audit insert but no select/update/delete grants.
- Service-role audit reads: PASS; no backend code reads `audit_log` with the service key. The verifier checks owner audit reads through the user's JWT and RLS.
- `node scripts/verify-phase1.js`: PASS. The Supabase CLI was authenticated after explicit user authorization. The live run verified migration objects and insert-only service-role audit grants, unauthenticated `GET /api/events` -> 401, two-user cross-tenant isolation, viewer denial on approval registration -> 403, onboarding creation and repeat idempotency, owner audit access through JWT/RLS, public-config secret exclusion, and cleanup.
- Cleanup: PASS; the script reported that the throwaway users and organizations were cleaned up. No credentials or test identifiers are recorded here.
- Runtime smoke: `npm start` via `server/index.js`, using `PORT=3417` and `STATIC_DIR` at the repository root; `/dashboard.html`, `/preview.html`, and `/api/status` each returned HTTP 200.
- Frontend hygiene: `git diff --stat -- preview.html dashboard.html src assets 'tailwind.novapay.preset.*'` returned no paths. `.env` is ignored by `.gitignore`; no secret values are in tracked files.

# Phase 2 financial-core verification report

Date: 2026-10-22

## Local checks

- Branch: `git branch --show-current` returned `backend`.
- Dependency install: `npm ci` PASS; 73 packages added, 0 vulnerabilities.
- Backend syntax: `find server -type f -name '*.js' -print0 | xargs -0 -n1 node --check` PASS.
- Unit and route tests: `npm test` PASS; 43 passed, 0 failed (includes five-delivery webhook replay, balanced mapping, excess refund rejection, concurrent approval double-submit with one PayPal call, role/tenant checks, validation, and safe structured error checks).
- Whitespace: `git diff --check` PASS.
- Runtime smoke: `PORT=3418 npm start` PASS. `/dashboard.html` and `/preview.html` returned 200; `/api/status` returned 200 with `mode=authenticated`, `supabaseConfigured=true`; `/api/public-config` had only `supabaseAnonKey,supabaseUrl`; unauthenticated `/api/transactions` returned 401; malformed unauthenticated `/api/paypal/create-order` returned 401 before JSON parsing; malformed public webhook returned 400. The configured Supabase values were not printed.
- Frontend hygiene: `git diff --stat main -- preview.html dashboard.html src assets tailwind.novapay.preset.cjs tailwind.novapay.preset.mjs` returned no paths. `.env` is ignored and `git ls-files --error-unmatch .env` failed as expected (not tracked). `git status` showed no staged `.env`.

## Database and provider checks

- `npx supabase test db` UNVERIFIED: it could not connect to local Postgres at `127.0.0.1:54322` (`ECONNREFUSED`); a local Supabase/Docker runtime is unavailable. The pgTAP test file is written but has not executed.
- Migration `0002_financial_core.sql` has not been applied to the live Supabase project; no live database was changed. Database trigger, RLS, PostgREST RPC transaction, persisted restart, and real reconciliation behavior therefore remain UNVERIFIED. After review and approval of the target, run `npx supabase db push`, then `npx supabase test db` (with Docker running) and the backend verifier/sandbox flow.
- PayPal Sandbox create/capture/refund and webhook signature verification against PayPal are UNVERIFIED: this runtime reported `PayPal sandbox: off`, so no provider request was made. Set server-side Sandbox credentials and webhook ID, apply migration 0002 first, then run the sandbox order/capture/refund flow and deliver a signed webhook.
- The automated approval double-submit test uses the repository/PayPal test doubles; it proves the route lock and one provider call in this process, not live database locking or provider idempotency.
- No secret values, test credentials, or raw provider responses are recorded here.

## Script scope

`node scripts/verify-phase1.js` checks migration objects and audit grants, unauthenticated 401, organization A isolation from organization B, viewer denial, onboarding idempotency, owner audit access through JWT/RLS, public-config secret exclusion, and cleanup of generated users and organizations. CLI output and environment key values are not printed by the script.
