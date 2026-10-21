# Phase 0 test report

## Verified

- `npm test`: 8 unit tests passed, 0 failed.
- `npm start` started the Express server on port 3000 with PayPal and AI clearly off.
- Compared `GET /`, `/dashboard.html`, and `/preview.html` between the legacy server and Express; response bodies and statuses matched byte-for-byte.
- Compared the degraded-mode JSON status, events, webhook, AI, approval, create-order, capture, and refund responses between legacy and Express; statuses and JSON bodies matched.
- `GET /api/status` reported `paypal: false`, `paypalIssue: "configuration-incomplete"`, and `ai: false` without provider keys.
- Confirmed the modular server emits `X-Request-Id`, sets Helmet response headers, and writes structured request logs.

## UNVERIFIED

- Live PayPal Sandbox create-order → capture → refund, because PayPal credentials are not configured in this environment.
- Live Anthropic request, because `ANTHROPIC_API_KEY` is not configured.
- `STATIC_DIR` pointing at a non-default directory was not exercised.
