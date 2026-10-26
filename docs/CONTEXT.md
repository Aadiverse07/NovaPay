# NovaPay Phase 6 Handoff

## HEADER
- Updated: 2026-10-26 15:20 Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Last commit: `a9a3960 WIP Phase 6 task 4: plan simulated payment queue` (T4 implementation is currently uncommitted).
- Phase/task: Phase 6 Fund Transparency, task T4; simulated payment queue implementation complete locally, live verification pending.

## DONE
- T1–T2: contributions/campaigns and capture accounting implemented, migrations 0006–0008 applied and verified. Capture `0U573441YN817132C` received; receipt and ledger reconcile at 100 minor units. Auditable reversal/repost credits Donations (4100); five exact webhook replays caused no duplicates.
- T3: migration 0009 applied; maintenance lifecycle and service-only RPCs verified. Fixed users/org reused; 9999 uses one approver, 10000 uses two distinct approvers. Self approval, skipped state, foreign quotation, requester verification and duplicate approver rejected. Both requests reached `payment_approved`; no PayPal transaction.
- T4 design: official PayPal Payouts Sandbox probe returned HTTP 403 `PAYOUT_NOT_AVAILABLE`; selected SIMULATED-only mode with explicit no-ledger gap. No payout batch or money movement.
- T4 implementation: `supabase/migrations/0010_simulated_maintenance_payments.sql`, `server/src/routes/funds.js`, `server/src/routes/approvals.js`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/test/phase6-maintenance-payment.test.js`, `server/test/phase6-migration.test.js`, `server/test/postgres-repos.test.js`, `docs/API.md`, `scripts/verify-phase6-payment-live.js`.
- T4 locally: focused tests PASS 17/17; `npm run check:migrations` PASS 0001–0010; `npm test` PASS 121/121; live verifier syntax PASS.

## IN PROGRESS
- Exact task: verify user-reported applied migration 0010 is visible, then exercise maintenance payment request through the existing Approvals queue, approve once, retry the same approval, and verify exactly one SIMULATED payment with null PayPal/ledger refs.
- Files being edited: none at this moment; all T4 code/docs above are staged for checkpoint, live verification script is ready. After live run, update `docs/WORKLOG.md`, `docs/TEST-REPORT.md`, and this file with exact outcome.
- Remaining: checkpoint; run `node scripts/verify-phase6-payment-live.js`; confirm T4 live persistence/idempotency; continue to T5 only after T4 complete.

## NEXT STEPS
1. Verify `git branch --show-current` is `phase6-backend`; check status and make local WIP checkpoint (never push).
2. Run `node scripts/verify-phase6-payment-live.js`; use only existing named fixtures and do not print credentials/JWTs.
3. Confirm live 0010 column visibility, queue item, SIMULATED decision, repeat decision same payment ID, exactly one payment row, null PayPal/ledger refs and request status `paid`.
4. Append exact live result to `docs/TEST-REPORT.md` and `docs/WORKLOG.md`; update this handoff; checkpoint locally.
5. Continue Phase 6 T5 from the original prompt.

## USER ACTIONS PENDING
- None. User confirmed migration 0010 applied; verifier will perform a read-only visibility check before any mutation.

## LIVE STATE
- Supabase migrations 0001–0009: confirmed applied; 0010: user reports applied, visibility verification pending.
- Tunnel/webhook: previously fixed; T2 capture and five exact replays passed.
- T3 live fixture: fixed contractor, two requests, quotations, approvals and audit entries remain in `NovaPay Phase 3 Verification A`; reuse, do not recreate.
- Last live test: T3 lifecycle PASS on 2026-10-26; no T4 live payment yet.
- T4 Sandbox: OAuth scope included Payouts; payout POST rejected with `PAYOUT_NOT_AVAILABLE`; no payout batch created.
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
| T4 live flow | UNVERIFIED | 2026-10-26 | `node scripts/verify-phase6-payment-live.js` not yet run |

## KNOWN ISSUES AND RISKS
- T4 locally marks simulated payment status `paid` for workflow demonstration; response and row explicitly say SIMULATED and have null provider/ledger references. It represents approved workflow completion, not a cash movement.
- Fixed T3 verifier data and append-only audit records remain in the dedicated org; reuse deterministic rows.
- Earlier worklog/report preserve failed attempts and a shell-interpolation transcript; append-only corrections explain accurate outcomes. No secret values were intentionally emitted.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant it only to service_role; prove it by calling with an ordinary user JWT (expect 403).
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup deletes journal_entries first, then audit_log, organizations, auth.users using `scripts/cleanup-phase2-test-data.sql`. Reuse fixed named test users/orgs.
- PayPal Sandbox buyer must be a US Personal account; seller USD only; use the Visa card at checkout; webhook URL ends in `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches it.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Never push or commit to `main`/`backend`; remain on `phase6-backend`.
- Do not use `--force`, `npm audit fix --force`, weaken tests, edit applied migrations, or commit `.env`.
- Do not touch protected frontend/design files: tokens/base/fonts/preset/theme, hero/fx/logo-intro/capabilities-zoom/cta-reveal/novapay-logo files, or assets.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
