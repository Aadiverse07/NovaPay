# NovaPay Phase 5 Planning Handoff

## HEADER
- Updated: 2026-10-28 Asia/Calcutta.
- Branch: `phase5-backend`, created from updated `origin/main`; current HEAD `a2a5eb26a0a6319fbb3595d2804124dcf1acf498`.
- Phase/task: Phase 5 PLANNING ONLY, task 3/5; blocked pending the Build Blueprint PDF. No Phase 5 code started.

## DONE
- Saved the prior uncommitted post-merge-sync WORKLOG and its delta to `/tmp/novapay-post-merge-sync-WORKLOG.md` and `.patch`; re-applied the branch-switch entry on phase5-backend.
- Updated local main from origin/main and created `phase5-backend` from it; no code/commit/push on main.
- `npm ci` PASS: 89 packages, 0 vulnerabilities.
- `npm test` PASS: 135/135.
- `npm run check:migrations` PASS: 0001–0014 parse.
- Read WORKLOG pointer, CONTEXT, newest TEST-REPORT and DECISIONS entries.
- Inspected `/Users/aditya/Paypal_hackathon/PaypalFinal.png`; Week 5 visibly lists community/automation, fundraising and maintenance fund management, invoice automation, rate limiting/security, UX polish/testing.

## IN PROGRESS
- Exact task: planning only; the referenced NovaPay Build Blueprint PDF was not found in repo, Codex attachments, Downloads, Desktop, or the user workspace search.
- Files edited this task: `docs/WORKLOG.md`, `docs/TEST-REPORT.md`, `docs/CONTEXT.md`, `docs/DECISIONS.md`.
- Do not infer detailed tasks, files, migrations, acceptance criteria, or simulation boundaries from the image alone.

## NEXT STEPS
1. Ask the user to reattach the NovaPay Build Blueprint PDF or provide its exact accessible path.
2. Read its Phase 5 section alongside `PaypalFinal.png`.
3. Write the requested planning-only scope: tasks, files, migrations, later acceptance statuses, and simulated boundaries.
4. Commit the plan docs locally and reply `AWAITING PLAN OK`.
5. Do not write Phase 5 code until the user replies `PLAN OK`.

## USER ACTIONS PENDING
- Provide the missing NovaPay Build Blueprint PDF (reattach it or provide an accessible exact path).
- After receiving the plan, explicitly reply `PLAN OK` before any Phase 5 implementation.

## LIVE STATE
- Prior user-confirmed migrations 0001–0014 applied; 0003 applied. No migration was changed or applied in this task.
- Tunnel/webhook status was not rechecked this task; user last reported them fixed.
- Tests this task were local only; no real Supabase, PayPal, webhook, or browser checks were run.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `GEMINI_API_KEY`.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| Dependency install | PASS, 89 packages, 0 vulnerabilities | 2026-10-28 | `npm ci` |
| Unit suite | PASS 135/135 | 2026-10-28 | `npm test` |
| Migration parser | PASS, 14 files | 2026-10-28 | `npm run check:migrations` |
| Blueprint Phase 5 scope | UNVERIFIED | 2026-10-28 | PDF not located; user input needed |
| PaypalFinal.png | inspected | 2026-10-28 | visual review |

## KNOWN ISSUES AND RISKS
- Phase 5 scope is not sufficiently specified without the Blueprint; the image provides only a high-level roadmap card.
- Invoice sending and maintenance payouts remain SIMULATED in the existing product; Phase 5 scope may change only if the Blueprint explicitly says so.
- Browser checklist from prior work remains pending.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; errors roll everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary user JWT gets 403.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- `audit_log` is insert-only with ON DELETE RESTRICT; cleanup journal_entries first, then audit_log, organizations, auth.users using `scripts/cleanup-phase2-test-data.sql`; reuse fixed users/orgs.
- PayPal Sandbox buyer must be a US Personal account; seller USD only; use Visa at checkout; webhook URL ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Never push; never force-push; do not touch main beyond the requested fetch/pull.
- Do not write Phase 5 code until explicit `PLAN OK`.
- Do not edit applied migrations or protected design files; do not weaken tests or commit `.env`.

## RESUME COMMANDS
```sh
git branch --show-current
git status --short --branch
npm test
npm run check:migrations
```
