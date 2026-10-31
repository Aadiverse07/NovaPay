# NovaPay Continuity Context

## HEADER
- Date/time: 2026-11-01 (Asia/Kolkata)
- Branch: `fix-ocr-validation`, based on `fix-login-errors`
- Pushed head: `3e0ff49`; PR #9 OPEN into `main`; no merge or second push

## DONE
- Login uses Supabase on preview; saved sessions restore existing workspace; dashboard waits for auth; Documents reloads role fresh.
- OCR failure diagnostics store/return safe field paths and rules, never rejected values or document text.
- OCR normalizes JSON wrappers, numeric/grouped/₹ amounts and `DD Mon YYYY` dates; invalid ISO currencies, symbol mismatch, malformed JSON and wrong totals remain visible.
- C’s stored root cause: missing currency with monetary amounts (`currency: required_when_amounts_present`). It now processes with `currency_missing` review warning; the Documents view requires reviewer to select currency before draft creation.
- Duplicate lookup excludes `failed` rows but continues to count `rejected` rows.

## IN PROGRESS
- PR #9 open for team review. Live re-upload was not performed because user explicitly prohibited uploads.

## NEXT STEPS
1. Review PR #9: https://github.com/Aadiverse07/NovaPay/pull/9
2. If approved later, re-upload existing Invoice_C_TEST-003.pdf once; verify it processes and shows currency_missing, then choose correct currency before drafting.
3. Keep `npm test` no-store failure tracked separately; do not weaken its assertion.

## USER ACTIONS PENDING
- Review PR #9. Optional later: authorize/perform the existing sample re-upload and browser review; no upload occurred in this task.

## LIVE STATE
- Read-only metadata query only; no users or database rows changed. No upload/reprocess performed.
- `.env` is untracked; no secret values are recorded.
- Pushed branch head is `3e0ff49`; PR #9 OPEN; local handoff docs will be committed after this update without another push.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Focused OCR/document tests | PASS | 18/18 |
| Full suite | FAIL | 174/175; known API client no-store assertion |
| Migrations | PASS | 16/16 |
| Changed JavaScript syntax | PASS | All changed JS files parse |
| `git diff --check` | PASS | Clean |
| Protected-file diff | PASS | Empty |
| Secret scan | PASS | Zero files/lines matched |
| Live C reprocess | UNVERIFIED | User prohibited uploads; row remains failed |

## KNOWN ISSUES AND RISKS
- C still has failed state until a later re-upload; this task did not mutate it.
- Full suite has one known unrelated no-store failure.

## LESSONS LEARNED
- Never print `.env` values, passwords, JWTs, keys or document content.
- Missing currency can be reviewed without inventing it; require human selection before draft.
- Failed OCR attempts should not permanently block same-hash re-uploads; rejected docs still count.

## DO NOT
- Do not push again, merge PR #9, create users, or upload documents without later instruction.
