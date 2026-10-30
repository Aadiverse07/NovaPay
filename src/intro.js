/* NovaPay intro page controller. The markup is the .np-intro block at the top of <body> in preview.html and the
   <head> snippet that sets html.np-intro-on.
   Sequence: the four bands slide in -> as soon as the last band lands, a STAIR-STEP BLOCK WIPE starts by itself
   (four dark columns rise from the bottom, then seven rows wipe away left to right) and uncovers the home page
   underneath. No click needed.
   "novapay:opening-done" (which hero-laptop.js waits for) fires shortly after the reveal starts so the hero begins
   animating while the page is still being uncovered. Click / tap / Esc / Enter / Space skips ahead to the wipe.
   Add ?nointro to the URL to bypass the whole thing. */
(function () {
  "use strict";
  var root = document.documentElement;
  var intro = document.getElementById("np-intro");

  function handOver() {
    if (window.__npOpeningDone) return;
    window.__npOpeningDone = true;
    window.dispatchEvent(new Event("novapay:opening-done"));
  }
  if (!intro || !root.classList.contains("np-intro-on")) { handOver(); return; }

  window.__npIntroJs = true;                           // tells the <head> failsafe the script is running
  var texts = [].slice.call(intro.querySelectorAll(".np-band-text"));
  var timers = [];
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); }

  /* Largest font size (within a cap) at which each word fits inside its band, padding included. */
  function fit() {
    var best = 92;                                     // one shared size so all four words match
    texts.forEach(function (el) {
      var band = el.parentNode, cs = getComputedStyle(band);
      var maxW = band.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var size = Math.min(band.clientHeight * 0.4, 92), guard = 80;
      el.style.fontSize = size + "px";
      while (el.scrollWidth > maxW && size > 10 && guard--) { size -= 1; el.style.fontSize = size + "px"; }
      best = Math.min(best, size);
    });
    texts.forEach(function (el) { el.style.fontSize = best + "px"; });
  }

  /* ---------- Stair-step block wipe (matches the reference screen recording) ----------
     1) COVER   four equal dark columns rise from the bottom edge, left to right, each one a beat after the last,
                until the slide intro is completely covered.
     2) REVEAL  seven horizontal rows then wipe away left to right, top row first, each one a beat after the last,
                which uncovers the home page underneath as a descending staircase.
     Everything is plain solid-colour boxes moved with transform (GPU only), so the edges are razor sharp. */
  var HOLD = 450;             // ms the finished slide frame is held before the wipe starts
  var WIPE_COLOR = "#0f0f0f"; // wipe colour (sampled from the reference recording)
  var COLS = 4;               // cover: number of rising columns
  var COL_MS = 450;           // cover: time for one column to rise
  var COL_STAGGER = 70;       // cover: delay between neighbouring columns
  var ROWS = 7;               // reveal: number of wiping rows
  var ROW_MS = 600;           // reveal: time for one row to wipe away
  var ROW_STAGGER = 80;       // reveal: delay between neighbouring rows
  var PAUSE_MS = 220;         // fully covered moment between the two phases
  var EASE = "cubic-bezier(.65, 0, .35, 1)";
  var HAND_AFTER = 380;       // ms after the reveal starts that the hero intro is told to begin underneath
  var wipeStarted = false;
  var wipeLayer = null;

  function makeLayer(cls, n, build) {
    var layer = document.createElement("div"), i, el;
    layer.className = cls; layer.setAttribute("aria-hidden", "true");
    for (i = 0; i < n; i++) { el = document.createElement("div"); build(el, i); layer.appendChild(el); }
    return layer;
  }
  function run(el, from, to, delay, ms) {                     // Web Animations API, holds the end state
    return el.animate([{ transform: from }, { transform: to }], { duration: ms, delay: delay, easing: EASE, fill: "both" });
  }

  function startWipe() {
    if (wipeStarted) return; wipeStarted = true;
    timers.forEach(clearTimeout);
    if (!intro.animate || !window.Promise) { fallback(); return; }

    wipeLayer = document.createElement("div");
    wipeLayer.className = "np-wipe"; wipeLayer.setAttribute("aria-hidden", "true");
    wipeLayer.style.setProperty("--np-wipe", WIPE_COLOR);

    var cols = makeLayer("np-wipe-cols", COLS, function (el, i) { el.className = "np-wipe-col"; el.style.left = (i * 100 / COLS) + "%"; });
    var rows = makeLayer("np-wipe-rows", ROWS, function (el, i) { el.className = "np-wipe-row"; el.style.top = (i * 100 / ROWS) + "%"; });
    rows.style.display = "none";
    wipeLayer.appendChild(cols); wipeLayer.appendChild(rows);
    document.body.appendChild(wipeLayer);
    intro.style.pointerEvents = "none";

    /* 1) cover: columns rise from the bottom, left first */
    var coverAnims = [].slice.call(cols.children).map(function (el, i) {
      return run(el, "translateY(100%)", "translateY(0)", i * COL_STAGGER, COL_MS);
    });
    coverAnims[COLS - 1].finished.then(function () {
      setTimeout(reveal, PAUSE_MS);
      /* the screen is fully dark now: swap to the row layer and drop the slide intro without any visible change */
      rows.style.display = "block"; cols.style.display = "none";
      intro.style.display = "none";
    }, reveal);

    /* 2) reveal: rows wipe away left to right, top row first, uncovering the home page */
    function reveal() {
      if (!wipeLayer) return;
      wipeLayer.style.pointerEvents = "none";
      var anims = [].slice.call(rows.children).map(function (el, i) {
        el.style.transformOrigin = "100% 50%";               // shrinks towards the right edge = wipes left to right
        return run(el, "scaleX(1)", "scaleX(0)", i * ROW_STAGGER, ROW_MS);
      });
      setTimeout(handOver, HAND_AFTER);
      anims[ROWS - 1].finished.then(cleanup, cleanup);
    }
  }

  function fallback() {                                       // no Web Animations: plain fade so the page is never stuck
    intro.style.pointerEvents = "none";
    intro.style.transition = "opacity .7s ease"; intro.style.opacity = "0";
    handOver();
    setTimeout(cleanup, 750);
  }

  function cleanup() {
    root.classList.remove("np-intro-on");
    intro.parentNode && intro.parentNode.removeChild(intro);
    wipeLayer && wipeLayer.parentNode && wipeLayer.parentNode.removeChild(wipeLayer);
    wipeLayer = null;
    handOver();                                               // no-op if already fired
  }

  function play() {
    fit();
    intro.classList.add("is-playing");
    // When the last band has landed, the wipe starts by itself.
    var last = intro.querySelector(".np-band--4");
    if (last) last.addEventListener("animationend", function () { later(startWipe, HOLD); });
    later(startWipe, 3 * 800 + 950 + HOLD + 1200);              // failsafe if animationend never fires (background tab)
  }

  function skip() { if (!wipeStarted) startWipe(); }

  intro.addEventListener("click", skip);
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip();
  });
  window.addEventListener("resize", fit);

  /* Wait (briefly) for Lemon Milk so the words never change font mid-slide. */
  var started = false;
  function go() { if (started) return; started = true; play(); }
  if (document.fonts && document.fonts.load) {
    Promise.race([
      document.fonts.load('700 40px "Lemon Milk"', "Accurate & Faster Secured Reliable Auditable"),
      new Promise(function (r) { setTimeout(r, 1200); })
    ]).then(go, go);
  } else go();
  setTimeout(go, 1500);
})();
