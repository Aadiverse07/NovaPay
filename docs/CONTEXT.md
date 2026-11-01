# NovaPay Context

## HEADER
- Date: 2026-11-02; branch codex/voice-assistant; current task: assistant invoice draft slot filling; latest local checkpoint 9fc1870; no push.

## DONE
- Removed wake-phrase matching, continuous listening, and the listening-for-wake state. Intro greeting now tells users to tap the mic.
- One reusable SpeechRecognition object is configured en-IN, continuous=false, interimResults=true. It starts only after a mic tap, displays interim text, submits final/silence once, and ignores duplicate starts. A mic tap during playback no longer cancels the utterance; explicit Stop remains available.
- Removed voice auto-resume from the floating indicator; its click activates the same AI mic. Transaction detail dictation now records audio and calls the authenticated transcription endpoint, avoiding a second recognizer. Main mic held-to-talk remains the fallback when browser recognition is unavailable.
- Typed, spoken and transcribed queries share the dashboard handleQuery path. Deterministic navigation/help/stop/repeat remains; authenticated quick commands also issue one background chat request. Existing server action validation and Tier 0/1/2 execution remain.
- Debug trace is gated by novapay:voiceDebug=1. Thinking times out after 15 seconds with a spoken status message.
- Speech output now logs sanitized requested text, voice count/selection, and utterance start/end/error behind the same debug flag; it waits up to one second for voices, prefers a local voice before en-IN/en-GB/en-US/default, resumes synthesis, retains utterance references, chunks long text, retries once with the default voice, and uses a short plain-language fallback.
- Voice mute is explicitly persisted and defaults on; the visible toggle now matches stored state, typed and spoken output share the mute control, and mic tap is recorded as the speech gesture.
- `NovaPaySpeechOutput` is the sole owner of native synthesis and cancellation; the intro greeting and dashboard use the shared instance. Added a visible Test voice button and speech status. Mic tap during speech no longer cancels the utterance.
- Updated files: dashboard.html; src/voice-assistant.js, assistant-client.js, dashboard.js, voice-greeting.js, voice-indicator.js; server/src/ai/actions.js; tests server/test/assistant-actions.test.js, assistant-client.test.js, voice-assistant.test.js, voice-greeting.test.js, voice-indicator.test.js; docs/VOICE-BROWSER-CHECKLIST.md and continuity docs. Earlier local transcription endpoint files remain modified from the prior task: server/src/app.js, routes/ai.js, services/llm.js and assistant-speech/llm/routes tests.
- No animation, auth/redirect, font, or asset files were edited. No migration was applied.

## IN PROGRESS
- Invoice draft assistant flow is implemented in `src/dashboard.js`: deterministic intent intercept before data-answer path, role check via authenticated invoice list, one-at-a-time required slots, validation, two-minute expiry, cancel/change amount, readback/confirm card, and existing authenticated idempotent POST only after confirmation.
- Server classifies invoice-create messages as code intent and returns a validated partial action or viewer refusal before `askAI`; no invoice action is inferred from OCR/document evidence.
- Actual invoice route requires customerName, customerEmail, currency, issueDate, dueDate, and at least one line description/quantity/unitPrice. INR is the UI default, issue date is generated as today, quantity=1 and tax=0 follow the existing form defaults. Email and line description are asked when missing.
- After create, the existing invoice API refreshes and opens Invoices, the row is highlighted, and “open it”/“download it” resolve to the created invoice. Sending remains unchanged.
- Files changed in this task: `src/assistant-actions.js`, `src/dashboard.js`, `src/modules.css`, `server/src/ai/actions.js`, `server/src/ai/router.js`, `server/src/routes/ai.js`, tests `server/test/assistant-actions.test.js`, `assistant-client.test.js`, `ai-router.test.js`, `routes.test.js`, plus continuity docs.
- Browser verification and actual invoice POST/debug/server log are UNVERIFIED; local browser control is disabled in Work settings.

## NEXT STEPS
1. In Chrome, sign in as an owner/admin/accountant, open AI Assistant, type “create an invoice for me”, then provide customer name, email, amount, line description, and a future due date one at a time; inspect the readback and click Confirm. Verify one POST `/api/invoices`, one draft row, and its invoice number.
2. Repeat by mic; speak “create an invoice for Acme for 12000 due 15 November”. Since the route requires email and line description, answer those prompts, confirm verbally or on screen, and inspect debug plus server POST logs. Then say “download it” and “open it”.
3. Verify viewer refusal and cancellation; report browser evidence in TEST-REPORT.md. Do not push or run migrations.

## USER ACTIONS PENDING
- In Chrome and Brave, sign in, enable console debug using localStorage key novapay:voiceDebug, grant mic access, and complete the checklist with harmless sample queries. Clear debug mode afterward.

## LIVE STATE
- No browser or live API checks were possible; local browser control is disabled by desktop Work settings. No secrets printed, no migration run, no push.

## TEST STATE
| Check | Status | Date | Command/details |
|---|---|---|---|
| Focused speech/client/controller/greeting | PASS | 2026-11-02 | 37/37: node --test server/test/assistant-speech.test.js server/test/voice-assistant.test.js server/test/voice-greeting.test.js server/test/assistant-client.test.js |
| Full suite | FAIL | 2026-11-02 | npm test 292/293; sole failure server/test/api-client.test.js:29 expects Cache-Control no-store, actual undefined |
| Migration syntax | PASS | 2026-11-02 | 21 static PostgreSQL migration checks ran inside npm test; none applied |
| Changed JS syntax | PASS | 2026-11-02 | node --check on changed JavaScript files |
| Whitespace | PASS | 2026-11-02 | git diff --check |
| Protected paths | PASS | 2026-11-02 | changed-path filter empty for tokens, base, fonts, presets, themes, effects and assets |
| Chrome TTS | UNVERIFIED | 2026-11-02 | browser-control API reports local use disabled in Work settings; no utterance logs, audio, tab mute, or system volume check |
| Invoice assistant focused tests | PASS | 2026-11-02 | `node --test server/test/assistant-actions.test.js server/test/ai-router.test.js server/test/assistant-client.test.js server/test/routes.test.js` — 37/37 |
| Full suite after invoice flow | FAIL | 2026-11-02 | `npm test` — 296/297; known `server/test/api-client.test.js:29` Cache-Control no-store assertion, 21 migration syntax checks passed |
| Invoice browser flow and live POST | UNVERIFIED | 2026-11-02 | Chrome unavailable in Work settings; no live draft created or customer data used |

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
