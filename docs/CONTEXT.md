# NovaPay Phase 5 Handoff

## HEADER
- Updated: 2026-10-28 15:27 Asia/Kolkata.
- Branch: phase5-backend; last Part 3 implementation commit 6dba84b; no push.
- Current phase/task: Phase 5 Part 3 code complete (task 3/4); migration 0016 is unapplied and its live permission checks remain pending. Migration 0015 is user-confirmed applied.

## DONE
- Part 3 code: Gemini `gemini-embedding-001` embeddings at 768 dimensions; bounded OCR text/field chunking; per-call `ai_usage` budget entries; org-scoped hybrid lexical/vector retrieval and cited AI answers; accountant-only confirm/reject/delete routes with audit; deletion removes Storage object and calls cascade RPC for chunks/search hits; hidden-instruction tests at OCR and answer stages. Files: `server/src/services/documentRag.js`, `server/src/services/ai.js`, `server/src/ai/router.js`, `server/src/routes/ai.js`, `server/src/routes/documents.js`, `server/src/app.js`, `server/src/config.js`, `server/src/services/documentOcr.js`, `supabase/migrations/0016_document_search_and_delete.sql`, and related tests.
- Part 2: Gemini OCR provider pinned to `gemini-3.5-flash-lite`, with untrusted-document prompt boundary, strict field/date/currency validation, exact minor-unit arithmetic checks and warnings; org-scoped SHA-256 duplicate rejection/audit; service-only processing claim; existing `ai_usage` budget reservation/completion; private storage download; safe failed-state handling. Files: `server/src/services/documentOcr.js`, `server/src/routes/documents.js`, `server/src/config.js`, `server/src/services/supabase.js`, `server/src/app.js`, and OCR/processing/Supabase tests.
- Part 1: private document bucket policies, `documents`, `document_chunks` (768-dimension vector), `document_search_hits`, atomic hourly upload reservation/audit RPC, and raw authenticated upload API.
- Accountant-level (`owner`, `admin`, `accountant`) required to upload. Viewer denied. PDF/PNG/JPEG signature checks, PDF page count, file-size cap, path sanitization, and storage rollback on reservation failure implemented.
- Configurable upload defaults: 10 MB, 10 pages, 2 concurrent processing jobs/org, 20 uploads/org/hour. Part 2 worker invokes the org-locked service-only claim RPC for the two-job cap.
- Selected `gemini-embedding-001`, 768 dimensions; official Google docs checked 2026-10-28: https://ai.google.dev/gemini-api/docs/embeddings .
- Selected stable vision OCR model `gemini-3.5-flash-lite`; official docs confirm PDF/image input and free-tier input as of 2026-10-28; free-tier submitted data may be used to improve products, so use sample documents only.
- Live 0015 checks: documents table, vector column and search-hits table returned HTTP 200; fixed accountant session/membership 200; private bucket `public=false`, 10 MiB and PDF/PNG/JPEG restrictions verified; service-only claim RPC returned 200 with not_available for a nonexistent doc; ordinary JWT denied with HTTP 403.
- `npm test`: PASS, 140/140. `npm run check:migrations`: PASS, 15/15 syntax parsed. `node --check`: PASS (6 JS files). `git diff --check`: PASS.

## IN PROGRESS
- Exact task: Part 3 implementation is complete; migration 0016 is not applied. Live ordinary-JWT denial and safe service-role RPC checks remain UNVERIFIED until the human applies it.
- Part 1 files: `docs/CONTEXT.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`, `package.json`, `package-lock.json`, `server/src/app.js`, `server/src/config.js`, `server/src/routes/documents.js`, `server/src/services/supabase.js`, `server/test/documents-upload.test.js`, `server/test/supabase.test.js`, `supabase/migrations/0015_documents_rag.sql`.
- Part 2 files changed: `server/src/app.js`, `server/src/config.js`, `server/src/routes/documents.js`, `server/src/services/supabase.js`, `server/src/services/documentOcr.js`, `server/test/supabase.test.js`, `server/test/document-ocr.test.js`, `server/test/document-processing.test.js`, `docs/CONTEXT.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`.
- Part 2 verification: full suite PASS 152/152; migrations PASS 15/15; `node --check` PASS for 8 changed JS files; `git diff --check` PASS.
- Part 3 files edited: `server/src/services/documentRag.js`, `server/src/services/ai.js`, `server/src/ai/router.js`, `server/src/routes/ai.js`, `server/src/routes/documents.js`, `server/src/app.js`, `server/src/config.js`, `server/src/services/documentOcr.js`, `supabase/migrations/0016_document_search_and_delete.sql`, `server/test/document-rag.test.js`, `server/test/document-rag-migration.test.js`, `server/test/document-processing.test.js`, `server/test/document-ocr.test.js`, `server/test/ai-router.test.js`, `server/test/routes.test.js`, and docs listed in status.
- Part 3 checks: `npm test` PASS 163/163; migration parser PASS 16/16; `node --check` PASS for 14 changed JS files; `git diff --check` PASS. Migration 0016 runtime remains UNVERIFIED.

