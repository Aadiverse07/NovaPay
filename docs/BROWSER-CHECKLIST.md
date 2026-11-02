# Browser checklist: maintenance, live FX and email OTP

Status column is intentionally left for manual results. Use only the fixed existing owner for dashboard checks. For signup/recovery delivery, use an inbox you control, not a customer address; that manual test creates/sends an email and is not included in automated results.

| Check | Exact steps | Result |
| --- | --- | --- |
| Maintenance live session | Start with `npm start`; sign in as the existing owner (not Google/demo); click **Maintenance** in the left navigation; verify live requests or **No maintenance requests yet**. If an approved test org is available, click **New request**, fill a sample request, click **Continue** once, and confirm the new `requested` card appears without reload. | UNVERIFIED |
| FX light theme | Click **Reports**; find **Currency converter**; choose INR and USD; enter `5000`; wait for conversion; confirm rate, source, fetched timestamp and indicative/working-day note. Click swap and confirm direction and amount update. | UNVERIFIED |
| OTP panel, light comparison | On `preview.html`, click **Get Started**. Compare the **Sign Up** input underline, labels, primary button, diagonal Welcome panel, rounded frame and close X. Use a test inbox you control and submit a valid name/email, password of at least 8 characters, and matching confirmation; click **Create Account**. Confirm the OTP panel is inside the same modal and matches the existing field/button/split layout. Paste a 6-digit code; verify auto-submit and dashboard arrival. | UNVERIFIED |
| OTP validation/resend | In a controlled test signup, enter an incorrect/expired code and confirm inline error plus toast. Before 60 seconds, confirm **Resend in Ns** is disabled; after countdown, click **Resend code**. Type digits and paste mixed text; only six digits should remain and auto-submit. Click **Change email** and confirm Sign Up returns. | UNVERIFIED |
| OTP panel, dark comparison | Click the theme toggle to dark before opening **Get Started**. Compare the same controls/panel against Login and Sign Up; confirm labels/errors remain readable and the transition works. Switch back to light. | UNVERIFIED |
| Recovery | On the preview modal, select **Login → Forgot Password?** and enter the controlled test inbox. Open the recovery OTP panel, enter the emailed code, set matching 8+ character passwords, click **Update password**, then sign in with the new password. | UNVERIFIED |
| Narrow window | Resize browser to about 375 px wide; open Login, Sign Up and OTP/recovery panels. Verify only the active form is visible, no horizontal scrolling/clipping, code input can be focused, close X and Escape work, and focus returns to the opener. | UNVERIFIED |


## Judge live-data walkthrough (manual; not yet run)

| Check | Exact steps | Result |
| --- | --- | --- |
| Empty organization baseline | Start `npm start`; sign in as the fixed existing owner for the approved empty organization; open Dashboard, Transactions, Ledger, Approvals, Invoices, Reports, Documents, Community Funds, Maintenance and the notification bell. Verify zero/empty states, no sample money rows, Retry on an offline API, then hard-refresh and repeat. Capture Network status and verify requests carry the current org scope. | UNVERIFIED |
| Existing organization hydration | Sign in as the fixed owner for the existing organization; open each same view and verify displayed rows match `/api/*` responses for that organization. Hard-refresh each view and confirm rows persist; do not count sample/demo values. | UNVERIFIED |
| Sandbox capture to reporting | Open **PayPal Sandbox** → enter `10.00 USD` → **Create test order** → approve in the PayPal Sandbox tab → return → **I approved the order · Capture payment**. Verify capture appears in **Transactions**, **Ledger**, **Dashboard** KPIs/cash movement and **Reports**, and verify matching transaction/journal rows in Supabase. | UNVERIFIED |
| Invoice flow | Open **Invoices** → **Create invoice** → enter clearly marked sample customer/test line item → save draft. Verify one org-scoped draft appears after refresh and **View** shows it. Do not send it. | UNVERIFIED |
| Approval flow | Open **Approvals** → verify live pending badge and API row count → open one existing eligible test approval → review its evidence and decision → verify server decision and updated badge after refresh. Do not approve a live-money action. | UNVERIFIED |
| AI uses new data | Open **AI Assistant** → ask “Show transactions from this month” and a question about the test capture → verify answer cites the real test transaction ID and the Network tab shows one authenticated `POST /api/ai/chat`; no sample fallback text. | UNVERIFIED |
| Notification bell | Click the bell → verify count and rows match `GET /api/notifications`; click one row and verify it navigates and marks read; refresh and confirm unread count updates. | UNVERIFIED |
