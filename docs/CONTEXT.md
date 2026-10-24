# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24, Asia/Kolkata.
- Branch: `backend`; last commit `0dbbdc8 Phase 3 Completed By Dev`.
- Current phase/task: Phase 4 AI assistant and orchestration, T2 complete; next T3 LLM guardrails/model verification.

## DONE
- Phase 3 passed its live gate and was pushed at user request. Commit `0dbbdc8`; no `.env` in tracked history.
- Phase 4 Step 0: `npm ci` PASS (89 packages, 0 vulnerabilities); `npm test` PASS (61/61); migration check PASS for 0001–0004. Worktree was clean at start.
- Phase 3 limitation: invoice send remains SIMULATED; real invoice-paid linkage is UNVERIFIED because no PayPal invoice ID exists.

## IN PROGRESS
- Phase 4 T1: implementing `classifyAIIntent` and `createAIRouter` in `server/src/ai/router.js`; added 60-question table and dispatch/priority tests in `server/test/ai-router.test.js`. Focused and full tests pending.

## NEXT STEPS
1. Fix Spanish `por qué` matching without a trailing JavaScript word boundary; rerun focused and full suite.
2. Record the T1 test run and routing precedence decision, update docs, then checkpoint commit.
3. T2 evidence builder, read-only org-scoped tools, redaction and bounded tool loop; test and checkpoint.
4. T3 provider prompt/sanitizer/fallback handling and current Gemini free-tier model verification; record source/date/decision; test and checkpoint.
5. T4 usage budgets, race-safe accounting, data-version cache; test and checkpoint.
6. T5 anomaly rules/tables/notifications/job; T6 proposal queue integration; test and checkpoint each.
7. T7 add next migration `0005_ai.sql` (0001–0004 already exist), validate parser/security; document exact SQL Editor steps and wait for `applied` before live migration checks.
8. T8 API/docs and `scripts/verify-phase4.js`; after migration application, live verification.
9. Run full completion gate, update docs, commit only if no FAIL; do not push; ask before Phase 5.

## USER ACTIONS PENDING
- None currently. Phase 4 live Supabase checks will require the user to apply the new migration and reply `applied`. Gemini smoke test requires a configured key/quota; use ignored env only, never record its value.

## LIVE STATE
- Phase 3 migrations 0001–0004 are present and user reports applied; Phase 4 migration not created/applied.
- Supabase and Gemini key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.
- Invoice delivery remains SIMULATED; no PayPal Invoicing calls in Phase 4.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Branch/status | PASS | 2026-10-24 | `backend`; clean worktree at start |
| Install | PASS | 2026-10-24 | `npm ci`; 89 packages, 0 vulnerabilities |
| Unit suite after T2 | PASS | 2026-10-24 | `npm test`; 73 passed, 0 failed; T2 focused tests 24/24 |
| Migration parser | PASS | 2026-10-24 | `npm run check:migrations`; 0001–0004 parsed |
| Phase 3 gate | PASS | 2026-10-24 | live signed webhook, replay, refund, ledger/report parity; invoice linkage limitation recorded |

## KNOWN ISSUES AND RISKS
- Free-tier model/quota status changes; T3 must verify current official Gemini docs before selecting model and record dated source.
- Supabase live Phase 4 migration verification is blocked until migration is applied by user.
- Phase 3 simulated invoice limitation remains.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; never edit an applied migration; add the next numbered migration.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated; grant service_role only or enforce membership; prove ordinary JWT denial.
- PostgREST embeds need explicit FK names when relationships collide.
- `audit_log` is insert-only and ON DELETE RESTRICT; delete journal entries before related rows; reuse fixed named test identities.
- Sandbox buyer is US Personal, seller USD, Visa; webhook ID must match; raw body is required for signature verification.
- PayPal invoice number max is 25 characters; `DUE_ON_RECEIPT`; compare FX timestamps as instants. Invoice send remains SIMULATED.
- Webhook inbox insertion precedes async verification; poll terminal status.
- Check port 3000 owner; leave unrelated port 34872 and tunnel untouched.
- Never print `.env` values, provider bodies, Authorization headers, stack traces, or sensitive evidence.

## DO NOT
- Do not push, touch frontend files, use force, weaken tests, edit applied migrations, commit `.env`, or call PayPal Invoicing APIs.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `find server scripts -name '*.js' -print0 | xargs -0 -n1 node --check`
