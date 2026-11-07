# NovaPay Context

## HEADER
- Date/time: 2026-11-07 15:48 IST
- Branch: `feat-run-scan`, created from `feat-payment-check` (not merged to `origin/main` at branch creation).
- Current phase/task: Fix Transactions Payment check rendering/loading and scan status layout; local commit pending; never push.

- Date/time: 2026-11-07 20:50 IST
- Branch: `ui-polish-approvals` (created from `fix-ai-proposals`)
- Last UI implementation commit: `a8e469a` (`Polish persisted approval and AI proposal UI`); unrelated carried-forward edits remain uncommitted.
- Current phase/task: approvals and AI proposal UI polish; no server logic, safety checks, refund services or ledger logic changed.

## DONE
- Existing endpoint confirmed: POST `/api/anomalies/run`, protected by owner/admin/accountant RBAC; no server logic changed.
- Added two existing-token `.btn btn--ghost` controls: Notifications popover and beside Transactions Needs review filter.
- `src/notifications-live.js` uses `NovaPayApi.request` for auth/org headers; checks trusted app metadata or existing `/api/onboarding` memberships; hides in demo mode and for known unauthorized roles.
- Scan disables both controls and shows Scanning; results/errors use aria-live status text. 403 role message is specific; 401/429 and generic failures are readable and retryable. No alerts or raw stack output.
- When new findings are created, invalidates notifications/transactions and refreshes both existing views. `created: 0` says findings may already be recorded today.
- Files changed: `dashboard.html`, `src/notifications-live.js`, `server/test/notifications-live-source.test.js`, `docs/WORKLOG.md`, `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`.
- Transactions API response was verified in route code/tests: each returned row receives `paymentCheck`; no server changes were made for this UI fix.
- No RBAC/anomaly rule, approval, refund or ledger changes. No migration.
- Additional UI fix files: `src/transactions-grid.js`, `dashboard.html`, `server/test/transactions-ledger-live.test.js`, plus the four continuity docs.

## IN PROGRESS
- UI fix committed locally as `ff4d73b`; no push. This branch inherits Payment check commits `2a22b9e` and `413dc9f` from `feat-payment-check`, which is not merged into main.

- Current AI refund ID fix is uncommitted; see the 2026-11-07 section below.
- Live browser request counts/statuses and production Supabase persistence remain unverified; automated fixture tests are not live DB checks.

## NEXT STEPS
1. Human can verify in browser after restarting `npm start`.
2. Do not push unless separately authorized.

## USER ACTIONS PENDING
- Restart `npm start`; sign in; open Transactions and verify badges, tooltip reasons, and that Loading transactions clears. Confirm Run scan status is below the filters.

## LIVE STATE
- Branch base: `feat-payment-check` at local commit `413dc9f`; `origin/main` was `b1bbbbf` at fetch and did not contain feat-payment-check.
- Migrations: unchanged; 21 files passed syntax checks via `npm test`.
- Browser scan execution and UI refresh: UNVERIFIED.
- Secrets: no `.env` values printed; `.env` not staged/tracked.

## TEST STATE
| Check | Status | Date | Command / result |
|---|---|---|---|
| Notifications and anomaly route tests | PASS | 2026-11-07 | `node --test server/test/notifications-live-source.test.js server/test/routes.test.js`: 13/13 |
| Full tests/migrations | FAIL (known/unrelated) | 2026-11-07 | `npm test`: 376/379; 21/21 migration syntax checks; known Community Funds assertion and two FX 503s |
| FX failures isolated | PASS | 2026-11-07 | `node --test server/test/fx-providers.test.js server/test/phase3-services.test.js`: 20/20 |
| Payment check badges/loading and scan-status layout in browser | UNVERIFIED | 2026-11-07 | Requires authenticated browser session |
| Focused transaction API/grid tests | PASS | 2026-11-07 | `node --test server/test/financial-routes.test.js server/test/transactions-grid.test.js server/test/transactions-ledger-live.test.js`: 20/20 |
| Current full suite | FAIL (known unrelated) | 2026-11-07 | `npm test`: 380/381; 21/21 migration syntax checks; only Community Funds script-tag assertion failed |

