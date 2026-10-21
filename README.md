# NovaPay v2.0 — PayPal AI Hackathon build

**NovaPay helps PayPal merchants review available activity: AI suggests actions, a human approves, and PayPal Sandbox executes supported test actions.**

## Run
```
cp .env.example .env     # add PayPal sandbox + Anthropic keys
node server.js           # Node 18+, no npm install needed
open http://localhost:3000/dashboard.html
```
Without keys or backend (e.g. opening the HTML directly) everything runs in clearly-labelled demo mode.

## Where the integrations are
| Capability | Where |
|---|---|
| PayPal OAuth2 + Orders v2 (create/capture sandbox payment) | `server.js` → `/api/paypal/create-order`, `/capture` |
| PayPal Payments v2 refund after human approval | `/api/paypal/refund` (Approvals page → Approve) |
| PayPal Webhooks (signature verification API) | `/api/webhook`, shown in the PayPal Sandbox page |
| AI (Claude, Anthropic Messages API) answering from available transaction context and proposing actions | `/api/ai/chat` → user reviews supported suggestions and sends them to Approvals |

## Modules
Dashboard · Transactions · AI Assistant · **Approvals** · **PayPal Sandbox**.
Removed as non-essential: Reports (inert stubs), Settings page, landing Pricing and Company sections.

## AI Assistant module

The assistant answers questions about the transaction rows currently available to NovaPay and can return evidence references or a supported action suggestion. It sends a compact set of transaction fields (ID, type, status, displayed date, buyer when available, gross, fee, net, currency, and source) to `/api/ai/chat`; it does not retrieve a merchant's complete PayPal history. Illustrative rows are labeled as illustrative. Sandbox rows contain only the capture information provided by this app's sandbox capture flow, with missing buyer/date fields left unavailable.

Configure `ANTHROPIC_API_KEY` in `.env` and run `node server.js` to enable the Anthropic-backed assistant. Without the backend or key, the assistant remains usable through an explicitly labeled local fallback that summarizes visible records and does not claim live AI analysis. The AI service status and transaction-data status are shown separately.

When AI returns a supported proposal with a transaction reference that matches an available row, the assistant displays its reason and evidence fields separately. Choose **Send to Approvals** to place it in the existing queue; the assistant never executes an action. Refund suggestions are eligible for the PayPal sandbox only when their reference is an available sandbox capture; other suggestions are simulated. Missing references and unsupported action types remain non-actionable findings. Approval is still required in the Approvals module.

Current limits: available records are the illustrative examples and captures made through this demo, not an imported PayPal history. PayPal capture data may omit buyer, timestamp, or fee. The local fallback avoids unsupported totals and does not detect fraud. Sandbox captures are held in server memory and disappear when the backend restarts.

## Approvals module

Proposals enter the queue from the AI Assistant after a user chooses **Send to Approvals** or from the session's illustrative starter proposals. The queue shows source, action type, reason, transaction reference, amount, evidence, current status, and whether an action is eligible for PayPal Sandbox or simulated only. Filters cover status, type, and source. Select **Review proposal** for the full evidence and effect details; an additional confirmation step is required before any sandbox request.

Only a refund tied to an exact completed USD capture recorded by this running backend can execute against PayPal Sandbox. The backend registers that proposal ID, capture ID, amount, and currency, then independently validates the link and remaining refundable captured amount before sending a refund. It never falls back to the latest capture. Refunds are marked Completed and added to Transactions only after PayPal returns `COMPLETED`. Dispute evidence, payout holds, illustrative refunds, and unsupported or unlinked proposals are simulated only or informational; approval does not call PayPal for them.

Failed requests remain in the queue with a Failed status and can be retried or rejected. If PayPal returns a non-completed or uncertain status, duplicate submission is blocked until the sandbox state has been checked. Rejection never calls PayPal and may include an optional note. The newest-first audit trail records proposal ID, action type, decision, local decision time, available demo reviewer identity, reference, PayPal result ID/status when returned, and errors. Queue and audit state are session-only in the browser; the backend's capture/approval checks are held in server memory. Reloading the page or restarting the server clears this session state. This project has no database or production PayPal integration.

