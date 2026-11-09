# NovaPay backend API reference

All protected routes require `Authorization: Bearer <Supabase access token>` and `X-Org-Id`. The server resolves role and tenant from that JWT membership. Provider secrets and the service-role key remain server-only. New route errors use `{ "error": { "code": "...", "message": "..." } }`.

## Email signup and workspace onboarding

### `GET /api/auth/preflight?flow=signup|resend|verify|recovery&email=<address>`

Unauthenticated preflight for Supabase Auth actions. Emails are trimmed and lowercased before checking. Signup rejects configured disposable domains with HTTP 422 `DISPOSABLE_EMAIL_BLOCKED`. Limits are signup 5/email/hour and 10/IP/hour; resend 3/email/hour and 10/IP/hour; verify 10/email/15 minutes and 30/IP/15 minutes; recovery 3/email/hour and 10/IP/hour. The email is hashed for the per-email bucket and query strings are excluded from request logs. This route does not send or verify OTPs.

### `GET /api/onboarding`

Requires a confirmed Supabase bearer JWT but no `X-Org-Id`; returns that account's workspace memberships as `{ "organizations": [{ "organizationId": "<uuid>", "role": "owner" }] }`. It allows a returning user to restore a workspace before organization-scoped API calls.

### `POST /api/onboarding`

Requires a confirmed Supabase bearer JWT and no `X-Org-Id`. Unconfirmed users receive HTTP 403 `EMAIL_NOT_CONFIRMED`. The existing create-organization RPC is repeat-safe; clients should first use `GET /api/onboarding` to restore an existing membership.

## AI assistant

### `POST /api/ai/chat`

Request: `{ "message": "Why did our fees increase?", "context": { "view": "transactions", "selection": "TRX-ID", "selectedTransactionIds": ["TRX-ID"], "filteredTransactionIds": ["TRX-ID"] }, "interrupted": { "previousReply": "...", "spokenChars": 30 }, "history": [{ "role": "user", "text": "..." }] }`. Only the message is required. Optional context is advisory; only `view`, `selection`, and at most ten selected/filtered transaction IDs (150 characters each) are projected by the server. Legacy context fields remain accepted but are ignored. History accepts up to ten turns of at most 800 characters; the server derives user, role and organization from the authenticated request. All organization roles may ask.

The dashboard keeps one typed/voice/transcribed conversation in `sessionStorage`, scoped by organization and user, restores it after a page refresh, and provides **New chat**. It clears the current scope on sign-out or when the organization/user scope changes. The server also keeps a process-local short-term memory keyed by the authenticated org and user: at most 20 redacted turns, 800 characters per turn, 30 minutes idle TTL, and at most 1,000 active identity entries. No database migration is used. The resolver runs before intent classification/evidence/search/action validation and rewrites supported follow-ups deterministically; an ambiguous reference gets one short clarification and no provider call. Focus IDs come only from org-scoped selection lookups or IDs in returned evidence/citations. The cache key includes resolved focus IDs, and unresolved questions are not cached. History/focus are framed as untrusted context in provider prompts.

Response: `{ "answer": "...", "speak": "Short speech answer.", "route": "retrieval", "reason": "evidence_based_explanation", "citations": ["TRX-ID"], "actions": [], "usage": { "model": "gemini-3.5-flash-lite", "inputTokens": 300, "outputTokens": 40 }, "cached": false }`. `route` is one of `code`, `sql`, `ocr`, `retrieval`, `llm`; arithmetic/FX and structured queries are deterministic and report zero LLM usage. Citations are stable IDs from the authenticated organization's evidence, or `fx-rate:BASE/QUOTE:<timestamp>` for conversions. Optional fields include `proposal` (omitted when none is persisted), validated `actions`, `speak`, `stale`, and `insufficient_evidence`.

Proposals are persisted only as `pending` approvals. A refund proposal references a cited completed capture and uses the server-computed remaining refundable amount. No AI chat request executes a payment action. Approval decisions remain on `POST /api/approvals/:approvalId/decision` and are restricted to `owner`, `admin`, and `approver`; execution uses existing Phase 2/3 checks.

Errors: invalid input returns HTTP 400 `AI_MESSAGE_INVALID`; auth/tenant errors return HTTP 401/403; route limits return `RATE_LIMITED` or `USER_RATE_LIMITED`. Daily AI limits return a safe answer that explains the limit and do not call the provider. Provider errors return a safe unavailable answer without provider response bodies.

