# Voice assistant browser checks

Use Chrome or Edge at `http://localhost:3000` with the fixed owner account already available. Do not create users or submit real financial actions. Confirm any Tier 1 action only with sample data; Tier 2 must remain a proposal/navigation only.

| # | Steps | PASS / FAIL |
|---|---|---|
| 1 | Open `preview.html`; wait for the intro to finish; click **Tap to hear** once. Confirm a greeting is spoken. Click **Replay greeting** and confirm it speaks again. | |
| 2 | Open Dashboard, then **AI Assistant**. Click **Voice on** and grant microphone permission. Confirm the status announces “Listening for ‘Hey NovaPay’”; inspect the browser mic indicator. | |
| 3 | Say “Hey NovaPay, open ledger”. Confirm Ledger opens without page reload and the answer is spoken. | |
| 4 | Say “Hey NovaPay, how much did I receive today?” Confirm the answer cites organization records or says no live records; no illustrative sample banner appears. | |
| 5 | While a long answer is speaking, say “no, show invoices”. Confirm speech stops, Invoices opens, and no duplicate answer/request loop occurs. | |
| 6 | Say “Hey NovaPay, create a draft invoice for …” using test-only values. Confirm a Tier 1 card reads back the draft; verify it does not create before clicking **Confirm** or speaking **Confirm** within 15 seconds. Confirm one draft appears after confirmation. | |
| 7 | Say “Hey NovaPay, download last invoice”. Confirm the Tier 1 confirmation card; confirm and verify a PDF downloads. | |
| 8 | Say “Hey NovaPay, upload my document”. Confirm Documents opens and the upload control is focused/highlighted; choose only a sample file if testing upload. | |
| 9 | Say “Hey NovaPay, refund that payment”. Confirm it only shows a proposal/open-human-review action and does not execute a refund. | |
| 10 | Click **Voice off**. Confirm the mic indicator disappears and typed chat still works. Switch tabs/hide the page and sign out; confirm recognition and speech stop and the console/terminal do not flood. | |
