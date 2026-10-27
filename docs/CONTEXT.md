# NovaPay Fund Wiring Handoff

## HEADER
- Updated: 2026-10-27 Asia/Kolkata.
- Branch: fund-wiring; based on main at 874e2e5; local commits only, never push.
- Phase/task: fund-wiring follow-up; events 503 and AI route badge fixes complete, local commit pending.

## DONE
- STEP 0: `npm ci`; `npm test` PASS 131/131; migrations 0001–0014 parse; server restarted and `/api/status` HTTP 200.
- T1: Fundraising, Maintenance, Transparency views in `src/fund-views.js`; loaded from `dashboard.html`; API data, loading/empty/error states, sample label, role-gated writes.
- T2 fixed-user API: captures completed; ledger balanced; approvals, campaign and transparency reads; AI code answer 12 and LLM route with 3 citations. Maintenance row closed with accepted evidence and SIMULATED payment. No PayPal order created.
- T3: appended real/simulated notes, run steps and 3-minute demo to `README.md`; existing UI sections unchanged.
- T4: `npm test` PASS 131/131; migrations PASS 14 files; `node --check src/fund-views.js` PASS; `git diff --check` PASS; protected-file diff against main empty.

## IN PROGRESS
- Exact task: events API/UI empty-state and AI route badge mapping fixes; local WIP commit created; see `docs/WORKLOG.md` latest entry.
- Edited files: `server/src/routes/status.js`, `server/test/routes.test.js`, `src/novapay-live.js`, `src/dashboard.js`, `docs/CONTEXT.md`, `docs/WORKLOG.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`.
- T2 maintenance lifecycle verifier had a FAIL because the fixed request was already `closed`, while that verifier expected `payment_approved`; existing records were preserved.

## NEXT STEPS
1. Verify status, no `.env` staged/tracked, and commit locally on `fund-wiring`.
2. User can manually confirm the events empty state and AI route/reason badge in browser.

## USER ACTIONS PENDING
- Browser verification: sign in as fixed owner, open Fundraising/Maintenance/Transparency, inspect console and failed requests, switch light/dark, test mobile drawer, verify notifications and AI chat. No exact PDF was present in repo/attachments; the README demo follows the user's described API sequence.

## LIVE STATE
- Prior user-confirmed applied migrations 0001–0014; no migration changed.
- No local server is running now. Historical 503 log is captured from degraded-auth tests; current test fixtures pass. Do not print environment values.
- No PayPal order created. Fixed capture records complete; maintenance request is closed, evidence accepted, payout simulated.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| npm ci | PASS | 2026-10-26 | `npm ci` |
| Unit suite final | PASS 132/132 | 2026-10-27 | `npm test` |
| Migration check final | PASS 14 files | 2026-10-26 | `npm run check:migrations` |
| JavaScript syntax | PASS | 2026-10-26 | `node --check src/fund-views.js` |
| Whitespace | PASS | 2026-10-26 | `git diff --check` |
| Protected files | PASS empty diff | 2026-10-26 | `git diff --stat main -- <protected paths>` |
| Authenticated API/demo | PASS, see TEST-REPORT | 2026-10-26 | fixed-user API calls |
| Maintenance verifier expected state | FAIL | 2026-10-26 | existing row closed, verifier expected payment_approved |
| Browser views/theme/mobile/notifications/chat | UNVERIFIED | 2026-10-26 | manual browser checks pending |
| Exact attached-PDF script | UNVERIFIED | 2026-10-26 | PDF unavailable in repo/attachments |
| Events failure fallback | PASS | 2026-10-27 | `npm test`; route regression test |
| Events 503 cause | Confirmed | 2026-10-27 | degraded-auth log + `foundation.test.js`; `SUPABASE_NOT_CONFIGURED` before route |
| AI route badge field mapping | PASS | 2026-10-27 | `npm test`; frontend reads `response.route` and reason |
| JavaScript syntax/whitespace | PASS | 2026-10-27 | `node --check` on edited JS; `git diff --check` |

## KNOWN ISSUES AND RISKS
- Historical `/api/events` 503 log is from degraded-mode auth (SUPABASE_NOT_CONFIGURED); no live server was running to reproduce another 503. Auth remains fail-closed.
- Browser auth helper has no organization-role accessor; writes require trusted `app_metadata` role, otherwise hidden. API enforces permissions.
- No persisted pre-payment maintenance GET list; requests/contractors/quotes are current-tab state. Some receipt/evidence details are not returned by API and are not fabricated.
- Maintenance payouts and invoice sending are SIMULATED. Not for real money.
- Do not reset the fixed closed maintenance request to satisfy the stale verifier expectation.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; errors roll everything back. Never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated and grant only to service_role; verify ordinary JWT 403.
- PostgREST embeds need explicit FK names with multiple relationships.
- audit_log is insert-only/ON DELETE RESTRICT; cleanup journal_entries, audit_log, organizations, auth.users via `scripts/cleanup-phase2-test-data.sql`; reuse fixed identities.
- PayPal Sandbox buyer is US Personal; seller USD only; webhook ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches.
- Raw body is required for PayPal signature verification.
- Never print `.env` values; record key names only.

## DO NOT
- Never push; commit only on `fund-wiring`. Do not touch protected design files or assets.
- Do not create a PayPal order without approval; never commit `.env`.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short --branch`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
