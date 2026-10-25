# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-26, Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Last completed checkpoint: `6801806 WIP Phase 6 task 3: enforce maintenance workflow`.
- Current phase/task: Phase 6 Fund Transparency, T3 maintenance state machine; migration 0009 apply gate pending.

## DONE
- STEP 0 and T1 complete; migrations 0001-0006 applied per user; ordinary owner JWT 0006 table reads passed and direct writes returned 403.
- T2 migration 0007 applied; API checks and all five ordinary-user RPC denials passed.
- Fixed $1 Sandbox contribution approved/captured exactly once; exact event `0U573441YN817132C` verified/processed; one receipt; summary received=100 and remaining=900 minor units.
- Migration 0008 applied; original capture entry unchanged; balanced reversal and repost entries correct net revenue to account 4100 Donations.
- Exact stored webhook replay x5 passed before and after migration 0008; no duplicate capture, receipt, or journal sources.
- T3 workflow, routes, RPCs, and tests implemented locally. Focused tests 8/8 PASS; full suite 117/117 PASS; parser 0001-0009 PASS.

## IN PROGRESS
- Migration `supabase/migrations/0009_maintenance_state_machine.sql` is ready but not applied.
- T3 files: `server/src/routes/funds.js`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/test/phase6-maintenance.test.js`, `server/test/phase6-migration.test.js`, migration 0009, and continuity docs.
- T3 exposes request creation, contractor creation, quotation, scope approval, contractor verification, and threshold-aware payment approval. Each DB action is a SECURITY DEFINER RPC, revoked from public/anon/authenticated and granted only to service_role.
- New requests use `requested`; status constraint retains legacy values to avoid rewriting existing records. T3 RPCs enforce legal progression through `payment_approved`, requester cannot self-approve, and threshold >=10000 requires two different approvers.

## NEXT STEPS
1. User applies complete migration 0009 once in Supabase SQL Editor and replies “applied”.
2. Verify live T3 request→quotation→scope approval→contractor verification→payment approval, skipped transitions, self-approval rejection, threshold, and ordinary JWT RPC denials.
3. Checkpoint T3 live results and continue to T4.

## USER ACTIONS PENDING
- Apply `supabase/migrations/0009_maintenance_state_machine.sql` once in the correct Supabase project: Dashboard > SQL Editor > New query > paste entire file > Run. Do not edit/rerun migrations 0001-0008. Reply “applied”; wait before live verification.

## LIVE STATE
- Supabase migrations 0001-0008 applied per user confirmation; 0009 not applied.
- User reports tunnel/webhook server fixed.
- T2 exact capture event verified/processed; contribution received, one receipt; summary receivedMinor=100/remainingMinor=900.
- T2 journal correction verified: original unchanged, reversal/repost balanced; net revenue credit in 4100. Post-migration replay x5 remained idempotent.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| T1 ordinary-user RLS | PASS | 2026-10-26 | 11 table reads HTTP 200; 11 direct writes HTTP 403 |
| T2 tests | PASS | 2026-10-26 | `npm test`: 110/110 before T2 account fix |
| T2 approved capture/event/receipt/summary | PASS | 2026-10-26 | Exact resource verified/processed; one receipt; received=100, remaining=900 |
| T2 account reclassification | PASS | 2026-10-26 | 0008 applied; original preserved; reversal/repost balanced; net account 4100 |
| T2 exact webhook replay x5 | PASS | 2026-10-26 | Five HTTP 200 responses; no duplicate records |
| T3 focused | PASS | 2026-10-26 | `node --test server/test/phase6-maintenance.test.js server/test/phase6-migration.test.js`: 8/8 |
| T3 full regression | PASS | 2026-10-26 | `npm test`: 117/117; PostgreSQL parser accepted 0001-0009 |
| T3 standalone migration check | PASS | 2026-10-26 | `npm run check:migrations`: 0001-0009 parsed |
| T3 live state machine | UNVERIFIED | 2026-10-26 | Waiting for user to apply migration 0009 |

## KNOWN ISSUES AND RISKS
- T3 live behavior is unverified until migration 0009 is applied and live tests run.
- Keep legacy statuses untouched; new transitions are through the migration 0009 service-only RPCs.
- Do not edit/delete journal entries or lines; T2 correction uses appended reversal/repost entries.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; a syntax/runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant it only to service_role; prove ordinary user JWT gets 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only and ON DELETE RESTRICT; cleanup journal_entries first (lines cascade), then audit_log, organizations, auth.users with `scripts/cleanup-phase2-test-data.sql`. Reuse fixed named fixtures.
- PayPal Sandbox buyer must be US Personal; seller USD only; use Visa. Webhook URL ends `/api/webhook`; `PAYPAL_WEBHOOK_ID` must match. Raw body is required for PayPal signature verification.
- Never print `.env` values; use key names only.
- Pledges are intent; only verified, posted captures are received. Simulated payments do not enter the real ledger.
- Every expense needs a visible path to approval, quotation/invoice, payment, ledger entry, completion evidence; report every gap.

## DO NOT
- Never push, use `--force`, weaken tests, edit applied migrations, commit `.env`, or print secrets.
- Stay on `phase6-backend`; never commit/push to `backend` or `main`.
- Do not edit `preview.html`, `dashboard.html`, `src/`, `assets/`.
- Do not create another PayPal payment or manually modify posted journal rows.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
