# NovaPay Context

## HEADER
- Date: 2026-11-01; branch `publish-main-sync`, based on fetched `origin/main`; task: publish accumulated local NovaPay changes to `main` with explicit user authorization.
- Source checkpoint: `fix-fx-otp-maintenance` at `af21d01`; publication branch is a squash integration on top of current `origin/main`.

## DONE
- Preserved `origin/main` changes, including invoice PDF audit repair (migration 0021) and its mainline history.
- Integrated the accumulated source-branch changes: authenticated OTP/login redirect handling, Gemini multi-key fallback, FX provider and currency conversion, Maintenance live wiring/activity read, campaign wiring, API/auth updates, tests, and migration 0020.
- `.env` is untracked and ignored; no credential values were printed.

## IN PROGRESS
- Integrated publication commit `59c2046` plus journal checkpoint `8c5ae7f` were fast-forward pushed to `origin/main`; remote ref verified against `8c5ae7f58a2696b39fcf8a418c83cb3e73529a5f`. The full update is published; remote main was verified at `c3b5a75ec9988e45fb69715156dc60ce51d79964`, with a final journal-only checkpoint following.
- Relevant new migration from the source branch: `supabase/migrations/0020_fund_maintenance_activity_read.sql`; migration 0021 is already part of current main. Neither migration application state is verified by this local publish task.

## NEXT STEPS
1. Review staged diff and verify no conflict markers or secrets.
2. Run `npm test`, `npm run check:migrations`, JS syntax checks, and `git diff --check`; record exact outcomes.
3. Commit the integrated delta locally on `publish-main-sync`.
4. Verify the documentation-only handoff commit is fast-forwarded to `origin/main`; keep `.env` untracked and do not force-push.

## USER ACTIONS PENDING
- No action before local checks. If migration 0020 or 0021 is not applied in the target Supabase project, apply it through the documented SQL Editor steps before relying on its feature.

## LIVE STATE
- No live provider call or migration application was performed during this publication checkpoint. No credentials or JWTs are recorded.
- Migrations 0020 and 0021 application status: UNVERIFIED here.

## TEST STATE
| Check | Result | Date | Command/details |
|---|---|---|---|
| Full tests | FAIL 249/250 | 2026-11-01 | `npm test`; sole failure is known no-store assertion (`Cache-Control` undefined). |
| Migration parser | PASS 21/21 | 2026-11-01 | `npm run check:migrations` |
| JS syntax and whitespace | PASS | 2026-11-01 | `node --check` staged JS/MJS; `git diff --check` |
| Secret scan | PASS | 2026-11-01 | PASS; no credential-shaped tokens, `.env` untracked, protected-file diff empty, no conflict markers. |

## KNOWN ISSUES AND RISKS
- Previous source baseline had one known no-store assertion failure; do not weaken it.
- Live Supabase migration state and live provider behavior are not verified by this task.
- Main has newer changes than the source branch; preserve them during final diff review.

## LESSONS LEARNED
- Supabase SQL Editor runs inside one transaction; a syntax or runtime error rolls everything back. Never edit an applied migration; add a new numbered file.
- Every SECURITY DEFINER or posting RPC must revoke execute from public, anon, authenticated and grant it only to service_role; prove it with an ordinary JWT (expect 403).
- PostgREST embeds need explicit foreign-key names when two relationships exist.
- audit_log is insert-only and ON DELETE RESTRICT; cleanup deletes journal_entries first, then audit_log, organizations, auth.users, via `scripts/cleanup-phase2-test-data.sql`. Reuse fixed named test users/orgs.
- PayPal Sandbox buyer must be a US Personal account; seller USD only; use Visa; webhook URL ends `/api/webhook`; PAYPAL_WEBHOOK_ID must match.
- Raw body is needed for PayPal signature verification.
- Never print `.env` values; use key names only.
- Gemini fallback uses per-key/model cooldowns; do not rotate for transient or safety failures.

## DO NOT
- Do not force-push, print secrets/JWTs, call Gemini/PayPal/Supabase, run migrations, weaken tests, edit protected visual files, or commit `.env`. Push is authorized only for this requested main publication.

## RESUME COMMANDS
- `git status --short`
- `npm test`
- `npm run check:migrations`
