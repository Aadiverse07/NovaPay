# Phase 1 verification report

Date: 2026-10-22

## Local checks

- `npm ci`: PASS; 0 vulnerabilities reported.
- `find server -type f -name '*.js' -print0 | xargs -0 -n1 node --check`: PASS.
- `node --check scripts/verify-phase1.js`: PASS.
- `npm test`: PASS; 30 passed, 0 failed.
- `git diff --check`: PASS.

## Live Supabase checks

- Migration objects and grants: PASS by authenticated Supabase CLI SQL preflight. Required tables and onboarding RPC exist; `service_role` has audit insert but no select/update/delete grants.
- Service-role audit reads: PASS; no backend code reads `audit_log` with the service key. The verifier checks owner audit reads through the user's JWT and RLS.
- `node scripts/verify-phase1.js`: PASS. The Supabase CLI was authenticated after explicit user authorization. The live run verified migration objects and insert-only service-role audit grants, unauthenticated `GET /api/events` -> 401, two-user cross-tenant isolation, viewer denial on approval registration -> 403, onboarding creation and repeat idempotency, owner audit access through JWT/RLS, public-config secret exclusion, and cleanup.
- Cleanup: PASS; the script reported that the throwaway users and organizations were cleaned up. No credentials or test identifiers are recorded here.
- Runtime smoke: `npm start` via `server/index.js`, using `PORT=3417` and `STATIC_DIR` at the repository root; `/dashboard.html`, `/preview.html`, and `/api/status` each returned HTTP 200.
- Frontend hygiene: `git diff --stat -- preview.html dashboard.html src assets 'tailwind.novapay.preset.*'` returned no paths. `.env` is ignored by `.gitignore`; no secret values are in tracked files.

# Phase 2 financial-core verification report

Date: 2026-10-24

## Local checks

- Branch: `git branch --show-current` returned `backend`.
- Dependency install: `npm ci` PASS; 89 packages added. npm reported 2 high-severity vulnerabilities; no audit fix was applied.
- Backend and script syntax: `find server scripts -type f -name '*.js' -print0 | xargs -0 -n1 node --check` PASS, including `scripts/verify-phase2.js`.
- Unit and route tests: `npm test` PASS; 43 passed, 0 failed. The suite includes five-delivery webhook replay and mocked approval concurrency tests; these do not replace live-provider verification.
- Whitespace: `git diff --check` PASS.
- Hygiene: the frontend diff scan returned no paths; `.env` is ignored and not tracked; a scan of tracked/untracked repository files against configured local secret values found zero matches (values were not printed).
- Runtime smoke: `PORT=3418 npm start` PASS. `/dashboard.html` and `/preview.html` returned 200; `/api/status` returned 200 with `mode=authenticated`, `supabaseConfigured=true`; `/api/public-config` had only `supabaseAnonKey,supabaseUrl`; unauthenticated `/api/transactions` returned 401; malformed unauthenticated `/api/paypal/create-order` returned 401 before JSON parsing; malformed public webhook returned 400. The configured Supabase values were not printed.
- Frontend hygiene: `git diff --stat main -- preview.html dashboard.html src assets tailwind.novapay.preset.cjs tailwind.novapay.preset.mjs` returned no paths. `.env` is ignored and `git ls-files --error-unmatch .env` failed as expected (not tracked). `git status` showed no staged `.env`.

## Database and provider checks