## PayPal Sandbox module

The PayPal Sandbox page reports whether the local backend is reachable, whether Sandbox credentials are configured and can obtain an OAuth token, whether the optional AI key is configured, and whether webhook signature verification has a configured webhook ID. A configured AI key or webhook ID indicates configuration only; it does not claim that every later provider request will succeed. The page always labels the environment **PayPal Sandbox — test transactions only**.

To enable payments, create a PayPal developer Sandbox REST app, copy its Sandbox client ID and secret into the root `.env` as `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`, then run `node server.js` (Node 18+; no dependency install). Never put credentials in browser code. The demo accepts USD amounts from 0.01 through 10,000.00. Create an order, open the returned PayPal approval link in a new tab, approve it with a Sandbox buyer account, return to NovaPay, and choose **I approved the order · Capture payment**. The UI reports a capture only after the API returns `COMPLETED`; the returned capture ID, order ID, amount, currency, status, and fee when provided are shown. Completed captures enter Transactions with missing fields marked unavailable and can be explicitly linked by the Approvals flow. Stable request IDs help PayPal deduplicate retries; an uncertain capture result is blocked from automatic resubmission and should be checked in Sandbox. This is an order/capture demonstration, not a full PayPal transaction-history import.

For webhook testing, expose the running local server through a trusted HTTPS tunnel (for example, a development tunnel) and add that public address plus `/api/webhook` to the Sandbox app's webhook configuration. Set `PAYPAL_WEBHOOK_ID` in `.env` to the webhook's ID and restart the server. The page lists the event type, PayPal event ID, received time, and one of **Verified**, **Failed**, **Unverified**, or **Verification error**. Unverified events are display-only and are never treated as transaction records. Do not share webhook signatures or credentials.

Recent provider calls and received webhook events are held in server memory and disappear when the process restarts. Created orders, captures, approval registrations, and refund idempotency state are also in memory; restart the server to clear them. A capture from an earlier server session cannot be used for a new approval/refund. The integration supports USD sandbox order creation, capture, webhook-signature verification, and the specifically approved refund route; it does not implement production payments, other currencies, payout holds, dispute evidence submission, or full-history import.

## Demo flow for judges
1. PayPal Sandbox → Create test order → approve as sandbox buyer → Capture.
2. AI Assistant → ask about visible activity → review any supported proposal and send it to Approvals.
3. Approvals → Approve the refund → the sandbox refund executes, a transaction row appears, and the audit trail records it.

Figures on dashboard cards are illustrative seed data; PayPal calls are sandbox only. Sandbox amounts are USD.

---
# NovaPay Design System v1.2 — Phase 4 Authentication + Navigation

This package contains the NovaPay design-system preview plus a complete Phase 2 creative landing/home page implementation.

## Phase 2 implemented

- NovaPay premium landing header and responsive navigation
- Hero: “From PayPal Transactions to Intelligent Financial Action”
- Working theme toggle with persisted light/dark mode
- Working Login / Get Started demo modal flows
- Working Watch Demo interaction
- PayPal transaction card with payment, refund, fee and payout examples
- NovaPay AI visual, ledger visual, and human-approval visual
- PayPal → NovaPay → Ledger → AI → Human Approval workflow rail (Watch Demo steps through all five)
- Layered 3D depth, perspective, parallax, glow, particles and floating motion
- NovaPay dashboard reference embedded in the laptop composition
- Responsive desktop/tablet/mobile layouts
- Reduced-motion support
- Below-hero value strip and workflow section
- Pricing CTA section
- No fabricated product statistics or unsupported live-integration claims

## Preview

Open `preview.html` in a browser. No build step is required for the static preview.

## Assets

`assets/novapay-dashboard-reference.png` is the supplied NovaPay dashboard reference used in the hero composition.
`assets/novapay-hero-reference.png` is the supplied landing-page reference retained for design reference.

## Integration note

