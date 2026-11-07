# NovaPay Context

## HEADER
- Date/time: 2026-11-07 15:48 IST
- Branch: `feat-run-scan`, created from `feat-payment-check` (not merged to `origin/main` at branch creation).
- Current phase/task: Fix Transactions Payment check rendering/loading and scan status layout; local commit pending; never push.

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
- UI fix complete; final syntax/diff checks and local commit remain. This branch inherits Payment check commits `2a22b9e` and `413dc9f` from `feat-payment-check`, which is not merged into main.

## NEXT STEPS
1. Run final `node --check`, `git diff --check`, and protected-file diff check.
2. Commit the named UI/docs files locally; do not push.
3. Human can verify in browser after restarting `npm start`.

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
