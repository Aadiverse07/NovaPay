# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-31 (Asia/Kolkata)
- Branch: `fix-ocr-validation`, based on `fix-login-errors`; no push
- Current task: diagnose/fix OCR validation for two existing sample invoices

## DONE
- Added field/rule-only validation diagnostics in `server/src/services/documentOcr.js`; no rejected values or document text enter error messages.
- Failed document extraction stores `errorCode`, safe `errorMessage`, and `validationIssues`. Structured API error responses expose sanitized `{path, rule}` fields.
- Normalizes JSON code fences/wrappers, finite numeric amounts, valid thousands grouping, `₹` markers (infers INR only when currency absent), and `DD Mon YYYY` dates.
- Invalid ISO currencies and mismatched currency symbols still fail; malformed JSON remains rejected; wrong totals remain arithmetic warnings, not corrected values.
- Tests cover field type/path/rule, unexpected/missing fields, malformed JSON, wrappers, grouped/numeric/INR amounts, date normalization, invalid currency/symbol mismatch, and arithmetic warning.

## IN PROGRESS
- The live sample upload was not performed because native Chrome/file-picker control was denied. Existing failed rows still have only `OCR_FIELD_VALIDATION`; exact original field names remain unknown.

## NEXT STEPS
1. In the existing Aadi owner dashboard, select `/Users/aditya/Downloads/Invoice_A_TEST-001_correct.pdf` exactly once. The updated server is running on port 3000 and captures safe request logs in `/tmp/novapay-ocr-diagnostic.log`.
2. Report only `error.fields` paths/rules; verify whether normalization resolves the sample. Do not upload any file more than once.
3. Re-run `npm test` after the live observation; the known unrelated cache test expects `Cache-Control: no-store`.

## USER ACTIONS PENDING
- Allow/select the named sample file in Chrome’s native picker once (or provide the sanitized API result with field names/rules). No credentials or document text should be shared.

## LIVE STATE
- Existing Aadi owner org was read-only; no users/orgs/docs changed by this task.
- No document API POST occurred after server restart; upload did not happen.
- Server config was loaded from dotenv at startup; no secret values recorded. The new server is up on port 3000.
- Key names only: `GEMINI_API_KEY`, `DOCUMENT_OCR_MODEL`, `AI_DAILY_USER_LIMIT`, `AI_DAILY_ORG_LIMIT`.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Focused OCR/document processing | PASS | 17/17 |
| Full suite | FAIL | 173/174; known API client no-store assertion |
| Migrations | PASS | 16/16 |
| Changed JavaScript syntax | PASS | app, document route/service, and two tests parse |
| `git diff --check` | PASS | Clean |
| Protected-file diff | PASS | Empty against origin/main |
| Actual A sample processing / failing fields | UNVERIFIED | Chrome file picker permission denied; no API request logged |
| Existing A/B persisted failure detail | UNVERIFIED | Stored rows only have generic error code; no message before this change |

## KNOWN ISSUES AND RISKS
- Exact original A/B provider field failures are unavailable. Do not claim formatting normalization fixed those rows until the one allowed A upload is processed.
- Full suite retains unrelated no-store failure.

## LESSONS LEARNED
- Never print `.env` values, keys, passwords, JWTs, or document content.
- OCR output is untrusted; keep strict schema/currency/arithmetic checks. Report paths/rules only.
- Existing failure rows store only errorCode; this change persists diagnostics for subsequent failures.

## DO NOT
- Never push, create users, upload either sample more than once, expose document text, or weaken validation.
