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

Requires bearer token and `X-Org-Id`; all organization roles may ask questions. Request: `{ "message": "Show refunds this month", "context": { "transactions": [] } }`. `message` must be a non-empty string up to 1,000 characters. The legacy `context` field remains accepted but is ignored; the server builds org-scoped evidence from the authenticated membership.

HTTP 200 response shape:

```json
{"answer":"Found 1 refund record(s), totaling 2.50 USD.","route":"sql","reason":"structured_refunds_query","citations":["REFUND-ID"],"usage":{"model":null,"inputTokens":0,"outputTokens":0},"cached":false}
```

`route` is `code`, `sql`, `ocr`, `retrieval`, or `llm`. Arithmetic and FX use `code`; allow-listed structured financial reads use `sql`. Both bypass the LLM and report zero model tokens. For example, `Convert 5000 INR to USD` returns a computed answer with the `indicative, not a guaranteed settlement rate` label, source and timestamp. `citations` contains stable record IDs; an FX citation has the form `fx-rate:INR/USD:<timestamp>`. `retrieval`/`llm` answers cite IDs from the server-built evidence. The safe insufficient-evidence answer includes `insufficient_evidence: true`. The `usage` object reports selected model and input/output token counts; cache hits have zero provider tokens and `cached: true`. Daily-limit and provider-unavailable responses are HTTP 200 safe answers with their corresponding explanatory text; the limit response makes no provider call.

If the model proposes an action and its target is a cited, eligible record, the service creates an org-scoped `pending` approval and includes a `proposal` object with `type`, `txId`, sanitized `title`/`reason`, `approvalId`, and `status: "pending"`. Refund proposal amount is computed by the server from the exact completed capture's remaining refundable balance. Chat never calls PayPal. Only `owner`, `admin`, or `approver` can decide an approval through `POST /api/approvals/:approvalId/decision`; execution uses the existing checks and idempotent PayPal path. Unsupported, uncited, foreign, or ineligible proposals create no approval. No proposal is returned when none was persisted.

Empty model reply uses `The AI returned an empty answer. Try asking about a field shown in a transaction row.`; malformed JSON uses `The AI response could not be read safely. Please retry or review the transaction records directly.` Provider bodies and credentials are never returned. Invalid input is HTTP 400 `{ "error": { "code": "AI_MESSAGE_INVALID", "message": "Provide a non-empty message of at most 1000 characters." } }`; auth/tenant errors follow the standard 401/403 envelopes and API limits use `RATE_LIMITED` or `USER_RATE_LIMITED`.

The default provider is Gemini (`LLM_PROVIDER=gemini`, model from `LLM_MODEL`, fallback from `LLM_FALLBACK_MODEL`). Anthropic is used only with `LLM_PROVIDER=anthropic`; key can be `LLM_API_KEY` or optional legacy `ANTHROPIC_API_KEY`. When the provider is not configured or fails, retrieval/general questions return a safe HTTP 200 unavailable answer; deterministic code/SQL routes remain usable.

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

## Phase 4 notifications and AI controls

### `GET /api/notifications`

Requires bearer token and `X-Org-Id`; all organization roles can read their organization's notifications. Optional query: `limit` (1–100, default 50), `offset` (default 0), `status=unread|read|dismissed`. Returns `{ "notifications": [...], "page": { "limit": 50, "offset": 0 } }`. Notification rows contain their ID, organization/anomaly references, rule, severity, evidence IDs, status and timestamps; they do not contain raw payer identifiers.

### `POST /api/notifications/:id/read` and `POST /api/notifications/:id/dismiss`

Requires bearer token and `X-Org-Id`; updates only the matching organization's notification and returns `{ "notification": <notification> }`. Missing IDs return HTTP 404 `NOTIFICATION_NOT_FOUND`; invalid actions/filters return HTTP 400 `VALIDATION_ERROR`.

### `POST /api/anomalies/run`

Requires bearer token and `X-Org-Id`; roles `owner`, `admin`, and `accountant` may run a deterministic scan. Returns scan time, transaction/event counts, finding/created counts, and newly persisted findings. Duplicate findings are deduplicated by organization/rule/evidence/day. Re-running does not create duplicate notifications. Scan/database errors use the standard structured error shape.

## Phase 6 campaigns and maintenance operations (T1–T4)

