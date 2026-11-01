# NovaPay Continuity Context

## HEADER
- Date/time: 2026-11-01 11:01 IST
- Branch: `fix-ai-assistant`, based on `origin/main` at `b21c442` (PR #10 merge); local checkpoint `8b6f734`, no push.
- Phase/task: AI Assistant authenticated wiring and fallback repair.

## DONE
- `src/assistant-client.js` maps backend answer/route/reason/citations and makes message-only calls through the auth-aware API client.
- `src/novapay-live.js`, `src/dashboard.js`, and `dashboard.html` now use the authenticated API in session mode; local fallback is explicitly labelled and gated to demo mode only.
- Removed transaction DOM context and browser file-text ingestion from assistant requests. File button opens Documents.
- Backend greets vague help requests deterministically without LLM tokens; UI shows route labels, hover reason, citation IDs, empty-evidence and user-safe errors.
- Tests added for message-only request, demo gate, errors, route/citations, no browser context, and greetings.

## IN PROGRESS
- Code/tests/docs checkpointed locally as `8b6f734` (`WIP-BROKEN:`). No push.
- Owner live route checks are UNVERIFIED: browser session unavailable; no owner JWT used and no LLM call made.

## NEXT STEPS
1. In the fixed owner browser session, ask “Convert 5000 INR to USD” and “Show refunds this month”; verify Code and Database metadata/reasons.
2. Check `ai_usage` rows for zero LLM tokens for those requests. If daily budget allows, at most one “Why did our fees change?” request; record HTTP status only.
3. Verify greeting, citation chips, empty-evidence state, session/budget/provider/offline errors, no sample banner/rows, and request headers/body in DevTools.
4. Rerun the focused and full checks if code changes; commit locally with `WIP-BROKEN:` because the known no-store test still fails. Never push.

## USER ACTIONS PENDING
- Browser: start/reload `npm start` at localhost:3000; sign in as the fixed owner; click AI Assistant; enter each of the two questions above and click Send; hover each route badge; inspect citations and Network request; verify Transactions has no illustrative rows/banner; submit “hey can you help me in something”; test offline only if safely available.
- Check database `ai_usage` for the two code/SQL questions; no LLM invocation was made in this run.

## LIVE STATE
- `/api/status`: HTTP 200, server reports authenticated mode, Supabase configured, AI configured.
- Unauthenticated `POST /api/ai/chat` with only a harmless greeting: HTTP 401, `AUTH_REQUIRED`; this was a route probe, not a fixed-owner check.
- No signed-in browser request log was available; current server process is listening on port 3000.
- No users created; no LLM calls made; no `.env` values recorded.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Focused assistant/router/cache/injection/budget suite | PASS | 31/31 |
| `npm test` | FAIL | 183/184; existing `authenticated API client bypasses conditional HTTP caching` no-store assertion |
| `npm run check:migrations` | PASS | 17/17 parsed |
| `node --check` changed JS | PASS | 8 files |
| `git diff --check` | PASS | clean |
| Protected-file diff vs origin/main | PASS | empty (67 protected paths) |
| Owner FX route and zero LLM usage | UNVERIFIED | no browser owner session/JWT available |
| Owner SQL route and zero LLM usage | UNVERIFIED | no browser owner session/JWT available |
| Single optional LLM question | UNVERIFIED | not called; browser session unavailable |

## KNOWN ISSUES AND RISKS
- Full suite still has the previously known API no-store header test failure; this task did not alter that code.
- Live route metadata and ai_usage must be verified using the fixed owner session.

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
