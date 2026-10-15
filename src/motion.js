/* NovaPay shared motion utilities — framework-agnostic, one-shot and reduced-motion aware. */
(function () {
  "use strict";
  var DURATION = 900;
  var EASE = "cubic-bezier(0.22,1,0.36,1)";
  var REDUCED = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  function useInView(el, callback, options) {
    if (!el) return function () {};
    var fired = false;
    function run() { if (fired) return; fired = true; callback(); }
    if (REDUCED() || !window.IntersectionObserver) { run(); return function () {}; }
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) { run(); io.disconnect(); }
    }, Object.assign({ threshold: 0.16 }, options || {}));
    io.observe(el);
    return function () { io.disconnect(); };
  }

  function useCountUp(el, finalValue, format, duration) {
    if (!el) return;
    duration = duration || DURATION;
    if (REDUCED()) { el.textContent = format(finalValue); return; }
    var start = performance.now();
    function frame(now) {
      var p = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(finalValue * eased);
      if (p < 1) requestAnimationFrame(frame); else el.textContent = format(finalValue);
    }
    el.textContent = format(0);
    requestAnimationFrame(frame);
  }

  window.NovaPayMotion = {
    duration: DURATION,
    easing: EASE,
    reduced: REDUCED,
    useInView: useInView,
    useCountUp: useCountUp,
    chart: { duration: DURATION, easing: EASE, line: "progressive", bar: "grow", area: "reveal" }
  };
})();
