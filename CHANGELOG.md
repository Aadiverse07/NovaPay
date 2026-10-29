## Settings — structured into sections
- Settings is now a two-pane layout: a section menu (Account: Profile, Security · Preferences: Appearance, Notifications, AI Assistant · Workspace: Workspace, Data & privacy) and one titled panel at a time, each split into labelled groups (e.g. Password / Session, Theme / Layout / Accessibility, Export / Preferences / Danger zone).
- Keyboard: arrow keys, Home and End move between sections; the last section opened is remembered for the session; "Edit in Settings" opens Profile. On narrow screens the menu becomes a swipeable tab strip.
- All control IDs are unchanged; only the markup around them and `src/settings.css` changed.

## Settings — every option now works
- Rebuilt the Settings page (`dashboard.html`, `src/dashboard.js`, new `src/settings.css`); each control has a real effect and is saved in `novapay-settings`.
- Added: change password, auto sign-out after inactivity, theme "Match device", compact layout, start page, AI insight alerts, AI "show thinking steps" and "animate answers", clear AI chat, export transactions (CSV), export my data (JSON), delete account, confirm dialogs.
- Fixed: display name now survives log out/in; approval and AI alerts now drive the notification list, count badge and dot; reduced motion and compact layout apply before first paint.
- Removed: the "Weekly email summary" toggle (no email service exists to honour it).
- `src/landing.js`: sign-in now honours a changed password (including the built-in demo login) and shows a notice after an inactivity sign-out.

## Header logo animation
- Bigger header logo; N -> P -> pixels -> "NovaPay" forming intro (`logo-intro.css/js`, layered logo PNGs). See README.

## Hero orbit animation
- Added `src/hero-orbit.css` + `src/hero-orbit.js`: slanted orbiting cards, hover-to-centre zoom, click-to-show-on-laptop. Additive; see README.

# CHANGELOG

## Phase 8 — Final Visual + Quality Layer
- Added 3D background scene and depth effects.
- Added responsive drawer navigation and mobile AI bottom sheet.
- Added motion/accessibility polish and visibility-aware animation pausing.
- Added reduced-motion handling.
- Added responsive financial-table behavior and safe-area support.
- Added targeted wiring for notification, report and anomaly controls.
- Removed the external Google Fonts dependency from the landing page.
- Preserved the existing Phase 1–7 demo behavior and Demo Mode disclosures.

### Demo disclaimer
NovaPay is a static demo. It does not connect to PayPal, does not call a production AI backend, and does not execute real financial actions.

## Phase 9 — Hero laptop animation
- Added 3D laptop hero, floating cards, Open Dashboard transition, dashboard fade-in; fixed missing logo script and tablet horizontal overflow.

## Phase 9.1 — Hero replay + typography
- Fixed: laptop-open intro now plays on every page load/reload (removed the once-per-tab `sessionStorage` gate). Reduced-motion users still get the static open laptop.
- Typography: replaced Inter/Plus Jakarta with a Segoe UI/Helvetica body stack and a serif display stack (Source Serif 4 → Iowan Old Style → Palatino → Georgia) for headings; heading weights lowered (800/700 → 600). Tailwind presets updated (`font-display`). No web fonts needed, so it still works offline/file://.

## Phase 9.2 — Laptop alignment + realism
- Base (keyboard/trackpad) no longer looks wider than the screen: shorter deck, weaker perspective, milder tilt.
- More realistic model: brushed-aluminium finish, rounded per-key tiles, glass trackpad, slimmer bezel, soft glass reflection and contact shadow.

## Phase 9.3
- Header/mobile "Dashboard" button now opens through the hero laptop screen (scrolls to the laptop first if needed).

## Phase 9.5 — Dark Glow
- New `src/novapay-dark-glow.css` (dark mode only; light mode untouched): deeper aubergine canvas, neon pink/lavender/sky/mint glow on cards, KPI icons, chart lines, buttons, nav, status pills, inputs, AI chat and the hero laptop.
- Cash-flow chart lines now glow with neon mint / pink / sky; chart-theme.js dark palette updated.

## Phase 9.7 — Pointer light + subtle glow
- (Superseded in Phase 9.8 by the pointer theme-reveal below.)
- Graph, text, icon, card and button glows reduced to a thin edge-light.


## Phase 9.8 — Pointer theme-reveal (dark → light)
- `src/theme-reveal.js` replaces `src/dark-spotlight.js` (and the `#novapay-spotlight` CSS).
- Dark theme only: moving the pointer draws a smooth, tapering tube-shaped trail (inspired by the glowing-tubes cursor) that reveals the LIGHT theme on top of the dark one, like a soft alpha mask. No colours, no hue cycling.
- Implementation: a hidden same-page `<iframe name="novapay-lens">` forced to light theme, masked with spline-sampled radial gradients. Scroll, hash, clicks and typed values are mirrored via `postMessage` (works over `file://`).
- Tuning: `window.NOVAPAY_REVEAL = { radius: 64, life: 850 }` before the script tag.
- Light theme, touch devices: nothing is created. Switching to light removes the overlay.
- Known limits: hover styles aren't mirrored into the light layer; the light layer runs its own ambient animations (small extra CPU).
- Reveal now exists only while the pointer is moving: after ~90 ms of stillness the tube melts away (no resting circle). Tunable via `NOVAPAY_REVEAL.idle`.

