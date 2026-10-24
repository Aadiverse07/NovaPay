# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24, Asia/Kolkata.
- Branch: `backend`; last commit `8a58723 WIP Phase 3 task 5: confirm webhook preflight`.
- Current phase/task: Phase 3 live verification, gate passed; final local phase commit recorded in `git log`.

## DONE
- Phase 3 verifier waits for terminal webhook state (`scripts/verify-phase3.js`, `server/src/services/webhookProcessor.js`); unit test covers initial/retry/terminal states (`server/test/webhook.test.js`).
- Refreshed public preflight passed: public `/api/status` 200; PayPal webhook URL matches; registered events include capture-completed, refund-completed, and invoice-paid.
- Corrected live run: real $1 USD order/capture, PayPal signature verified and event processed, raw body replayed 5x with one event row/one capture journal entry, refund completed with one refund journal entry.
- Five reports matched ledger; date boundary, CSV export/formula neutralization, safe Phase 2 subset, roles, RLS, RPC rights, tenant isolation, direct-write denials, FX checks passed.
- Cleanup removed this run's local operational rows; fixed fixtures and append-only audit/activity rows remain. Sandbox payment/refund remain in provider history.
- Invoice send remains SIMULATED; invoice-paid linkage is UNVERIFIED because no PayPal invoice ID exists.

## IN PROGRESS
- Final regression and hygiene gate, documentation update, then final local Phase 3 commit. No live action pending.

## NEXT STEPS
1. Phase gate complete: no FAIL items; only invoice-paid linkage is UNVERIFIED by the documented SIMULATED-send limitation.
2. Commit locally as `Phase 3: live verification (invoice send simulated)`. Do not push.
3. Report PASS/UNVERIFIED evidence, explain the invoice paid linkage limitation, ask whether to continue to Phase 4, and stop.

## USER ACTIONS PENDING
- None. Buyer approved the new order. Keep the tunnel and local server running if desired.

## LIVE STATE
- Migrations 0001–0004 reported applied; 0004 mismatch guard exercised.
- Tunnel hostname: `extension-italia-taken-emma.trycloudflare.com`; PayPal webhook points to `/api/webhook` and is subscribed to `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.REFUND.COMPLETED`, `INVOICING.INVOICE.PAID`.
- App listens on port 3000. Separate process on port 34872 was not modified.
- Latest run's local invoice/FX/reconciliation/event/order/capture/refund/transaction/approval/journal rows cleaned. Fixed fixtures and append-only audit/activity rows retained. External Sandbox payment/refund remain in provider history.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Live webhook preflight | PASS | 2026-10-24 | public status 200; exact URL/event list confirmed by read-only PayPal lookup |
| Phase 3 corrected live flow | PASS | 2026-10-24 | approved new order, capture COMPLETED, signed webhook verified/processed, refund COMPLETED |
| Webhook replay | PASS | 2026-10-24 | identical raw body/headers x5: HTTP 200 each; one event row, one capture journal entry |
| Reports/date/CSV | PASS | 2026-10-24 | five report totals matched ledger; period boundary and formula neutralization passed |
| Security/tenant/FX/roles/Phase 2 safe subset | PASS | 2026-10-24 | 8 RPC denies; 9 tenant tables/views; 4 direct write denies; service checks and Phase 2 subset passed |
| Invoice paid linkage | UNVERIFIED | 2026-10-24 | invoice send SIMULATED; no PayPal invoice ID; unit coverage exists |
| Local tests/migrations final rerun | PASS | 2026-10-24 | `npm test` 61/61; migration parse 0001–0004; all server/scripts syntax; hygiene pass |

## KNOWN ISSUES AND RISKS
- Real PayPal Invoicing send and signed `INVOICING.INVOICE.PAID` linkage remain unverified; sending stays SIMULATED.
- Cleanup cannot remove the Sandbox payment/refund from PayPal provider history; fixed test identities and append-only records remain.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; never edit an applied migration.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated; grant only service_role; prove ordinary JWT denial.
- PostgREST embeds need explicit FK names when relationships collide.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup deletes journal entries first; reuse fixed fixtures.
- US Personal Sandbox buyer, USD seller, Visa; webhook ID must match; raw body required for signature verification.
- PayPal invoice_number limit is 25 characters; immediate term is `DUE_ON_RECEIPT`; compare FX timestamps as instants.
- PayPal invoice create response ID extraction previously failed; invoice sending remains simulated.
- Webhook inbox insertion precedes async verification; poll terminal state before evaluating signature.
- Check port 3000 owner; leave unrelated port 34872 process and tunnel untouched.
- Never print `.env` values, provider response bodies, Authorization headers, or stack traces.

## DO NOT
- Do not push, edit frontend files, use force, weaken tests, edit applied migrations, commit `.env`, or call PayPal Invoicing APIs.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `node --check scripts/verify-phase3.js`
