# NovaPay Continuity Context

## HEADER
- Date/time: 2026-11-01 10:32 IST
- Branch: `fix-documents-confirm`, based on unmerged `fix-ocr-validation` (PR #9 remains open); no push authorized.
- Task: document confirmation, confidence, and live invoice view repair.

## DONE
- Root cause: blank required Supplier email causes client validation to return before any HTTP request; prior validation only showed a generic status message.
- Confirmation now sends one request. Additive migration 0017 links one org-scoped invoice draft to the source document, confirms and audits atomically, and returns the same draft on retry.
- Server recomputes subtotal/tax/total in integer minor units and rejects mismatches. UI shows inline field errors/toast, a draft link, and refreshes Invoices.
- Invoices view no longer shows seed rows; it loads `/api/invoices` and saves its existing draft form through the API.
- Confidence display is code-derived: arithmetic can verify amount fields; date/currency and OCR text matches are labelled; model-only values are capped and labelled unverified.
- Field review uses existing theme tokens, with one field per row.

## IN PROGRESS
- Local code and migration 0017 complete; migration is not applied. No live invoice row was created or verified.

## NEXT STEPS
1. Apply `supabase/migrations/0017_document_invoice_confirmation.sql` in the Supabase SQL Editor and confirm `applied`.
2. Restart `npm start`; sign in as the fixed owner and open Documents.
3. Open existing processed `Invoice_D_TEST-001.pdf`, fill Supplier email and review fields, click Confirm once; verify one draft appears in Invoices and linked document state.
4. Repeat-click/retry the same confirmation and verify invoice row count stays one.
5. Complete browser checks listed in the current task; do not upload or invoke Gemini.

## USER ACTIONS PENDING
- Apply migration 0017: Supabase Dashboard → project → SQL Editor → New query → paste the full contents of `supabase/migrations/0017_document_invoice_confirmation.sql` → Run → confirm `applied`.
- Browser verification after apply: sign in as fixed owner; Dashboard → Documents → open already processed Invoice_D_TEST-001.pdf; leave Supplier email blank and click Confirm to verify inline error/toast without a request; enter a valid email and click once; open Invoices and verify one live draft; return and repeat confirmation only if it is available; verify count remains one. Check both light and dark themes.

## LIVE STATE
- No Gemini requests, uploads, or live invoice confirmations performed.
- Migration 0017 pending human application; migrations 0001–0016 previously applied.
- No secrets or environment values recorded.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Focused confirmation/OCR/invoice tests | PASS | 33/33 |
| Full `npm test` | FAIL | 177/178; known authenticated client no-store failure |
| Migration syntax | PASS | 17/17 parsed; 0017 not live-applied |
| Changed JS syntax | PASS | `node --check` all changed JS |
| `git diff --check` | PASS | clean |
| Protected-file diff vs origin/main | PASS | empty |
| Existing sample confirmation and invoice row count | UNVERIFIED | Requires migration 0017 and browser action; no live mutation performed |

## KNOWN ISSUES AND RISKS
- Migration 0017 must be applied before the new confirmation endpoint can work against Supabase.
- Full suite retains the known unrelated API `Cache-Control: no-store` failure.
- Browser checks are pending; no visual/browser run was performed.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime errors roll back. Never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs must revoke execution from public, anon, authenticated and grant only service_role.
- Never print `.env` values, keys, JWTs, or document content.
- Never claim PASS for an unrun check.

## DO NOT
- Do not push, merge, upload documents, or call Gemini in this task.
- Do not edit protected design files or weaken tests.
