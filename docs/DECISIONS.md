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
