# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-28 (Asia/Kolkata)
- Branch: `phase5-backend`, based on main after PR #6
- Last local commit: `844e6a4`; no Phase 5 changes pushed; no PR yet
- Current phase/task: Phase 5 handoff; live document verification blocked at HTTP 503

## DONE
- Phase 5 Parts 1–4: upload/limits, OCR/validation, duplicate detection, embeddings/hybrid search, OCR router branch, Documents view wiring.
- Migrations 0015 and 0016 are applied and live-verified.
- `npm test` PASS 164/164; migrations PASS 16/16; protected-file diff empty.
- Part 4 code/docs committed locally. No Phase 5 branch work pushed.

## IN PROGRESS
- Live verification stopped after fixed owner A uploaded a synthetic sample (HTTP 201), then document processing returned HTTP 503 before indexing. Cleanup DELETE returned HTTP 200; cascade not verified.
- Root cause is undiagnosed. User reports `notify pgrst, 'reload schema'` succeeded and is adding `GEMINI_API_KEY` to `.env`.
- Suspects only: schema cache (now reloaded), missing/invalid Gemini key, embedding model/dimension mismatch, provider rate limit.

## NEXT STEPS
1. Human finishes `.env` and restarts `npm start`; diagnose one sample upload, read server logs; make only a small config/code fix and add a test if needed.
2. Rerun cross-tenant retrieval, delete cascade and Storage-object RLS with fixed test users/orgs; append one result line per check.
3. After human authorization, push `phase5-backend` and open a PR into main.
4. Phase 7 hardening only if time remains.

## USER ACTIONS PENDING
- Finish `.env` configuration and restart `npm start`.
- Run `docs/BROWSER-CHECKLIST.md` with sample documents only.
- After verification, authorize push of `phase5-backend` and PR into main.

## LIVE STATE
- Branch `phase5-backend`; based on main after PR #6. Last local commit `844e6a4`; no push/PR.
- Migrations 0001–0016 user-confirmed applied; 0015/0016 live-verified.
- Fixed Phase 3 owner accounts/orgs exist. No new users/orgs created in last attempt.
- Last live run: API health 200; sample upload 201; process 503; cleanup DELETE 200; server stopped. Three acceptance checks remain UNVERIFIED.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Duplicate upload flag | PASS | `npm test`; duplicate flag test. |
| Wrong-total flag | PASS | `npm test`; arithmetic validation warning. |
| Hidden-instruction injection | PASS | `npm test`; extraction and answer prompt-boundary checks. |
| Cross-tenant retrieval | UNVERIFIED | HTTP 503 before indexing; org B probes not run. |
| Delete cascade | UNVERIFIED | Cleanup DELETE 200; cascade rows/object/audit not checked. |
| Storage-object RLS | UNVERIFIED | Cross-org JWT read not run. |
| Unit/integration tests | PASS 164/164 | `npm test`. |
| Migration syntax | PASS 16/16 | `npm run check:migrations`. |
| Protected files | PASS, empty diff | `git diff --stat main -- <protected pathspecs>`. |

## KNOWN ISSUES AND RISKS
- Document processing HTTP 503 remains undiagnosed; no code changes made after the failed live run.
- Browser checklist and the three live acceptance checks remain pending.
- Use only fixed named test users/orgs and synthetic sample files; never print `.env` values.

## LESSONS LEARNED
- Supabase SQL Editor runs one transaction; never edit an applied migration; add a numbered migration.
- SECURITY DEFINER/posting RPCs: revoke public/anon/authenticated; grant only service_role; verify ordinary JWT gets 403.
- PostgREST embeds need explicit FK names with multiple relationships.
- audit_log is insert-only/ON DELETE RESTRICT; cleanup journal entries, audit_log, organizations, auth.users. Reuse fixed test identities.
- PayPal sandbox buyer US Personal; seller USD; Visa checkout; webhook URL ends `/api/webhook`; webhook ID must match.
- PayPal verification requires raw body.
- Never print `.env` values; key names only.

## DO NOT LIST
- Never push without explicit authorization; do not touch main/backend or protected design files; never force; do not weaken tests, edit applied migrations, or commit `.env`.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- `npm test`
- `npm run check:migrations`
