# Supabase email OTP setup

Use the existing NovaPay Supabase project and configured custom SMTP. Do not add service-role credentials to browser configuration.

## Supabase Dashboard settings

1. Open **Authentication → Providers → Email** and enable email signups. Turn **Confirm email** on.
2. Open **Authentication → Email Templates → Confirm signup**. Include the one-time code with `{{ .Token }}` and explain it expires after 10 minutes.
3. Open **Authentication → Email Templates → Reset password**. Include `{{ .Token }}` and the same 10-minute expiry note.
4. Keep the project’s OTP length at 6 digits and expiry at 10 minutes. Keep the already-configured custom SMTP provider enabled.
5. Keep Supabase Auth rate limits enabled. NovaPay also preflights requests by normalized email and IP: signup 5/email/hour and 10/IP/hour; resend 3/email/hour and 10/IP/hour; verification 10/email/15 minutes and 30/IP/15 minutes; password recovery 3/email/hour and 10/IP/hour. Supabase-side limits remain an additional control.

## App flow

Signup calls Supabase Auth, then opens the OTP panel. A verified session is required before `GET /api/onboarding` can restore a membership or `POST /api/onboarding` can create a workspace. Existing memberships are selected before creating an organization. If setup cannot finish, the landing page or dashboard offers a retryable **Create your workspace** action.

Password recovery sends a recovery code, verifies it with Supabase, then updates the password. The OTP is never sent to the NovaPay server; only the flow and normalized email are sent to `GET /api/auth/preflight`. The preflight checks a maintained denylist at `server/config/disposable-email-domains.txt` and applies in-memory IP/email limits. OTPs, passwords, JWTs and emails are not logged.

The cleanup command is safe by default and prints only aggregate counts:

```sh
npm run cleanup:unconfirmed
```

It selects accounts older than 24 hours with no email-confirmation timestamp and skips users referenced by memberships or audit rows. Only after reviewing the dry-run counts, an operator may explicitly request deletion:

```sh
npm run cleanup:unconfirmed -- --apply
```

Auth Admin deletion cascades the profile row. Never run this against a project without reviewing the project selection and dry-run result.

## Manual verification

Use an email inbox you control. On `preview.html`, choose **Get Started**, create an account with an 8+ character password, enter the emailed 6-digit code in the OTP panel, and confirm the dashboard opens. Sign out, use **Forgot Password?**, verify the recovery code, set matching new passwords and sign in. Verify wrong/expired codes and resend cooldown show inline messages. No email delivery test is recorded as automated; do not use a real customer address.
