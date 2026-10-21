# Phase 0 test report

## Verified

- `npm ci`: installed dependencies; npm reported 0 vulnerabilities.
- `npm test`: 11 unit and route-level tests passed, 0 failed.
- `find server -name '*.js' -print0 | xargs -0 -n1 node --check`: all backend JavaScript passed syntax checks.
- `npm start` started the Express server on port 3000 with PayPal and AI clearly off.
- Compared `GET /`, `/dashboard.html`, and `/preview.html` between the historical legacy implementation and Express; response bodies and statuses matched byte-for-byte.
- Compared degraded-mode route statuses and JSON bodies between the historical legacy implementation and Express.
- Route-level tests use a fake PayPal service to cover valid order → capture → approval → refund, repeated order/capture/refund requests, webhook replay, invalid inputs, missing auth, and a fake viewer role. Phase 0 deliberately retains the legacy no-auth behavior; Phase 1 owns auth/RBAC.
- Tested Anthropic provider error handling with a sentinel secret; it did not appear in the API response, activity records, or structured logs.
- Invalid `PORT` exits with a zod configuration message and no stack trace.
- Tested malformed and oversized JSON, unsupported methods, request IDs, and invalid `PORT` configuration.
- `GET /api/status` reported `paypal: false`, `paypalIssue: "configuration-incomplete"`, and `ai: false` without provider keys.
- Confirmed the modular server emits `X-Request-Id`, sets Helmet response headers, and writes structured request logs.

## UNVERIFIED

- Live PayPal Sandbox create-order → capture → refund, because PayPal credentials are not configured in this environment.
- Live Anthropic request, because `ANTHROPIC_API_KEY` is not configured.
- `STATIC_DIR` pointing at a non-default directory was not exercised.
