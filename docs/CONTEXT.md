# NovaPay Context

## HEADER
- Date: 2026-11-01; branch `codex/voice-assistant`; based on published main `3b14187`; latest local checkpoint `4764c31`; current task: Voice assistant implementation, task 1/1; implementation complete, local checkpoint pending.

## DONE
- Shared browser/server action registry in `src/assistant-actions.js` and `server/src/ai/actions.js`; server validates schema, user intent and role, with deterministic command fast path.
- Extended AI chat with bounded voice context/history/interruption, short safe `speak`, and validated action results. No provider calls were made.
- Added lazy Web Speech controller, wake-word capture, TTS greeting/replay, turn-taking, echo rejection, barge-in, bounded exponential restart/retry cap, 15-second confirmation, microphone echo/noise constraints, mute, visibility/sign-out/unload cleanup.
- Added Tier 0 direct navigation/read controls, Tier 1 confirm-before-execute and Tier 2 human-only navigation; action audit before offering/writing, role checks, five-per-user-per-minute Tier 1/2 cap, fail-closed audit errors.
- Added invoice/campaign refresh hooks and API contract docs. Human browser steps: `docs/VOICE-BROWSER-CHECKLIST.md`.

## IN PROGRESS
- No code task remains. Final docs/checkpoint commit pending. Files changed: `dashboard.html`, `preview.html`, `src/assistant-actions.js`, `src/assistant-client.js`, `src/dashboard.js`, `src/invoices-live.js`, `src/novapay-live.js`, `src/voice-assistant.js`, `src/voice-greeting.js`, `server/src/ai/actions.js`, `server/src/app.js`, `server/src/routes/ai.js`, `server/src/services/ai.js`, `server/test/assistant-actions.test.js`, `server/test/assistant-client.test.js`, `server/test/routes.test.js`, `server/test/voice-assistant.test.js`, `server/test/voice-greeting.test.js`, `docs/API.md`, `docs/FRONTEND-CONTRACT.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/CONTEXT.md`, `docs/WORKLOG.md`, `docs/VOICE-BROWSER-CHECKLIST.md`.

## NEXT STEPS
1. Check `git status`, `.env` tracking/staging and final diff; ensure only the files above are included.
2. Commit locally with `WIP-BROKEN: voice assistant with known baseline no-store test failure`; do not push.
3. Human runs `docs/VOICE-BROWSER-CHECKLIST.md` with an already signed-in fixed owner and browser microphone; do not claim browser success from unit tests.
4. Fix the separate `server/test/api-client.test.js` no-store failure only in a separately scoped task.

## USER ACTIONS PENDING
- In Chrome/Edge, open localhost and complete all steps in `docs/VOICE-BROWSER-CHECKLIST.md`; record PASS/FAIL manually. Mic permission may be requested.

## LIVE STATE
- No Supabase, Gemini or PayPal requests; no migrations run. Configuration secrets were not printed; `.env` remains untracked.

## TEST STATE
| Check | Status | Date | Command/details |
|---|---|---|---|
| Focused voice/action/client/routes | PASS | 2026-11-01 | `node --test ...` 33/33 |
| Full suite | FAIL | 2026-11-01 | `npm test` 269/270; known `api-client.test.js` no-store assertion only |
| Migration parser | PASS | 2026-11-01 | `npm run check:migrations`, 21/21 through 0021 |
| Modified JS syntax | PASS | 2026-11-01 | `node --check` on changed JS/test files |
| Whitespace/protected diff | PASS | 2026-11-01 | `git diff --check`; protected-file diff empty |
| Real browser/mic | UNVERIFIED | 2026-11-01 | Not run; live signed-in calls excluded from fake-only verification |

## KNOWN ISSUES AND RISKS
- Existing no-store assertion remains the sole failing test.
- Browser speech services and microphone permissions vary; browser checklist is still pending.
- Node emits a non-failing typeless-package warning when node:test imports browser ESM `.js`; root package type was not changed to avoid affecting the CommonJS server entry.
- A few high-risk actions deliberately only navigate to the relevant human workflow; voice cannot execute Tier 2. `data.query` is fulfilled by the chat request and should not be rendered as a separate UI action.

## LESSONS LEARNED
- Supabase SQL Editor runs in one transaction; never edit an applied migration; create a new numbered file.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated and grant only service_role; verify denial with ordinary user JWT.
- PostgREST embeds require explicit foreign-key names when relationships are ambiguous.
- audit_log is insert-only with ON DELETE RESTRICT; cleanup journal entries before audit rows/org/auth users.
- PayPal Sandbox needs a US Personal buyer, USD seller, Visa checkout, matching webhook ID and `/api/webhook`; raw body is required for signature verification.
- Never print `.env` values; report key names only.

## DO NOT
- Never push, expose secrets/JWT/OTP, call live Gemini/PayPal/Supabase, run migrations, trust model actions, let voice complete Tier 2, click arbitrary DOM, or touch protected visual/auth redirect files.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
