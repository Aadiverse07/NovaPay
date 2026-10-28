# Phase 0 decisions

## Existing `server.js` audit

| Existing part | Decision | Reason |
| --- | --- | --- |
| PayPal OAuth token cache and 60 second failure back-off | Kept in `server/src/services/paypal.js` | Protocol behavior is already useful and must stay stable. |
| PayPal API request helper, sandbox endpoint, deterministic `PayPal-Request-Id` | Kept in `server/src/services/paypal.js` | Preserves request headers, request-ID derivation, and provider error handling. |
| Order amount/request-key validation and PayPal approval URL checks | Kept in PayPal service and route | The same ranges, key shape, and `https`/`paypal.com` rule remain in force. |
| Capture state machine, amount/currency match, lock and uncertain-outcome behavior | Kept in PayPal route and in-memory repositories | These prevent duplicate or mismatched captures; repositories isolate the existing session-local state. |
| Refund validation, approval registration, reserved/refunded amount accounting, locks, and result cache | Kept in approval/PayPal routes and in-memory repositories | Preserves current approval gate and duplicate-submission behavior. |
| Webhook signature verification through PayPal | Kept in PayPal service and webhook route | Preserves `UNVERIFIED`, `ERROR`, `FAILED`, and `VERIFIED` results. |
| System prompt, JSON sanitiser, proposal allow-list, and evidence filtering | Kept in `server/src/services/ai.js`; provider calls go through `server/src/services/llm.js` | Preserves the old AI guardrails and response shape while allowing a provider adapter to change independently. |
| Anthropic provider | Rewritten as an optional `server/src/services/llm.js` adapter | It is selected only when `LLM_PROVIDER=anthropic`; Anthropic credentials remain optional and do not enable it by themselves. |
| Maps and arrays for orders, captures, approvals, webhook events, and API calls | Rewritten as `OrdersRepo`, `CapturesRepo`, `ApprovalsRepo`, and `EventsRepo` in-memory adapters | The data remains process-local in this phase, while route code uses repository interfaces. Phase 2 can replace adapters. |
| Hand-written HTTP routing/body parser | Rewritten with Express routers and `express.json({ limit: '64kb' })` | Provides modular routing while maintaining the old request limit and API payloads. |
| Hand-written static allow-list and MIME mapping | Rewritten with `express.static(STATIC_DIR)` and root `preview.html` handling | Uses the requested static middleware; `STATIC_DIR` defaults to the repository root. |
| Hand-written `.env` parser | Dropped | Runtime configuration uses the standard pinned `dotenv` loader and is validated with zod; no custom parser remains. |
| Root `server.js` | Dropped after parity verification in a separate follow-up commit | The modular Express server matched the legacy static pages and no-credentials route responses; the monolith is no longer needed. |

## Configuration and compatibility notes

- `STATIC_DIR` relative paths resolve from the repository root.
- Added pinned `express`, `helmet`, and `zod` for the requested HTTP stack, response headers, and configuration validation; added pinned `dotenv` so standard `.env` files remain usable without retaining the hand-written parser.
- Supabase/database-backed persistence, authentication, and new features are out of scope for this safe refactor.
- Phase 0 legacy API errors preserve the exact `{ "error": "..." }` string and add a sibling `code` field. This keeps the current UI's `d.error` string handling intact while adding a stable method/path/status code. New routes from Phase 1 onward use `{ "error": { "code", "message" } }`.
- Anthropic provider error bodies are now replaced with a generic message to comply with the master security rule against leaking provider responses; this affects only provider-error wording.
- Helmet's default Content Security Policy is disabled because it would block existing inline UI code. Other Helmet headers remain enabled.
- Phase 0 retrofit audit (2026-10-22): the previous implementation had no provider interface and `services/ai.js` directly called Anthropic. Added Gemini as the default provider, an opt-in Anthropic adapter, model configuration from env, and a fake provider for deterministic tests. Existing frontend routes and response shapes remain in place.
- Error envelope decision (2026-10-22): keep each legacy route's `error` string unchanged and add sibling `code: LEGACY_<METHOD>_<PATH>_<STATUS>`. Use the nested `{ error: { code, message } }` shape for new routes starting Phase 1. This is additive for the legacy UI and gives new endpoints a consistent structured contract.

## LLM model choice (2026-10-22)

