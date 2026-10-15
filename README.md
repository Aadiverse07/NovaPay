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
- Email: `demo@novapay.app`
- Password: `demo123`

Successful demo login stores a local demo session and opens `dashboard.html`.

Create Account creates a local demo session using the entered name/email/password. Continue with Google is also explicitly simulated in demo mode.

Forgot Password provides a demo-mode instruction rather than pretending to send a reset email.

### Dashboard navigation
The demo dashboard includes functional client-side views for:
- Dashboard
- Transactions
- Ledger
- Reports
- AI Assistant
- Anomalies
- Settings

Views are routed through the URL hash and update the dashboard content without requiring a backend.

### Important
No credentials or financial data are sent to a server by this static preview. Transaction values and financial examples in the dashboard are illustrative demo data only. The dashboard does not connect to PayPal or execute real financial actions.

## Phase 4 notes

- Nav: Home / Features / Pricing / Company are real sections (scroll-highlighted; mobile hamburger menu added). Dashboard nav: Dashboard, Transactions, Ledger, Reports, AI Assistant, Anomalies, Settings.
- **Demo authentication only** (localStorage, no server, not secure): `demo@novapay.app` / `demo123`. Create Account stores a demo account locally and logs in; Forgot Password resets to `demo123` (demo mode, no email); Continue with Google is simulated.
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

## Phase 6 — Ledger, Transactions + Reports
Clickable transactions (dashboard and Transactions view) open a detail dialog with focus trap, Esc and focus return; Ledger Snapshot card on the dashboard; Financial Health checklist with a working "3 Anomalies Detected" link to Anomalies; polished empty state with Reset filters and an error toast for unavailable transaction details. Fixes: stray closing `</div>` that broke view nesting, duplicate ✓/⚠ icons, Payouts figure aligned (₹7,70,000) across views, greeting hidden outside the Dashboard.


## Phase 7 — NovaPay AI + Agentic Action System
- Upgraded AI Assistant with predefined demo responses for fees, refunds, monthly reports, and unusual activity.
- Added four requested quick actions.
- Added a Human Approval → Confirm Action → Processing → Demo Completion workflow.
- Demo action explicitly never contacts PayPal or executes a real financial action.
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
- Preserved all Demo Mode disclosures. No real PayPal, AI, refund, or financial action occurs.

### Demo-only disclaimer
This project contains illustrative data and demo workflows only. There is no production PayPal integration, no real AI backend, and no real financial action execution. Approval/refund flows simulate the user experience and must remain labeled Demo Mode until real integrations are connected.

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
- Ledger / AI / approval workflow
- Toasts and feedback
- 3D non-blocking behavior
- Mobile drawer / AI bottom sheet / 320px no-x-scroll
- Dark/light visual polish
- Dead-button runtime sweep
- Console errors/failed requests
- Reduced-motion runtime verification
- Mid-range-phone performance

These runtime items were implemented with the existing event handlers plus targeted Phase 8 enhancements, but they were not falsely marked as browser-tested.

### Intentionally demo-only
All PayPal activity, AI answers, anomaly signals, ledger figures and refund approval/execution are illustrative. No real financial transaction is performed.

## Phase 9 — Cinematic laptop hero + dashboard transition

- `src/hero-laptop.css` / `src/hero-laptop.js` (new): a CSS-3D laptop (hinged lid, keyboard deck) whose screen is a live HTML mini-dashboard (same tokens/figures as `dashboard.html`, light + dark). No WebGL, no images, no dependencies.
- Intro (once per session): text rises in, lid opens with a settle, five floating cards emerge from the screen (one sits behind the laptop), then idle parallax floats. Any click/key skips it. Repeat visits, and `prefers-reduced-motion`, show the final composition instantly.
- **Open Dashboard** (new primary CTA, a real link to `dashboard.html`): cards fly back, the screen expands to fill the viewport, then `dashboard.html` fades in (`src/dashboard-enter.css`). Auth is untouched: the dashboard's own guard decides dashboard vs. login. Ctrl/Cmd-click and no-JS work as normal links.
- Mobile (<=700px): laptop is simply open, 2 cards, short fade. Idle animation pauses when the tab is hidden or the hero is off-screen.
- Fixes: `novapay-logo.js` was never loaded by `preview.html` (logos did not render); decorative orbit caused horizontal scroll on tablets.
- Serve over http (`python3 -m http.server`) to avoid `file://` blocking the `<use href="icons.svg#…">` sprite on the dashboard (pre-existing).

## Phase 9.12 — Login panel
The Login / Get Started modal is now the animated split Login / Sign Up panel (`src/auth-panel.css`, markup in `preview.html`, logic in `src/landing.js`), themed with NovaPay tokens in light and dark. Demo authentication is unchanged (`demo@novapay.app` / `demo123`). The pointer reveal ribbon is 20% smaller (radius 48.64 px).


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
