# Frontend API contract (legacy-compatible)

Base URL is the same origin. API JSON requests use `Content-Type: application/json`; successful response bodies keep the existing shapes. Phase 0 has no authentication or role enforcement: every route has minimum role `none`, and `Authorization: Bearer <Supabase JWT>` and `X-Org-Id` are not required or checked. Responses include `X-Request-Id` as an additive header. Every legacy Phase 0 error preserves its `{ "error": "message" }` string and adds sibling `"code": "LEGACY_<METHOD>_<PATH>_<STATUS>"`; for example, create-order validation returns `{ "error": "Enter a valid amount from 0.01 to 10,000.00 USD.", "code": "LEGACY_POST_API_PAYPAL_CREATE_ORDER_400" }`. New routes added from Phase 1 onward use `{ "error": { "code": "...", "message": "..." } }`.

`GET /` serves `preview.html` from `STATIC_DIR`. Other static paths, including `/preview.html` and `/dashboard.html`, are served from `STATIC_DIR` with Express static middleware.

## `GET /api/status`

Returns HTTP 200:

```json
{"backend":true,"paypal":false,"paypalConnected":false,"paypalIssue":"configuration-incomplete","ai":false,"model":null,"webhookConfigured":false,"webhookEndpoint":"/api/webhook","captures":[]}
```

`paypalIssue` is `null`, `configuration-incomplete`, or `connection-unavailable`. `model` is the selected `LLM_MODEL` (or the legacy `ANTHROPIC_MODEL` when the optional Anthropic adapter is selected without `LLM_MODEL`) only when AI is enabled. Each capture has `captureId`, `orderId`, `amount`, `currency`, `status`, optional `fee`, `refunded`, and `reserved`. A non-GET method returns 405 `{ "error": "Use GET for integration status." }`.

## `GET /api/events`

Returns HTTP 200 `{ "events": [...], "calls": [...] }`. Events have `t`, `type`, `id`, and `verification`; calls have `t`, `m`, and `ok`. The latest 30 of each are retained in process memory. A non-GET method returns 405 `{ "error": "Use GET to read recent API activity." }`.

## `POST /api/webhook`

Request body is a PayPal event object, including string `event_type` (maximum 200 characters). Response HTTP 200 `{ "ok": true, "verification": "UNVERIFIED|ERROR|FAILED|VERIFIED" }`. Missing/invalid `event_type` returns HTTP 400 `{ "error": "Webhook event type is missing or invalid." }`. A non-POST method returns HTTP 405 `{ "error": "Use POST for PayPal webhook delivery." }`.

## `POST /api/ai/chat`

Request: `{ "message": "question", "context": { "transactions": [{ "id": "..." }] } }`. Message is stringified and capped at 500 characters; context is passed through to the AI service as before.

Response HTTP 200: `{ "reply": "...", "evidence": ["known transaction ID"], "proposal": null }` or a proposal object `{ "type": "refund|dispute-evidence|hold-payout|other", "txId": "...", "title": "...", "reason": "..." }`. Empty provider reply returns `The AI returned an empty answer. Try asking about a field shown in a transaction row.`; malformed JSON returns `The AI response could not be read safely. Please retry or review the transaction records directly.` Both use empty evidence and `proposal:null`. Evidence IDs not present in `context.transactions[].id` are removed, and unsupported proposal types are mapped to `other`. The default provider is Gemini (`LLM_PROVIDER=gemini`, model from `LLM_MODEL`, retry model from `LLM_FALLBACK_MODEL`). Anthropic is used only with `LLM_PROVIDER=anthropic`; its key may be supplied as `LLM_API_KEY` or the optional legacy `ANTHROPIC_API_KEY`. Missing key returns HTTP 503 `{ "error": "LLM_API_KEY not set" }`. Provider failures return HTTP 500 `{ "error": "AI service returned an error." }`; provider response text is not forwarded. The route has no authentication or role requirement in Phase 0.

## `POST /api/approvals/register`

Request: `{ "approvalId": "APR-...", "proposalType": "refund", "captureId": "...", "amount": "1.00", "currency": "USD" }`. Only a completed in-session capture and refund proposal are accepted.

Response HTTP 200: `{ "registered": true, "approvalId": "APR-...", "captureId": "...", "amount": "1.00", "currency": "USD" }`. Existing identical registration returns the same body. Error statuses and bodies: 400 `{ "error": "A valid refund proposal and approval reference are required." }`, `{ "error": "Only a valid USD amount can be linked to a USD sandbox capture." }`, or `{ "error": "Refund amount exceeds the remaining captured amount (N.NN USD)." }`; 404 `{ "error": "The proposal must reference an available completed PayPal capture." }`; 409 `{ "error": "This approval reference is already linked to a different capture or amount." }`; 503 `{ "error": "PayPal Sandbox credentials are unavailable; refund proposal cannot be registered for execution." }`.

## `POST /api/paypal/create-order`

