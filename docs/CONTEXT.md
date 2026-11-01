# NovaPay Continuity Context

## HEADER
- Date/time: 2026-11-01 Asia/Kolkata
- Branch: `fix-invoices-crud`, created from `origin/main` at `a226d59`; last code checkpoint `4622169`; handoff commit `ca54539`; no push.
- Phase/task: invoice create, update, review, delete and void repair.

## DONE
- Traced nonresponsive Create invoice button: modal opener accessed issue/due date controls absent from the form, throwing before any API call. Form now contains both controls and resets into create mode.
- Removed the client-only invoice row submit path; authenticated invoice writes go through the org-scoped API.
- Added API support for create (UUID idempotency key), draft update, review, reviewed-to-draft reopen, draft delete and reviewed/sent void; server computes totals from line items.
- Added migration 0018 for issue/due dates, notes, mutation/idempotency RPCs, service-role-only grants and audit rows. It is NOT applied.
- Added owner/admin/accountant gating, viewer/resident hidden writes, inline field error paths, loading/empty/error states and an always-SIMULATED invoice approval request.
- Added route and migration tests covering totals, tampered totals, roles, tenant isolation, lifecycle, audit expectations and create/delete idempotency.
- Files edited: `dashboard.html`; `src/modules.js`, `src/invoices-live.js`, `src/api-client.js`; `server/src/routes/invoices.js`, `server/src/routes/approvals.js`, `server/src/services/invoices.js`, `server/src/repos/postgres.js`, `server/src/repos/memory.js`; `server/test/invoices-crud.test.js`, `server/test/invoice-crud-migration.test.js`, `server/test/phase3-services.test.js`; `supabase/migrations/0018_invoice_crud.sql`; `docs/API.md`, `docs/FRONTEND-CONTRACT.md`, `docs/CONTEXT.md`, `docs/WORKLOG.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`.

## IN PROGRESS
- Implementation is checkpointed locally. Live CRUD and browser flows depend on migration 0018 and a signed-in owner session.

## NEXT STEPS
1. Human applies migration 0018 in Supabase SQL Editor.
2. Re-run fixed-owner live CRUD/status checks after migration; do not create users or use PayPal/Gemini.
3. Complete the browser checks listed under USER ACTIONS PENDING.
4. Push only if separately authorized; current task did not authorize pushing.

## USER ACTIONS PENDING
- In Supabase Dashboard → SQL Editor → New query, paste the full contents of `supabase/migrations/0018_invoice_crud.sql`, click Run, confirm success, and reply `applied`. Do not run live invoice CRUD before then.
- Browser: sign in as fixed owner; open Invoices; create a draft; edit; review; move back to draft; delete; create another; review; add Send to Approvals (verify SIMULATED copy only); void; verify sent/paid read-only cases if records are available. Repeat viewer role and confirm no write controls.

## LIVE STATE
- Migration 0017 is previously user-confirmed applied; 0018 is new and unapplied.
- No live invoice CRUD was attempted; no new users or records created. No Gemini or PayPal calls made.
- Fixed-owner live API verification: UNVERIFIED pending migration 0018 and authenticated session availability.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Focused invoice CRUD, migration and document-confirm tests | PASS | 5/5; local API/fake repositories and SQL static assertions |
| `npm run check:migrations` | PASS | 18/18 parsed; 0018 syntax only, not applied |
| Full `npm test` | FAIL | 193/194; known `authenticated API client bypasses conditional HTTP caching` no-store assertion only |
| `node --check` changed JavaScript | PASS | all 11 changed JS files |
| `git diff --check` | PASS | clean |
| Protected-file diff vs `origin/main` | PASS | empty |
| Live owner CRUD/status counts | UNVERIFIED | migration 0018 not applied; no live writes made |
| Browser checks | UNVERIFIED | human checklist above |

## KNOWN ISSUES AND RISKS
- Migration 0018 must be applied before invoice create/update/delete RPCs work against Supabase.
- Live CRUD and visual/browser behavior have not been verified; 0018 is not applied.
- Full suite retains the known no-store header failure (193/194).
- Invoice send remains simulated: approval records local state only and never calls PayPal Invoicing.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime errors roll back. Never edit an applied migration; add a numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; verify ordinary JWT gets 403.
- PostgREST embeds need explicit FK names when multiple relationships exist.
- `audit_log` is insert-only with ON DELETE RESTRICT; clean journal entries before audit_log/org/auth-user test data.
- PayPal Sandbox buyer must be a US Personal account; seller USD; webhook URL ends `/api/webhook`; webhook ID must match.
- PayPal signature verification requires the raw body.
- Never print `.env` values; use key names only.

## DO NOT
- Never push, force-push, or switch to main for commits. Do not create users, call Gemini/PayPal, edit protected design files, weaken tests, or commit `.env`.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
