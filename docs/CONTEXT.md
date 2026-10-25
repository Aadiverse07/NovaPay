# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-25 Asia/Kolkata.
- Branch: `frontend-wiring` (verified; local commits only).
- Last commit before task 7 documentation checkpoint: `ed36605` (task 6 wiring).
- Current phase/task: Frontend wiring task 7; API verification complete. Browser-only walkthrough remains unverified.

## DONE
- Tasks 1–6 frontend wiring completed and checkpointed locally: Auth; authenticated API client; Transactions/Approvals/Sandbox; reports/KPIs/cash flow/FX; Invoices/Reports/CSV; AI/notifications.
- Task 7 used an admin-generated, one-time Supabase magic-link hash for fixed owner `novapay-phase3-owner-a@example.test`, verified it into a real user session, and retained token/org only in process memory.
- Task 7 confirmed fixed owner membership in existing `NovaPay Phase 3 Verification A` and completed 8/8 authenticated read API checks plus 5/5 report/CSV checks (all HTTP 200). No user/org was created; no password reset/email sent; no AI, notification mutation, invoice action, or PayPal endpoint called.
- Browser-only checklist and UNVERIFIED statuses are in `docs/TEST-REPORT.md`. Task 7 changed only `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, and `docs/DECISIONS.md` (plus those files updated during earlier tasks).
- Frontend files changed across tasks 1–6: `preview.html`, `dashboard.html`, `src/auth.js`, `src/landing.js`, `src/api-client.js`, `src/dashboard.js`, `src/novapay-live.js`. Continuity docs updated throughout.
- Task commits: 1 `a8a05b0`; 2 `cb11f22`; 3 `c1c95fe`; 4 `9a69ad9`; 5 `f8de915`; 6 task checkpoint `ed36605`.

## IN PROGRESS
- None. API verification is done; browser checks require a human with access to the test account's normal sign-in/recovery channel.

## NEXT STEPS
1. Human: follow “Frontend wiring task 7 — browser-only manual walkthrough” in `docs/TEST-REPORT.md`.
2. Update that report with observed browser results; do not mark any unrun check PASS.

## USER ACTIONS PENDING
- Browser walkthrough: sign into `http://localhost:3000/preview.html#login` as `novapay-phase3-owner-a@example.test` with its authorized password. If unavailable, use Forgot password only if its test inbox is accessible.
- Open all 12 views; inspect DevTools Console and Network; check light/dark, reduced-motion, 390×844 mobile drawer, notifications and one AI chat. Exact steps are in `docs/TEST-REPORT.md`.
- Do not share the password, recovery OTP/link, access token, or session data in chat.

## LIVE STATE
- Migration status: 0001–0005 previously reported applied to the real Supabase project; task 7 did not run migrations. Authenticated read APIs for report, ledger, invoices, notifications, FX, transactions, and approvals returned HTTP 200.
- Existing tunnel/webhook were previously reported configured and verified; task 7 did not send webhook or PayPal requests.
- The earlier single $1 Sandbox capture remains; no payment/refund was called this session.
- AI request was intentionally not called to avoid consuming fixed-user/org quota; notification actions were not mutated.
- Last live checks: fixed-user Supabase login and membership PASS; authenticated reads 8/8 HTTP 200; remaining report/CSV reads 5/5 HTTP 200. Browser behavior UNVERIFIED.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| Task 7 server preflight | PASS | 2026-10-25 | Existing port 3000 listener; `GET /api/status` HTTP 200 |
| Fixed owner login/membership | PASS | 2026-10-25 | Admin `generate_link` + Auth verify; existing owner membership; token/org held in memory only |
| Authenticated GET API set | PASS | 2026-10-25 | Transactions, approvals, pending count, ledger trial balance, invoices, P&L, FX, notifications: 8/8 HTTP 200 |
| Additional reports and CSV | PASS | 2026-10-25 | Trial balance, fees, refunds, cash movement, P&L CSV: 5/5 HTTP 200; CSV content type `text/csv` |
| Browser views, console/network, themes, motion, mobile drawer, notifications, AI chat | UNVERIFIED | 2026-10-25 | No browser UI session; exact manual steps in `docs/TEST-REPORT.md` |
| Tasks 1–6 syntax/regression | PASS | 2026-10-25 | JS syntax + diff check PASS; `npm test`: 104 passed, 0 failed |
| Protected-file diff / `.env` hygiene | PASS | 2026-10-25 | Protected path diff empty; `.env` ignored; no secret values printed |

## KNOWN ISSUES AND RISKS
- The fixed account has no password configured in environment; browser login needs its authorized password or access to its recovery inbox. Do not reset its password for this walkthrough.
- Invoices and notifications had zero rows in the existing test organization; empty states are expected, but mutation/action UI behavior remains browser-unverified.
- No AI chat API request was made in task 7. Browser AI chat must be limited to one test request to avoid unnecessary quota use.
- Browser console/network, light/dark, reduced motion and mobile behavior remain UNVERIFIED.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; syntax/runtime errors roll everything back. Never edit an applied migration; add a numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary-user JWT denial.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup order: journal entries/lines, audit log, organizations, auth users; reuse fixed named fixtures and `scripts/cleanup-phase2-test-data.sql`.
- PayPal sandbox buyer must be US Personal; seller USD only; use Visa; webhook ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` must match.
- Raw request body is required for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Do not push, edit protected design files/assets, use `--force`, run `npm audit fix --force`, weaken tests, edit applied migrations, commit `.env`, call PayPal Invoicing, or invent financial evidence.
- Protected UI files: `tokens.css`, `base.css`, `fonts.css`, `tailwind.novapay.preset.*`, `theme.js`, `hero-*`, `fx-*`, `logo-intro`, `capabilities-zoom`, `cta-reveal`, `novapay-logo*`, and `assets/`.
- Never commit to `backend` or `main`; only use `frontend-wiring`.

## RESUME COMMANDS
- `git status --short`
- `git branch --show-current`
- `npm test`
- `npm run check:migrations`
- `find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check`
