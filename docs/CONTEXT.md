# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-28 (Asia/Kolkata)
- Branch: `phase5-backend`
- Last commit: `518a353` (Part 3 checkpoint; Part 4 local commit pending)
- Current phase/task: Phase 5, Part 4 — Documents view wiring and docs

## DONE
- Phase 5 Parts 1–3 completed; migrations 0015 and 0016 user-applied; prior live RPC boundary checks are recorded in TEST-REPORT.md.
- Part 4 implementation: tenant-scoped `GET /api/documents`; raw File/Blob upload; live list, empty and error states; OCR field/confidence review; duplicate/arithmetic warnings; reject; confirmation metadata linked to the invoice draft ID. No send endpoint is called.
- Part 4 docs and manual checklist updated. Files touched: `.env.example`, `dashboard.html`, `docs/API.md`, `docs/BROWSER-CHECKLIST.md`, `docs/CONTEXT.md`, `docs/DECISIONS.md`, `docs/FRONTEND-CONTRACT.md`, `docs/RUNBOOK.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`, `server/src/routes/documents.js`, `server/test/document-processing.test.js`, `server/test/documents-upload.test.js`, `src/api-client.js`, `src/documents.js`.

## IN PROGRESS
- Exact task: commit verified Part 4 changes locally; no implementation work remains.
- Edited implementation: document list/confirm routes in `server/src/routes/documents.js`; API tests in `server/test/documents-upload.test.js` and `server/test/document-processing.test.js`; Blob support in `src/api-client.js`; view controller in `src/documents.js`; panel/script in `dashboard.html`.
- Remaining: verify no `.env` or secrets are staged/tracked, commit on `phase5-backend`, then hand browser checklist to human.

## NEXT STEPS
1. Confirm `git branch --show-current` is `phase5-backend`; inspect `git status --short` and ensure `.env`/secrets are absent.
2. Commit locally with a Part 4 WIP message; never push.
3. Human completes `docs/BROWSER-CHECKLIST.md` using fixed named owner/viewer test accounts and synthetic documents only.

## USER ACTIONS PENDING
- Browser-only validation: complete `docs/BROWSER-CHECKLIST.md` manually.
- No migration application is pending for Part 4.

## LIVE STATE
- Supabase migrations 0001–0016: user-confirmed applied. Latest live Part 3 RPC checks are recorded in TEST-REPORT.md; no Part 4 live run was performed.
- Tunnel/webhook: last reported fixed by user; not checked during Part 4.
- Latest Part 4 offline checks: `npm test` PASS 164/164; `npm run check:migrations` PASS 16/16; changed JS syntax PASS (5 files); `git diff --check` PASS; protected-file diff vs main empty.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `DOCUMENT_OCR_MODEL`, `DOCUMENT_MAX_FILE_MB`, `DOCUMENT_MAX_PAGES`, `DOCUMENT_MAX_CONCURRENT_JOBS_PER_ORG`, `DOCUMENT_MAX_UPLOADS_PER_ORG_PER_HOUR`.

## TEST STATE
| Check | Status | Date | Command / evidence |
|---|---|---|---|
| Cross-tenant retrieval denial | UNVERIFIED | 2026-10-28 | Org scope asserted; no foreign-tenant result probe. |
| Duplicate upload flag | PASS | 2026-10-28 | `npm test`; duplicate hash becomes DUPLICATE_DOCUMENT. |
| Wrong-total arithmetic flag | PASS | 2026-10-28 | `npm test`; extraction mismatch produces warning. |
| Hidden-instruction injection | PASS | 2026-10-28 | `npm test`; OCR and answer prompt-boundary tests. |
| Delete removes chunks/search hits | UNVERIFIED | 2026-10-28 | Static cascade/RPC checks; no live rows deleted. |
| Storage-object RLS | UNVERIFIED | 2026-10-28 | No direct object-policy probe. |
| Part 4 unit/integration suite | PASS, 164/164 | 2026-10-28 | `npm test`; one failed run diagnosed and fixed with route-local JSON parsing, then rerun passed. |
| Migration syntax | PASS, 16/16 | 2026-10-28 | `npm run check:migrations`. |
| Changed JS syntax | PASS, 5 files | 2026-10-28 | `node --check` on changed JS. |
| Whitespace/protected paths | PASS | 2026-10-28 | `git diff --check`; protected diff vs main empty. |
| Browser Documents flow | UNVERIFIED | 2026-10-28 | Human checklist not run. |

## KNOWN ISSUES AND RISKS
- Invoice draft creation and document confirmation are separate requests. If draft creation succeeds and confirmation fails, UI warns not to create another draft blindly.
- Browser behavior, real Storage-object RLS, cross-tenant retrieval denial, and actual cascade deletion remain unverified.
- Free-tier OCR/embedding provider terms may permit use of submitted data; use synthetic sample documents only.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER/posting RPC must revoke public, anon, authenticated and grant only service_role; prove ordinary JWT denial (403).
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only with ON DELETE RESTRICT; cleanup order: journal_entries (lines cascade), audit_log, organizations, auth.users via manual cleanup script. Reuse fixed named users/orgs.
- PayPal sandbox buyer must be US Personal; seller USD only; use Visa; webhook URL ends `/api/webhook`; webhook ID must match.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT LIST
- Do not push, switch to or commit on `main`/`backend`, touch protected design files, use `--force`, run `npm audit fix --force`, weaken tests, edit applied migrations, or commit `.env`.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- `npm test`
- `npm run check:migrations`
