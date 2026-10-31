# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-31 (Asia/Kolkata)
- Branch: `fix-login-errors`; work performed in `/Users/aditya/Paypal_hackathon/NovaPay`; no push
- Current task: diagnose two existing document processing failures; no users or records created

## DONE
- Running server is up on port 3000; `/api/status` confirms backend and Supabase configured.
- Current dotenv config (values never printed): Gemini key present, OCR model present, user daily limit 100, org daily limit 300. `.env` mtime precedes running server start; startup imports `dotenv/config`.
- Existing user is owner of org `59bd3bcb-0c4b-4479-aa32-cbaeb65ec678`.
- Both named document rows are `failed`, with stored `extraction.errorCode=OCR_FIELD_VALIDATION`; no stored failure message. Two latest org usage rows are route `ocr`, status `invalid_response`; schema has no error-code column.
- Route maps `OCR_FIELD_VALIDATION` to HTTP 422. `validateDocumentExtraction` is the likely failure stage after provider response; exact invalid field cannot be determined from persisted rows.
- No code/config fix applied; validation was not weakened.

## IN PROGRESS
- None; waiting for sanitized server log detail before proposing a specific validator or prompt correction.

## NEXT STEPS
1. Obtain the two safe server log lines or request IDs with HTTP status and error code only; do not include document text or secrets.
2. Identify exact schema/date/currency validation failure; only then consider a targeted fix and test.
3. Avoid re-upload/reprocessing until failure cause is known.

## USER ACTIONS PENDING
- If available, provide sanitized log records for the two `/api/documents/:id/process` requests (status/code only; no document content or credentials).

## LIVE STATE
- Running server process is up; started after `.env` mtime. `/api/status` does not expose OCR model/budget settings; current dotenv snapshot is present/100/300.
- Existing org only was queried read-only. No documents, users, or database rows changed.
- Server request logs go to terminal `/dev/ttys001`; no log file was identified or read.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| `npm test` | FAIL | 169/170; known `authenticated API client bypasses conditional HTTP caching` expects `Cache-Control: no-store` |
| `npm run check:migrations` | PASS | 16/16 migrations parse |
| `node --check` | PASS | `server/src/routes/documents.js`, `server/src/services/documentOcr.js` |
| `git diff --check` | PASS | Clean |
| Document A and B DB state | PASS (read-only evidence) | Both `failed`, `OCR_FIELD_VALIDATION`; no stored message |
| OCR usage | PASS (read-only evidence) | Two latest rows `ocr/invalid_response`; error code not in schema |
| Exact provider response/error and log lines | UNVERIFIED | No provider status saved; live stdout unavailable as a file |

## KNOWN ISSUES AND RISKS
- A and B have the same local validation failure; exact rejected field is not persisted or logged in an accessible file. Do not relax schema/arithmetic checks to make these pass.
- Full suite retains unrelated no-store failure.

## LESSONS LEARNED
- Never print `.env` values, keys, passwords, or JWTs; presence and approved numeric limits only.
- OCR extracted output is untrusted; preserve strict validation and use sample documents only.
- Failed document rows currently persist only an error code; usage rows persist `invalid_response` without provider/validation error code.

## DO NOT
- Do not push, create users, reprocess these documents, print secrets, or weaken validation.
