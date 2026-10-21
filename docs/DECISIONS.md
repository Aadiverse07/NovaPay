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
| Anthropic system prompt, request, JSON sanitiser, proposal allow-list, evidence filtering | Kept in `server/src/services/ai.js` | Preserves the old AI guardrails and response shape. |
| Maps and arrays for orders, captures, approvals, webhook events, and API calls | Rewritten as `OrdersRepo`, `CapturesRepo`, `ApprovalsRepo`, and `EventsRepo` in-memory adapters | The data remains process-local in this phase, while route code uses repository interfaces. Phase 2 can replace adapters. |
| Hand-written HTTP routing/body parser | Rewritten with Express routers and `express.json({ limit: '64kb' })` | Provides modular routing while maintaining the old request limit and API payloads. |
| Hand-written static allow-list and MIME mapping | Rewritten with `express.static(STATIC_DIR)` and root `preview.html` handling | Uses the requested static middleware; `STATIC_DIR` defaults to the repository root. |
| Hand-written `.env` parser | Dropped | Runtime configuration is read from `process.env` and validated with zod; launch through the environment or a standard dotenv loader outside this server. |
| Root `server.js` | Retained temporarily for parity verification; scheduled for removal after verification | `node server.js` remains available until the modular flow is checked. Its removal is a separate commit. |

## Configuration and compatibility notes

- `STATIC_DIR` relative paths resolve from the repository root.
- Added pinned `express`, `helmet`, and `zod` for the requested HTTP stack, response headers, and configuration validation; added pinned `dotenv` so standard `.env` files remain usable without retaining the hand-written parser.
- Supabase/database-backed persistence, authentication, and new features are out of scope for this safe refactor.
- Helmet's default Content Security Policy is disabled because it would block existing inline UI code. Other Helmet headers remain enabled.
