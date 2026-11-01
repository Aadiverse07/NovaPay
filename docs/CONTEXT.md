# NovaPay Continuity Context

## HEADER
- Date/time: 2026-11-02 Asia/Kolkata
- Branch: `fix-download-campaigns`; based on `origin/main` invoice work; no push.
- Latest local implementation commit: `2441c95` (migration 0019 pending); no push.
- Task: diagnose/fix TEST-001 PDF HTTP 503.

## DONE
- Reproduced GET `/api/invoices/:id/download` as the fixed existing owner on the existing TEST-001 draft; no users created.
- Exact sanitized log: `Error`, `INVOICE_AUDIT_WRITE_FAILED`, status 503, SQLSTATE 42501, `permission denied for table audit_log`. Invoice reads and PDF construction reach the audit insert; route previously hid this behind a generic 5xx body.
- Added a specific audit error wrapper and safe logging of error name/code/status/SQLSTATE plus allowlisted privilege/RLS message. Audit failure still prevents returning a PDF.
- Added migration `supabase/migrations/0019_restore_audit_log_service_insert.sql`: revoke table privileges, then grant INSERT to service_role only. NOT applied.
- Added regression tests for SQLSTATE 42501 failure and PDF builder output with INR 137.50, INR 13,440.00, long names and multiple lines.
- A synthetic PDF is saved at `/tmp/novapay-invoice-fixture.pdf` (1,755 bytes; `%PDF-`; `%%EOF`). The real TEST-001 download is still UNVERIFIED because the audit insert is denied.

## IN PROGRESS
- Full suite 205/206 (known no-store test only); migration check 19/19; changed JS syntax 10/10; diff check passes; protected-file diff empty.
- Need human to apply migration 0019 before repeating live download.

## NEXT STEPS
1. In Supabase Dashboard → SQL Editor → New query, paste the contents of `supabase/migrations/0019_restore_audit_log_service_insert.sql` and Run. Verify with `select has_table_privilege('service_role','public.audit_log','INSERT');` (expect true).
2. Restart the local server and repeat fixed-owner TEST-001 download; confirm HTTP 200, `application/pdf`, size, `%PDF-` and `%%EOF`, and an audit row.
3. Run `npm test`, `npm run check:migrations`, `node --check`, `git diff --check`, and protected diff; WIP-commit locally; never push.

## USER ACTIONS PENDING
- Apply migration 0019 exactly as above. The live permission is missing despite older migration definitions; no code path should bypass the audit requirement.
- After applying, rerun the real API download. No new users/documents are needed.

## LIVE STATE
- TEST-001 exists as a draft in the fixed owner's org. Last live download returned 503; no invoice row was changed and no PDF was returned. No PayPal/Gemini calls.
- Migration 0019 is local and unapplied.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Live TEST-001 download before migration | FAIL | 503; SQLSTATE 42501 permission denied on audit_log |
| PDF fixtures | PASS | Four shapes produce PDF bytes; synthetic temp file 1,755 bytes with header/EOF |
| `npm test` | FAIL | 205/206; known no-store assertion only |
| `npm run check:migrations` | PASS | 19/19 |
| JS syntax | PASS | 10/10 changed files |
| Diff/protected-file checks | PASS | clean / empty |
| Real API PDF saved file | UNVERIFIED | blocked until migration 0019 is applied |

## KNOWN ISSUES
- Real PDF response is fail-closed until the service_role INSERT grant exists on the live audit_log table.
- Full test suite retains the known no-store assertion failure.

## LESSONS LEARNED
- SQL Editor executes one transaction; errors roll it back. Never edit an applied migration.
- SECURITY DEFINER/posting RPCs revoke from public/anon/authenticated and grant service_role only.
- PostgREST embeds need explicit FK names when multiple relationships exist.
- audit_log is insert-only and ON DELETE RESTRICT; test cleanup removes journals first.
- PayPal webhooks require `/api/webhook` and raw body for signature verification.
- Never print `.env` values, keys or JWTs.

## DO NOT
- Never push, create users, call Gemini/PayPal, weaken tests, edit protected files, or commit `.env`.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