### `POST /api/ai/actions/audit`

Authenticated, org-scoped action audit endpoint. Request contains only `{ "actionId": "invoice.createDraft", "tier": 1, "outcome": "confirmed" }`; valid outcomes are offered, confirmed, proposed, cancelled, completed and failed. Registry tier and role are checked server-side. Confirmed/proposed Tier 1/2 actions share a limit of five per user per minute. Audit failure is fail-closed; callers must not execute the action when this endpoint fails. No action arguments or transcripts are recorded.

## Notifications and anomalies

### `GET /api/notifications`

Query: optional `limit` (1–100, default 50), `offset` (default 0), `status=unread|read|dismissed`. Response: `{ "notifications": [...], "page": { "limit": 50, "offset": 0 } }`. Reads are tenant-scoped.

### `POST /api/notifications/:id/read` and `POST /api/notifications/:id/dismiss`

No request body. Response: `{ "notification": <updated notification> }`. IDs are scoped to the caller's organization.

### `POST /api/anomalies/run`

No request body. Roles `owner`, `admin`, and `accountant` may trigger a deterministic scan. The result includes `scannedAt`, checked transaction/event counts, finding/created counts and newly created findings. Rule thresholds are configured by `ANOMALY_*` environment variables.

## Persistence and access

Migration `supabase/migrations/0005_ai.sql` defines `ai_usage`, `ai_cache`, `anomalies`, and `notifications`. RLS permits member reads only; authenticated clients have no direct write grants. All write and privileged RPCs are callable only by `service_role`. Apply numbered migrations in order and run `npm run check:migrations` before applying a new SQL file.


## Fundraising and maintenance operations (Phase 6 T1–T3)

