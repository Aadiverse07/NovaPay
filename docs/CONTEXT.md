# NovaPay Continuity Context

## HEADER
- Date/time: 2026-11-01 (Asia/Kolkata)
- Branch: `fix-ocr-validation`, based on `fix-login-errors`; no push
- Current task: resolve Invoice_C_TEST-003 OCR validation and duplicate retry behavior

## DONE
- Read-only lookup found C in org `59bd3bcb-0c4b-4479-aa32-cbaeb65ec678`, status `failed`, code `OCR_FIELD_VALIDATION`, safe message `currency: required_when_amounts_present`.
- Latest three ai_usage rows for org: route `ocr`, status `invalid_response`.
- Root cause: validator treated absent currency as fatal whenever amounts existed. Missing currency is now a visible review warning; it is not inferred unless an explicit rupee marker indicates INR.
- Invalid ISO currencies and currency-symbol mismatch still fail; wrong totals remain flagged as arithmetic warnings. Documents view asks reviewer to select currency before creating invoice draft.
- Duplicate query excludes `failed` documents (`status=neq.failed`); rejected, processed and other nonfailed rows continue to block same-hash duplicates.
- Added tests for missing-currency warning through service/route and failed-vs-rejected duplicate behavior.

## IN PROGRESS
- No live upload/reprocess performed; user explicitly prohibited uploads. C remains failed until a later owner re-upload/retry.

## NEXT STEPS
1. Do not upload in this turn. Later, owner can re-upload the same file; the failed row will not block its hash.
2. Review the currency warning and enter the correct currency before invoice draft confirmation.

## USER ACTIONS PENDING
- None required now.

## LIVE STATE
- Read-only DB inspection only. No users, docs, Storage objects, or rows changed.
- No upload attempted. Existing A/B/C failures remain as recorded.
- No secrets or key values recorded.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Focused OCR/document processing | PASS | 18/18 |
| Full suite | FAIL | 174/175; known API-client `Cache-Control: no-store` assertion |
| Migrations | PASS | 16/16 |
| Changed JS syntax | PASS | app, document route/service, Documents view and two tests |
| `git diff --check` | PASS | Clean |
| Protected-file diff | PASS | Empty against origin/main |
| C failure reason | PASS | stored path/rule is `currency: required_when_amounts_present` |
| Re-upload duplicate policy | PASS | failed excluded; rejected still duplicate |
| Live reprocess | UNVERIFIED | no upload by explicit user instruction |

## KNOWN ISSUES AND RISKS
- C remains failed until a later owner retry/re-upload. The updated handler only affects new processing attempts.
- Full suite retains unrelated no-store failure.

## LESSONS LEARNED
- Never print `.env` values, credentials, JWTs or document content.
- Missing currency should be reviewable; never assign a currency without an explicit marker or user review.
- OCR errors expose field paths/rules only; never persist raw provider text.

## DO NOT
- Never push, create users, upload documents in this turn, expose document text, or weaken validation.
