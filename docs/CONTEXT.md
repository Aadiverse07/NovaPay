# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-25 Asia/Kolkata.
- Branch: `frontend-wiring` (verified; local commits only).
- Last commit before this UI-fix checkpoint: `e5938fe Frontend wiring: task 7 API verification`.
- Current phase/task: Three frontend UI fixes complete; local checkpoint `443d9b9` (`Fix frontend UI data states and badges`).

## DONE
- Fixed favicon references in `dashboard.html` and `preview.html` using existing `assets/novapay-mark-clean.png`.
- AI Assistant badge uses the backend `response.route` (code/sql/llm) and exposes response `reason` on hover and to assistive technology.
- Demo dashboard shows persistent “Sample data · Demo workspace”. Authenticated organization mode shows API-backed loading/live data and empty states for sample-only ledger, documents, fundraising, maintenance, transparency, and financial health sections.
- Real dashboard metrics and FX begin in loading state; no illustrative values flash while organization API data loads. Missing report data shows empty/unavailable states.
- `src/fonts.css` and `src/tokens.css` are protected and unchanged. `assets/fonts/Montserrat-Variable.woff2` does not exist; only `assets/fonts/README.txt` is present. User needs to add the font asset.
- Files changed in this task: `dashboard.html`, `preview.html`, `src/dashboard.js`, `src/novapay-live.js`, `docs/CONTEXT.md`, `docs/TEST-REPORT.md`, `docs/DECISIONS.md`.

## IN PROGRESS
- None. Source review and diff hygiene are complete. Browser verification was not run. Task checkpoint `443d9b9` is committed; working tree was clean before this handoff-note update.

## NEXT STEPS
1. User adds `assets/fonts/Montserrat-Variable.woff2` to resolve the font 404; do not change `src/fonts.css` or `src/tokens.css`.
2. Browser-check favicon loading, AI badge hover/reason, demo sample label, and live empty states if desired.

## USER ACTIONS PENDING
- Add the Montserrat variable font at `assets/fonts/Montserrat-Variable.woff2`. The repository currently lacks this file; no substitute was created.

## LIVE STATE
- Supabase migrations 0001–0005 were previously reported applied. No migration/API/live run was performed for this UI patch.
- Existing tunnel/webhook and single $1 PayPal Sandbox capture are prior verified state; no PayPal requests were made for this patch.
- Last live API check from task 7: fixed user login/membership PASS; authenticated read APIs 8/8 HTTP 200; remaining report/CSV checks 5/5 HTTP 200.
- Never print `.env` values. Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL`.

## TEST STATE
| Check | Result | Date | Command/evidence |
|---|---|---|---|
| UI source/diff whitespace | PASS | 2026-10-25 | `git diff --check` |
| Montserrat WOFF2 repository presence | FAIL / user action pending | 2026-10-25 | `assets/fonts/Montserrat-Variable.woff2` absent; no protected stylesheet edit |
| Favicon browser request | UNVERIFIED | 2026-10-25 | Both pages explicitly reference existing PNG; browser not opened |
| AI route badge and reason tooltip | UNVERIFIED | 2026-10-25 | Source inspection only; browser hover not tested |
| Demo label and authenticated empty/live states | UNVERIFIED | 2026-10-25 | Source inspection only; browser runtime not tested |
| Automated/browser tests | UNVERIFIED | 2026-10-25 | Not run for this patch |

## KNOWN ISSUES AND RISKS
- Montserrat WOFF2 is missing, so requests from `src/fonts.css` can still 404 until the user adds the font.
- Browser runtime behavior of the favicon, tooltip, and conditional data presentation remains unverified.
- Organization ledger/documents/fundraising/maintenance/transparency views currently show explicit empty states because no live data client is wired for them.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; never edit an applied migration; add a new numbered file.
- SECURITY DEFINER/posting RPCs must revoke execute from public, anon, authenticated and grant only to service_role; prove ordinary-user JWT denial.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- `audit_log` is insert-only and ON DELETE RESTRICT; cleanup order: journal entries/lines, audit log, organizations, auth users; reuse fixed fixtures and `scripts/cleanup-phase2-test-data.sql`.
- PayPal sandbox buyer must be US Personal; seller USD; use Visa; webhook ends `/api/webhook` and `PAYPAL_WEBHOOK_ID` must match.
- Raw request body is required for PayPal signature verification.
- Never print `.env` values; use key names only.

## DO NOT
- Do not push, edit protected design files/assets, use `--force`, run `npm audit fix --force`, weaken tests, edit applied migrations, commit `.env`, or invent financial evidence.
- Protected UI files: `tokens.css`, `base.css`, `fonts.css`, `tailwind.novapay.preset.*`, `theme.js`, `hero-*`, `fx-*`, `logo-intro`, `capabilities-zoom`, `cta-reveal`, `novapay-logo*`, `assets/`.
- Never commit to `backend` or `main`; only use `frontend-wiring`.

## RESUME COMMANDS
- `git status --short`
- `git branch --show-current`
- `npm test`
- `npm run check:migrations`
- `find src -type f -name '*.js' -print0 | xargs -0 -n1 node --check`
