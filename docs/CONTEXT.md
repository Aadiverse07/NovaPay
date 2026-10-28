# NovaPay Continuity Context

## HEADER
- Date/time: 2026-10-28 (Asia/Kolkata)
- Branch: `phase5-backend`
- Baseline checkpoint: `cc05f1c`; latest diagnostic checkpoint: `b97ac39` (local, not pushed)
- Current task: diagnose document processing HTTP 503; no push

## DONE
- Phase 5 Parts 1–4 complete; migrations 0015/0016 applied and live-verified; Documents view wired.
- Baseline after `npm ci`: `npm test` PASS 164/164; `npm run check:migrations` PASS 16/16.
- Protected-file diff was empty in Part 4.
- Live diagnostic used existing fixed Phase 3 owner A/org A and one generated synthetic PDF: upload 201, processing 503 `OCR_NOT_CONFIGURED`, cleanup DELETE 200. No users/orgs created; server stopped.

## IN PROGRESS
- 503 root cause for this run: `GEMINI_API_KEY` is absent from the process environment and loaded config. Checked presence booleans only; never read or printed key content.
- No code change is indicated until the secret is configured. Server logs show request statuses but no provider details.

## NEXT STEPS
1. Human adds `GEMINI_API_KEY` to `.env`; do not inspect or print its value.
2. Restart `npm start`; use one synthetic sample upload and confirm processing/indexing.
3. If successful, run cross-tenant retrieval, delete cascade and Storage-object RLS checks with fixed users/orgs; log each result.
4. Browser checklist remains pending. Push/PR only after explicit authorization; Phase 7 only if time remains.

## USER ACTIONS PENDING
- Add `GEMINI_API_KEY` to `.env` and direct the agent to resume; restart server after configuration.
- Complete `docs/BROWSER-CHECKLIST.md` with sample documents only.
- Push/PR authorization is still pending.

## LIVE STATE
- Migrations 0001–0016 user-confirmed applied; 0015/0016 live-verified.
- Fixed owner A/B and org A/B preflight passed previously; last diagnostic used owner A/org A only.
- Latest API health HTTP 200; upload 201; process 503; cleanup 200. Server stopped.
- Key names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.

## TEST STATE
| Check | Status | Evidence |
|---|---|---|
| `npm ci` | PASS | 94 added, 95 audited, 0 vulnerabilities; protobufjs install script warning. |
| `npm test` | PASS 164/164 | Fresh dependency install baseline. |
| `npm run check:migrations` | PASS 16/16 | Standalone parser run. |
| Document processing | FAIL | API returned `OCR_NOT_CONFIGURED`; no sample indexed. |
| Cross-tenant retrieval | UNVERIFIED | Not run after processing failure. |
| Delete cascade | UNVERIFIED | Cleanup DELETE 200; cascades not queried. |
| Storage-object RLS | UNVERIFIED | Other-org JWT probe not run. |
| Duplicate/wrong-total/injection | PASS | Existing Part 4 test evidence in TEST-REPORT.md. |

## KNOWN ISSUES AND RISKS
- OCR configuration is unavailable until human adds GEMINI_API_KEY and restarts.
- Cross-tenant, actual delete cascade, Storage RLS and browser checks remain unverified.
- `npm ci` warned that @launchql/protobufjs postinstall was not approved/executed; tests still passed.

## LESSONS LEARNED
- Supabase SQL Editor is transactional; never edit an applied migration; add a numbered file.
- SECURITY DEFINER/posting RPCs revoke public/anon/authenticated and grant only service_role; prove ordinary JWT denial (403).
- PostgREST embeds need explicit FK names when multiple relationships exist.
- audit_log is insert-only/ON DELETE RESTRICT; cleanup journal entries, audit_log, organizations, auth.users. Reuse fixed users/orgs.
- PayPal sandbox buyer US Personal; seller USD; Visa; webhook ends `/api/webhook`; ID matches. Raw body is required for signature verification.
- Never print `.env` values; use key names only.

## DO NOT LIST
- Never push without explicit authorization; do not touch main/backend or protected design files; never force; do not weaken tests, edit applied migrations, or commit `.env`.

## RESUME COMMANDS
- `git branch --show-current`
- `git status --short`
- `git log --oneline -5`
- `npm test`
- `npm run check:migrations`
