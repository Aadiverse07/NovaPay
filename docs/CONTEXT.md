# NovaPay Phase 6 Handoff

## HEADER
- Updated: 2026-10-26 15:52 Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Last checkpoint: `7d5820c WIP Phase 6 task 6: record live transparency verification`; T6 complete/live PASS, continuing to T7.
- Phase/task: Phase 6 Fund Transparency, T6 complete and live-verified; prepare to continue T7.

## DONE
- T1–T2: contributions/campaigns and capture accounting; migrations 0006–0008 applied. Capture `0U573441YN817132C` received; receipt/ledger reconcile at 100 minor units. Auditable reversal/repost credits Donations 4100; five exact webhook replays caused no duplicates.
- T3: 0009 applied; maintenance workflow live-verified; thresholds/rejections passed.
- T4: 0010 applied/live; Sandbox payout unavailable, so payment stays SIMULATED; idempotent payment row, no provider call/ledger.
- T5: 0011 applied/live; metadata-only evidence reviewed and request closed; service-only RPCs denied ordinary JWTs with 403; direct insert denied.
- T6 implementation: 0012 adds member-checked read-only transparency and owner/admin audit export RPCs; revokes authenticated direct SELECT on Phase 6 fund tables. API hashes donor refs, omits names/private evidence metadata, displays explicit gaps; CSV is formula-safe and metadata-free.
- T6 local validation PASS: focused migration tests 10/10, `npm run check:migrations` through 0014, `npm test` 129/129. Live verification PASS after 0012–0014; details in TEST-REPORT.

## IN PROGRESS
- Exact task: close T6 after passing live verification; next inspect the Phase 6 prompt and proceed to T7.
- Files changed in T6 (initial implementation in `1138d0f`; migration 0013 in `1423eb7`; migration 0014 committed in `f5c8236`; verifier fix and final live docs pending checkpoint): `supabase/migrations/0012_fund_transparency_read_export.sql`, `supabase/migrations/0013_fix_transparency_campaign_json.sql`, `supabase/migrations/0014_fix_transparency_approval_order.sql`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/src/routes/funds.js`, `server/test/phase6-transparency.test.js`, `server/test/phase6-migration.test.js`, `server/test/postgres-repos.test.js`, `scripts/verify-phase6-transparency-live.js`, `docs/API.md`, `docs/FRONTEND-CONTRACT.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`, `docs/CONTEXT.md`.
- User confirmed migrations 0012–0014 applied. T6 live verifier passed all read/privacy/export/security checks without manual schema-cache reload; test organization reused, no org or fund data created by verifier.

## NEXT STEPS
1. Check the original Phase 6 prompt for the exact T7 requirements and scope.
2. Update CONTEXT/WORKLOG for T7 and continue only authorized backend work.
3. Keep docs current before/after long or live commands and checkpoint each numbered task.

## USER ACTIONS PENDING
- None for T6; migrations 0012–0014 were user-confirmed applied.

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

## KNOWN ISSUES AND RISKS
- T4 is simulated only; no cash movement, PayPal payout or ledger entry.
- T6 migrations 0012–0014 are applied and live-verified.
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
- `git diff --check`
- `node scripts/verify-phase6-transparency-live.js`
