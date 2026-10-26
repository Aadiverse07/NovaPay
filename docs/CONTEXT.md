# NovaPay Fund Wiring Handoff

## HEADER
- Updated: 2026-10-26 Asia/Kolkata.
- Branch: fund-wiring; base main at 874e2e5; local commits only, never push.
- Phase/task: T1 view 2 Maintenance implemented; next Transparency.

## DONE
- STEP 0: npm ci; npm test PASS 131/131; npm run check:migrations PASS 0001–0014; server restarted and /api/status HTTP 200.
- Fundraising live view: campaigns/summaries/transparency reads, create/pledge actions, explicit PayPal Sandbox order button, receipts subsection, empty/error/loading states, demo sample label.
- Maintenance live view: transparency expense rows plus current-tab request flow for actions available in contract; state graph, role gates, self/distinct reviewer disabling, simulated payment and evidence caution.

## IN PROGRESS
- Exact task: implement Transparency read-only view and audit CSV export; then T2 demo, T3 README, T4 verification and final local commit.
- Edited files: dashboard.html, src/fund-views.js, docs/CONTEXT.md, docs/WORKLOG.md, docs/TEST-REPORT.md, docs/DECISIONS.md.
- API limitation: no pre-payment requests/contractors/quotations GET. Requests created in Maintenance remain in memory for this dashboard tab; persisted payment rows use transparency.

## NEXT STEPS
1. Implement Transparency from GET /api/funds/transparency, display every gap and simulated state, expose safe returned evidence links only, add audit CSV for owner/admin.
2. Update docs and commit the Transparency view checkpoint.
3. Run API demo with fixed named users/existing data only; no PayPal order creation.
4. Add README real/simulated distinction and demo/run steps outside UI sections.
5. Run requested T4 checks, inspect protected-file diff, and commit locally.

## USER ACTIONS PENDING
- None currently. Browser-only checks will be listed with exact clicks at finish.

## LIVE STATE
- Prior handoff states migrations 0001–0014 applied; none changed.
- Server restarted on port 3000; /api/status HTTP 200, authenticated mode, integrations configured (keys not recorded).
- No T2 demo API calls yet; no new PayPal orders.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| npm ci | PASS | 2026-10-26 | `npm ci` |
| npm test | PASS 131/131 | 2026-10-26 | `npm test` |
| Migration syntax | PASS 14 files | 2026-10-26 | `npm run check:migrations` |
| API status before/after restart | PASS HTTP 200 | 2026-10-26 | `curl http://127.0.0.1:3000/api/status` |
| Fundraising browser/API view | UNVERIFIED | 2026-10-26 | Not opened/flowed in browser; final checks pending |
| Maintenance browser/API view | UNVERIFIED | 2026-10-26 | Not opened/flowed in browser; final checks pending |

## KNOWN ISSUES AND RISKS
- Browser auth helper has no org-role accessor. Write controls require trusted app_metadata org role; otherwise hidden. Backend enforces all permissions.
- Transparency API omits receipt identifiers; UI states when reference is not returned. No new receipt route added.
- Maintenance GET includes only payment rows; no pre-payment list routes. Current-tab requests/contractors/quotes are ephemeral. Persisted identity fields are privacy-redacted, so some reviewer/close actions remain disabled.
- PayPal order creation is explicit UI action; do not click in T2. Payouts are SIMULATED and do not send money or post ledger entries.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; errors roll everything back. Never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated; grant only service_role and prove ordinary JWT gets 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only/ON DELETE RESTRICT; cleanup journal_entries, audit_log, organizations, auth.users via scripts/cleanup-phase2-test-data.sql. Reuse fixed identities.
- PayPal Sandbox buyer is US Personal; seller USD only; webhook ends /api/webhook and PAYPAL_WEBHOOK_ID matches.
- Raw body is required for PayPal signature verification.
- Never print .env values; record key names only.

## DO NOT
- Never push; commit only on fund-wiring. Do not edit protected design files/assets.
- Do not create a PayPal order without explicit approval. Never include .env values.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short --branch`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
