# NovaPay Context

## HEADER
- Date: 2026-11-02; branch codex/voice-assistant; latest local checkpoint: 9a504bf (PayPal API fix); Part B implementation commit: a03f85f; Part A commit: 58035b5; no push.

## DONE
- Part A (commit 58035b5): lazy local AG Grid Community 33.3.2 Transactions view, preserving the original table as a hidden DOM source; searchable/filterable/sortable/pageable grid, column menu, selection, CSV, currency-separated totals, live-row flashes, strict assistant `transactions.applyView` action, tests and README documentation.
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
- PayPal Sandbox API helper fix is implemented in `src/novapay-live.js`; all protected endpoints use the authenticated shared client, while `/api/status` stays public. Structured errors and role/org codes now render readable messages.
- Part A commit 58035b5 and Part B implementation commit a03f85f are complete; no push was made. PayPal browser flow remains UNVERIFIED. The known full-suite failure is `server/test/api-client.test.js:29` (missing `Cache-Control: no-store`).
- Preserve auth/OTP/session handling, `server/src/services/geminiKeyPool.js`, voice files/speech output, and Tier 0/1/2 validation. Keep money units unchanged.
- Baseline and Part A full suite each have the same single known no-store failure; Part A full result is 300/301 and migration parser is 21/21.
- Browser rendering is UNVERIFIED.

## NEXT STEPS
1. Human runs the PayPal Sandbox browser flow: sign in, open PayPal Sandbox, create a 10.00 USD test order, approve in PayPal tab, capture, confirm the transaction appears.
2. Earlier Transactions grid and assistant conversation browser checks remain pending in `docs/WORKLOG.md`. Do not push unless separately requested.

## USER ACTIONS PENDING
- In Chrome and Brave, sign in, enable console debug using localStorage key novapay:voiceDebug, grant mic access, and complete the checklist with harmless sample queries. Clear debug mode afterward.

## LIVE STATE
- No browser or live API checks have been performed for the AG Grid change. No secrets printed, no migration run, no push.

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
| AG Grid/action focused tests | PASS | 2026-11-02 | `node --test server/test/transactions-grid.test.js server/test/assistant-actions.test.js` — 11/11 |
| Part A full suite | FAIL (known) | 2026-11-02 | `npm test` — 300/301; only `server/test/api-client.test.js:29` no-store assertion; migrations 21/21 |
| AG Grid browser rendering | UNVERIFIED | 2026-11-02 | No browser session used; manual checklist pending |
| Part B focused tests | PASS | 2026-11-02 | Resolver/memory/cache/client/schema focused run 25/25; route compatibility rerun 16/16 |
| Full suite after Part B | FAIL (known) | 2026-11-02 | `npm test` 307/308; sole failure server/test/api-client.test.js:29, no-store header undefined; migrations 21/21 |
| Migrations/static syntax | PASS | 2026-11-02 | `npm run check:migrations` 21/21; changed JS `node --check` and `git diff --check` passed |
| Part B browser follow-ups | UNVERIFIED | 2026-11-02 | No browser interaction performed; refresh, New chat, scope and voice checks pending |
| Part B final focused tests | PASS | 2026-11-02 | `node --test server/test/ai-context.test.js server/test/ai-chat-schema.test.js server/test/postgres-repos.test.js server/test/assistant-conversation.test.js server/test/assistant-client.test.js` — 39/39 |
| Part B final full suite | FAIL (known) | 2026-11-02 | `npm test` — 310/311; only `server/test/api-client.test.js:29` no-store assertion (actual header undefined) |
| Part B migration check | PASS | 2026-11-02 | `npm run check:migrations` — 21/21 static migration checks; no migrations applied |
| Part B syntax and whitespace | PASS | 2026-11-02 | `node --check` on 16 changed JS files; `git diff --check` |

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

| PayPal API structured error regression | PASS | 2026-11-02 | `node --test server/test/novapay-live-api.test.js` — 3/3 |
| PayPal edited JS syntax | PASS | 2026-11-02 | `node --check src/novapay-live.js server/test/novapay-live-api.test.js` |
| PayPal full suite | FAIL (known) | 2026-11-02 | `npm test` — 313/314; sole failure `server/test/api-client.test.js:29`, expected `Cache-Control: no-store`, actual undefined |
