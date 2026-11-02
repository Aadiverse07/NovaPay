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
| Demo fallback and greeting/prompts | `localAnswer()` and static quick prompts in `src/dashboard.js` / HTML | None | None | Low if mode-gated; high if reachable while signed in | Keep only visibly labeled demo fallback; greetings may remain static copy |

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
| P&L cards, chart bars, report export | Static sample HTML and sample arrays / CSV in `src/modules.js` | `/api/reports/profit-and-loss`, `/api/reports/trial-balance`, `/api/reports/fees`, `/api/reports/refunds`, `/api/reports/cash-movement` | No report route gap identified; UI is not consuming report routes | Critical: fabricated report totals and exports | Convert all reports/exports to API; no sample totals in authenticated mode |
| FX conversion widget | API-backed currencies and convert, with demo-only rates fallback | `GET /api/fx/currencies`, `POST /api/fx/convert` | None identified | Low if fallback stays demo-only | Keep API-backed; label indicative result/source |

## Documents

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Document list, upload, process, review and actions | `src/documents.js` loads `/api/documents` and uses API for upload/process/confirm/reject | `/api/documents`, `/api/documents/:id`, process/confirm/reject/delete and signed-original routes | No route gap identified | Medium: OCR/storage live behavior not exercised here | Keep API-backed; show only API rows in authenticated mode |
| Demo upload helper | UI helper in `src/modules.js`; sample-only intent in source | Existing document API for real upload | Confirm demo-only visibility during conversion | Medium | Keep only in explicitly labeled demo mode; otherwise remove |

## Community Funds

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Campaign list, summaries, contributions and receipts | `src/fund-views.js` loads APIs in authenticated mode; sample cards are labeled and gated to demo mode | `/api/funds/campaigns`, campaign summary/transparency/contributions/receipts routes | No route gap identified; runtime DB rows not verified | Medium: ensure demo/sample nodes are hidden after auth mode resolves | Keep labeled Sample only in explicit demo mode and only when org has no real rows; convert authenticated view |
| Create campaign and maintenance/fund workflow links | API-backed handlers in `src/fund-views.js` | `/api/funds/*` | No gap identified from source | Medium | Keep API-backed; verify RBAC and tenant scope live |

## Maintenance

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Requests, details, state machine and actions | `src/fund-views.js` loads maintenance requests and transitions through API; legacy sample HTML exists | `/api/funds/maintenance*` routes for requests and workflow | No route gap identified; runtime state transitions not verified | High: legacy samples or API errors could appear as real | Convert authenticated view exclusively to API; demo samples only labeled and dismissible |

## Settings

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Theme, density, notifications preferences, landing view, timeout | `src/dashboard.js` saves to browser `localStorage` | None required (personal browser preferences) | No server endpoint for cross-device org preferences | Low: preferences are not organization financial data | Keep as local preferences and label/save scope honestly |
| Profile display name and email | Browser/local demo account storage; auth profile comes from Supabase session | No profile/settings API route found in inspected routes | Add profile endpoint only if shared org profile editing is required | Medium: local profile edit may look like persisted account data | Convert account fields to supported auth/profile API or make read-only; keep local UI preferences |
| Password/account controls | Demo account logic in dashboard JS; Supabase auth session also exists | Supabase Auth is separate from app API routes | No app backend route needed if Auth is the owner | High if demo-only controls appear for Supabase users | Keep Supabase Auth controls only in authenticated mode; hide demo account controls |

## Sidebar badges and notification bell

| UI element | current source (static / sample JS / API) | live endpoint that exists | missing backend work | risk | decision (convert / keep as labelled sample / remove) |
|---|---|---|---|---|---|
| Approvals badge | Local hard-coded queue count (initially 2) | `GET /api/approvals/pending-count` | No route gap; not wired in UI | Critical: fake outstanding approvals | Convert to org-scoped pending-count; zero means no badge |
| Notification bell/popover/count | Static notification items and count in HTML; preferences recalculate visibility, not live notification state | `GET /api/notifications`, `POST /api/notifications/:id/read|dismiss` | No route gap; frontend does not load or mutate API notifications | High: fake alerts and count | Convert to notification API; authenticated empty state “All clear” |

## Phase 1 summary

- Static inspection found existing server endpoints for most financial modules; the primary gaps are frontend wiring and removal/isolation of sample values, not proven backend route absence.
- No authenticated network response or matching database rows were inspected. Dashboard data wiring now exists, but its live tenant rows remain **UNVERIFIED** pending Phase 3 browser checks with an empty organization and an existing organization.
- Before Phase 2 starts, keep the no-code checkpoint and backup branch. Convert in the user's priority order, one module per local commit. Do not merge until the full live-data checklist is acceptable.
