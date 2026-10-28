# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-28 (Asia/Kolkata)
- Branch: `phase5-backend`
- Latest local code/log checkpoint: `7b6ab23`; no push
- Current task: GET-by-ID fix applied; deletion response diagnosed; live checks and final tests complete

## DONE
- Added authenticated, org-scoped `GET /api/documents/:documentId`; returns standard 404 `DOCUMENT_NOT_FOUND` for missing/foreign IDs and excludes Storage path.
- Added test coverage for same-org 200, foreign-org 404, unknown 404, unauthenticated 401. Focused test PASS 6/6; full suite PASS 165/165.
- Migrations syntax PASS 16/16; `node --check` PASS for two changed JS files; `git diff --check` PASS.
- Live run used existing fixed owner A/B and org A/B, one synthetic PDF. Membership setup confirmed B has no org A membership; B requests used own JWT/org B.
- Live cross-tenant: B retrieval request 200, one citation not matching org A document; B search RPC 403/0; B list 200/0 org A rows; B GET 404; B Storage read 400 denied; owner A positive control 200/1 citation.
- Delete cascade: DELETE 200; document/chunks/search hits 0; Storage list API 0; owner audit query 1. Post-delete direct object GET was 400 JSON/88 bytes; `CF-Cache-Status: BYPASS`, no cache-control/age.
- No code fix for Storage behavior. Prior owner GET 200 was not reproduced; its precise cause is unresolved. Direct `storage.objects` SQL count was unavailable (no SQL client/CLI/connection); Storage list API used instead.

## IN PROGRESS
- No implementation work remains. Review diff, commit locally on `phase5-backend`; never push.
- Preserve `.env.example` pre-existing modification without staging it.

## NEXT STEPS
1. Review status and changed paths; ensure only intended files are staged and `.env` is absent.
2. Commit GET route/tests/docs and diagnostic logs locally.
3. If desired, ask for a direct SQL connection to verify `storage.objects` count or further investigation of the unreproduced earlier 200.

## USER ACTIONS PENDING
- None required to use the new GET route.
- Optional: provide an approved SQL access path if exact `storage.objects` SQL count is required.

## LIVE STATE
- Server stopped. Loaded limits at run start were user 100/org 300; status HTTP 200.
- Fixed identities reused, no users/orgs created. Run-specific synthetic sample was deleted.
- Migrations 0001–0016 applied; no migrations modified.
- Key names only: `AI_DAILY_USER_LIMIT`, `AI_DAILY_ORG_LIMIT`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| GET-by-ID route tests | PASS | 6/6 focused tests; same/foreign/missing/unauthenticated assertions. |
| Full suite | PASS 165/165 | `npm test`. |
| Migration syntax | PASS 16/16 | `npm run check:migrations`. |
| Changed JS syntax | PASS | `node --check` on route and test. |
| Diff whitespace | PASS | `git diff --check`. |
| Cross-tenant retrieval | PASS | B retrieval response had no org A document citation; RPC 403. |
| B list/get isolation | PASS | list 200/0 org A rows; get 404. |
| B Storage RLS | PASS | B read denied HTTP 400. |
| A positive control | PASS | retrieval route 200/1 citation. |
| Delete cascade | PASS via API/list | DB rows 0, Storage list 0, audit 1; direct SQL count UNVERIFIED. |
| Earlier post-delete 200 cause | UNRESOLVED | Not reproduced; current GET 400 with cache BYPASS and no cache headers. |

## KNOWN ISSUES AND RISKS
- The exact `storage.objects` SQL count was not run due lack of SQL access tooling.
- Previous HTTP 200 after delete lacks headers/byte length and cannot be attributed to caching or signed URL.
- One initial positive-control query routed to structured SQL; corrected retrieval wording was used for passing positive control. One B harness flag was a false positive from marker echo in its own question; citation ID did not match org A document.
- `.env.example` contains an unrelated pre-existing modified file; leave untouched.

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
