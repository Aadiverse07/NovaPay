# NovaPay Phase 5 Planning Handoff

## HEADER
- Updated: 2026-10-28 Asia/Calcutta.
- Branch: `phase5-backend`, created from updated `origin/main`; planning checkpoint base commit `20048b2`.
- Phase/task: Phase 5 PLANNING ONLY, task 4/5. Plan written; awaiting `PLAN OK`. No Phase 5 code started.

## DONE
- `npm ci` PASS: 89 packages, 0 vulnerabilities.
- `npm test` PASS: 135/135.
- `npm run check:migrations` PASS: migrations 0001–0014 parse.
- Read the Blueprint's numbered Phase 5 roadmap (PDF p.15) and detailed prompt (PDF p.28); inspected `PaypalFinal.png` and recorded its Week 5 vs numbered Phase 5 distinction.
- Wrote `docs/PHASE5-PLAN.md`; next local WIP checkpoint is pending.

## IN PROGRESS
- Exact task: planning only; wait for user review and `PLAN OK` before implementation.
- Plan scope: private document upload, OCR with confidence and arithmetic checks, duplicate flags, tenant-isolated hybrid retrieval, grounded AI answers, and Documents review UI.
- Planned new migration: `supabase/migrations/0015_documents_rag.sql`, gated on provider/model/vector-dimension and upload-limit decisions. Migrations 0001–0014 remain untouched.
- Files edited for planning only: `docs/PHASE5-PLAN.md`, `docs/CONTEXT.md`, `docs/DECISIONS.md`, `docs/WORKLOG.md`. No application code edited.

## NEXT STEPS
1. Locally WIP-commit the planning docs.
2. Reply with the plan and `AWAITING PLAN OK`; then stop.
3. Do not write Phase 5 code, author the migration, or run live checks until the user replies `PLAN OK`.

## USER ACTIONS PENDING
- Review `docs/PHASE5-PLAN.md` and reply `PLAN OK` to authorize implementation.
- Before implementation, record OCR provider, embedding provider/model/vector dimension, maximum pages, and per-org concurrency defaults in DECISIONS.md.
- If a migration is later prepared, present exact SQL Editor steps and wait for the user to say `applied` before live verification.

## LIVE STATE
- Prior user-confirmed migrations 0001–0014 applied; 0003 applied. No live migration action in this task.
- Tunnel/webhook were last reported fixed by the user; not rechecked in this planning task.
- Tests this task were local only. No real Supabase, PayPal, webhook, or browser checks run.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `GEMINI_API_KEY`.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| Dependency install | PASS, 89 packages, 0 vulnerabilities | 2026-10-28 | `npm ci` |
| Unit suite | PASS 135/135 | 2026-10-28 | `npm test` |
| Migration parser | PASS, 14 files | 2026-10-28 | `npm run check:migrations` |
| Phase 5 implementation checks | UNVERIFIED | 2026-10-28 | Planning only; not run |
| Browser checks | UNVERIFIED | 2026-10-28 | Human run required |

## KNOWN ISSUES AND RISKS
- OCR/embedding provider, model/vector dimension, max pages, and per-org concurrency defaults are not selected; record them before migration authoring.
- Blueprint Phase 5 is RAG/OCR (Week 4); infographic Week 5 says community/automation. The numbered PDF phase is the plan scope; see DECISIONS.md.
- Invoice sending and maintenance payouts remain SIMULATED. OCR is not proof of invoice authenticity; antivirus remains a hook unless implemented and tested.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; errors roll everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary user JWT gets 403.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- `audit_log` is insert-only with ON DELETE RESTRICT; cleanup journal_entries first, then audit_log, organizations, auth.users using `scripts/cleanup-phase2-test-data.sql`; reuse fixed users/orgs.
- PayPal Sandbox buyer must be a US Personal account; seller USD only; use Visa at checkout; webhook URL ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Never push; never touch main; do not implement Phase 5 before `PLAN OK`.
- Do not edit applied migrations; do not weaken tests; do not commit `.env` or the external PDF.
- Respect the protected design files/assets list; do not redesign the Documents view.

## RESUME COMMANDS
```sh
git branch --show-current
git status --short --branch
npm test
npm run check:migrations
git diff --check
```