- Migration state: the live PostgREST schema returned HTTP 200 for all nine Phase 2 tables and exposed all 17 Phase 2 public RPCs; the user reports applying `0002`. This confirms the Phase 2 objects are live. The exact `supabase_migrations.schema_migrations` row remains UNVERIFIED: `npx supabase migration list --linked` reported no linked project, and a read-only `supabase db query --linked --project-ref …` stalled at `Initialising login role…` and was interrupted. No migration was applied by this verification.
- RPC security: static review of `0002_financial_core.sql` found execute revokes for the posting/refund routines and grants to `service_role`; trigger helper routines are revoked from API roles. A throwaway ordinary JWT received HTTP 403 for all 17 exposed Phase 2 RPCs, including order/capture, event, approval/refund, reconciliation, and trial-balance RPCs. The user was deleted afterward. No `0003_fix_*.sql` was needed based on these results.
- Live unbalanced-entry check: PASS. A service-role insert of an entry with no journal lines returned HTTP 400 with database constraint code `23514`; the test organization was deleted.
- Live tenant isolation: PASS. An ordinary Org B owner JWT received HTTP 200 with an empty result for Org A rows in all nine Phase 2 tables. Two throwaway users and organizations were deleted.
- Live default chart: PASS; the test organization had nine accounts. Its empty trial balance returned balanced=true and equal debit/credit totals; its reconciliation returned `clean`. This was an empty test org, not captured sandbox data.
- `scripts/verify-phase2.js` was added and syntax-checked. It includes the full live flow and cleanup, but has not been run end-to-end. Webhook replay against a real verified event, server-restart persistence for actual order/capture/approval data, excess-refund rejection, double-Approve provider count, non-empty trial balance, and reconciliation after sandbox activity remain UNVERIFIED.
- PayPal Sandbox create/approval/capture/webhook/refund flow: UNVERIFIED and not started. Buyer approval requires the user to open the order approval URL printed by the verifier, sign in with a Sandbox buyer, approve the test payment, then return and press Enter. Before that flow, rotate the PayPal Sandbox client secret and LLM API key: working-tree `.env.example` contained non-placeholder values, was sanitized to placeholders, and the values appeared in diagnostic output. The committed `HEAD:.env.example` had placeholders. No values are recorded here. Provider calls were halted after discovery; update the ignored `.env` with rotated values before resuming.
- Cleanup: PASS for the live security and DB probes. The CLI-generated `supabase/.temp/` files were removed. No Phase 1 acceptance checks were rerun.
- No migration push, PayPal payment, capture, or refund was performed during this pass.

## Script scope

`node scripts/verify-phase1.js` checks migration objects and audit grants, unauthenticated 401, organization A isolation from organization B, viewer denial, onboarding idempotency, owner audit access through JWT/RLS, public-config secret exclusion, and cleanup of generated users and organizations. CLI output and environment key values are not printed by the script.

# Phase 2 live verification resume

Date: 2026-10-24

## Local checks

- `git branch --show-current`: PASS, `backend`.
- `npm test`: PASS, 44 tests, 0 failures after the live-run fixes.
- `npm run check:migrations`: PASS; 0001 and 0002 parse as PostgreSQL 17 SQL/PLpgSQL.
- `node --check scripts/verify-phase2.js`: PASS.
- `git diff --check`: PASS.
- `.env.example`: PASS; all five checked credential assignments are placeholders. No `.env` values are recorded here.
- `npm audit --omit=dev`: two high findings affect runtime dependencies: `zod` is a direct runtime dependency; `body-parser` is a transitive runtime dependency. They are not dev-tool-only findings. No audit fix was run.

## Live results

- Phase 2 table availability: PASS; all nine financial tables returned HTTP 200.
- Ordinary JWT RPC security: PASS; all 17 tested Phase 2 RPCs returned 401/403 for the ordinary user JWT.
- Cross-tenant isolation: PASS; Org B's JWT received empty results for Org A rows across all nine Phase 2 tables.
- Unbalanced journal insert: PASS; the database rejected it with HTTP 400.
- Sandbox order and capture: PASS; the buyer approved a $1.00 Sandbox order, capture completed, and exactly one capture journal entry was present.
- PayPal webhook delivery: FAIL/UNVERIFIED. No matching capture event appeared in the inbox within 120 seconds. A read-only PayPal webhook lookup for the configured webhook ID returned a target host `relevant-quick-vbulletin-inclusion.trycloudflare.com` with path `/`; it was not the backend `/api/webhook` path. The event subscription did include `PAYMENT.CAPTURE.COMPLETED`. The configured webhook target mismatch is the confirmed reason this capture event did not reach the app. The local ngrok inspector API was unavailable from this environment.
- Webhook replay and bad-signature checks: UNVERIFIED; no verified real PayPal event was available. The verifier now has checks for five replays (event-row and journal-entry counts) and for a bad-signature event that must not post.
- Refund checks: the first live over-refund attempt returned HTTP 503 because PostgREST could not resolve an ambiguous relationship between `paypal_captures` and `paypal_orders`. Root cause fixed by naming the capture-to-order FK in both repository embed queries, with a unit test. The same capture’s over-refund request and concurrent refund approval were not rerun after the fix.
- Restart persistence: the first live assertion failed because the verifier called it before an approval existed and omitted required identifiers. The invalid early call was removed; the full check after creating the approval remains UNVERIFIED.
- Refund execution, double-Approve provider count, non-empty trial balance, and clean reconciliation: UNVERIFIED; the run stopped before these checks could be completed.
- `node scripts/verify-phase2.js` after adding the preflight: FAIL before creating test users or a new order. It confirmed the configured webhook path does not match `/api/webhook` and exited safely.

