# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-25 Asia/Kolkata.
- Branch: `backend`; Phase 4 delivery commit: `cc018ed Phase 4: AI assistant and orchestration (live verified)`.
- Current phase/task: Phase 4 resumed live verification, task 3 AI assertions.

## DONE
- Phase 3 completed; invoice sending remains SIMULATED.
- Phase 4 T0–T7 completed in commits `e6cd524`, `574253a`, `f68996e`, `eef73a9`, `90fb767`, `b755e89`, `ba413c0`, `41eb9b7`, `317a580`.
- T8 deterministic code/FX and SQL routes bypass LLM; `/api/ai/chat` now returns `answer`, `route`, `reason`, `citations`, `usage`, and `cached`. Files: `server/src/services/ai.js`, `server/src/app.js`, `server/src/routes/ai.js`.
- Updated tests/docs: `server/test/{ai,llm,routes}.test.js`, `docs/FRONTEND-CONTRACT.md`, `docs/API.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`.
- Added live verifier `scripts/verify-phase4.js`; fixed identities/orgs only, per-run cleanup only.
- Live verifier latest: 12 PASS / 0 FAIL / 3 UNVERIFIED. Service RPC grants/RLS, tenant isolation, direct-write denial, deterministic SQL, FX, anomaly idempotency and run-owned cleanup passed. No Gemini call: fixed org has no completed capture evidence.

## IN PROGRESS
- Capture is retained and webhook/ledger PASS. Phase 4 verifier now checks fee grounding/citations, cache replay, ignored hostile context, pending AI proposal, and HTTP daily-limit behavior. `node --check scripts/verify-phase4.js && npm test` PASS 104/104. Next restart only port-3000 server with per-user limit 2 for this process; no `.env` edits. `transactions` schema lacks a description column, so database-description injection will remain UNVERIFIED; client-context injection can be tested live. Current port 3000 process identified as NovaPay `node server/index.js` PID 66956. Next: restart it, check public `/api/status` and registered webhook, then one synthetic Gemini call; afterward create one Sandbox order and wait for buyer approval. Keep the successful capture; no refund.

## NEXT STEPS
1. PASS: restarted NovaPay on port 3000; public status and PayPal registration/event subscriptions verified.
2. Run one direct synthetic Gemini call via `services/llm.js`; record model/latency/tokens or exact safe provider error.
3. Resume the existing single $1 order in fixed Phase 4 org using deterministic request key; print approval URL and wait for user approval. Keep its capture; remove only this run's other rows.
4. Run evidence-grounded chat, repeat cache, ignored hostile context, AI proposal pending, tiny HTTP budget. Transaction description field is absent; mark that live subcheck UNVERIFIED.
5. Add `--safe` modes to Phase 2/3 verifiers and run non-payment/non-invoice subsets.
6. Run final gate, update docs, commit if no FAIL, report; never push; ask before Phase 5.

## USER ACTIONS PENDING
- None currently. To verify remaining live Gemini/cache/injection checks later, the fixed Phase 3 test organization needs a completed capture with non-sensitive evidence; do not create one without an explicitly authorized Sandbox flow.

## LIVE STATE
- Migrations 0001–0005 reported applied by user; read-only probes confirmed 0005 tables and RPCs.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.
- NovaPay on port 3000 was restarted to load current T8 code; `/api/status` HTTP 200 authenticated. Tunnel and unrelated port 34872 untouched.
- Previous Phase 4 verifier made no Gemini/PayPal calls. Server restarted; PID 67892 listens on 3000. Public `/api/status` returned HTTP 200 authenticated; PayPal registration preflight matched the provided tunnel host, `/api/webhook`, and capture/refund-completed subscriptions. One synthetic Gemini call completed through `services/llm.js`: HTTP 200, model `gemini-3.5-flash-lite`, 2138 ms, 59 input/39 output tokens. Probe JSON-shape check failed; response suppressed. One synthetic Gemini call completed. The single $1 order has been approved/captured; signed webhook verified/processed; 1 capture transaction and 1 journal entry ($1.00 gross, $0.40 fee, $0.60 net). Capture retained; no refund. Interactive runner finished PASS. Tunnel hostname from user: `cheaper-approximate-advances-keyboard.trycloudflare.com`; webhook path `/api/webhook`. Invoice sending remains SIMULATED.

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
- Evidence-backed live Gemini checks are in progress now that one real capture exists. Gemini smoke adapter returned HTTP 200 but its tiny probe did not match the minimal JSON shape. Unit tests cover budget no-call, cache, and injection behavior.
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