## KNOWN ISSUES AND RISKS
- Full test suite has the known Community Funds test expecting an obsolete `src/fund-views.js` tag. Two FX route tests returned 503 under parallel full-suite load but passed in isolation; this feature does not touch FX.
- A scan with no new rows reports that findings may already be recorded today; it does not claim there were no anomalies.
- The browser rendering bug was not verified in a real browser during this pass.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; a syntax/runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary-user denial.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- audit_log is insert-only with ON DELETE RESTRICT; clean journal entries before audit_log, organizations and auth users using the manual cleanup script.
- PayPal Sandbox buyer must be US Personal; seller USD; Visa at checkout; webhook URL ends in `/api/webhook` and webhook ID matches. Raw body is needed for signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Never push to main, force-push, use `git add .`, edit protected UI/theme/assets, change server scan/RBAC rules, weaken tests, or commit `.env`.

## RESUME COMMANDS
- `git status --short`
- `git branch --show-current`
- `npm test`
- `npm run check:migrations`
- `git diff --check`

```sh
git status --short
git branch --show-current
npm test
npm run check:migrations
```

## 2026-11-07 AI refund proposal ID fix
- Branch: `main`. Pre-existing dirty user changes in README.md, preview.html, src/base.css, src/hero-laptop.css, src/hero-orbit.css were left untouched.
- Changed server sanitizer to validate as before then normalize a known transaction UUID proposal reference to its PayPal `sourceId`; client resolves by ID/source/capture attributes and submits capture reference. Refund safety checks and approval/refund services were not changed.
- Focused regressions: PASS 25/25. Full `npm test`: FAIL 365/366; sole unrelated failure is the Community Funds source test expecting `src/fund-views.js` directly in dashboard.html.
- Browser: authenticated dashboard submitted the requested query; server returned 200, but assistant rendered narrative only, no proposal card. Target card state and `/api/approvals/register` call are unverified.
- Next: investigate why this live assistant response omitted a structured proposal; once a card is returned, verify 10.00 USD, Sandbox approval label, enabled Send control, and registration without executing a refund.
- Follow-up: authenticated “Send to Approvals” now uses `NovaPayApi.request` to POST `/api/approvals/register` with the proposal approval ID, resolved PayPal capture ID, and amount from the loaded transaction row, then refreshes the approvals queue. This requires an explicit button click; no refund is sent by this flow.
- Final test rerun after that wiring: `npm test` FAIL 365/366; the same unrelated Community Funds script-tag assertion remains. Focused AI/dashboard tests pass 25/25.


## AI refund proposal diagnosis (2026-11-07)
- Read-only service-role query: exact provided capture text had 0 capture and approval rows. Prefix query found one matching stored transaction/capture: COMPLETED, USD, 700 minor units, ID `6UV5767052048553J`; the reported `6UV57670520485 3J` omits a `5`. Approval count by status for the provided exact ID was 0. No list filter was involved in the database check.
- Redaction reproduced as `6UV[REDACTED_PHONE]J`; whitespace-split PayPal capture IDs are now protected through phone redaction. Exact known-record matching accepts whitespace inserted into a known alphanumeric ID, but does not guess missing characters.
- Proposal persistence now logs a reason code on each rejection, reports an honest failure to the user, and does not allow “prepared/already created” wording without a persisted proposal object. Completed USD status, organization scope, refundable balance and approval RPC checks remain enforced.
- Full `npm test`: 370/371; one unrelated existing failure in `server/test/fund-campaign-live-view.test.js:43` (expects a direct `src/fund-views.js` script tag). AI suite: 24/24. Migrations syntax: 21/21.
- Live browser proposal flow remains UNVERIFIED; server on port 3000 was not restarted and no AI request was made.


## UI polish checkpoint (2026-11-07)
- Persisted refund confirmations use “Confirm refund in PayPal Sandbox”, capture ID and amount, and state Sandbox will be contacted. Simulated wording is limited to send-invoice, maintenance-payment, dispute-evidence and hold-payout.
- Auth errors trigger one Supabase session refresh and an authenticated uncached GET for `/api/approvals/:id`; the UI reflects server status. No decision/refund POST is repeated.
- Live Supabase AI proposal cards with an approval ID show a review-pending message and Open Approvals button; missing approval IDs show no card. Demo mode behavior is preserved.
- `/api/status` model is shown with a provider label inferred from the model name; initial and failed status copy does not claim Anthropic. Connected PayPal Sandbox hides the unavailable notice.
- Focused UI tests PASS 16/16; syntax and diff whitespace checks PASS. Browser verification UNVERIFIED. Hard-reload the browser; no server restart required because server code did not change.
