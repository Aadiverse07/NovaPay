# NovaPay Phase 6 Handoff

## HEADER
- Updated: 2026-10-26 16:11 Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Final Phase 6 commit: `c433232 Phase 6 thin slice: fund transparency (live verified)`; handoff-only pointer update pending.
- Phase/task: Phase 6 Fund Transparency, T1–T7 complete and live-verified for T6; final commit `c433232` created locally.

## DONE
- T1–T2: contributions/campaigns and capture accounting; migrations 0006–0008 applied. Capture `0U573441YN817132C` received; receipt/ledger reconcile at 100 minor units. Auditable reversal/repost credits Donations 4100; five exact webhook replays caused no duplicates.
- T3: 0009 applied; maintenance workflow live-verified; thresholds/rejections passed.
- T4: 0010 applied/live; Sandbox payout unavailable, so payment stays SIMULATED; idempotent payment row, no provider call/ledger.
- T5: 0011 applied/live; metadata-only evidence reviewed and request closed; service-only RPCs denied ordinary JWTs with 403; direct insert denied.
- T6 implementation: 0012 adds member-checked read-only transparency and owner/admin audit export RPCs; revokes authenticated direct SELECT on Phase 6 fund tables. API hashes donor refs, omits names/private evidence metadata, displays explicit gaps; CSV is formula-safe and metadata-free.
- T6/T7 validation PASS: `npm test` 131/131; `npm run check:migrations` through 0014; contract/rate-limit tests 2/2; `npm audit --omit=dev` reports 0 vulnerabilities. T6 live verification PASS after migrations 0012–0014.

## IN PROGRESS
- Exact task: Phase 6 complete. Report verification and limitations, ask whether to continue to Phase 5, then stop.
- Files changed in T6 (initial implementation in `1138d0f`; migration 0013 in `1423eb7`; migration 0014 committed in `f5c8236`; verifier fix and final live docs pending checkpoint): `supabase/migrations/0012_fund_transparency_read_export.sql`, `supabase/migrations/0013_fix_transparency_campaign_json.sql`, `supabase/migrations/0014_fix_transparency_approval_order.sql`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/src/routes/funds.js`, `server/test/phase6-transparency.test.js`, `server/test/phase6-migration.test.js`, `server/test/postgres-repos.test.js`, `scripts/verify-phase6-transparency-live.js`, `docs/API.md`, `docs/FRONTEND-CONTRACT.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`, `docs/CONTEXT.md`.
- User confirmed migrations 0012–0014 applied. T6 live verifier passed all read/privacy/export/security checks without manual schema-cache reload; existing fixed org/role users reused, no org or fund rows created by verifier. T7 documents route roles/examples, structured errors, inherited action limits and audit behavior; test ensures every mounted fund route has a contract heading.

## NEXT STEPS
1. Confirm final Phase 6 docs/tests are committed locally with the required completion message.
2. Report T6 live PASS; note Phase 2 safe is UNVERIFIED (fixed org absent), Phase 4 safe not run (script lacks safe mode), and strict origin/main frontend diff contains only the explicitly ignored font-fix commit.
3. Ask whether to continue to Phase 5 and stop.

## USER ACTIONS PENDING
- None; T6 migrations 0012–0014 were user-confirmed applied.

## LIVE STATE
- Applied: migrations 0001–0014 (0012–0014 user-confirmed; 0012–0014 live exercised through T6 verifier).
- Migrations 0012–0014: user-confirmed applied. 0013 fixed JSONB operator ambiguity; 0014 changed approval ordering to `decided_at`. T6 live checks pass.
- Tunnel/webhook fixed; T2 capture and five exact replays passed. Fixed T3/T4/T5 data remain in test organization; reuse only.
- Latest live checks: T6 verifier PASS after migrations 0012–0014; no manual schema reload, no org creation, and no fund write. Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Status | Date | Command/result |
|---|---|---|---|
| T2 capture/receipt/ledger/replay | PASS | 2026-10-26 | Reconciled; 5 exact replays, no duplicates |
| T3/T4/T5 live | PASS | 2026-10-26 | Workflow, simulated payment and metadata-only closure verified |
| T6 focused | PASS | 2026-10-26 | 21/21 route tests; migration invariants 10/10 |
| Migration parser | PASS | 2026-10-26 | `npm run check:migrations`; 0001–0014 |
| Full suite | PASS | 2026-10-26 | `npm test`; 129/129 |
| T6 SELECT revoke | PASS | 2026-10-26 | User SQL Editor screenshot: authenticated SELECT false |
| T6 RPC presence/grant | PASS | 2026-10-26 | Screenshot lists both routines; authenticated SELECT false |
| T6 live | PASS | 2026-10-26 | `node scripts/verify-phase6-transparency-live.js`; role, RLS, privacy and CSV checks pass |
| T7 contract/rate limit | PASS | 2026-10-26 | 2/2; every fund route documented, per-user/IP 429 exercised |
| Phase 2 safe verifier | UNVERIFIED | 2026-10-26 | Fixed orgs absent; no records created |
| Phase 3 safe verifier | PASS | 2026-10-26 | 18/18 probes; fixed-org checks pass |
| Phase 4 safe verifier | UNVERIFIED | 2026-10-26 | Not run; script has no safe mode |
| npm audit runtime | PASS | 2026-10-26 | 0 vulnerabilities |
| Frontend delta | PASS/NOTE | 2026-10-26 | Empty after ignored `f410e86`; strict `origin/main` delta is only that font-fix commit |

## KNOWN ISSUES AND RISKS
- T4 is simulated only; no cash movement, PayPal payout or ledger entry.
- T6 migrations 0012–0014 are applied and live-verified; Phase 2/4 safe verifier coverage remains UNVERIFIED for the documented reasons. T7 local suite 131/131; `npm audit --omit=dev` 0 vulnerabilities.
- The live verifier reused deterministic donor/resident identities and memberships created on an earlier run. No organization or fund data created by the passing verification.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; a syntax/runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary-user JWT gets 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only and ON DELETE RESTRICT; cleanup deletes journal_entries first, then audit_log, organizations and auth.users using `scripts/cleanup-phase2-test-data.sql`. Reuse fixed named test users/orgs.
- PayPal Sandbox buyer must be US Personal; seller USD only; use Visa at checkout; webhook URL ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Never push or commit to `main`/`backend`; stay on `phase6-backend`.
- No `--force`, `npm audit fix --force`, weakened tests, edits to applied migrations, or `.env` commits.
- Do not edit protected design files/assets.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `npm audit --omit=dev`
- `git diff --check`
- `git diff --exit-code f410e86 -- preview.html dashboard.html src assets`
- `node scripts/verify-phase6-transparency-live.js`
