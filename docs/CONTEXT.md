# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-28 (Asia/Kolkata)
- Branch: `phase5-backend`
- Current code checkpoint: `f4f53b8`; this diagnostic log commit pending
- Current task: live cross-tenant check completed; two failures recorded; no fix applied

## DONE
- Fresh server start: loaded AI limits user 100/org 300; `/api/status` HTTP 200.
- Fixed users: A belongs to org A only; B belongs to org B only and has no org A membership. B requests used B JWT plus org B X-Org-Id, never service role.
- One synthetic sample uploaded 201, processed 200, indexed 1 chunk.
- B AI hybrid 200/0 citations PASS; B search RPC 403/0 rows PASS; B list 200/0 org A rows PASS; B Storage read 400 denied PASS; A positive control 200/1 citation PASS.
- Run-scoped deletion returned 200; document/chunks/search hits absent; Storage prefix listing 0; owner audit query 1 row.

## IN PROGRESS
- B GET-by-ID returned 405 (FAIL): no GET route; app unmatched API fallback in `server/src/app.js` returns 405.
- Delete cascade marked FAIL/inconsistent because owner direct Storage GET after deletion returned 200 while Storage list prefix reported 0 rows. No fix applied.
- Server stopped; synthetic record was deleted; no run rows intentionally left.

## NEXT STEPS
1. Await user approval before fixes or additional live probes.
2. Proposed smallest GET fix: add tenant-scoped `GET /api/documents/:documentId` returning 404 for foreign/nonexistent IDs; do not apply until `APPLY FIX`.
3. Investigate object GET/list inconsistency only with user direction; no code change made.

## USER ACTIONS PENDING
- Reply `APPLY FIX` to authorize the scoped GET-by-ID change, if desired.
- Direct further diagnosis of post-delete Storage GET/list inconsistency, if desired.

## LIVE STATE
- Migrations 0001–0016 applied; no migration changes.
- Server stopped. Limits loaded 100/300 in last fresh process.
- Fixed users/orgs reused; no new users/orgs.
- `.env.example` has an unrelated pre-existing modification; leave untouched.
- Key names only: `AI_DAILY_USER_LIMIT`, `AI_DAILY_ORG_LIMIT`, `GEMINI_API_KEY`.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| B hybrid AI isolation | PASS | 200, 0 citations. |
| B search RPC grant | PASS | 403, 0 rows. |
| B list isolation | PASS | 200, 0 org A rows. |
| B get by ID | FAIL | 405 due missing route/unmatched fallback. |
| B Storage RLS | PASS | B read 400 denied, 0 rows. |
| A positive control | PASS | 200, 1 citation. |
| Delete cascade | FAIL/inconsistent | DB rows 0, Storage list 0, audit 1, but direct object GET after delete 200. |

## KNOWN ISSUES AND RISKS
- No GET-by-ID route; unmatched GET receives 405 instead of expected 404.
- Storage metadata list and object GET disagree after deletion; cause unresolved.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; never edit applied migrations; add numbered migrations.
- SECURITY DEFINER/posting RPCs revoke public/anon/authenticated and grant only service_role; prove ordinary JWT denial.
- PostgREST embeds need explicit FK names with multiple relationships.
- audit_log is insert-only/ON DELETE RESTRICT; cleanup journal entries, audit_log, organizations, auth.users; reuse fixed users/orgs.
- PayPal sandbox buyer US Personal; seller USD; Visa; webhook ends `/api/webhook`; raw body required for signature verification.
- Never print `.env` values or JWTs.

## DO NOT LIST
- Never push; do not touch main/backend/protected design files; no force; do not weaken tests/edit applied migrations/commit `.env`.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- `npm test`
- `npm run check:migrations`
