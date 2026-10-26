# NovaPay Phase 6 Handoff

## HEADER
- Updated: 2026-10-26 14:30 Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Last commit: `b1c9ebd WIP Phase 6 task 4: implement simulated maintenance payments`; diagnostics/doc updates are uncommitted.
- Phase/task: Phase 6 Fund Transparency, task T4; local implementation complete, live verification paused at migration apply gate.

## DONE
- T1–T2: contributions/campaigns and capture accounting implemented; migrations 0006–0008 applied and verified. Capture `0U573441YN817132C` received; receipt and ledger reconcile at 100 minor units. Auditable reversal/repost credits Donations (4100); five exact webhook replays caused no duplicates.
- T3: migration 0009 applied; maintenance lifecycle/service-only RPCs verified. Fixed users/org reused; 9999 uses one approver, 10000 uses two distinct approvers. Self approval, skipped state, foreign quote, requester verification, duplicate approver rejected. Both requests reached `payment_approved`; no PayPal transaction.
- T4: PayPal Payouts Sandbox returned HTTP 403 `PAYOUT_NOT_AVAILABLE`; selected SIMULATED-only mode, explicit no-ledger gap. No payout batch or money moved.
- T4 local code/docs: `supabase/migrations/0010_simulated_maintenance_payments.sql`, `server/src/routes/funds.js`, `server/src/routes/approvals.js`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/test/phase6-maintenance-payment.test.js`, `server/test/phase6-migration.test.js`, `server/test/postgres-repos.test.js`, `docs/API.md`, `scripts/verify-phase6-payment-live.js`.
- T4 local tests: focused 17/17 PASS; `npm run check:migrations` accepted 0001–0010; `npm test` 121/121 PASS; verifier syntax PASS.
- Live T4 preflight: fixed user magic-link auth, fixed org membership, and existing 9999 request eligibility all passed. No payment/approval write was attempted.

## IN PROGRESS
- Exact task: complete T4 live verification after migration 0010 is visible on the configured Supabase project.
- Files in latest edit: `scripts/verify-phase6-payment-live.js`, `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`, `docs/WORKLOG.md`.
- Last live read-only check: `approvals.fund_maintenance_request_id` query returned HTTP 400, SQLSTATE `42703`, `column approvals.fund_maintenance_request_id does not exist`. User earlier said applied, but configured project does not expose the column. No T4 payment request, approval, or mutation occurred.
- Left: human applies migration 0010 to the correct project; then rerun verifier, confirm one SIMULATED payment, idempotent retry, null PayPal/ledger refs and request `paid`; update reports and continue T5.

## NEXT STEPS
1. Human: open the Supabase project configured for this workspace, select **SQL Editor** → **New query**.
2. Paste the complete contents of `supabase/migrations/0010_simulated_maintenance_payments.sql` and run it once. The configured project currently returns 42703 for its first added column, so the migration did not reach this schema.
3. In the same SQL Editor, verify with: `select column_name from information_schema.columns where table_schema='public' and table_name='approvals' and column_name='fund_maintenance_request_id';` Expected: one row.
4. Reply `applied` after the migration and verification query succeed.
5. Agent: run `node scripts/verify-phase6-payment-live.js`; it uses only the existing fixed fixtures, writes only the SIMULATED queue/payment rows, and makes no PayPal call.
6. Record live result in TEST-REPORT/WORKLOG/CONTEXT, checkpoint locally, then proceed to T5.

## USER ACTIONS PENDING
- Apply migration 0010 in the Supabase project configured by this workspace. Exact steps and verification SQL are in NEXT STEPS above. Then reply `applied`.
- No other human action pending. Do not repeat the live verifier before schema verification succeeds.

## LIVE STATE
- Supabase migrations 0001–0009: confirmed applied. Migration 0010: source exists and user reported applied, but configured project's PostgREST lacks `approvals.fund_maintenance_request_id` (HTTP 400 / SQLSTATE 42703); treat as NOT APPLIED here until verified.
- Tunnel/webhook: previously fixed; T2 capture and five exact replays passed.
- T3 fixture data and audit rows remain in `NovaPay Phase 3 Verification A`; reuse, do not recreate.
- Last live test: T4 schema preflight FAIL (read-only); no T4 payment mutation. Last completed live flow: T3 PASS on 2026-10-26.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Status | Date | Command/result |
|---|---|---|---|
| T2 capture/reconciliation/replay | PASS | 2026-10-26 | Receipt/ledger reconcile; 5 replays, no duplicates |
| T3 live workflow | PASS | 2026-10-26 | Below/exact threshold and rejection cases |
| T3 ordinary JWT RPC denial | PASS | 2026-10-26 | 6/6 HTTP 403 |
| T4 focused tests | PASS | 2026-10-26 | 17/17 |
| Migration syntax | PASS | 2026-10-26 | `npm run check:migrations`; 0001–0010 |
| Full suite | PASS | 2026-10-26 | `npm test`; 121/121 |
| T4 live migration visibility | FAIL | 2026-10-26 | Read-only PostgREST; 42703 column missing |
| T4 live payment/idempotency | UNVERIFIED | 2026-10-26 | Stopped before any payment write |

## KNOWN ISSUES AND RISKS
- Live T4 blocker: migration 0010 is absent from the configured project schema despite prior user confirmation; do not attempt RPC/payment writes before column verification.
- T4 locally marks approved simulated payments `paid` for workflow demonstration; response/row state SIMULATED, provider/ledger refs null, no cash movement.
- Fixed T3 verifier data and append-only audit entries remain in the dedicated organization.
- Older worklog/report entries retain failed attempts and a shell-interpolation transcript; later append-only corrections identify accurate results. No secrets were intentionally emitted.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant it only to service_role; prove ordinary-user JWT gets 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup deletes journal_entries first, then audit_log, organizations, auth.users using `scripts/cleanup-phase2-test-data.sql`. Reuse fixed named test users/orgs.
- PayPal Sandbox buyer must be US Personal; seller USD only; use Visa at checkout; webhook URL ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches it.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Never push or commit to `main`/`backend`; remain on `phase6-backend`.
- No `--force`, `npm audit fix --force`, weakened tests, edits to applied migrations, or `.env` commits.
- Do not touch protected frontend/design files: tokens/base/fonts/preset/theme, hero/fx/logo-intro/capabilities-zoom/cta-reveal/novapay-logo files, or assets.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
