# NovaPay Phase 6 Handoff

## HEADER
- Updated: 2026-10-26 14:30 Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Last commit: `e1fc6d9 WIP Phase 6 task 4: record migration visibility blocker`; T4 live PASS documentation is being checkpointed now.
- Phase/task: Phase 6 Fund Transparency, task T5; T4 implementation and live verification complete.

## DONE
- T1–T2: contributions/campaigns and capture accounting implemented; migrations 0006–0008 applied and verified. Capture `0U573441YN817132C` received; receipt and ledger reconcile at 100 minor units. Auditable reversal/repost credits Donations (4100); five exact webhook replays caused no duplicates.
- T3: migration 0009 applied; maintenance lifecycle/service-only RPCs verified. Fixed users/org reused; 9999 uses one approver, 10000 uses two distinct approvers. Self approval, skipped state, foreign quote, requester verification, duplicate approver rejected. Both requests reached `payment_approved`; no PayPal transaction.
- T4: PayPal Payouts Sandbox returned HTTP 403 `PAYOUT_NOT_AVAILABLE`; selected SIMULATED-only mode, explicit no-ledger gap. No payout batch or money moved.
- T4 local code/docs: `supabase/migrations/0010_simulated_maintenance_payments.sql`, `server/src/routes/funds.js`, `server/src/routes/approvals.js`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/test/phase6-maintenance-payment.test.js`, `server/test/phase6-migration.test.js`, `server/test/postgres-repos.test.js`, `docs/API.md`, `scripts/verify-phase6-payment-live.js`.
- T4 local tests: focused 17/17 PASS; `npm run check:migrations` accepted 0001–0010; `npm test` 121/121 PASS; verifier syntax PASS.
- Live T4 verification: fixed user magic-link auth, org membership, and existing 9999 request eligibility passed; queue request and decision created exactly one SIMULATED payment; retry was idempotent.

## IN PROGRESS
- Exact task: inspect existing completion-evidence schema/routes; implement T5 metadata submission and reviewer review/close flow with clear non-proof language.
- Files being edited: none yet. Last completed files: migration 0010, funds/approvals routes and repositories, tests, API docs, and T4 live verifier.
- T4 live: after user applied migration, 0010 column visibility passed; existing request entered the Approvals queue, was approved SIMULATED, retry returned the same payment ID, one row persisted, request is `paid`, PayPal/ledger refs are null; no PayPal call or new users/orgs.
- Left: T5 implementation/tests/docs and its live verification after any needed migration apply.

## NEXT STEPS
1. Inspect existing evidence schema and T5 route/repository coverage.
2. Add metadata-only evidence submission, reviewer-only review/close actions, audit entries, route docs, and tests; create an additive migration only if the schema needs changes.
3. Run focused/full tests and migration checks, then live-verify with existing fixed fixtures and user-applied migration if required.
4. Update TEST-REPORT/WORKLOG/CONTEXT and checkpoint locally before continuing to T6.

## USER ACTIONS PENDING
- None at present. Migration 0010 is visible and T4 live verification passed.

## LIVE STATE
- Supabase migrations 0001–0010: confirmed applied and live-visible. Migration 0010: user-confirmed and live visibility verified after rerun.
- Tunnel/webhook: previously fixed; T2 capture and five exact replays passed.
- T3 fixture data and audit rows remain in `NovaPay Phase 3 Verification A`; reuse, do not recreate.
- Last live test: T4 PASS on 2026-10-26; one SIMULATED payment, same ID on retry, no ledger/provider refs.
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
| T4 initial migration visibility probe | FAIL (superseded) | 2026-10-26 | 42703 before user reapplied 0010 |
| T4 live payment/idempotency | PASS | 2026-10-26 | Fixed existing request; one row; retry same ID; no ledger/provider refs |

## KNOWN ISSUES AND RISKS
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