## Cleanup and remaining action

- The first run deleted its two throwaway users and organizations; organization-scoped orders, captures, approvals, transactions, journal rows, and any tracked probe events were removed with them. No new test rows or users were created by the later preflight run.
- The $1.00 Sandbox capture from the first run remains captured at PayPal and was not refunded. Its local organization and ledger rows were deleted during cleanup. Locate and refund that test capture in PayPal Sandbox before or during the next verification run.
- Before rerunning, register the backend's configured webhook ID against the current public tunnel URL ending in `/api/webhook`, and make sure `PAYPAL_WEBHOOK_ID` in the ignored local `.env` identifies that webhook. The verifier now checks this before creating users or an order.
- Phase 2 does not pass. No Phase 2 commit was created, nothing was pushed, and Phase 3 was not started.

## Phase 2 resumed live run after webhook correction

Date: 2026-10-24

- Branch: `backend`. The PayPal registration preflight passed for HTTPS `/api/webhook` and `PAYMENT.CAPTURE.COMPLETED`.
- `npm test` before the live run: PASS, 44 tests. `npm run check:migrations`: PASS for 0001 and 0002.
- Live financial tables, 17 ordinary-JWT RPC denials, nine-table cross-tenant isolation, and database rejection of an unbalanced journal entry: PASS.
- Buyer approved a new $1.00 Sandbox order. Capture completed; one capture journal entry was present.
- Real PayPal-signed capture webhook: PASS; stored with `verification_status=verified` and `processing_status=processed`.
- Five replays of its exact stored body and signature headers: PASS; all five returned HTTP 200, event count stayed 1, and capture journal entry count stayed 1.
- Bad-signature event: PASS for no posting; stored with final `verification_status=error`, `processing_status=unverified`; ledger entry count remained 1.
- Over-refund request: PASS, HTTP 400.
- Two simultaneous Approve requests: one provider refund call; responses HTTP 409/200; approval completed. Trial balance was balanced and reconciliation status was `clean`.
- Restart persistence assertion: FAIL. The verifier checked the approval response's `id` field, but the API shape is `approvalId`. The assertion has been corrected to use `approvalId` and now reports each category separately. The corrected live assertion has not been rerun; restart persistence remains UNVERIFIED.
- The first concurrent-approval run did not assert the number of refund journal entries. The verifier now checks that exactly one refund journal entry exists. That assertion was not run live; the “one PayPal refund and one ledger entry” requirement remains UNVERIFIED.
- Older inbox rows: seven pre-existing `PAYMENT.CAPTURE.COMPLETED` rows created on Oct 23 had no `org_id`; six ended `verification_status=error`, one `failed`, all with `processing_status=unverified`. No such event was created during this Oct 24 run. The event payload IDs were not inspected, so association with the prior $1.00 capture is UNVERIFIED. These rows were not posted to a tenant ledger and were not deleted by this run.
- Cleanup: PASS for this run; two throwaway users, two organizations, and tracked probe events were removed. The new $1.00 capture received one $0.01 refund, leaving $0.99 net captured in Sandbox. As requested, the prior $1.00 capture from the earlier run was not refunded.
- Runtime audit findings were fixed in separate commit `42f5043` (`Security: patch runtime audit findings`): Zod upgraded to 4.6.7 and the Express transitive `body-parser` dependency overridden to 2.4.0. Afterward `npm test` passed (45 tests), migrations parsed, and `npm audit --omit=dev` reported zero vulnerabilities.
- Phase 2 is still incomplete because the restart assertion and refund-ledger-entry assertion have not passed live. No Phase 2 success commit was made, nothing was pushed, and Phase 3 was not started.

## Phase 2 resumed verification — corrected run and cleanup status

Date: 2026-10-24

