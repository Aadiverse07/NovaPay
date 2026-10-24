# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24 (Asia/Kolkata)
- Branch: `backend`
- Last commit before handoff: `c453510` (`WIP Phase 3 task 2: record verification gate`)
- Current phase/task: Phase 3 live verification; `scripts/verify-phase3.js` mid-verification, paused after live attempts and before further PayPal activity diagnostics.

## DONE
- Phase 2 and prior Phase 3 implementation are in earlier commits; Phase 2 live data inventory found no completed captures/refunds in the live project.
- Phase 3 hardening WIP at `f531c4c`: CSV formula neutralization, invoice paid amount/currency guard migration 0004, webhook mismatch handling, tests, and verifier.
- User reports 0004 applied; live mismatch assertion passed on a verifier-created invoice.
- Current local test run after invoice contract changes: 54 passed; migrations 0001–0004 parsed.
- Live checks passed: 8 invoice RPCs denied to ordinary JWT (403); service-role controlled RPC assertions 11/11; nine own/cross-tenant reads isolated; four direct writes denied; invoice totals recalculated; viewer denied create/send; accountant could create but not approve; reports/date filters/CSV and formula neutralization; 9/9 Phase 2 tables and protected trial-balance/reconciliation requests.

## IN PROGRESS
- Files changed since last checkpoint: `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`, `docs/FRONTEND-CONTRACT.md`, `scripts/verify-phase3.js`, `server/src/routes/invoices.js`, `server/src/services/invoices.js`, `server/test/phase3-services.test.js`.
- `scripts/verify-phase3.js` still compares FX timestamp strings literally. Latest live call returned equal rates and HTTP 200 twice, but timestamp strings differed; compare `Date.parse()` values before rerunning.
- PayPal invoice action returned HTTP 502. Safe `api_activity` query showed invoice-create statuses 201 and 400 but did not yet identify which attempt/current stage; checking whether send endpoint failed or a draft remains in Sandbox. No browser payment step occurred.
- PayPal draft request now uses a 23-character test invoice number, route limit is 25 characters, and `DUE_ON_RECEIPT` is included. These changes passed local tests; live success is not yet confirmed.
- Potential external PayPal draft may exist after a 201 create response. Script cleanup removes local run-created rows, not provider-side drafts; inspect Sandbox before retrying.

## NEXT STEPS
1. Inspect only route/status text in the dedicated org's `api_activity`; determine whether `/send` failed and whether a Sandbox draft exists. Do not print provider response bodies.
2. Fix the FX assertion to compare timestamps as instants; rerun `npm test`, migration parser, syntax, and hygiene checks.
3. Resume the verifier with the buyer email supplied in chat only as a process environment variable. If send succeeds, provide its payer URL and wait for user to pay.
4. After payment, verify signed webhook, 5x replay, status change, and cleanup. Append every result to `docs/TEST-REPORT.md`.
5. Phase 3 remains incomplete while any required check is FAIL or UNVERIFIED; do not make the final phase commit or push.

## USER ACTIONS PENDING
- If the verifier prints a Sandbox payer URL, pay the invoice as the US Personal Sandbox buyer in the browser, then return and enter `paid` at the verifier prompt.
- Ensure the PayPal webhook remains subscribed to `INVOICING.INVOICE.PAID` and capture/refund events.
- Keep the tunnel and port-3000 server running during webhook verification.

## LIVE STATE
- Migrations 0001/0002 previously verified applied; 0003 user-reported applied and its objects previously returned HTTP 200; 0004 user-reported applied and its amount-mismatch behavior passed live.
- User reports the tunnel/webhook are configured at the current trycloudflare URL. Ngrok/cloudflare configuration was not changed.
- Port 3000: stale Node process was restarted; `npm start` now runs `node server/index.js` from this checkout (tool session 3735). Keep it running.
- Port 34872: separate Node listener in the same repo checkout (PID observed as 20134); purpose not established. It did not own port 3000 and was left untouched to avoid disrupting unrelated work.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`. No key values recorded.

## TEST STATE
| Check | Status | Date | Evidence / command |
|---|---|---|---|
| Unit suite | PASS | 2026-10-24 | `npm test` — 54 passed, 0 failed |
| Migration parser | PASS | 2026-10-24 | `npm run check:migrations` — 0001–0004 parse |
| JS syntax/diff/frontend/env hygiene | PASS | 2026-10-24 | `node --check` all server/scripts; `git diff --check`; no frontend paths; `.env` ignored/untracked |
| Live auth/RPC/RLS/direct writes | PASS | 2026-10-24 | verifier: 8/8 JWT RPC denials, 11/11 service assertions, tenant isolation, 4/4 writes denied |
| Invoice roles/totals and report routes | PASS | 2026-10-24 | viewer/accountant checks, server totals, five reports, date filters, CSV neutralization |
| FX live cache | FAIL | 2026-10-24 | both HTTP 200 and rates equal; verifier's string timestamp equality failed |
| PayPal invoice send / paid webhook | UNVERIFIED | 2026-10-24 | API returned 502; no browser payment or signed paid event |
| Real Phase 2 capture/refund report totals | UNVERIFIED | 2026-10-24 | live inventory had zero completed captures/refunds |
| Run cleanup | PASS, scoped | 2026-10-24 | verifier reported local invoices/events/FX removed; fixed users/orgs and audit rows retained; possible PayPal draft requires dashboard check |

## KNOWN ISSUES AND RISKS
- Live verifier currently has a FAIL due to incorrect timestamp-string comparison; compare parsed instants, do not weaken the check.
- Invoice send is not confirmed. Provider-side draft may remain after a successful create; check Sandbox before repeating.
- The old server process initially produced generic 405/404 fallbacks because it started before the Phase 3 route commit. It was restarted. RPC 403s are expected security denials, not that stale-process issue.
- No historical capture/refund data exists for the required real-data report comparison.
- Continuity test reports are append-only. Audit rows and fixed fixture users/orgs remain by design.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime errors roll everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER/posting RPC must revoke execute from public, anon, authenticated and grant only service_role; test with ordinary JWT.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- `audit_log` is insert-only with ON DELETE RESTRICT; cleanup must remove journal_entries first, then audit rows/organizations/auth users in manual test cleanup. Reuse fixed test fixtures.
- Sandbox buyer must be US Personal; seller USD; Visa; webhook URL ends `/api/webhook`; webhook ID must match. Raw body is required for PayPal signature verification.
- Current PayPal Invoicing docs cap `invoice_number` at 25 characters; create request includes `detail.payment_term.term_type: DUE_ON_RECEIPT`.
- FX timestamps can serialize differently while representing the same instant; compare parsed date values.
- A local app restart can be required after route changes; verify the PID owning port 3000 and its start time. Do not kill unrelated listeners.
- Never print `.env` values or full provider responses.

## DO NOT
- Do not push; do not touch frontend source; do not use force; do not weaken tests; do not edit applied migrations; never commit `.env` or secrets.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `node --check scripts/verify-phase3.js`
