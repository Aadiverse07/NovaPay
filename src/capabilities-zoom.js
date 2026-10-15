/* NovaPay — scroll-driven zoom for every homepage section below the hero.
   Pure function of scroll position, so scrolling up reverses it exactly. Section zooms 0.8→1;
   its content starts smaller (0.55→1) and staggers in, so text "pops" into view. */
(function () {
  "use strict";
  var mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  if (mq && mq.matches) return;
  var secs = [].slice.call(document.querySelectorAll(".value-strip,.features-section,.plans-section,.company-section,.pricing-band"));
  if (!secs.length) return;
  var items = secs.map(function (el) { return { el: el, kids: [].slice.call(el.children), top: 0, last: -1 }; });
  var vh = innerHeight, maxScroll = 0, ticking = false, off = false;

  function measure() {
    vh = innerHeight;
    maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
    items.forEach(function (it) { var y = 0, n = it.el; while (n) { y += n.offsetTop; n = n.offsetParent; } it.top = y; it.last = -1; });
  }
  function clear(it) {
    it.el.classList.remove("cz-active"); it.el.style.transform = it.el.style.opacity = "";
    it.kids.forEach(function (k) { k.style.transform = k.style.opacity = ""; k.style.transformOrigin = ""; });
  }
  function render() {
    ticking = false;
    var sy = scrollY, w = innerWidth;
    var s0 = w < 700 ? 0.92 : w < 1100 ? 0.87 : 0.8, c0 = w < 700 ? 0.7 : 0.55;
    items.forEach(function (it) {
      var rel = it.top - sy, start = vh * 0.95;
      var end = Math.max(vh * 0.15, it.top - maxScroll + 2);   // last section may not reach the top: finish at page end
      if (end > start - vh * 0.25) start = Math.min(vh, end + vh * 0.25);
      var t = Math.min(1, Math.max(0, (start - rel) / (start - end)));
      var e = t * t * (3 - 2 * t);
      if (e === it.last) return;
      it.last = e;
      if (e >= 0.999) { clear(it); return; }
      it.el.classList.add("cz-active");
      it.el.style.transform = "scale(" + (s0 + (1 - s0) * e).toFixed(4) + ")";
      it.el.style.opacity = (0.3 + 0.7 * e).toFixed(3);
      var n = it.kids.length, step = Math.min(0.08, 0.4 / n);
      it.kids.forEach(function (k, i) {
        var u = Math.min(1, Math.max(0, (e - i * step) / (1 - (n - 1) * step)));
        u = 1 - Math.pow(1 - u, 2);
        k.style.transformOrigin = "50% 50%";
        k.style.transform = "scale(" + (c0 + (1 - c0) * u).toFixed(4) + ")";
        k.style.opacity = u.toFixed(3);
      });
    });
  }
  function onScroll() { if (!ticking && !off) { ticking = true; requestAnimationFrame(render); } }
  function refresh() { measure(); onScroll(); }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", refresh);
  addEventListener("load", refresh);
  if (window.ResizeObserver) new ResizeObserver(refresh).observe(document.body);
  if (mq && mq.addEventListener) mq.addEventListener("change", function () { if (mq.matches) { off = true; items.forEach(clear); } });
  refresh();
})();
