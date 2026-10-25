/* Proximity-driven LineSidebar treatment for the existing dashboard navigation. */
(function () {
  "use strict";

  var nav = document.querySelector(".dashboard-nav");
  if (!nav) return;
  var items = Array.from(nav.querySelectorAll("a[data-view]"));
  if (!items.length) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  var radius = 120;
  var smoothing = 115;
  var targets = items.map(function () { return 0; });
  var values = items.map(function () { return 0; });
  var raf = 0;
  var last = 0;

  function frame(now) {
    raf = 0;
    var k = 1 - Math.exp(-Math.min(now - last, 50) / smoothing);
    last = now;
    var moving = false;
    items.forEach(function (item, index) {
      var target = Math.max(targets[index], item.getAttribute("aria-current") === "page" ? 1 : 0);
      var next = values[index] + (target - values[index]) * k;
      if (Math.abs(target - next) < 0.002) next = target;
      values[index] = next;
      item.style.setProperty("--line-effect", next.toFixed(3));
      if (next !== target) moving = true;
    });
    if (moving) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf) cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  nav.addEventListener("pointermove", function (event) {
    var rect = nav.getBoundingClientRect();
    items.forEach(function (item, index) {
      var box = item.getBoundingClientRect();
      var center = box.top + box.height / 2 - rect.top;
      var distance = Math.abs(event.clientY - rect.top - center);
      var proximity = Math.max(0, 1 - distance / radius);
      targets[index] = proximity * proximity * (3 - 2 * proximity);
    });
    start();
  }, { passive: true });

  nav.addEventListener("pointerleave", function () {
    targets = items.map(function () { return 0; });
    start();
  }, { passive: true });

  nav.addEventListener("click", start);
  start();
})();
