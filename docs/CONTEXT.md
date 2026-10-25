# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-25 Asia/Kolkata.
- Branch: `frontend-wiring` (confirmed this session; user says this overrides the master prompt branch rule).
- Last commit: `c1c95fe WIP Frontend wiring task 3: API data`.
- Current phase/task: Frontend wiring, task 4 complete; proceed to task 5 (Invoices and Reports views).

## DONE
- Phase 3 completed; invoice sending remains SIMULATED.
- Phase 4 T0–T8 implemented and previously verified; evidence is in `docs/TEST-REPORT.md` and `docs/DECISIONS.md`.
- Re-read `dashboard.html`, `preview.html`, and all JavaScript files under `src/` at the start of this session, as requested.
- Confirmed current branch is `frontend-wiring`.

## IN PROGRESS
- Task: Task 5 — wire invoice and report views to API, add CSV download, keep invoice sending explicitly SIMULATED.
- Checkpoint commits: task 1 `a8a05b0`; task 2 `cb11f22`; task 3 `c1c95fe`; task 4 checkpoint is being finalized.
- Files for task 4: `src/dashboard.js`; continuity files. Existing chart structures retained.
- Task 4 done: KPI values use `/api/reports/profit-and-loss` and `/api/reports/fees`; cash flow uses `/api/reports/cash-movement`; FX uses `/api/fx/convert`, showing source, timestamp, and indicative label.
- Task 4 test evidence: JS syntax + diff check PASS; `npm test` PASS (104/104); browser/live UI UNVERIFIED.

## NEXT STEPS
1. Complete task 5 (Invoices/Reports API data and CSV export), update docs, and commit locally.
2. Complete task 6 (AI Assistant and notifications API), update docs, and commit locally.
3. Stop after task 6; task 7 will need a real login using the fixed named test user.

## USER ACTIONS PENDING
- Task 7 needs a real browser login using the fixed named test user; make that account available in the test browser/session when task 7 begins. Do not send its password or tokens in chat or commit them.

## LIVE STATE
- Supabase migrations 0001–0005 were reported applied; read-only probes confirmed 0005 tables/RPCs.
- Tunnel/webhook were previously configured and verified; webhook URL ended `/api/webhook`, matching webhook ID was set.
- One $1 PayPal Sandbox order was approved/captured; webhook verified/processed; one transaction/journal entry retained ($1 gross/$0.40 fee/$0.60 net). Do not make another PayPal call or refund.
- Phase 4 live grounded AI answer/cache and HTTP budget block were verified. Database-description injection and model-generated proposal remain UNVERIFIED. Phase 2 safe mode lacked named org fixtures; Phase 3 safe mode passed.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.
- Invoice sending remains SIMULATED. No live check was run this session.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Unit suite | PASS | 2026-10-25 | `npm test`: 104 passed, 0 failed (last recorded run) |
| Migration parser | PASS | 2026-10-25 | `npm run check:migrations`: 0001–0005 accepted by PostgreSQL 17 parser |
| JS syntax and diff | PASS | 2026-10-25 | `find server scripts -name '*.js' -print0 \| xargs -0 -n1 node --check`; `git diff --check` |
| Runtime dependency audit | PASS | 2026-10-25 | `npm audit --omit=dev`: 0 vulnerabilities |
| Phase 4 live verifier | PASS / UNVERIFIED | 2026-10-25 | Grounded answer/cache, hostile client context, budget block and RLS/RPC/FX passed; database description and live proposal unverified |
| Phase 2 safe subset | UNVERIFIED | 2026-10-25 | `node scripts/verify-phase2.js --safe`: root and 9 relations pass; named org fixtures absent |
| Phase 3 safe subset | PASS | 2026-10-25 | `node scripts/verify-phase3.js --safe`: root, 18 relations, fixed org A USD balance passed |
| Auth JavaScript syntax/diff | PASS | 2026-10-25 | `node --check src/auth.js && node --check src/landing.js && node --check src/dashboard.js && git diff --check` |
| Backend regression suite | PASS | 2026-10-25 | `npm test`: migrations 0001–0005 parsed; 104 passed, 0 failed |
| Task 1 scope hygiene | PASS | 2026-10-25 | Branch `frontend-wiring`; protected worktree diff empty; `.env` ignored |
| Supabase browser login/signup/reset/onboarding | UNVERIFIED | 2026-10-25 | Deferred to frontend wiring task 7; no real test user login was performed |
| Task 2 API client syntax | PASS | 2026-10-25 | `find src -type f -name '*.js' -print0 \| xargs -0 -n1 node --check && git diff --check` |
| Task 2 regression suite | PASS | 2026-10-25 | `npm test`: 104 passed, 0 failed; migrations 0001–0005 parsed |
| Task 3 JavaScript syntax/diff | PASS | 2026-10-25 | `find src -type f -name '*.js' -print0 \| xargs -0 -n1 node --check && git diff --check` |
| Task 3 regression suite | PASS | 2026-10-25 | `npm test`: 104 passed, 0 failed; migrations 0001–0005 parsed |
| Task 4 JavaScript syntax/diff | PASS | 2026-10-25 | `find src -type f -name '*.js' -print0 \| xargs -0 -n1 node --check && git diff --check` |
| Task 4 regression suite | PASS | 2026-10-25 | `npm test`: 104 passed, 0 failed; migrations 0001–0005 parsed |
| Task 4 authenticated browser report/FX requests | UNVERIFIED | 2026-10-25 | No browser session run |

## KNOWN ISSUES AND RISKS
- Real Supabase sign-up onboarding requires a returned session; if email confirmation is enabled, onboarding occurs after confirmation and sign-in.
- Phase 2 safe inspection cannot validate org-specific data because its named fixtures are absent; no fixture was created.
- Live database-description injection is unverified because transactions have no description field; live model-generated pending proposal is unverified.
- Gemini synthetic smoke returned HTTP 200 but did not match the tiny probe JSON shape; output was suppressed. Production grounded fee answer/cache were separately verified.
- Duplicate-payer and payout anomaly cases remain fixture-limited by available schema data.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs must revoke public/anon/authenticated execute, grant only service_role (or enforce membership), and be tested with ordinary JWTs.
- PostgREST embeds need explicit FK names when multiple relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; delete journal entries (lines with them) before audit rows, orgs and auth users. Reuse fixed test identities/orgs.
- PayPal Sandbox buyer must be US Personal, seller USD, Visa; webhook ID must match; signature verification needs raw bytes.
- PayPal invoice number max is 25 chars; use `DUE_ON_RECEIPT`; compare FX timestamps as instants; invoice sending stays SIMULATED.
- Check port 3000 process freshness after source edits; leave unrelated tunnel/processes untouched.
- Never print `.env` values, provider bodies, Authorization headers, stack traces, or sensitive evidence.

- Task 4 changed files: `src/dashboard.js`, `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`.

## DO NOT
- Do not push, edit protected design files, use `--force`, weaken tests, edit applied migrations, commit `.env`, call PayPal Invoicing, or invent financial evidence.
- Do not commit or push to `backend` or `main`; work and commit locally only on `frontend-wiring`.

## RESUME COMMANDS
- `git status --short`
- `git branch --show-current`
- `npm test`
- `npm run check:migrations`
- `find server scripts -name '*.js' -print0 | xargs -0 -n1 node --check`