All `/api/funds/*` endpoints require the Supabase bearer JWT and `X-Org-Id`. Campaign, pledge, PayPal-order, maintenance-request, contractor, quotation, approval, and payment-request operations are described with request/response examples and minimum roles in [FRONTEND-CONTRACT.md](./FRONTEND-CONTRACT.md#phase-6-campaigns-and-maintenance-operations-t1t4). Mutations call tenant-scoped service-only RPCs and append audit records. Pledges remain intent only until a verified posted capture. Payment requests enter the existing Approvals queue and are labelled `SIMULATED`; no payout or ledger entry occurs.


The Maintenance view reads the org-scoped operational request list/detail APIs and shows an honest empty state in authenticated mode. The form maps description/location/category/priority into labeled lines in the existing `scope` column, converts USD major-unit estimates to minor units with the ISO currency exponent, and posts through the existing audited create RPC. Its submit lock prevents double-click duplicate posts. Only owner/admin/accountant see the create button; the pre-existing API role policy is unchanged. Payouts remain SIMULATED. No direct browser fund-table reads occur. The existing request schema has no linked invoice field, so UI payment queueing stays blocked until an invoice link is available.

The application defaults to 1,500 requests per IP and 1,200 authenticated write/action requests per user per 15 minutes; cheap authenticated read-only module endpoints have a separate 2,400-per-user budget. Configure them with server-only `RATE_LIMIT_IP`, `RATE_LIMIT_USER`, and `RATE_LIMIT_READ_USER`; targeted onboarding, auth/OTP, AI, transcription, FX, document and invoice-download limits remain in place. HTTP 429 responses include `Retry-After` and `{ "error": { "code": "RATE_LIMITED" | "USER_RATE_LIMITED", "message": "..." } }`. Invalid inputs and business transition failures use structured errors.

## Fund maintenance payments (Phase 6 T4)

### `GET /api/funds/maintenance`

Returns all persisted maintenance requests for the authenticated organization, including quotations/contractors, approval records, simulated payment metadata, evidence metadata and audit activity. Any org member may read. The response includes the authenticated membership role and the Sandbox payout caution. Empty result: `{ "requests": [], "role": "viewer", "legalCaution": "..." }`. Reads are performed server-side with an explicit organization filter. Migration `0020_fund_maintenance_activity_read.sql` is required for activity because service_role intentionally has no direct SELECT on audit_log. Current schema has no maintenance-to-invoice link; the UI keeps payment queueing blocked until such a linked invoice is available.

### `GET /api/funds/maintenance/:requestId`

Returns one request and the same workflow detail shape. A malformed UUID returns 400 `VALIDATION_ERROR`; unknown and cross-organization IDs return 404 `NOT_FOUND`.

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

## Document intake and review (Phase 5)

All routes require a Supabase bearer token and `X-Org-Id`. `GET /api/documents` returns up to 100 newest rows for the current organization only and includes the resolved `role`; it omits storage paths and is readable by viewers. Empty organizations return `{ "documents": [], "role": "viewer" }` (role varies by membership). Upload, process, confirm, and reject require owner/admin/accountant.

`POST /api/documents` accepts raw PDF, PNG, or JPEG bytes (not multipart), `Content-Type` for the file, and `X-File-Name`; defaults are 10 MB and 10 pages, with 20 uploads/org/hour. Success is 201 `{ "document": { "id": "...", "status": "uploaded", ... } }`. Call `POST /api/documents/:documentId/process`; processed extraction includes `fields`, per-field `confidence`, arithmetic `validation`, and warnings. Duplicate bytes return 409 `DUPLICATE_DOCUMENT` and flag the new record. Processing is subject to the configured per-org concurrency and AI budgets.

`POST /api/documents/:documentId/confirm` accepts `{ "invoiceNumber", "customerName", "customerEmail", "currency", "subtotal", "tax", "total" }`. It validates required fields, recomputes minor-unit totals on the server, and atomically creates exactly one `draft` invoice linked to the document, confirms the document, and writes an audit row. A repeated request for the same document returns the existing draft (`alreadyConfirmed: true`). The response contains `{ "invoice": { "id": "...", "state": "draft" }, "confirmed": true, "alreadyConfirmed": false }`. Missing/invalid fields return HTTP 400 with the field name; a subtotal/tax mismatch returns 422. Confirmation never invokes invoice send, PayPal, or send-approval. `POST /api/documents/:documentId/reject` accepts optional `{ "reason": "..." }`. `DELETE /api/documents/:documentId` removes the private Storage object and document/chunks/search data; this route is available to owner/admin/accountant. All errors use structured `{ "error": { "code": "...", "message": "..." } }` envelopes unless noted.

The invoice draft ID is recorded in document confirmation metadata by the confirmation transaction itself. No separate draft creation call or client-supplied invoice ID is used.

`GET /api/documents/:documentId` returns `{ "document": { "id", "filename", "mime_type", "byte_size", "page_count", "status", "duplicate_of", "extraction", "created_at", "updated_at" } }` for a document in the authenticated organization. The lookup includes both document ID and membership organization ID; another tenant's or unknown ID returns HTTP 404 `{ "error": { "code": "DOCUMENT_NOT_FOUND", "message": "Document not found." } }`. Missing/invalid bearer authentication returns 401; malformed IDs return 400 `DOCUMENT_ID_INVALID`. Storage paths are never returned.

## Invoice CRUD (migration 0018)

All invoice routes require a Supabase bearer token and `X-Org-Id`; every read and mutation is organization-scoped. `GET /api/invoices` is available to members and returns `{invoices,page,role}` so the UI can hide writes for viewer/resident roles. Invoice mutations require owner, admin, or accountant. No authenticated view uses sample invoices.

`POST /api/invoices` creates one draft. Send a UUID `Idempotency-Key` header. The body requires `invoiceNumber`, `customerName`, `customerEmail`, `currency`, `issueDate`, `dueDate`, and one or more `lines` containing `description`, `quantity`, `unitPrice`, and `taxRate` (decimal fraction, e.g. `0.1` for 10%); optional `notes`. The server calculates line totals and invoice totals. Client-supplied totals are ignored. Validation returns 400 `VALIDATION_ERROR` with safe `fields` paths/messages. Repeating the same key returns the same invoice and does not create another audit row.

`PATCH /api/invoices/:invoiceId` updates all draft fields and replaces its line items; totals are recomputed by the server. A reviewed invoice must first be moved back to draft with `POST /api/invoices/:invoiceId/reopen`. `POST /api/invoices/:invoiceId/review` changes draft to reviewed. `POST /api/invoices/:invoiceId/send-approval` is only available for reviewed invoices and registers an approval; sending remains SIMULATED and is not delivered. `POST /api/invoices/:invoiceId/void` can void reviewed or sent invoices. Only drafts can be deleted with `DELETE /api/invoices/:invoiceId` plus a UUID `Idempotency-Key`; reviewed/sent must be voided, and paid/void are read-only. Delete removes only the invoice and invoice lines, clears any source document link through the FK, leaves the document itself intact, and writes an audit row. State conflicts return 409; unknown/cross-tenant IDs return 404. RPC execution is granted only to `service_role`.

### `GET /api/invoices/:invoiceId/download`

Available to every authenticated member role, including viewer. The route fetches the stored invoice by both organization and invoice ID and returns `application/pdf` as `invoice-<invoice-number>.pdf`; it never accepts totals from the client. Each successful download inserts `invoice.downloaded` into `audit_log` with the invoice ID only. Downloads are limited to 20 per user per hour. Unknown and cross-tenant IDs return 404; missing authentication returns 401. Generated PDFs use stored minor units and ISO currency exponents, include a DRAFT mark for draft/reviewed records, paginate long line items, and include the footer “Generated by NovaPay. Sandbox demo, not a tax document.”

The browser fetches the PDF with JWT and `X-Org-Id` headers, then saves the blob as `invoice-<number>.pdf`. Errors are categorized as expired session (401), not found (404), rate limited (429), or server error (5xx). Internal 5xx details are hidden; the route logs request ID, status and safe error code only.

`GET /api/invoices/:invoiceId` also includes the organization-scoped `events` status history when available. The read-only detail view includes invoice identity/status, customer, dates, currency, line items, totals, notes and source document link.


## Currency conversion

- `GET /api/fx/currencies` (authenticated, organization-scoped): merged code/name/minor-unit exponent/provider coverage from Frankfurter and open.er-api.com; server cache TTL 6 hours.
- `GET /api/fx/convert?amount=10.00&base=USD&quote=INR` (authenticated): decimal arithmetic with ISO exponents; primary Frankfurter, fallback open.er-api.com and USD cross rates where needed. Rates are stored in `fx_rates` with source and fetch timestamp; requests are rate-limited and provider calls time out/retry once.
- Responses include `rate`, `source`, `timestamp`, and `indicative, not a guaranteed settlement rate`. These sources update about once per working day, not tick-by-tick. open.er-api.com requires attribution; the Reports converter links to ExchangeRate-API.

### `POST /api/ai/transcribe`

Authenticated, organization-scoped. Accepts an `application/octet-stream` audio body (maximum 8 MB) plus `X-Audio-Mime-Type` (`audio/webm`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/mpeg`, or `audio/aac`). Limited to 10 clips per user per 15 minutes. Returns `{ "transcript": "..." }`; raw audio is not stored. This is the only voice path that sends audio to Gemini (Gemini 3.5 Transcribe via the server-side key pool). For Brave or browsers without a working SpeechRecognition service, hold the AI view mic button to record, then the transcript follows the same AI query pipeline as typed and recognized speech. Free-tier provider terms may allow submitted data to be used for product improvement; use only non-sensitive sample speech.
# Payment failures

`GET /api/failures?limit=50&offset=0` returns recent organization-scoped failure records for owner, admin, accountant and approver roles. Records retain sanitized provider issue codes and debug identifiers only; they do not include provider response bodies.

## Support tickets

- `POST /api/support/tickets` creates a ticket and first message (maximum 10 per user per hour).
- `GET /api/support/tickets` lists the caller's tickets; support, owner and admin can list the organization queue. Supports `status`, `priority`, `category`, `limit`, and `offset` filters.
- `GET /api/support/tickets/:id` returns the ticket thread, excluding internal notes from the creator.
- `POST /api/support/tickets/:id/messages` adds a reply; only support, owner and admin can set `internalNote`.
- `PATCH /api/support/tickets/:id` updates status, priority or assignee for support, owner and admin.

## Sensitive-action re-authentication

- `POST /api/security/step-up/otp` sends a re-authentication email code to the signed-in account.
- `POST /api/security/step-up` accepts either `{ "method": "password", "password": "…", "deviceId": "<registered-device-uuid>" }` or `{ "method": "email_otp", "code": "<code>", "deviceId": "<registered-device-uuid>" }`. Successful verification creates a device-bound grant for `STEP_UP_TTL_MINUTES` (default 10).
- Refund approvals and invoice sends can return HTTP 403 with `error.code: "STEP_UP_REQUIRED"`; the client prompts and retries that action once after verification. Risk weights, thresholds and the optional always-step-up refund policy are configured by `SECURITY_RISK_*` and `STEP_UP_ALWAYS_FOR_REFUNDS`.
