# Voice assistant browser checks

Use a signed-in fixed owner account at http://localhost:3000/dashboard.html#ai-assistant. Use harmless test questions and no sensitive audio or documents.

| # | Steps | PASS / FAIL |
|---|---|---|
| 1 | In Chrome, open DevTools Console, run localStorage.setItem("novapay:voiceDebug","1"), then reload. Confirm no microphone starts until a mic tap. | |
| 2 | Click **Test voice**. Confirm the fixed sentence is audible and status changes Ready → Speaking → Spoken. | |
| 3 | Tap the AI mic and say **open ledger**. Confirm interim text appears, Ledger opens, and the answer is spoken. Console should show `speak requested` with text, `speak call`, `voice selection` with voicesCount/chosenVoice, then `utterance onstart` and `utterance onend` (or `utterance onerror` with code). Network should show one POST /api/ai/chat. | |
| 4 | Tap the mic and say **how much did I receive today?** Confirm one organization-scoped chat POST, then the same speech logs and audible answer. Confirm no sample-data answer. | |
| 5 | Say **create an invoice for Acme for 12000 due 15 November**. Confirm the assistant shows a Tier 1 confirmation card before creating a draft. | |
| 6 | After the draft exists, say **download it**. Confirm a Tier 1 card appears; confirm it, and verify the PDF downloads. | |
| 7 | Say **upload my document**. Confirm Documents opens and the upload/review instructions are spoken. | |
| 8 | Tap the mic while a long answer is speaking. Confirm playback continues and no new recognizer starts. Use the explicit Stop action to stop speech. | |
| 9 | If browser recognition reports a service error, hold the same mic button, speak a short harmless command, then release. Confirm a spoken reply follows. | |
| 10 | Repeat steps 2–9 in Brave. Confirm typed chat and held-mic transcription remain available. | |
| 11 | Confirm mic is idle/off after each utterance. Remove debug mode with localStorage.removeItem("novapay:voiceDebug") and reload. | |
| 12 | If onstart/onend appear but there is no sound, check Chrome’s tab is not muted and macOS output volume/device is audible. Record those results. | |