The static preview provides functional UI interactions. The Login and Get Started forms intentionally do not transmit data; connect their submit handlers to the project's existing authentication/onboarding routes when integrating this page into the full NovaPay application.

## Phase 2 fix notes

- Page logic moved to `src/landing.js` (classic script) because ES-module imports are blocked when opening via `file://`; `src/theme.js` remains for app/framework use.
- Theme icons are inline SVG; ledger card now matches the PayPal card ($120.00 − $3.49 − $35.00 = $81.51); modal has a focus trap; tiny text sizes raised.


## Phase 3
Added landing-page feature cards for Automatic Bookkeeping, AI Assistant, Smart Ledger, Anomaly Detection, and Safe Actions, plus an animated end-to-end workflow from PayPal through Human Approval to PayPal Action. Feature CTAs open the existing preview modal and the workflow can be played interactively.


## Phase 4 — Authentication + Navigation

This package now includes a functional static demo navigation/auth experience.

### Landing navigation
- Home
- Features
- Pricing
- Company
- Login
- Get Started

### Demo authentication
The package does not contain a production authentication backend. The UI is explicitly labeled **DEMO AUTHENTICATION**.

Demo login:
- Email: `user@novapay.app`
- Password: `novapay123`

Successful demo login stores a local demo session and opens `dashboard.html`.

Create Account creates a local demo session using the entered name/email/password. Continue with Google is also explicitly simulated in demo mode.

Forgot Password provides a demo-mode instruction rather than pretending to send a reset email.

### Dashboard navigation
The demo dashboard includes functional client-side views for:
- Dashboard
- Transactions
- AI Assistant
- Approvals
- PayPal Sandbox

Views are routed through the URL hash and update the dashboard content without requiring a backend.

### Important
When opened as a static preview without `server.js`, the dashboard uses illustrative data and its sandbox integrations are unavailable. When run through `node server.js` with optional credentials in the server-side `.env`, the app sends requests to Anthropic and PayPal Sandbox as described above. It does not support production PayPal payments or import a merchant's full account history.

## Phase 4 notes

- Nav: Home / Features / Pricing / Company are real sections (scroll-highlighted; mobile hamburger menu added). Current dashboard nav: Dashboard, Transactions, AI Assistant, Approvals, PayPal Sandbox.
- **Demo authentication only** (localStorage, no server, not secure): `user@novapay.app` / `novapay123`. Create Account stores a demo account locally and logs in; Forgot Password resets to `novapay123` (demo mode, no email); Continue with Google is simulated.
- `dashboard.html` redirects to the login modal (`preview.html#login`) when not signed in. Log Out clears the session.
- Transactions search/type filter work; dashboard KPIs made internally consistent.

## Phase 5 — Main NovaPay Dashboard

The authenticated demo dashboard now follows the supplied Reference Image 1 direction more closely, including:
- Good morning greeting and PayPal business context
- Date selector, notification popover, profile menu, and theme switch
- Five KPI cards: Revenue, PayPal Fees, Refunds, Disputes, and Net Money
- Trend indicators and mini-chart treatments
- Cash Flow Overview with working 7D / 30D / 3M / 1Y filters
- Dynamic illustrative chart lines, labels, Money In / Money Out / Net values
- Financial Health card and recent transactions table

All financial figures in this static package are illustrative demo data and do not represent live PayPal data or a live financial account.

## Phase 5 — Main dashboard
Dashboard header (greeting, date selector, notifications, profile, theme switch), five KPI cards with trend indicators, sparklines, hover elevation, and a Cash Flow chart (Money In / Money Out / Net) whose 7D · 30D · 3M · 1Y filters regenerate the demo series, totals, axis and hover tooltip. The date selector also changes KPI values. Fixes: greeting now uses "Shikhar", the 82% ring label is visible, the load-time toast is removed, and the profile chip layout is repaired.

## Phase 6 — Transactions and dashboard interactions
Clickable transactions (dashboard and Transactions view) open a detail dialog with Escape handling and focus return; the Transactions view includes a polished empty state with Reset filters. The standalone Ledger and Anomalies views and dashboard snapshot have since been removed. Other fixes included aligning the Payouts figure (₹7,70,000) across views and hiding the greeting outside the Dashboard.


