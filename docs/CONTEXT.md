# NovaPay Post-Merge Sync Handoff

## HEADER
- Updated: 2026-10-28 Asia/Calcutta.
- Branch: `post-merge-sync`, created from `origin/main` at `af42d6b`; tested sync commit `febb024` is local, push pending.
- Current phase/task: PREP BEFORE PHASE 5, sync task 6/7. Phase 5 has not started.
- Last completed code/document checkpoint: `febb024` (local on post-merge-sync).

## DONE
- PRs #3 and #4 (fund-wiring) and teammate PR #5 are merged to main; main also includes the later UI sync commit `9b5fe89` and merge `af42d6b`.
- `origin/main` health checked in a detached temp worktree: `npm ci` PASS (89 packages), `npm test` PASS 131/131, migrations 0001–0014 PASS.
- Phase 6 backend pieces confirmed on main: `server/index.js`, `server/src/routes/funds.js`, `supabase/migrations/0001`–`0014`, `scripts/verify-phase6-maintenance-live.js`, `src/`, `docs/`.
- PR #5 first-parent diff: 12 icon assets plus dashboard/preview and UI source/CSS modules (33 files, 1,866 insertions, 46 deletions). It did not change root `server.js`.
- Selective sync carries: repeat-safe maintenance verifier and tests; `/api/events` empty fallback and test; API `cache: no-store` and test; assistant response route/reason/citations and message-only request wiring.

## IN PROGRESS
- Exact task: push the tested Phase 6 follow-up checkpoint on `post-merge-sync`; no Phase 5 work has started.
- Edited files: `scripts/phase6-maintenance-run.mjs`, `scripts/verify-phase6-maintenance-live.js`, `server/src/routes/status.js`, `server/test/api-client.test.js`, `server/test/phase6-maintenance-run.test.js`, `server/test/routes.test.js`, `src/api-client.js`, `src/dashboard.js`, `src/novapay-live.js`, `docs/BROWSER-CHECKLIST.md`, `docs/CONTEXT.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/WORKLOG.md`.
- Main HTML, styling, protected design files, and `assets/` remain from main; no conflict markers/unmerged paths were found.

## NEXT STEPS
1. Push only with `git push -u origin post-merge-sync`; never push `fund-wiring` or `main`.
2. Confirm zero unpushed commits.
3. Complete `docs/BROWSER-CHECKLIST.md` manually; then await explicit Phase 5 approval. Do not start Phase 5 yet.

## USER ACTIONS PENDING
- Fill PASS/FAIL for browser-only steps in `docs/BROWSER-CHECKLIST.md` (sign-in/dashboard, events Network/console, AI badge/hover, Fundraising/Maintenance/Transparency, theme, mobile drawer, notifications).
- Review/merge the new sync PR after push.
- Explicitly approve Phase 5 with “APPROVED: start Phase 5”.

## LIVE STATE
- User-confirmed migrations 0001–0014 applied; 0003 status: applied. No migrations changed in this sync.
- User previously reported tunnel and webhook fixed; current tunnel/webhook state not rechecked in this task.
- No live API/browser tests run in this sync. Last captured live T3 verifier PASS was 2026-10-27; see TEST-REPORT/WORKLOG.
- Config key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `GEMINI_API_KEY`.

## TEST STATE
| Check | Status | Date | Command |
|---|---|---|---|
| Main install | PASS, 89 packages, 0 vulnerabilities | 2026-10-28 | `npm ci` in detached `origin/main` worktree |
| Main unit suite | PASS 131/131 | 2026-10-28 | `npm test` in detached `origin/main` worktree |
| Main migrations | PASS 14/14 | 2026-10-28 | `npm run check:migrations` in detached `origin/main` worktree |
| Synced unit suite | PASS 135/135 | 2026-10-28 | `npm test` |
| Synced migrations | PASS 14/14 | 2026-10-28 | `npm run check:migrations` |
| Changed JS/MJS syntax | PASS, 9 files | 2026-10-28 | explicit loop of `node --check` |
| `git diff --check` | PASS | 2026-10-28 | `git diff --check` |
| Conflict-marker scan | PASS, no unresolved markers | 2026-10-28 | grep scan across source/docs, excluding node_modules |
| Protected paths | PASS, empty diff | 2026-10-28 | `git diff --stat origin/main -- <protected paths>` |
| Browser/manual checks | UNVERIFIED | 2026-10-28 | `docs/BROWSER-CHECKLIST.md` |

## KNOWN ISSUES AND RISKS
- Main's root `server.js` is a legacy standalone server added in 9b5fe89 after PR #5; package startup uses `server/index.js`, which remains present. Do not use root server as backend replacement.
- `git cherry` marks many old commits as unmatched because PR #4 was squash-merged; use the file-level diff and recorded selected changes, not cherry-pick all history.
- Browser verification remains pending. First historical live verifier invocation remains UNVERIFIED; later captured invocations passed.
- Invoice sending and maintenance payouts are SIMULATED; this is not for real money.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; errors roll back all. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary user JWT receives 403.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- `audit_log` is insert-only with ON DELETE RESTRICT; delete journal_entries first, then audit_log, organizations, auth.users using `scripts/cleanup-phase2-test-data.sql`; reuse fixed users/orgs.
- PayPal Sandbox buyer must be a US Personal account; seller USD only; use Visa at checkout; webhook URL ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` matches.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Never push `fund-wiring` or `main`; never force-push; only push `post-merge-sync` under current authorization.
- Do not start Phase 5 until explicit approval.
- Do not edit protected files (`tokens.css`, `base.css`, `fonts.css`, `tailwind.novapay.preset.*`, `theme.js`, hero/fx/brand reveal/logo files, or `assets/`).
- Do not edit applied migrations, weaken tests, or commit `.env`.

## RESUME COMMANDS
```sh
git branch --show-current
git status --short --branch
npm test
npm run check:migrations
git diff --check
git log origin/main..post-merge-sync --oneline
```