All routes require `Authorization: Bearer <Supabase JWT>` and `X-Org-Id`. New fund errors use `{ "error": { "code": "...", "message": "..." } }`; invalid bodies, IDs, and filters return 400 `VALIDATION_ERROR`, role failures return 403 `ROLE_FORBIDDEN` or `FUND_FORBIDDEN`, illegal workflow transitions return 409 `FUND_STATE_CONFLICT`, and missing/cross-org resources return 404. Every API call is limited to 300 requests per IP per 15 minutes; authenticated requests also have a 240-request per-user limit per 15 minutes. Payment and approval routes inherit these limits and return structured `RATE_LIMITED` or `USER_RATE_LIMITED` responses with HTTP 429. State-changing database RPCs append audit-log records.

| Method and route | Minimum roles |
|---|---|
| `GET /api/funds/campaigns` | Any org member |
| `POST /api/funds/campaigns` | owner, admin, accountant |
| `GET /api/funds/campaigns/:campaignId/summary` | Any org member |
| `POST /api/funds/campaigns/:campaignId/pledges` | owner, admin, accountant, approver |
| `POST /api/funds/contributions/:contributionId/paypal-order` | owner, admin, accountant, approver |
| `POST /api/funds/maintenance` | owner, admin, accountant, approver, resident |
| `POST /api/funds/contractors` | owner, admin, accountant |
| `POST /api/funds/maintenance/:requestId/quotations` | owner, admin, accountant |
| `POST /api/funds/maintenance/:requestId/scope-approval` | owner, admin, approver |
| `POST /api/funds/maintenance/:requestId/contractor-verification` | owner, admin, approver |
| `POST /api/funds/maintenance/:requestId/payment-approval` | owner, admin, approver |
| `POST /api/funds/maintenance/:requestId/payment` | owner, admin, accountant, approver |

### `GET /api/funds/campaigns`

Lists up to 100 campaigns for the selected org. Example response:

```json
{"campaigns":[{"id":"<uuid>","title":"Community Roof Project","purpose":"Replace common-area roofing.","targetMinor":50000,"currency":"USD","deadline":null,"organiser":"Community","status":"active","createdAt":"<timestamp>"}]}
```

### `POST /api/funds/campaigns`

Request:

```json
{"title":"Community Roof Project","purpose":"Replace common-area roofing.","targetMinor":50000,"deadline":null,"organiser":"Community","status":"active"}
```

`status` is `draft|active` (default `active`); amounts are positive integer USD minor units. Returns HTTP 201 `{ "campaign": <campaign> }`. Creation is audited.

### `GET /api/funds/campaigns/:campaignId/summary`

Returns database-computed integer minor-unit figures:

```json
{"campaign":{"id":"<uuid>","title":"Community Roof Project","targetMinor":50000,"currency":"USD","status":"active"},"pledgedMinor":5000,"receivedMinor":2500,"allocatedMinor":0,"approvedExpensesMinor":0,"actualSpendingMinor":0,"remainingMinor":47500,"asOf":"<timestamp>","legalCaution":"Real-money pooled funds, donations, and third-party payouts depend on PayPal product eligibility and local rules. Sandbox demonstrates the workflow only."}
```

Pledged amounts are intent only; only a verified, posted PayPal capture changes `receivedMinor` and creates a receipt. `remainingMinor = targetMinor - receivedMinor`.

### `POST /api/funds/campaigns/:campaignId/pledges`

Allowed roles are listed in the matrix. Request `{ "amountMinor": 2500 }`. Returns HTTP 201:

```json
{"contribution":{"id":"<uuid>","status":"pledged","amountMinor":2500,"currency":"USD","donorRef":"anonymous","countsAsFunds":false},"message":"Pledge recorded as intent only; it does not count as received funds."}
```

### `POST /api/funds/contributions/:contributionId/paypal-order`

No request body. Creates or reuses an idempotent PayPal Sandbox order linked to the pledge. Returns HTTP 201 `{ "orderId":"<id>","status":"CREATED","approveUrl":"<PayPal approval URL>","amount":"25.00","currency":"USD","contributionId":"<uuid>" }`. The signed, verified completed capture webhook—not the approval redirect—posts the capture and marks the contribution received. Missing PayPal config returns 503 `PAYPAL_UNAVAILABLE`; orders over USD 10,000 return 400 `PAYPAL_AMOUNT_LIMIT`.

### `POST /api/funds/maintenance`

Allowed roles include resident requesters. Request `{ "campaignId":"<uuid>","title":"Roof repair","scope":"Replace damaged shingles.","estimateMinor":9999 }`; `campaignId` and `estimateMinor` may be null/omitted. Returns HTTP 201 `{ "request": { "id":"<uuid>","status":"requested", "title":"Roof repair" } }`. The request is audited.

