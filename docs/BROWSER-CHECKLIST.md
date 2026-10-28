# Documents view browser checklist

Use the fixed named owner test account and a synthetic sample document only. Do not upload real customer, payment-card, bank, or sensitive personal data. Mark each item PASS or FAIL and add a short observation.

| # | Steps | PASS / FAIL | Observation |
|---|---|---|---|
| 1 | Start the server with `npm start`; open `http://localhost:3000/preview.html`; sign in as the fixed named owner test user; open Dashboard. |  |  |
| 2 | Open **Documents** in the left navigation. Verify the live list loads, shows a clear empty state for an empty org, and contains no illustrative sample rows. |  |  |
| 3 | In DevTools Network, inspect `GET /api/documents`; verify 200, tenant header present, and response contains no Storage path or provider credential. |  |  |
| 4 | Click **Choose a file** and select a synthetic PDF/image (10 MB max, 10 pages max). Verify raw upload returns 201, then processing status appears and the document reaches processed or a clear error state. |  |  |
| 5 | Select the processed document. Verify supplier, invoice number/date, currency, subtotal, tax, total, confidence values, and any duplicate/arithmetic warnings are visible. |  |  |
| 6 | Enter a synthetic supplier email; edit any incorrect review fields; click **Confirm and create invoice draft** once. Verify a draft is created and UI says nothing was sent. Check Network: invoice draft request and document confirm only; no send or PayPal request. |  |  |
| 7 | Refresh the Documents list and reopen the confirmed document. Verify it shows confirmed/draft-created and does not offer another draft action. |  |  |
| 8 | Select another processed synthetic document and click **Reject document**. Verify rejected status appears after refresh. |  |  |
| 9 | Sign in as a fixed named viewer. Open Documents and verify list/read works while upload, confirm, reject, and delete controls are unavailable. |  |  |
| 10 | Check browser console and Network for failed requests; record any error and its route here. |  |  |
