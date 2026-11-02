# NovaPay Context

## Header
- Date: 2026-11-02
- Branch: `codex/voice-assistant`
- Last commit: `850d04b` (authenticated API no-store fix; local only)
- Current phase/task: Fix authenticated HTTP caching after Phase 2 source conversions; full suite now passes; Phase 3 browser/live-tenant verification pending.

## Done
- Read prior CONTEXT and WORKLOG tail before work.
- Created local checkpoint `79ccc6f` and backup branch `backup/live-data-audit-2026-11-02` at that commit.
- Completed static module/source/route audit in [LIVE-DATA-AUDIT.md](LIVE-DATA-AUDIT.md).
- Dashboard authenticated view loads report KPIs/cash movement and recent transactions from org-scoped APIs; static money/score values removed. Files: `src/dashboard-data.js`, `src/dashboard-live-data.js`, `src/dashboard.js`, `dashboard.html`. Focused test 4/4.
- Transactions wait for Supabase auth, replace sample DOM rows with API rows, and show empty/error states. AG Grid internals unchanged.
- Ledger sample rows and fake totals removed; authenticated ledger now loads API entries, shows empty/error/retry states, keeps currency-separated totals, and exports API rows. Files: `src/financial-live.js`, `src/modules.js`, `dashboard.html`. Latest focused financial tests: 7/7. Live tenant rows remain UNVERIFIED.
- Approvals now loads authenticated queue records and pending count from `/api/approvals` through `NovaPayApi`, paginates, refreshes on auth/view/mutation, routes persisted decisions through the server, and isolates sample proposals to explicit demo mode. Recent action list is labeled session-only. Files: `src/approvals-data.js`, `src/novapay-live.js`, `dashboard.html`; focused tests 3/3.
- Invoices already used org API routes; list waits for Supabase auth and failure states show Retry/unavailable markers. No sample rows.
- Community Funds and Maintenance use org APIs; added transparency expense evidence, retry/refresh hooks, demo sample dismissal, and hid static fundraising/maintenance cards in authenticated mode. Files: `src/fund-views.js`; focused fund/maintenance tests pass.
- Notifications bell now fetches `/api/notifications`, renders unread counts, opens the mapped module, and marks read using the existing endpoint. Files: `src/notifications-live.js`, `dashboard.html`, `src/dashboard.js`.
- Dashboard legacy transaction fixtures and local refund simulation are demo-only; transaction-detail AI errors no longer echo DOM fields or create fake proposals. Browser export no longer invents owner/INR values.
- Settings role comes from onboarding membership, profile name updates through Supabase Auth metadata, password updates use the existing Auth method, and account deletion is unavailable in signed-in mode because no deletion endpoint exists. Preferences remain browser-local.

## In Progress
- Phase 2 source conversions are committed locally in `25659b1`; not pushed. Full focused live-data suite passed 32/32. `npm test` now passes 342/342 after the shared client began forcing no-store on authenticated requests.
- Chrome is present but browser use is disabled in Work settings; no authenticated browser or live Supabase DB verification was performed. Every live-row claim remains UNVERIFIED.

## Next Steps
1. Continue Phase 3 browser/live tenant checks; do not push until they pass.
2. Human runs the judge browser checklist with a fixed empty org and an existing org; capture API/DB evidence.
3. Phase 3: browser-walk both orgs, hard refresh, verify API responses and matching tenant rows. If browser/live verification is unavailable or fails, stop before merge/push.
4. Only after Phase 3 is acceptable: secret scan, fetch/sync main, merge the completed branch, rerun tests, and push main as explicitly requested.

## User Actions Pending
- None for Phase 1. Browser access/test sessions will be needed for Phase 3 if the local browser surface remains unavailable.

## Live State
- Supabase migration state: not checked during this audit; no migrations run.
- Tunnel/webhook: not checked.
- Authenticated financial API tests: none run in this phase.
- Public server status was checked in earlier work only; it does not verify financial rows.
- Secret handling: no .env values printed.

