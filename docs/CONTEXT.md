# NovaPay Fund Wiring Handoff

## HEADER
- Updated: 2026-10-26 Asia/Kolkata.
- Branch: fund-wiring; base main at 874e2e5; local commits only, never push.
- Phase/task: T1–T3 complete; T4 final validation is next.

## DONE
- STEP 0: npm ci; npm test PASS 131/131; migrations 0001–0014 parse; server restarted, `/api/status` HTTP 200.
- T1 Fundraising/Maintenance/Transparency views implemented in `src/fund-views.js`, loaded by `dashboard.html`; demo sample content labelled; live data uses APIs and loading/empty/error states.
- T2 fixed-user API: 2 completed capture rows; 4 ledger entries/2 capture entries; USD trial balance balanced; approvals 1/0 pending; 1 campaign/contribution/expense; AI code answer 12; LLM 3 citations; closed maintenance row with accepted evidence appears in transparency as SIMULATED with explicit gaps. No PayPal order created.
- T3 README appended real/simulated explanation, key names/run/tunnel steps, and a 3-minute demo using existing records; no existing UI section changed.

## IN PROGRESS
- Exact task: T4 run requested validation, update final docs and commit locally.
- Edited files: README.md, dashboard.html, src/fund-views.js, docs/CONTEXT.md, docs/WORKLOG.md, docs/TEST-REPORT.md, docs/DECISIONS.md.
- T2 fixed T3 lifecycle verifier FAIL: request already `closed`, expected `payment_approved`; preserved existing data. Completion and transparency checks passed.

## NEXT STEPS
1. Run `npm test` and record exact count/result.
2. Run `npm run check:migrations`.
3. Run `node --check src/fund-views.js`.
4. Run `git diff --check` and `git diff --stat main -- <protected paths>`; protected diff must be empty.
5. Update CONTEXT/WORKLOG/TEST-REPORT/DECISIONS, then commit locally as `Fund views wiring, demo run, README`.

## USER ACTIONS PENDING
- Browser checks listed at finish. Exact referenced 3-minute PDF was not found; README uses the user-listed API steps and existing data.

## LIVE STATE
- Prior handoff records migrations 0001–0014 applied; none changed.
- Persistent server session 40038 serves port 3000; `/api/status` HTTP 200; no key values recorded.
- No PayPal order created; fixed capture rows completed; fixed maintenance request closed with accepted evidence and SIMULATED payment.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| npm ci | PASS | 2026-10-26 | `npm ci` |
| npm test baseline/final | PASS 131/131 | 2026-10-26 | `npm test` twice; final after T1–T3 |
| Migration baseline/final | PASS 14 files | 2026-10-26 | `npm run check:migrations` twice; final after T1–T3 |
| Authenticated read APIs | PASS | 2026-10-26 | fixed owner; captures, ledger, approvals, funds/transparency HTTP 200 |
| AI code route | PASS | 2026-10-26 | `/api/ai/chat`; code result 12 |
| AI cited LLM | PASS | 2026-10-26 | `/api/ai/chat`; llm, 3 citations |
| Fixed T3 lifecycle verifier | FAIL | 2026-10-26 | fixture already closed; expected payment_approved |
| Maintenance transparency | PASS | 2026-10-26 | closed; evidence accepted; SIMULATED and explicit gaps |
| README scope/whitespace | PASS | 2026-10-26 | appended-only diff and `git diff --check` |
| Browser views | UNVERIFIED | 2026-10-26 | Not opened in browser |
| Exact PDF demo sequence | UNVERIFIED | 2026-10-26 | No PDF in repo/attachments |

## KNOWN ISSUES AND RISKS
- Browser auth helper has no organization role accessor; controls require trusted organization role in app_metadata, otherwise hidden. Server enforces permissions.
- No pre-payment maintenance GET list; current-tab requests/contractors/quotes are ephemeral. API omits receipt IDs, requester/submitter identity, evidence file paths; UI states limits and disables uncertain actions.
- Maintenance payouts and invoice sends are SIMULATED. No PayPal order created.
- T3 lifecycle script failed because the fixed request was already closed; do not reset it.

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
