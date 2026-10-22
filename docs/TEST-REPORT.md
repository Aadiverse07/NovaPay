# Phase 0 retrofit test report

Verification run on 2026-10-22 from branch `backend`.

## Passed

- `npm install`: dependencies were up to date; npm reported 0 vulnerabilities.
- `find server -type f -name '*.js' -print0 | xargs -0 -n1 node --check`: all backend JavaScript passed syntax checks.
- `npm test`: 16 tests passed, 0 failed. Includes the existing amount, PayPal request-ID, approval URL, refund maths, and API-flow tests; fake LLM sanitization; Gemini primary-to-fallback behavior; provider selection; legacy error responses with sibling codes; and the structured Phase 1 error shape.
- `git diff --check`: no whitespace errors.
- `npm start` with PayPal and LLM credentials blank started in degraded/demo mode; `/api/status` returned `paypal:false`, `ai:false`, and `paypalIssue:"configuration-incomplete"`.
- Runtime requests confirmed HTTP 200 for `/dashboard.html`, `/preview.html`, `/api/status`, `/api/events`, and a valid unverified webhook; invalid webhook returned 400; AI and credential-dependent PayPal/approval routes returned their documented missing-key or degraded-mode errors. All responses included `X-Request-Id`.
- Runtime check at the default port returned the legacy error strings unchanged and added route/status sibling codes, including `LEGACY_POST_API_WEBHOOK_400`, `LEGACY_POST_API_AI_CHAT_503`, and `LEGACY_POST_API_PAYPAL_CREATE_ORDER_503`.
- The API integration test covers valid and invalid order/capture/approval/refund flows, repeated idempotent submissions, webhook replay, missing auth, and a viewer-role header. Phase 0 deliberately ignores auth and role headers; Phase 1 owns authentication and RBAC.
- The Anthropic provider error test uses a sentinel secret and confirms provider response text and keys do not appear in the response, activity log, or structured request logs.
- `git diff` contains no changes under `preview.html`, `dashboard.html`, `src/`, `assets/`, or either Tailwind preset. `.env` is ignored and untracked.

## Unverified

- Live Gemini call and Gemini account-specific free-tier eligibility/rate limits; no `LLM_API_KEY` was available. To check locally, set `LLM_PROVIDER=gemini`, `LLM_API_KEY`, and optionally `LLM_MODEL`/`LLM_FALLBACK_MODEL`, then run `npm start` and call `POST /api/ai/chat` with JSON `{ "message": "Summarize the supplied records", "context": { "transactions": [] } }`.
- Live Anthropic adapter request; no Anthropic credentials were available. To check, set `LLM_PROVIDER=anthropic`, `LLM_API_KEY` (or `ANTHROPIC_API_KEY`), and `LLM_MODEL`, then call the same route.
- Live PayPal Sandbox create-order → capture → approval registration → refund; no PayPal credentials were available. Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID` as needed, then exercise the documented requests in `docs/FRONTEND-CONTRACT.md`.
- Authentication/role enforcement is intentionally absent in Phase 0. The integration test confirms those headers do not change the legacy route behavior; authorization work belongs to Phase 1.
- Byte-for-byte comparison against the removed legacy `server.js` static responses was performed during the initial Phase 0 audit, but was not repeated during this retrofit. This turn verified the two static paths returned 200 and no frontend file was modified.
