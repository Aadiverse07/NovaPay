# NovaPay Continuity Context

## HEADER
- Date/time: 2026-11-01 11:45 IST
- Branch: `fix-ai-assistant`, based on `origin/main` at `b21c442` (PR #10 merge); local checkpoint `8b6f734`, no push.
- Phase/task: AI Assistant money-unit evidence formatting repair; code checkpoint `5e11456`.

## DONE
- `src/assistant-client.js` maps backend answer/route/reason/citations and makes message-only calls through the auth-aware API client.
- `src/novapay-live.js`, `src/dashboard.js`, and `dashboard.html` now use the authenticated API in session mode; local fallback is explicitly labelled and gated to demo mode only.
- Removed transaction DOM context and browser file-text ingestion from assistant requests. File button opens Documents.
- Backend greets vague help requests deterministically without LLM tokens; UI shows route labels, hover reason, citation IDs, empty-evidence and user-safe errors.
- Tests cover message-only request, demo gate, errors, route/citations, no browser context, greetings, currency exponents and labeled invoice/transaction/fee/ledger evidence.
- Currency formatter derives minor-unit exponents from ISO currency metadata; deterministic SQL and FX answers return formatted amounts with currency codes.

## IN PROGRESS
- Money-unit changes and tests are committed locally as `5e11456` (`WIP-BROKEN:`) due the known no-store test failure. No push or LLM calls.

## NEXT STEPS
1. Review `git status --short` and stop; no live or LLM verification was requested for this change. Never push.

## USER ACTIONS PENDING
- None for this task.

## LIVE STATE
- `/api/status`: HTTP 200, server reports authenticated mode, Supabase configured, AI configured.
- Unauthenticated `POST /api/ai/chat` with only a harmless greeting: HTTP 401, `AUTH_REQUIRED`; this was a route probe, not a fixed-owner check.
- No signed-in browser request log was available; current server process is listening on port 3000.
- No users created; no LLM calls made; no `.env` values recorded.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Focused assistant/evidence/FX/router/cache/injection suite | PASS | 51/51 |
| `npm test` | FAIL | 189/190; known `authenticated API client bypasses conditional HTTP caching` no-store assertion |
| `npm run check:migrations` | PASS | 17/17 parsed |
| `node --check` changed JS | PASS | 8 files |
| `git diff --check` | PASS | clean |
| Protected-file diff vs origin/main | PASS | empty (67 protected paths) |
| Currency exponent formatting (INR/JPY/KWD) | PASS | 13750 minor => 137.50 INR / 13750 JPY / 13.750 KWD |
| Invoice evidence minor labels and formatting | PASS | `*_minor` plus `*_formatted`; no unlabelled total field |
| Owner live questions | UNVERIFIED | not run; no LLM calls made |

## KNOWN ISSUES AND RISKS
- Full suite still has the previously known API no-store header test failure; this task did not alter that code.
- Full suite retains the known API no-store header failure; money-unit changes do not touch that path.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; errors roll back everything. Never edit an applied migration; add a numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only service_role; verify ordinary-user JWT receives 403.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- Audit log is insert-only with ON DELETE RESTRICT; cleanup journal entries, audit log, organizations, auth users in that order via the approved script.
- PayPal Sandbox buyer must be US Personal; seller USD; use Visa; webhook ends `/api/webhook` and ID must match.
- PayPal signature verification needs the raw body.
- Never print `.env` values; use key names only.

## DO NOT
- Do not push, force-push, touch main, create users, call Gemini directly, or alter protected design files.
- Do not weaken tests or commit `.env`.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
