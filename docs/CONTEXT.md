# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-26, Asia/Kolkata.
- Branch: `phase6-backend`; local-only, verified.
- Last task checkpoint: `ead92ad WIP Phase 6 task 2: await webhook delivery`.
- Current phase/task: Phase 6 Fund Transparency, T2 live capture-event delivery remains unresolved.

## DONE
- STEP 0 complete: `npm ci`, `npm test` (104 passed), and migration parser for 0001–0005; checkpoint `7ac6c65`.
- T1 migration `supabase/migrations/0006_fund_transparency.sql` and static checks committed as `92525db`.
- User confirmed 0006 applied. Fixed ordinary owner JWT live check: all 11 Phase 6 table reads returned 200; all 11 direct-write attempts returned 403; no rows changed. Docs checkpoint `0a0ab25`.
- T2 implemented locally: 0007 donation/order/capture RPCs; campaign/pledge/order/summary endpoints; webhook verified capture update, mismatch flag, receipt; memory fixtures and tests.
- T2 `npm test`: PASS, 110/110. Explicit migration parse 0001–0007 PASS. JS syntax and `git diff --check` PASS. Frontend diff empty. User applied 0007; five RPCs denied ordinary JWT (403); campaign/pledge/summary API passed; linked $1 Sandbox order created; user approved checkout; capture/webhook/replay verification in progress.

## IN PROGRESS
- T2 task files/functions: `supabase/migrations/0007_fund_contributions.sql` (`create_fund_campaign`, `create_fund_pledge`, `link_fund_contribution_order`, `record_fund_paypal_capture_event`, `get_fund_campaign_summary`); `server/src/repos/postgres.js` fund repository and capture RPC; `server/src/repos/memory.js` campaign/pledge/receipt fixtures; `server/src/services/webhookProcessor.js` mismatch handling; `server/src/routes/funds.js` campaign/pledge/order APIs; `server/src/app.js` route/error wiring; `server/test/phase6-migration.test.js`; `server/test/phase6-contributions.test.js`; all three continuity docs.
- Port 3000 listener is running current checkout/config. Approved order capture is complete once. PayPal event list found exactly one matching capture event; webhook endpoint and capture-event subscription are correct. After user reported tunnel/webhook repair and resend, read-only reconciliation still found no exact capture/order event among 8 recent inbox events. Contribution remains pledged, one capture row exists, no capture link, no receipt, and receivedMinor=0. No manual write or replay.

## NEXT STEPS
1. Human confirms PayPal Sandbox delivery status for the exact capture-completed event after tunnel repair/resend.
2. Once the event appears in `paypal_events`, verify signature and capture/order references; reconcile contribution, receipt, capture, balanced journal and summary; replay exact stored raw body five times and verify idempotency.
3. If delivery remains absent, inspect PayPal delivery status/tunnel routing and repair or resend the existing event; never mark received manually. Finish T2 reconciliation before T3.

## USER ACTIONS PENDING
- Inspect PayPal Developer Dashboard > Apps & Credentials > Sandbox > Webhooks > configured webhook > Event deliveries for the exact capture-completed event. The user reports the tunnel/webhook was fixed and the event resent, but the exact event remains absent from the inbox, including across 8 recent event rows. Check PayPal Sandbox Event deliveries for the event matching the captured transaction and confirm delivery to the configured `/api/webhook` endpoint. If failed, repair forwarding and resend that same event. Do not create another order or manually mark received. Share delivery status only; no secrets.

## LIVE STATE
- Supabase migrations 0001–0006 applied (user reported); 0006 ordinary-user read/write checks PASS. 0007 applied (user confirmed 2026-10-26); live verification pending.
- Tunnel/webhook: previously user-reported configured; no new Phase 6 verification.
- Last live Phase 6 runs: 0006 table reads/writes PASS; 0007 five RPCs denied HTTP 403; local API fixed campaign/$1 pledge/SQL summary PASS; PayPal Sandbox order HTTP 201 linked to pledge. User approved checkout; capture completed exactly once. After user-reported tunnel fix and resend, exact event remains absent from the app inbox. Across 8 recent capture-completed rows, none matched. Contribution remains pledged; one capture row; no receipt; receivedMinor=0. Raw-body replay not run.
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
| T2 buyer-approved capture | PASS | 2026-10-26 | Authenticated capture completed existing $1 Sandbox order once |
| T2 exact PayPal event lookup/webhook subscription | PASS | 2026-10-26 | One exact matching provider event; webhook path/subscription confirmed |
| T2 exact-event resend request | PASS | 2026-10-26 | PayPal accepted resend request |
| T2 matching signed delivery, receipt, ledger, replay | UNVERIFIED | 2026-10-26 | Exact event absent from Supabase inbox after 25 seconds; pledge still pledged; 0 receipts |

## KNOWN ISSUES AND RISKS
- The initial port-3000 status script checked the wrong field; corrected status check confirmed PayPal configured/connected and webhook configured. PayPal event list returned the exact matching capture event and webhook inspection confirmed the endpoint and subscription. User reported tunnel/webhook fix and resend, but exact event still absent across the 8 most recent global inbox rows. Contribution is still pledged and no receipt/ledger transition occurred. Earlier generic processed-event match was unrelated.
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
- Stay on the currently instructed branch; never push or commit to `backend` or `main`.
- Do not edit `preview.html`, `dashboard.html`, `src/`, `assets/`.
- Do not create/buy a PayPal donation until the explicit human gate; no PayPal Payouts/Invoicing unless explicitly reached and approved.
- Reuse fixed test users/orgs; clean only rows created by this run.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
