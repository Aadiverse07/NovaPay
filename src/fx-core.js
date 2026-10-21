/* NovaPay FX core (classic script, works over file://).
   Shared by fx-particles.js, fx-orb.js, fx-aurora.js. Load it FIRST.

   - ONE requestAnimationFrame loop for every effect (they register with NovaPayFX.add).
   - Respects prefers-reduced-motion, touch devices and low-power hints, and automatically
     lowers NovaPayFX.quality if the page can't hold ~40 fps.                                   */
(function () {
  "use strict";
  if (window.NovaPayFX) return;

  var root = document.documentElement;
  var mqReduce = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var coarse = window.matchMedia ? matchMedia("(hover: none), (pointer: coarse)").matches : false;
  var conn = navigator.connection || {};
  var low = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
            (navigator.deviceMemory && navigator.deviceMemory <= 2) || conn.saveData === true;

  var FX = {
    reduced: mqReduce.matches,
    coarse: coarse,
    low: !!low,
    quality: 1,                                   // 1 = full, lowered automatically on slow devices
    ptr: { x: -9999, y: -9999, vx: 0, vy: 0, speed: 0, active: false, t: 0 },
    theme: function () { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; },
    add: add
  };
  window.NovaPayFX = FX;
  if (mqReduce.addEventListener) mqReduce.addEventListener("change", function () { FX.reduced = mqReduce.matches; });

  /* Pointer tracking removed: FX.ptr stays inactive, so no effect follows the cursor. */

  /* ---------- shared loop ---------- */
  var fns = [], raf = 0, last = 0, acc = 0, frames = 0, warm = 0;
  function add(fn) { fns.push(fn); start(); }
  function start() { if (!raf && !FX.reduced) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function loop(now) {
    raf = 0;
    var dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    for (var i = 0; i < fns.length; i++) { try { fns[i](dt, now); } catch (e) {} }

    // adaptive quality: if the average frame is slower than ~26 ms, thin the particles out (max 2 steps)
    if (++warm > 90) {
      acc += dt; frames++;
      if (frames >= 90) {
        if (acc / frames > 0.026 && FX.quality > 0.45) FX.quality = Math.max(0.4, FX.quality - 0.3);
        acc = 0; frames = 0;
      }
    }
    if (!document.hidden && !FX.reduced) raf = requestAnimationFrame(loop);
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) start(); });
  if (mqReduce.addEventListener) mqReduce.addEventListener("change", start);
})();
