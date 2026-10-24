# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24 09:46:12 UTC
- Branch: backend
- Last implementation commit: e6e1953 (Phase 3: FX reports and invoices); branch backend.
- Current phase/task: Phase 3 complete locally; final report and commit checkpoint.

## DONE
- Phase 2 live verification/cleanup committed: scripts/verify-phase2.js, scripts/cleanup-phase2-test-data.sql, docs/TEST-REPORT.md.
- Phase 3 backend implemented: FX, SQL reports, invoices, approval-gated send, paid webhook linkage, migrations, API docs, and fixture tests.
- User reports migration 0003 applied and INVOICING.INVOICE.PAID subscribed; nine expected live tables/views returned HTTP 200.
- Fixed concurrent FX rate-provider throttle race; regression test in server/test/phase3-services.test.js.

## IN PROGRESS
- Phase 3 implementation is committed locally. No Phase 4 work has started.
- Ordinary-user JWT/RLS and full invoice-send/paid-webhook live cycle remain unverified and are disclosed in TEST-REPORT.md.

## NEXT STEPS
1. Await user direction whether to continue to Phase 4.
2. If deeper live verification is requested, obtain a throwaway ordinary-user JWT and perform an approved Sandbox invoice send/payment; clean up test data safely.

## USER ACTIONS PENDING
- None required to finish the current local implementation.
- Optional for live proof: provide/authorize a throwaway ordinary test-user session; approve/pay a Sandbox invoice in browser after the backend creates and sends it.

## LIVE STATE
- 0001 and 0002 previously verified applied.
- 0003: user reports applied; expected tables/views independently returned HTTP 200 on 2026-10-24.
- Tunnel/webhook: user reports active and registered, with INVOICING.INVOICE.PAID.
- Credential key names only: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| Unit suite | PASS | 2026-10-24 | npm test — 52 passed |
| Migration parser | PASS | 2026-10-24 | npm run check:migrations — 0001/0002/0003 |
| Backend JS syntax/diff | PASS | 2026-10-24 | node --check; git diff --check |
| Frontend hygiene and .env | PASS | 2026-10-24 | diff scan empty; .env ignored/untracked |
| Live migration objects | PASS | 2026-10-24 | nine tables/views HTTP 200 |
| Anon access denial | PASS | 2026-10-24 | eight RPCs and four protected GETs HTTP 401 |
| Ordinary-user JWT/RLS | UNVERIFIED | 2026-10-24 | no ordinary user token available |
| Live invoice paid cycle | UNVERIFIED | 2026-10-24 | no invoice created/sent/paid |

## KNOWN ISSUES AND RISKS
- Live ordinary-user RLS and invoice-send/webhook linkage are not proven end to end.
- Frankfurter provider was live reachable; application route was tested locally with fixtures, not a live user JWT.
- Phase 3 implementation committed locally as e6e1953; not pushed.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; a syntax or runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant it only to service_role; prove it by calling with an ordinary user JWT (expect 403).
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only and has ON DELETE RESTRICT; cleanup deletes journal_entries first, then audit_log, organizations, auth.users via scripts/cleanup-phase2-test-data.sql. Reuse fixed named test users/orgs.
- PayPal sandbox buyer must be a US Personal account; seller USD only; use Visa; webhook URL ends /api/webhook and PAYPAL_WEBHOOK_ID matches.
- Raw body is needed for PayPal signature verification.
- Never print .env values; use key names only.

## DO NOT
- Do not push, touch frontend files, use --force, run npm audit fix --force, weaken tests, edit applied migrations, or commit .env/secrets.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
