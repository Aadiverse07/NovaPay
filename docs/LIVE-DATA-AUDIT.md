# Live Data Audit

Date: 2026-11-02. Branch: `codex/voice-assistant`. Scope: static inspection of `dashboard.html`, `src/` and `server/src/routes/`.

**Verification boundary:** endpoint names below are confirmed in source, not through authenticated browser/network traffic or organization-scoped database reads. No module's financial records are marked runtime-verified. The local browser surface is unavailable in this session, and no test-user JWT was used. Phase 1 makes no application-code changes.

## Dashboard

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| KPI cards, organization status, recent activity, cash movement | Dashboard uses `src/dashboard-live-data.js` and `src/dashboard-data.js`; calls report endpoints after auth is ready; recent rows are API-loaded | `/api/reports/profit-and-loss`, `/api/reports/fees`, `/api/reports/refunds`, `/api/reports/cash-movement`, `/api/transactions` | No new route identified; disputes metric remains unavailable because no disputes report endpoint exists | Medium: runtime tenant rows are not verified; currency rows must remain separate | Convert implemented; disputed amount removed; runtime check UNVERIFIED |
| Home illustration | Static decorative HTML with non-monetary example labels | None needed | None | Low: illustration is explicitly marked illustrative | Keep as labeled illustration; no monetary sample values |

## Transactions

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Table rows and source note | `src/financial-live.js` waits for authenticated Supabase state, calls the API client, replaces tbody with API rows, and shows explicit empty/error rows; static sample transaction rows were removed | `GET /api/transactions` | No route gap identified; authenticated network and DB row still unverified | Medium: API mapping and tenant query have source tests, but runtime still unverified | Converted to API-only in source; no sample rows in this module |
| Grid, filters, detail and export | Existing AG Grid keeps DOM hydration; API rows retain identifiers/data attributes; API refresh replaces rows and observer syncs changes | `GET /api/transactions` | Browser grid filters/detail/export remain for Phase 3 verification | Medium: browser behavior not checked in this turn | Keep AG Grid and hydrate only API rows |

## AI Assistant

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Authenticated answers and citations | API request through `NovaPayApi` to `/api/ai/chat`; backend AI route exists | `POST /api/ai/chat` | No route gap established; verify returned evidence against tenant DB rows | Medium: code scrapes transaction DOM for demo/local context; DOM contains sample rows | Keep API path; authenticated evidence only from API; remove DOM-scraped sample evidence in authenticated mode |
| Demo fallback and greeting/prompts | `localAnswer()` is used only by the explicitly labeled demo mode; transaction detail now calls the API and reports errors without echoing DOM rows; quick prompts are static question text | `POST /api/ai/chat` | No gap established; browser and live evidence still need verification | Low if demo mode remains labeled | Keep local sample answers only in demo mode; never present error text as evidence |

## Approvals

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Queue cards and pending count | Authenticated source now maps `GET /api/approvals` rows and server `pendingCount`; `PAY-28491` / `DSP-1004` are loaded only when `NovaPayAuth.mode === demo` | `GET /api/approvals`, `GET /api/approvals/pending-count`, `POST /api/approvals/:id/decision` | No route gap identified; live responses and matching DB rows still require browser/runtime verification | Critical if auth/org headers are wrong; source request goes through `NovaPayApi` | Convert authenticated queue and badge; keep clearly labeled demo-only proposals |
| Sandbox-linked approval registration | Existing demo-only local proposal path | `POST /api/approvals/register` | Authenticated AI proposals are already persisted by `/api/ai/chat`; no duplicate local proposal is inserted | Medium | Keep sandbox registration for explicit demo mode only |
| Review and decision | Authenticated UI sends decisions for supported persisted types | `POST /api/approvals/:approvalId/decision` | No route gap identified; decision results still need live verification | High: endpoint enforces org and role; unsupported types remain read-only | Convert supported persisted decisions; identify invoice send and maintenance payouts as SIMULATED |
| Recent action list | Browser session memory only | No audit-list endpoint in the inspected approvals router | No read endpoint for durable approval audit entries established | Medium: must not imply durable audit history | Keep clearly labeled “Recent actions (this session)”

## PayPal Sandbox

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Status, create order, capture, refund | `src/novapay-live.js` API client calls; amount form defaults to 10.00 USD | `/api/status`, `/api/events`, `/api/paypal/create-order`, `/api/paypal/capture`, `/api/paypal/refund` | No endpoint gap identified; runtime capture and DB persistence not rechecked here | Medium: status/events are session-local; default amount is a form input, not a balance | Keep API flow; label session-only event log and Sandbox status accurately |
| Webhook event list | Static empty state then session-only JS events | Webhook receiver `/api/webhook`; `/api/events` | Durable event history is not established by UI source | Medium | Keep as session-only diagnostic, clearly labeled; never treat as transactions |

## Ledger

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Journal rows and KPI totals | `src/financial-live.js` waits for authenticated Supabase state, loads `/api/ledger/entries`, computes currency-separated totals, and shows an empty state without sample rows. Sample HTML and nonzero fallback KPIs removed. | `GET /api/ledger/entries`, `GET /api/ledger/trial-balance` | No route gap identified; authenticated rows still need runtime confirmation | Medium: browser tenant data not verified | Converted in source; empty org shows no fake amounts |
| Period filter and balance status | Client-side filter/summary over fetched entries; API-backed CSV export in `src/modules.js` | `GET /api/ledger/entries` | None identified from source | Medium: browser period/filter/export behavior is unverified | Keep calculations and export on API rows only, grouped by currency |

