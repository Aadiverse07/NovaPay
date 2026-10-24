# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24, Asia/Kolkata.
- Branch: `backend`; last commit `d34be71 WIP Phase 3 task 3: clean noninteractive run`.
- Current phase/task: Phase 3 live verification, webhook async-state race fix and rerun.

## DONE
- Phase 2/3 implementation and migration set 0001–0004 exist; user reports 0003/0004 applied.
- Invoice sending remains SIMULATED; no more PayPal Invoicing calls.
- Public tunnel preflight passed on `https://extension-italia-taken-emma.trycloudflare.com`; PayPal webhook GET confirmed configured endpoint/events before this run.
- Latest full live run passed auth/RPC/RLS, roles, direct-write denial, FX, invoice recalculation/approval gate, PayPal capture/refund, five reports, date boundaries, CSV neutralization, Phase 2 safe subset, and cleanup.
- In this run: capture completed, exactly one capture journal entry; refund completed, exactly one refund journal entry; report totals matched capture/refund ledger totals.

## IN PROGRESS
- `scripts/verify-phase3.js:waitForCaptureEvent`: now changed to wait for terminal webhook processing state via `isWebhookEventTerminal` in `server/src/services/webhookProcessor.js`.
- `server/test/webhook.test.js`: added unit coverage for the initial processing state, retry state and terminal states. Local suite 61/61; migrations and syntax/hygiene checks pass. Retry the live flow with one new order; buyer approval is required.
- Previous run returned the inbox row too early (`verification=unverified; processing=processing`), then cleanup removed it. Final signature result and replay proof are unavailable.

## NEXT STEPS
1. Run `node --check scripts/verify-phase3.js`, `npm test`, `npm run check:migrations`, full backend JS syntax checks, `git diff --check`, and confirm no frontend or `.env` changes.
2. Record results in this file and TEST-REPORT; checkpoint commit if local suite passes and secrets are absent.
3. Reconfirm public `/api/status` and read-only PayPal webhook URL/event registration.
4. Run the verifier without pending-order reuse to create one new $1 Sandbox order. Print only its approval URL; wait for user approval.
5. Confirm the event polling waits for terminal state; replay the stored real raw body x5 only if verification is `verified` and processing is `processed`. Recompute reports, cleanup only this run's rows.
6. Re-run final gate. Since the prior live attempt had a FAIL and linkage remains UNVERIFIED, do not final-commit Phase 3 unless all required checks pass; never push.

## USER ACTIONS PENDING
- Approve the next $1 Sandbox order in browser as US Personal buyer `sb-jzrsh53532685@personal.example.com` using Visa; reply `approved`.
- Keep tunnel and port 3000 server running. Webhook registered to `https://extension-italia-taken-emma.trycloudflare.com/api/webhook`; capture/refund events enabled.

## LIVE STATE
- Migrations 0001–0004 reported applied; 0004 guard was exercised live.
- Cloudflare tunnel hostname and PayPal webhook were confirmed by user; preflight previously returned public `/api/status` 200.
- App listens on port 3000. Separate process on port 34872 is unrelated and was not modified.
- Latest live run's order, capture, refund and associated local rows were cleaned; provider Sandbox payment/refund remain in provider history.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Branch/worktree | PASS | 2026-10-24 | `git branch --show-current` = `backend`; no initial worktree changes |
| Prior unit suite/migrations | PASS | 2026-10-24 | `npm test` 60/60 and `npm run check:migrations` 0001–0004 before latest run |
| Public status/webhook preflight | PASS | 2026-10-24 | public `/api/status` 200; webhook URL/events matched before new flow |
| Live auth/RLS/roles/FX/invoice gate | PASS | 2026-10-24 | verifier: 8/8 RPC denials; 9 tenant tables/views; 4 direct writes denied; provider cache/failure; role gates |
| Real capture/refund and reports | PASS | 2026-10-24 | capture and refund COMPLETED; one journal row each; five reports matched ledger; date/CSV checks passed |
| Real signed capture webhook | FAIL | 2026-10-24 | verifier saw initial `unverified/processing`; premature polling |
| Raw-body replay x5 | UNVERIFIED | 2026-10-24 | no terminal verified event retained for replay |
| Simulated invoice paid linkage | UNVERIFIED | 2026-10-24 | known limitation: simulated invoice lacks PayPal invoice ID |
| Latest local checks after race fix | PASS | 2026-10-24 | `npm test` 61/61; migration check 0001–0004; node checks, diff/hygiene pass |

## KNOWN ISSUES AND RISKS
- Must rerun the live order to establish terminal signed-webhook result and replay count; requires another buyer approval.
- Invoice send is SIMULATED. Real Invoicing send and signed paid linkage are not verified.
- Cleanup removes local run rows but cannot remove payment/refund from Sandbox provider history; append-only audit/activity rows and fixed fixtures remain.

## LESSONS LEARNED
- Supabase SQL Editor runs transactionally; never edit applied migrations.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated; grant only service_role; prove ordinary JWT denial.
- PostgREST embeds need explicit FK names when relationships collide.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup deletes journal entries first; reuse fixed fixtures.
- US Personal Sandbox buyer, USD seller, Visa; webhook ID must match; raw body required for signature verification.
- PayPal invoice_number limit is 25 characters; immediate term uses `DUE_ON_RECEIPT`; compare FX timestamps as instants.
- PayPal create response ID extraction previously failed; invoice sending remains simulated.
- Webhook inbox insertion precedes async verification; poll terminal status before evaluating signature.
- Check port 3000 owner; leave unrelated port 34872 process and tunnel untouched.
- Never print `.env` values, provider response bodies, Authorization headers, or stack traces.

## DO NOT
- Do not push, edit frontend files, use force, weaken tests, edit applied migrations, commit `.env`, or call PayPal Invoicing APIs.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `node --check scripts/verify-phase3.js`
