# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24, Asia/Kolkata.
- Branch: `backend`; last commit `a710e83 WIP Phase 3 task 2: live report verifier`.
- Current phase/task: Phase 3 live verification, rechecking user-restored tunnel before order creation.

## DONE
- Phase 2/3 implementation and Phase 3 verifier exist. Phase 3 is not closed.
- User reports migrations 0001–0004 applied. Prior live checks covered security/roles, FX, report/CSV routes, and simulated invoice approval.
- Sandbox drafts are harmless. Supplied `P3-644ca6d7c8694695b51e` had no local row. Earlier PayPal invoice create succeeded but ID extraction failed before send.
- Decision recorded: invoice sending remains SIMULATED; approval gate/local tracking verified, real Invoicing send is a known limitation. No more PayPal Invoicing calls.
- Verifier locally adapted for real $1 order/capture/refund, signed webhook replay, report parity, and exact run cleanup. `npm test` 60/60 and migration check pass.
- PayPal read-only webhook GET confirms registration endpoint `https://relevant-quick-vbulletin-inclusion.trycloudflare.com/api/webhook` and capture/refund/invoice-paid events.

## IN PROGRESS
- `scripts/verify-phase3.js`: new tunnel preflight passed. First run passed security/tenant/FX/roles and created one $1 order, but exited after printing approval URL because `createInterface` was missing; no approval/capture/refund happened. `paused` prevented cleanup. Fix import/pause ordering, inventory this run’s rows and reuse its pending order if safe.

## NEXT STEPS
1. Verify new public `/api/status`, DNS and registered webhook URL/event types using GET only.
2. If they match, run `NOVAPAY_PHASE3_0004_APPLIED=true node scripts/verify-phase3.js` with ignored `NOVAPAY_PHASE3_BUYER_EMAIL` and public `NOVAPAY_WEBHOOK_URL`. This path makes no PayPal Invoicing calls.
3. When order URL appears, user opens it, signs in as US Personal buyer `sb-jzrsh53532685@personal.example.com`, approves $1 with Visa, replies `approved`; continue capture, signed event/replay, refund, reports, date boundaries, CSV, safe Phase 2 subset.
5. Mark simulated invoice paid linkage UNVERIFIED, clean only exact run rows, preserve fixed users/orgs and append-only audit/activity. Run final tests/migration check; update docs. Commit final locally only if no FAIL. Never push. Ask whether to continue Phase 4.

## USER ACTIONS PENDING
- User reports tunnel and webhook URL updated. Verify this first.
- After a new approval URL is generated, approve the $1 order in browser and reply `approved`.
- Do not send/delete existing invoice drafts.

## LIVE STATE
- Migrations 0001/0002 previously verified; user reports 0003/0004 applied.
- Tunnel process PID 17036: `cloudflared tunnel --url http://localhost:3000`. Registered hostname does not resolve; `dig google.com` resolves. Local app was absent, then started with `npm start` and local `/api/status` returns 200. No tunnel settings changed.
- Fixed Phase 3 Org A read-only counts before this run: orders/captures/transactions/journal entries/approvals/events all 0; 7 prior reconciliation runs.
- One $1 `PAYER_ACTION_REQUIRED` order remains, exactly one. First failed run’s four invoices/approvals/events and FX row were cleaned; second run recreated verifier rows, then exited because no TTY. Clean its exact rows before PTY rerun. Same single pending order remains reusable; no new provider create. No PayPal Invoicing calls.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Branch | PASS | 2026-10-24 | `git branch --show-current` = `backend`; latest commit `a710e83` |
| Unit suite | PASS | 2026-10-24 | `npm test`; 60 passed, 0 failed |
| Migrations | PASS | 2026-10-24 | `npm run check:migrations`; 0001–0004 parsed |
| Verifier syntax/hygiene | PASS | 2026-10-24 | `node --check scripts/verify-phase3.js`, `git diff --check`, frontend diff empty, `.env` ignored/untracked |
| Local app | PASS | 2026-10-24 | `npm start`; `GET /api/status` HTTP 200 |
| Registered webhook reachability | PASS | 2026-10-24 | Public `/api/status` HTTP 200; DNS resolves; registered webhook URL and capture/refund events match |
| Real capture/refund/report parity | UNVERIFIED | 2026-10-24 | First run stopped after order creation due missing `createInterface`; no buyer approval |
| Live verifier pause | FAIL then fixed | 2026-10-24 | Missing import fixed; then no-TTY unsettled top-level await; use PTY; no payment |
| Failed-run local cleanup | PASS | 2026-10-24 | 4 P3 invoices/related rows and 1 FX row removed; 1 unpaid order retained for idempotent reuse |
| Real Invoicing send/paid linkage | UNVERIFIED | 2026-10-24 | Invoice send is SIMULATED; no real provider invoice ID |

## KNOWN ISSUES AND RISKS
- Live financial verification is blocked before payment because the registered webhook hostname does not resolve. An unapproved buyer URL was printed; wait for fixed verifier before using it.
- Reports need a fresh capture/refund in fixed Phase 3 Org A.
- `mark_invoice_paid` looks up an actual PayPal invoice ID. A simulated invoice has none; capture-to-invoice trigger only links a matching pre-existing payment ID.
- Exact run cleanup preserves fixed fixtures and append-only audit/activity. External Sandbox order/refund remain in provider history.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; errors roll back. Never edit an applied migration; add a numbered file.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated and grant only service_role; test ordinary JWT denial.
- PostgREST embeds need explicit foreign-key names when relationships collide.
- `audit_log` is insert-only and ON DELETE RESTRICT; delete journal entries before related rows. Reuse fixed users/orgs.
- Sandbox buyer must be US Personal; seller USD; Visa; webhook ends `/api/webhook`; webhook ID must match. Raw body is required for signature verification.
- PayPal invoice_number max 25; immediate term `DUE_ON_RECEIPT`; compare FX timestamps as instants.
- Check port 3000 owner before restart; leave unrelated processes/tunnel untouched.
- Never print `.env` values, full provider responses, Authorization headers, or stack traces.

## DO NOT
- Do not push, touch frontend files, use force, weaken tests, edit applied migrations, commit `.env`, or call PayPal Invoicing endpoints.
- Do not create a payment order until the registered webhook host resolves. Do not claim simulated invoices were sent/paid.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `node --check scripts/verify-phase3.js`
