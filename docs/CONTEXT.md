# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-26, Asia/Kolkata.
- Branch: `phase6-backend`; local-only, verified.
- Last task checkpoint: `40ceb86 WIP Phase 6 task 2: verified fund contributions`.
- Current phase/task: Phase 6 Fund Transparency, T2 waiting for human Sandbox buyer approval.

## DONE
- STEP 0 complete: `npm ci`, `npm test` (104 passed), and migration parser for 0001–0005; checkpoint `7ac6c65`.
- T1 migration `supabase/migrations/0006_fund_transparency.sql` and static checks committed as `92525db`.
- User confirmed 0006 applied. Fixed ordinary owner JWT live check: all 11 Phase 6 table reads returned 200; all 11 direct-write attempts returned 403; no rows changed. Docs checkpoint `0a0ab25`.
- T2 implemented locally: 0007 donation/order/capture RPCs; campaign/pledge/order/summary endpoints; webhook verified capture update, mismatch flag, receipt; memory fixtures and tests.
- T2 `npm test`: PASS, 110/110. Explicit migration parse 0001–0007 PASS. JS syntax and `git diff --check` PASS. Frontend diff empty. User applied 0007; five RPCs denied ordinary JWT (403); campaign/pledge/summary API passed; linked $1 Sandbox order created; purchase not approved/captured yet.

## IN PROGRESS
- T2 task files/functions: `supabase/migrations/0007_fund_contributions.sql` (`create_fund_campaign`, `create_fund_pledge`, `link_fund_contribution_order`, `record_fund_paypal_capture_event`, `get_fund_campaign_summary`); `server/src/repos/postgres.js` fund repository and capture RPC; `server/src/repos/memory.js` campaign/pledge/receipt fixtures; `server/src/services/webhookProcessor.js` mismatch handling; `server/src/routes/funds.js` campaign/pledge/order APIs; `server/src/app.js` route/error wiring; `server/test/phase6-migration.test.js`; `server/test/phase6-contributions.test.js`; all three continuity docs.
- Order created (HTTP 201) and linked idempotently to fixed $1 pledge. Wait for user to approve checkout; do not capture or replay until explicit “approved”. After approval, verify signed webhook, receipt, summary and five replays, then log/checkpoint T2. T3 only after those checks.

## NEXT STEPS
1. Create one order for the existing fixed pledge; return the PayPal Sandbox approval URL and wait for user “approved”.
2. After approval, capture/verify webhook, receipt, summary, replay the stored raw body five times, then log/checkpoint T2.
3. Begin T3 state machine after T2 live checks; add new migration numbers and never edit applied migrations.

## USER ACTIONS PENDING
- Open the approval URL returned in the latest assistant message. Sign in with the Phase 6 US Personal Sandbox buyer (`sb-jzrsh53532685@personal.example.com`), complete the $1.00 checkout using Visa, then reply “approved”. No capture/replay is performed before that confirmation. If the link is no longer available, re-authenticate the fixed owner, find campaign `Phase 6 T2 Live Verification` and its fixed pledged contribution, then POST `/api/funds/contributions/{contributionId}/paypal-order` again; request idempotency returns the same order/link.

## LIVE STATE
- Supabase migrations 0001–0006 applied (user reported); 0006 ordinary-user read/write checks PASS. 0007 applied (user confirmed 2026-10-26); live verification pending.
- Tunnel/webhook: previously user-reported configured; no new Phase 6 verification.
- Last live Phase 6 runs: 0006 table reads/writes PASS; 0007 five RPCs denied HTTP 403; local API fixed campaign/$1 pledge/SQL summary PASS; PayPal Sandbox order HTTP 201 linked to pledge. Human buyer purchase and capture are pending.
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
| T2 live RPC/API | PASS | 2026-10-26 | 5 RPCs 403; campaigns/summary 200; pledge=100, received=0, remaining=1000 minor units
| T2 Sandbox order creation | PASS | 2026-10-26 | 1.00 USD order linked; HTTP 201; no purchase/capture
| T2 buyer approval/webhook/capture/replay | UNVERIFIED | 2026-10-26 | Waiting for human checkout approval |

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
