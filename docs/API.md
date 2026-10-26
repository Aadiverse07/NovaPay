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

## Completion evidence and maintenance close (Phase 6 T5)

Evidence stores metadata only. `fileRef` is an optional reference string; NovaPay does not upload or store file contents. The response caution is: “Evidence supports, but does not prove, that work was done correctly.”

### `POST /api/funds/maintenance/:requestId/evidence`

Allowed roles: `owner`, `admin`, `accountant`, `resident`. Request:

```json
{"kind":"inspection","description":"Final inspection checklist and notes.","fileRef":"maintenance/inspection/REQ-1001.pdf"}
```

A `paid` request moves to `evidence_submitted`; additional metadata can be submitted in that state. Success is HTTP 201:

```json
{"request":{"id":"<uuid>","status":"evidence_submitted"},"evidence":{"id":"<uuid>","kind":"inspection","description":"Final inspection checklist and notes.","file_ref":"maintenance/inspection/REQ-1001.pdf","review_status":"pending"},"caution":"Evidence supports, but does not prove, that work was done correctly."}
```

Kinds are `photo`, `invoice`, `inspection`, or `other`. Description is 1–2000 characters and `fileRef` is at most 500 characters. No evidence can be submitted before payment is approved and recorded. Invalid metadata returns 400 `VALIDATION_ERROR`; invalid state returns 409 `FUND_STATE_CONFLICT`.

### `POST /api/funds/maintenance/:requestId/evidence/:evidenceId/review`

Allowed roles: `owner`, `admin`, `approver`; the requester and evidence submitter cannot review. Request:

```json
{"decision":"accept","note":"Reviewed against the completion checklist."}
```

`decision` is `accept` or `reject`; note is optional and at most 500 characters. A rejected item leaves the request in `evidence_submitted` so more evidence can be added. The request moves to `reviewed` after all submitted evidence has been reviewed and at least one item is accepted. Response contains the updated `request`, `evidence`, and the caution above. A repeated matching review is idempotent.

### `POST /api/funds/maintenance/:requestId/close`

Allowed roles: `owner`, `admin`, `approver`; the requester cannot close their own request. No request body. Close is allowed only from `reviewed` with accepted evidence. Success: `{ "request": { "id": "<uuid>", "status": "closed", "closed_by": "<uuid>", "closed_at": "<timestamp>" }, "closed": true }`. Repeated close is idempotent; premature close returns 409 `FUND_STATE_CONFLICT`.

All three writes use tenant-checked service-role RPCs and write audit-log records for evidence and workflow changes. Fund table access is through the scoped API/RPC; authenticated clients cannot query these tables directly.


## Fund transparency and audit export (Phase 6 T6)

### `GET /api/funds/transparency`

Available to any authenticated member role in the selected organization, including `donor` and `resident`. Optional `campaignId=<uuid>` filters one campaign. The endpoint returns campaign totals, contribution status/amounts with an org-scoped SHA-256 `donorRefHash`, and maintenance expense rows linked to approvals, quotation, payment, ledger and sanitized completion evidence. Names are always omitted; evidence descriptions, file references and reviewer/submitter identities are not exposed. `legalCaution` explains that real-money pooled funds, donations and third-party payouts depend on PayPal product eligibility and local rules; Sandbox demonstrates the workflow only.

Each expense has a `gaps` array of objects such as `{ "gap": "no completion evidence" }`, `{ "gap": "no payment reference" }`, and `{ "gap": "simulated, no ledger entry" }`. SIMULATED rows are labeled in `payment.mode`, expose null payment/ledger references, and never imply a real payout. Example:

```json
{"orgId":"<uuid>","campaigns":[{"campaign":{"id":"<uuid>","title":"Community Roof Project"},"receivedMinor":2500,"actualSpendingMinor":0}],"contributions":[{"campaignId":"<uuid>","amountMinor":2500,"status":"received","donorRefHash":"<sha256>","countsAsFunds":true}],"expenses":[{"requestId":"<uuid>","approvals":[{"id":"<uuid>","step":"payment","decision":"approved"}],"quotation":{"id":"<uuid>","amountMinor":9999},"invoice":null,"payment":{"mode":"SIMULATED","status":"paid","amountMinor":9999},"paymentReference":null,"ledgerEntryId":null,"completionEvidence":[],"gaps":[{"gap":"no payment reference"},{"gap":"simulated, no ledger entry"},{"gap":"no completion evidence"}]}],"namesShown":false,"legalCaution":"Real-money pooled funds, donations, and third-party payouts depend on PayPal product eligibility and local rules. Sandbox demonstrates the workflow only."}
```

### `GET /api/funds/transparency/audit.csv`

Allowed roles: `owner`, `admin`. Optional `from=YYYY-MM-DD` and `to=YYYY-MM-DD` are inclusive UTC date filters. Returns `text/csv` with quoted/formula-neutralized columns `id,createdAt,action,entity,entityId,actorRef,requestId`; `actorRef` is a stable org-scoped hash. Arbitrary audit metadata is excluded. Invalid filters return 400 `VALIDATION_ERROR`. Both endpoints are read-only and organization-scoped; authenticated clients have no direct SELECT on Phase 6 fund tables.
