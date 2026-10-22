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

## Script scope

`node scripts/verify-phase1.js` checks migration objects and audit grants, unauthenticated 401, organization A isolation from organization B, viewer denial, onboarding idempotency, owner audit access through JWT/RLS, public-config secret exclusion, and cleanup of generated users and organizations. CLI output and environment key values are not printed by the script.
