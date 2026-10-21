# Frontend API contract (legacy-compatible)

Base URL is the same origin. API JSON requests use `Content-Type: application/json`; successful and error response bodies keep the existing shapes. There is no authentication in this phase. Responses include `X-Request-Id` as an additive header.

## `GET /api/status`

Returns HTTP 200:

```json
{"backend":true,"paypal":false,"paypalConnected":false,"paypalIssue":"configuration-incomplete","ai":false,"model":null,"webhookConfigured":false,"webhookEndpoint":"/api/webhook","captures":[]}
```

`paypalIssue` is `null`, `configuration-incomplete`, or `connection-unavailable`. `model` is the configured model only when AI is enabled. Each capture has `captureId`, `orderId`, `amount`, `currency`, `status`, optional `fee`, `refunded`, and `reserved`. A non-GET method returns 405 `{ "error": "Use GET for integration status." }`.

## `GET /api/events`

Returns HTTP 200 `{ "events": [...], "calls": [...] }`. Events have `t`, `type`, `id`, and `verification`; calls have `t`, `m`, and `ok`. The latest 30 of each are retained in process memory. A non-GET method returns 405 `{ "error": "Use GET to read recent API activity." }`.

## `POST /api/webhook`

Request body is a PayPal event object, including string `event_type` (maximum 200 characters). Response HTTP 200 `{ "ok": true, "verification": "UNVERIFIED|ERROR|FAILED|VERIFIED" }`. Missing/invalid `event_type` returns HTTP 400 `{ "error": "Webhook event type is missing or invalid." }`. A non-POST method returns HTTP 405 `{ "error": "Use POST for PayPal webhook delivery." }`.

## `POST /api/ai/chat`

Request: `{ "message": "question", "context": { "transactions": [{ "id": "..." }] } }`. Message is stringified and capped at 500 characters; context is passed through to the AI service as before.

Response HTTP 200: `{ "reply": "...", "evidence": ["known transaction ID"], "proposal": null }` or a proposal object `{ "type": "refund|dispute-evidence|hold-payout|other", "txId": "...", "title": "...", "reason": "..." }`. Empty or invalid AI output returns the existing safe fallback reply and empty evidence/proposal. Missing key returns HTTP 503 `{ "error": "ANTHROPIC_API_KEY not set" }`. Provider failures return HTTP 500 `{ "error": "AI service returned an error." }`; provider response text is not forwarded.

## `POST /api/approvals/register`

Request: `{ "approvalId": "APR-...", "proposalType": "refund", "captureId": "...", "amount": "1.00", "currency": "USD" }`. Only a completed in-session capture and refund proposal are accepted.

Response HTTP 200: `{ "registered": true, "approvalId": "APR-...", "captureId": "...", "amount": "1.00", "currency": "USD" }`. Existing identical registration returns the same body. Error statuses and bodies: 400 `{ "error": "A valid refund proposal and approval reference are required." }` or `{ "error": "Only a valid USD amount can be linked to a USD sandbox capture." }`; 404 `{ "error": "The proposal must reference an available completed PayPal capture." }`; 409 `{ "error": "This approval reference is already linked to a different capture or amount." }`; 503 `{ "error": "PayPal Sandbox credentials are unavailable; refund proposal cannot be registered for execution." }`.

## `POST /api/paypal/create-order`

Request: `{ "amount": "10.00", "currency": "USD", "requestKey": "32 lowercase hex characters" }`. Amount range is 0.01–10,000.00 with at most two decimals. Response HTTP 200 `{ "orderId": "...", "id": "...", "status": "CREATED", "approveUrl": "https://...paypal.com/...", "amount": "10.00", "currency": "USD" }`. Matching retries return the same order response. Errors include 400 validation `{ "error": "Enter a valid amount from 0.01 to 10,000.00 USD." }` or `{ "error": "A valid order request key is required. Retry from the Sandbox page." }`; 409 key conflict `{ "error": "This order request key is already linked to another amount." }`; 502 incomplete provider order `{ "error": "PayPal returned an incomplete order. No buyer approval link is available." }`; 503 `{ "error": "PayPal sandbox credentials not set" }`.

## `POST /api/paypal/capture`

Request: `{ "orderId": "..." }`. Response HTTP 200 `{ "captureId": "...", "orderId": "...", "status": "COMPLETED", "amount": "10.00", "currency": "USD", "fee": "...", "refunded": 0 }` (`fee` may be omitted). Repeating a completed capture returns this same shape. Validation/not-found/provider-state failures return the existing 400, 404, 409, 502, or 503 `{ "error": "..." }` body; uncertain outcomes and retry-blocking failures include `retryBlocked: true`, with the provider status where currently returned. Missing credentials returns HTTP 503 `{ "error": "PayPal sandbox credentials not set" }`.

## `POST /api/paypal/refund`

Request: `{ "proposalType": "refund", "approvalId": "APR-...", "captureId": "...", "currency": "USD", "amount": "1.00", "note": "optional" }`. The approval ID must first be registered for the exact capture, amount, and currency. Success HTTP 200 `{ "refundId": "...", "status": "COMPLETED", "captureId": "...", "amount": "1.00", "currency": "USD" }`. Validation, missing capture, mismatched registration, and non-completed/uncertain provider results retain the existing status and `{ "error": "..." }` body, optionally with `status` and `retryBlocked`. Missing credentials returns HTTP 503 `{ "error": "PayPal sandbox credentials not set" }`.

## Shared request errors

Malformed JSON returns HTTP 400 `{ "error": "Request body must be valid JSON." }`; body size over 64 KiB returns HTTP 413 `{ "error": "Request body is too large." }`. Unknown POST routes return HTTP 404 `{ "error": "unknown route" }` when PayPal credentials exist, or the existing missing-credentials 503 otherwise. Non-POST API requests return HTTP 405 `{ "error": "Use POST for this API request." }` except the GET-only routes described above.