## Phase 9.9 — 3D FX pack (preview.html)
New files: `src/fx-core.js` (shared loop, pointer, quality guard), `src/fx-particles.js`, `src/fx-tilt.js`, `src/fx-orb.js`, `src/fx-aurora.js`, `src/fx.css`. Each effect file has an `ENABLED` switch at the top (`fx-particles.js` has two: `SNOW_ENABLED`, `GLYPHS_ENABLED`).
1. Depth snow — soft pastel flakes at different depths (near = big, blurry, fast; far = tiny, crisp, slow) with pointer parallax. Dark theme only; the light theme shows a quieter twinkling shimmer.
2. Wake — flakes near the moving pointer / reveal ribbon are carried along and settle back.
3. Currency glyphs (₹ $ % ✓) — drift and spin in 3D behind the content, out of focus.
4. Tilting cards — hero cards lean toward the pointer with a moving glass highlight + rim light (tilt lives on an inner wrapper, so intro/bob/parallax are unchanged).
5. Glass coin — slowly rotating translucent NovaPay coin (CSS 3D) with a moving pastel refraction and gloss sweep.
6. Depth aurora — four soft gradient ribbons that move at different speeds with scroll + pointer.
`theme-reveal.js` now mirrors the pointer into the light layer so tilt/snow match inside the reveal.
Safeguards: reduced-motion (static), touch/low-power (lighter or off), hidden tab pause, adaptive particle thinning if frames get slow. dashboard.html is intentionally unchanged.

## Phase 9.10 — Snowflake artwork + login clean-up
- Snow now uses the supplied snowflake image (`assets/snowflake.png`, transparent background) instead of the soft dots; flakes tumble slowly, keep the depth blur, and the pointer wake spins them. Snow opacity lowered 10% (`SNOW_OPACITY = 0.9` in `fx-particles.js`).
- The pointer theme-reveal is switched off while the Login / Get Started modal is open (`body.modal-open`), and returns when it closes.

## Phase 9.11 — Reveal ribbon refinements
- Snowflakes removed (`SNOW_ENABLED = false` in `fx-particles.js`; currency glyphs stay). Set it back to `true` to restore them.
- Reveal ribbon width reduced by 5% (radius 64 → 60.8 px).
- Bevel: the ribbon now has a raised-glass rim — a bright light-edge along the upper-left and a soft violet shade along the lower-right. Tune with `window.NOVAPAY_REVEAL = { bevel: 5 }` (px; `0` turns it off).

## Phase 9.12 — Animated login panel + smaller reveal ribbon
- **Login / Sign Up replaced** with the supplied `login.html` design: diagonal sliding panels, staggered blur-slide fields, sliding-gradient button. New `src/auth-panel.css`; markup in `preview.html`; logic in `src/landing.js`.
- Re-themed with NovaPay tokens (no cyan/Poppins): follows light + dark (dark-glow) automatically; brand gradient on the diagonal shape, NovaPay mark and display type. No external font request.
- Demo behaviour unchanged: `user@novapay.app` / `novapay123`, Create Account, Forgot Password (enter email first, then click it), Continue with Google (simulated). `dashboard.html` still redirects to `preview.html#login`. Inactive side is `inert`; focus trap, Esc, backdrop click kept.
- Under 760px the diagonal layout is replaced by a single stacked form (Login / Sign Up toggle link); reduced-motion respected.
- **Reveal ribbon (brush mask stroke) 20% smaller:** radius 60.8 → 48.64 px, bevel 5 → 4 px (`src/theme-reveal.js`). Also applies on `dashboard.html`.

## Typography — Montserrat (replaces Oceanwide Pro)
- Montserrat is now the only typeface: tokens, Tailwind presets, canvas text and form controls.
- Headings (h1–h6) Bold 700; body/content Medium 500 at small sizes (13px base).
- `src/fonts.css` + Google Fonts link in `preview.html` / `dashboard.html`; optional offline file `assets/fonts/Montserrat-Variable.woff2`.

## Pointer animations removed
- Removed all cursor-driven animation: the dark-theme pointer reveal ribbon (`src/theme-reveal.js`, and its script tag in `dashboard.html`), hero card tilt (`src/fx-tilt.js`), orb lean toward the pointer, aurora pointer parallax, and snow pointer parallax / wake.
- `fx-core.js` no longer tracks the pointer.

## Hero — payment animation video
- The hero hands/phone picture (and the earlier rigged-hands animation) is replaced by the supplied video: hand enters, phone arrives, finger taps, loading ring, then "Payment Successful ₹2,500.00" with the green tick. Plays once when the hero is visible and holds the last frame; replays if you scroll away and back.
- `assets/novapay-payment.webm` is the video with its white background removed (transparent, so it works on the light and the dark theme); `assets/novapay-payment.mp4` is the white-background fallback (used by Safari). Both are silent.
- Markup: `.hp-video-wrap` in `preview.html`; sizing in `src/hero-phone.css` (`--hp-w`); playback in the new `src/hero-video.js`. The old hp-*.png layers were removed; `assets/novapay-hands-phone.png` (original picture) is kept.
- Nothing else changed. Not browser-tested.

## Hero video — hand update
- Right hand now eases back beside the phone after the tap and stays there (no longer leaves the frame); generator sparkle watermark removed.
- Dark theme: new cut with blue hands (`assets/novapay-payment-dark.webm/.mp4`); `src/hero-video.js` picks the cut from `data-theme` and swaps live on toggle.
- Video enlarged: `--hp-w` 112% -> 130% in `src/hero-phone.css`.
- Amounts in the video now show dollars: "$300" on the card and "$2,500.00" on the Payment Successful screen (was ₹).
- Clicking the theme toggle now restarts the hero animation automatically with the matching (light / blue-hands) cut.
- Hero Cash flow card now in dollars too ($84,500 in / $4,000 out / $80,500 net). The dashboard pages still use illustrative INR amounts.
