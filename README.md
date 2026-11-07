# NovaPay

NovaPay helps PayPal merchants review their activity. The AI suggests actions, a human approves them, and PayPal Sandbox executes the supported test actions. Built for the PayPal AI Hackathon.

NovaPay is for testing and evaluation. It does not move real money and does not support production payments or fundraising.

## What is real and what is simulated

**Real (PayPal Sandbox and Supabase):**
- Test payments (create and capture an order) and refunds through PayPal Sandbox.
- Signed webhook verification. Verified captures and refunds are posted to the ledger.
- Sign-in through Supabase Auth, with organization-scoped row-level security (RLS).
- AI answers with cited evidence from your organization's records, using the configured free-tier Gemini model.

**Simulated:**
- Invoice sending. No PayPal invoice is created and no recipient is notified.
- Maintenance payouts. PayPal Payouts Sandbox is unavailable, so approval only queues the workflow. No money is sent and no ledger entry is made. A simulated payment must never be presented as a completed payout.
- Dashboard seed figures, illustrative transactions and starter proposals. They are labeled as illustrative in the UI.

## Modules

Dashboard, Transactions, AI Assistant, Approvals, PayPal Sandbox, Ledger, Invoices, Reports, Documents, Community Funds and Maintenance. Fundraising, Maintenance and Transparency views read from `/api/funds/*`.

## Run it

1. Copy `.env.example` to `.env` (git-ignored) and fill in the keys for the services you use: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_FALLBACK_MODEL` and `PAYPAL_INVOICE_SEND_MODE`. Document OCR and embeddings use `GEMINI_API_KEY` (or the numbered key pool in `.env.example`). Keep the service-role and provider keys on the server. Never put them in browser code or commits.
2. Install and start (Node 18 or later):

   ```sh
   npm ci
   npm start
   ```

   The API and dashboard use port 3000 by default. Open `http://localhost:3000/dashboard.html` and check `GET /api/status` before a demo.
3. Run the tests with `npm test`.

Without the three Supabase keys the server runs in an explicit degraded mode. Opening the HTML files without the backend shows clearly labeled demo data, and the sandbox integrations are unavailable. If the dashboard icons do not load over `file://`, serve the folder over http (`python3 -m http.server`).

## PayPal Sandbox setup

Create a PayPal developer Sandbox REST app and put its client ID and secret in `.env` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. Then:

1. Open **PayPal Sandbox**, create a test order (USD, 0.01 to 10,000.00) and open the returned approval link in a new tab.
2. Approve it as a Sandbox buyer, return to NovaPay and choose **I approved the order · Capture payment**.
3. NovaPay reports a capture only after the API returns `COMPLETED`. It then shows the capture ID, order ID, amount, currency, status and the fee when PayPal provides one.

Stable request IDs let PayPal deduplicate retries. If a capture result is uncertain, NovaPay blocks automatic resubmission, so check the state in Sandbox first.

**Webhooks.** Expose `http://localhost:3000` through a trusted HTTPS tunnel and set the Sandbox app's webhook URL to `https://<public-tunnel-host>/api/webhook`. Configure the capture event you are testing, set `PAYPAL_WEBHOOK_ID` to that webhook's ID and restart the server. The tunnel must forward the raw request bytes, because signature verification needs them. The PayPal Sandbox page lists each event's type, PayPal event ID and received time, with one of **Verified**, **Failed**, **Unverified** or **Verification error**. Unverified events are display-only and never become transaction records. Do not share webhook signatures or credentials.

## How the AI assistant works

The assistant answers questions about your organization's records and can propose a supported action. Each question takes one of two routes, and the UI shows which:

- `code`: deterministic answers, such as arithmetic, computed in code.
- `llm`: answers from the configured model, with citation chips pointing to the records used.

Gemini free-tier Flash-Lite is the default model. The Anthropic adapter is optional (`LLM_PROVIDER`, `ANTHROPIC_API_KEY`). If no model is available, the assistant falls back to a labeled local summary that does not claim live AI analysis and does not detect fraud. The AI service status and the transaction-data status are shown separately.

The assistant never executes an action. A supported proposal with a matching transaction reference shows its reason and evidence separately, and **Send to Approvals** places it in the queue. Missing references and unsupported action types stay as non-actionable findings.

