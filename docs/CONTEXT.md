# NovaPay Phase 6 Handoff

## HEADER
- Updated: 2026-10-26 15:09 Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Last commit: `73a1773 WIP Phase 6 task 6: record schema cache blocker`; T6 code/docs/tests and handoff checkpointed locally.
- Phase/task: Phase 6 Fund Transparency, T6 transparency/export; T1–T5 complete.

## DONE
- T1–T2: contributions/campaigns and capture accounting; migrations 0006–0008 applied. Capture `0U573441YN817132C` received; receipt/ledger reconcile at 100 minor units. Auditable reversal/repost credits Donations 4100; five exact webhook replays caused no duplicates.
- T3: 0009 applied; maintenance workflow live-verified; thresholds/rejections passed.
- T4: 0010 applied/live; Sandbox payout unavailable, so payment stays SIMULATED; idempotent payment row, no provider call/ledger.
- T5: 0011 applied/live; metadata-only evidence reviewed and request closed; service-only RPCs denied ordinary JWTs with 403; direct insert denied.
- T6 implementation: 0012 adds member-checked read-only transparency and owner/admin audit export RPCs; revokes authenticated direct SELECT on Phase 6 fund tables. API hashes donor refs, omits names/private evidence metadata, displays explicit gaps; CSV is formula-safe and metadata-free.
- T6 local validation PASS: focused 21/21, `npm run check:migrations` 0001–0012, `npm test` 127/127, verifier syntax valid.

## IN PROGRESS
- Exact task: finish T6 live verification after migration 0012 application.
- Files changed in T6 (all uncommitted): `supabase/migrations/0012_fund_transparency_read_export.sql`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/src/routes/funds.js`, `server/test/phase6-transparency.test.js`, `server/test/phase6-migration.test.js`, `server/test/postgres-repos.test.js`, `scripts/verify-phase6-transparency-live.js`, `docs/API.md`, `docs/FRONTEND-CONTRACT.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`, `docs/CONTEXT.md`.
- User said migration 0012 was applied. Live verifier reused fixed org and role users; it created fixed donor/resident users and memberships only if missing. It stopped before business checks: RPC returned HTTP 404 `PGRST202` because function was missing from PostgREST schema cache. No fund data was changed.

## NEXT STEPS
1. In Supabase SQL Editor for the same project used by the API, run the read-only check below; expect both routine names and `has_table_privilege` false.
2. If both routines exist and privilege is false, execute `NOTIFY pgrst, 'reload schema';` in SQL Editor.
3. Rerun `node scripts/verify-phase6-transparency-live.js`; it reuses fixtures.
4. Record all outcomes in WORKLOG/TEST-REPORT. If T6 passes, commit local WIP and continue to T7 per Phase 6 prompt.

## USER ACTIONS PENDING
- Confirm 0012 is present in the exact Supabase project configured for the API and refresh PostgREST schema cache. In SQL Editor run:
  ```sql
  select routine_name from information_schema.routines
  where specific_schema='public'
    and routine_name in ('get_fund_transparency','get_fund_audit_export');
  select has_table_privilege('authenticated','public.fund_contributions','SELECT') as authenticated_can_select;
  notify pgrst, 'reload schema';
  ```
  Expected: two routine rows; `authenticated_can_select = false`. Refresh only after the checks confirm migration objects.

## LIVE STATE
- Applied and live verified: migrations 0001–0011.
- Migration 0012: user-confirmed applied, but API visibility UNVERIFIED (PGRST202 schema-cache miss). Do not claim T6 live pass until verifier completes.
- Tunnel/webhook fixed; T2 capture and five exact replays passed. Fixed T3/T4/T5 data remain in test organization; reuse only.
- Latest live checks: RPC schema probe HTTP 404/PGRST202; no further fund mutations. Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Status | Date | Command/result |
|---|---|---|---|
| T2 capture/receipt/ledger/replay | PASS | 2026-10-26 | Reconciled; 5 exact replays, no duplicates |
| T3/T4/T5 live | PASS | 2026-10-26 | Workflow, simulated payment and metadata-only closure verified |
| T6 focused | PASS | 2026-10-26 | 21/21 |
| Migration parser | PASS | 2026-10-26 | `npm run check:migrations`; 0001–0012 |
| Full suite | PASS | 2026-10-26 | `npm test`; 127/127 |
| T6 live | UNVERIFIED | 2026-10-26 | 404 PGRST202; schema cache cannot resolve RPC |

## KNOWN ISSUES AND RISKS
- T4 is simulated only; no cash movement, PayPal payout or ledger entry.
- T6 must confirm 0012 was applied to the API's exact project and refresh PostgREST schema cache before access/privacy checks.
- The live verifier created deterministic named donor/resident identities and memberships once; reruns reuse them. No organization created.

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
