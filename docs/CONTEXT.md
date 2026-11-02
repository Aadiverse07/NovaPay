# NovaPay Context

## HEADER
- Date/time: 2026-11-02 17:19 IST
- Branch: `codex/voice-assistant`
- Pre-change checkpoint: `39a6cc9`; incident implementation is committed locally (hash recorded in WORKLOG).
- Current phase/task: refresh stability fixes and handoff docs merged into origin/main; browser verification remains pending.

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
- Integration merge completed with no conflicts. The strict scan found no long token patterns and no values from local `.env`; short dummy test fixtures were reviewed as test-only.
- Live browser request counts/statuses and actual Supabase persistence after server restart/sign-out/sign-in remain unverified; automated fixture test is not a live DB check.

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
