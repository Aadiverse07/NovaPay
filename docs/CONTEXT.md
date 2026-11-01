# NovaPay Context

## HEADER
- Date: 2026-11-01; branch `codex/voice-assistant`; based on current published `main` (`3b14187`); last local checkpoint `d6f6b28` (documentation); voice assistant task in progress, backend/action protocol phase complete.

## DONE
- Confirmed 8-slot Gemini pool exists; tests exercise sequential exhaustion/fallback. No real provider calls made.
- Added shared action registry in `src/assistant-actions.js`; server imports the same list in `server/src/ai/actions.js`.
- Added allowlisted deterministic navigation/help/repeat/stop/upload/maintenance fast commands, role/schema and user-intent validation for model actions, bounded speech/context output, and server prompt protections.
- Added action registry drift, intent/role/schema and OCR-injection tests. Focused AI/action/LLM/routes tests: 39/39 PASS.

## IN PROGRESS
- Browser voice controller, greeting TTS, action rendering/execution and tests remain. Current server/action changes are uncommitted.
- Files changed this phase: `src/assistant-actions.js`, `server/src/ai/actions.js`, `server/src/services/ai.js`, `server/src/routes/ai.js`, `server/test/assistant-actions.test.js`, `server/test/llm.test.js`, plus docs.

## NEXT STEPS
1. Implement one lazy Web Speech controller with wake-word capture, turn-taking, barge-in, bounded restart backoff, visibility/logout teardown and TTS.
2. Integrate voice toggle/status/actions with the existing AI panel and add one-session intro greeting without changing intro timing/visuals.
3. Add controller state-machine and frontend request-shape/action-tier tests; run `npm test` after the next phase.
4. Complete API/docs, final checks, and exact browser verification report. Never push.

## USER ACTIONS PENDING
- Browser microphone checks require the human: Chrome on localhost, mic permission, wake word, barge-in, voice action confirmation, Tier 2 approval-only behavior, and voice-off check.

## LIVE STATE
- No Gemini/PayPal/Supabase calls and no migrations run. Secrets/JWTs not recorded.

## TEST STATE
| Check | Result | Date | Command/details |
|---|---|---|---|
| Focused AI/action/routes | PASS 39/39 | 2026-11-01 | `node --test server/test/assistant-actions.test.js server/test/ai.test.js server/test/llm.test.js server/test/routes.test.js` |
| Full suite | FAIL 255/256 | 2026-11-01 | `npm test`; sole known no-store assertion failure in `server/test/api-client.test.js` |
| Migration parser | PASS 21/21 | 2026-11-01 | Ran inside `npm test` |
| Browser voice flow | UNVERIFIED | 2026-11-01 | No browser/microphone verification performed |

## KNOWN ISSUES AND RISKS
- The known `Cache-Control: no-store` assertion remains failing; it was not changed.
- Tier 1 actions must remain behind a visible user confirmation; Tier 2 must never execute by voice.
- Browser recognition/TTS is environment- and permission-dependent; do not claim it works until manually checked.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; never edit an applied migration.
- SECURITY DEFINER/posting RPCs must be service_role-only and tested with ordinary JWTs.
- PostgREST embeds need explicit foreign-key names when relationships are ambiguous.
- audit_log is insert-only and ON DELETE RESTRICT; cleanup journal entries before audit rows and organizations.
- PayPal Sandbox uses a US Personal buyer, USD seller and `/api/webhook`; verify raw-body signatures.
- Never print `.env` values; use key names only. Gemini fallback rotates only for quota or invalid-key conditions, not transient failures.

## DO NOT
- Never push, expose secrets/JWT/OTP, call real Gemini/PayPal/Supabase, run migrations, trust model actions, let voice complete Tier 2, touch auth redirects or protected visual assets, or weaken tests.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
