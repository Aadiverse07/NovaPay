# NovaPay Phase 5 Handoff

## HEADER
- Updated: 2026-10-28 14:40 Asia/Kolkata.
- Branch: `phase5-backend`; starting commit `110b171e102c6f542ecc623088d9f059b0fb7794` (update to Part 1 WIP commit after checkpoint).
- Current phase/task: Phase 5, Part 1 complete; task 1/4. Stop here until the user says `CONTINUE`.

## DONE
- Part 1: private document bucket policies, `documents`, `document_chunks` (768-dimension vector), `document_search_hits`, atomic hourly upload reservation/audit RPC, and raw authenticated upload API.
- Accountant-level (`owner`, `admin`, `accountant`) required to upload. Viewer denied. PDF/PNG/JPEG signature checks, PDF page count, file-size cap, path sanitization, and storage rollback on reservation failure implemented.
- Configurable upload defaults: 10 MB, 10 pages, 2 concurrent processing jobs/org, 20 uploads/org/hour. Migration 0015 includes an org-locked service-only claim RPC for the two-job cap, to be invoked by the Part 2 worker.
- Selected `gemini-embedding-001`, 768 dimensions; official Google docs checked 2026-10-28: https://ai.google.dev/gemini-api/docs/embeddings .
- `npm test`: PASS, 140/140. `npm run check:migrations`: PASS, 15/15 syntax parsed. `node --check`: PASS (6 JS files). `git diff --check`: PASS.

## IN PROGRESS
- Exact task: finish Part 1 checkpoint docs and local WIP commit; migration 0015 is deliberately not applied.
- Files changed: `docs/CONTEXT.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`, `package.json`, `package-lock.json`, `server/src/app.js`, `server/src/config.js`, `server/src/routes/documents.js`, `server/src/services/supabase.js`, `server/test/documents-upload.test.js`, `server/test/supabase.test.js`, `supabase/migrations/0015_documents_rag.sql`.
- Left: verify final doc state, ensure no `.env` is staged/tracked, make local WIP commit on `phase5-backend`, refresh pointer with commit hash, then stop.

## NEXT STEPS
1. Complete Part 1 docs and local checkpoint commit; do not push.
2. Human applies `supabase/migrations/0015_documents_rag.sql` using the steps under USER ACTIONS PENDING and replies `applied`.
3. Until confirmed, keep all live migration/Storage/RLS tests UNVERIFIED; do not call live migration-dependent APIs.
4. After user says `CONTINUE`, implement Part 2 OCR, extraction validation/arithmetic checks, duplicate detection, and tests.

## USER ACTIONS PENDING
- Apply migration 0015: open Supabase Dashboard → project → Database → Extensions; enable `vector` in schema `extensions` if not enabled. Open SQL Editor → New query; paste the entire contents of `supabase/migrations/0015_documents_rag.sql` from this repository and run once. Confirm the query succeeds, then reply `applied`. Supabase SQL Editor runs the script transactionally; on any error, the migration rolls back. Do not run a partial selection.
- Alternatively, from the repo with the Supabase CLI linked to the intended project, run `supabase db push` and confirm 0015 is shown applied. Do not use both paths.
- After migration confirmation, ask for `CONTINUE` before Part 2.

## LIVE STATE
- Real Supabase migrations 0001–0014: previously user-confirmed applied. Migration 0015: authored, syntax parsed, NOT applied; runtime status UNVERIFIED.
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
| 0015 application, pgvector type, Storage policies and live RPC | UNVERIFIED | 2026-10-28 | Migration intentionally not applied |
| OCR, embeddings, hybrid retrieval, injection, deletion and Documents UI | UNVERIFIED | 2026-10-28 | Parts 2–4 not started |

## KNOWN ISSUES AND RISKS
- Migration runtime and Storage RLS were not executed against Supabase. All dependent checks remain UNVERIFIED until 0015 is applied and tested.
- Document processing concurrency, OCR, usage/budget accounting for OCR and embedding calls, confirm/reject/delete routes, chunks, retrieval, injection tests and UI are later parts.
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
- Do not start Parts 2–4 until user replies `CONTINUE` after Part 1.

## RESUME COMMANDS
```sh
git branch --show-current
git status --short --branch
npm test
npm run check:migrations
git diff --check
```
