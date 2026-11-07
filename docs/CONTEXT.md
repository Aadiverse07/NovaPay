# NovaPay Context

## HEADER
- Date/time: 2026-11-08 10:03 IST
- Branch: `feat-payment-check`, created from `main` at `9c20fe2`.
- Current phase/task: Payment check signal complete; local commit pending; never pushed.

## DONE
- Phase 1 sources inspected: `server/src/routes/financial.js`, `server/src/routes/paypal.js`, `server/src/services/webhookProcessor.js`, `server/src/ai/anomalies.js`, `server/src/services/anomalies.js`, `supabase/migrations/0005_ai.sql`.
- Added pure capture signal evaluator in `server/src/services/paymentCheck.js`: confirmed means PayPal status `COMPLETED` with no open linked anomaly; unconfirmed means a linked webhook is failed/unverified; otherwise actionable flags produce Needs review. Seller protection is considered only when present.
- `/api/transactions` now adds `paymentCheck: { state, reasons }`, with `verifiedWebhookReceived: true` only when a matching event is signature verified. Reads are limited to the current org's transactions/anomalies/captures and exact capture IDs for current-org or org-less webhook rows. Signal lookup failures show Needs review rather than falsely confirming.
- Transactions grid displays Confirmed / Needs review / Unconfirmed, reasons in a tooltip, visible verified-webhook detail only when present, helper text, and a Needs review filter. Demo rows remain unchanged.
- Files edited for the task: `server/src/services/paymentCheck.js`, `server/src/routes/financial.js`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/test/payment-check.test.js`, `server/test/financial-routes.test.js`, `server/test/postgres-repos.test.js`, `server/test/transactions-grid.test.js`, `src/financial-live.js`, `src/transactions-grid-core.js`, `src/transactions-grid.js`, `src/dashboard.js`, `dashboard.html`, `docs/WORKLOG.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`, `docs/CONTEXT.md`.
- No schema migration or write path added. Refunds, approvals, ledger, and webhook processing behavior unchanged.

## IN PROGRESS
- Implementation complete; local commit is the remaining step. Preserve the earlier user edit in `src/financial-live.js` (source/capture ID datasets), which is now used by this feature.

## NEXT STEPS
1. Stage only the named feature files and docs; confirm `.env` is not staged/tracked.
2. Commit locally on `feat-payment-check`; do not push.
3. Restart the local server and hard-refresh the dashboard; follow manual checks in the final response.

## USER ACTIONS PENDING
- Restart `npm start`, sign in, open Transactions, inspect a badge and its reason tooltip, choose Needs review, and verify the visible signature-verified webhook detail only for a row that has a verified event.

## LIVE STATE
- Migrations: no migration required or applied; all 21 existing migration files pass syntax checks.
- Read-only data lookup: `6UV5767052048553J`, `1PH772199P287644F`, `62T15745ED514284D` are COMPLETED; no open anomaly, matching webhook event, or stored `seller_protection` was found for each.
- Seller protection: PayPal capture route and webhook processor store only `seller_receivable_breakdown`; no saved seller protection field exists, so it does not influence current rows.
- Browser/live endpoint from this branch: UNVERIFIED.
- Secrets: no `.env` values printed; `.env` is not tracked.

## TEST STATE
| Check | Status | Date | Command / result |
|---|---|---|---|
| Payment-check evaluator, API, repository query, grid mapping/filter | PASS | 2026-11-08 | `node --test server/test/payment-check.test.js server/test/financial-routes.test.js server/test/postgres-repos.test.js server/test/transactions-grid.test.js`: 39/39 |
| Full suite and migrations | FAIL (known unrelated test) | 2026-11-08 | `npm test`: 377/378; 21/21 migration syntax checks pass; `server/test/fund-campaign-live-view.test.js:43` expects obsolete script tag |
| FX tests that briefly returned 503 in first full run | PASS | 2026-11-08 | `node --test server/test/fx-providers.test.js server/test/phase3-services.test.js`: 20/20 |
| Changed JS syntax, whitespace, protected-file diff | PASS | 2026-11-08 | `node --check` changed JS; `git diff --check`; protected-file diff vs main empty |
| Browser badge, reason and filter | UNVERIFIED | 2026-11-08 | Must be checked manually after restarting server |

## KNOWN ISSUES AND RISKS
- Full suite retains the pre-existing Community Funds script-tag assertion failure; it is unrelated to transaction markup/code.
- Live state is based on read-only lookup; this branch's HTTP response and browser display were not exercised.
- Anomaly list is bounded to 1000 recent rows by the repository call; if a tenant grows beyond that, consider a targeted open-anomaly lookup.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; a syntax or runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary-user denial.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only with ON DELETE RESTRICT; cleanup journal_entries before audit_log, organizations and auth.users using the manual cleanup script.
- PayPal Sandbox buyer must be US Personal; seller USD only; Visa at checkout; webhook URL ends `/api/webhook` and webhook ID matches.
- Raw body is needed for PayPal signature verification. Never print `.env` values; use key names only.

## DO NOT
- Do not push, touch main, force-push, edit protected theme/assets, change approval/refund/webhook/ledger behavior, weaken tests, or commit `.env`.

## RESUME COMMANDS
- `git status --short`
- `git branch --show-current`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