- Corrected live assertions: PASS. The new $1.00 Sandbox order/capture survived two server restarts along with its transaction, capture, approval (queried by `approvalId`), and capture journal entry. The $0.01 refund produced exactly one refund transaction and one refund journal entry; concurrent Approve requests made exactly one PayPal refund. Capture replay remained one event row and one capture journal entry. Trial balance remained balanced and reconciliation remained `clean` after the refund.
- The capture’s $0.01 refund was confirmed; $0.99 remains captured. The earlier $1.00 capture was not refunded.
- Cleanup: FAIL. The verifier's original cleanup path reported success without checking organization/event delete responses. A follow-up cleanup attempt found nine throwaway verifier users and nine matching test organizations still present. Organization deletion returned HTTP 409 / PostgreSQL `23503` because `audit_log.org_id` has `ON DELETE RESTRICT`; deleting the auth users returned HTTP 500 / `23503` because `organizations.created_by` has `ON DELETE RESTRICT`. The live schema grants the service role insert-only access to `audit_log`, so the configured API credentials cannot remove those audit rows. Their related org-scoped test records therefore remain as well. No unrelated rows were targeted.
- Supabase CLI and `psql` are unavailable in this environment, so I could not perform a narrowly scoped SQL cleanup without installing tools or changing the live audit trail through another mechanism. No further database mutations were attempted. Cleanup needs an authorized SQL session to remove only audit rows/tenant rows belonging to the verifier's throwaway organizations, then delete those organizations and auth users; preserve non-test audit history.
- `scripts/verify-phase2.js` was corrected so failed event, organization, or auth-user deletes are reported as `Cleanup incomplete` and force the overall result to FAIL. It no longer claims cleanup succeeded when the provider rejects deletion.
- Local post-run checks after the cleanup-report correction: `npm test` PASS (45 passed, 0 failed); `npm run check:migrations` PASS for both migration files; `node --check` on all `server` and `scripts` JavaScript files PASS; `git diff --check` PASS. Credential values in `.env.example` are placeholders only; `.env` remains ignored. Frontend diff scan returned no paths.
- Phase 2 is **not ready to commit as passed** because test data cleanup failed. No Phase 2 success commit was made, nothing was pushed, and Phase 3 was not started.

## Phase 2 cleanup resolution and repeat-run safety

Date: 2026-10-24

- Live cleanup/count verification: PASS. Read-only Supabase queries found 0 legacy/fixed verifier organizations, 0 verifier users, 0 verifier probe events, and 0 related rows in transactions, journal entries/lines, orders, captures, events, or approvals.
- Cleanup incident: the first manual delete failed with PostgreSQL `23503` because `journal_lines` still referenced `accounts` while their organization was being deleted. The successful cleanup deleted journal entries first (their journal lines cascade), then removed audit rows for the exact test organizations, organizations, and auth users. The original blockers were also confirmed: `audit_log.org_id` and `organizations.created_by` each use `ON DELETE RESTRICT`. No audit-log policy or grant was weakened.
- Repeat-run verifier update: `scripts/verify-phase2.js` now uses two fixed identities (`novapay-phase2-a@example.test` and `novapay-phase2-b@example.test`) and two clearly named dedicated test organizations. It resets passwords for existing fixture users, verifies owner membership on existing fixture organizations, cleans only the dedicated organizations' operational test data and explicitly marked probe events, and checks for residual rows. It retains the fixture users/orgs, chart accounts, and append-only audit records. It will fail before starting a new run if pre-run cleanup fails.
- Added `scripts/cleanup-phase2-test-data.sql`, a manual destructive test-data-only cleanup script. It deletes transactions, approvals, then journal entries before events, orders, audit rows, organizations, and auth users. The file warns against production use and preserves no unrelated organization data.
- The fixed fixture users and organizations do not currently exist; the live count of zero is the verified post-cleanup state. A future full verifier run will create the two named fixtures once, then reuse them. That interactive full run was not repeated because it creates a new Sandbox payment and requires buyer approval.
- Local after-change checks: `npm test` PASS (45 tests); `node --check scripts/verify-phase2.js` PASS. The new cleanup script has not been applied to the live database; the user performed the cleanup manually. Phase 2 live payment evidence above remains valid; no new payment was created in this cleanup pass.
