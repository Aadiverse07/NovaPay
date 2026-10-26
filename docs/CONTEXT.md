# NovaPay Fund Wiring Handoff

## HEADER
- Updated: 2026-10-26 Asia/Kolkata.
- Branch: fund-wiring; base main at 874e2e5; local commits only, never push.
- Phase/task: T1 complete; T2 API demo in progress; completion verifier PASS and T3 lifecycle mismatch recorded.

## DONE
- STEP 0 PASS: `npm ci`; `npm test` 131/131; migration syntax 0001–0014; server on port 3000 restarted and `/api/status` HTTP 200.
- T1 Fundraising, Maintenance, Transparency views wired in `src/fund-views.js`, loaded by `dashboard.html`; existing demo content remains and is labeled in demo mode; authenticated views use API data and empty/error/loading states.
- Fundraising supports campaign summaries, create, pledge, explicit Sandbox order link and receipt projection; Maintenance supports allowed workflow steps from local API responses and persisted transparency expenses; Transparency shows gaps/approval/payment/ledger/evidence metadata and CSV export.

## IN PROGRESS
- Exact task: T2 run API-level 3-minute demo with fixed named test users and existing data; do not create a PayPal order.
- Files changed: dashboard.html, src/fund-views.js, docs/CONTEXT.md, docs/WORKLOG.md, docs/TEST-REPORT.md, docs/DECISIONS.md.
- T1 implementation code was checkpointed in `87c30e9` and `2a6b2e6`; runtime validation pending T2/T4.

## NEXT STEPS
1. Find the PDF/demo sequence and fixed-user scripts; inspect side effects first.
2. Run read-only API checks for auth/status, capture/ledger/transactions, code + cited LLM, approvals, and existing maintenance transparency data.
3. Record each T2 step PASS/FAIL/UNVERIFIED; no new order or record creation.
4. Update README outside UI sections with real/simulated distinction, run setup and demo script.
5. Run T4 commands, verify protected diff is empty, update docs, commit locally.

## USER ACTIONS PENDING
- None now. At finish list exact manual browser checks (theme, mobile drawer, live views, errors, notifications/AI if available).

## LIVE STATE
- Prior handoff records migrations 0001–0014 applied; none changed.
- Port 3000 server restarted; `/api/status` HTTP 200, authenticated mode; integration configuration flags true, no values recorded.
- No API demo calls run yet. No PayPal order created.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| npm ci | PASS | 2026-10-26 | `npm ci` |
| npm test | PASS 131/131 | 2026-10-26 | `npm test` |
| Migration syntax | PASS 14 files | 2026-10-26 | `npm run check:migrations` |
| API status before/after restart | PASS HTTP 200 | 2026-10-26 | `curl http://127.0.0.1:3000/api/status` |
| T1 view runtime | UNVERIFIED | 2026-10-26 | No view/browser runtime check yet |
| Fixed test user sign-in/API | PASS 3/3 | 2026-10-26 | `node scripts/verify-phase6-maintenance-live.js` fixed roles read campaigns HTTP 200 |
| Fixed T3 maintenance lifecycle | FAIL | 2026-10-26 | `node scripts/verify-phase6-maintenance-live.js`; existing request already `closed`, expected `payment_approved` |
| Fixed T5 completion | PASS | 2026-10-26 | `node scripts/verify-phase6-completion-live.js`; closed, accepted evidence, ordinary RPC 403, no new users/orgs/files |

## KNOWN ISSUES AND RISKS
- Role isn’t exposed by auth helper; write controls require trusted organization role in app_metadata, otherwise hidden. API remains authorization authority.
- No pre-payment maintenance GET list exists; session-created requests/contractors/quotes are ephemeral; imported submitter/requester IDs are withheld and related actions stay disabled.
- Transparency API omits receipt numbers and evidence file paths; UI reports those omissions without fabricating identifiers or links.
- Do not create a PayPal order during demo; maintenance payouts are SIMULATED and do not send money/post a ledger entry.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; errors roll back everything. Never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated and grant only service_role; verify ordinary JWT 403.
- PostgREST embeds need explicit FK names with multiple relationships.
- audit_log is insert-only and ON DELETE RESTRICT; cleanup journal_entries, audit_log, organizations, auth.users via scripts/cleanup-phase2-test-data.sql; reuse fixed test identities.
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
