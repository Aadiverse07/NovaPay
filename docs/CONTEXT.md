# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24 09:52:51 UTC
- Branch: backend
- Last commit hash: 5e8a827 (continuity docs); implementation commit e6e1953.
- Current phase/task: Phase 3 live verification, Task 3 — await user applying 0004 and supplying Sandbox buyer email; read-only gate ran.

## DONE
- Phase 2 is committed and its previous live checks/cleanup are recorded in docs/TEST-REPORT.md.
- Phase 3 FX, reports, invoices, webhook linkage, migration 0003, contract, and 52 local tests are committed.
- User reports 0003 applied and INVOICING.INVOICE.PAID subscribed; read-only probes previously saw nine expected tables/views.

## IN PROGRESS
- CSV formula neutralization, webhook mismatch result handling, migration 0004, and scripts/verify-phase3.js are drafted; first local suite passed (54/54), then verifier preflight/cleanup safety was tightened and needs rerun.
- Read-only gate: `/api/status` returned HTTP 200. Migration 0004 is not confirmed; verifier stopped before creating users or rows.
- No live data has been changed in this pass.

## NEXT STEPS
1. Apply the displayed `0004_fix_invoice_paid_amount.sql` in Supabase SQL Editor and reply `applied`.
2. Provide the US Personal Sandbox buyer email; set it locally as `NOVAPAY_PHASE3_BUYER_EMAIL` without sharing secrets.
3. Run the verifier with `NOVAPAY_PHASE3_0004_APPLIED=true`; follow its printed buyer URL and return `paid` after browser payment.
4. Review the redacted results, cleanup report, and update docs after each run.
5. Commit Phase 3 verification only if there are no FAIL or UNVERIFIED items; never push.

## USER ACTIONS PENDING
- Apply `supabase/migrations/0004_fix_invoice_paid_amount.sql` in the SQL Editor and reply `applied`.
- Provide the US Personal PayPal Sandbox buyer email; configure it locally as `NOVAPAY_PHASE3_BUYER_EMAIL` before verifier invoice creation.
- If invoice send succeeds, open the printed Sandbox payer URL, pay with Visa, then return and type `paid` in the verifier.

## LIVE STATE
- 0001/0002 previously verified applied; 0003 user-reported applied, with nine objects previously returning HTTP 200.
- Tunnel/server reportedly running. User reports INVOICING.INVOICE.PAID subscribed.
- Key names only: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID.

## TEST STATE
| Check | Status | Date | Command |
| Live inventory | PASS | 2026-10-24 | 2 orgs, 0 completed captures/refunds, 0 candidate orgs |
|---|---|---|---|
| Phase 3 unit suite | PASS | 2026-10-24 | npm test — 52 passed |
| Migration syntax | PASS | 2026-10-24 | npm run check:migrations — 0001–0003 |
| Live Phase 3 full verifier | UNVERIFIED | 2026-10-24 | not yet implemented/run this turn |
| Ordinary-user JWT and invoice paid webhook | UNVERIFIED | 2026-10-24 | requires live verifier/human Sandbox step |

## KNOWN ISSUES AND RISKS
- 0003 is applied; never edit it. Database corrections require new 0004 and user application.
- audit_log is insert-only and retained; remove only operational rows tagged/identified as created during this run.
- A real PayPal invoice send/payment is an external Sandbox side effect; use the fixed test buyer and pause for the human payment step.
- Existing Phase 2 capture/refund rows are absent from the live project; report comparisons against them cannot pass without a safe source dataset.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; errors roll back everything. Never edit an applied migration; use a new numbered file.
- SECURITY DEFINER/posting RPCs must deny public, anon, authenticated and grant only service_role; test with an ordinary user JWT.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- audit_log is insert-only and ON DELETE RESTRICT; delete journal_entries before audit rows if manual fixture-org cleanup is required. Reuse fixed users/orgs; retain append-only audit rows.
- Sandbox buyer must be US Personal, seller USD; Visa; webhook URL ends /api/webhook and PAYPAL_WEBHOOK_ID matches.
- PayPal signature verification requires exact raw request bytes.
- Never print .env values.

## DO NOT
- Do not push; do not touch frontend files; no force operations; no weakening tests; no editing 0003; never commit .env/secrets.

## RESUME COMMANDS
- git status --short
- npm test
- npm run check:migrations
