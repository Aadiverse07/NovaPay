# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-25 Asia/Kolkata.
- Branch: `phase6-backend` (verified; user created from main; local commits only).
- Last commit: `f410e86 Fix Montserrat font: add Black 900 face, remove missing woff2 reference` (user says keep/ignore this separate font commit).
- Current phase/task: Phase 6 thin slice — Fund transparency, STEP 0 baseline and orientation.

## DONE
- Read Phase 6 prompt and existing continuity docs.
- Confirmed branch `phase6-backend`; worktree clean. No Phase 6 code changes made.
- Master constraints: backend only, never push, never print `.env` values, do not touch frontend files (`preview.html`, `dashboard.html`, `src/`, `assets/`).

## IN PROGRESS
- STEP 0 complete: `npm ci` PASS, `npm test` PASS (104/104), `npm run check:migrations` PASS (0001–0005); frontend diff empty. Local STEP 0 docs checkpoint pending.
- No code files being edited. After baseline, inspect applied migration list/current schema and backend architecture before T1.

## NEXT STEPS
1. Complete STEP 0 install and baseline tests; record results and commit locally.
2. T1 create additive migration `0006_fund_transparency.sql`, run migration parser/tests, document exact SQL Editor steps, then wait for user confirmation that it is applied.
3. Only after the user says migration is applied, continue T2–T7 in order with tests and continuity updates after each task.
4. Stop at the phase completion gate; do not push.

## USER ACTIONS PENDING
- None for STEP 0. T1 will require the user to apply the new migration in Supabase SQL Editor; before asking, record exact SQL Editor steps here. Do not proceed to T2 until the user confirms application.

## LIVE STATE
- Existing project migrations 0001–0005 were previously reported applied; no Phase 6 migration exists or has been applied.
- Tunnel/webhook and one prior $1 Sandbox capture were previously reported verified. Do not make PayPal calls until the T4 availability decision and explicit human approval requirements are satisfied.
- Last live API check (previous task): fixed-user login/membership PASS; authenticated read APIs 8/8 HTTP 200; additional reports/CSV 5/5 HTTP 200.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Phase 6 `npm ci` | PASS | 2026-10-25 | `npm ci`: 89 added, 90 audited, 0 vulnerabilities; install-script warning noted in TEST-REPORT |
| Phase 6 `npm test` | PASS | 2026-10-25 | Migrations 0001–0005 parsed; 104 passed, 0 failed |
| Phase 6 migration parser | PASS | 2026-10-25 | `npm run check:migrations`: migrations 0001–0005 parse |
| Phase 6 integration/security/live checks | UNVERIFIED | 2026-10-25 | Not started |
| Phase 6 frontend diff | PASS | 2026-10-25 | No Phase 6 edits; frontend paths untouched |
| Phase 6 docs diff hygiene | PASS | 2026-10-25 | `git diff --check` |

## KNOWN ISSUES AND RISKS
- Existing real project state is user-reported; verify by read-only probes where practical, without mutating live data before planned user approval.
- Pooled real-money funds, third-party payouts, donations, and legal eligibility vary by PayPal product and jurisdiction; only demonstrate Sandbox flows and include caution text.
- Receipts and completion evidence must not imply donor PII or prove quality of completed work.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime errors roll everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove it using ordinary-user JWT (expect 403).
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup order: journal entries/lines, audit log, organizations, auth users; reuse fixed named users/orgs and `scripts/cleanup-phase2-test-data.sql`.
- PayPal Sandbox buyer must be US Personal; seller USD; use Visa. Webhook path must end `/api/webhook` and `PAYPAL_WEBHOOK_ID` must match.
- Raw request body is required for PayPal signature verification.
- Never print `.env` values; use key names only.
- Pledges are intent only; only verified, posted captures count as received donations. Simulated payments do not enter the real ledger.
- Every expense needs a visible path to approval, quotation/invoice, payment, ledger entry, and completion evidence; report each absent link explicitly.

## DO NOT
- Do not push, use `--force`, weaken tests, edit applied migrations, commit `.env`, or print secrets.
- Do not edit frontend files (`preview.html`, `dashboard.html`, `src/`, `assets/`).
- Do not call PayPal Payouts/Invoicing or create a donation until the Phase 6 prompt's required gate and human steps are met.
- Do not create test users/orgs per run; reuse fixed named fixtures and clean only run-owned rows.

## RESUME COMMANDS
- `git status --short`
- `git branch --show-current`
- `npm ci`
- `npm test`
- `npm run check:migrations`
- `find server scripts -name '*.js' -print0 | xargs -0 -n1 node --check`