## Phase 7 — NovaPay AI + Agentic Action System
- Original AI Assistant behavior used predefined demo responses for fees, refunds, reports, and unusual activity. See **AI Assistant module** above for the current evidence-based workspace behavior.
- Added the original Human Approval → Confirm Action → Processing → Demo Completion workflow.
- Added responsive AI/agent styling and reduced-motion support.


## Phase 8 — 3D Effects, Polish, Responsive Design + Final Quality Layer

Phase 8 is the final visual/quality pass over the existing static demo. Existing Phase 1–7 behavior was retained and targeted enhancements were added rather than replacing the working pages.

### Phase 8 changes
- Added a layered, low-contrast 3D background scene using CSS transforms, gradient orbs, soft cubes and sparse particles.
- Kept all decorative layers non-interactive and `aria-hidden`.
- Added desktop pointer parallax on the home scene and disabled it under reduced-motion preferences.
- Dashboard scene is intentionally calmer than the home scene.
- Added shared motion easing, button lift/click/focus polish and card hover elevation.
- Added AI orb/sparkle and typing-indicator motion.
- Added visibility-aware animation pausing when the tab is hidden.
- Added responsive tablet navigation and a mobile drawer with backdrop, Escape handling and keyboard focus trapping.
- Added a mobile AI floating button and bottom-sheet presentation.
- Added safe-area-aware mobile spacing and horizontally scrollable financial tables.
- Fonts: Montserrat via Google Fonts (online) with local/bundled fallback; see `src/fonts.css`.
- Preserved light/dark theme persistence through the existing `novapay-theme` localStorage key.
- Preserved Demo Mode disclosures. PayPal calls, when configured, use sandbox credentials only; the app does not claim production support or full-history import.

### Demo-only disclaimer
This project includes illustrative demo data and optional Anthropic and PayPal Sandbox integrations. PayPal actions are sandbox-only and require an explicit approval confirmation; the project has no production PayPal support. Illustrative proposals and unsupported action types remain simulated.

## Phase 8 test report

The project has no `package.json`, TypeScript compiler, ESLint configuration, or Playwright dependency/toolchain. Therefore TypeScript/ESLint checks are **N/A — no TS/lint toolchain**. JavaScript was checked with `node --check` for all three JS files. HTML was parsed with Python's standard HTML parser and CSS brace balance was checked.

### Static checks
| Check | Result |
|---|---|
| `node --check` on `landing.js` | PASS |
| `node --check` on `dashboard.js` | PASS |
| `node --check` on `theme.js` | PASS |
| HTML parsing | PASS |
| CSS structural brace check | PASS |
| Font: Montserrat (Google Fonts, with offline fallback) | PASS |
| Demo-only disclaimer retained | PASS |

### Browser checklist
A Playwright executable was not available in the sandbox. An attempt to invoke Playwright through `npx` timed out, and the installed Chromium binary could not complete a headless page load in this environment. Consequently the following browser-runtime checks are **UNVERIFIED — sandbox limitation**, not claimed as successful execution:

- Home / Dashboard / Login / Create Account
- Navigation and browser back/forward
- Theme persistence across pages
- Get Started / Watch Demo
- Cash-flow chart range changes and tooltips
- Transaction search/filter/detail/empty states
- Transactions / AI / Approvals workflow
- Toasts and feedback
- 3D non-blocking behavior
- Mobile drawer / AI bottom sheet / 320px no-x-scroll
- Dark/light visual polish
- Dead-button runtime sweep
- Console errors/failed requests
- Reduced-motion runtime verification
- Mid-range-phone performance

These runtime items were implemented with the existing event handlers plus targeted Phase 8 enhancements, but they were not falsely marked as browser-tested.

### Demo and sandbox boundaries
Dashboard totals and transaction flags are illustrative. AI answers use either the explicitly labeled local fallback or the configured AI backend with available workspace transaction data. PayPal order captures and refunds are sandbox-only and require sandbox credentials and human approval; production PayPal support is not provided. The standalone Ledger and Anomalies modules have been removed from dashboard navigation and views.