## Invoices

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Invoice list, metrics, create/edit/review/delete/void | `src/invoices-live.js` uses API; no static invoice rows found in view | `GET/POST /api/invoices`, `GET/PATCH/DELETE /api/invoices/:id`, review/void and PDF routes | No route gap identified by source scan | Medium: runtime row ownership and totals not verified in this audit | Keep API-backed view; verify each action and empty org behavior |
| Invoice form defaults | Form starts with zero total / blank fields | `POST /api/invoices` | None | Low if clearly a form, not a metric | Keep as input defaults; totals must be server-computed |

## Reports

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| P&L summary, currency-separated chart, P&L/trial-balance detail and CSV | `src/reports-live.js` renders API rows; old static INR cards and sample CSV removed | `/api/reports/profit-and-loss`, `/api/reports/trial-balance`, `/api/reports/fees`, `/api/reports/refunds`, `/api/reports/cash-movement` | No report route gap identified; live tenant rows still require runtime verification | High: per-currency series are scaled separately and never summed together | Convert summaries/details/exports to organization API rows; empty period shows no activity |
| FX conversion widget | API-backed currencies and convert, with demo-only rates fallback | `GET /api/fx/currencies`, `POST /api/fx/convert` | None identified | Low if fallback stays demo-only | Keep API-backed; label indicative result/source |

## Documents

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Document list, upload, process, review and actions | `src/documents.js` loads `/api/documents` and uses API for upload/process/confirm/reject | `/api/documents`, `/api/documents/:id`, process/confirm/reject/delete and signed-original routes | No route gap identified | Medium: OCR/storage live behavior not exercised here | Keep API-backed; show only API rows in authenticated mode |
| Demo upload helper | UI helper in `src/modules.js`; sample-only intent in source | Existing document API for real upload | Confirm demo-only visibility during conversion | Medium | Keep only in explicitly labeled demo mode; otherwise remove |

## Community Funds

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Campaign list, summaries, contributions and receipts | `src/fund-views.js` hides static cards in authenticated mode, loads campaign summaries and transparency expenses via API, and labels/dismisses demo samples | `/api/funds/campaigns`, campaign summary/transparency/contributions/receipts routes | No route gap identified; runtime DB rows not verified | Medium: API/source tests pass, live tenant rows remain unverified | Keep labeled Sample only in explicit demo mode and only when org has no real rows; convert authenticated view |
| Create campaign and maintenance/fund workflow links | API-backed handlers in `src/fund-views.js` | `/api/funds/*` | No gap identified from source | Medium | Keep API-backed; verify RBAC and tenant scope live |

## Maintenance

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Requests, details, state machine and actions | `src/fund-views.js` hides legacy sample HTML in authenticated mode, loads maintenance requests/transitions through API, and adds retry/refresh hooks | `/api/funds/maintenance*` routes for requests and workflow | No route gap identified; runtime state transitions not verified | Medium: source/API tests pass, live workflow rows remain unverified | Convert authenticated view exclusively to API; explicit demo samples are labeled and dismissible |

## Settings

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Theme, density, notifications preferences, landing view, timeout | `src/dashboard.js` saves to browser `localStorage` | None required (personal browser preferences) | No server endpoint for cross-device org preferences | Low: preferences are not organization financial data | Keep as local preferences and label/save scope honestly |
| Profile display name and email | Supabase session supplies signed-in identity; display-name edit remains local-browser only and has no profile endpoint | No profile/settings API route found in inspected routes | Add profile endpoint only if shared org profile editing is required | Medium: local profile edit may look like persisted account data | Keep display-name edit clearly local or make read-only; profile persistence across devices is an API/auth gap |
| Password/account controls | Signed-in password update uses the existing Supabase Auth method; demo password remains browser-local; account deletion is hidden for Supabase users because no deletion endpoint exists | Supabase Auth `updatePassword` method | Account deletion service/endpoint is missing; no code path deletes Supabase users | Medium: browser verification pending | Keep demo deletion explicitly local; do not imply Supabase account deletion |

## Sidebar badges and notification bell

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Approvals badge | Authenticated queue supplies `pendingCount`; demo count only from labeled demo queue | `GET /api/approvals` | No route gap identified; live count still needs tenant verification | Medium: browser/runtime unverified | Converted in source; zero hides badge |
| Notification bell/popover/count | `src/notifications-live.js` fetches org notifications, renders unread count, read action, empty/error/retry; static items removed | `GET /api/notifications`, `POST /api/notifications/:id/read|dismiss` | No route gap; endpoint/source exists, but live rows remain unverified | Medium: endpoint and source checks pass; live org rows remain UNVERIFIED | Converted to notification API |

## Phase 1 summary

- Source audit found routes for most modules; recent work has wired API-backed views and isolated demo content, but this is not evidence of live DB rows.
- Dashboard, Transactions, Ledger, Approvals, Invoices, Reports, Documents, Community Funds, Maintenance and Notifications have source tests; authenticated network and DB results remain **UNVERIFIED**.
- No migrations identified for the frontend conversions so far. Settings preferences remain browser-local; profile edit persistence lacks a live endpoint.
- Do not merge until browser verification passes for both empty and existing organizations.
