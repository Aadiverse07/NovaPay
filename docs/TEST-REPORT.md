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

Date: 2026-10-24

## Local checks

- Branch: `git branch --show-current` returned `backend`.
- Dependency install: `npm ci` PASS; 89 packages added. npm reported 2 high-severity vulnerabilities; no audit fix was applied.
- Backend and script syntax: `find server scripts -type f -name '*.js' -print0 | xargs -0 -n1 node --check` PASS, including `scripts/verify-phase2.js`.
- Unit and route tests: `npm test` PASS; 43 passed, 0 failed. The suite includes five-delivery webhook replay and mocked approval concurrency tests; these do not replace live-provider verification.
- Whitespace: `git diff --check` PASS.
- Hygiene: the frontend diff scan returned no paths; `.env` is ignored and not tracked; a scan of tracked/untracked repository files against configured local secret values found zero matches (values were not printed).
- Runtime smoke: `PORT=3418 npm start` PASS. `/dashboard.html` and `/preview.html` returned 200; `/api/status` returned 200 with `mode=authenticated`, `supabaseConfigured=true`; `/api/public-config` had only `supabaseAnonKey,supabaseUrl`; unauthenticated `/api/transactions` returned 401; malformed unauthenticated `/api/paypal/create-order` returned 401 before JSON parsing; malformed public webhook returned 400. The configured Supabase values were not printed.
- Frontend hygiene: `git diff --stat main -- preview.html dashboard.html src assets tailwind.novapay.preset.cjs tailwind.novapay.preset.mjs` returned no paths. `.env` is ignored and `git ls-files --error-unmatch .env` failed as expected (not tracked). `git status` showed no staged `.env`.

## Database and provider checks

- Migration state: the live PostgREST schema returned HTTP 200 for all nine Phase 2 tables and exposed all 17 Phase 2 public RPCs; the user reports applying `0002`. This confirms the Phase 2 objects are live. The exact `supabase_migrations.schema_migrations` row remains UNVERIFIED: `npx supabase migration list --linked` reported no linked project, and a read-only `supabase db query --linked --project-ref …` stalled at `Initialising login role…` and was interrupted. No migration was applied by this verification.
- RPC security: static review of `0002_financial_core.sql` found execute revokes for the posting/refund routines and grants to `service_role`; trigger helper routines are revoked from API roles. A throwaway ordinary JWT received HTTP 403 for all 17 exposed Phase 2 RPCs, including order/capture, event, approval/refund, reconciliation, and trial-balance RPCs. The user was deleted afterward. No `0003_fix_*.sql` was needed based on these results.
- Live unbalanced-entry check: PASS. A service-role insert of an entry with no journal lines returned HTTP 400 with database constraint code `23514`; the test organization was deleted.
- Live tenant isolation: PASS. An ordinary Org B owner JWT received HTTP 200 with an empty result for Org A rows in all nine Phase 2 tables. Two throwaway users and organizations were deleted.
- Live default chart: PASS; the test organization had nine accounts. Its empty trial balance returned balanced=true and equal debit/credit totals; its reconciliation returned `clean`. This was an empty test org, not captured sandbox data.
- `scripts/verify-phase2.js` was added and syntax-checked. It includes the full live flow and cleanup, but has not been run end-to-end. Webhook replay against a real verified event, server-restart persistence for actual order/capture/approval data, excess-refund rejection, double-Approve provider count, non-empty trial balance, and reconciliation after sandbox activity remain UNVERIFIED.
- PayPal Sandbox create/approval/capture/webhook/refund flow: UNVERIFIED and not started. Buyer approval requires the user to open the order approval URL printed by the verifier, sign in with a Sandbox buyer, approve the test payment, then return and press Enter. Before that flow, rotate the PayPal Sandbox client secret and LLM API key: working-tree `.env.example` contained non-placeholder values, was sanitized to placeholders, and the values appeared in diagnostic output. The committed `HEAD:.env.example` had placeholders. No values are recorded here. Provider calls were halted after discovery; update the ignored `.env` with rotated values before resuming.
- Cleanup: PASS for the live security and DB probes. The CLI-generated `supabase/.temp/` files were removed. No Phase 1 acceptance checks were rerun.
- No migration push, PayPal payment, capture, or refund was performed during this pass.

## Script scope

`node scripts/verify-phase1.js` checks migration objects and audit grants, unauthenticated 401, organization A isolation from organization B, viewer denial, onboarding idempotency, owner audit access through JWT/RLS, public-config secret exclusion, and cleanup of generated users and organizations. CLI output and environment key values are not printed by the script.
