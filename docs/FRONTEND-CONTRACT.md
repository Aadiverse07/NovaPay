# Frontend API contract (legacy-compatible)

Base URL is the same origin. API JSON requests use `Content-Type: application/json`. Responses include `X-Request-Id`. Legacy Phase 0 route validation/provider errors preserve the string `error` and add a sibling `code`; Phase 1 authentication, authorization, onboarding, rate-limit, and validation errors use `{ "error": { "code": "...", "message": "..." } }`.

## Authentication and organization selection

The frontend signs up and logs in directly with `supabase-js` using the public values returned by `GET /api/public-config`. Supabase Auth remains the source of the access token. For each protected API call, send `Authorization: Bearer <Supabase access token>`. For organization-scoped routes, also send `X-Org-Id: <organization UUID>`; the server validates that the signed-in user is a member and resolves the user's role from that membership. Never put `SUPABASE_SERVICE_ROLE_KEY` in browser code or send it to the browser.

Unauthenticated protected route: HTTP 401 `{ "error": { "code": "AUTH_REQUIRED", "message": "A valid Supabase bearer token is required." } }`. Invalid/expired token: HTTP 401 `{ "error": { "code": "AUTH_INVALID", "message": "The Supabase bearer token is invalid or expired." } }`. Missing/malformed `X-Org-Id`: HTTP 400 code `ORG_HEADER_REQUIRED`, message `A valid X-Org-Id UUID is required.` A valid user who is not a member receives HTTP 403 code `ORG_FORBIDDEN`, message `You are not a member of the requested organization.` A member whose role is insufficient receives HTTP 403 code `ROLE_FORBIDDEN`, message `Your organization role cannot perform this action.`

Public API routes are `GET /api/status`, `GET /api/public-config`, and `POST /api/webhook`. All remaining `/api` routes require a bearer token; all except onboarding also require `X-Org-Id`. `GET /api/status` reports `mode: "degraded"` and `supabaseConfigured: false` when Supabase is absent. Protected routes return HTTP 503 `{ "error": { "code": "SUPABASE_NOT_CONFIGURED", "message": "Authentication is unavailable until Supabase is configured." } }` in that mode. Auth verification outages return HTTP 503 code `AUTH_UNAVAILABLE`, message `Authentication could not be verified.`

## `GET /api/public-config`

Public. Returns HTTP 200 `{ "supabaseUrl": "https://<project>.supabase.co", "supabaseAnonKey": "<public anon key>" }`. When absent, either/both values are `null`. No service-role key or other server secret is returned.

## `POST /api/onboarding`

Requires a valid bearer token, but not `X-Org-Id`. Request: `{ "organizationName": "Example organization" }` (trimmed, 2–120 characters; extra fields rejected). Creates the organization, owner membership, and audit entry in one database transaction. First success is HTTP 201 `{ "organizationId": "<uuid>", "role": "owner", "created": true }`; repeating for the same account with its sole owner membership returns HTTP 200 with the same organization ID and `created: false`. Invalid body is HTTP 400 `VALIDATION_ERROR`; already-member account without a sole owner membership is HTTP 409 `ONBOARDING_ALREADY_COMPLETED`; provider/database failure is HTTP 503 `ONBOARDING_FAILED`.

`GET /` serves `preview.html` from `STATIC_DIR`. Other static paths, including `/preview.html` and `/dashboard.html`, are served from `STATIC_DIR` with Express static middleware.

## `GET /api/status`

Public health route with no authentication. Returns HTTP 200:

```json
{"backend":true,"mode":"degraded","supabaseConfigured":false,"paypal":false,"paypalConnected":false,"paypalIssue":"configuration-incomplete","ai":false,"model":null,"webhookConfigured":false,"webhookEndpoint":"/api/webhook","captures":[]}
```

`mode` is `authenticated` or `degraded`; `supabaseConfigured` is boolean. `paypalIssue` is `null`, `configuration-incomplete`, or `connection-unavailable`. `model` is the selected `LLM_MODEL` (or the legacy `ANTHROPIC_MODEL` when Anthropic is selected without `LLM_MODEL`) only when AI is enabled. `captures` is always empty because this public health endpoint does not disclose tenant records. A non-GET method returns 405 with the legacy string error and sibling `code`.

## `GET /api/events`

