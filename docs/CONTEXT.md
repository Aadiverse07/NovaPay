# NovaPay Continuity Context

## HEADER
- Date/time: 2026-11-01 Asia/Kolkata
- Branch: `fix-download-campaigns`, created from `origin/main` after invoice PR #12 merged (`5d6ff72`). No push.
- Last base commit: `5d6ff72`; latest local task commit: `904e536`.
- Phase/task: invoice download error handling and Community Funds campaign-create wiring.

## DONE
- Invoice table now has one row action, View. Download PDF remains in the detail dialog and uses authenticated blob fetch/save.
- Download failures map 401/404/429/5xx to session-expired/not-found/rate-limited/server-error toasts. Added safe server log fields (request ID, HTTP status, code only); regression covers a 503 audit failure.
- Live fundraising renderer is loaded and targets the actual `#view-community-funds` element. Authenticated mode hides static illustrative campaign content and reads org-scoped campaigns/summaries; demo mode retains labeled illustrative content.
- Campaign create modal now validates title, purpose, USD target, deadline and organiser; converts major to minor using the ISO exponent; locks submit during the request; posts to `/api/funds/campaigns`, closes on success and reloads live campaigns.
- Server campaign list includes membership role for UI controls; server RBAC still enforces owner/admin/accountant writes. Campaign-specific contributions load through the read-only transparency route.
- Maintenance and Transparency activation was left unchanged. No migration or dependency change.
- Edited: `src/invoices-live.js`, `src/modules.js`, `src/fund-views.js`, `dashboard.html`, `server/src/routes/invoices.js`, `server/src/routes/funds.js`, `server/test/invoice-download.test.js`, `server/test/fund-campaign-live-view.test.js`, `docs/API.md`, `docs/FRONTEND-CONTRACT.md`, `docs/DECISIONS.md`, `docs/TEST-REPORT.md`, `docs/CONTEXT.md`, `docs/WORKLOG.md`.

## IN PROGRESS
- Focused tests passed 10/10, and strengthened campaign assertions 2/2. Full suite 203/204 (known no-store failure only); migration check 18/18; syntax 6/6; diff check PASS; protected-file diff empty. Local WIP commit remains.
- Fixed-owner live checks and the original server request log are unavailable: no browser automation or fixed owner credentials are available. Do not create users. Actual live PDF response status/bytes and campaign create/list/cleanup remain UNVERIFIED.

## NEXT STEPS
1. Run `npm test`, `npm run check:migrations`, `node --check` on changed JS, `git diff --check`, and protected-file diff.
2. Append every test result to `docs/TEST-REPORT.md` and update this handoff and WORKLOG RESUME POINTER.
3. Commit locally on `fix-download-campaigns`; never push.
4. Human browser checks: owner sign in → Invoices → View → Download PDF; check file opens and is named `invoice-<number>.pdf`. Then Community Funds → Start a campaign → submit valid details → verify one new live card and amounts; open View contributions. Repeat read-only as viewer/donor/resident.

## USER ACTIONS PENDING
- Run the browser checks above with existing users and sample campaign data only. No fixed owner API credentials were available for live verification in this run.

## LIVE STATE
- No live invoice download or campaign mutation was attempted; no rows created or cleaned up. No Gemini or PayPal calls made.
- No migration needed.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| Focused invoice/campaign suite | PASS | 10/10 local tests; includes PDF 200, simulated audit 503, campaign owner 201, viewer 403 and org scoping |
| Campaign scope and amount assertions | PASS | 2/2, including cross-org ID exclusion and currency exponent conversion |
| Fixed-owner live PDF bytes | UNVERIFIED | No browser session or fixed owner credentials |
| Fixed-owner campaign create/list/cleanup | UNVERIFIED | No browser session or fixed owner credentials |
| `npm test` | FAIL | 203/204; known no-store assertion only |
| `npm run check:migrations` | PASS | 18/18 |
| `node --check` changed JS | PASS | 6/6 |
| `git diff --check` | PASS | clean |
| Protected-file diff | PASS | empty |

## KNOWN ISSUES AND RISKS
- The original live invoice download request log is unavailable. Code confirms the generic API error handler replaces all 5xx messages with “The request could not be completed”; added route logging records safe status/code for future diagnosis. A simulated audit write failure returns HTTP 503 `DATABASE_UNAVAILABLE`; this does not prove that was the original live failure.
- Campaigns remain USD because the existing audited RPC and supported Sandbox flow are USD-only.

## LESSONS LEARNED
- Supabase SQL Editor runs in one transaction; never edit applied migrations.
- SECURITY DEFINER/posting RPCs must revoke execution from public/anon/authenticated and grant service_role only.
- PostgREST embeds need explicit foreign-key names when multiple relationships exist.
- audit_log is insert-only with ON DELETE RESTRICT; test cleanup removes journal rows first.
- PayPal Sandbox webhook URL ends `/api/webhook`; raw body is needed for signature verification.
- Never print `.env` values; record key names only.

## DO NOT
- Never push, create users, call Gemini/PayPal, edit protected design files, weaken tests, or commit `.env`.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
