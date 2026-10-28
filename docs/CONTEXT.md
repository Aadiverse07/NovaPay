# NovaPay Phase 5 Handoff

## HEADER
- Updated: 2026-10-28 15:26 Asia/Kolkata.
- Branch: `phase5-backend`; last implementation commit `eca1196` (`WIP Phase 5 task 1: document upload foundation`); no push.
- Current phase/task: Phase 5, Part 2 in progress; task 2/4. Migration 0015 is user-confirmed applied; user authorized continuation.

## DONE
- Part 1: private document bucket policies, `documents`, `document_chunks` (768-dimension vector), `document_search_hits`, atomic hourly upload reservation/audit RPC, and raw authenticated upload API.
- Accountant-level (`owner`, `admin`, `accountant`) required to upload. Viewer denied. PDF/PNG/JPEG signature checks, PDF page count, file-size cap, path sanitization, and storage rollback on reservation failure implemented.
- Configurable upload defaults: 10 MB, 10 pages, 2 concurrent processing jobs/org, 20 uploads/org/hour. Migration 0015 includes an org-locked service-only claim RPC for the two-job cap, to be invoked by the Part 2 worker.
- Selected `gemini-embedding-001`, 768 dimensions; official Google docs checked 2026-10-28: https://ai.google.dev/gemini-api/docs/embeddings .
- Selected stable vision OCR model `gemini-3.5-flash-lite`; official docs confirm PDF/image input and free-tier input as of 2026-10-28; free-tier submitted data may be used to improve products, so use sample documents only.
- Live 0015 checks: documents table, vector column and search-hits table returned HTTP 200; fixed accountant session/membership 200; private bucket `public=false`, 10 MiB and PDF/PNG/JPEG restrictions verified; service-only claim RPC returned 200 with not_available for a nonexistent doc; ordinary JWT denied with HTTP 403.
- `npm test`: PASS, 140/140. `npm run check:migrations`: PASS, 15/15 syntax parsed. `node --check`: PASS (6 JS files). `git diff --check`: PASS.

## IN PROGRESS
- Exact task: Part 2 OCR provider/service, extraction field and arithmetic validation, duplicate detection, ai_usage budget/rate integration, and tests.
- Files changed: `docs/CONTEXT.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`, `package.json`, `package-lock.json`, `server/src/app.js`, `server/src/config.js`, `server/src/routes/documents.js`, `server/src/services/supabase.js`, `server/test/documents-upload.test.js`, `server/test/supabase.test.js`, `supabase/migrations/0015_documents_rag.sql`.
- Part 2 files edited so far: documentation only. Live schema/table/vector, bucket properties and the ordinary-user RPC denial are verified; storage-object RLS policy behavior remains UNVERIFIED.

## NEXT STEPS
1. Verify 0015 database objects and service-role-only RPC permissions without printing credentials; ordinary authenticated execute must be denied.
2. Inspect AI usage reservation/completion and Gemini provider conventions; implement OCR service, untrusted extraction validation, duplicate detection and tests.
3. Run Part 2 checks, update all continuity docs and make a local WIP commit; then stop for the next `CONTINUE`.

## USER ACTIONS PENDING
- No migration action pending; user confirmed migration 0015 applied.
- None currently. If Supabase credentials or connectivity are unavailable, leave live checks UNVERIFIED and continue local work.

## LIVE STATE
- Real Supabase migrations 0001–0014: previously user-confirmed applied. Migration 0015: user-confirmed applied on 2026-10-28; live object/RLS/function checks not yet run and remain UNVERIFIED.
- Tunnel/webhook: last reported fixed by user; not checked in this task. No live API or browser checks run for Part 1.
- Tests last run live: none in this task.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `DOCUMENT_MAX_FILE_MB`, `DOCUMENT_MAX_PAGES`, `DOCUMENT_MAX_CONCURRENT_JOBS_PER_ORG`, `DOCUMENT_MAX_UPLOADS_PER_ORG_PER_HOUR`.

## TEST STATE
| Check | Status | Date | Command / evidence |
|---|---|---|---|
| Focused upload tests | PASS, 4/4 | 2026-10-28 | `node --test server/test/documents-upload.test.js` |
| Unit/integration suite | PASS, 140/140 | 2026-10-28 | `npm test` |
| Migration syntax | PASS, 15/15 parsed | 2026-10-28 | `npm run check:migrations` |
| Changed JS syntax | PASS, 6 files | 2026-10-28 | `node --check` on changed files |
| Diff whitespace | PASS | 2026-10-28 | `git diff --check` |
| 0015 document/chunk/search tables and vector column | PASS | 2026-10-28 | Live PostgREST service-role reads returned 200 |
| 0015 service-only claim RPC boundary | PASS | 2026-10-28 | Service-role RPC 200; ordinary fixed-accountant JWT 403 |
| Bucket private flag/size/MIME metadata | PASS | 2026-10-28 | Live Storage bucket metadata verified |
| Storage-object RLS behavior | UNVERIFIED | 2026-10-28 | No direct object-policy access probe run |
| Part 2 OCR/extraction/duplicate tests | UNVERIFIED | 2026-10-28 | Part 2 in progress |
| Embeddings, hybrid retrieval, injection, deletion and Documents UI | UNVERIFIED | 2026-10-28 | Parts 3–4 not started |

## KNOWN ISSUES AND RISKS
- Migration 0015 is user-confirmed applied; schema/vector and service-only RPC boundary are live-verified. Storage-object RLS policy behavior remains UNVERIFIED.
- OCR worker does not yet call the 0015 processing-claim RPC; OCR, ai_usage/budget integration, confirm/reject/delete routes, retrieval, injection tests and UI remain later parts.
- Only documents/OCR text are in the initial index. Do not index transaction descriptions, quotations or campaign descriptions before core passes.
- Free-tier Gemini terms may allow use of submitted data; use sample documents only.
- PDF extraction is untrusted. Phase 3 must test hidden instructions at extraction and answer stages.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime errors roll everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary user JWT receives 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- `audit_log` is insert-only with ON DELETE RESTRICT; cleanup journal_entries first, then audit_log, organizations, auth.users using `scripts/cleanup-phase2-test-data.sql`; reuse fixed test users/orgs.
- PayPal Sandbox buyer must be US Personal; seller USD only; use Visa at checkout; webhook URL ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` must match.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Never push or touch `main`; never edit applied migrations; do not commit `.env` or external Blueprint files.
- Do not edit protected design files/assets; do not restyle; do not weaken tests; do not use `--force` or `npm audit fix --force`.
- Part 2 is authorized; do not start Parts 3–4 until user replies `CONTINUE` after each part.

## RESUME COMMANDS
```sh
git branch --show-current
git status --short --branch
npm test
npm run check:migrations
git diff --check
```