### `POST /api/funds/contractors`

Allowed roles: owner, admin, accountant. Request `{ "name":"Northside Roofing","paymentDestinationRef":null }`; the destination reference is optional and must remain server-side. Returns HTTP 201 `{ "contractor": { "id":"<uuid>","name":"Northside Roofing","verification_status":"unverified" } }`. A contractor must be verified by an authorized reviewer before payment approval.

### `POST /api/funds/maintenance/:requestId/quotations`

Request `{ "contractorId":"<uuid>","amountMinor":9999,"documentRef":"quote-1001.pdf" }`; document reference is metadata, not an uploaded file. Returns HTTP 201 `{ "quotation": { "id":"<uuid>","amount_minor":9999 },"status":"quoting" }`.

### `POST /api/funds/maintenance/:requestId/scope-approval`

Request `{ "quotationId":"<uuid>","note":"Scope and quote reviewed." }`. Requires a quote belonging to this request and an approver other than the requester. Returns `{ "request": { "status":"scope_approved" }, "approval": { "step":"scope","decision":"approved" } }` and writes audit rows.

### `POST /api/funds/maintenance/:requestId/contractor-verification`

No request body. An owner/admin/approver distinct from the requester verifies the selected contractor. Returns `{ "request": { "status":"contractor_verified" }, "contractor": { "verification_status":"verified","verified_by":"<user UUID>","verified_at":"<timestamp>" } }`; verification is audited.

### `POST /api/funds/maintenance/:requestId/payment-approval`

Request `{ "note":"Payment reviewed." }` (optional). Requires a verified contractor and chosen quote. At or above the configured 10000-minor-unit threshold, two distinct approvers are required; the requester cannot approve their own request. Response `{ "status":"contractor_verified","approvals":1,"required":2,"approval":{"step":"payment","decision":"approved"} }` until threshold is met; then status is `payment_approved`. Every recorded approval is audited.

### `POST /api/funds/maintenance/:requestId/payment`

No request body. Checks the workflow gate and queues the payment in the existing Approvals queue; it does not execute a payout. Returns HTTP 202 `{ "approval": <approval>, "mode":"SIMULATED", "simulated":true,"gap":"simulated, no ledger entry","message":"Payment request is queued for approval. PayPal Payouts are unavailable; no money will be sent and no ledger entry will be posted." }`. Payment decision is completed through the existing `POST /api/approvals/:approvalId/decision` route. SIMULATED means no money movement and no ledger posting; always display the label and gap.

The canonical read-only view for maintenance, quotations, approvals, payment and evidence links is `GET /api/funds/transparency`; there are no direct fund-table reads or standalone contractor/request list routes. Evidence submit/review/close and transparency/export are documented below.

## Phase 6 maintenance completion evidence (T5)

All requests require `Authorization: Bearer <Supabase access token>` and `X-Org-Id`. Responses use `{ "error": { "code": "...", "message": "..." } }` for structured failures. Evidence is metadata only; no file contents are uploaded. Always display the caution “Evidence supports, but does not prove, that work was done correctly.”

### `POST /api/funds/maintenance/:requestId/evidence`

Allowed roles: `owner`, `admin`, `accountant`, `resident`. Request:

```json
{"kind":"inspection","description":"Final inspection checklist and notes.","fileRef":"maintenance/inspection/REQ-1001.pdf"}
```

Success HTTP 201:

```json
{"request":{"id":"<uuid>","status":"evidence_submitted"},"evidence":{"id":"<uuid>","kind":"inspection","description":"Final inspection checklist and notes.","file_ref":"maintenance/inspection/REQ-1001.pdf","review_status":"pending"},"caution":"Evidence supports, but does not prove, that work was done correctly."}
```

Kinds: `photo|invoice|inspection|other`; description 1–2000 characters; `fileRef` optional, max 500 characters. Only a paid maintenance request accepts evidence; otherwise HTTP 409 `FUND_STATE_CONFLICT`. Invalid body/ID is HTTP 400 `VALIDATION_ERROR`.

### `POST /api/funds/maintenance/:requestId/evidence/:evidenceId/review`

Allowed roles: `owner`, `admin`, `approver`. Requester and evidence submitter cannot review. Request: `{ "decision": "accept", "note": "Reviewed against the completion checklist." }`; `decision` is `accept|reject`, note optional/max 500. Success returns updated `request`, `evidence`, and the caution string. Rejection keeps the request `evidence_submitted`; accepted evidence advances it to `reviewed` when no item remains pending and at least one item is accepted. Matching retries are idempotent. Invalid ID/body is 400; self-review is 403 `FUND_FORBIDDEN`; invalid state is 409 `FUND_STATE_CONFLICT`.

