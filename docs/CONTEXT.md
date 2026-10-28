# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-28 (Asia/Kolkata)
- Branch: `phase5-backend`
- Last code checkpoint: `0401e44`; this diagnostic checkpoint pending
- Current task: cross-tenant document rerun stopped at AI budget 429

## DONE
- Phase 5 Parts 1–4 complete; migrations 0015/0016 applied/live-verified.
- Fresh baseline: `npm ci`; `npm test` 164/164; `npm run check:migrations` 16/16.
- Fixed owner A membership is org A only; fixed owner B is org B only and has no org A membership. B probe headers were configured with B's own JWT and org B `X-Org-Id`; no service-role credential used for B probes.
- Server health HTTP 200. One synthetic sample uploaded HTTP 201; processing HTTP 429 `AI_DAILY_LIMIT`; this run's document cleanup HTTP 200. Server stopped.

## IN PROGRESS
- Cross-tenant subchecks (a) hybrid AI/search RPC, (b) list/get, (c) Storage RLS, (d) org A positive control are UNVERIFIED; none ran because sample processing hit 429.
- Loaded limits: 5 user/20 org. Correct request-count query: remaining user budget 0, org budget 15. AI budgets count non-cache ai_usage rows, not tokens.
- No fix applied. Prior token-based budget estimate was invalid and is corrected in TEST-REPORT.md.

## NEXT STEPS
1. Await user's direction or configuration change; current `AI_DAILY_USER_LIMIT` is 5 in loaded config.
2. After authorization/budget availability, process one synthetic sample and verify chunk count.
3. Run each requested Org B API/RPC/Storage check separately and positive-control Org A AI question; record status/counts only.
4. Run deletion cascade only after required probes complete; clean only run-created rows.

## USER ACTIONS PENDING
- Ensure raised AI user limit is present in `.env` and direct a fresh rerun after any budget reset.
- Browser checklist remains pending.

## LIVE STATE
- Server stopped; last health HTTP 200 before test.
- Fixed users/orgs reused; no identities created.
- Migrations 0001–0016 applied; no migration changed.
- Key names only: `GEMINI_API_KEY`, `AI_DAILY_USER_LIMIT`, `AI_DAILY_ORG_LIMIT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Setup memberships/JWT scope | PASS | A belongs to org A; B belongs to org B/no org A; intended B calls use B JWT/org B. |
| Sample upload/process | FAIL | Upload 201; process 429 AI_DAILY_LIMIT; cleanup 200. |
| Remaining budget | 0 user, 15 org | ai_usage request counts 5/5 and 5/20. |
| (a) hybrid AI/search RPC | UNVERIFIED | Not run after 429. |
| (b) list/get | UNVERIFIED | Not run after 429. |
| (c) Storage RLS | UNVERIFIED | Not run after 429. |
| (d) Org A positive control | UNVERIFIED | Not run after 429. |

## KNOWN ISSUES AND RISKS
- Loaded user limit is still 5; user says it was increased but this process/config did not reflect that change.
- No Org B probe executed in this rerun; no leak conclusion can be drawn.
- `.env.example` has an unrelated existing modification; leave it untouched.

## LESSONS LEARNED
- SQL Editor is transactional; never edit applied migrations; add numbered migrations.
- SECURITY DEFINER/posting RPCs revoke public/anon/authenticated and grant only service_role; prove ordinary JWT denial.
- PostgREST embeds need explicit FK names with multiple relationships.
- audit_log is insert-only/ON DELETE RESTRICT; cleanup journal entries, audit_log, organizations, auth.users; reuse fixed users/orgs.
- PayPal sandbox US Personal buyer, USD seller, Visa; webhook ends `/api/webhook`; raw body required for signature verification.
- Never print `.env` values or JWTs.

## DO NOT LIST
- Never push; do not touch main/backend/protected design files; no force; do not weaken tests/edit applied migrations/commit `.env`.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- `npm test`
- `npm run check:migrations`
