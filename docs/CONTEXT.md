# NovaPay Fund Wiring Handoff

## HEADER
- Updated: 2026-10-26 Asia/Kolkata.
- Branch: fund-wiring; base main at 874e2e5; local commits only, never push.
- Phase/task: frontend wiring, STEP 0 complete; T1 view 1 (Fundraising) pending.

## DONE
- Synced main and created fund-wiring; server dependencies installed with npm ci.
- Baseline npm test PASS 131/131; npm run check:migrations PASS for 0001–0014.
- Restarted port 3000 server; GET /api/status HTTP 200, authenticated mode, Supabase and PayPal configured (no values recorded).

## IN PROGRESS
- Exact task: wire Fundraising, Maintenance, Transparency views from the API contract, preserving teammate styling.
- Files being inspected: docs/FRONTEND-CONTRACT.md, src/api-client.js, dashboard.html, preview.html, relevant src JS files. No UI implementation edits yet.
- Remaining: T1 three view checkpoints; T2 API demo; T3 README; T4 validation/docs/local commit.

## NEXT STEPS
1. Inspect API client, contract route shapes, role/session state and current view handlers.
2. Wire Fundraising only; add loading/empty/error states and role-aware controls; checkpoint docs and commit.
3. Wire Maintenance, then Transparency with separate checkpoints/commits.
4. Run API-level demo using fixed named users and existing data only; never create a PayPal order.
5. Update README non-UI sections, run T4 checks, review protected-file diff and commit locally.

## USER ACTIONS PENDING
- None now. Browser-only manual checks will be listed with exact clicks at finish.

## LIVE STATE
- Migrations 0001–0014 are recorded as applied in the prior handoff; no migrations changed here.
- Server on port 3000 restarted and /api/status returned 200; mode authenticated, Supabase/PayPal/webhook configured, AI enabled. No secrets recorded.
- No Phase 6 demo API calls run in this task yet. Do not create a PayPal order without user approval.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| npm ci | PASS | 2026-10-26 | `npm ci` |
| Initial npm test invocation | UNVERIFIED | 2026-10-26 | `npm test`; tool summary truncated and shell journal line malformed |
| npm test rerun | PASS, 131/131 | 2026-10-26 | `npm test` |
| Migration syntax | PASS, 14 files | 2026-10-26 | `npm run check:migrations` |
| Initial API status | PASS, HTTP 200 | 2026-10-26 | `curl http://127.0.0.1:3000/api/status` |
| Restarted API status | PASS, HTTP 200 | 2026-10-26 | `npm start`; GET `/api/status` |

## KNOWN ISSUES AND RISKS
- Demo/live identity access depends on fixed named test users; use existing records only.
- PayPal order creation is explicitly prohibited without user approval; payouts/invoice send may be simulated.
- `npm ci` reported one dependency install script pending approval; install completed with 0 audited vulnerabilities.
- Historical docs include earlier phases; the pointer above is authoritative for current work.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; errors roll back everything. Never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs must revoke execute from public, anon, authenticated and grant only service_role; prove ordinary JWT gets 403.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only with ON DELETE RESTRICT; test cleanup deletes journal_entries first, then audit_log, organizations, auth.users using scripts/cleanup-phase2-test-data.sql. Reuse fixed test identities.
- PayPal Sandbox buyer is US Personal; seller USD only; webhook ends /api/webhook and PAYPAL_WEBHOOK_ID matches.
- Raw body is required for PayPal signature verification.
- Never print .env values; record key names only.

## DO NOT
- Never push; commit only on fund-wiring. Never touch protected design files or assets.
- No new PayPal order absent approval; no .env values in output or commits.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short --branch`
- `npm test`
- `npm run check:migrations`
- `git diff --check`