Request: `{ "amount": "10.00", "currency": "USD", "requestKey": "32 lowercase hex characters" }`. Amount range is 0.01–10,000.00 with at most two decimals. Response HTTP 200 `{ "orderId": "...", "id": "...", "status": "CREATED", "approveUrl": "https://...paypal.com/...", "amount": "10.00", "currency": "USD" }`. Matching retries return the same order response. Errors: 400 `{ "error": "Enter a valid amount from 0.01 to 10,000.00 USD." }` or `{ "error": "A valid order request key is required. Retry from the Sandbox page." }`; 409 `{ "error": "This order request key is already linked to another amount." }`; 502 incomplete order `{ "error": "PayPal returned an incomplete order. No buyer approval link is available." }` or provider error `{ "error": "PayPal Sandbox returned an error for this request. Check the API activity log and sandbox order state." }`; 503 `{ "error": "PayPal sandbox credentials not set" }`. OAuth setup failure also returns 502 with either `PayPal Sandbox could not be reached.` or `PayPal Sandbox credentials could not be verified. Check the sandbox app credentials.`

## `POST /api/paypal/capture`

Request: `{ "orderId": "..." }`. Response HTTP 200 `{ "captureId": "...", "orderId": "...", "status": "COMPLETED", "amount": "10.00", "currency": "USD", "fee": "...", "refunded": 0 }` (`fee` may be omitted). Repeating a completed capture returns this same shape. Exact route errors: 400 `{ "error": "A valid PayPal Sandbox order ID is required." }`; 404 `{ "error": "This order was not created in the current server session. Create a new sandbox order first." }`; 409 `{ "error": "PayPal has not confirmed a completed capture for this order. Check PayPal Sandbox before retrying.", "status": "...", "retryBlocked": true }`, `{ "error": "This order capture is already being processed." }`, or `{ "error": "This order is not available for another capture request.", "retryBlocked": true }`; 502 incomplete details `{ "error": "PayPal did not return complete capture details. No transaction was added; check the order in PayPal Sandbox.", "status": "...", "retryBlocked": true }`, mismatch `{ "error": "PayPal capture details did not match the order amount and currency. No transaction was added.", "retryBlocked": true }`, or generic provider `{ "error": "PayPal Sandbox returned an error for this request. Check the API activity log and sandbox order state." }`; 503 uncertain request `{ "error": "The capture request outcome is uncertain. Check PayPal Sandbox before retrying.", "retryBlocked": true }` or missing credentials `{ "error": "PayPal sandbox credentials not set" }`. Non-completed provider capture returns 409 with the descriptive error plus `status`, `captureId`, `orderId`, `amount`, `currency`, optional `fee`, and `retryBlocked: true`.

## `POST /api/paypal/refund`

Request: `{ "proposalType": "refund", "approvalId": "APR-...", "captureId": "...", "currency": "USD", "amount": "1.00", "note": "optional" }`. The approval ID must first be registered for the exact capture, amount, and currency. Success HTTP 200 `{ "refundId": "...", "status": "COMPLETED", "captureId": "...", "amount": "1.00", "currency": "USD" }`; a repeated completed request returns the cached same shape. Exact route errors: 400 `{ "error": "Only an explicitly approved refund proposal can use this route." }`, `{ "error": "A valid approval reference is required." }`, `{ "error": "Refunds are currently supported only for USD sandbox captures." }`, `{ "error": "Refund amount must be a positive USD amount with at most two decimal places." }`, `{ "error": "Refund amount must be greater than zero." }`, or the remaining-amount message `{ "error": "Refund amount exceeds the remaining captured amount (N.NN USD)." }`; 403 `{ "error": "This refund does not match a server-registered approval, capture, amount, and currency." }`; 404 `{ "error": "The specified PayPal capture is not available in this backend session. No refund was sent." }`; 409 capture-state `{ "error": "The specified capture is not in a refundable completed state." }`, already-locked `{ "error": "This approval is already being submitted. Wait for the current request to finish." }`, used reference `{ "error": "This approval reference was already used for a different refund request." }`, cached pending `{ "error": "...", "status": "...", "retryBlocked": true }`, or provider non-completed `{ "error": "PayPal returned STATUS, not COMPLETED. Verify the refund in PayPal Sandbox; this approval will not be submitted twice.", "status": "STATUS", "retryBlocked": true }`; 502 generic provider error as above; 503 uncertain request `{ "error": "PayPal request outcome is uncertain. Verify PayPal Sandbox before taking further action.", "retryBlocked": true }` or missing credentials `{ "error": "PayPal sandbox credentials not set" }`.

## Shared request errors

Malformed JSON returns HTTP 400 `{ "error": "Request body must be valid JSON." }`; body size over 64 KiB returns HTTP 413 `{ "error": "Request body is too large." }`. Unknown POST routes return HTTP 404 `{ "error": "unknown route" }` when PayPal credentials exist, or the existing missing-credentials 503 otherwise. Non-POST API requests return HTTP 405 `{ "error": "Use POST for this API request." }` except the GET-only routes described above.
