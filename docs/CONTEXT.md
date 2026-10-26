# NovaPay Fund Wiring Handoff

## HEADER
- Updated: 2026-10-26 Asia/Kolkata.
- Branch: fund-wiring; base main at 874e2e5; local commits only, never push.
- Phase/task: T1 views and T2 API demo complete; T3 README is next.

## DONE
- STEP 0: npm ci; npm test PASS 131/131; migration syntax 0001–0014 PASS; port 3000 server restarted, `/api/status` HTTP 200.
- T1 Fundraising, Maintenance, Transparency views wired in `src/fund-views.js`, included by `dashboard.html`. Existing demo content is labelled in demo mode; live views use APIs and loading/empty/error states.
- T2 fixed-user API: sign-in/status PASS; 2 capture rows COMPLETED; 4 ledger entries/2 captures; USD trial balance balanced; 1 approval/0 pending; 1 campaign, 1 contribution, 1 expense; AI code route 12; AI LLM route returned 3 citations; fixed request closed with accepted evidence appears in transparency as SIMULATED with explicit gaps. No PayPal order created.

## IN PROGRESS
- Exact task: T3 README section and T4 validation/docs/local final commit.
- Edited files: dashboard.html, src/fund-views.js, docs/CONTEXT.md, docs/WORKLOG.md, docs/TEST-REPORT.md, docs/DECISIONS.md.
- T2 maintenance lifecycle verifier FAIL: existing deterministic T3 request is already `closed`, while verifier expects `payment_approved`; it was preserved, not reset. The completion and transparency path passed on this existing closed row.

## NEXT STEPS
1. Inspect README headings and append only non-UI documentation at the end.
2. Add real/simulated distinction, setup key names/tunnel/npm start, and a 3-minute demo script using the existing capture (no new order).
3. Run T4: npm test, migration check, node --check JS, git diff --check, protected-file diff from main.
4. Update continuity docs; commit locally as `Fund views wiring, demo run, README`; never push.

## USER ACTIONS PENDING
- No action needed now. At finish give exact manual browser checks. The referenced 3-minute PDF was not found; the README/demo used the user-listed API steps and existing data.

## LIVE STATE
- Prior handoff records migrations 0001–0014 applied; none changed.
- Port 3000 is running in persistent terminal session 40038; `/api/status` HTTP 200; integrations report configured (no values recorded).
- No PayPal order created. Fixed capture rows are completed; fixed maintenance request is closed with accepted evidence, SIMULATED payment and explicit gaps.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| npm ci | PASS | 2026-10-26 | `npm ci` |
| npm test | PASS 131/131 | 2026-10-26 | `npm test` |
| Migration syntax | PASS 14 files | 2026-10-26 | `npm run check:migrations` |
| API status/restart | PASS HTTP 200 | 2026-10-26 | `npm start`; GET `/api/status` |
| T1 view browser/API runtime | UNVERIFIED | 2026-10-26 | No browser view loaded in this task |
| T2 captures/ledger/approvals/transparency | PASS | 2026-10-26 | Fixed owner API GETs; counts recorded in TEST-REPORT |
| T2 AI code | PASS | 2026-10-26 | `/api/ai/chat`; `code`, answer 12 |
| T2 AI cited LLM | PASS | 2026-10-26 | `/api/ai/chat`; `llm`, 3 citations |
| T2 T3 lifecycle verifier | FAIL | 2026-10-26 | Fixed request already closed, expected payment_approved |
| Exact PDF demo sequence | UNVERIFIED | 2026-10-26 | No PDF found in repo/attachments |

## KNOWN ISSUES AND RISKS
- Auth helper exposes no organization role. Write controls require trusted organization role in app_metadata; otherwise hidden. Backend remains authorization authority.
- No pre-payment maintenance GET list; requests/contractors/quotes created in the current tab are ephemeral. Transparency omits requester/submitter IDs, receipt numbers and evidence file paths; UI states those limits and disables uncertain actions.
- Maintenance payouts are SIMULATED; no money movement or ledger post. No new PayPal order created.
- One earlier combined API probe failed before API status (server exited), and a buffered retry timed out; individual reads/AI were rerun separately and recorded.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; errors roll everything back. Never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated and grant only service_role; verify ordinary JWT 403.
- PostgREST embeds need explicit FK names with multiple relationships.
- audit_log is insert-only/ON DELETE RESTRICT; cleanup journal_entries, audit_log, organizations, auth.users via scripts/cleanup-phase2-test-data.sql; reuse fixed identities.
- PayPal Sandbox buyer is US Personal; seller USD only; webhook ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches.
- Raw body is required for PayPal signature verification.
- Never print `.env` values; record key names only.

## DO NOT
- Never push; commit only on fund-wiring. Do not touch protected design files/assets.
- Do not create a PayPal order without approval or include .env values.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short --branch`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
