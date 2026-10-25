# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-25 Asia/Kolkata.
- Branch: `backend`; last commit before this closeout: `756f9d8 WIP Phase 4 task 4: investigate budget result`.
- Current phase/task: Phase 4 resumed live verification, task 6 final gate and closeout.

## DONE
- Phase 3 completed; invoice sending remains SIMULATED.
- Phase 4 T0–T7 completed in commits `e6cd524`, `574253a`, `f68996e`, `eef73a9`, `90fb767`, `b755e89`, `ba413c0`, `41eb9b7`, `317a580`.
- T8 deterministic code/FX and SQL routes bypass LLM; `/api/ai/chat` now returns `answer`, `route`, `reason`, `citations`, `usage`, and `cached`. Files: `server/src/services/ai.js`, `server/src/app.js`, `server/src/routes/ai.js`.
- Updated tests/docs: `server/test/{ai,llm,routes}.test.js`, `docs/FRONTEND-CONTRACT.md`, `docs/API.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`.
- Added live verifier `scripts/verify-phase4.js`; fixed identities/orgs only, per-run cleanup only.
- Expanded live AI assertions: real capture fee answer/citations/numeric checks and cache passed; hostile client context caused no approval or PayPal activity. Separate HTTP budget request passed with no provider call. Database-description injection and live model-generated proposal remain UNVERIFIED. The single verifier-owned AI usage row is deleted and exact remaining-row count verified zero.

## IN PROGRESS
- Added GET-only `--safe` modes. Phase 2 safe mode: root and all 9 financial relations PASS; dedicated Phase 2 organizations absent, so org fixture inspection UNVERIFIED (mode does not provision). Phase 3 safe mode PASS: root, all 18 financial/FX/invoice/report relations and fixed org A USD balance. No PayPal calls, auth writes, invoices, orders, cleanup, or `/api/status` calls.

## NEXT STEPS
1. Run final test, migration, JS syntax, diff, audit and frontend-hygiene checks.
2. Update docs with actual outputs and commit locally if no FAIL; report and ask before Phase 5.

## USER ACTIONS PENDING
- None. Buyer approval/capture are complete; do not make another PayPal call or refund.

## LIVE STATE
- Migrations 0001–0005 reported applied by user; read-only probes confirmed 0005 tables and RPCs.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.
- NovaPay on port 3000 was restarted to load current code; latest run used process-only `AI_DAILY_USER_LIMIT=1` for the blocked-request check. Tunnel and unrelated port 34872 untouched.
- Public preflight was HTTP 200 authenticated; webhook registration matched `/api/webhook` and expected subscriptions. One synthetic Gemini call: HTTP 200, model `gemini-3.5-flash-lite`, 2138 ms, 59 input/39 output tokens; tiny probe JSON shape was invalid (body suppressed). One $1 order approved/captured; signed webhook verified/processed; exactly one capture transaction and journal entry ($1 gross/$0.40 fee/$0.60 net). Capture retained; no refund. Tunnel hostname `cheaper-approximate-advances-keyboard.trycloudflare.com`; unrelated port 34872 untouched. Invoice sending remains SIMULATED.
- Port 3000 now runs current checked-in code as PID 71634 with process limits 5 user / 20 org; static root returned HTTP 200. No PayPal call was made during this restart.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| `npm ci` | PASS | 2026-10-24 | 89 packages; npm audit at install 0 vulnerabilities |
| `npm test` | PASS | 2026-10-25 | 104 passed, 0 failed |
| `npm run check:migrations` | PASS | 2026-10-25 | 0001–0005 parsed by PostgreSQL 17 parser |
| JS syntax + diff | PASS | 2026-10-25 | `find server scripts -name '*.js' ... node --check`; `git diff --check` |
| `npm audit --omit=dev` | PASS | 2026-10-25 | 0 runtime vulnerabilities |
| Phase 4 live verifier | PASS / UNVERIFIED | 2026-10-25 | Capture, grounded fee response/cache, hostile client context, budget block, RLS/RPC and FX checks passed; database description and live proposal remain UNVERIFIED |
| Final gate rerun | PASS | 2026-10-24 | `npm test` 104/104; migration check 0001–0005; JS syntax and diff check |
| Earlier Phase 2/3 safe subset attempt | UNVERIFIED | 2026-10-24 | At that point no safe mode existed; superseded by the 2026-10-25 runs below |
| Frontend diff | PASS | 2026-10-24 | `git diff --name-only -- preview.html dashboard.html src assets tailwind.novapay.preset.*` empty |
| `.env` hygiene | PASS | 2026-10-24 | ignored by Git; no `.env` in status/staged list |
| Phase 2 safe subset | UNVERIFIED | 2026-10-25 | `node scripts/verify-phase2.js --safe`: root and 9 tables PASS; fixed Phase 2 orgs absent; no mutations |
| Phase 3 safe subset | PASS | 2026-10-25 | `node scripts/verify-phase3.js --safe`: root, 18 relations, fixed orgs; A USD balanced=true; no mutations |

## KNOWN ISSUES AND RISKS
- Phase 2 read-only safe check could not inspect org-specific data because its named fixture orgs are absent; all nine tables are available. No fixture was created.
- Live DB-description prompt injection is UNVERIFIED because `transactions` has no description field; client-supplied hostile context was ignored. Live model-generated pending proposal is UNVERIFIED. Unit tests cover sanitization and pending-only proposal mechanics.
- Gemini synthetic smoke returned HTTP 200 but did not match the tiny probe JSON shape; response was suppressed. Production grounded fee answer and cache were verified separately.
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
- `npm audit --omit=dev`
- `node scripts/verify-phase2.js --safe`
- `node scripts/verify-phase3.js --safe`
