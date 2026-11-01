# NovaPay Continuity Context

## HEADER
- Date/time: 2026-11-01 Asia/Kolkata
- Branch: `fix-invoice-view`, based on `fix-invoices-crud` at `f113f54`; no push.
- Phase/task: invoice detail View and authenticated PDF download.

## DONE
- Diagnosed View: its handler fetched `/api/invoices/:id` then showed a toast; an existing modal opener ignored buttons. Rewired View to open detail from the org-scoped API response.
- Added accessible detail view for invoice status, customer, dates, currency, lines, minor-unit totals, notes, linked document and scoped `invoice_events` history. Uses text nodes, loading/error states, close/Escape and focus restoration.
- Added server-generated PDF from stored invoice values using the existing pinned pdf-lib. Includes status/DRAFT mark, line items, totals, notes, footer, and page breaks for long invoices.
- Added org-scoped authenticated download endpoint with `application/pdf`, safe filename, 20/user/hour route limit and invoice-ID-only audit row. Viewer can download; foreign org receives 404.
- Added authenticated blob handling and downloads in each row and the detail view. No migration or package change.
- Files: `dashboard.html`; `src/api-client.js`, `src/invoice-detail.js`, `src/invoices-live.js`; `server/src/routes/invoices.js`, `server/src/repos/memory.js`, `server/src/repos/postgres.js`, `server/src/services/invoicePdf.js`; `server/test/api-client.test.js`, `server/test/invoice-download.test.js`, `server/test/postgres-repos.test.js`; `docs/API.md`, `docs/FRONTEND-CONTRACT.md`, `docs/DECISIONS.md`, `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`.

## IN PROGRESS
- Implementation and local checks are complete in commit `da8e4a7` (plus this handoff update); no push. Browser verification remains pending.

## NEXT STEPS
1. Complete the browser checklist below by hand.
2. Never push.

## USER ACTIONS PENDING
- Browser: sign in as owner; open Invoices; click View and verify customer, dates, lines, INR 134.40 formatting, notes, linked document/history where present; close with × and Escape; confirm focus returns to View.
- Click row Download and detail Download; verify `invoice-<number>.pdf`, DRAFT mark for draft/reviewed, page breaks with many lines, footer, and viewer can download. Verify sent invoice says SIMULATED, not delivered.
- Repeat View/download as viewer; verify foreign-organization invoice IDs return 404.

## LIVE STATE
- No new users or live invoice records created. No Gemini or PayPal calls made. No migration is required.
- Live owner/browser verification: UNVERIFIED; only local tests have been run.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Invoice download and Postgres repository tests | PASS | 18/18; PDF bytes, auth, tenant scope, audit, status events and pagination |
| Invoice status-history repo assertions | PASS | org and invoice filters tested |
| `npm test` | FAIL | 200/201; one known `Cache-Control: no-store` assertion only |
| `npm run check:migrations` | PASS | 18/18 |
| `node --check` | PASS | 10 changed JS files |
| `git diff --check` | PASS | clean |
| Protected-file diff | PASS | empty vs `origin/main` |
| Live/browser checks | UNVERIFIED | human actions listed above |

## KNOWN ISSUES AND RISKS
- Full suite has a known unrelated API no-store assertion failure from the prior task; this task does not change cache policy (200/201).
- Download depends on stored invoice data and service-role audit insert; verify after local tests. No schema change expected.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; errors roll everything back. Never edit an applied migration; add a numbered file.
- SECURITY DEFINER/posting RPCs revoke public/anon/authenticated and grant only service_role; verify ordinary JWT access is denied.
- PostgREST embeds need explicit FK names when multiple relationships exist.
- `audit_log` is insert-only with ON DELETE RESTRICT; test cleanup removes journal rows first.
- PayPal Sandbox webhook URL ends `/api/webhook`; raw body is required for signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Never push, force-push, create users, call Gemini/PayPal, edit protected design files, weaken tests, or commit `.env`.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