## Phase 9 — Cinematic laptop hero + dashboard transition

- `src/hero-laptop.css` / `src/hero-laptop.js` (new): a CSS-3D laptop (hinged lid, keyboard deck) whose screen is a live HTML mini-dashboard (same tokens/figures as `dashboard.html`, light + dark). No WebGL, no images, no dependencies.
- Intro (once per session): text rises in, lid opens with a settle, five floating cards emerge from the screen (one sits behind the laptop), then idle parallax floats. Any click/key skips it. Repeat visits, and `prefers-reduced-motion`, show the final composition instantly.
- **Open Dashboard** (new primary CTA, a real link to `dashboard.html`): cards fly back, the screen expands to fill the viewport, then `dashboard.html` fades in (`src/dashboard-enter.css`). Auth is untouched: the dashboard's own guard decides dashboard vs. login. Ctrl/Cmd-click and no-JS work as normal links.
- Mobile (<=700px): laptop is simply open, 2 cards, short fade. Idle animation pauses when the tab is hidden or the hero is off-screen.
- Fixes: `novapay-logo.js` was never loaded by `preview.html` (logos did not render); decorative orbit caused horizontal scroll on tablets.
- Serve over http (`python3 -m http.server`) to avoid `file://` blocking the `<use href="icons.svg#…">` sprite on the dashboard (pre-existing).

## Phase 9.12 — Login panel
The Login / Get Started modal is now the animated split Login / Sign Up panel (`src/auth-panel.css`, markup in `preview.html`, logic in `src/landing.js`), themed with NovaPay tokens in light and dark. Demo authentication is unchanged (`user@novapay.app` / `novapay123`). The pointer reveal ribbon is 20% smaller (radius 48.64 px).


## Hero orbit animation (added)

New files: `src/hero-orbit.css`, `src/hero-orbit.js` (linked from `preview.html`). Nothing existing was edited except those two tags.

- The 5 hero cards (Cash Flow, PayPal activity, NovaPay AI, Ledger, Recommendation) travel clockwise round a **slanted glowing ring** with flowing arrows. They pass **behind** the laptop at the back of the ring and come **forward in front** of it at the bottom (scale + z-order change with depth).
- **Hover** a card: the orbit pauses, the card glides to the laptop centre and zooms. Move the pointer away: it returns and the orbit resumes.
- **Click** the centred card: it opens full size on the laptop screen. "Back to dashboard" (or Esc) restores the dashboard view. On touch devices the first tap zooms, the second tap opens it.
- "Open Dashboard" still runs the existing laptop transition; the cards fly back into the laptop first.
- Skipped on phones (<= 700px) and with `prefers-reduced-motion`, where the original static card layout is kept.
- Tuning constants at the top of `hero-orbit.js`: `SLANT` (ring tilt), `SPEED`, `ZOOM`, `START` (starting angles).
- To remove: delete the `hero-orbit.css` link and `hero-orbit.js` script tag in `preview.html`.

## Header logo — bigger + "forming" animation (added)

New: `src/logo-intro.css`, `src/logo-intro.js`, `assets/np-layer-n.png`, `np-layer-p.png`, `np-layer-px.png` (the original `novapay-mark.png` split into N / P+orbit / pixel squares; `novapay-mark-clean.png` is the same artwork with the faint background noise removed). Only the header brand block in `preview.html` was changed.

- Mark is now 96px wide (was a 42px box) and the NovaPay wordmark is 38px (was 29px); 66px / 27px on phones.
- Sequence (~2.8s on page load): **N** draws up from its base → **P** grows out from its stem with the orbit swoosh → the pixel squares flicker on → **NovaPay** forms letter by letter.
- Click the logo to replay (or call `window.novapayLogoReplay()`). `prefers-reduced-motion` shows the finished logo immediately.
- To revert: restore the original `<a class="landing-brand">…</a>` block in `preview.html` and remove the two new tags.
