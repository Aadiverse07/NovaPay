# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24, Asia/Kolkata.
- Branch: `backend`; latest commit before current WIP `2bda738 WIP Phase 3: reconcile Sandbox invoice drafts`; verifier/docs changes are uncommitted and ready for checkpoint.
- Current phase/task: Phase 3 live verification, one real sandbox order/capture/refund and report parity.

## DONE
- Phase 2/3 implementation and Phase 3 verifier exist. Phase 3 isn't closed yet.
- User reports migrations 0001–0004 applied. Prior live checks covered Phase 3 security, roles, FX, report/CSV routes, and simulated invoice approval.
- Sandbox drafts are harmless. User supplied invoice number `P3-644ca6d7c8694695b51e`; no local record remains. Earlier create succeeded but ID extraction failed before `/send`.
- Decision logged: keep invoice sending SIMULATED; local approval gate/tracking verified, real Invoicing send is a known limitation. No more PayPal Invoicing calls.
- Phase 3 verifier adapted locally to make one real $1 order, wait for buyer approval, capture, verify/replay signed webhook, refund, compare reports to ledger, and clean exact run records.

## IN PROGRESS
- `scripts/verify-phase3.js`: local tests pass after payment/report changes; live preflight and order creation pending. User must approve the buyer purchase before capture/refund.
- Paid linkage: verifier will mark UNVERIFIED if simulated invoice lacks a real PayPal invoice ID. Existing tests cover simulated send with `paypalInvoiceId:null` and webhook amount mismatch handling.

## NEXT STEPS
1. Read-only preflight: branch/status, `.env.example` placeholders, `/api/status`, Supabase fixed Org A and test-table availability/counts; never print env values.
2. Run `NOVAPAY_PHASE3_0004_APPLIED=true node scripts/verify-phase3.js` with ignored env `NOVAPAY_PHASE3_BUYER_EMAIL` set to the supplied US buyer. The script must make no Invoicing API calls.
3. On approval URL: print plain text and wait. After user replies `approved`, continue capture, signed webhook, raw-body replay, refund, report parity, boundaries, CSV, and safe Phase 2 subset.
4. Confirm paid-linkage limitation, clean only this run's rows, preserve fixed identities and append-only audit/activity. Record actual leftovers.
5. Update all three continuity files. Run all tests and migration checks. Commit locally as `Phase 3: live verification (invoice send simulated)` only if no FAIL; do not push. Report and ask whether to continue Phase 4.

## USER ACTIONS PENDING
- Open the new order approval URL, sign in as US Personal Sandbox buyer `sb-jzrsh53532685@personal.example.com`, approve $1 with Visa, then reply exactly `approved`.
- Do not send or delete invoice drafts. No more PayPal Invoicing calls.

## LIVE STATE
- Migrations 0001/0002 previously verified; user reports 0003/0004 applied. Tunnel/webhook user-managed and unchanged.
- Do not restart server/tunnel unless necessary. Previous separate process on port 34872 is unrelated.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.
- No order created in this resumed run yet. Earlier fixed Phase 3 org inventory had no capture/refund or verified invoice-paid event rows.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Branch | PASS | 2026-10-24 | `git branch --show-current` = `backend`; latest commit `2bda738` |
| Unit suite | PASS | 2026-10-24 | `npm test`; 60 passed, 0 failed |
| Migration parser | PASS | 2026-10-24 | `npm run check:migrations`; 0001–0004 parse |
| Verifier syntax/hygiene | PASS | 2026-10-24 | `node --check scripts/verify-phase3.js`; `git diff --check`; frontend diff empty; `.env` ignored/untracked |
| Local invoice simulated approval | PASS, prior run | 2026-10-24 | live verifier; no PayPal create/send call |
| Real capture/refund/report equality | UNVERIFIED | 2026-10-24 | New gated live run pending buyer approval |
| Real Invoicing send / invoice paid linkage | UNVERIFIED | 2026-10-24 | SIMULATED mode; no real invoice ID/event |

## KNOWN ISSUES AND RISKS
- Existing Sandbox drafts remain; stop reconciliation and do not call PayPal Invoicing.
- Reports need a fresh capture/refund in fixed Phase 3 Org A.
- `mark_invoice_paid` looks up an actual PayPal invoice ID. Simulated invoice has none; capture-to-invoice trigger only links an invoice already carrying that payment ID.
- Cleanup must use exact run IDs. Keep fixed test identities/orgs and append-only audit/activity rows; external Sandbox order/refund remain in provider history.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; errors roll back. Never edit an applied migration; add a numbered file.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated and grant only service_role; test ordinary JWT denial.
- PostgREST embeds need explicit foreign-key names when relationships collide.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup journal entries before related rows and never delete fixed fixtures.
- Sandbox buyer must be US Personal; seller USD; Visa; webhook URL ends `/api/webhook`; webhook ID must match. Raw body is required for signature verification.
- PayPal invoice_number max 25; immediate term `DUE_ON_RECEIPT`; compare FX timestamps as instants.
- Check port 3000 owner before restart; leave unrelated port 34872/tunnel untouched.
- Never print `.env` values, provider bodies, Authorization headers, or stack traces.

## DO NOT
- Do not push, touch frontend files, use force, weaken tests, edit applied migrations, commit `.env`, or call PayPal Invoicing endpoints.
- Never claim a simulated invoice was sent/paid.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `node --check scripts/verify-phase3.js`