Requires bearer token and `X-Org-Id`, any organization role. Returns HTTP 200 `{ "events": [...], "calls": [...] }`. Events have `t`, `type`, `id`, and `verification`; calls have `t`, `m`, and `ok`. Only records explicitly tagged with the selected organization are returned; legacy unscoped entries are omitted. A non-GET method returns 405 with the legacy string error and sibling `code`.

## `POST /api/webhook`

Public PayPal callback. Request body is the raw PayPal event JSON, including string `id` and `event_type` (maximum 200 characters). The backend stores the raw bytes and signature headers, then returns HTTP 200 immediately as `{ "ok": true, "verification": "UNVERIFIED" }`; a worker verifies the signature and later records verification/processing state for `GET /api/events`. Retries with the same provider event ID do not enqueue a second posting. Missing/invalid `id` or `event_type` returns HTTP 400 `{ "error": "Webhook event type is missing or invalid.", "code": "LEGACY_POST_API_WEBHOOK_400" }`. Storage failure returns HTTP 503 `{ "error": { "code": "WEBHOOK_STORAGE_FAILED", "message": "The PayPal event could not be safely stored." } }`. A non-POST method returns HTTP 405 with the legacy string error and sibling `code`. Events that cannot be verified are retained and never posted.

## `POST /api/ai/chat`

Requires bearer token and `X-Org-Id`; all organization roles may ask questions. Request: `{ "message": "question", "context": { "transactions": [{ "id": "..." }] } }`. Message is stringified and capped at 500 characters; context is passed through to the AI service as before.

Response HTTP 200: `{ "reply": "...", "evidence": ["known transaction ID"], "proposal": null }` or a proposal object `{ "type": "refund|dispute-evidence|hold-payout|other", "txId": "...", "title": "...", "reason": "..." }`. Empty provider reply returns `The AI returned an empty answer. Try asking about a field shown in a transaction row.`; malformed JSON returns `The AI response could not be read safely. Please retry or review the transaction records directly.` Both use empty evidence and `proposal:null`. Evidence IDs not present in `context.transactions[].id` are removed, and unsupported proposal types are mapped to `other`. The default provider is Gemini (`LLM_PROVIDER=gemini`, model from `LLM_MODEL`, retry model from `LLM_FALLBACK_MODEL`). Anthropic is used only with `LLM_PROVIDER=anthropic`; its key may be supplied as `LLM_API_KEY` or the optional legacy `ANTHROPIC_API_KEY`. Missing key returns HTTP 503 `{ "error": "LLM_API_KEY not set" }`. Provider failures return HTTP 500 `{ "error": "AI service returned an error." }`; provider response text is not forwarded. The route requires authentication and organization membership; all organization roles may ask questions.

## `POST /api/approvals/register`

Requires bearer token and `X-Org-Id`; allowed roles: `owner`, `admin`, `approver`. Request: `{ "approvalId": "APR-...", "proposalType": "refund", "captureId": "...", "amount": "1.00", "currency": "USD" }`. Only a completed capture owned by this organization and refund proposal are accepted.

Response HTTP 200: `{ "registered": true, "approvalId": "APR-...", "captureId": "...", "amount": "1.00", "currency": "USD" }`. Existing identical registration returns the same body. Error statuses and bodies: 400 `{ "error": "A valid refund proposal and approval reference are required." }`, `{ "error": "Only a valid USD amount can be linked to a USD sandbox capture." }`, or `{ "error": "Refund amount exceeds the remaining captured amount (N.NN USD)." }`; 404 `{ "error": "The proposal must reference an available completed PayPal capture." }`; 409 `{ "error": "This approval reference is already linked to a different capture or amount." }`; 503 `{ "error": "PayPal Sandbox credentials are unavailable; refund proposal cannot be registered for execution." }`.

## `POST /api/paypal/create-order`

Requires bearer token and `X-Org-Id`; allowed roles: `owner`, `admin`, `accountant`, `approver`. Request: `{ "amount": "10.00", "currency": "USD", "requestKey": "32 lowercase hex characters" }`. Amount range is 0.01–10,000.00 with at most two decimals. Idempotency keys and derived PayPal request IDs are scoped to the organization. Response HTTP 200 `{ "orderId": "...", "id": "...", "status": "CREATED", "approveUrl": "https://...paypal.com/...", "amount": "10.00", "currency": "USD" }`. Matching retries return the same order response. Errors: 400 `{ "error": "Enter a valid amount from 0.01 to 10,000.00 USD." }` or `{ "error": "A valid order request key is required. Retry from the Sandbox page." }`; 409 `{ "error": "This order request key is already linked to another amount." }`; 502 incomplete order `{ "error": "PayPal returned an incomplete order. No buyer approval link is available." }` or provider error `{ "error": "PayPal Sandbox returned an error for this request. Check the API activity log and sandbox order state." }`; 503 `{ "error": "PayPal sandbox credentials not set" }`. OAuth setup failure also returns 502 with either `PayPal Sandbox could not be reached.` or `PayPal Sandbox credentials could not be verified. Check the sandbox app credentials.`

