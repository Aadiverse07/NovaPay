# NovaPay Context

## Header
- Date: 2026-11-02
- Branch: `codex/voice-assistant`
- Last commit: `79ccc6f` (pre-audit checkpoint; audit documentation is pending local commit)
- Current phase/task: Live-data integrity, Phase 2 Dashboard module checkpoint complete; next is Transactions.

## Done
- Read prior CONTEXT and WORKLOG tail before work.
- Created local checkpoint `79ccc6f` and backup branch `backup/live-data-audit-2026-11-02` at that commit.
- Completed static module/source/route audit in [LIVE-DATA-AUDIT.md](LIVE-DATA-AUDIT.md).
- Dashboard authenticated view now loads report KPIs and cash movement plus recent transactions from org-scoped APIs; removed static money/score values and added currency-safe mapping in `src/dashboard-data.js`, `src/dashboard-live-data.js`, `src/dashboard.js`, and `dashboard.html`.
- Focused dashboard tests: 4/4 pass (`node --test server/test/dashboard-live-data.test.js`). Live tenant rows remain UNVERIFIED.

## In Progress
- Phase 2 Dashboard source changes and docs are ready for a local module commit; then convert Transactions sample/live mixing.
- Phase 1 inspected source only. No authenticated browser or database verification was available, so live-data status remains UNVERIFIED.

## Next Steps
1. Review and commit the Dashboard module checkpoint locally.
2. Convert Transactions: remove sample rows from authenticated mode while preserving AG Grid and API hydration; add loading/empty/error states.
3. Add module-level mapping/empty/error/tenant-isolation tests, run tests, and append exact results to TEST-REPORT.md.
4. Continue in user priority order, one local commit per module; keep AG Grid, PayPal sandbox, OTP/auth, voice, AI memory and Gemini pool untouched.
5. Phase 3: browser-walk empty and existing orgs, hard refresh, verify API responses and matching tenant rows. If browser/live verification is unavailable or fails, stop before merge/push.
6. Only after Phase 3 is acceptable: secret scan, fetch/sync main, merge the completed branch, rerun tests, and push main as explicitly requested.

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
| Dashboard authenticated network and tenant rows | UNVERIFIED | 2026-11-02 | Browser/login and matching Supabase rows unavailable |
| Authenticated module/network + DB verification | UNVERIFIED | 2026-11-02 | Browser unavailable and no test JWT used |
| npm test | UNVERIFIED | 2026-11-02 | Not run in this documentation-only audit step |

## Known Issues and Risks
- Reports values/exports, approvals queue/badge, notification popover/count, transaction sample rows, and ledger sample rows still contain or retain demo content in authenticated rendering paths. Dashboard is converted in source; its runtime API check is pending.
- The existing transaction and ledger hydration code can combine API data with samples; empty orgs can display nonzero demo values.
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
