# NovaPay Phase 6 Handoff

## HEADER
- Updated: 2026-10-26 15:45 Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Last commit: T6 repair checkpoint pending; migrations 0013/0014 local, tests 129/129 pass.
- Phase/task: Phase 6 Fund Transparency, T6 transparency/export; T1–T5 complete.

## DONE
- T1–T2: contributions/campaigns and capture accounting; migrations 0006–0008 applied. Capture `0U573441YN817132C` received; receipt/ledger reconcile at 100 minor units. Auditable reversal/repost credits Donations 4100; five exact webhook replays caused no duplicates.
- T3: 0009 applied; maintenance workflow live-verified; thresholds/rejections passed.
- T4: 0010 applied/live; Sandbox payout unavailable, so payment stays SIMULATED; idempotent payment row, no provider call/ledger.
- T5: 0011 applied/live; metadata-only evidence reviewed and request closed; service-only RPCs denied ordinary JWTs with 403; direct insert denied.
- T6 implementation: 0012 adds member-checked read-only transparency and owner/admin audit export RPCs; revokes authenticated direct SELECT on Phase 6 fund tables. API hashes donor refs, omits names/private evidence metadata, displays explicit gaps; CSV is formula-safe and metadata-free.
- T6 local validation PASS: focused migration tests 10/10, `npm run check:migrations` through 0014, `npm test` 129/129.

## IN PROGRESS
- Exact task: fix T6 live SQLSTATE 42703 via migration 0014, apply it, then finish T6 live verification.
- Files changed in T6 (initial implementation in `1138d0f`; migration 0013 in `1423eb7`; migration 0014/test/docs now pending checkpoint): `supabase/migrations/0012_fund_transparency_read_export.sql`, `supabase/migrations/0013_fix_transparency_campaign_json.sql`, `supabase/migrations/0014_fix_transparency_approval_order.sql`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/src/routes/funds.js`, `server/test/phase6-transparency.test.js`, `server/test/phase6-migration.test.js`, `server/test/postgres-repos.test.js`, `scripts/verify-phase6-transparency-live.js`, `docs/API.md`, `docs/FRONTEND-CONTRACT.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`, `docs/CONTEXT.md`.
- User confirmed 0012 and 0013 applied. Screenshots confirm both RPC functions exist and authenticated SELECT on `fund_contributions` is false. 0013 resolved 42725; valid-member RPC now fails 42703 on nonexistent approval-chain `created_at`. No fund data mutation.

## NEXT STEPS
1. Apply only `supabase/migrations/0014_fix_transparency_approval_order.sql` in the intended Supabase SQL Editor; 0012 and 0013 are applied.
2. Tell the agent `applied`; do not reload schema cache.
3. Rerun `node scripts/verify-phase6-transparency-live.js` and resolve any additional findings additively.
4. Record outcomes; continue to T7 only after T6 live verification passes.

## USER ACTIONS PENDING
- Apply only migration 0014; no schema reload. In the intended Supabase project SQL Editor, paste/run the complete contents of `supabase/migrations/0014_fix_transparency_approval_order.sql` once, then say `applied`.
  ```sql
  select routine_name from information_schema.routines
  where specific_schema='public'
    and routine_name in ('get_fund_transparency','get_fund_audit_export');
  ```

## LIVE STATE
- Applied and live verified: migrations 0001–0011.
- Migration 0012: applied; screenshot confirms both routines exist and authenticated SELECT false. Migration 0013: applied; resolved 42725. Migration 0014: pending; changes approval ordering from nonexistent `created_at` to `decided_at`, retaining service-only execute.
- Tunnel/webhook fixed; T2 capture and five exact replays passed. Fixed T3/T4/T5 data remain in test organization; reuse only.
- Latest live checks: 0012 routines visible and direct SELECT revoke confirmed; valid-member RPC returned HTTP 400/SQLSTATE 42703 (`a.created_at` missing); no fund writes. Migration 0013 fixed the earlier 42725. Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Status | Date | Command/result |
|---|---|---|---|
| T2 capture/receipt/ledger/replay | PASS | 2026-10-26 | Reconciled; 5 exact replays, no duplicates |
| T3/T4/T5 live | PASS | 2026-10-26 | Workflow, simulated payment and metadata-only closure verified |
| T6 focused | PASS | 2026-10-26 | 21/21 |
| Migration parser | PASS | 2026-10-26 | `npm run check:migrations`; 0001–0014 |
| Full suite | PASS | 2026-10-26 | `npm test`; 129/129 |
| T6 SELECT revoke | PASS | 2026-10-26 | User SQL Editor screenshot: authenticated SELECT false |
| T6 RPC presence/grant | PASS | 2026-10-26 | Screenshot lists both routines; authenticated SELECT false |
| T6 live | UNVERIFIED | 2026-10-26 | 0013 resolved 42725; current valid-member RPC is 400/42703; 0014 pending |

## KNOWN ISSUES AND RISKS
- T4 is simulated only; no cash movement, PayPal payout or ledger entry.
- T6 migrations 0012 and 0013 are applied; new 0014 fixes the live approval-chain column mismatch.
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
