# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-28 (Asia/Kolkata)
- Branch: `phase5-backend`
- Last code/doc commit before live verification: `54b53b6`
- Current phase/task: Phase 5, live verification of document tenant isolation, delete cascade and Storage RLS

## DONE
- Part 4 Documents UI/API and documentation committed locally in `5a63d8e` and `54b53b6`.
- Read-only preflight: server health HTTP 200; fixed Phase 3 owner A/B users and their named organizations exist. No users or organizations created.
- Live test created one synthetic sample PDF in fixed org A; upload returned HTTP 201. Processing returned HTTP 503 before indexing. Cleanup DELETE for only that document returned HTTP 200. Server stopped.
- No implementation code changed in this live verification. Files changed now: `docs/WORKLOG.md`, `docs/TEST-REPORT.md`, `docs/CONTEXT.md`.

## IN PROGRESS
- Exact task: live verification blocked at OCR/index processing HTTP 503. No org B search/fetch, Storage-object RLS, or delete-cascade assertions were run.
- Next work requires user direction before diagnosing/fixing the 503. Do not label any blocked check PASS.

## NEXT STEPS
1. Await user direction on whether to diagnose/fix the HTTP 503 processing failure.
2. If authorized, inspect logs and document OCR/index provider failure without changing checks or using new users/orgs.
3. Rerun using fixed Phase 3 owner A/B and org A/B only, with synthetic sample files.
4. Complete cross-tenant, Storage RLS, and delete cascade checks; append actual results to TEST-REPORT.md.

## USER ACTIONS PENDING
- User decision: authorize diagnosis/fix of document processing HTTP 503 before resuming the live checks.

## LIVE STATE
- Migrations 0001–0016: user-confirmed applied; no new migration applied in this task.
- Tunnel/webhook: last reported fixed by user; not checked.
- Server started for verification and stopped afterward.
- Fixed test users/orgs: preflight confirmed existing owner A/B accounts and orgs; no provisioning occurred.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| API health | PASS | `GET /api/status` HTTP 200; authenticated mode and Supabase configured. |
| Cross-tenant retrieval/document fetch | UNVERIFIED | Upload 201; process 503 before indexing; org B probes not run. |
| Delete cascade | UNVERIFIED | Cleanup DELETE 200; cascade contents/audit not inspected. |
| Storage-object RLS | UNVERIFIED | No other-org JWT object read attempted. |

## KNOWN ISSUES AND RISKS
- Document process returned HTTP 503; exact response code/body was not retained. No retry or fix attempted.
- The cleanup DELETE returned 200 but cascade outcome was not independently verified.
- Cross-tenant isolation, Storage-object RLS and audit row remain unverified.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs must revoke public/anon/authenticated and grant only service_role; prove ordinary JWT denial (403).
- PostgREST embeds need explicit FK names when multiple relationships exist.
- audit_log is insert-only/ON DELETE RESTRICT; cleanup journal entries, audit_log, orgs, then auth users; reuse fixed users/orgs.
- PayPal sandbox buyer is US Personal, seller USD, Visa checkout, webhook URL ends `/api/webhook`, ID must match.
- PayPal signature verification needs raw body.
- Never print `.env` values; key names only.

## DO NOT LIST
- Never push; do not change `main`/`backend`; do not edit protected design files or applied migrations; no force; no weakened tests; never commit `.env`.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- `npm test`
- `npm run check:migrations`