- Choice: default `LLM_MODEL=gemini-3.5-flash-lite`, with `LLM_FALLBACK_MODEL=gemini-3.1-flash-lite`.
- Reason: Google's current official model catalog lists both as stable Flash-Lite models. The official pricing page lists free-tier input and output for both. The 3.5 model is the primary choice because it is the newer stable Flash-Lite model; the 3.1 model is a configured retry fallback.
- Sources checked 2026-10-22: [Google Gemini models](https://ai.google.dev/gemini-api/docs/models) and [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing). The REST request follows the official [`generateContent` API](https://ai.google.dev/api/generate-content) system-instruction and contents format.
- Free-tier availability and quotas are subject to Google's account, region, and current rate-limit conditions; no live provider request was made in this local verification.

## Phase 1 foundation decisions

- Public Supabase configuration (2026-10-22): `GET /api/public-config` returns exactly `supabaseUrl` and `supabaseAnonKey` (or `null` values when Supabase is not configured). Both values are intended for browser initialization; the anon key is protected by database RLS. The service-role key is never returned, logged, or added to frontend code. This endpoint is public because a signed-out browser must initialize Supabase Auth before signup/login.
- Public API exceptions (2026-10-22): `/api/status`, `/api/public-config`, and the PayPal `/api/webhook` callback bypass bearer authentication. Every other `/api` route verifies the Supabase access token; all tenant routes require a valid `X-Org-Id` membership. `/api/onboarding` requires a valid JWT but no pre-existing organization.
- Memory tenancy (2026-10-22): Phase 0 process-local order, capture, approval, and refund records are keyed by organization ID. Existing unscoped activity entries are not exposed to organizations; `/api/events` returns only activity records tagged with the caller's organization. `/api/status` reports no captures because it is a public health endpoint.
- Role policy (2026-10-22): `owner`, `admin`, `accountant`, `approver`, and `viewer` are the only Phase 1 roles. Donor/resident are reserved for Phase 6 and are not accepted by the database constraint. Refund approval registration requires owner, admin, or approver. Only owner/admin can manage organizations or memberships; admin cannot assign/remove the owner role.
- Onboarding (2026-10-22): a server-only service-role RPC creates the organization, owner membership, and audit row in one PostgreSQL transaction. The RPC is idempotent for a user who already has exactly one owner membership; repeat calls return that organization without a duplicate audit event. The backend verifies the user's JWT before invoking the RPC.
- Rate limits (2026-10-22): `express-rate-limit` adds process-local IP limits and authenticated user limits; onboarding has a lower user/IP limit. Public status, public config, and the PayPal webhook are exempt. API IP limits and bearer auth run before JSON parsing; user limits run after authentication. Supabase Auth's own limits remain enabled. Shared/distributed rate-limit storage is deferred until a later phase.
- Error envelopes (2026-10-22): existing Phase 0 route validation/provider errors retain their legacy string `error` plus sibling `code`. Authentication, authorization, onboarding, and other new Phase 1 errors use `{ "error": { "code": "...", "message": "..." } }`.
- Free-only and data handling: Gemini free-tier remains the default. Do not send real sensitive customer/payment data to the free AI tier; use minimum, synthetic, or redacted transaction context. Free-tier availability and quotas are provider-controlled. Details are in `docs/RUNBOOK.md`.
- AI request minimization: backend context uses an allow-list of transaction IDs, type, status, date, amount/fee/net, currency, and source; buyer names, contact details, and arbitrary fields are excluded. Common email, phone, government-ID, and payment-number patterns are redacted from user questions before a free-tier call.
- PayPal request ID tenancy: create-order and refund idempotency inputs include the organization ID before deriving `sha256(scope:id)`. Identical client request/approval IDs in separate organizations therefore cannot collide in PayPal's provider-wide idempotency namespace.
- Supabase API key compatibility (2026-10-22): `SUPABASE_SERVICE_ROLE_KEY` accepts the legacy JWT-based service-role key and the current `sb_secret_` key. The legacy value is sent in both `apikey` and `Authorization`; a new secret key is sent only in `apikey`, as required because it is not a JWT. Supabase is deprecating legacy anon/service_role keys by end of 2026; see [Supabase API key migration](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) and [API keys](https://supabase.com/docs/guides/getting-started/api-keys), checked 2026-10-22.
- Supabase server transport (2026-10-22): backend auth, membership, onboarding RPC, and audit writes use Supabase's HTTP Auth/Data APIs through Node's built-in `fetch`, avoiding a backend SDK runtime requirement and preserving the existing Node 18 minimum. Frontend auth remains direct `supabase-js` as documented in `FRONTEND-CONTRACT.md`.

## Phase 2 financial-core decisions (2026-10-22)

- Persistence: replace process-local order, capture, approval, event, transaction, and ledger state with organization-scoped Postgres repositories over Supabase PostgREST and service-only RPCs. Every repository query and transactional function takes or resolves an `org_id`; provider event IDs are globally deduplicated by `(provider,event_id)`. No frontend file was changed.
- Ledger units and invariants: store amounts as signed 64-bit integer minor units and keep currency on every transaction and line. A deferred constraint trigger checks each entry at transaction commit. Posting is once per `(org_id,source_type,source_id)`, and the pure `services/ledger.js` mapping output is passed into the database RPC that commits transaction, entry, and lines atomically.
- Capture posting: when PayPal reports gross, fee, and net, debit PayPal Balance for net and PayPal Fees for the reported fee, and credit Sales Revenue for gross. If PayPal omits a complete fee breakdown, debit PayPal Clearing for gross; do not synthesize a fee.
- Refund posting: use the refund's returned gross/fee/net breakdown when available, including a returned fee reversal. PayPal can omit refund seller-payable details; in that case record the full gross refund against PayPal Balance and Refunds contra-revenue without assuming a fee reversal. A mismatched returned breakdown is rejected.
- Webhook intake: preserve exact raw request bytes in `paypal_events`, verify those bytes using PayPal's verify-webhook-signature API, deduplicate deliveries, respond after durable insert, and process asynchronously with retries/dead-letter state. Unverified events are retained but never posted. Signature/API failures are distinct from a verified event and cannot post.
- Refund approval: approval registration reserves remaining capture value transactionally. A role-checked decision records reviewer, note, and audit row; only a pending, exact-capture approval can submit the PayPal refund. The PayPal request ID is deterministic and includes organization plus approval ID. The row lock/reservation and cached outcome prevent duplicate provider submissions and over-refunds.
- Reconciliation: the authenticated tenant endpoint compares completed PayPal capture/refund transactions with their corresponding revenue/contra-revenue ledger lines, writes a reconciliation run, and returns the persisted result. Trial balance is calculated in the database by organization and currency.
- Provider references checked 2026-10-22: PayPal's [webhook integration guide](https://developer.paypal.com/api/rest/webhooks/rest/) requires verification and documents webhook listener behavior; the [webhook overview](https://developer.paypal.com/api/webhooks/overview/) recommends prompt 2xx responses. Capture gross/fee/net fields are described in the [capture definition](https://developer.paypal.com/sdk/orders/v2/definitions/capture/). Refund seller-payable breakdown is optional in the [refund definition](https://developer.paypal.com/api/payments/v2/definitions/refund/) and refund calls are described in the [refund API](https://developer.paypal.com/api/payments/v2/captures-refund). These findings informed handling of raw bodies, quick acknowledgment, and absent refund breakdowns.
- Environment limitation: the Phase 2 migration has not been applied to the live project. No live data was changed. Local Supabase SQL verification requires Docker, which is unavailable in this environment; database-specific checks remain UNVERIFIED until `npx supabase test db` is run with a local Supabase stack or against an approved test database.

- Migration parser (2026-10-23): add pinned, dev-only `@libpg-query/parser` 17.6.10 (MIT, WASM PostgreSQL 17 parser) and `npm run check:migrations`. It parses every numbered migration's SQL and PL/pgSQL syntax without database access; it does not resolve Supabase schemas, extensions, grants, object dependencies, or execute migrations.

## Phase 3 currency, reports, and invoices decisions (2026-10-24)

- FX provider: Frankfurter (`https://api.frankfurter.dev/v1`) is the default free, keyless reference-rate API. The official license/terms page states blended rates are free for commercial use, daily central-bank/reference data may be delayed or revised, and API requests are rate-limited to prevent abuse (no monthly/daily quota). Cache each tenant's pair for 24 hours and locally space outbound provider calls by at least one second. Use decimal strings and integer minor-unit rounding. Every conversion response says `indicative, not a guaranteed settlement rate`; fees are returned separately. PayPal seller-receivable exchange-rate data overrides Frankfurter when present on a capture.
- Sources checked 2026-10-24: [Frankfurter API and FAQ](https://frankfurter.dev/) and [Frankfurter license and data terms](https://frankfurter.dev/license/).
- Reports: SQL views aggregate journal lines by accounting period/account. Report routes filter the selected organization and date range before returning JSON or CSV; trial balance totals are calculated from the same ledger lines.
- Invoice send: current PayPal Invoicing v2 docs list sandbox create/send endpoints and require an invoicing-enabled business account. A read-only `GET /v2/invoicing/invoices?page=1&page_size=1` using this project's Sandbox app returned HTTP 200 on 2026-10-24, confirming list access for this account. No invoice was created or sent in that probe. The application creates a PayPal draft and sends it only after an authorized `send-invoice` approval decision; local state changes to `sent` only after PayPal's send call succeeds. Verified `INVOICING.INVOICE.PAID` webhook events link a payment ID to a matching capture/ledger entry when one exists.
- Sources checked 2026-10-24: [PayPal Invoicing API quick start](https://developer.paypal.com/api/invoicing), [Invoices v2 reference](https://developer.paypal.com/api/invoicing/v2/), [Sandbox invoice send endpoint](https://developer.paypal.com/api/invoicing/v2/invoices-send/), and [Invoicing webhook events](https://developer.paypal.com/platforms/invoicing/reference/invoicing-webhooks/). The PayPal webhook configuration must include `INVOICING.INVOICE.PAID` for invoice status updates; configuration remains a dashboard action.
- Migration 0003 adds tenant-scoped FX cache, invoice tables, reporting views, and service-role-only RPCs. The migration is not applied to the live database by this phase run; apply it only after review and the migration parser check.

## Phase 3 live deployment recheck — 2026-10-24

- Question: How should live deployment state be recorded after the user reports applying migration 0003?
- Choice: Treat 0003 as deployed only after independent read-only probes; nine expected tables/views returned HTTP 200 through PostgREST. Continue security and behavior verification before calling Phase 3 complete.
- Reason: Prior probes were before migration application; the current live state has changed. Do not edit 0003 after application; any SQL correction belongs in 0004.
- Source: User report in this conversation plus read-only probe recorded in docs/TEST-REPORT.md. Rejected alternative: assume the user report alone proves all objects and grants are correct.

## FX provider throttle concurrency — 2026-10-24

- Question: How should the one-second provider-call interval handle concurrent conversions for different currency pairs?
- Choice: Reserve each provider-call slot synchronously before awaiting, so concurrent requests receive distinct launch slots.
- Reason: The prior last-call timestamp calculation let simultaneous misses share one delay and exceed the intended provider rate limit. Regression test added for simultaneous pairs.
- Source: Local code review and test in server/test/phase3-services.test.js. Rejected alternative: rely on an in-flight map, which deduplicates only identical pairs.

## Phase 3 live verifier fixture policy — 2026-10-24

- Question: How should the live Phase 3 verifier handle persistent identity and historical records?
- Choice: Use fixed, named test users and orgs, reuse existing records, and delete only run-tagged operational rows. Never reset or delete unrelated test-org rows as a cleanup shortcut; retain append-only audit entries.
- Reason: Phase 2 cleanup demonstrated restrictive audit-log foreign keys and the need to preserve non-run history. Historical Phase 2 records are discovered read-only; if none remain, report those comparisons UNVERIFIED instead of manufacturing data.
- Source: User's Phase 3 live-verification instructions and docs/TEST-REPORT.md cleanup incident. Rejected alternative: run the whole Phase 2 verifier and create another Sandbox capture/refund.

## Phase 3 verifier security findings — 2026-10-24

- Question: How to handle CSV formula injection and PayPal invoice payment mismatches?
- Choice: Prefix CSV cells whose first non-whitespace character is `=`, `+`, `-`, or `@` (also control-prefixed formulas) with an apostrophe; add database migration 0004 that compares verified invoice payment amount/currency against stored total and records a mismatch event instead of marking paid.
- Reason: CSV quoting alone does not stop spreadsheet formula evaluation. Official PayPal Invoicing webhook docs show amount and currency in the paid-event resource, and paid events may represent partial payment, so status alone is insufficient.
- Source: [PayPal Invoicing Webhooks](https://developer.paypal.com/api/invoicing/webhooks/) and [Invoicing webhooks reference](https://developer.paypal.com/platforms/invoicing/reference/invoicing-webhooks/), checked 2026-10-24; local inspection of server/src/routes/reports.js and migration 0003.
- Rejected alternative: trust PayPal's PAID string and accept quoted CSV formula cells.

## Phase 3 live verifier safety gate — 2026-10-24

- Question: How should the verifier confirm the mismatch-guard migration before testing a PAID webhook?
- Choice: Require explicit user confirmation that migration 0004 was applied; do not probe an arbitrary invoice with `mark_invoice_paid` because 0003's implementation could mark it paid.
- Reason: PostgREST does not expose the function definition through the current application API, and a behavioral probe on an existing invoice could mutate user data. The actual mismatch assertion runs only against a verifier-created invoice after confirmation.
- Source: Read-only inspection of 0003/0004 and live verifier safety review, 2026-10-24.
- Rejected alternative: call the old/new RPC with a production or unrelated invoice to infer which function body is installed.

## Phase 3 live server version — 2026-10-24

- Question: Why did live FX and invoice API calls return generic 405/404 responses despite current routes existing in source?
- Choice: Restart only the Node process listening on port 3000 after confirming it started before the Phase 3 route commit; leave the separate port-34872 process and ngrok untouched.
- Reason: `ps`/`lsof` showed PID 17366 on port 3000 started at 13:40 local, before Phase 3 commit `e6e1953` at 15:16 local. Its generic fallback responses match the observed methods/routes missing from the loaded code.
- Source: Local process list, listening-socket ownership, git commit timestamp, and verifier response statuses, checked 2026-10-24.
- Rejected alternative: modify current route code to accommodate responses from the stale running build.

## PayPal invoice request contract — 2026-10-24

- Question: Which invoice fields and constraints should the backend enforce before sending to PayPal?
- Choice: Limit invoice numbers to PayPal's documented 25-character maximum and send `detail.payment_term.term_type: DUE_ON_RECEIPT` for the verifier's immediate-payment invoice.
- Reason: Safe PayPal activity recorded draft creation HTTP 400; the live verifier had generated a 35-character number. The current PayPal minimum-create guide lists `payment_term.term_type`, and the invoice object limits `invoice_number` to 25. These are direct, testable payload constraints.
- Source: [PayPal Invoicing use cases](https://developer.paypal.com/invoicing/use-cases/) and [Invoice object](https://developer.paypal.com/invoicing/object/), checked 2026-10-24.
- Rejected alternative: keep allowing 64-character numbers and truncate them only when sending, which would make PayPal's number differ from the stored invoice number.

## FX cache timestamp assertion — 2026-10-24

- Question: How should the verifier compare a cached FX timestamp when PostgREST and the first response serialize the same instant differently?
- Choice: Compare `Date.parse(first.timestamp) === Date.parse(second.timestamp)` and keep exact instant equality.
- Reason: Live checks returned HTTP 200 twice and equal rate values, while literal timestamp strings differed. The assertion should validate an identical instant rather than identical ISO formatting; do not relax rate or cache behavior checks.
- Source: Phase 3 live verifier output, 2026-10-24.
- Rejected alternative: compare strings or accept any timestamp within an arbitrary time window.

## Phase 3 continuation checkpoint — 2026-10-24

- Question: What is the authoritative resume state after the previous handoff?
- Choice: Use actual Git state (branch `backend`, clean HEAD `00fa9be`) and record handoff discrepancies; read-only preflight confirms Phase 3 tables/views exist. Configure the user-provided invoice buyer email only in ignored `.env` under `NOVAPAY_PHASE3_BUYER_EMAIL`.
- Reason: The handoff's listed last commit and uncommitted files were stale; current repository had the WIP handoff commit and a clean tree. Live object probes were all HTTP 200. Buyer email must be consumed from an ignored env variable and never logged.
- Source: `git status`, `git log`, read-only PostgREST probes and env-presence check, 2026-10-24.
- Rejected alternative: trust stale handoff file metadata or put buyer email in source/docs/command output.

## Safe PayPal error diagnostics — 2026-10-24

- Question: How can a live PayPal invoice failure be distinguished without exposing provider responses?
- Choice: Record only sanitized provider `name` and `details[].issue` enum values with the existing HTTP status in API activity; never record messages, descriptions, or debug IDs.
- Reason: Live invoice API returned generic HTTP 502 and activity contained only route/status; that does not distinguish malformed request from account capability. Enum-only detail is sufficient for root diagnosis and the regression test verifies redaction.
- Source: PayPal response shape observed in API contract and local implementation/test, 2026-10-24.
- Rejected alternative: log or print the full PayPal error response.

## Continuation verification status — 2026-10-24

- Question: Should the Phase 3 gate treat the earlier passing route checks as completion despite the failed/unverified PayPal invoice send and missing historical capture/refund data?
- Choice: Keep Phase 3 incomplete, rerun read-only live preflight, activate the safe provider diagnostic, and report invoice/send and real-ledger gaps as UNVERIFIED until proved.
- Reason: The acceptance criteria require an invoice paid via a real signed webhook and report parity on real capture/refund data; neither was evidenced in the prior run.
- Source: `docs/TEST-REPORT.md` live verifier records and the 2026-10-24 user request. Rejected alternative: treat route-level/unit tests as proof of real Sandbox delivery.

## PayPal error logging without provider name — 2026-10-24

- Question: How should invoice API failures be diagnosed if PayPal omits the top-level `name`?
- Choice: Always record safe issue enums when present; otherwise emit only `UNCLASSIFIED_ERROR` for structured JSON or `NON_JSON_ERROR` for unstructured/empty error bodies.
- Reason: The live 400 activity had no logged provider name, and the previous logger suppressed issue enums in that case. This captures non-sensitive diagnostic category without provider message, descriptions, debug IDs, or response body.
- Source: Read-only live `api_activity` route/status probe and regression tests in `server/test/paypal.test.js`, 2026-10-24. Rejected alternative: print/store the raw provider response.

## Phase 3 invoice send live retry limit — 2026-10-24

- Question: Should another live invoice be created after repeated HTTP 502 results with no provider-send call or safe provider error category?
- Choice: Stop live retries and mark invoice send BLOCKED pending diagnosis of the create/persist/send boundary.
- Reason: Three controlled live attempts have failed to reach a confirmed send/payment, and each can leave a PayPal draft. Latest activity proves create HTTP 201 but no `/send`; continuing would create more provider-side state without narrowing the cause.
- Source: Live verifier output and read-only api_activity status probe, 2026-10-24. Rejected alternative: create repeated invoices or expose full provider response bodies.

## PayPal invoice create response ID extraction — 2026-10-24

- Question: Which create-response forms should the v2 invoice sender accept?
- Choice: Accept a valid `id` or derive the ID from a self `href`; require HTTPS, the configured PayPal API origin, the exact `/v2/invoicing/invoices/{id}` path, and the documented `INV2-…` ID format. Log create-success, ID-extracted, send-called and failure-stage markers without invoice IDs or provider payloads.
- Reason: Current PayPal quickstart says HTTP 201 returns an `href` containing the invoice ID, while the API reference/object also documents a top-level `id`. Handling both forms preserves compatibility and prevents arbitrary URLs from influencing outbound request paths.
- Source: PayPal [Invoicing API quickstart](https://developer.paypal.com/api/invoicing), [Invoices v2 reference](https://developer.paypal.com/api/invoicing/v2/), and [Invoice object](https://developer.paypal.com/invoicing/object/), checked 2026-10-24. Rejected alternative: assume only `response.id` or trust any `href` host/path.

## Invoice send simulated after single live response failure — 2026-10-24

- Question: What should approval do after the one permitted live run created a draft but failed to extract its ID before calling `/send`?
- Choice: Default `PAYPAL_INVOICE_SEND_MODE` to `simulated`; preserve RBAC/approval and local invoice tracking, return explicit `sendMode: SIMULATED`/`simulated: true`, and make no further PayPal create/send calls unless a later operator deliberately selects live mode.
- Reason: Safe stage records prove create succeeded, ID extraction failed, and send was never called. The user's one-invoice ceiling prohibits another live retry; continuing must not imply delivery to a buyer. The API/docs must label simulated delivery.
- Source: Single authorized live retry on 2026-10-24, user's explicit fallback instruction, and PayPal [Invoicing API quickstart](https://developer.paypal.com/api/invoicing), checked 2026-10-24. Rejected alternative: silently call the local state `sent` as a real PayPal send or create another Sandbox invoice.

## Simulated invoice state response contract — 2026-10-24

- Question: How should the UI distinguish an approved local invoice record from a real provider delivery?
- Choice: Add `PAYPAL_INVOICE_SEND_MODE` (`simulated` by default; `live` only by explicit operator configuration). In simulated mode, keep the approval gate, record local tracking state, return `sendMode: "SIMULATED"` and `simulated: true`, and do not call PayPal.
- Reason: The one allowed live attempt returned PayPal create HTTP 201, then safe server stage logs showed ID extraction failed before `/send`; no real delivery occurred. The UI must not mistake local status tracking for an email/payment request.
- Source: User's fallback instruction and live stage markers, 2026-10-24. Rejected alternative: silently report provider delivery or keep retrying PayPal calls.

## Observed invoice create href not extracted — 2026-10-24

- Question: What did the one permitted live attempt prove about the current provider response handling?
- Choice: Keep the local href parser broad but origin/path/ID validated, run only local realistic-response tests, and leave live-mode revalidation unverified while defaulting delivery to SIMULATED.
- Reason: Server-side markers showed create success then extraction failure, before any send call. The actual response body was not retained; guessing at its link relation or ID shape and making another PayPal draft would violate the one-create limit.
- Source: Live `api_activity` stage messages and PayPal current v2 quickstart/object docs, checked 2026-10-24. Rejected alternative: log the full provider response or make another external invoice.

## Reconcile existing Sandbox invoice drafts — 2026-10-24

- Question: Can the reported Sandbox draft be safely identified as one of the verifier's prior create attempts, and should it be sent or deleted?
- Choice: Keep invoice sending SIMULATED and make no provider create/send/delete calls. Treat `P3-644ca6d7c8694695b51e` as consistent with the verifier's invoice-number format, but not conclusively matched to a specific provider request.
- Reason: The verifier generated `P3-` plus 20 hexadecimal characters, but cleanup removed its local invoice row after the create response failed ID extraction; the safe activity log has no invoice number or PayPal ID. Logs prove create succeeded and send was never called, while the later local send was simulated. The user reports the dashboard draft is still Draft and explicitly requested reconciliation before any new provider request.
- Source: Read-only Supabase query and user-provided Sandbox observation, 2026-10-24. Rejected alternatives: infer an exact draft-to-request match from format alone, send/delete a draft, or issue another PayPal request.

## Phase 3 live verification: invoice send limitation — 2026-10-24

- Question: Should Phase 3 keep trying real PayPal Invoicing send while validating financial reports and capture linkage?
- Choice: Keep invoice send `SIMULATED` and record real Invoicing send as a known limitation. Approval gating and local invoice tracking are verified; real send is not verified live. Do not make additional PayPal Invoicing calls.
- Reason: A prior create succeeded but the local response parser failed before `/send`; the user has found several harmless Drafts and explicitly prohibited more Invoicing calls. A simulated invoice has no real PayPal invoice ID, so `INVOICING.INVOICE.PAID` cannot be proven against a real capture through the existing lookup keyed by `paypal_invoice_id`.
- Source: Prior redacted `api_activity` stage markers, current verifier and migrations, and user's 2026-10-24 instruction. Rejected alternative: create/send another Sandbox invoice or claim a capture webhook proves invoice-paid linkage.

## Do not create a payment while the registered webhook host is unresolved — 2026-10-24

- Question: Should a new sandbox payment be created while PayPal's registered webhook hostname does not resolve?
- Choice: Stop before order creation; ask the user to restore the registered hostname or update the webhook to the active tunnel URL, then recheck resolution and delivery before creating an order.
- Reason: A payment could be captured/refunded through the API, but the required PayPal-signed webhook and resulting ledger proof could not be observed. Avoid creating financial test data that cannot satisfy the verification objective.
- Source: Read-only PayPal webhook GET, DNS/curl, local app status, 2026-10-24. Rejected alternative: capture/refund without a verifiable signed event and report the webhook leg as successful.

## Capture webhook verifier polling — 2026-10-24
- Question: When should the Phase 3 verifier evaluate a newly received webhook inbox row?
- Choice: Wait until `processing_status` reaches a terminal state (`processed`, `unverified`, `failed`, `error`, or `dead_letter`) before judging signature verification or replay eligibility.
- Reason: Live run returned the row's initial `unverified/processing` state while the asynchronous PayPal signature worker was still running; cleanup then removed the row before its final state was recorded. This is a verifier race, not evidence of a bad PayPal signature.
- Source: Redacted live run output on 2026-10-24. Rejected alternative: count the initial inbox state as a completed signature check.

## PayPal refund webhook preflight event name — 2026-10-24
- Question: Which configured refund event should the live verifier expect on the registered webhook?
- Choice: Expect PayPal's registered `PAYMENT.REFUND.COMPLETED` event name alongside `PAYMENT.CAPTURE.COMPLETED`.
- Reason: Read-only lookup of the configured Sandbox webhook ID showed the exact event list and matching public URL; the preliminary check used an incorrect refund event string.
- Source: PayPal Sandbox webhook GET response observed 2026-10-24; user confirmed capture-completed and refund-completed subscriptions. Rejected alternative: change webhook configuration or infer from an unrelated event alias.

## Phase 3 live verification closeout — invoice paid linkage — 2026-10-24
- Question: Can the Phase 3 live verification claim `INVOICING.INVOICE.PAID` linkage when invoice sending is SIMULATED?
- Choice: Keep the linkage UNVERIFIED and close the live financial/report checks; retain invoice send as a known limitation.
- Reason: The live capture/refund/report path passed, but simulated local invoices have no PayPal invoice ID to associate with a real signed invoice-paid event. Unit tests cover simulated approval and paid-amount mismatch behavior.
- Source: Corrected Phase 3 live verifier output, test suite, and prior user direction to keep Invoicing send SIMULATED, 2026-10-24. Rejected alternative: fabricate a provider invoice ID or claim a simulated state transition is a real webhook.

## Phase 4 deterministic routing precedence — 2026-10-24
- Question: How should NovaPay select an AI route without asking the model to classify intent?
- Choice: Use deterministic local rules in this order: explicit FX/arithmetic -> structured ledger query -> document/OCR -> evidence-based explanation/retrieval -> general read-only LLM. Unknown or malformed intent falls through to the LLM route with no execution capability.
- Reason: Numeric conversions and structured record queries must avoid unnecessary model calls; explanation requires server-built evidence; uploaded documents use OCR only when clearly requested. Table-driven tests cover 61 normal, mixed-language, typo, ambiguous, and adversarial examples.
- Source: Phase 4 user specification and `server/src/ai/router.js` tests, 2026-10-24. Rejected alternative: let the LLM choose routes or trust route/tool instructions from user text.

## Phase 4 evidence boundary and tool execution — 2026-10-24
- Question: What may the assistant send to the provider, and how do data tools establish tenant scope?
- Choice: Build evidence on the server using only allow-listed read-only repository methods. Take `orgId` only from authenticated membership context; ignore legacy request `context`. Cap calls at three, reject repeats/unknown names, time out each call, and bound result rows/bytes. Exclude names, emails, and free-text invoice descriptions; use a per-org one-way customer reference only for grouping.
- Reason: Free-tier inputs may be used by Google, and DB/user text is untrusted. Minimal curated evidence prevents raw client context, cross-tenant selection, and PII/injection text from reaching the provider.
- Source: Phase 4 requirements and `server/src/ai/evidence.js` tests, 2026-10-24. Rejected alternative: accept model/request org IDs, send invoice/customer fields, or pass client-supplied context to the LLM.

## Phase 4 Gemini model and bounded provider behavior — 2026-10-24

- Question: Which free Gemini models should NovaPay use, and how should transient provider failures be bounded?
- Choice: Keep `gemini-3.5-flash-lite` as primary and `gemini-3.1-flash-lite` as the free fallback for now; retry only throttling/network/timeout once with short bounded backoff, then try the fallback at most once. Enforce request timeout and strict output schema/grounding.
- Reason: Current Google pricing lists both models as free of charge on the Free Tier; model docs list them as available. Google currently lists a May 7, 2027 shutdown for 3.1 Flash-Lite, so revisit the fallback before then. Free-tier prompts may be used to improve products; send minimized evidence only.
- Source: Google [Gemini models](https://ai.google.dev/gemini-api/docs/models), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [deprecations](https://ai.google.dev/gemini-api/docs/deprecations), checked 2026-10-24. Rejected alternative: use a paid model or retry indefinitely.

## Phase 4 AI budgets and answer cache — 2026-10-24

- Question: How should AI usage be bounded and safe repeatable answers cached?
- Choice: Default to 5 provider calls per user and 20 per organization per UTC day, cap input at 1,000 characters and output at 400 tokens, and use a five-minute cache keyed by org, normalized question, route and current data version. Cache hits write usage records; proposals, insufficient-evidence answers and provider errors are never cached. Usage reservations are atomic in Postgres and synchronous in memory tests.
- Reason: Small explicit limits reduce accidental free-tier quota exhaustion; a ledger/invoice data version prevents serving stale answers after financial changes. Google states limits are project-specific and not guaranteed, so administrators should set lower limits if AI Studio shows a lower active quota.
- Source: Phase 4 requirements and Google [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), checked 2026-10-24. Rejected alternative: depend only on provider throttling or cache across organizations.

## Phase 4 anomaly signals and sensitive payer data — 2026-10-24

- Question: Which deterministic anomaly thresholds should be used, and what is the duplicate-payer rule allowed to retain?
- Choice: Configure fee spike as current rate >= 2x the trailing mean with at least 3 prior fee-bearing captures; duplicate window 10 minutes; refund-rate spike 25% of captured gross over 30 days; large payout threshold USD 10,000; stale webhook age 10 minutes. Persist only evidence IDs and metrics. Detect duplicate amount+payer only when a provider payer reference is available; never persist or notify with the raw payer identifier.
- Reason: Existing transactions do not include payer identifiers. The detector must not invent an identity or add PII to anomaly/notification rows; incomplete evidence yields no duplicate-payer finding.
- Source: Phase 4 task requirements and inspection of `transactions`, `paypal_captures`, and `paypal_events` schemas in migrations 0002–0003, 2026-10-24. Rejected alternative: use amount alone as a duplicate, or store raw payer IDs.

## Phase 4 AI proposal persistence — 2026-10-24
- Question: How should AI suggestions enter Approvals without granting execution capability?
- Choice: Persist only a sanitizer-approved, evidence-cited proposal as a tenant-scoped `pending` approval. A refund proposal must point to a cited completed capture; the server derives its amount from that capture's unreserved refundable balance. The model cannot supply org, amount, execution arguments, or reviewer. Approval and PayPal execution remain on the existing RBAC-protected refund path.
- Reason: This preserves the explicit human approval gate and existing exact-capture, remaining-amount and idempotency checks. Uncited or ineligible proposals create no row; proposal answers are never cached.
- Source: Phase 4 T6 requirements and `server/src/services/ai.js` / proposal tests, checked 2026-10-24. Rejected alternative: accept model-selected refund amounts or call PayPal during chat.

## Phase 4 persistence migration and RPC boundary — 2026-10-24
- Question: How should AI state and anomaly notifications be persisted without enabling browser-side writes?
- Choice: Add `ai_usage`, `ai_cache`, `anomalies`, and `notifications` in new migration `0005_ai.sql`; enable RLS with membership-only reads and grant authenticated users SELECT only. All new SECURITY DEFINER functions revoke execution from public, anon, and authenticated and grant it only to service_role. Server RPCs still validate organization membership for user-attributed writes.
- Reason: The backend repository uses service-role PostgREST/RPCs, while JWT clients should have no direct write path. The migration is syntax-checked locally, but must be applied by the user before live checks.
- Source: Phase 4 T7 requirements, repository RPC call sites and migration parser/security tests, 2026-10-24. Rejected alternative: let the browser write AI usage, cache, anomaly, notification, or proposal records directly.

## Phase 4 migration application — 2026-10-24
- Question: Who applies the new Phase 4 migration before live verification?
- Choice: User applied `supabase/migrations/0005_ai.sql` in the Supabase SQL Editor; proceed with read-only migration-state confirmation before any live test writes.
- Reason: Dashboard access and application are user-controlled; repository state alone cannot prove the live schema.
- Source: User confirmation, 2026-10-24. Rejected alternative: assume the SQL Editor application succeeded without querying the live schema.

## Phase 4 chat route execution and response contract — 2026-10-24
- Question: Should deterministic code/FX and structured SQL intents call the LLM, and what should the chat API return?
- Choice: Handle arithmetic/FX and allow-listed structured reads in server code with zero provider calls; reserve the provider for retrieval/general explanation. `/api/ai/chat` uses the Phase 4 response fields `answer`, `route`, `reason`, `citations`, `proposal`, `usage`, and `cached` (plus documented optional flags).
- Reason: Avoid provider tokens for deterministic work and return stable route/citation metadata required by the Phase 4 UI contract.
- Source: Phase 4 T1/T8 and acceptance requirements, current AI route implementation review, 2026-10-24. Rejected alternative: keep route metadata cosmetic while sending every question to the LLM.

## Phase 4 live verifier fixture policy — 2026-10-24
- Question: How should Phase 4 live checks provision identities and isolate cleanup?
- Choice: Reuse only the existing fixed Phase 3 users and organizations; fail closed if any is missing. Generate a per-run marker and delete only usage/cache/approval/anomaly/notification/FX rows recorded as created by that run.
- Reason: Preserve stable tenant identity and avoid accumulating throwaway accounts or deleting unrelated financial data. Do not change memberships or organization records.
- Source: Phase 4 live verification constraints and current fixed Phase 3 verifier identities, 2026-10-24. Rejected alternative: create new users/orgs per verifier run or broadly truncate Phase 4 tables.

## Phase 4 live evidence availability — 2026-10-24
- Question: Should the verifier fabricate financial data or inspect other tenants to force a live Gemini smoke test?
- Choice: No. The live fee explanation, provider cache replay, and database-text injection remain UNVERIFIED when the fixed verifier org has no completed capture; the verifier makes no provider request and reads no unrelated org data.
- Reason: The Phase 4 live smoke must use non-sensitive sandbox evidence from its fixed org. Synthetic rows or another tenant's records would not prove the requested behavior safely.
- Source: Corrected read-only live REST query on `transactions.source_type=capture,status=COMPLETED` returned zero rows for `NovaPay Phase 3 Verification A`, 2026-10-24. Rejected alternative: create synthetic/financial records or query across tenant boundaries.

## Phase 4 prior-phase verifier execution boundary — 2026-10-24
- Question: Should the earlier live verifiers be run as part of Phase 4 regression when they lack a safe-only mode?
- Choice: Do not run them; mark their live safe-subset checks UNVERIFIED and rely on the complete unit regression for payment-independent coverage.
- Reason: Inspection shows Phase 2 unconditionally creates a Sandbox PayPal order and pauses for buyer approval; Phase 3 invokes invoice/payment flow. Running them would create provider-side effects outside Phase 4 scope.
- Source: `scripts/verify-phase2.js` and `scripts/verify-phase3.js` control flow inspection, 2026-10-24. Rejected alternative: trigger an additional payment/invoice flow solely for regression.

## Phase 4 resumed live verification scope — 2026-10-25
- Question: How to complete remaining live checks while avoiding unnecessary Sandbox activity?
- Choice: Make one tiny Gemini call with synthetic evidence first, then create exactly one $1 Sandbox order only for requested live evidence; retain the resulting capture and do not refund it. Do not call PayPal invoicing.
- Reason: User explicitly authorized this bounded flow and specified the human approval gate; synthetic smoke avoids customer data.
- Source: User instruction, 2026-10-25. Rejected alternative: repeat arbitrary live payments or use real customer evidence.

## Phase 4 live Gemini smoke output handling — 2026-10-25
- Question: How to handle a successful tiny Gemini transport response that did not match the minimal probe JSON shape?
- Choice: Record provider connectivity and exact model/latency/token metadata as PASS, note the probe shape mismatch, suppress response contents, and rely on the production AI sanitizer/grounding path for the evidence-backed API check.
- Reason: The smoke was an adapter connectivity probe, not an answer correctness proof; a malformed output must remain subject to sanitizer behavior and cannot be treated as a grounded answer.
- Source: One bounded synthetic call through `server/src/services/llm.js`, HTTP 200, 2026-10-25. Rejected alternative: print the provider output or repeat provider calls until a preferred response appears.

## Phase 4 one-order retry and retention — 2026-10-25
- Question: How should the single authorized live order avoid duplicate creation after interruption?
- Choice: Use a SHA-256-derived stable request key scoped to the existing dedicated verifier organization; retries resolve the same order through the idempotent create-order API. Retain the completed capture and its verified webhook/ledger rows permanently; no refund or financial cleanup.
- Reason: The user authorized exactly one Sandbox order and explicitly requested capture retention.
- Source: Phase 4 resumed verification instruction and `scripts/phase4-live-order.js`, 2026-10-25. Rejected alternative: random request keys on rerun or cleanup of the capture/ledger.

## Phase 4 approved capture retention — 2026-10-25
- Question: What should happen to the one live Sandbox capture after webhook/ledger verification?
- Choice: Retain the order, capture, verified event, transaction, and journal entry in the dedicated verifier organization; do not refund or clean financial rows.
- Reason: The capture is the requested real evidence for Phase 4 fees/AI testing, and the user explicitly requested retention.
- Source: `scripts/phase4-live-order.js` live output: signed event verified and processed, one transaction/journal entry, 100 gross/40 fee/60 net USD minor units, 2026-10-25. Rejected alternative: refund or delete capture/ledger data.

## Phase 4 live per-user budget test boundary — 2026-10-25
- Question: How to prove the API limit without risking another provider request when the active server limit is uncertain?
- Choice: Use the one already-recorded verifier Gemini usage row as the baseline, restart NovaPay with a process-only limit of one, issue one distinct authenticated chat, assert the limit answer/zero tokens/unchanged usage and Gemini activity, then delete only that known verifier row.
- Reason: The request is guaranteed to hit the cap before provider invocation; no `.env` value is changed and no new provider quota is consumed.
- Source: Live HTTP API check returned 200, limit answer true, zero tokens, usage unchanged at 1, Gemini activity unchanged at 2, 2026-10-25. Rejected alternative: issue another provider request to discover the limit behavior.

## Phase 4 prior-phase regression mode — 2026-10-25
- Question: How to run Phase 2/3 live regression without creating more PayPal or invoice side effects?
- Choice: Add explicit `--safe` modes that only issue GET requests to Supabase and the app's static root. They skip `/api/status` because that route may fetch a PayPal token, and skip user provisioning, FX fetches, payments, invoice actions, reconciliation writes, and cleanup.
- Reason: The Phase 4 closeout requires safe subsets while the user authorized one retained Sandbox capture and prohibited further unnecessary provider actions.
- Source: Phase 4 user request and verifier control-flow inspection, 2026-10-25. Rejected alternative: run the full Phase 2/3 scripts or use endpoints with hidden provider/write side effects.

## Phase 4 missing Phase 2 safe fixtures — 2026-10-25
- Question: What to do when read-only Phase 2 verification cannot find its dedicated named organizations?
- Choice: Mark only fixture-dependent inspection UNVERIFIED; do not recreate users or orgs in safe mode.
- Reason: Safe mode must stay read-only, and provisioning would alter live auth and tenant state.
- Source: `node scripts/verify-phase2.js --safe` returned all 9 financial relations available but no named Phase 2 fixture orgs, 2026-10-25. Rejected alternative: silently onboard the missing organizations.

## Session branch gate conflict — 2026-10-25
- Question: Should implementation continue when the checked-out branch is `frontend-wiring` but the attached master role prompt requires `backend`?
- Choice: Stop implementation and live/test work; record the conflict and request human resolution before resuming.
- Reason: The master prompt explicitly says to stop when `git branch --show-current` is not `backend`; this session's initial instruction explicitly required `frontend-wiring`, and the check returned that branch.
- Source: User's session instruction and attached `/Users/aditya/.codex/attachments/28efa723-d6f0-40c2-b4dd-9fa6bcf429b6/Pasted text.txt`, checked 2026-10-25. Rejected alternative: silently switching branches or continuing backend work on `frontend-wiring`.

## Frontend wiring session scope — 2026-10-25
- Question: Which branch and file scope apply to the requested frontend wiring work?
- Choice: Follow the user's session override: work/commit locally on `frontend-wiring`; frontend edits are allowed for wiring tasks, while protected design files named by the wiring prompt remain off limits.
- Reason: The user explicitly made this a session-only override to the master prompt.
- Source: User message in this session, checked 2026-10-25. Rejected alternative: enforce the master prompt's `backend`-only and no-frontend-edits rules.

## Frontend wiring task 1 prompt missing — 2026-10-25
- Question: Should task 1 implementation be inferred when the task-specific prompt and protected design file list are not available?
- Choice: Do not implement until the user provides the wiring prompt or task 1 text.
- Reason: Acceptance criteria and protected files define the permitted change; guessing could alter the team's design or miss the requested integration.
- Source: Repository search and available pasted-text attachments checked 2026-10-25; only the master role prompt was available. Rejected alternative: infer task 1 from existing UI or backend contracts.

## Frontend Auth implementation scope and Supabase SDK — 2026-10-25
- Question: How should task 1 be wired without touching protected design files or reworking the team's UI?
- Choice: Keep the existing auth modal and CSS, connect its existing handlers via a small `src/auth.js` module, discover the public Supabase URL/anon key from `/api/public-config`, and pin the browser CDN to `@supabase/supabase-js@2.112.3`. Use Supabase Auth for real sessions; enable the existing labeled demo flow only when the API/config/SDK cannot be used. Call `/api/onboarding` with a bearer token after sign-up when a session is available; repeat onboarding after sign-in to recover the org ID for an existing owner account.
- Reason: This keeps changes to existing handlers and wiring files, meets the task's security/session requirements, and supports Supabase projects that require email confirmation before creating a session.
- Source: [Supabase JavaScript installation](https://supabase.com/docs/reference/javascript/installing), [Auth sign-up](https://supabase.com/docs/reference/javascript/auth-signup), [Auth sign-out](https://supabase.com/docs/reference/javascript/auth-signout), and `docs/FRONTEND-CONTRACT.md`, checked 2026-10-25; npm registry confirmed `@supabase/supabase-js@2.112.3`. Rejected alternative: unpinned `@2` CDN URL, embedding credentials, or relying on localStorage demo accounts when the backend is available.

## Auth integration test boundary — 2026-10-25
- Question: Should task 1 claim real Supabase login/onboarding verification without running the fixed named test account?
- Choice: Mark browser login, signup, password reset, session guard, and live onboarding UNVERIFIED until task 7's real-login walkthrough; complete task 1's local code and backend regression checkpoint now.
- Reason: The user assigns the real-login browser walkthrough to task 7; task 1 has no supplied test-account credentials, and real Auth must not be simulated as PASS.
- Source: Frontend wiring prompt task 7 and task 1 checks run 2026-10-25. Rejected alternative: treat existing backend auth tests or static JavaScript parsing as proof of a real browser session.

## Shared frontend API client — 2026-10-25
- Question: How should browser API calls consistently carry tenant credentials and normalize API errors?
- Choice: Add a small shared same-origin client that reads the current access token and locally selected organization ID from `NovaPayAuth`, sends `Authorization: Bearer` and `X-Org-Id` on protected calls, and converts both structured and legacy error bodies into errors with `status` and `code`. Keep the contract's `POST /api/onboarding` exception bearer-authenticated without an org header and keep `GET /api/public-config` public.
- Reason: This centralizes tenant headers and error handling without putting secrets in the browser or changing the backend contract.
- Source: `docs/FRONTEND-CONTRACT.md` Authentication and organization selection, checked 2026-10-25. Rejected alternative: duplicate token/header/error logic in each view or force an org header on onboarding/public config.

## Task 3 tenant data mapping — 2026-10-25
- Question: How should the UI render fields the tenant APIs do not return, and how should the approvals badge stay current?
- Choice: Render only returned transaction fields and label absent buyer/provider fields as unavailable; use the stable `sourceId`/capture/refund reference for the visible row ID. Use the server's `pendingCount` from the organization-scoped approvals response and refresh it with the queue.
- Reason: This avoids presenting illustrative or inferred values as real financial data while keeping the badge tied to the selected organization's server state.
- Source: `docs/FRONTEND-CONTRACT.md` transaction and approvals response examples, checked 2026-10-25. Rejected alternative: retain sample INR rows in an authenticated workspace, infer counterparties, or calculate the badge from a potentially stale local queue.

## 2026-10-25 — Frontend wiring task 4
- Question: How should existing dashboard widgets consume reports and FX without redesigning?
- Choice: Preserve existing widget/chart rendering, fetch organization-scoped report and FX endpoints through the shared authenticated API client, and show unavailable states when report data is absent. The cash-flow visualization derives positive and negative movement series from signed report rows.
- Reason: Matches the API contract while avoiding invented live values; the FX result displays server source, timestamp, and indicative label.
- Source: `docs/FRONTEND-CONTRACT.md` (repository contract, checked 2026-10-25).
- Rejected alternatives: Client-computed/sample financial figures in authenticated mode; changing protected styles or layout.

## 2026-10-25 — Frontend wiring task 5
- Question: How to expose invoice and report endpoints through the existing views?
- Choice: Populate the existing invoice table from `/api/invoices`, populate report totals/period bars from P&L and fees reports, and download server-generated P&L CSV through the authenticated client. Label invoice sending as SIMULATED.
- Reason: Reuses existing components and contract-backed API data; invoice responses lack issue/due dates, so the UI reports those values as unavailable rather than fabricating them.
- Source: `docs/FRONTEND-CONTRACT.md` (repository contract, checked 2026-10-25).
- Rejected alternatives: Rendering the old illustrative invoice/report values for authenticated users; creating or sending a PayPal invoice from this view.

## 2026-10-25 — Frontend wiring task 6
- Question: What client data should reach the assistant, and how should its result and notifications appear?
- Choice: Send only `{ message }` to `/api/ai/chat`; render the contract's `answer`, route badge (code/sql/llm), citations, usage, insufficient-evidence state and limit response. Keep local answer generation only in explicitly labeled demo mode. Load notifications from `/api/notifications` and expose read/dismiss actions.
- Reason: Assistant evidence is resolved by the backend using verified organization context; notifications are tenant scoped and have supported read/dismiss endpoints.
- Source: `docs/FRONTEND-CONTRACT.md` and `server/src/routes/ai.js`, `server/src/routes/notifications.js` (checked 2026-10-25).
- Rejected alternatives: Sending browser-scraped transactions; using local fallback for authenticated sessions; displaying static notification examples as live notices.

## 2026-10-25 — Frontend wiring task 7 API login method
- Question: How to authenticate the existing fixed owner for API verification when no test password is configured?
- Choice: Use Supabase Admin `generateLink` for a one-time magic-link hash, verify it to a user session in memory, and query existing fixture membership; do not reset the fixture password or send email.
- Reason: This proves real Supabase user JWT authorization without password mutation or exposing credentials. Admin-generated links are intended for custom email providers and are not themselves email sends.
- Source: [Supabase JavaScript Auth Admin generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [Supabase JavaScript Auth verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), checked 2026-10-25.
- Rejected alternatives: Resetting the fixed user's password to an ephemeral random value; printing or persisting an access token; running a test that sends email, consumes AI quota, mutates notifications, or invokes PayPal.

## 2026-10-25 — Task 7 scope and manual verification boundary
- Question: Which task 7 checks can run safely without a browser credential/password, and what should stay manual?
- Choice: Reuse the already-running local server and existing fixed owner fixture; use a one-time admin-generated login link in memory for authenticated read APIs. Leave browser rendering, console/network, theme/motion, mobile drawer, notifications UI, and AI chat UNVERIFIED with exact manual steps.
- Reason: The configured environment contains Supabase keys but no test password. API reads verify real JWT and organization membership without resetting a password, sending email, consuming AI quota, or mutating financial/notification state.
- Source: [Supabase Auth Admin generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [Supabase Auth verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), checked 2026-10-25; repository `docs/FRONTEND-CONTRACT.md` checked 2026-10-25.
- Rejected alternatives: Resetting the fixed user's password; printing or persisting tokens; claiming browser PASS without opening the UI.

## 2026-10-25 — UI 404, AI badge, and sample-data presentation
- Question: How to resolve favicon fallback and clarify route/data provenance without editing protected design files?
- Choice: Add explicit PNG favicon links on both pages using the existing NovaPay mark; carry server `reason` into the AI route badge tooltip/accessible label; label demo sessions globally and replace non-API sample views with organization empty states.
- Reason: Uses an existing logo, preserves existing styles, and avoids presenting illustrative figures as real organization activity.
- Source: Repository `src/fonts.css`, `src/dashboard.js`, `src/novapay-live.js`, `dashboard.html`, `preview.html`, checked 2026-10-25.
- Rejected alternatives: Editing protected fonts/tokens stylesheets; inventing a replacement font or favicon; leaving static community/ledger values visible in authenticated mode.
- User action: Add `assets/fonts/Montserrat-Variable.woff2`; the file is absent and the protected stylesheet must remain unchanged.

## 2026-10-25 — Phase 6 branch and scope
- Question: Which branch and scope govern the Fund Transparency work?
- Choice: Work locally only on `phase6-backend`, backend-only, and leave the committed font fix untouched.
- Reason: The user explicitly confirmed `phase6-backend` was created from main and asked to resume Phase 6 STEP 0; this supersedes the previous frontend session's branch/scope for the new task.
- Source: User-provided Phase 6 prompt and resume instruction, 2026-10-25.
- Rejected alternatives: Continue on `frontend-wiring`, change branches during work, or edit frontend/assets.

## 2026-10-25 — Phase 6 T1 schema shape
- Question: How should Fund Transparency data and workflow thresholds be represented without allowing direct client writes?
- Choice: Add migration 0006 with organization-scoped tables and composite tenant foreign keys, authenticated member SELECT only, service-role writes, donor/resident membership roles, and seeded per-organization defaults (minimum one quotation; second approver threshold 10,000 minor USD units).
- Reason: Matches the requested thin slice and existing RLS/composite-FK conventions; default rows exist for current and future organizations. No external facts used.
- Source: User-provided Phase 6 prompt; `supabase/migrations/0001_foundation.sql`, `0002_financial_core.sql`, and `0005_ai.sql`, checked 2026-10-25.
- Rejected alternatives: Editing an applied migration; granting authenticated writes; storing donor PII; using a global unscoped settings row.

## 2026-10-26 — Phase 6 T1 live RLS verification
- Question: How to prove migration 0006 is applied and client writes are denied without changing fixture data?
- Choice: Reuse the fixed Phase 3 owner fixture, mint/verify a one-time magic-link token in memory, issue authenticated GETs and constraint-safe incomplete POST attempts against all 11 Phase 6 tables, and print only status codes.
- Reason: Confirms actual PostgREST permissions with an ordinary user JWT; failed incomplete writes cannot create rows. No tokens, bodies, or key values were printed.
- Source: User-confirmed SQL Editor application and live Supabase checks run 2026-10-26; repository fixture documented in `docs/CONTEXT.md`.
- Rejected alternatives: Relying on static SQL checks alone; using the service-role JWT as the client proof; inserting test data during the permissions check.

## 2026-10-26 — T2 donation capture integration
- Question: How to distinguish a pledge from received funds and preserve idempotence across verified webhook replay?
- Choice: Link each PayPal order to one organization-scoped contribution; use a new service-role-only SECURITY DEFINER RPC that delegates normal capture posting to the established ledger RPC and, in the same transaction, marks only matching verified completed captures received and inserts one receipt. Record amount/currency mismatches on the pledge without marking it received.
- Reason: Keeps the existing signed webhook and ledger path authoritative and makes contribution/receipt updates atomic with capture processing. No third-party facts used.
- Source: Phase 6 T2 requirements and existing `record_paypal_capture_event` implementation in `supabase/migrations/0002_financial_core.sql`, checked 2026-10-26.
- Rejected alternatives: Count pledges as funds; mark received from browser/API request; create receipts before verified completed capture; reimplement ordinary capture ledger posting.

## 2026-10-26 — Safe live T2 contribution fixture
- Question: How to exercise the live campaign/pledge summary without initiating a real donation?
- Choice: Use the fixed owner and a stable campaign title, reuse an existing matching pledge if present, and create at most one $1 pledged-only record; do not create a PayPal order or capture.
- Reason: Verifies API-to-SQL summary and pledge semantics without moving money or creating repeat fixtures. No external facts used.
- Source: Phase 6 live test instructions and user confirmation that migration 0007 was applied, checked 2026-10-26.
- Rejected alternatives: Repeatedly creating new orgs/users/campaigns; treating a pledge as received; initiating buyer checkout during safe API verification.

## 2026-10-26 — Phase 6 live donation human gate
- Question: How to verify the live $1 donation flow without executing a purchase as the agent?
- Choice: Create only the PayPal Sandbox order linked to the fixed campaign pledge, return its approval URL to the user, then stop for their explicit “approved” response before capture/webhook verification.
- Reason: This is the specified Phase 6 live test gate; the human controls the US Personal buyer checkout and Visa step. No third-party purchase is completed by the agent.
- Source: User-provided Phase 6 live test instructions, checked 2026-10-26.
- Rejected alternatives: Capturing without buyer approval; initiating a different amount; creating repeated orders for the same fixed contribution.

## 2026-10-26 — Restart stale local webhook receiver before capture
- Question: How to ensure the approved live capture reaches the current webhook processor after the existing listener reported PayPal unconfigured?
- Choice: Restart the repository's stale `node server/index.js` on port 3000 using current repository/environment configuration, confirm status reports PayPal configured, then capture the already-approved order once.
- Reason: The order was created through current config but the old listener may not verify incoming PayPal signatures; using the configured port keeps the registered webhook route aligned with the local tunnel. No new purchase is created.
- Source: Live `GET /api/status` on port 3000 and server process inspection, 2026-10-26; `server/index.js` starts the webhook worker.
- Rejected alternatives: Capture while the callback receiver is stale; create another order; manually mark contribution received without a signed webhook.

## 2026-10-26 — Status field correction
- Question: Did the stale server report PayPal configuration missing?
- Choice: Treat the earlier preflight as a field-name mistake; the status response uses `paypal`, not `paypalConfigured`. After restarting the server, the correct fields reported PayPal configured, connected, and webhook configured.
- Reason: Do not change server/tunnel routing based on an absent response key. The configured server is now running on port 3000.
- Source: `server/src/routes/status.js` and `GET /api/status`, checked 2026-10-26.
- Rejected alternatives: Infer PayPal is disabled from an undefined response field; restart further processes without evidence.

## 2026-10-26 — Retrieve missing signed PayPal event
- Question: How to deliver the completed capture's original signed webhook when no matching event is in the local inbox?
- Choice: Use PayPal's official event-list API filtered by the capture transaction ID; inspect the configured webhook URL/subscriptions without printing secrets; if the exact event exists, request PayPal's event resend and wait for the signed delivery to the existing listener.
- Reason: Resending the original event preserves PayPal's signed event body and avoids fabricating a webhook or manually marking a contribution received.
- Source: [PayPal Webhooks Events List API](https://developer.paypal.com/api/webhooks/v1/webhooks-events-list), checked 2026-10-26; API supports `transaction_id` filtering and event resend.
- Rejected alternatives: Reconstruct a webhook body and claim it was PayPal-signed; manually update received status; create another payment.

## 2026-10-26 — Pause after provider resend did not reach inbox
- Question: What to do after PayPal accepts an exact-event resend but the event does not reach the application inbox?
- Choice: Stop live T2 reconciliation and ask the user to inspect PayPal delivery status and tunnel forwarding; do not retry endlessly, replay a different event, or write contribution state manually.
- Reason: Signature-verified delivery is required before recording donations; the exact event remained absent after a 25-second bounded poll.
- Source: PayPal Sandbox event-list/resend result and Supabase inbox read, checked 2026-10-26.
- Rejected alternatives: Treat the unrelated processed event as a match; create another order; manually mark received; fabricate or replay a payload.

## 2026-10-26 — Preserve posted entry while reporting donation account misclassification
- Question: Should the live Sandbox donation's balanced but misclassified journal entry be edited during a read-only verification request?
- Choice: Leave the posted journal untouched; report that the credit is account 4000 (`Sales Revenue`) instead of 4100 (`Donations`). Any correction must use a new numbered migration with an auditable reclassification and fund-specific posting logic.
- Reason: Journal history must remain auditable; user requested reconciliation checks, not a live financial correction. Migration 0007 is already applied and must not be edited.
- Source: Live journal line/account read and `supabase/migrations/0002_financial_core.sql` account definitions; checked 2026-10-26.
- Rejected alternatives: Directly update/delete posted journal lines; edit applied migration 0007; treat balanced totals as proof of correct fund accounting.

## 2026-10-26 — Route fund contribution captures to Donations account
- Question: How to distinguish fund contribution capture posting from ordinary PayPal sales captures?
- Choice: Detect the linked `fund_contribution_id` on the PayPal order in the repository, use fund-specific journal lines that credit 4100, and add migration 0008 that reverses and reposts already misclassified fund capture entries without editing/deleting them.
- Reason: Preserve generic Sales Revenue postings while ensuring donations use the seeded Donations account and existing journal history stays auditable.
- Source: Live ledger reconciliation and account definitions in `supabase/migrations/0002_financial_core.sql`, checked 2026-10-26; user instruction in this conversation.
- Rejected alternatives: Change all PayPal capture revenue to Donations; update/delete applied journal entries; edit applied migrations 0002/0007.

## 2026-10-26 — Introduce maintenance state machine additively
- Question: How should migration 0009 handle the legacy maintenance status values already accepted by migration 0006?
- Choice: Add T3 workflow states and use `requested` for new requests while retaining legacy values in the check constraint for existing rows. All new state-changing operations go through SECURITY DEFINER RPCs with service_role-only execution.
- Reason: Avoid silently rewriting any existing maintenance records while enforcing the new transitions for the new API path.
- Source: User-provided Phase 6 T3 state-machine requirements and existing `0006_fund_transparency.sql`, checked 2026-10-26.
- Rejected alternatives: Edit applied migration 0006; bulk-map legacy operational states without audit evidence; permit client table writes.

## 2026-10-26 — T3 live preflight scope
- Question: How to verify migration 0009 permissions without risking state changes?
- Choice: Probe each T3 RPC using the fixed ordinary owner JWT and exact function arguments, requiring HTTP 403 before running workflow actions.
- Reason: `SECURITY DEFINER` maintenance actions are stateful and the client grant boundary must be proven first; corrected probes returned 403 for all six RPCs.
- Source: Live Supabase/PostgREST check against the configured project, 2026-10-26. Rejected alternative: use a service-role RPC probe, which would mutate maintenance data and cannot prove ordinary-user denial.

## 2026-10-26 — T3 SQLSTATE response mapping
- Question: How should expected maintenance RPC domain failures surface to clients?
- Choice: Map only known Postgres domain SQLSTATEs in `fundRoutes` to stable 400/403/404/409 structured errors; suppress database messages.
- Reason: live checks showed permission/transition rejections were being wrapped as 503 `DATABASE_UNAVAILABLE`, masking expected behavior and making clients treat rejected actions as outages.
- Source: `supabase/migrations/0009_maintenance_state_machine.sql` SQLSTATE declarations and `server/src/services/supabase.js` RPC adapter, inspected 2026-10-26. Rejected alternative: expose PostgREST error messages or change global mapping shared by unrelated routes.

## 2026-10-26 — Preserve append-only run history after shell interpolation
- Question: How to correct the noisy raw test transcript appended to the report during checkpointing?
- Choice: Keep the historical transcript and add a clarifying entry with the exact second-run result rather than deleting prior report lines.
- Reason: Continuity protocol requires append-only logs; the output came from a real passing `npm test` rerun and contained no secrets.
- Source: Local command output and `docs/TEST-REPORT.md`, checked 2026-10-26. Rejected alternative: rewrite the report tail and erase the earlier appended record.

## 2026-10-26 — T3 live fixture strategy
- Question: Which test data should the live state-machine workflow use?
- Choice: Reuse the existing Phase 3 verifier organization and fixed owner, approver, accountant users; use deterministic maintenance request, contractor, and quotation names and resume existing rows.
- Reason: T3 audit rows are append-only; adding users/orgs or creating new records per run would make safe recovery and cleanup harder. The accountant requester permits owner and approver to provide two distinct approvals at the exact threshold.
- Source: Existing memberships and fixed-fixture scripts, read-only checked 2026-10-26. Rejected alternative: provision new identities/orgs or reset fixed users' passwords.

## 2026-10-26 — T4 Payouts sandbox capability probe
- Question: How to establish whether this configured app can actually create PayPal Payouts in Sandbox?
- Choice: Send one $0.01 Sandbox-only payout to the repository's fixed US Personal Sandbox test account using a fixed `sender_batch_id` and deterministic `PayPal-Request-Id`; query its status in memory and print statuses only.
- Reason: official docs confirm general Sandbox Payouts support and the app's OAuth token includes Payouts scope, but neither alone proves a payout succeeds for this app. The Phase 6 prompt explicitly requires checking current capability. Sandbox avoids real funds; deterministic identifiers make retries idempotent.
- Source: [PayPal Payouts SDK](https://developer.paypal.com/sdk/payouts), [PayPal Payouts API customization and idempotency](https://developer.paypal.com/docs/payouts/standard/integrate-api/customize/), [PayPal Sandbox testing](https://developer.paypal.com/sandbox-testing/overview/); checked 2026-10-26. Rejected alternative: decide SIMULATED from docs/OAuth scope alone without testing app entitlement.

## 2026-10-26 — T4 payment mode
- Question: Should T4 use PayPal Payouts or a simulated payment?
- Choice: Use SIMULATED mode for this deployment; do not call the Payouts endpoint and do not post simulated payments to the real ledger. Every API/report/export row must show `SIMULATED` and `simulated, no ledger entry` as an explicit gap.
- Reason: OAuth returned HTTP 200 with a Payouts scope, but the deterministic one-cent Sandbox payout probe was rejected with HTTP 403 `PAYOUT_NOT_AVAILABLE`; no batch was created. The configured app cannot currently execute payouts, so a real payout must not be claimed.
- Source: Live call to `https://api-m.sandbox.paypal.com/v1/payments/payouts`, fixed Sandbox receiver and deterministic `PayPal-Request-Id`, 2026-10-26; [PayPal Payouts SDK](https://developer.paypal.com/sdk/payouts), [Sandbox Payouts idempotency](https://developer.paypal.com/docs/payouts/standard/integrate-api/customize/), docs checked 2026-10-26. Rejected alternative: persist a real payout despite the provider's explicit `PAYOUT_NOT_AVAILABLE` response.

## 2026-10-26 — T4 live verification fixture
- Question: How to verify T4 against the user-confirmed 0010 migration without creating new live identities or records unnecessarily?
- Choice: Reuse the existing fixed Phase 3 verifier organization/users and the already-approved 9999-minor-unit maintenance request; queue and approve one SIMULATED payment, then repeat the same approval ID.
- Reason: Existing fixture is eligible for the single-approver path and repeats are deterministic; no external payout occurs and persisted state can prove null PayPal/ledger refs.
- Source: repository fixture in `scripts/verify-phase6-maintenance-live.js` and T4 API/migration; checked 2026-10-26.
- Rejected: create fresh live test users/orgs or use real PayPal payout; unnecessary and outside SIMULATED policy.

## 2026-10-26 — 0010 live apply mismatch
- Question: Proceed with T4 payment writes after user said migration 0010 was applied, when the configured project rejects the linkage column?
- Choice: Stop before all payment/approval writes and request applying migration 0010 to the project configured for this workspace.
- Reason: Read-only PostgREST returned SQLSTATE 42703: `column approvals.fund_maintenance_request_id does not exist`; the schema required for safe, idempotent payment processing is absent.
- Source: configured Supabase PostgREST response checked 2026-10-26.
- Rejected: attempt RPC/API writes or assume application based only on prior confirmation; unsafe while the live schema is unverified.

## 2026-10-26 — T5 completion evidence flow
- Question: How should metadata-only evidence be reviewed and how can a maintenance request close safely?
- Choice: Add review metadata to evidence and reviewer/closure metadata to the request. Allow same-org owner/admin/accountant/resident to submit metadata; require owner/admin/approver reviewers distinct from requester and evidence submitter. Reviewer accepts or requests changes; move to `reviewed` only when at least one evidence is accepted and no evidence remains pending; close only from `reviewed` by a reviewer. Audit each evidence and state change.
- Reason: This enforces completion evidence before close, preserves the existing state machine, gives a repair path for rejected evidence, and stores no files. API text states evidence supports but does not prove work correctness.
- Source: Phase 6 prompt T5 (user attachment, read 2026-10-26), existing 0006 metadata table and 0009 status constraint.
- Rejected: direct table writes, close without accepted evidence, or treating uploaded file contents as part of this thin slice.

## 2026-10-26 — T6 privacy and audit export
- Question: What may the read-only transparency view and audit export expose to satisfy linkage while protecting donor/actor data?
- Choice: Transparency returns campaign totals, amounts/statuses, quote/payment/ledger links, sanitized evidence IDs/kinds/review status, and donor references hashed server-side; names, evidence descriptions/file paths, actor IDs and raw donor refs are omitted. Missing quote/invoice, payment reference, ledger entry, or evidence is represented as `{ "gap": "..." }`; SIMULATED rows expose `simulated, no ledger entry`. Audit CSV is owner/admin only, org-scoped, and exports event identity/time/action/entity/request ID plus a pseudonymous actor reference; omit arbitrary metadata and formula-neutralize cells.
- Reason: current schema has no maintenance invoice FK and audit metadata can hold donor refs; the old CSV helper already handles quoting and formula prefixes.
- Source: T6 requirements in user-provided Phase 6 prompt and current `0001`, `0006`, `0007` migrations plus `server/src/routes/reports.js`, checked 2026-10-26.
- Rejected: expose raw metadata/file refs/actor IDs, return fabricated invoice links, or make transparency writes available.

## 2026-10-26 — T6 direct table read boundary
- Question: How to satisfy T6's requirement that transparency be read through the API/RPC while keeping direct table reads blocked?
- Choice: Add an additive migration revoking `SELECT` from `authenticated` on Phase 6 fund tables; keep service-role server access and member-checked transparency RPC. Verify donor/resident direct table reads fail live.
- Reason: Migration 0006 granted all authenticated members table reads, so RLS membership policies alone do not meet the endpoint-only privacy boundary in T6.
- Source: Phase 6 T6 requirement in user-provided prompt and grants in `supabase/migrations/0006_fund_transparency.sql`, checked 2026-10-26.
- Rejected: rely on the existing member RLS policy or client-side hiding; both still permit direct table queries.

- 2026-10-26 — Question: after user confirmed 0012 applied, should the live verifier continue on PostgREST HTTP 404/PGRST202? Choice: stop before data checks, record live state UNVERIFIED, and require schema-cache refresh plus routine/privilege confirmation in the Supabase SQL Editor. Reason: the API cannot resolve `public.get_fund_transparency`; continuing would produce misleading endpoint/security results. Rejected: assume the migration is visible or bypass the API path. Source: live service-role RPC response, checked 2026-10-26 (no third-party fact).

- 2026-10-26 — Question: which pending migration should be applied based on missing T6 RPCs and authenticated SELECT still being granted? Choice: apply only `supabase/migrations/0012_fund_transparency_read_export.sql`, after confirmed-applied migrations 0001–0011. Then pause for user confirmation before any later migration action; do not reload schema cache yet. Reason: 0012 defines both RPCs and revokes authenticated table SELECT, while all earlier migrations are recorded as applied. Rejected: reapply 0001–0011, create a patch migration, or refresh schema cache before 0012 is visible. Source: repo migration inventory and user-provided SQL Editor results, checked 2026-10-26.
- 2026-10-26 — Question: what to do immediately after the user says migration 0012 was applied, while cache reload is prohibited? Choice: request/read the SQL Editor catalog and privilege checks first; do not issue `NOTIFY pgrst` or rely on stale REST schema visibility. Reason: confirm database state independently before changing API cache state. Rejected: reload immediately or treat apply confirmation alone as proof both SQL transaction and grants are present. Source: user instruction and reported apply, checked 2026-10-26.
- 2026-10-26 — Question: how to fix the live T6 `42725 operator is not unique: unknown - unknown` error in the already-applied 0012 function? Choice: add migration 0013 that replaces only `get_fund_transparency`, builds campaign JSON from explicit allowlisted keys (excluding organiser) without the ambiguous subtraction operator, and reapplies service-role-only execute ACLs. Reason: live RPC with a valid member failed at runtime; 0012 is applied and must not be edited. Rejected: editing 0012, broad granting, or exposing the organiser field. Source: live PostgREST response and `0012_fund_transparency_read_export.sql`, checked 2026-10-26.
- 2026-10-26 — Question: should the new T6 runtime correction be applied automatically or sent through the established SQL Editor gate? Choice: provide migration 0013 alone and wait for the user's `applied` confirmation; do not change schema cache. Reason: the live database is user-managed and the user requires confirmation after each migration. Rejected: applying from the agent or asking the user to rerun 0012. Source: user continuity/apply instructions and local migration 0013, checked 2026-10-26.
- 2026-10-26 — Question: how should T6 handle live SQLSTATE 42703 `a.created_at` after migration 0013? Choice: add migration 0014 replacing `get_fund_transparency` to order approval-chain rows by `decided_at`, the actual `fund_approvals_chain` timestamp column, and preserve service-role-only grants. Reason: schema definition in 0006 has `decided_at` and no `created_at`; live RPC exposed the bad reference. Rejected: edit applied migrations 0012/0013 or add a nonexistent timestamp column solely to match the query. Source: live RPC error and `0006_fund_transparency.sql`, checked 2026-10-26.
- 2026-10-26 — Question: should T6 live verification continue after the verifier reaches the owner CSV check but its helper lacks `.text()`? Choice: preserve raw response text alongside parsed JSON in the verifier helper and rerun with the same fixed fixtures. Reason: the run had already passed all role, RLS, org-boundary, RPC grant, donor/resident privacy and resident-export checks; only CSV body assertions were blocked by harness shape. Rejected: weaken/remove CSV assertions or classify the partial run as complete. Source: local verifier failure and passing rerun, checked 2026-10-26.

- 2026-10-26 — Question: does T7 need a separate limiter just for payment/approval routes? Choice: retain the existing global per-IP (300/15 minutes) and authenticated per-user (240/15 minutes) API limiters, document that all fund/payment/approval actions inherit both, and add route-level integration checks proving 429 behavior on those actions. Reason: both controls already execute before routing/authenticated business logic; adding another arbitrary threshold would duplicate controls. Rejected: remove limits or introduce a second unconfigured threshold. Source: `server/src/app.js` rate-limit middleware and T7 requirements, checked 2026-10-26.
- 2026-10-26 — Question: how to handle the Phase Completion Gate's frontend-diff and legacy safe-verifier checks? Choice: exclude the explicitly user-ignored font commit `f410e86` when checking for this task's frontend changes; record strict `origin/main` delta as that commit only. Run Phase 2/3 `--safe`; do not run Phase 4 because it has no `--safe` and its normal path writes live records. Reason: preserve protected frontend changes and avoid unintended live mutations while accurately reporting unverified checks. Rejected: edit/revert the font fix or run the mutating Phase 4 verifier as if safe. Source: user's instruction to ignore the standalone font commit, migration/protected file rules, and verifier source, checked 2026-10-26.
- 2026-10-26 — Question: how to handle the explicit one-task release authorization? Choice: after confirming branch `phase6-backend`, clean status, no tracked `.env`/credential files, and no secret-like values (only examples/schema/test fixtures), checkpoint the work journal, re-confirm clean state, then push only this branch, tag it, and create the requested PR. Reason: follow the user’s explicit step order while retaining a clean checkout and never push main. Rejected: push other branches, force-push, or bypass the preflight. Source: user's one-task push approval in this chat, checked 2026-10-26.

- 2026-10-26 — Question: Which base and branch should fund wiring use? Choice: synchronized `main` at 874e2e5, then local `fund-wiring`. Reason: the user explicitly prescribed this sequence and confirmed no pushing. Source: user task, checked 2026-10-26. Rejected: continue on phase6-backend.

- 2026-10-26 — Question: how should Fundraising handle role and receipt fields unavailable to the browser? Choice: only show write controls when a trusted app_metadata organization role is present; otherwise read-only, and render receipt references only when the API returns them. Reason: never infer privileges from editable browser metadata or fabricate receipt data; the server remains authoritative. Source: docs/FRONTEND-CONTRACT.md and src/auth.js, checked 2026-10-26. Rejected: default-visible writes and synthesized receipt numbers.

- 2026-10-26 — Question: how to list pre-payment maintenance requests from current APIs? Choice: use `/api/funds/transparency` for persisted payment rows and keep request/contractor/quotation responses in current-tab state. Reason: the documented API has no GET list for these records and T1 is frontend-only. Source: docs/FRONTEND-CONTRACT.md and supabase/migrations/0012_fund_transparency_read_export.sql, checked 2026-10-26. Rejected: direct table reads or adding backend routes outside scope.

- 2026-10-26 — Question: what should Transparency show when the backend omits evidence file paths and receipt numbers? Choice: render evidence metadata and an explicit unavailable-link note; show receipt references only if the API returns them. Reason: preserve privacy and avoid fabricating artifacts. Source: `/api/funds/transparency` contract and migration 0012, checked 2026-10-26. Rejected: direct table reads or synthesized links/receipt IDs.

- 2026-10-26 — Question: what to do when the fixed T3 maintenance fixture is already closed but the lifecycle verifier expects payment_approved? Choice: preserve the closed record and report the expected-state mismatch. Reason: do not reset or recreate fixed live data merely to force a demo result. Source: verifier output and `docs/WORKLOG.md`, checked 2026-10-26. Rejected: reopening, deleting or recreating the fixed request.
- 2026-10-26 — Question: how to document Phase 6 operating boundaries? Choice: state that PayPal Sandbox captures/refunds, signed webhooks, ledger, Supabase Auth/RLS and cited Gemini AI are integrated; invoice send and maintenance payouts are SIMULATED; the product is not for real money. Reason: match the requested demo claims and existing backend contract. Source: user task, `docs/FRONTEND-CONTRACT.md`, and `docs/RUNBOOK.md`, checked 2026-10-26. Rejected: implying production money movement or PayPal Payouts availability.
- 2026-10-26 — Question: how to report unavailable browser-only and PDF-specific checks? Choice: mark browser checks and exact PDF sequence UNVERIFIED, give exact manual browser actions, and keep the README demo limited to described API steps and existing data. Reason: no browser session checks were run and the referenced PDF was unavailable; never claim unrun verification. Source: user task and repository/attachment inspection, checked 2026-10-26. Rejected: infer browser success or create new payment data.
- 2026-10-27 — Question: what should the dashboard do when the events endpoint cannot provide activity? Choice: keep auth fail-closed, return empty arrays for repository snapshot failures after authorization, and render explicit empty activity states on client request failure. Reason: the captured 503 log came from the intentional degraded-mode auth test (`SUPABASE_NOT_CONFIGURED`), while Postgres snapshot reads can independently fail as `DATABASE_UNAVAILABLE`; neither should leave stale/error UI. Source: `docs/TEST-REPORT.md` captured server log, `server/src/middleware/auth.js`, `server/src/routes/status.js`, and `server/src/repos/postgres.js`, checked 2026-10-27. Rejected: bypass auth or expose memory events when Supabase is unavailable.
- 2026-10-27 — Question: which field drives the AI route badge? Choice: use top-level `response.route`, allow only `code/sql/llm`, and put `response.reason` in the title and accessible label. Reason: usage metadata must not be used as route classification. Source: `server/src/routes/ai.js` and dashboard response mapping, checked 2026-10-27. Rejected: derive badge text from `usage` or `mode`.
- 2026-10-27 — Question: what is the handoff sequence? Choice: human restarts/reloads/checks UI, pushes fund-wiring, teammate merges PR, then runs the 3-minute demo; Phase 5 only if time remains. Reason: explicit HANDOFF NOW request. Source: user, checked 2026-10-27. Rejected: push or merge by agent.
- 2026-10-27 — Question: how to handle repeated `/api/events` conditional responses? Choice: set `cache: "no-store"` on authenticated API fetches. Reason: server logs showed HTTP 304 on repeat polls, and Fetch `Response.ok` is false for 304, so the client rejected valid cached activity responses. Source: running server request log, `src/api-client.js`, and Fetch response semantics, checked 2026-10-27. Rejected: treat 304 as success without a response body or keep conditional caching for authenticated JSON APIs.
- 2026-10-27 — Verification: after `cache: "no-store"` was added, reloaded dashboard fetched updated `src/api-client.js` with HTTP 200 and `/api/events` returned HTTP 200. Choice: record server-log result PASS while leaving direct console inspection UNVERIFIED. Source: local server request logs and browser AX state, checked 2026-10-27. Rejected: claim a console check that could not be performed.
- 2026-10-27 — Question: can the 3-minute visual demo continue in this session? Choice: mark it UNVERIFIED and leave exact README steps for the user; browser automation is disabled in Work settings. Reason: no safe supported browser surface was available. Source: browser inventory, checked 2026-10-27. Rejected: claim a demo run or use a different account/session.
- 2026-10-27 — Question: which verifier should be repaired when `scripts/verify-phase6.js` is absent? Choice: repair the existing `scripts/verify-phase6-maintenance-live.js`, whose deterministic `getRequest` reuses the fixed row and whose lifecycle assertion expects `payment_approved`. Reason: it matches the closed-request failure documented in prior handoff. Source: repository file listing and verifier source, checked 2026-10-27. Rejected: add a duplicate alias script or edit unrelated completion/payment verifiers.
- 2026-10-27 — Question: how to clean a completed T3 verifier run? Choice: delete only this run's requests and child business rows in FK-safe order; retain append-only audit records, and delete the fixed contractor only if the current run created it. Reason: audit_log is insert-only/service_role delete is revoked; the verifier never posts a payment or ledger entry. Source: migrations 0001, 0006, 0009, 0010; checked 2026-10-27. Rejected: delete audit history or clean shared fixed fixtures.
- 2026-10-27 — Verification correction: an initial config probe omitted dotenv and showed false, but the verifier itself loads dotenv and proceeded; do not infer live configuration from that probe. Choice: record its final exit UNVERIFIED while preserving the step journal's lifecycle and scoped-cleanup PASS evidence. Source: verifier-generated WORKLOG steps and missing captured command exit, checked 2026-10-27. Rejected: claim a definitive overall PASS without captured exit code.
- 2026-10-27 — Question: which branch should Phase 5 use as its base? Choice: `fund-wiring`; `origin/fund-wiring` is not listed among branches merged into `origin/main` after fetching. Reason: Phase 6 wiring is not yet merged to main. Source: `git fetch origin` and `git branch -r --merged origin/main`, checked 2026-10-27. Rejected: base Phase 5 on main before the wiring PR merges.

2026-10-28 | Phase 5 base before PR merge? | Use `fund-wiring` while it is absent from `git branch -r --merged origin/main`; recheck before branch creation. Rejected: `main` before merge. Source: `git fetch origin` and `git branch -r --merged origin/main`, checked 2026-10-28.

2026-10-28 | How to sync PR #4 follow-up work after PR #5/#6 UI merges? | Branch from origin/main; carry only backend/verifier and focused API wiring deltas, retain main UI/assets. Reason: PR history is squashed and fund-wiring net diff includes newer main UI/assets that must not be reverted. Source: `git cherry -v origin/main fund-wiring`, file diff, checked 2026-10-28. Rejected: wholesale cherry-pick or branch file checkout.
2026-10-28 | Is root `server.js` from PR #5 the backend entry? | PR #5 first-parent diff did not add it; later commit 9b5fe89 added the root legacy file, while `package.json` starts `server/index.js`. Keep both as present on main; do not route startup through root file. Source: merge diff, `git log origin/main -- server.js`, package script, checked 2026-10-28. Rejected: treating root file as replacement for the modern backend.

2026-10-28 | Is the Phase 5 plan specific enough to draft without the Build Blueprint PDF? | Stop planning and request the missing PDF; use the image only as a high-level scope hint. Reason: detailed tasks/files/migrations/acceptance criteria cannot be verified, and user said not to invent scope. Source: `PaypalFinal.png` and searched workspace; checked 2026-10-28. Rejected: infer implementation plan from the roadmap card alone.

2026-10-28 | Which Phase 5 scope applies when the infographic's Week 5 card differs from the Blueprint's numbered Phase 5? | Follow the Blueprint's explicit numbered Phase 5: RAG and OCR (PDF pages 15 and 28); keep the infographic Week 5 community/automation list out of this phase plan. Reason: the Blueprint provides the detailed phase-specific build and acceptance criteria; its page 15 places Phase 5 in Week 4 and Phase 6 in Week 5. Source: external `/Users/aditya/Paypal_hackathon/paypalFinal.pdf`, `PaypalFinal.png`, checked 2026-10-28. Rejected: combine different numbered phase and week labels into an invented scope.
2026-10-28 | Which embedding model and database vector dimension should Phase 5 use? | Use stable Gemini `gemini-embedding-001` at 768 dimensions, stored as `extensions.vector(768)`; prefer lower storage/query cost for the initial document-only index. Reason: Google lists 768/1536/3072 as recommended output dimensions. Source checked 2026-10-28: https://ai.google.dev/gemini-api/docs/embeddings . Rejected: default 3072 dimensions until retrieval quality demonstrates need.
2026-10-28 | What upload constraints and authorization apply in Phase 5? | Defaults 10 MB, 10 pages, 2 concurrent processing jobs/org, and 20 uploads/org/hour; limits configurable within safe ceilings. Accountant-level roles (owner/admin/accountant) required for upload/confirm/delete, viewers read-only; initial documents/OCR index only. Reason: user-approved Phase 5 amendments. Source: user, 2026-10-28. Rejected: exposing client write access or indexing transaction/quotation/campaign descriptions before core passes.
2026-10-28 | How should extracted document data be treated and what provider terms apply? | Treat OCR as untrusted and test prompt injection during extraction and answer generation; use sample documents only because free-tier provider terms may allow submitted data use. Reason: user-approved safety/default requirement. Source: user, 2026-10-28. Rejected: treating OCR text as trusted instructions or testing with real financial documents.
2026-10-28 | How should document uploads be represented and audited? | Store files in a private organization-prefixed bucket; enforce hourly limit through an atomic service-only RPC and write the upload audit row in the same transaction as the document row. Reason: tenant isolation, cleanup, and auditability. Source: Phase 5 user amendments and Supabase Storage/RLS conventions, checked 2026-10-28. Rejected: public bucket, client-side privileged writes, or separate non-atomic upload audit.
2026-10-28 | Which OCR provider interface/default is approved for Phase 5? | Use a vision-capable Gemini model through a provider interface, configured with `GEMINI_API_KEY`; select the exact model against current free-tier model docs when implementing Part 2. Reason: preserve provider replaceability and use the user-selected free-tier provider. Source: user, 2026-10-28. Rejected: calling provider APIs directly from routes or hard-coding credentials/model choices.
