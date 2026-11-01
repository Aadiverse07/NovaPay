# NovaPay Context

## HEADER
- Date: 2026-11-02; branch codex/voice-assistant; based on published main 3b14187; current task: tap-to-talk voice assistant; implementation done, local changes uncommitted; no push.

## DONE
- Removed wake-phrase matching, continuous listening, and the listening-for-wake state. Intro greeting now tells users to tap the mic.
- One reusable SpeechRecognition object is configured en-IN, continuous=false, interimResults=true. It starts only after a mic tap, displays interim text, submits final/silence once, ignores duplicate starts, cancels on another tap, and allows tap-to-barge-in during speech.
- Removed voice auto-resume from the floating indicator; its click activates the same AI mic. Transaction detail dictation now records audio and calls the authenticated transcription endpoint, avoiding a second recognizer. Main mic held-to-talk remains the fallback when browser recognition is unavailable.
- Typed, spoken and transcribed queries share the dashboard handleQuery path. Deterministic navigation/help/stop/repeat remains; authenticated quick commands also issue one background chat request. Existing server action validation and Tier 0/1/2 execution remain.
- Debug trace is gated by novapay:voiceDebug=1. Thinking times out after 15 seconds with a spoken status message.
- Updated files: dashboard.html; src/voice-assistant.js, assistant-client.js, dashboard.js, voice-greeting.js, voice-indicator.js; server/src/ai/actions.js; tests server/test/assistant-actions.test.js, assistant-client.test.js, voice-assistant.test.js, voice-greeting.test.js, voice-indicator.test.js; docs/VOICE-BROWSER-CHECKLIST.md and continuity docs. Earlier local transcription endpoint files remain modified from the prior task: server/src/app.js, routes/ai.js, services/llm.js and assistant-speech/llm/routes tests.
- No animation, auth/redirect, font, or asset files were edited. No migration was applied.

## IN PROGRESS
- Implementation and unit checks complete; real-browser validation is pending.

## NEXT STEPS
1. Run docs/VOICE-BROWSER-CHECKLIST.md in real Chrome and Brave.
2. Verify each spoken utterance produces exactly one POST /api/ai/chat, route/status/action trace, visible response and speech.
3. Verify invoice tier-1 confirmation, download, document upload prompt, cancellation, barge-in and held-mic fallback.

## USER ACTIONS PENDING
- In Chrome and Brave, sign in, enable console debug using localStorage key novapay:voiceDebug, grant mic access, and complete the checklist with harmless sample queries. Clear debug mode afterward.

## LIVE STATE
- No browser or live API checks were possible; local browser control is disabled by desktop Work settings. No secrets printed, no migration run, no push.

## TEST STATE
| Check | Status | Date | Command/details |
|---|---|---|---|
| Focused voice/action/client | PASS | 2026-11-02 | 37/37 across voice-assistant, voice-greeting, voice-indicator, assistant-client, assistant-actions and assistant-speech |
| Full suite | FAIL | 2026-11-02 | npm test 284/285; sole failure server/test/api-client.test.js:29 expects Cache-Control no-store, actual undefined |
| Migration syntax | PASS | 2026-11-02 | 21 static PostgreSQL migration checks ran inside npm test; none applied |
| Changed JS syntax | PASS | 2026-11-02 | node --check on changed JavaScript files |
| Whitespace | PASS | 2026-11-02 | git diff --check |
| Protected paths | PASS | 2026-11-02 | changed-path filter empty for tokens, base, fonts, presets, themes, effects and assets |
| Chrome/Brave | UNVERIFIED | 2026-11-02 | browser-control API reports local use disabled in Work settings; no live mic, chat log or TTS check |

## KNOWN ISSUES AND RISKS
- Known API no-store assertion remains the only failing test and was not changed.
- Chrome/Brave recognition, transcript delivery, POST logs, live actions and audible TTS remain unverified.
- The transcription fallback sends recorded audio through the authenticated Gemini transcription adapter; use non-sensitive audio only.
- Browser ESM imports produce non-failing Node type warnings during tests.

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
