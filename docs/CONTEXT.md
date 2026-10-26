# NovaPay Phase 6 Handoff

## HEADER
- Updated: 2026-10-26 14:45 Asia/Kolkata.
- Branch: `phase6-backend`; local-only.
- Last commit: `dc77c09 WIP Phase 6 task 5: add completion evidence review`; T5 live completion record is being checkpointed now.
- Phase/task: Phase 6 Fund Transparency, task T6 transparency/export; T5 implementation and live verification complete.

## DONE
- T1–T2: contributions/campaigns and capture accounting; migrations 0006–0008 applied/verified. Capture `0U573441YN817132C` received; receipt/ledger reconcile at 100 minor units. Auditable reversal/repost credits Donations 4100; five exact webhook replays caused no duplicates.
- T3: 0009 applied; maintenance workflow and six service-only RPCs live-verified. Fixed users/org reused; 9999 one approver, 10000 two distinct approvers; self-approval, skipped state, foreign quote, requester verification, duplicate approver rejected.
- T4: migration 0010 user-confirmed and live-visible. Sandbox payout probe returned `PAYOUT_NOT_AVAILABLE`; SIMULATED only. Fixed 9999 request entered existing Approvals queue; approval retry same payment ID; exactly one row; status paid; PayPal/ledger refs null; no provider call.
- T5 implementation: metadata-only completion evidence, reviewer accept/reject, request review/close flow, audit records, structured validation, caution language. Files edited: `supabase/migrations/0011_completion_evidence_review.sql`, `server/src/routes/funds.js`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`, `server/test/phase6-maintenance-evidence.test.js`, `server/test/phase6-migration.test.js`, `server/test/postgres-repos.test.js`, `scripts/verify-phase6-completion-live.js`, `docs/API.md`, `docs/FRONTEND-CONTRACT.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`, `docs/CONTEXT.md`.
- T5 local tests: focused PASS 19/19; `npm run check:migrations` PASS through 0011; `npm test` PASS 124/124. T5 live PASS: migration visible; all 3 RPCs ordinary JWT HTTP 403; direct evidence table write denied; metadata accepted and request closed, no file uploaded.

## IN PROGRESS
- Exact task: implement T6 transparency expense list with explicit gaps, read-only org/campaign transparency, and formula-safe audit CSV export.
- T5 is complete and live-verified using the existing fixed paid request; its metadata/audit rows remain in the test org.
- Files being edited: none for T6 yet; inspect current fund summary/repositories/routes and ledger/export helpers before coding.

## NEXT STEPS
1. Verify branch/status and checkpoint T5 live evidence locally.
2. Inspect existing campaign summaries, maintenance payment/evidence links, RLS and CSV export helpers.
3. Implement T6 expense-link transparency, donor/resident/member read-only endpoint, and audit CSV export.
4. Add tenant/privacy/export tests; update docs; run tests and migration checks.
5. If T6 needs a migration, checkpoint and request user application before live verification; then continue T7.

## USER ACTIONS PENDING
- None. T5 migration 0011 is applied and live verification passed.

## LIVE STATE
- Supabase migrations 0001–0011: confirmed applied and live-verified.
- Tunnel/webhook fixed; T2 capture and five exact replays passed.
- Fixed T3/T4 rows and append-only audit records remain in `NovaPay Phase 3 Verification A`; T4 request is paid/SIMULATED. Reuse it.
- Last live check: T5 PASS on 2026-10-26; accepted metadata evidence and request closed, with 3 RPC 403s and direct insert denied.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Status | Date | Command/result |
|---|---|---|---|
| T2 capture/reconciliation/replay | PASS | 2026-10-26 | Receipt/ledger reconcile; 5 replays, no duplicates |
| T3 live lifecycle and RPC denial | PASS | 2026-10-26 | Thresholds/rejections; 6/6 ordinary JWTs HTTP 403 |
| T4 live payment/idempotency | PASS | 2026-10-26 | One SIMULATED payment; repeated decision same ID; no ledger/provider refs |
| T5 focused tests | PASS | 2026-10-26 | 19/19 |
| Migration syntax | PASS | 2026-10-26 | `npm run check:migrations`; 0001–0011 |
| Full suite | PASS | 2026-10-26 | `npm test`; 124/124 |
| T5 live | PASS | 2026-10-26 | 3 RPC 403s; direct insert denied; accepted evidence; close stamps verified |

## KNOWN ISSUES AND RISKS
- T4 simulated payments are workflow-complete but do not represent cash movement; no ledger entry or PayPal payout exists.
- Live T5 verification appended fixed metadata and audit entries; audit rows are intentionally retained.
- Prior failed test attempts remain append-only in TEST-REPORT; corrected passing runs follow them.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only service_role; prove ordinary-user JWT gets 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup deletes journal_entries first, then audit_log, organizations, auth.users using `scripts/cleanup-phase2-test-data.sql`. Reuse fixed named test users/orgs.
- PayPal Sandbox buyer must be US Personal; seller USD only; use Visa at checkout; webhook URL ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches.
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
