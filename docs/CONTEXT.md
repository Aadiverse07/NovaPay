# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-24 Asia/Kolkata.
- Branch: `backend`; last committed checkpoint before this session: `317a580 WIP Phase 4 task 7: AI persistence migration`; Phase 4 final commit pending.
- Current phase/task: Phase 4, T8 gate passed locally; final commit pending.

## DONE
- Phase 3 completed; invoice sending remains SIMULATED.
- Phase 4 T0–T7 completed in commits `e6cd524`, `574253a`, `f68996e`, `eef73a9`, `90fb767`, `b755e89`, `ba413c0`, `41eb9b7`, `317a580`.
- T8 deterministic code/FX and SQL routes bypass LLM; `/api/ai/chat` now returns `answer`, `route`, `reason`, `citations`, `usage`, and `cached`. Files: `server/src/services/ai.js`, `server/src/app.js`, `server/src/routes/ai.js`.
- Updated tests/docs: `server/test/{ai,llm,routes}.test.js`, `docs/FRONTEND-CONTRACT.md`, `docs/API.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`.
- Added live verifier `scripts/verify-phase4.js`; fixed identities/orgs only, per-run cleanup only.
- Live verifier latest: 12 PASS / 0 FAIL / 3 UNVERIFIED. Service RPC grants/RLS, tenant isolation, direct-write denial, deterministic SQL, FX, anomaly idempotency and run-owned cleanup passed. No Gemini call: fixed org has no completed capture evidence.

## IN PROGRESS
- Final checks PASS: 104/104 tests, migration parser 0001–0005, all JS syntax and diff checks. `npm audit --omit=dev`: zero. Frontend diff empty; `.env` ignored. Commit pending. No PayPal call made.

## NEXT STEPS
1. Finish final `npm test`, `npm run check:migrations`, JS syntax, diff/hygiene checks.
2. Check staged file list contains no `.env`, secrets, or frontend paths; commit locally on `backend` as `Phase 4: AI assistant and orchestration (live verified)` because no current check is FAIL.
3. Report PASS/UNVERIFIED evidence, then ask whether to continue to Phase 5. Never push.

## USER ACTIONS PENDING
- None to finish this phase. To verify remaining live Gemini/cache/injection checks later, the fixed Phase 3 test organization needs a completed capture with non-sensitive evidence; do not create one without an explicitly authorized Sandbox flow.

## LIVE STATE
- Migrations 0001–0005 reported applied by user; read-only probes confirmed 0005 tables and RPCs.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.
- NovaPay on port 3000 was restarted to load current T8 code; `/api/status` HTTP 200 authenticated. Tunnel and unrelated port 34872 untouched.
- No Gemini API request made in final verifier; no PayPal request made. Invoice sending remains SIMULATED.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| `npm ci` | PASS | 2026-10-24 | 89 packages; npm audit at install 0 vulnerabilities |
| `npm test` | PASS | 2026-10-24 | 104 passed, 0 failed |
| `npm run check:migrations` | PASS | 2026-10-24 | 0001–0005 parsed by PostgreSQL 17 parser |
| JS syntax + diff | PASS | 2026-10-24 | `find server scripts -name '*.js' ... node --check`; `git diff --check` |
| `npm audit --omit=dev` | PASS | 2026-10-24 | 0 runtime vulnerabilities |
| Phase 4 live verifier | PASS / UNVERIFIED | 2026-10-24 | 12 PASS, 0 FAIL, 3 UNVERIFIED; see `docs/TEST-REPORT.md` |
| Final gate rerun | PASS | 2026-10-24 | `npm test` 104/104; migration check 0001–0005; JS syntax and diff check |
| Phase 2/3 safe live subset | UNVERIFIED | 2026-10-24 | No safe mode; scripts create PayPal Sandbox side effects, not run |
| Frontend diff | PASS | 2026-10-24 | `git diff --name-only -- preview.html dashboard.html src assets tailwind.novapay.preset.*` empty |
| `.env` hygiene | PASS | 2026-10-24 | ignored by Git; no `.env` in status/staged list |

## KNOWN ISSUES AND RISKS
- Live Gemini smoke, grounded fee answer/cache replay, database-text injection, and API-level tiny-budget denial remain UNVERIFIED because the fixed test org has no completed capture evidence. Unit tests cover budget no-call, cache, and injection behavior.
- Phase 2/3 live verifier safe subset remains UNVERIFIED because those scripts have no read-only mode and trigger PayPal Sandbox operations.
- Gemini free quotas can vary; minimized evidence only. Duplicate-payer and payout anomaly cases remain fixture-limited by available schema data.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs must revoke public/anon/authenticated execute, grant only service_role (or enforce membership), and be tested with ordinary JWTs.
- PostgREST embeds need explicit FK names when multiple relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup financial test data in dependency order; reuse fixed identities/orgs.
- PayPal sandbox buyer must be US Personal, seller USD, Visa; webhook ID must match; signature verification needs raw bytes.
- PayPal invoice number max is 25 chars; use `DUE_ON_RECEIPT`; compare FX timestamps as instants; invoice sending stays SIMULATED.
- Check port 3000 process freshness after source edits; leave unrelated tunnel/processes untouched.
- Never print `.env` values, provider bodies, Authorization headers, stack traces, or sensitive evidence.

## DO NOT
- Do not push, touch frontend files, use `--force`, weaken tests, edit applied migrations, commit `.env`, call PayPal Invoicing, or invent financial evidence.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
- `find server scripts -name '*.js' -print0 | xargs -0 -n1 node --check`
