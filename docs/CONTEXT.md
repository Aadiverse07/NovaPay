# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-26 (Asia/Kolkata).
- Branch: `phase6-backend` (verified; local-only work).
- Last task checkpoint: `92525db WIP Phase 6 task 1: fund transparency schema`.
- Current phase/task: Phase 6 Fund Transparency, T1 applied and live-verified; T2 contributions implementation is next.

## DONE
- STEP 0 complete and locally checkpointed as `7ac6c65`: dependency install, baseline tests and migration parse passed.
- Confirmed existing baseline had migrations 0001–0005; none edited.
- Created migration `supabase/migrations/0006_fund_transparency.sql` with tenant-scoped campaign, contribution, receipt, allocation, contractor, maintenance, quotation, approval, evidence, payment, and settings tables; role extension; RLS/read-only grants; default settings seeding.
- Added static migration checks in `server/test/phase6-migration.test.js`.

## IN PROGRESS
- T1 migration 0006 applied and verified live: fixed owner JWT read all 11 new tables (200); direct POST write attempts denied on all 11 (403). No fixture data changed.
- Edited files: `supabase/migrations/0006_fund_transparency.sql`, `server/test/phase6-migration.test.js`, `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`.
- T1 live check complete. Next inspect webhook/PayPal posting repositories, then implement T2 verified-capture contribution receipt persistence, campaign summary, unit/integration tests, and continuity updates. Never edit migration 0006.

## NEXT STEPS
1. Inspect existing PayPal webhook processor, capture posting path, and repository/test fixtures.
2. Implement T2: pledge and contribution reference linkage; verified posted captures only; idempotent receipt; amount mismatch flagged; SQL-computed campaign summary.
3. Add tests, run/checkpoint T2, then move to T3 in prompt order.

## USER ACTIONS PENDING
- None; user confirmed migration 0006 is applied.

## LIVE STATE
- Real Supabase: user-reported migrations 0001 and 0002 applied; migrations 0003–0005 previously reported applied in project context; migration 0006 applied (user confirmed 2026-10-26); direct verification pending.
- Tunnel/webhook: previously user-reported configured; no new live verification in Phase 6.
- Last live tests: prior session reported fixed-user auth and read APIs; no Phase 6 live API checks run.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| STEP 0 npm ci | PASS | 2026-10-25 | 89 added; 90 audited; 0 vulnerabilities; postinstall warning recorded |
| Baseline npm test | PASS | 2026-10-25 | 104 passed, 0 failed, 0 skipped; migrations 0001–0005 parsed |
| Baseline migration parse | PASS | 2026-10-25 | `npm run check:migrations`; 0001–0005 |
| T1 `npm test` | PASS | 2026-10-25 | Migration 0001–0006 parsed; 106 passed, 0 failed, 0 skipped |
| T1 `npm run check:migrations` | PASS | 2026-10-25 | Migrations 0001–0006 parse as PostgreSQL 17 SQL/PLpgSQL |
| T1 `git diff --check` | PASS | 2026-10-25 | No whitespace errors |
| T1 live Supabase/RLS ordinary-user JWT | PASS | 2026-10-26 | 11/11 reads 200; 11/11 writes denied 403 |
| Frontend scope | PASS | 2026-10-25 | No changed paths under `preview.html`, `dashboard.html`, `src/`, or `assets/` |

## KNOWN ISSUES AND RISKS
- Real schema state is based on user report; T1 live RLS/ordinary JWT proof must follow after user applies 0006.
- `fund_transparency_settings` defaults to one quotation and 10,000 USD cents; rows are seeded for existing organizations and created on new organizations.
- Funds, charitable collections, third-party payouts, and legal eligibility vary by PayPal product and jurisdiction; only Sandbox flows are in scope.
- Receipts/evidence do not imply donor identity or completion quality.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; a syntax/runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove it with an ordinary-user JWT (expect 403).
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; test cleanup deletes journal_entries first (lines cascade), then audit_log, organizations, auth.users, using `scripts/cleanup-phase2-test-data.sql`. Reuse fixed test users/orgs.
- PayPal Sandbox buyer must be a US Personal account; seller USD only; use Visa at checkout; webhook URL ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches that webhook.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.
- Pledges are intent only; only verified, posted captures count as received donations. Simulated payments do not enter the real ledger.
- Every expense needs a visible path to approval, quotation/invoice, payment, ledger entry, and completion evidence; report each absent link explicitly.

## DO NOT
- Never push, use `--force`, weaken tests, edit applied migrations, commit `.env`, or print secrets.
- Stay on `phase6-backend`; never commit/push to `backend` or `main`.
- Do not edit frontend files (`preview.html`, `dashboard.html`, `src/`, `assets/`).
- Do not call PayPal Payouts/Invoicing or create a donation before the prompt's gates and human steps.
- Do not create new test users/orgs on each run; reuse fixed fixtures and clean only owned data.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
