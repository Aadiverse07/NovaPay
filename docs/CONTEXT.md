# NovaPay Context

## Header
- Date: 2026-11-02
- Branch: `codex/voice-assistant`
- Last commit: `6123148` (invoice auth-ready loading and retry state); Reports module is ready for the next local commit
- Current phase/task: Live-data integrity, Phase 2 Approvals API wiring and badge; Dashboard, Transactions, and Ledger source modules are complete.

## Done
- Read prior CONTEXT and WORKLOG tail before work.
- Created local checkpoint `79ccc6f` and backup branch `backup/live-data-audit-2026-11-02` at that commit.
- Completed static module/source/route audit in [LIVE-DATA-AUDIT.md](LIVE-DATA-AUDIT.md).
- Dashboard authenticated view loads report KPIs/cash movement and recent transactions from org-scoped APIs; static money/score values removed. Files: `src/dashboard-data.js`, `src/dashboard-live-data.js`, `src/dashboard.js`, `dashboard.html`. Focused test 4/4.
- Transactions wait for Supabase auth, replace sample DOM rows with API rows, and show empty/error states. AG Grid internals unchanged.
- Ledger sample rows and fake totals removed; authenticated ledger now loads API entries, shows empty/error/retry states, keeps currency-separated totals, and exports API rows. Files: `src/financial-live.js`, `src/modules.js`, `dashboard.html`. Latest focused financial tests: 7/7. Live tenant rows remain UNVERIFIED.
- Approvals now loads authenticated queue records and pending count from `/api/approvals` through `NovaPayApi`, paginates, refreshes on auth/view/mutation, routes persisted decisions through the server, and isolates sample proposals to explicit demo mode. Recent action list is labeled session-only. Files: `src/approvals-data.js`, `src/novapay-live.js`, `dashboard.html`; focused tests 3/3.
- Invoices already used org API routes; list now waits for Supabase auth and failure states show Retry and unavailable KPI markers instead of zero counts. No sample invoice rows are used. Files: `src/invoices-live.js`, `dashboard.html`; source tests 2/2.

## In Progress
- Phase 2 Reports API wiring is ready for local checkpoint; runtime browser/DB tenant verification remains UNVERIFIED. Next module is Documents.
- Phase 1 inspected source only. No authenticated browser or database verification was available, so live-data status remains UNVERIFIED.

## Next Steps
1. Commit Reports source wiring and tests locally.
2. Convert Documents, Community Funds, Maintenance, Notifications, then Settings, one module checkpoint each.
3. Add mapping/empty/error/tenant-source tests per module and log each actual run in TEST-REPORT.md.
4. Phase 3: browser-walk a new empty org and an existing org, hard refresh, verify API responses and matching tenant rows. If browser/live verification is unavailable or fails, stop before merge/push.
5. Only after Phase 3 is acceptable: secret scan, fetch/sync main, merge the completed branch, rerun tests, and push main as explicitly requested.

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
| Transactions live tenant/network rows | UNVERIFIED | 2026-11-02 | Browser/login unavailable |
| Dashboard authenticated network and tenant rows | UNVERIFIED | 2026-11-02 | Browser/login and matching Supabase rows unavailable |
| Authenticated module/network + DB verification | UNVERIFIED | 2026-11-02 | Browser unavailable and no test JWT used |
| npm test | UNVERIFIED | 2026-11-02 | Not run in this documentation-only audit step |

## Known Issues and Risks
- Community Funds and Maintenance sample markup, Notifications, Settings identity placeholders, and some dashboard modal/demo details still need review. Dashboard, Transactions, Ledger, Approvals, Invoices, and Reports use live API paths in source; runtime checks are pending.
- Authenticated runtime DB rows and organization scope have not been verified for converted modules; queue source correctness is covered only by code-level tests.
- API routes exist for most modules, but authenticated data and DB rows have not been verified in this audit.
- Existing known suite issue: `api-client.test.js` no-store assertion was previously reported; current suite not rerun here.

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
