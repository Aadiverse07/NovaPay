# Voice assistant browser checks

Use a signed-in fixed owner account at http://localhost:3000/dashboard.html#ai-assistant. Use harmless test questions and no sensitive audio or documents.

| # | Steps | PASS / FAIL |
|---|---|---|
| 1 | In Chrome, open DevTools Console, run localStorage.setItem("novapay:voiceDebug","1"), then reload. Confirm no microphone starts until a mic tap. | |
| 2 | Tap the AI mic and say **open ledger**. Confirm interim text appears, Ledger opens, and the answer is spoken. Console should show query/response/action, `speak call` with textLength, `voice selection` with voicesCount/chosenVoice, then `utterance onstart` and `utterance onend`. Network should show one POST /api/ai/chat. | |
| 3 | Tap the mic and say **how much did I receive today?** Confirm one organization-scoped chat POST, then the same speech logs (`voice selection`, `utterance onstart`, `utterance onend`) and audible answer. Confirm no sample-data answer. | |
| 4 | Say **create an invoice for Acme for 12000 due 15 November**. Confirm the assistant opens/asks for any missing required invoice details and shows a Tier 1 confirmation card before creating a draft. Confirm no draft is created before Confirm/yes. | |
| 5 | After the draft exists, tap the mic and say **download it**. Confirm a Tier 1 card appears; confirm it, and verify the PDF downloads. | |
| 6 | Tap the mic and say **upload my document**. Confirm Documents opens and the upload/review instructions are spoken. Use only an approved sample document if continuing. | |
| 7 | Tap the mic during listening to cancel. During a long spoken answer, tap the mic and say **take me to invoices**; verify speech stops and Invoices opens. | |
| 8 | If browser recognition reports a service error, hold the same mic button, speak a short harmless command, then release. Confirm transcription reaches the same assistant handler and a spoken reply follows. | |
| 9 | Repeat steps 2–8 in Brave. Confirm it explains that browser speech recognition is unavailable, while typed chat and held-mic transcription remain available. | |
| 10 | Confirm mic is idle/off after each utterance. Remove debug mode with localStorage.removeItem("novapay:voiceDebug") and reload. | |
| 11 | If the logs show onstart/onend but you hear nothing, check the Chrome tab is not muted and macOS output volume/output device is audible; record those checks alongside the PASS/FAIL result. | |
