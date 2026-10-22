# Phase 0 decisions

## Existing `server.js` audit

| Existing part | Decision | Reason |
| --- | --- | --- |
| PayPal OAuth token cache and 60 second failure back-off | Kept in `server/src/services/paypal.js` | Protocol behavior is already useful and must stay stable. |
| PayPal API request helper, sandbox endpoint, deterministic `PayPal-Request-Id` | Kept in `server/src/services/paypal.js` | Preserves request headers, request-ID derivation, and provider error handling. |
| Order amount/request-key validation and PayPal approval URL checks | Kept in PayPal service and route | The same ranges, key shape, and `https`/`paypal.com` rule remain in force. |
| Capture state machine, amount/currency match, lock and uncertain-outcome behavior | Kept in PayPal route and in-memory repositories | These prevent duplicate or mismatched captures; repositories isolate the existing session-local state. |
| Refund validation, approval registration, reserved/refunded amount accounting, locks, and result cache | Kept in approval/PayPal routes and in-memory repositories | Preserves current approval gate and duplicate-submission behavior. |
| Webhook signature verification through PayPal | Kept in PayPal service and webhook route | Preserves `UNVERIFIED`, `ERROR`, `FAILED`, and `VERIFIED` results. |
| System prompt, JSON sanitiser, proposal allow-list, and evidence filtering | Kept in `server/src/services/ai.js`; provider calls go through `server/src/services/llm.js` | Preserves the old AI guardrails and response shape while allowing a provider adapter to change independently. |
| Anthropic provider | Rewritten as an optional `server/src/services/llm.js` adapter | It is selected only when `LLM_PROVIDER=anthropic`; Anthropic credentials remain optional and do not enable it by themselves. |
| Maps and arrays for orders, captures, approvals, webhook events, and API calls | Rewritten as `OrdersRepo`, `CapturesRepo`, `ApprovalsRepo`, and `EventsRepo` in-memory adapters | The data remains process-local in this phase, while route code uses repository interfaces. Phase 2 can replace adapters. |
| Hand-written HTTP routing/body parser | Rewritten with Express routers and `express.json({ limit: '64kb' })` | Provides modular routing while maintaining the old request limit and API payloads. |
| Hand-written static allow-list and MIME mapping | Rewritten with `express.static(STATIC_DIR)` and root `preview.html` handling | Uses the requested static middleware; `STATIC_DIR` defaults to the repository root. |
| Hand-written `.env` parser | Dropped | Runtime configuration uses the standard pinned `dotenv` loader and is validated with zod; no custom parser remains. |
| Root `server.js` | Dropped after parity verification in a separate follow-up commit | The modular Express server matched the legacy static pages and no-credentials route responses; the monolith is no longer needed. |

## Configuration and compatibility notes

- `STATIC_DIR` relative paths resolve from the repository root.
- Added pinned `express`, `helmet`, and `zod` for the requested HTTP stack, response headers, and configuration validation; added pinned `dotenv` so standard `.env` files remain usable without retaining the hand-written parser.
- Supabase/database-backed persistence, authentication, and new features are out of scope for this safe refactor.
- Phase 0 legacy API errors preserve the exact `{ "error": "..." }` string and add a sibling `code` field. This keeps the current UI's `d.error` string handling intact while adding a stable method/path/status code. New routes from Phase 1 onward use `{ "error": { "code", "message" } }`.
- Anthropic provider error bodies are now replaced with a generic message to comply with the master security rule against leaking provider responses; this affects only provider-error wording.
- Helmet's default Content Security Policy is disabled because it would block existing inline UI code. Other Helmet headers remain enabled.
- Phase 0 retrofit audit (2026-10-22): the previous implementation had no provider interface and `services/ai.js` directly called Anthropic. Added Gemini as the default provider, an opt-in Anthropic adapter, model configuration from env, and a fake provider for deterministic tests. Existing frontend routes and response shapes remain in place.
- Error envelope decision (2026-10-22): keep each legacy route's `error` string unchanged and add sibling `code: LEGACY_<METHOD>_<PATH>_<STATUS>`. Use the nested `{ error: { code, message } }` shape for new routes starting Phase 1. This is additive for the legacy UI and gives new endpoints a consistent structured contract.

## LLM model choice (2026-10-22)

- Choice: default `LLM_MODEL=gemini-3.5-flash-lite`, with `LLM_FALLBACK_MODEL=gemini-3.1-flash-lite`.
- Reason: Google's current official model catalog lists both as stable Flash-Lite models. The official pricing page lists free-tier input and output for both. The 3.5 model is the primary choice because it is the newer stable Flash-Lite model; the 3.1 model is a configured retry fallback.
- Sources checked 2026-10-22: [Google Gemini models](https://ai.google.dev/gemini-api/docs/models) and [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing). The REST request follows the official [`generateContent` API](https://ai.google.dev/api/generate-content) system-instruction and contents format.
- Free-tier availability and quotas are subject to Google's account, region, and current rate-limit conditions; no live provider request was made in this local verification.
