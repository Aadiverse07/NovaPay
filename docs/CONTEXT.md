# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-26, Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Last completed checkpoint: implementation checkpoint pending; last committed `0d37592 WIP Phase 6 task 2: plan fund account correction`.
- Current phase/task: Phase 6 Fund Transparency, T3 maintenance state machine implementation; migration 0009 apply gate pending.

## DONE
- STEP 0 baseline and T1 complete; migrations 0001-0006 applied per user; ordinary owner JWT read/write checks for 0006 passed.
- T2 0007 implemented/applied; API checks and ordinary-user RPC denials passed.
- Fixed $1 Sandbox contribution was approved and captured once. Exact event `0U573441YN817132C` was verified/processed; contribution received; one receipt; summary pledged=0, received=100, remaining=900 minor units.
- Five exact stored-body webhook replays returned HTTP 200 and created no duplicates.
- Existing capture journal balances (100 minor units) but credits 4000 Sales Revenue instead of 4100 Donations.

## IN PROGRESS
- T2 complete; all authorized T2 post-0008 live checks pass.
- T3 files: `supabase/migrations/0009_maintenance_state_machine.sql`, `server/src/routes/funds.js`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/test/phase6-maintenance.test.js`, `server/test/phase6-migration.test.js`, plus continuity docs.
- T3 focused tests PASS 8/8; full `npm test` PASS 117/117; `npm run check:migrations` PASS for 0001-0009.
- `server/src/services/ledger.js`: fund-specific line builder maps only revenue account 4000 to 4100.
- `server/src/repos/postgres.js`: reads order fund linkage and uses fund-specific lines in synchronous and webhook capture paths.
- `server/test/ledger.test.js`, `server/test/postgres-repos.test.js`: verify 4100 lines for both paths.
- `supabase/migrations/0009_maintenance_state_machine.sql`: user confirmed applied; live original/reversal/repost entries all balanced, original unchanged.
- `server/test/phase6-migration.test.js`: assert reversal/repost, idempotency keys, account mapping, and no journal updates/deletes.
- Continuity files: `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`, `docs/WORKLOG.md`.

## NEXT STEPS
1. User applies `supabase/migrations/0009_maintenance_state_machine.sql` once in Supabase SQL Editor and replies “applied”.
2. Verify original capture entry is unchanged; reversal and repost entries are balanced; final net credits 4100; summary reconciles; replay exact webhook x5 creates no duplicates.
3. Checkpoint T2, then continue to T3.

## USER ACTIONS PENDING
- After local T3 tests and migration parser pass, apply complete `supabase/migrations/0009_maintenance_state_machine.sql` once in the correct Supabase SQL Editor project and reply “applied”. Do not edit/rerun 0001-0008.

## LIVE STATE
- Supabase migrations 0001-0007 applied per user confirmation; 0008 not applied.
- Tunnel/webhook server reported fixed by user.
- Exact capture event verified/processed; one contribution, one capture, one receipt; summary receivedMinor=100, remainingMinor=900.
- Original ledger capture remains unchanged; new reversal and repost entries correct the net revenue credit to Donations account 4100.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Baseline/T1/T2 existing suite | PASS | 2026-10-26 | `npm test`: 110/110; migrations 0001-0007 parsed |
| T2 live auth/API | PASS | 2026-10-26 | 5 RPCs 403; campaign/pledge/summary passed |
| T2 capture receipt | PASS | 2026-10-26 | exact event verified/processed; one receipt; summary received=100 |
| T2 exact webhook replay x5 | PASS | 2026-10-26 | five HTTP 200; no duplicates |
| T2 account classification | PASS | 2026-10-26 | 0008 applied; original preserved; balanced reversal/repost puts net credit in 4100 |
| T2 correction unit/integration/static tests | PASS | 2026-10-26 | `npm test`: 113/113; migrations 0001-0008 parsed |
| Migration check 0008 | PASS | 2026-10-26 | `npm run check:migrations`: PostgreSQL 17 parsed 0001-0008 |
| T2 post-0008 live reconciliation/replay | PASS | 2026-10-26 | original/reversal/repost balanced; summary reconciles; exact replay x5 yielded no duplicates |

## KNOWN ISSUES AND RISKS
- T2 migration 0008 inserted reversal/repost entries and was live-verified. Continue preserving original journal entries and lines.
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
