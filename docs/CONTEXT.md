# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-25 Asia/Kolkata.
- Branch: `frontend-wiring` (verified; work and commits stay local on this branch).
- Last commit: `706046b WIP Frontend wiring task 6: assistant and notifications`.
- Current phase/task: Frontend wiring tasks 1–6 complete; stop as requested. Task 7 browser walkthrough is next and unverified.

## DONE
- Task 1 auth: Supabase Auth uses the pinned CDN and public config; dashboard guarded; onboarding called after sign-up; sign-out and clearly labeled demo mode included.
- Task 2 shared API client: bearer JWT, organization header, structured/legacy errors, and 401/403 handling.
- Task 3 Transactions, Approvals, PayPal Sandbox: organization API data and server pending approval count.
- Task 4 Dashboard KPIs/cash flow and FX: reports endpoints; FX response source, timestamp and indicative label.
- Task 5 Invoices and Reports: invoice API list, report API summary/period data, server CSV download, invoice send labeled SIMULATED.
- Task 6 AI and notifications: assistant sends only `{ message }`; route, citations, usage/limit and insufficient-evidence display; DOM/local assistant fallback only in labeled demo mode; notification list/read/dismiss API.
- Re-read `dashboard.html`, `preview.html`, and `src/` JS files before frontend edits. No restyling or protected files changed.
- Checkpoint commits: task 1 `a8a05b0`; task 2 `cb11f22`; task 3 `c1c95fe`; task 4 `9a69ad9`; task 5 `f8de915`; task 6 `332ba67`.
- Files changed in frontend wiring tasks 1–6: `preview.html`, `dashboard.html`, `src/auth.js`, `src/landing.js`, `src/api-client.js`, `src/dashboard.js`, `src/novapay-live.js`, `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`.

## IN PROGRESS
- None. User requested stopping after task 6; task 7 is pending.

## NEXT STEPS
1. Use the fixed named test user in a real browser session.
2. Open every dashboard view; check browser console and failed network requests.
3. Check light/dark themes, prefers-reduced-motion and mobile drawer behavior.
4. Record each browser result (or UNVERIFIED) in `docs/TEST-REPORT.md`; then report overall PASS/FAIL/UNVERIFIED.

## USER ACTIONS PENDING
- Task 7 requires the fixed named test user to be available in the test browser. Do not send its password or session tokens in chat.

## LIVE STATE
- Supabase migrations 0001–0005 were previously reported applied; read-only probes confirmed 0005 tables/RPCs. No migration was run during frontend tasks.
- Tunnel/webhook were previously configured and verified; webhook path ended `/api/webhook`, and webhook ID matched. No live webhook test was run during frontend tasks.
- One $1 PayPal Sandbox capture and webhook processing were previously verified; no PayPal endpoint or refund was called during frontend tasks.
- Earlier live AI answer/cache and budget behavior were verified; database-description injection and model proposal remain unverified.
- Last live test run for frontend work: none. All frontend browser interactions remain UNVERIFIED.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Tasks 1–6 JS syntax and whitespace | PASS | 2026-10-25 | `find src -type f -name '*.js' -print0 \| xargs -0 -n1 node --check && git diff --check` (rerun after final task 6 change) |
| Tasks 1–6 backend regression suite | PASS | 2026-10-25 | `npm test`: migrations 0001–0005 parsed; 104 passed, 0 failed (tasks 4, 5, 6) |
| Protected-file diff | PASS | 2026-10-25 | `git diff --stat origin/main -- <protected files>` returned empty |
| `.env` hygiene | PASS | 2026-10-25 | `git check-ignore .env` returned `.env`; no `.env` committed |
| Authenticated browser: tasks 1–6 | UNVERIFIED | 2026-10-25 | No real-login walkthrough in this session |
| Light/dark, reduced motion, mobile drawer | UNVERIFIED | 2026-10-25 | No browser/device walkthrough |

## KNOWN ISSUES AND RISKS
- Invoice API payloads do not provide issue/due dates; UI shows unavailable instead of inventing dates.
- Cash movement report is monthly aggregate data; the existing chart maps positive/negative accounting movement into inflow/outflow series.
- Browser and live Supabase behavior for tasks 1–6 remains unverified until task 7.
- AI local answer remains available in demo mode only, explicitly labeled; live errors do not trigger local fallback.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime errors roll everything back. Never edit an applied migration; add a numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary-user JWT access is denied.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; clean test data in order: journal entries (lines with them), audit log, organizations, auth users, using `scripts/cleanup-phase2-test-data.sql`. Reuse fixed named test users/orgs.
- PayPal sandbox buyer must be a US Personal account; seller USD only; use Visa; webhook URL ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` must match.
- Raw request body is required for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Do not push, edit protected design files/assets, use `--force`, run `npm audit fix --force`, weaken tests, edit applied migrations, commit `.env`, or invent financial evidence.
- Never commit to `backend` or `main`; never edit protected UI/design files named in the wiring prompt.

## RESUME COMMANDS
- `git status --short`
- `git branch --show-current`
- `npm test`
- `npm run check:migrations`
- `find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check`
