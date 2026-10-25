# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-26, Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Last completed checkpoint: implementation checkpoint pending; last committed `0d37592 WIP Phase 6 task 2: plan fund account correction`.
- Current phase/task: Phase 6 Fund Transparency, T2 account correction; T3 begins after 0008 is applied and live checks pass.

## DONE
- STEP 0 baseline and T1 complete; migrations 0001-0006 applied per user; ordinary owner JWT read/write checks for 0006 passed.
- T2 0007 implemented/applied; API checks and ordinary-user RPC denials passed.
- Fixed $1 Sandbox contribution was approved and captured once. Exact event `0U573441YN817132C` was verified/processed; contribution received; one receipt; summary pledged=0, received=100, remaining=900 minor units.
- Five exact stored-body webhook replays returned HTTP 200 and created no duplicates.
- Existing capture journal balances (100 minor units) but credits 4000 Sales Revenue instead of 4100 Donations.

## IN PROGRESS
- `server/src/services/ledger.js`: fund-specific line builder maps only revenue account 4000 to 4100.
- `server/src/repos/postgres.js`: reads order fund linkage and uses fund-specific lines in synchronous and webhook capture paths.
- `server/test/ledger.test.js`, `server/test/postgres-repos.test.js`: verify 4100 lines for both paths.
- `supabase/migrations/0008_fund_contribution_accounting.sql`: append reversal of each affected original capture entry and repost with 4000 mapped to 4100; originals remain untouched.
- `server/test/phase6-migration.test.js`: assert reversal/repost, idempotency keys, account mapping, and no journal updates/deletes.
- Continuity files: `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`, `docs/WORKLOG.md`.

## NEXT STEPS
1. Run `npm test`; log result, repair failures, and rerun if needed.
2. Run `npm run check:migrations`; log exact parse result.
3. If checks pass, checkpoint and give user exact Supabase SQL Editor steps for the complete 0008 file; wait for “applied”.
4. After user confirms, verify reversal/repost lines, account 4100 balance, contribution summary/ledger reconciliation, then replay exact webhook x5 and check no duplicates.
5. Once T2 passes, checkpoint and continue to T3.

## USER ACTIONS PENDING
- After local code/tests and migration parser pass, apply `supabase/migrations/0008_fund_contribution_accounting.sql` once in the Supabase SQL Editor. Do not edit or rerun migrations 0001-0007. Wait for “applied” before live verification.

## LIVE STATE
- Supabase migrations 0001-0007 applied per user confirmation; 0008 not applied.
- Tunnel/webhook server reported fixed by user.
- Exact capture event verified/processed; one contribution, one capture, one receipt; summary receivedMinor=100, remainingMinor=900.
- Existing ledger capture entry has equal 100-minor debits/credits but uses account 4000 Sales Revenue; correcting reversal/repost pending 0008.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Baseline/T1/T2 existing suite | PASS | 2026-10-26 | `npm test`: 110/110; migrations 0001-0007 parsed |
| T2 live auth/API | PASS | 2026-10-26 | 5 RPCs 403; campaign/pledge/summary passed |
| T2 capture receipt | PASS | 2026-10-26 | exact event verified/processed; one receipt; summary received=100 |
| T2 exact webhook replay x5 | PASS | 2026-10-26 | five HTTP 200; no duplicates |
| T2 account classification | FAIL | 2026-10-26 | existing entry credits 4000, expected 4100; 0008 correction in progress |
| T2 correction unit/integration/static tests | PASS | 2026-10-26 | `npm test`: 113/113; 0001-0008 parsed |
| Migration check 0008 | UNVERIFIED | 2026-10-26 | standalone `npm run check:migrations` pending |

## KNOWN ISSUES AND RISKS
- Migration 0008 must insert two new entries per affected capture: an exact reversal and a corrected repost. It must not update/delete original journal entries or lines.
- A migration failure in Supabase SQL Editor rolls back the transaction. Do not edit applied migrations; use a new numbered migration.
- No live correction occurs until the user applies 0008.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; a syntax/runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only service_role; prove ordinary user JWT gets 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only and ON DELETE RESTRICT; cleanup journal_entries first (lines cascade), then audit_log, organizations, auth.users, using `scripts/cleanup-phase2-test-data.sql`. Reuse fixed named fixtures.
- PayPal Sandbox buyer must be US Personal; seller USD only; use Visa. Webhook URL ends `/api/webhook`; `PAYPAL_WEBHOOK_ID` must match. Raw body is required for signature verification.
- Never print `.env` values; use key names only.
- Pledges are intent; only verified, posted captures are received. Simulated payments do not enter the ledger.
- Every expense needs a visible path to approval, quotation/invoice, payment, ledger entry, completion evidence; report every gap.

## DO NOT
- Never push, use `--force`, weaken tests, edit applied migrations, commit `.env`, or print secrets.
- Stay on `phase6-backend`; never commit/push to `backend` or `main`.
- Do not edit `preview.html`, `dashboard.html`, `src/`, `assets/`.
- Do not create another PayPal payment or manually edit the posted journal; migration 0008 will make the auditable correction.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
