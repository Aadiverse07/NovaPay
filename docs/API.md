# NovaPay backend API reference

All protected routes require `Authorization: Bearer <Supabase access token>` and `X-Org-Id`. The server resolves role and tenant from that JWT membership. Provider secrets and the service-role key remain server-only. New route errors use `{ "error": { "code": "...", "message": "..." } }`.

## AI assistant

### `POST /api/ai/chat`

Request: `{ "message": "Why did our fees increase?", "context": {} }`. `context` is accepted for compatibility and ignored. `message` must be non-empty and no more than 1,000 characters. All organization roles may ask.

Response: `{ "answer": "...", "route": "retrieval", "reason": "evidence_based_explanation", "citations": ["TRX-ID"], "usage": { "model": "gemini-3.5-flash-lite", "inputTokens": 300, "outputTokens": 40 }, "cached": false }`. `route` is one of `code`, `sql`, `ocr`, `retrieval`, `llm`; arithmetic/FX and structured queries are deterministic and report zero LLM usage. Citations are stable IDs from the authenticated organization's evidence, or `fx-rate:BASE/QUOTE:<timestamp>` for conversions. Optional fields include `proposal` (omitted when none is persisted), `stale`, and `insufficient_evidence`.

Proposals are persisted only as `pending` approvals. A refund proposal references a cited completed capture and uses the server-computed remaining refundable amount. No AI chat request executes a payment action. Approval decisions remain on `POST /api/approvals/:approvalId/decision` and are restricted to `owner`, `admin`, and `approver`; execution uses existing Phase 2/3 checks.

Errors: invalid input returns HTTP 400 `AI_MESSAGE_INVALID`; auth/tenant errors return HTTP 401/403; route limits return `RATE_LIMITED` or `USER_RATE_LIMITED`. Daily AI limits return a safe answer that explains the limit and do not call the provider. Provider errors return a safe unavailable answer without provider response bodies.

## Notifications and anomalies

### `GET /api/notifications`

Query: optional `limit` (1–100, default 50), `offset` (default 0), `status=unread|read|dismissed`. Response: `{ "notifications": [...], "page": { "limit": 50, "offset": 0 } }`. Reads are tenant-scoped.

### `POST /api/notifications/:id/read` and `POST /api/notifications/:id/dismiss`

No request body. Response: `{ "notification": <updated notification> }`. IDs are scoped to the caller's organization.

### `POST /api/anomalies/run`

No request body. Roles `owner`, `admin`, and `accountant` may trigger a deterministic scan. The result includes `scannedAt`, checked transaction/event counts, finding/created counts and newly created findings. Rule thresholds are configured by `ANOMALY_*` environment variables.

## Persistence and access

Migration `supabase/migrations/0005_ai.sql` defines `ai_usage`, `ai_cache`, `anomalies`, and `notifications`. RLS permits member reads only; authenticated clients have no direct write grants. All write and privileged RPCs are callable only by `service_role`. Apply numbered migrations in order and run `npm run check:migrations` before applying a new SQL file.


## Fund maintenance payments (Phase 6 T4)

### `POST /api/funds/maintenance/:requestId/payment`

No request body. Requires `owner`, `admin`, `accountant`, or `approver`. The request must already be `payment_approved`, have its selected quotation and a verified contractor, and satisfy the configured distinct-approver threshold. This creates one idempotent `maintenance-payment` item in the existing `GET /api/approvals` queue; it does not send a payout.

The queue decision is made with `POST /api/approvals/:approvalId/decision` by an `owner`, `admin`, or `approver` other than the maintenance requester. The resulting payment is explicitly `SIMULATED`; `paypalPayoutRef` and `ledgerEntryId` are null, no money is sent, and no ledger entry is posted. Responses include `gap: "simulated, no ledger entry"`. Repeated requests or approvals return the same queued/payment result. PayPal Payouts Sandbox returned `PAYOUT_NOT_AVAILABLE` for this application, so real payouts are disabled.
