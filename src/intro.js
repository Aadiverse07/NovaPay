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
  var HOLD = 200;             // ms the finished slide frame is held before the wipe starts
  var WIPE_COLOR = "#0f0f0f"; // wipe colour (sampled from the reference recording)
  var COLS = 4;               // cover: number of rising columns
  var COL_MS = 360;           // cover: time for one column to rise
  var COL_STAGGER = 50;       // cover: delay between neighbouring columns
  var ROWS = 7;               // reveal: number of wiping rows
  var ROW_MS = 640;           // reveal: time for one row to wipe away
  var ROW_STAGGER = 80;       // reveal: delay between neighbouring rows
  var PAUSE_MS = 6000;        // failsafe only: the reveal normally starts the moment the loader has assembled and broken back into dots
  var EASE = "cubic-bezier(.76, 0, .24, 1)";   // smooth in-out (quart) for the stair
  var HAND_AFTER = 420;       // ms after the reveal starts that the hero intro is told to begin underneath
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

    /* Animated NovaPay stroke loader (Uiverse) shown on the dark screen (above the columns / rows). */
    var mark = document.createElement("div");
    mark.className = "np-opening-loader"; mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      '<linearGradient id="np-grad-blue" gradientUnits="userSpaceOnUse" x1="0" y1="72" x2="0" y2="8"><stop stop-color="#973BED"/><stop stop-color="#007CFF" offset="1"/></linearGradient>' +
      '<linearGradient id="np-grad-pink" gradientUnits="userSpaceOnUse" x1="0" y1="72" x2="0" y2="8"><stop stop-color="#FF1FD0"/><stop stop-color="#FFB020" offset="1"/></linearGradient>' +
      '<linearGradient id="np-grad-green" gradientUnits="userSpaceOnUse" x1="0" y1="72" x2="0" y2="8"><stop stop-color="#00E0ED"/><stop stop-color="#00DA72" offset="1"/></linearGradient></defs></svg>' +
      '<div class="loader" role="img" aria-label="NovaPay">' +
      '<svg viewBox=\"0 0 80 80\" height=\"80\" width=\"80\"><path class=\"dash g-blue\" pathLength=\"360\" d=\"M14 72V8L66 72V8\"/></svg>' +
      '<svg viewBox=\"0 0 80 80\" height=\"80\" width=\"80\"><path class=\"spin g-pink\" pathLength=\"360\" d=\"M40 12a28 28 0 1 1 0 56a28 28 0 1 1 0-56\"/></svg>' +
      '<svg viewBox=\"0 0 80 80\" height=\"80\" width=\"80\"><path class=\"dash g-green\" pathLength=\"360\" d=\"M10 8L40 72L70 8\"/></svg>' +
      '<svg viewBox=\"0 0 80 80\" height=\"80\" width=\"80\"><path class=\"dash g-blue\" pathLength=\"360\" d=\"M10 72L40 8L70 72M23 50H57\"/></svg>' +
      '<svg viewBox=\"0 0 80 80\" height=\"80\" width=\"80\"><path class=\"dash g-pink\" pathLength=\"360\" d=\"M18 72V8H44A16 16 0 0 1 44 40H18\"/></svg>' +
      '<svg viewBox=\"0 0 80 80\" height=\"80\" width=\"80\"><path class=\"dash g-green\" pathLength=\"360\" d=\"M10 72L40 8L70 72M23 50H57\"/></svg>' +
      '<svg viewBox=\"0 0 80 80\" height=\"80\" width=\"80\"><path class=\"dash g-blue\" pathLength=\"360\" d=\"M28 72V40M8 20Q14 40 28 40Q44 40 52 8\"/></svg>' +
      '</div>';
    wipeLayer.appendChild(mark);
    document.body.appendChild(wipeLayer);
    intro.style.pointerEvents = "none";

    /* 1) cover: columns rise from the bottom, left first */
    var coverAnims = [].slice.call(cols.children).map(function (el, i) {
      return run(el, "translateY(100%)", "translateY(0)", i * COL_STAGGER, COL_MS);
    });
    coverAnims[COLS - 1].finished.then(function () {
      /* the screen is fully dark now: swap to the row layer and drop the slide intro without any visible change */
      rows.style.display = "block"; cols.style.display = "none";
      intro.style.display = "none";
      mark.classList.add("is-in");                            // fade the NovaPay wordmark in on the dark screen
      /* start the stair reveal the instant every letter has assembled, broken into dots and faded out */
      setTimeout(reveal, PAUSE_MS);                           // failsafe
      var strokes = mark.getAnimations ? mark.getAnimations({ subtree: true }).filter(function (a) {
        return a.effect && a.effect.target && a.effect.target.tagName === "path";
      }) : [];
      if (strokes.length) Promise.all(strokes.map(function (a) { return a.finished; })).then(reveal, function () {});
    }, reveal);

    /* 2) reveal: rows wipe away left to right, top row first, uncovering the home page */
    var revealed = false;
    function reveal() {
      if (!wipeLayer || revealed) return; revealed = true;
      wipeLayer.style.pointerEvents = "none";
      mark.classList.remove("is-in"); mark.classList.add("is-out");   // wordmark fades out as the rows wipe away
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
