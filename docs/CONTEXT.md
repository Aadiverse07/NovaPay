# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24 Asia/Kolkata.
- Branch: `backend`; last commit `ba413c0 WIP Phase 4 task 5: anomalies and notifications`.
- Current phase/task: Phase 4, T6 complete; next T7 migration.

## DONE
- Phase 3 completed and backed up at `0dbbdc8`; invoice send remains simulated.
- Phase 4 T0–T2 checkpoint commits: `e6cd524`, `574253a`, `f68996e`.
- Phase 4 T3 checkpoint: `eef73a9 WIP Phase 4 task 3: LLM guardrails`.
- Phase 4 T4 checkpoint: `90fb767 WIP Phase 4 task 4: budgets and cache`.
- Phase 4 T5 checkpoint: `ba413c0 WIP Phase 4 task 5: anomalies and notifications`.
- T1 deterministic route classifier and 61-question table test: `server/src/ai/router.js`, `server/test/ai-router.test.js`.
- T2 org-scoped read-only evidence tools, data minimization and bounded calls: `server/src/ai/evidence.js`, `server/src/services/ai.js`, `server/src/routes/ai.js`, `server/test/ai-evidence.test.js` and related service/route tests.

## IN PROGRESS
- T6 complete: `server/src/services/ai.js` persists eligible proposals as sanitized, org-scoped pending approvals through memory/Postgres repository interfaces; refund proposals require an exact completed capture and compute remaining amount server-side. Approval decisions retain existing RBAC and refund path. Focused tests 29/29; full suite 101/101. T7 migration will add the Postgres RPC.
- T5 complete: rule engine `server/src/ai/anomalies.js`, service/scheduler `server/src/services/anomalies.js`, repo interfaces in `server/src/repos/{memory,postgres,aiMemory}.js`, route `server/src/routes/notifications.js`, app/index wiring and tests. Focused suite PASS 19/19; full suite PASS 97/97; migrations/syntax/hygiene pass. Checkpoint `ba413c0`; DB tables/RPCs are for T7.
- T4 complete: org/user daily reservation budgets, token/latency usage tracking, safe-answer cache keyed by org/question/route/data-version, and no-provider-call guards. `npm test` 89/89; migrations, syntax and hygiene pass. Checkpoint `90fb767`.

## NEXT STEPS
1. Checkpoint T6 locally after verifying no secrets or frontend changes.
2. T7 add next migration `0005_ai.sql`, run migration parser/security checks, document exact SQL Editor steps and wait for user `applied` before live DB checks.
3. T8 API/docs and `scripts/verify-phase4.js`; live checks only after migration is applied.
4. Run Phase 4 gate; commit only with no FAIL; never push; ask before Phase 5.

## USER ACTIONS PENDING
- None now. Later: apply `0005_ai.sql` in Supabase SQL Editor and reply `applied`. A real Gemini smoke test needs the configured key and available quota; never display its value.

## LIVE STATE
- User reports Phase 3 migrations 0001–0004 applied. Phase 4 migration not written/applied.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.
- No live provider or database call during Phase 4 yet.
- Invoice delivery remains SIMULATED; do not call PayPal Invoicing APIs.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Branch/status | PASS | 2026-10-24 | `git branch --show-current`, `git status --short`; branch `backend`, clean at T3 start |
| T0 install | PASS | 2026-10-24 | `npm ci`; 89 packages, zero vulnerabilities |
| T0 suite | PASS | 2026-10-24 | `npm test`; 61 passed |
| T0 migration parser | PASS | 2026-10-24 | `npm run check:migrations`; 0001–0004 parsed |
| T1 suite | PASS | 2026-10-24 | `npm test`; 65 passed; focused router 4/4 |
| T2 suite | PASS | 2026-10-24 | `npm test`; 73 passed; focused T2 tests 24/24 |
| T2 migration parser | PASS | 2026-10-24 | `npm run check:migrations`; 0001–0004 parsed |
| T3 focused AI/LLM tests | PASS | 2026-10-24 | `node --test server/test/ai.test.js server/test/llm.test.js`; 19 passed |
| T3 full suite | PASS | 2026-10-24 | `npm test`; 83 passed, 0 failed |
| T3 migrations/syntax/hygiene | PASS | 2026-10-24 | `npm run check:migrations`; all migrations parsed; `find server scripts ... node --check`; `git diff --check`; no frontend paths changed; `.env` ignored |
| T4 focused tests | PASS | 2026-10-24 | `node --test server/test/ai-control.test.js server/test/postgres-repos.test.js server/test/llm.test.js`; 18 passed |
| T4 full test suite | PASS | 2026-10-24 | `npm test`; 89 passed, 0 failed |
| T4 migrations/syntax/hygiene | PASS | 2026-10-24 | `npm run check:migrations`; `node --check` all JS; `git diff --check`; no frontend paths changed; `.env` ignored |
| T5 focused | PASS | 2026-10-24 | `node --test server/test/anomalies.test.js server/test/postgres-repos.test.js server/test/routes.test.js`; 19 passed |
| T5 full suite | PASS | 2026-10-24 | `npm test`; 97 passed, 0 failed |
| T5 migration/syntax/hygiene | PASS | 2026-10-24 | `npm run check:migrations`; JS `node --check`; `git diff --check`; frontend diff empty; `.env` ignored |
| Phase 3 live gate | PASS with limitation | 2026-10-24 | Signed webhook/replay, capture/refund and reports passed; real invoice-paid linkage UNVERIFIED because sending is simulated |

## KNOWN ISSUES AND RISKS
- Gemini free quotas are project-specific and can change; Google may use free-tier inputs to improve products. Send minimal evidence.
- Phase 4 live checks wait on `0005_ai.sql` application; provider smoke can be UNVERIFIED if key/quota unavailable.
- Duplicate payer and payout rules have only fixture coverage: current financial schema stores no payer reference and disallows payout transaction source types.
- Phase 3 simulated invoice limitation remains.

## LESSONS LEARNED
- Supabase SQL Editor runs transactionally; never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs revoke execute from public, anon, authenticated; grant service_role only or enforce membership; prove ordinary JWT denial.
- PostgREST embeds need explicit FK names when relationships collide.
- `audit_log` is insert-only and ON DELETE RESTRICT; delete journal entries before related rows; reuse fixed named test identities.
- Sandbox buyer is US Personal, seller USD, Visa; webhook ID must match; raw body is required for signature verification.
- PayPal invoice number max is 25 characters; use `DUE_ON_RECEIPT`; compare FX timestamps as instants. Invoice send remains SIMULATED.
- Webhook inbox insertion precedes async verification; poll terminal status.
- Check port 3000 owner; leave unrelated port 34872 and tunnel untouched.
- Never print `.env` values, provider bodies, Authorization headers, stack traces, or sensitive evidence.

## DO NOT
- Do not push, touch frontend files, use force, weaken tests, edit applied migrations, commit `.env`, call PayPal Invoicing APIs, or run a live AI request before one explicitly planned smoke test.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `find server scripts -name '*.js' -print0 | xargs -0 -n1 node --check`