## `POST /api/paypal/capture`

Requires bearer token and `X-Org-Id`; allowed roles: `owner`, `admin`, `accountant`, `approver`. Order IDs are visible only in their organization. Request: `{ "orderId": "..." }`. Response HTTP 200 `{ "captureId": "...", "orderId": "...", "status": "COMPLETED", "amount": "10.00", "currency": "USD", "fee": "...", "refunded": 0 }` (`fee` may be omitted). Repeating a completed capture returns this same shape. Exact route errors: 400 `{ "error": "A valid PayPal Sandbox order ID is required." }`; 404 `{ "error": "This order was not created in the current server session. Create a new sandbox order first." }`; 409 `{ "error": "PayPal has not confirmed a completed capture for this order. Check PayPal Sandbox before retrying.", "status": "...", "retryBlocked": true }`, `{ "error": "This order capture is already being processed." }`, or `{ "error": "This order is not available for another capture request.", "retryBlocked": true }`; 502 incomplete details `{ "error": "PayPal did not return complete capture details. No transaction was added; check the order in PayPal Sandbox.", "status": "...", "retryBlocked": true }`, mismatch `{ "error": "PayPal capture details did not match the order amount and currency. No transaction was added.", "retryBlocked": true }`, or generic provider `{ "error": "PayPal Sandbox returned an error for this request. Check the API activity log and sandbox order state." }`; 503 uncertain request `{ "error": "The capture request outcome is uncertain. Check PayPal Sandbox before retrying.", "retryBlocked": true }` or missing credentials `{ "error": "PayPal sandbox credentials not set" }`. Non-completed provider capture returns 409 with the descriptive error plus `status`, `captureId`, `orderId`, `amount`, `currency`, optional `fee`, and `retryBlocked: true`.

## `POST /api/paypal/refund`

Requires bearer token and `X-Org-Id`; allowed roles: `owner`, `admin`, `approver`. Request: `{ "proposalType": "refund", "approvalId": "APR-...", "captureId": "...", "currency": "USD", "amount": "1.00", "note": "optional" }`. The approval ID must first be registered for the exact capture, amount, and currency in this organization. Success HTTP 200 `{ "refundId": "...", "status": "COMPLETED", "captureId": "...", "amount": "1.00", "currency": "USD" }`; a repeated completed request returns the cached same shape. Exact route errors: 400 `{ "error": "Only an explicitly approved refund proposal can use this route." }`, `{ "error": "A valid approval reference is required." }`, `{ "error": "Refunds are currently supported only for USD sandbox captures." }`, `{ "error": "Refund amount must be a positive USD amount with at most two decimal places." }`, `{ "error": "Refund amount must be greater than zero." }`, or the remaining-amount message `{ "error": "Refund amount exceeds the remaining captured amount (N.NN USD)." }`; 403 `{ "error": "This refund does not match a server-registered approval, capture, amount, and currency." }`; 404 `{ "error": "The specified PayPal capture is not available in this backend session. No refund was sent." }`; 409 capture-state `{ "error": "The specified capture is not in a refundable completed state." }`, already-locked `{ "error": "This approval is already being submitted. Wait for the current request to finish." }`, used reference `{ "error": "This approval reference was already used for a different refund request." }`, cached pending `{ "error": "...", "status": "...", "retryBlocked": true }`, or provider non-completed `{ "error": "PayPal returned STATUS, not COMPLETED. Verify the refund in PayPal Sandbox; this approval will not be submitted twice.", "status": "STATUS", "retryBlocked": true }`; 502 generic provider error as above; 503 uncertain request `{ "error": "PayPal request outcome is uncertain. Verify PayPal Sandbox before taking further action.", "retryBlocked": true }` or missing credentials `{ "error": "PayPal sandbox credentials not set" }`.

## Phase 2 financial APIs

