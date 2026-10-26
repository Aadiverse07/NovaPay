# NovaPay Phase 6 Handoff

## HEADER
- Updated: 2026-10-26 (Asia/Kolkata)
- Branch: `phase6-backend`, local-only.
- Last commit: `4db25b0 WIP Phase 6 task 3: record live workflow pass`; T4 preflight checkpoint pending.
- Phase/task: Phase 6 Fund Transparency; T1–T3 complete; current task T4 payment gate discovery.

## DONE
- T1 contributions/campaigns and T2 capture accounting implemented, migrated, and verified. Capture `0U573441YN817132C` received; receipt and ledger reconcile at 100 minor units. Original journal retained; auditable reversal/repost credits 4100 Donations. Five exact webhook replays caused no duplicates.
- T3 code: `server/src/routes/funds.js`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/test/phase6-maintenance.test.js`, `server/test/phase6-maintenance-route-errors.test.js`, `server/test/phase6-migration.test.js`, `supabase/migrations/0009_maintenance_state_machine.sql`, `scripts/verify-phase6-maintenance-live.js`.
- 0009 applied per user; live query confirmed `requested_by` schema. All six T3 RPC calls denied ordinary owner JWT (HTTP 403).
- T3 live: fixed owner/approver/accountant users in existing Phase 3 verifier org authenticated; no users/orgs provisioned. Fixed contractor and two deterministic maintenance requests/quotes reused. 9999 minor units completed with one approval; exactly 10000 required two distinct approvals. Self-approval, skipped state, foreign quote, requester verification, and duplicate approval rejected. Both requests reached `payment_approved`; no PayPal transaction.
- T3 tests: focused route mapping 1/1; `npm test` 118/118; migration parser accepted 0001–0009.

## IN PROGRESS
- Exact next task: check current official PayPal Payouts Sandbox capability docs, then map existing payment, approval, and ledger code to T4 requirements.
- Files edited in T3: `server/src/routes/funds.js`, `server/test/phase6-maintenance-route-errors.test.js`, `scripts/verify-phase6-maintenance-live.js`, `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`, `docs/WORKLOG.md`.
- T3 verifier output journals each API operation and reuses deterministic names; existing live verification rows are append-only and remain in the fixed verifier organization.

## NEXT STEPS
1. Run deterministic $0.01 Sandbox Payouts probe to the fixed personal test receiver; output status only.
2. Based on result, choose REAL behind a flag or SIMULATED with no ledger entry; record in DECISIONS.md.
2. Inspect T4 payment/approval/ledger schema and routes; define the minimum additive implementation.
2. Update WORKLOG before/after each action; update the resume pointer each step.
3. Implement only the authorized T4 scope, add focused coverage, run relevant checks, and append exact test outcomes.
4. WIP checkpoint every 2–3 steps; verify branch and no `.env`; never push.

## USER ACTIONS PENDING
- None for T1–T3. No migration apply gate is currently pending.

## LIVE STATE
- Supabase migrations 0001–0009: user-confirmed applied; 0009 schema/permissions/workflow live checks passed.
- Tunnel/webhook: previously fixed; T2 capture and five exact replay checks passed; no pending event.
- Live T3 test data: deterministic contractor, two requests and two quotations in `NovaPay Phase 3 Verification A`; audit entries remain intentionally retained.
- Last live check: 2026-10-26 T3 authenticated API lifecycle, final statuses and threshold approvals verified.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Status | Date | Command/result |
|---|---|---|---|
| T2 capture/reconciliation/replay | PASS | 2026-10-26 | Capture and receipt reconcile; 5 replays, no duplicates |
| T3 focused workflow | PASS | 2026-10-26 | 8/8 |
| T3 SQLSTATE route mapping | PASS | 2026-10-26 | 1/1; five SQLSTATEs return safe structured errors |
| Full regression | PASS | 2026-10-26 | `npm test`: 118/118; migrations 0001–0009 parsed |
| T3 schema/API preflight | PASS | 2026-10-26 | API 200; `requested_by` query 200 |
| T3 ordinary JWT RPC denial | PASS | 2026-10-26 | 6/6 HTTP 403 |
| T3 live workflow | PASS | 2026-10-26 | Below/exact threshold transitions and rejection cases verified |

## KNOWN ISSUES AND RISKS
- Fixed T3 verifier data and append-only audit records remain in the dedicated Phase 3 verifier org; reuse these deterministic rows on reruns.
- Some earlier report entries preserve failed attempts and a raw transcript caused by shell interpolation; later append-only corrections identify the accurate outcomes. No secrets were printed.
- Official PayPal docs show Sandbox Payouts support; OAuth token has Payouts scope. A deterministic $0.01 Sandbox payout probe is pending to confirm this app can execute; no payout sent yet.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant it only to service_role; prove ordinary user JWT gets 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only and ON DELETE RESTRICT; test cleanup must delete journal_entries first (lines go with them), then audit_log, organizations, auth.users, via `scripts/cleanup-phase2-test-data.sql`. Reuse fixed named test users/orgs; do not create new ones on every run.
- PayPal sandbox buyer must be US Personal; seller USD only; Visa card at checkout; webhook URL ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Never push. Never commit to `backend` or `main`. No `--force`, `npm audit fix --force`, weakened tests, edits to applied migrations, `.env` commits, or protected frontend/design files.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