## Test State
| Check | Status | Date | Command/reason |
|---|---|---|---|
| Phase 1 source audit | PASS | 2026-11-02 | Read-only inspection; endpoint existence is not treated as runtime proof |
| Dashboard data mapping | PASS | 2026-11-02 | `node --test server/test/dashboard-live-data.test.js`: 4/4 |
| Transactions mapping and API-only source | PASS | 2026-11-02 | `node --test server/test/transactions-ledger-live.test.js`: 6/6; later expanded Ledger rerun 7/7 |
| Ledger empty/error/API export mapping | PASS | 2026-11-02 | `node --test server/test/transactions-ledger-live.test.js` (rerun): 7/7 |
| Approvals mapping/API source/demo isolation | PASS | 2026-11-02 | `node --test server/test/approvals-live-data.test.js`: 3/3; combined focused modules 14/14 |
| Invoice API-only list/auth/error state | PASS | 2026-11-02 | `node --test server/test/invoices-live-source.test.js`: 2/2 |
| Reports API aggregation/empty/error source | PASS | 2026-11-02 | `node --test server/test/reports-live-data.test.js`: 3/3; combined focused modules 19/19 |
| Documents API/auth/reasons/delete source | PASS | 2026-11-02 | `node --test server/test/documents-live-source.test.js`: 3/3; combined focused modules 22/22 |
| Fund, maintenance, notification, settings source and role tests | PASS | 2026-11-02 | `node --test server/test/dashboard-demo-isolation.test.js server/test/notifications-live-source.test.js server/test/fund-campaign-live-view.test.js server/test/maintenance-live-wiring.test.js`: 11/11 |
| Full focused live-data suite | PASS | 2026-11-02 | 32 tests passed; see newest TEST-REPORT entry |
| Transactions live tenant/network rows | UNVERIFIED | 2026-11-02 | Browser/login unavailable |
| Dashboard authenticated network and tenant rows | UNVERIFIED | 2026-11-02 | Browser/login and matching Supabase rows unavailable |
| Authenticated module/network + DB verification | UNVERIFIED | 2026-11-02 | Chrome is present but browser use is disabled in Work settings; no live tenant rows inspected |
| npm test | PASS | 2026-11-02 | 342/342; no-store GET assertion retained and POST assertion added |
| `npm run check:migrations` | PASS | 2026-11-02 | 21/21 migration files syntax-checked; no migration applied |
| Changed JS syntax + `git diff --check` | PASS | 2026-11-02 | `node --check` for all changed JS/tests; whitespace check passed |

## Known Issues and Risks
- Settings display-name edits remain browser-local and profile/password functionality requires a careful auth-backed pass; do not claim shared profile persistence. Dashboard demo fixtures remain in code but are explicitly gated to demo mode. Documents have no signed-original URL route in the inspected backend; a new feature endpoint was not added in this module. Dashboard, Transactions, Ledger, Approvals, Invoices, and Reports use live API paths in source; runtime checks are pending.
- Authenticated runtime DB rows and organization scope have not been verified for converted modules; source tests are not proof of live tenant data. Browser tool is disabled in Work settings.
- API routes exist for most modules, but authenticated data and DB rows have not been verified in this audit.
- Known suite issue: `server/test/api-client.test.js` expects `Cache-Control: no-store`, but receives `undefined`; this is the only full-suite failure (341/342).

## Lessons Learned
- Supabase SQL Editor runs inside one transaction; a syntax or runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary user JWT receives 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only and ON DELETE RESTRICT; cleanup journal_entries first, then audit_log, organizations, auth.users, via `scripts/cleanup-phase2-test-data.sql`; reuse fixed named test identities.
- PayPal sandbox buyer must be a US Personal account; seller USD only; use Visa at checkout; webhook URL ends `/api/webhook` and PAYPAL_WEBHOOK_ID matches.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.
- For data claims, distinguish source/API wiring from authenticated network and database verification.

## Do Not
- Do not push or merge until Phase 3 is acceptable.
- Do not touch OTP/auth, voice assistant, Gemini key pool, AI context memory, AG Grid internals, PayPal auth flow, protected design files, or assets.
- Do not show sample amounts/rows as organization data or mix sample and live money totals.
- Do not run migrations without documenting the exact SQL and getting the user's application confirmation.

## Resume Commands
```sh
git status --short
git branch --show-current
npm test
npm run check:migrations
```