All routes in this section require `Authorization: Bearer <Supabase JWT>` and `X-Org-Id: <organization UUID>`. The service resolves tenant membership and role; every data query is scoped to that organization. New route errors use `{ "error": { "code": "...", "message": "..." } }`.

### `GET /api/transactions`

Available to all organization roles. Optional query: `limit` (1–100, default 50), `offset` (0 or more, default 0), `type` (`capture|refund`), `status` (`COMPLETED|PENDING|FAILED|REFUNDED`), `from` and `to` (ISO date-time with timezone). Example: `/api/transactions?type=capture&limit=25&offset=0`. Success:

```json
{"transactions":[{"id":"<uuid>","type":"capture","sourceId":"CAPTURE-ID","orderId":"ORDER-ID","captureId":"CAPTURE-ID","refundId":null,"status":"COMPLETED","amount":"10.00","fee":"0.59","net":"9.41","currency":"USD","occurredAt":"2026-10-22T12:00:00Z","data_source":"paypal-sandbox"}],"page":{"limit":25,"offset":0}}
```

Invalid filters, unsupported status, or `from > to` return HTTP 400 code `VALIDATION_ERROR`.

### `GET /api/ledger/entries`

Available to all organization roles. Uses the same `limit`, `offset`, `from`, and `to` filters as transactions. Success returns persisted journal entries, each with its matching organization-scoped lines and account metadata:

```json
{"entries":[{"id":"<uuid>","org_id":"<uuid>","source_type":"capture","source_id":"CAPTURE-ID","description":"PayPal capture CAPTURE-ID","currency":"USD","created_at":"2026-10-22T12:00:00Z","lines":[{"id":"<uuid>","journal_entry_id":"<uuid>","account_id":"<uuid>","debit_minor":941,"credit_minor":0,"currency":"USD","accounts":{"code":"1000","name":"PayPal Balance","account_type":"asset"}}]}],"page":{"limit":50,"offset":0}}
```

### `GET /api/ledger/trial-balance`

Available to all organization roles. Optional query `currency=USD` (USD is the only supported currency in this phase). Returns the database-computed account totals:

```json
{"currency":"USD","accounts":[{"code":"1000","name":"PayPal Balance","type":"asset","debitMinor":941,"creditMinor":0,"debit":"9.41","credit":"0.00"}],"totals":{"debitMinor":1000,"creditMinor":1000,"debits":"10.00","credits":"10.00"},"balanced":true}
```

Unsupported currency returns HTTP 400 code `VALIDATION_ERROR`.

### `GET /api/approvals`

Available to all organization roles. Optional query `status` (`pending|processing|approved|rejected|completed|pending_verification|failed`), `limit` (default 50, capped at 100), and `offset` (default 0). Returns `{ "approvals": [<approval>], "pendingCount": 1, "page": { "limit": 50, "offset": 0 } }`. Each approval has `approvalId`, `orgId`, `proposalType`, `captureId`, `amount`, `amountMinor`, `currency`, `status`, `decisionNote`, `reviewerId`, `result`, `createdAt`, and `createdBy`.

### `GET /api/approvals/pending-count`

Available to all organization roles. Returns `{ "pendingCount": 1 }` for the current organization.

### `GET /api/approvals/:approvalId`

Available to all organization roles. Returns `{ "approval": <approval> }` using the approval shape above. Missing or cross-organization IDs return HTTP 404 code `APPROVAL_NOT_FOUND`.

### `POST /api/approvals/register`

Allowed roles: `owner`, `admin`, `approver`. This is the existing UI-compatible route; its successful response remains `{ "registered": true, "approvalId": "APR-...", "captureId": "...", "amount": "1.00", "currency": "USD" }`, and its legacy string errors retain the sibling `code`. Registration requires an exact completed capture and a positive amount no greater than the capture's remaining amount. It is idempotent for an identical approval ID/capture/amount.

### `POST /api/approvals/:approvalId/decision`

Allowed roles: `owner`, `admin`, `approver`. Request: `{ "decision": "approve", "note": "Reviewed" }` or `{ "decision": "reject", "note": "Needs more evidence" }`; `note` is optional, trimmed, maximum 500 characters. A rejection returns `{ "approvalId": "APR-...", "status": "rejected", "reviewerId": "<user UUID>", "decisionNote": "Needs more evidence" }`. An approval invokes PayPal only for the exact linked completed capture and returns the existing refund success shape on completion. A repeated completed approval returns its cached refund result. Insufficient amount returns HTTP 400 code `REFUND_AMOUNT_EXCEEDED`; non-pending or already-submitted decisions return HTTP 409 with `APPROVAL_ALREADY_DECIDED` or `REFUND_ALREADY_SUBMITTED`; unknown/cross-tenant approval returns HTTP 404 `APPROVAL_NOT_FOUND`. Every decision records the reviewer, note, and audit row.

