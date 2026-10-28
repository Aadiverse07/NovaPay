# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-28 (Asia/Kolkata)
- Branch: `phase5-backend`
- Last feature checkpoint: `ac25bfb`; live-verification journal commit pending
- Current task: diagnose cross-tenant document failure only; stopped before Org B probes

## DONE
- Phase 5 Parts 1–4 complete; migrations 0015/0016 applied/live-verified.
- `npm ci` pass; `npm test` PASS 164/164; migrations PASS 16/16.
- OCR and embedding services read `GEMINI_API_KEY`; loaded config reports it present. Model/timeout config names also present. No values printed.
- Server health HTTP 200; fixed existing owner A/org A uploaded and processed/indexed one synthetic sample; cleanup DELETE HTTP 200; server stopped.

## IN PROGRESS
- Membership setup confirmed: owner A belongs to org A; owner B belongs to org B and has no org A membership. Intended Org B calls use B JWT and X-Org-Id org B. Sample upload 201, processing 429 AI_DAILY_LIMIT; run-scoped cleanup 200. No Org B sub-check ran.
- Delete cascade UNVERIFIED: cleanup DELETE succeeded, but chunks/search hits/object/audit were not individually checked.
- Storage-object RLS UNVERIFIED: probe not run because user instructed stop after a failure.
- Do not diagnose/fix or rerun without user authorization.

## NEXT STEPS
1. Await user direction after AI daily budget reset; the earlier aggregate probe failure was inconclusive, and current rerun did not reach Org B checks.
2. If authorized, isolate the failing API assertion with the existing fixed owner A/B and org A/B; use synthetic samples only.
3. After the failure is understood and approved, rerun cross-tenant, delete cascade and Storage RLS checks; log each actual result.
4. Never push without explicit authorization; Phase 7 only if time remains.

## USER ACTIONS PENDING
- Authorize investigation of the cross-tenant failure before any more probes or fixes.

## LIVE STATE
- Migrations 0001–0016 user-confirmed applied; no migrations changed.
- Fixed Phase 3 users/orgs used; no new users/orgs created.
- Last server run: fixed-user membership setup valid; synthetic upload 201; processing 429 AI_DAILY_LIMIT; run-scoped cleanup 200; server stopped.
- Key names only: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| `npm ci` | PASS | 94 packages added, 95 audited, 0 vulnerabilities; install-script warning logged. |
| `npm test` | PASS 164/164 | Fresh install baseline. |
| Migration parser | PASS 16/16 | `npm run check:migrations`. |
| Cross-tenant retrieval/fetch | UNVERIFIED | Re-indexing sample blocked by HTTP 429 AI_DAILY_LIMIT; Org B probes not run. |
| Delete cascade | UNVERIFIED | Cleanup DELETE 200; no component assertions. |
| Storage-object RLS | UNVERIFIED | Stopped before different-org JWT probe. |

## KNOWN ISSUES AND RISKS
- Exact failing Org B subassertion was not retained. No fix or repeat attempt made.
- Delete API returned 200 but cascade components/audit were not verified.
- Browser checklist remains pending.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; never edit an applied migration; add a numbered file.
- SECURITY DEFINER/posting RPCs revoke public/anon/authenticated and grant only service_role; prove ordinary JWT denial (403).
- PostgREST embeds need explicit FK names when multiple relationships exist.
- audit_log is insert-only/ON DELETE RESTRICT; cleanup journal entries, audit_log, organizations, auth.users. Reuse fixed identities.
- PayPal sandbox buyer US Personal; seller USD; Visa; webhook ends `/api/webhook`; ID matches. Raw body is required for signature verification.
- Never print `.env` values; use key names only.

## DO NOT LIST
- Never push without authorization; do not touch main/backend or protected design files; no force; do not weaken tests, edit applied migrations, or commit `.env`.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- `npm test`
- `npm run check:migrations`
