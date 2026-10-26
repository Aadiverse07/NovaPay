# NovaPay Phase 6 Handoff

## HEADER
- Updated: 2026-10-26 (Asia/Kolkata)
- Branch: `phase6-backend`
- Last commit: `01e09a6 WIP Phase 6 task 3: preflight live fixture auth`.
- Phase/task: Phase 6 Fund Transparency, T3 maintenance workflow; live apply gate cleared; full live workflow verification pending.

## DONE
- T1 contributions/campaigns and T2 capture accounting implemented, migrated, and verified. Capture event `0U573441YN817132C` received; receipt and ledger reconcile at 100 minor units. Original journal retained; reversal/repost credits 4100 Donations. Five exact webhook replays created no duplicates.
- T3 routes, repositories, service-only RPCs, migration 0009 and tests implemented: `server/src/routes/funds.js`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/test/phase6-maintenance.test.js`, `server/test/phase6-migration.test.js`, `supabase/migrations/0009_maintenance_state_machine.sql`; live verifier: `scripts/verify-phase6-maintenance-live.js`.
- T3 local tests: focused 8/8 PASS; full suite 117/117 PASS; PostgreSQL 17 migration parser accepts 0001–0009.
- User confirmed migration 0009 applied. Live API returned 200; selecting `maintenance_requests.requested_by` returned 200. Existing fixed Phase 3 owner/approver/accountant/viewer roles found. Ordinary owner JWT denied by all six 0009 RPCs (HTTP 403 each; first two probes corrected after an argument-name mismatch; no DB writes).

## IN PROGRESS
- Exact task: verify live T3 maintenance request → quotation → scope approval → contractor verification → payment approval using existing fixed Phase 3 org and user fixtures.
- Planned live test records: deterministic names in existing verifier organization; inspect before create to allow safe resume. No new users or organizations.
- Live preflight found and fixed T3 SQLSTATE handling in `server/src/routes/funds.js`; focused test `server/test/phase6-maintenance-route-errors.test.js` confirms safe 4xx mapping. Full suite now 118/118 PASS.
- Files being edited next: a fresh local server/API verification only; no further code edits unless live verification exposes a defect.
- Left: verify self-approval, skipped-state, foreign quotation, requester verification rejection, distinct approvers at threshold, API persisted state; log live results and checkpoint; then continue to T4 per Phase 6 prompt.

## NEXT STEPS
1. Run authenticated T3 lifecycle with fixed owner, approver, and accountant fixtures in `NovaPay Phase 3 Verification A`; use deterministic record identifiers and resumable state checks.
2. Verify rejections for requester self-approval, invalid state skipping, and quotation belonging to another request; verify two distinct approvers required at 10,000 minor units.
3. Append exact results to TEST-REPORT/WORKLOG and update CONTEXT/DECISIONS; checkpoint locally after 2–3 actions.
4. Continue to Phase 6 T4.

## USER ACTIONS PENDING
- None for T3 migration; user confirmed 0009 applied.

## LIVE STATE
- Supabase migrations 0001–0008: previously applied. 0009: user-confirmed applied; `requested_by` live schema verified. T3 lifecycle behavior pending.
- Tunnel/webhook: previously fixed; Phase 6 T2 capture and five replay checks passed. No current webhook event pending.
- Last live check: 2026-10-26 API health/schema and ordinary-JWT 403 permission probes; no writes.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Status | Date | Command/result |
|---|---|---|---|
| T2 webhook capture/replay | PASS | 2026-10-26 | Stored event verified; 5 replays; no duplicates |
| T3 focused | PASS | 2026-10-26 | 8/8 tests |
| T3 full regression | PASS | 2026-10-26 | `npm test`: 118/118; migrations 0001–0009 |
| T3 migration parse | PASS | 2026-10-26 | `npm run check:migrations` |
| T3 live schema/API preflight | PASS | 2026-10-26 | API 200; `requested_by` query 200 |
| T3 ordinary JWT RPC denial | PASS | 2026-10-26 | Six RPC probes HTTP 403 |
| T3 domain error mapping | PASS | 2026-10-26 | focused test covers 5 SQLSTATEs; full `npm test` 118/118 |
| T3 live workflow | UNVERIFIED | 2026-10-26 | Verifier syntax PASS; authenticated API lifecycle and edge cases pending |

## KNOWN ISSUES AND RISKS
- Live T3 state transitions and threshold behavior are not yet verified.
- Audit rows are append-only and restrict deletion; test setup must use only fixed verifier data and deterministic labels.
- Keep legacy maintenance statuses intact; use the new T3 transition RPCs.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; a syntax or runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant it only to service_role; prove it by calling with an ordinary user JWT (expect 403).
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only and has ON DELETE RESTRICT; test cleanup must delete journal_entries first (lines go with them), then audit_log, organizations, auth.users, by a manual SQL script (`scripts/cleanup-phase2-test-data.sql`). Reuse fixed named test users/orgs; do not create new ones on every run.
- PayPal sandbox buyer must be a US Personal account; seller USD only; use the Visa card at checkout; webhook URL must end in `/api/webhook` and `PAYPAL_WEBHOOK_ID` must match that webhook.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Do not push. Do not commit to `backend` or `main`. Do not use `--force` or `npm audit fix --force`.
- Do not weaken tests, edit applied migrations, commit `.env`, or touch protected frontend/design files.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