### `GET /api/reconciliation`

Available to all organization roles. Optional query `currency=USD`. Runs and persists a comparison between completed capture/refund transactions and their ledger revenue/contra-revenue lines. Success:

```json
{"run":{"id":"<uuid>","org_id":"<uuid>","status":"clean","currency":"USD","details":{"capturedMinor":1000,"ledgerCapturedMinor":1000,"refundedMinor":0,"ledgerRefundedMinor":0},"started_at":"2026-10-22T12:00:00Z","completed_at":"2026-10-22T12:00:00Z"},"data_source":"paypal-sandbox"}
```

`status` is `clean` or `mismatch`. Unsupported currency returns HTTP 400 `VALIDATION_ERROR`.

### Webhook processing and event visibility

`POST /api/webhook` acknowledges durable inbox storage; it does not claim the signature has already been verified. Authenticated `GET /api/events` reports recent event objects as `{ "t", "type", "id", "verification" }` and API call records as `{ "t", "m", "ok" }`, scoped to the selected organization. Verification values are `UNVERIFIED`, `FAILED`, `ERROR`, or `VERIFIED`. Only verified completed capture events are posted. Retry/dead-letter processing details remain in the database and are not included in the legacy event response shape.

## Shared request errors

After required authentication and organization checks, malformed JSON returns HTTP 400 `{ "error": "Request body must be valid JSON.", "code": "LEGACY_<METHOD>_<PATH>_400" }` on legacy routes; onboarding returns structured code `BAD_JSON`. Body size over 64 KiB returns HTTP 413 with the legacy string plus sibling code, or structured onboarding code `BODY_TOO_LARGE`. Public routes (`GET /api/status`, `GET /api/public-config`, and `POST /api/webhook`) are exempt from API rate limits and bearer authentication. Other API requests have a 300-request/IP limit per 15 minutes. Authenticated API requests have an additional 240-request/user limit per 15 minutes. Onboarding is additionally limited to 5 requests per IP and 5 per user per hour. Rate-limit responses use the structured error object. API IP and user limits and bearer authentication run before JSON parsing, so an unauthenticated malformed protected request returns 401. After required authentication and organization checks, unknown POST routes return HTTP 404 `{ "error": "unknown route" }` when PayPal credentials exist, or the existing missing-credentials 503 otherwise. After required authentication and organization checks, non-POST API requests return HTTP 405 `{ "error": "Use POST for this API request." }` except the GET-only routes described above.

## Phase 3 FX, reports, and invoices

All routes below require `Authorization: Bearer <Supabase access token>` and `X-Org-Id`. Reads are available to all organization roles. Invoice creation and approval use the role rules listed per route. New errors use `{ "error": { "code": "...", "message": "..." } }`.

### `GET /api/fx/convert`

Query: `amount` (positive decimal string with up to two fractional digits), `base` and `quote` (three-letter ISO currency codes). The server uses a tenant-cached rate from PayPal capture conversion data when available, otherwise Frankfurter. Response:

```json
{"amount":"10.00","baseCurrency":"USD","convertedAmount":"9.20","quoteCurrency":"EUR","rate":"0.92","source":"Frankfurter","timestamp":"2026-10-24T12:00:00.000Z","label":"indicative, not a guaranteed settlement rate","fees":[]}
```

The FX rate is indicative; it is not the PayPal settlement quote. Fees are separate in `fees` and are currently an empty array. Invalid input returns HTTP 400 `VALIDATION_ERROR` or `FX_AMOUNT_INVALID`. Provider outages return HTTP 503 `FX_PROVIDER_UNAVAILABLE`.

### `GET /api/reports/:report`

