# NovaPay Fund Wiring Handoff

## HEADER
- Updated: 2026-10-26 Asia/Kolkata.
- Branch: fund-wiring; base main at 874e2e5; local commits only, never push.
- Phase/task: T1 views, Fundraising checkpoint complete; next Maintenance.

## DONE
- Synced main and created fund-wiring; npm ci complete.
- npm test PASS 131/131; npm run check:migrations PASS for 0001–0014.
- Restarted server on port 3000; GET /api/status HTTP 200.
- Fundraising live view implemented in src/fund-views.js and loaded by dashboard.html. Authenticated view reads campaigns, per-campaign summaries and transparency contributions; pledge/order controls are explicit; demo keeps existing sample content and gets a local sample badge.

## IN PROGRESS
- Exact task: T1 Maintenance view, then Transparency view; no redesign.
- Files edited so far: dashboard.html, src/fund-views.js, docs/CONTEXT.md, docs/WORKLOG.md, docs/TEST-REPORT.md, docs/DECISIONS.md.
- Remaining: maintenance state machine/actions; transparency expense/gap/export view; T2 API demo; T3 README; T4 checks and final local commit.

## NEXT STEPS
1. Read only maintenance route contract/markup/backend state transitions.
2. Wire maintenance records via the canonical transparency read route and supported writes; disable illegal actions.
3. Checkpoint Maintenance; then wire Transparency and checkpoint.
4. Run API-level demo with fixed users and existing data only; do not create PayPal order.
5. Update README non-UI sections; perform T4 validation; commit locally.

## USER ACTIONS PENDING
- None at present; list manual browser checks at finish.

## LIVE STATE
- Prior handoff records migrations 0001–0014 applied; no migration changes here.
- Server at port 3000 restarted; `/api/status` HTTP 200 (authenticated mode, Supabase/PayPal/webhook configured, AI enabled). No values recorded.
- No demo API calls in this task; no new PayPal orders.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| npm ci | PASS | 2026-10-26 | `npm ci` |
| Initial npm test view | UNVERIFIED | 2026-10-26 | `npm test`; tool output truncated; corrected status recorded below |
| npm test rerun | PASS 131/131 | 2026-10-26 | `npm test` |
| Migration syntax | PASS 14 files | 2026-10-26 | `npm run check:migrations` |
| API before/after restart | PASS HTTP 200 | 2026-10-26 | `curl http://127.0.0.1:3000/api/status` |
| Fundraising browser/API view | UNVERIFIED | 2026-10-26 | No view-specific runtime check yet; T4 checks pending |

## KNOWN ISSUES AND RISKS
- Current browser auth helper exposes no organization role. Fundraising write controls are hidden unless trusted `app_metadata.organization_role` or `app_metadata.org_role` is present; server still enforces each endpoint.
- Current transparency read projection omits receipt numbers/issue times. UI shows only receipt identifiers when returned; otherwise it identifies the missing reference instead of inventing one.
- PayPal order creation requires an explicit button click; avoid that action in T2 demo.
- npm ci completed with 0 audited vulnerabilities; one install script was noted as pending approval.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; errors roll back everything. Never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs must revoke execute from public, anon, authenticated and grant only service_role; ordinary JWT should get 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only with ON DELETE RESTRICT; cleanup deletes journal_entries, audit_log, organizations, auth.users via scripts/cleanup-phase2-test-data.sql. Reuse fixed test identities.
- PayPal Sandbox buyer is US Personal; seller USD only; webhook ends /api/webhook and PAYPAL_WEBHOOK_ID matches.
- Raw body is required for PayPal signature verification.
- Never print .env values; record key names only.

## DO NOT
- Never push; commit only on fund-wiring. Do not edit protected design files/assets.
- Do not create a PayPal order without explicit approval. Do not include .env values.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short --branch`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