## Approvals and refund safety

The queue shows source, action type, reason, transaction reference, amount, evidence, status, and whether the action runs in PayPal Sandbox or is simulated only. You can filter by status, type and source. **Review proposal** opens the full evidence, and a second confirmation is required before any Sandbox request.

- Only a refund tied to an exact completed USD capture can execute against PayPal Sandbox. The backend registers the proposal ID, capture ID, amount and currency, then checks the link and the remaining refundable amount before sending. It never falls back to the latest capture.
- A refund is marked Completed and added to Transactions only after PayPal returns `COMPLETED`.
- Dispute evidence, payout holds, illustrative refunds, and unsupported or unlinked proposals are simulated or informational. Approving them does not call PayPal.
- Failed requests stay in the queue and can be retried or rejected. If PayPal returns an uncertain status, duplicate submission is blocked until the Sandbox state is checked.
- Rejection never calls PayPal and can carry a note.
- The newest-first audit trail records proposal ID, action type, decision, decision time, reviewer, reference, PayPal result ID and status, and any errors.

[Needs input: confirm whether the Approvals queue, audit trail and created-order state now persist in Supabase or still live only in the browser session and server memory. The earlier README said session and memory only.]

## Three-minute demo

Use the existing fixed test organization and records. This walkthrough creates no PayPal order.

1. **Sign in and confirm the payment.** Sign in with a fixed test account, open Transactions and find a completed PayPal Sandbox capture.
2. **Show the books.** Open Ledger and confirm the capture is posted and the USD trial balance balances. Open Approvals and show the pending count.
3. **Show both AI routes.** Ask `What is 7 + 5?` and point out the `code` route. Then ask `Is the latest PayPal capture consistent with its ledger record? Cite the records used.` and show the `llm` route and its citation chips.
4. **Follow the fund.** Open Fundraising and review the campaign summary. Open Maintenance and show the closed request, the accepted evidence and the `SIMULATED` payment status. Open Transparency and point out the explicit gaps, including `no payment reference` and `simulated, no ledger entry`. Owner and admin users can download the audit CSV.
5. **Close with the boundary.** Captures and refunds are PayPal Sandbox operations with signed webhook verification. Maintenance payouts and invoice sending are simulated. No production funds move.

For the sandbox-first flow: create and capture an order, ask the assistant about the activity, send its proposal to Approvals and approve the refund. The refund executes in Sandbox, a transaction row appears and the audit trail records it.

## Current limits

- The integration covers USD Sandbox orders, capture, webhook-signature verification and the specifically approved refund route. It does not cover production payments, other currencies, payout holds, dispute evidence submission or full PayPal history import.
- PayPal capture data may omit buyer, timestamp or fee. NovaPay marks those fields unavailable.
- Dashboard figures from seed data are illustrative.

## Frontend notes

- **Transactions grid.** Uses AG Grid Community 33.3.2 (MIT), loaded from the vendored bundle at `assets/vendor/ag-grid/ag-grid-community-33.3.2.min.js` the first time the Transactions view opens. It provides sorting, filtering by date and amount, pagination, row selection, per-currency pinned totals and CSV export. If the bundle fails to load, the original table stays available. The assistant's `transactions.applyView` action accepts only a strict set of filters and sort fields.
- **Landing hero.** A CSS 3D laptop with five orbiting cards (`src/hero-laptop.*`, `src/hero-orbit.*`). The orbit constants `SLANT`, `SPEED`, `ZOOM` and `START` are at the top of `hero-orbit.js`. To remove the orbit, delete its CSS link and script tag in `preview.html`.
- **Header logo.** The forming animation is in `src/logo-intro.*`. Click the logo to replay it, or call `window.novapayLogoReplay()`.
- Reduced-motion preferences are respected throughout. On phones (700px and narrower) the hero uses a simpler layout.

## Build history

Phase-by-phase notes live in `CHANGELOG.md`, with test results in `PHASE-8-TEST-REPORT.md` and `docs/TEST-REPORT.md`.

[Needs input: the static demo login (`user@novapay.app` / `novapay123`) still appears in `src/landing.js` and `src/dashboard.js`. Confirm whether it is still a supported path next to Supabase Auth before documenting it here.]