Supported `:report`: `profit-and-loss`, `trial-balance`, `fees`, `refunds`, `cash-movement`. Optional query `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `currency=USD`, and `format=json|csv` (default `json`). Views aggregate the selected tenant's journal lines by accounting month and honor the requested period. Example:

```json
{"report":"profit-and-loss","from":"2026-10-01","to":"2026-10-31","rows":[{"org_id":"<uuid>","period":"2026-10-01","currency":"USD","code":"4000","name":"Sales Revenue","account_type":"revenue","amount_minor":10000}],"totals":{"revenueMinor":"10000","refundsMinor":"0","netRevenueMinor":"10000","expensesMinor":"300","netIncomeMinor":"9700"}}
```

Trial-balance rows include account code/name/type, debit, credit, and balance minor units; totals include debit/credit and a `balanced` boolean. Fee rows include `fee_minor`; refund rows include `refund_count` and `refund_minor`; cash-movement rows include `cash_movement_minor`. With `format=csv`, the same filtered report is returned as `text/csv` attachment named `<report>.csv`. Invalid date ranges return HTTP 400 `VALIDATION_ERROR`; unsupported reports return HTTP 404 `REPORT_NOT_FOUND`.

### `GET /api/invoices`

Available to all organization roles. Optional `limit` (default 50, max 100), `offset` (default 0), and `state=draft|reviewed|sent|paid|void`. Returns `{ "invoices": [<invoice>], "page": { "limit": 50, "offset": 0 } }`.

### `POST /api/invoices`

Allowed roles: `owner`, `admin`, `accountant`. Request:

```json
{"invoiceNumber":"INV-1001","customerName":"Avery Customer","customerEmail":"avery@example.test","currency":"USD","lines":[{"description":"Consulting","quantity":"2","unitPrice":"50.00","taxRate":"0.0825"}],"total":"1.00"}
```

`invoiceNumber` is limited to 25 characters to match PayPal Invoicing. Client totals/amounts are ignored and recalculated from line quantity, unit price, and tax rate. The response is HTTP 201 `{ "invoice": <invoice> }`; the invoice contains server-computed `subtotal`, `tax`, `total` and their minor-unit values, `state: "draft"`, and computed lines. Invalid required fields or line amounts return HTTP 400 `VALIDATION_ERROR`; invoice-number conflicts return HTTP 409.

### `GET /api/invoices/:invoiceId`

Available to all organization roles. Returns `{ "invoice": <invoice> }`; missing or cross-tenant ID returns HTTP 404 `INVOICE_NOT_FOUND`.

### `POST /api/invoices/:invoiceId/review`

Allowed roles: `owner`, `admin`, `approver`. No request body. Changes a draft to reviewed and returns `{ "invoice": <invoice> }`. Other state transitions return HTTP 400.

### `POST /api/invoices/:invoiceId/send-approval`

Allowed roles: `owner`, `admin`, `accountant`. No request body. Registers or reuses a pending `send-invoice` approval and returns HTTP 201 `{ "approval": <approval> }`. The invoice must already be reviewed.

### `POST /api/approvals/:approvalId/decision` for `send-invoice`

Uses the existing approval endpoint and request `{ "decision": "approve", "note": "Reviewed" }` or `{ "decision": "reject", "note": "Needs changes" }`. Allowed roles remain `owner`, `admin`, `approver`. A rejection returns `{ "approvalId": "APR-INV-...", "status": "rejected", "reviewerId": "<uuid>", "decisionNote": "Needs changes" }`. This deployment uses `PAYPAL_INVOICE_SEND_MODE=simulated` by default after the Sandbox create response could not be parsed safely. Approval still gates the action; the backend records the local invoice/approval state and returns `{ "approvalId": "APR-INV-...", "status": "completed", "invoiceId": "<uuid>", "paypalInvoiceId": null, "state": "sent", "sendMode": "SIMULATED", "simulated": true }`. This does not create or send a PayPal invoice and does not notify the recipient. Live sending is available only when the operator explicitly configures `PAYPAL_INVOICE_SEND_MODE=live`; do not represent simulated state as a real PayPal delivery. A missing send approval cannot reach either path.

### `POST /api/invoices/:invoiceId/void`

Allowed roles: `owner`, `admin`. No request body. Only a draft or reviewed invoice can be voided. Returns `{ "invoice": <invoice> }`.

### Invoice payment updates

The public `POST /api/webhook` endpoint keeps its existing immediate inbox response. Once verified, `INVOICING.INVOICE.PAID` updates a matching sent invoice. It records the invoice's PayPal payment ID and links it to a matching organization capture when present; that capture's existing journal entry remains the ledger source. Configure the PayPal Sandbox webhook to subscribe to `INVOICING.INVOICE.PAID` as well as the existing capture/refund events.
