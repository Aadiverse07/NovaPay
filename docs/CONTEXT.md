# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-26, Asia/Kolkata.
- Branch: `phase6-backend`; local-only, verified.
- Last task checkpoint: `40ceb86 WIP Phase 6 task 2: verified fund contributions`.
- Current phase/task: Phase 6 Fund Transparency, T2 implementation complete; awaiting migration 0007 application.

## DONE
- STEP 0 complete: `npm ci`, `npm test` (104 passed), and migration parser for 0001–0005; checkpoint `7ac6c65`.
- T1 migration `supabase/migrations/0006_fund_transparency.sql` and static checks committed as `92525db`.
- User confirmed 0006 applied. Fixed ordinary owner JWT live check: all 11 Phase 6 table reads returned 200; all 11 direct-write attempts returned 403; no rows changed. Docs checkpoint `0a0ab25`.
- T2 implemented locally: 0007 donation/order/capture RPCs; campaign/pledge/order/summary endpoints; webhook verified capture update, mismatch flag, receipt; memory fixtures and tests.
- T2 `npm test`: PASS, 110/110. Explicit migration parse 0001–0007 PASS. JS syntax and `git diff --check` PASS. Frontend diff empty.

## IN PROGRESS
- T2 task files/functions: `supabase/migrations/0007_fund_contributions.sql` (`create_fund_campaign`, `create_fund_pledge`, `link_fund_contribution_order`, `record_fund_paypal_capture_event`, `get_fund_campaign_summary`); `server/src/repos/postgres.js` fund repository and capture RPC; `server/src/repos/memory.js` campaign/pledge/receipt fixtures; `server/src/services/webhookProcessor.js` mismatch handling; `server/src/routes/funds.js` campaign/pledge/order APIs; `server/src/app.js` route/error wiring; `server/test/phase6-migration.test.js`; `server/test/phase6-contributions.test.js`; all three continuity docs.
- Remaining: checkpoint T2; user applies 0007; verify new RPC denial with ordinary JWT and safe live campaign/pledge/summary; do not start T3 until these checks pass.

## NEXT STEPS
1. Checkpoint T2 locally, then ask user to apply the complete `supabase/migrations/0007_fund_contributions.sql` in Supabase SQL Editor and reply “applied”.
2. Verify 0007 RPC client denial with ordinary JWT and safe live campaign/pledge/summary behavior. Do not create a real Sandbox order without reaching the explicit Phase 6 live purchase gate.
3. Once T2 live validation is complete, begin T3 state machine from the prompt; add a new numbered migration, never edit applied migrations.

## USER ACTIONS PENDING
- Apply `supabase/migrations/0007_fund_contributions.sql`: Supabase Dashboard → SQL Editor → New query → paste the entire file → Run once → reply “applied” or share the SQL error. Do not alter/rerun the migration after successful application. T3 waits for T2 live checks.

## LIVE STATE
- Supabase migrations 0001–0006 applied (user reported); 0006 ordinary-user read/write checks PASS. 0007 is not yet applied.
- Tunnel/webhook: previously user-reported configured; no new Phase 6 verification.
- Last live Phase 6 run: ordinary owner JWT, 11 reads 200 and 11 direct write attempts 403. No donation/order/purchase initiated.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| STEP 0 baseline | PASS | 2026-10-25 | `npm ci`; `npm test` 104/104; migrations 0001–0005 parse |
| T1 static | PASS | 2026-10-25 | `npm test` 106/106; migration parse; diff check |
| T1 live ordinary-user RLS | PASS | 2026-10-26 | 11 table GETs HTTP 200; 11 direct POSTs HTTP 403 |
| T2 full regression | PASS | 2026-10-26 | `npm test`: 110/110, migrations 0001–0007 parsed |
| T2 explicit migration check | PASS | 2026-10-26 | `npm run check:migrations`: 0001–0007 parse |
| T2 JavaScript syntax | PASS | 2026-10-26 | `find server scripts -name '*.js' -print0 \| xargs -0 -n1 node --check` |
| T2 diff/frontend scope | PASS | 2026-10-26 | `git diff --check`; frontend changed-path list empty |
| T2 live RPC/order/capture | UNVERIFIED | 2026-10-26 | 0007 awaiting user application; no PayPal call |

## KNOWN ISSUES AND RISKS
- SQL parser and in-memory route tests do not prove live 0007 function semantics; live validation is pending application.
- T2 mismatch handling flags and leaves pledge unreceived; it does not post the mismatched capture to the ledger, consistent with existing capture RPC's expected-amount check. Investigate via safe operations before claiming receipt.
- Target summary `remainingMinor` is target minus received, as specified by the test requirements; allocations and expense fields are separate.
- PayPal Sandbox purchase requires a human approval at the buyer link. Do not buy until the Phase 6 gate; never use payout/invoicing without explicit requested gate.
- Receipts/evidence do not imply donor identity or prove completion quality.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime error rolls all changes back. Never edit an applied migration; add a numbered file.
- Every SECURITY DEFINER/posting RPC must revoke execute from public, anon, authenticated, grant only to service_role, and be tested with ordinary-user JWT (expect 403).
- PostgREST embeds need explicit FK names when multiple relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup deletes journal_entries first (lines cascade), then audit_log, organizations, auth.users with `scripts/cleanup-phase2-test-data.sql`. Reuse fixed fixtures.
- PayPal Sandbox buyer must be US Personal; seller USD; use Visa. Webhook URL ends `/api/webhook`; `PAYPAL_WEBHOOK_ID` must match.
- Raw body is needed for PayPal signature verification. Never print `.env` values; key names only.
- Pledges are intent; only verified, posted captures are received. Simulated payments do not enter real ledger.
- Every expense needs a visible path to approval, quotation/invoice, payment, ledger entry, completion evidence; report every gap.

## DO NOT
- Never push, use `--force`, weaken tests, edit applied migrations, commit `.env`, or print secrets.
- Stay on `phase6-backend`; never commit/push to `backend` or `main`.
- Do not edit `preview.html`, `dashboard.html`, `src/`, `assets/`.
- Do not create/buy a PayPal donation until the explicit human gate; no PayPal Payouts/Invoicing unless explicitly reached and approved.
- Reuse fixed test users/orgs; clean only rows created by this run.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