### `POST /api/funds/maintenance/:requestId/close`

Allowed roles: `owner`, `admin`, `approver`; requester cannot close their own request. No body. Requires `reviewed` status and at least one accepted evidence item. Success: `{ "request": { "id": "<uuid>", "status": "closed" }, "closed": true }`; repeated close is idempotent. Premature close is 409 `FUND_STATE_CONFLICT`; self-close is 403 `FUND_FORBIDDEN`.

These actions use service-role-only RPCs and audit log records. Authenticated clients cannot query Phase 6 fund tables directly; use the scoped API/RPC endpoints for reads.


## Phase 6 transparency and export (T6)

### `GET /api/funds/transparency`

Available to any authenticated member role, including donors and residents. Requires `X-Org-Id`; optional `campaignId=<uuid>` filters the selected org's campaign. The response includes safe campaign totals, contribution amounts/statuses with `donorRefHash` (SHA-256 scoped by org), and linked expense rows. Names, raw donor refs, contractor names, evidence descriptions/file paths, and reviewer/submitter IDs are omitted. `namesShown` is always `false`; include the returned `legalCaution` in the transparency view.

Example expense row:

```json
{"requestId":"<uuid>","campaignId":"<uuid>","title":"Roof repair expense","status":"closed","amountMinor":9999,"currency":"USD","approvals":[{"id":"<uuid>","step":"payment","decision":"approved"}],"paymentApproval":{"id":"APR-FUND-PAY-...","status":"completed"},"quotation":{"id":"<uuid>","amountMinor":9999,"currency":"USD"},"invoice":null,"payment":{"id":"<uuid>","mode":"SIMULATED","status":"paid","amountMinor":9999},"paymentReference":null,"ledgerEntryId":null,"completionEvidence":[{"id":"<uuid>","kind":"inspection","reviewStatus":"accepted"}],"gaps":[{"gap":"no payment reference"},{"gap":"simulated, no ledger entry"}]}
```

Render every `gaps` item, including `{ "gap": "no quotation or invoice" }`, `{ "gap": "no payment approval" }`, `{ "gap": "no payment reference" }`, `{ "gap": "simulated, no ledger entry" }`, `{ "gap": "no ledger entry" }`, and `{ "gap": "no completion evidence" }`. Do not imply a SIMULATED row moved money or posted to the ledger. The endpoint has no write method. Direct Phase 6 fund table reads are revoked for authenticated clients; cross-org `X-Org-Id` returns 403.

### `GET /api/funds/transparency/audit.csv`

Allowed roles: `owner`, `admin`; optional inclusive UTC date filters `from=YYYY-MM-DD` and `to=YYYY-MM-DD`. Response is `text/csv`, attachment `fund-audit.csv`, headers `id,createdAt,action,entity,entityId,actorRef,requestId`. `actorRef` is pseudonymous; metadata and raw actor IDs are omitted. CSV quoting and formula prefixes are neutralized. Other roles receive 403; invalid/reversed dates receive 400 `VALIDATION_ERROR`.

## Documents view (Phase 5)

`GET /api/documents` loads the live organization list and resolved role. It returns no storage paths; show an explicit empty state when there are no rows and an unavailable state on errors. Do not substitute example records in authenticated mode. Viewers may read the list but cannot upload, process, confirm, reject or delete; the server enforces owner/admin/accountant for writes.

Upload raw selected `File` bytes to `POST /api/documents` with its MIME type and `X-File-Name`, then call `POST /api/documents/:id/process`. Show uploaded/processing/processed/rejected/failed states. Review `extraction.fields`, each `confidence` value, `validation.warnings`, and `duplicate_of`; show arithmetic and duplicate warnings before confirmation. Confirmation creates an invoice draft only, using `POST /api/invoices`, followed by `POST /api/documents/:id/confirm`; never call invoice send or send-approval from this flow. Collect supplier email if absent from OCR. If the draft request succeeds and confirmation fails, do not repeat draft creation automatically. Reject via `POST /api/documents/:id/reject`.

On successful invoice draft creation, include its returned UUID as `invoiceDraftId` in the document confirm request. The confirmation metadata is returned by the list route and the UI should show a completed state, preventing repeat draft creation from that document.
