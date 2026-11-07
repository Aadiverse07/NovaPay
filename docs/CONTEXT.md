# NovaPay Context

## HEADER
- Date/time: 2026-11-07 20:50 IST
- Branch: `ui-polish-approvals` (created from `fix-ai-proposals`)
- Last UI implementation commit: `a8e469a` (`Polish persisted approval and AI proposal UI`); unrelated carried-forward edits remain uncommitted.
- Current phase/task: approvals and AI proposal UI polish; no server logic, safety checks, refund services or ledger logic changed.

## DONE
- Read this file and the WORKLOG tail before work; created checkpoint `39a6cc9` before changing code.
- Confirmed the code path: onboarding lookup failures were treated as “no organization”; global request limiters were hard-coded at 300/IP and 240/user per 15 minutes; several hidden modules and focus/auth events fetched independently.
- Added workspace restore states: only a successful lookup returning no org can show create-workspace. Transient 429/5xx/network retains the last org, retries with backoff/Retry-After, and exposes retry state.
- Added shared GET in-flight deduplication, 20-second successful response cache, scoped mutation invalidation, and bounded Retry-After handling in `src/api-client.js`.
- Scoped passive refresh to active views, visible tabs, and at least 30-second focus debounce; Sandbox events poll no faster than 60 seconds while visible.
- Made IP/user/read rate budgets configurable (`RATE_LIMIT_IP=1500`, `RATE_LIMIT_USER=1200`, `RATE_LIMIT_READ_USER=2400` defaults); route-specific auth/OTP/onboarding/AI limits remain. Rate limit responses include Retry-After.
- Added regression tests for budget/dedupe/cache/backoff, workspace 429 behavior and duplicate-workspace protection, configurable limits/headers, and persisted transaction/ledger route reads across app restart fixtures.
- Automated verification: `npm test` PASS 352/352 (includes 21/21 migration syntax checks); changed JS `node --check` PASS; `git diff --check` PASS; protected files unchanged.
- Pre-change checkpoint commit: `39a6cc9`; integration merge commit: `e043aafd4bf9cf70602d2870e9984198f234ceea`; pushed to origin/main and origin/novapay-final; the merge hash is recorded in this file and WORKLOG.

## IN PROGRESS
- Current AI refund ID fix is uncommitted; see the 2026-11-07 section below.
- Live browser request counts/statuses and production Supabase persistence remain unverified; automated fixture tests are not live DB checks.

## NEXT STEPS
1. Human: run the exact steps in `docs/BROWSER-CHECKLIST.md` using the existing owner and org; record Network statuses and request counts.
2. Confirm Transactions and Ledger responses still contain the existing sandbox payment after server restart, hard refresh, and sign-out/sign-in.
3. Human: perform the browser checklist; browser and live database verification remain unverified.

## USER ACTIONS PENDING
- Start/restart the local server and perform the browser checklist with the existing owner; record observed request counts and statuses.

## LIVE STATE
- Migrations: no migrations run in this task; syntax check passed for 21 files.
- Tunnel/webhook: not checked.
- Existing Supabase transaction/ledger rows: previously reported present by user; this run did not query production Supabase.
- Server/browser request counts and actual response codes: UNVERIFIED; the screenshot text matches the general IP limiter's configured response, but no request log from that browser session was captured.
- Secrets: no `.env` values printed; no `.env` or secret-named path tracked. Strict scan clean; the two distinct `sb_secret_` dummy fixtures were length 20. Main and backup pushes completed without force.

## TEST STATE
| Check | Status | Date | Command / evidence |
|---|---|---|---|
| API request dedupe/cache/budget/backoff | PASS | 2026-11-02 | `npm test`; modeled 11 distinct module GETs, repeated opens made no extra network calls within TTL |
| Workspace transient 429/backoff/org retention | PASS | 2026-11-02 | `npm test`; 429 does not enter create-workspace flow; Retry-After and retry state tested |
| Configurable limits and Retry-After | PASS | 2026-11-02 | `npm test`; defaults 1500 IP / 1200 writes / 2400 authenticated reads per 15 min |
| Transaction/ledger restart persistence route regression | PASS | 2026-11-02 | `npm test`; same fixture repositories read through two app instances; not live Supabase |
| Full test suite | PASS | 2026-11-02 | `npm test`: 352/352; migration syntax 21/21 |
| Changed JS syntax and whitespace | PASS | 2026-11-02 | `node --check` changed JS; `git diff --check` |
| Browser full-page/module request counts and real 429 codes | UNVERIFIED | 2026-11-02 | Browser surface unavailable; budget test is a harness, not a browser measurement |
| Existing org transactions/ledger after real server restart and re-login | UNVERIFIED | 2026-11-02 | No live Supabase read or authenticated browser session in this run |

## KNOWN ISSUES AND RISKS
- The 11-call budget test covers modeled unique reads and dedupe behavior; actual total browser calls may include auth/public-config and must be measured in DevTools.
- Actual screenshot root cause is strongly consistent with a burst reaching the IP limiter plus onboarding misclassification, but the exact failing endpoint and 429 error code are not captured. General IP limiter emits `RATE_LIMITED`; user limiter emits `USER_RATE_LIMITED`.
- Request cache is in-memory and short-lived; it never replaces server-side tenant scoping and must be invalidated after mutations.
- Browser verification is required before claiming the incident resolved for the existing Supabase org.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; errors roll everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary user JWT receives 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only and ON DELETE RESTRICT; cleanup journal_entries first, then audit_log, organizations, auth.users, via `scripts/cleanup-phase2-test-data.sql`; reuse fixed named test identities.
- PayPal sandbox buyer must be a US Personal account; seller USD only; use Visa at checkout; webhook URL ends `/api/webhook` and PAYPAL_WEBHOOK_ID matches.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.
- Distinguish source/test evidence from live browser and production database verification.

## DO NOT
- Do not force-push or rewrite history.
- Do not create users/orgs or trigger PayPal/Gemini for these checks.
- Do not weaken tests, remove abuse protection, or treat transient onboarding errors as missing organizations.
- Do not print environment values or secrets.

## RESUME COMMANDS
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
