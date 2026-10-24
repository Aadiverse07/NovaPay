# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24, Asia/Kolkata.
- Branch: `backend`; last commit: `d791462 WIP Phase 3 task 5: record simulated verification`.
- Current phase/task: Phase 3 live verification, reconciling existing Sandbox invoice drafts before any further provider action.

## DONE
- Phase 2 and Phase 3 backend implementation exists in the repository; Phase 3 is not complete because real invoice payment/paid-webhook linkage and real capture/refund report comparisons are unverified.
- User reports migrations 0001–0004 applied. Prior live checks found the expected objects and exercised the 0004 guard.
- Phase 3 verifier and simulated invoice sending are implemented: `scripts/verify-phase3.js`, `server/src/services/invoices.js`, `server/src/routes/invoices.js`.
- Local Phase 3 regression gate: 60 unit tests passed; migrations 0001–0004 parsed; JS syntax and frontend/secrets hygiene passed (see `docs/TEST-REPORT.md`).
- This reconciliation used read-only Supabase queries. The supplied `P3-644ca6d7c8694695b51e` has no local invoice row. Activity markers show a prior PayPal create success followed by ID extraction failure, no send call, and a later simulated send marker.

## IN PROGRESS
- Reconcile user's reported Sandbox drafts to verifier create attempts. The supplied value matches verifier invoice-number format (`P3-` + 20 hex chars), but no local row or activity correlation field remains to prove an exact match. Other drafts were not inspected. Sending stays SIMULATED.

## NEXT STEPS
1. Do not call PayPal create, send, get, or delete endpoints for invoice reconciliation; retain SIMULATED mode.
2. If the user wants exact matching, ask them to inspect each remaining draft's invoice number, item, recipient, amount, and activity. Compare only with available local records; explain that cleaned-up request IDs may make exact attribution impossible.
3. Keep real capture/refund report totals and signed paid-webhook linkage UNVERIFIED until valid sandbox data exists.
4. If resuming Phase 3 later, run local regression checks and only the explicitly authorized safe live checks. Never imply a draft was sent or paid.

## USER ACTIONS PENDING
- No browser payment or PayPal action is requested now. User has inspected one draft and reports several others; no invoice was sent or deleted.
- Keep invoice sending in SIMULATED mode until reconciliation is complete. Do not delete drafts without explicit instruction.
- For exact reconciliation, user may inspect other drafts and provide their invoice numbers and visible details; do not ask them to send or pay one.

## LIVE STATE
- Migrations 0001/0002 previously verified; user reports 0003/0004 applied. Tunnel/webhook configuration is user-managed and was not touched in this reconciliation.
- Port 3000 app and separate port 34872 process were not started, stopped, or restarted in this task.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.
- No PayPal API calls or database writes were made in this reconciliation. Read-only queries used the fixed Phase 3 verifier org and selected only exact invoice fields/stage markers.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Branch and worktree | PASS | 2026-10-24 | `git branch --show-current`, `git status`, `git log`; branch `backend`, HEAD `d791462` |
| Local unit suite | PASS (latest recorded) | 2026-10-24 | `npm test`; 60 passed, 0 failed, before this docs-only reconciliation |
| Migration parser | PASS (latest recorded) | 2026-10-24 | `npm run check:migrations`; migrations 0001–0004 parsed |
| Exact local invoice-number lookup | PASS | 2026-10-24 | Read-only Supabase query; HTTP 200, 0 matching local rows |
| Safe invoice activity review | PASS | 2026-10-24 | Read-only Supabase query; create success, extraction failure, no send marker, later simulated marker |
| Exact external draft attribution | UNVERIFIED | 2026-10-24 | Provider request record did not retain invoice number/ID; local verifier row was cleaned |
| Real capture/report totals and signed paid linkage | UNVERIFIED | 2026-10-24 | Existing live inventory had no capture/refund/paid event rows |
| PayPal API calls / writes / deletes in this task | PASS: none | 2026-10-24 | No PayPal endpoints called; Supabase queries were GET only |

## KNOWN ISSUES AND RISKS
- Several Sandbox drafts may remain. The user examined one; it was Draft for $1.00 and was not sent/deleted.
- Supplied `P3-644ca6d7c8694695b51e` is consistent with the verifier-generated custom invoice number, but exact association is unprovable because local cleanup removed the row and safe activity contains only stage/status markers.
- The prior live create succeeded but ID extraction failed before `/send`; no buyer URL was produced. Do not call that draft sent.
- Real capture, refund, ledger comparison, and `INVOICING.INVOICE.PAID` linkage remain unverified.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; errors roll everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant it only to service_role; prove denial using an ordinary JWT.
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup deletes journal_entries first (lines cascade), then audit_log, organizations, auth.users. Reuse fixed named fixtures; cleanup SQL is manual/destructive.
- PayPal sandbox buyer must be US Personal; seller USD; Visa at checkout; webhook URL ends `/api/webhook` and webhook ID must match.
- Raw body is needed for PayPal signature verification.
- PayPal invoice_number limit is 25 characters; immediate term is `DUE_ON_RECEIPT`.
- Compare FX timestamps as instants, not serialized strings.
- Check port-3000 process before restarting; leave unrelated port 34872 and tunnel alone.
- Verifier-created local invoice rows are cleaned up; retain enough nonsecret correlation data if future reconciliation needs exact provider attribution.
- Never print `.env` values, full provider responses, authorization headers, or stack traces.

## DO NOT
- Do not push; touch no frontend files; use no force; weaken tests; edit applied migrations; commit `.env`; or send/delete/create PayPal invoices while reconciliation remains incomplete.
- Do not treat a Draft as sent or paid.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `node --check scripts/verify-phase3.js`