## NEXT STEPS
1. Finish the local Part 3 WIP commit; do not push.
2. Human applies migration 0016 in Supabase SQL Editor and replies `applied`.
3. Verify 0016 search/delete RPC service-role success without deleting real data and ordinary accountant JWT denial (403); then stop and wait for `CONTINUE` before Part 4.

## USER ACTIONS PENDING
- Pending: apply `supabase/migrations/0016_document_search_and_delete.sql` in Supabase SQL Editor: New query → paste the entire file → Run once → wait for success → reply `applied`. Do not reload schema cache yet.
- Part 4 browser/UI checks remain for later.

## LIVE STATE
- Real Supabase migrations 0001–0014: previously user-confirmed applied. Migration 0015: user-confirmed applied on 2026-10-28; tables/vector/search-hits and private bucket metadata returned 200; service-role claim RPC returned 200 and ordinary accountant JWT returned 403. Migration 0016: local-only, parser PASS 16/16, not applied; live search/delete/embedding RPC checks UNVERIFIED. Storage-object RLS behavior remains UNVERIFIED.
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
| Full Part 2 suite | PASS | 2026-10-28 | `npm test`; 152 passed, 0 failed |
| Migration syntax | PASS | 2026-10-28 | `npm run check:migrations`; 15/15 parsed |
| Changed JavaScript syntax | PASS | 2026-10-28 | `node --check` on 8 changed JS files |
| Diff whitespace | PASS | 2026-10-28 | `git diff --check` |
| Focused Part 2 tests | PASS | 2026-10-28 | 20/20 document/provider/Supabase tests |
| Part 3 focused OCR/RAG/AI suite | PASS, 41/41 | 2026-10-28 | Focused `node --test` run |
| Part 3 full suite | PASS, 163/163 | 2026-10-28 | `npm test` |
| Migrations including 0016 | PASS, 16/16 syntax parsed | 2026-10-28 | `npm run check:migrations`; 0016 not applied |
| Changed JavaScript syntax | PASS, 14 files | 2026-10-28 | `node --check` on changed files |
| Diff whitespace | PASS | 2026-10-28 | `git diff --check` |
| 0016 live RPC permissions | UNVERIFIED | 2026-10-28 | Migration awaits operator apply |
| Storage-object RLS behavior | UNVERIFIED | 2026-10-28 | No direct object-policy probe |
| Documents UI | UNVERIFIED | 2026-10-28 | Part 4 not started |

## KNOWN ISSUES AND RISKS
- Migration 0015 is user-confirmed applied; schema/vector and service-only claim RPC boundary are live-verified. Migration 0016 is not applied. Storage-object RLS policy behavior remains UNVERIFIED.
- Storage-object RLS behavior and migration 0016 live RPC permissions remain UNVERIFIED. Documents UI remains in Part 4.
- Only documents/OCR text are in the initial index. Do not index transaction descriptions, quotations or campaign descriptions before core passes.
- Free-tier Gemini terms may allow use of submitted data; use sample documents only.
- PDF extraction is untrusted. Part 3 now tests hidden instructions at extraction and answer stages.

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
- Parts 1–3 code are complete; do not start Part 4 until migration 0016 is applied, live RPC permissions are verified, and the user replies `CONTINUE`.

## RESUME COMMANDS
```sh
git branch --show-current
git status --short --branch
npm test
npm run check:migrations
git diff --check
```
