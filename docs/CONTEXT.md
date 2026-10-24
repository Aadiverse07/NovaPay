# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24, Asia/Kolkata.
- Branch: `backend`; last commit before checkpoint: `00fa9be WIP-BROKEN: Phase 3 live verification handoff`.
- Phase/task: Phase 3 live verification, Task 5 — blocked invoice send diagnosis; do not continue live invoice creation.

## DONE
- Phase 2 and Phase 3 implementation are committed through `e6e1953`; Phase 3 live verification remains incomplete.
- User reports migrations 0001–0004 applied; read-only live probes returned HTTP 200 for Phase 3 objects and status.
- Verifier passes ordinary-JWT denial on 8 RPCs, 11 service/mismatch assertions, cross-tenant isolation, direct-write denial, invoice arithmetic/roles, report routes/date filters/CSV, and Phase 2 schema/protected reads.
- FX live provider/cache works (rate/timestamp instant match); provider outage returns unavailable without a stale/invented conversion.
- Invoice validation uses PayPal's 25-character invoice-number limit and DUE_ON_RECEIPT. Safe API activity logger and tests redact provider messages/debug IDs and retain only issue enums or generic body categories.

## IN PROGRESS
- Invoice send remains BLOCKED after repeated live HTTP 502s. Latest safe activity shows invoice create HTTP 201, no `/send` request, and no safe provider error name/issue. The service catches persistence and provider-stage failures together, so exact stage is not known.
- `docs/TEST-REPORT.md` records latest live result. No browser payment, approval URL, signed paid webhook, or final Phase 3 gate pass exists.
- Current WIP changes: `server/src/services/paypal.js`, `server/test/paypal.test.js`, `scripts/verify-phase3.js`, `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`.

## NEXT STEPS
1. Do not create another live PayPal invoice until the create/persist/send boundary is diagnosed; inspect app/server safe errors and verify whether database RPC `set_invoice_paypal_draft` succeeded for the test run.
2. Ask the user to inspect the PayPal Sandbox invoice list for drafts created by prior HTTP 201 requests; verifier removes local rows only.
3. Resolve the HTTP 502 source with focused code/tests; preserve safe logging and never print provider bodies or keys.
4. Real Phase 2 report totals need a surviving valid capture/refund dataset; current inventory had none, so keep UNVERIFIED absent data.
5. After human/provider prerequisites, rerun the invoice flow, pause only if a payer URL is printed, and verify signed webhook/replay/ledger status.
6. Run the full Phase 3 gate. Do not make a final phase commit or ask to advance while FAIL/BLOCKED/UNVERIFIED items remain. WIP local checkpoint only; never push.

## USER ACTIONS PENDING
- Inspect PayPal Sandbox invoice list for any drafts from prior HTTP 201 creates; report whether drafts exist. No buyer payment step is available because no payer URL was returned.
- Keep webhook subscription (`INVOICING.INVOICE.PAID`, capture, refund), tunnel, and port-3000 server running if continuing later.

## LIVE STATE
- 0001/0002 previously verified applied; 0003/0004 user-reported applied and live objects/0004 mismatch behavior observed.
- Tunnel/webhook remain user-configured; untouched. Port 3000 server is running from this checkout after safe-logger refresh. Port 34872 listener PID 20134 remains untouched.
- Buyer setting is read from ignored `NOVAPAY_PHASE3_BUYER_EMAIL`; no email or key values recorded. Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Branch/worktree | PASS | 2026-10-24 | branch `backend`; local changes only in six backend/docs files |
| Install | PASS | 2026-10-24 | `npm ci`; 89 packages, 0 vulnerabilities |
| Unit suite | PASS | 2026-10-24 | `npm test`; 56 passed, 0 failed |
| Migration parser | PASS | 2026-10-24 | `npm run check:migrations`; 0001–0004 parse |
| Live status/schema | PASS | 2026-10-24 | `/api/status` 200; nine Phase 3 objects HTTP 200 |
| Live security/roles/routes/FX | PASS | 2026-10-24 | latest verifier: 8/8 JWT RPC denials, 11/11 service assertions, isolation, writes, roles, FX, reports |
| Invoice send/paid webhook | BLOCKED | 2026-10-24 | 3 live attempts returned 502; create 201/no `/send`; no browser payment or signed event |
| Real report totals | UNVERIFIED | 2026-10-24 | live org inventory had zero completed capture/refund rows |
| Cleanup | PASS, scoped | 2026-10-24 | run-created local invoices/events/FX removed; fixed fixtures and audit rows retained |
| Frontend/secrets hygiene | PASS | 2026-10-24 | frontend diff empty; `.env` ignored/untracked; no secrets in changed files |

## KNOWN ISSUES AND RISKS
- Invoice send failure stage is not isolated; latest evidence is provider create 201 and no send activity. Check if `set_invoice_paypal_draft` failed or server app error surfaced safely.
- PayPal drafts may remain in Sandbox although local verifier rows were deleted; user must inspect dashboard.
- Historical capture/refund totals cannot be proven from this live project's current data.
- No final Phase 3 commit is allowed while blocked/unverified criteria remain. No push.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; errors roll back. Never edit applied migrations; add a numbered migration.
- SECURITY DEFINER/posting RPCs must revoke execute from public, anon, authenticated and grant only service_role; test ordinary JWT denial.
- PostgREST embeds need explicit FK names when multiple relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup test journal_entries before audit rows/orgs/auth users. Reuse fixed named fixtures.
- Sandbox buyer must be US Personal, seller USD, Visa; webhook URL ends `/api/webhook`, webhook ID must match, and raw body is required for signature verification.
- PayPal invoice_number maximum is 25 characters; immediate payment uses `DUE_ON_RECEIPT`.
- Compare FX timestamp instants, not string serialization.
- Check port-3000 PID before app restarts; leave unrelated port 34872 listener/tunnel untouched.
- Never print `.env` values, complete provider responses, auth headers, or stack traces.

## DO NOT
- Do not push, touch frontend files, use force, weaken tests, edit applied migrations, commit `.env`, or create more Sandbox invoices until diagnosis.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `node --check scripts/verify-phase3.js`
