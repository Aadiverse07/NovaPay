/* NovaPay — scroll-driven zoom for every homepage section below the hero.
   Pure function of scroll position, so scrolling up reverses it exactly. Section zooms 0.8→1;
   its content starts smaller (0.55→1) and staggers in, so text "pops" into view.
   ZOOM OUT: as a section scrolls up and away it plays the same effect in reverse (scales back down,
   content shrinks and fades, top items leaving first). Scrolling back up zooms it in again. */
(function () {
  "use strict";
  var mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  if (mq && mq.matches) return;
  var secs = [].slice.call(document.querySelectorAll(".value-strip,.features-section,.plans-section,.company-section,.pricing-band"));
  if (!secs.length) return;
  var items = secs.map(function (el) { return { el: el, kids: [].slice.call(el.children), top: 0, bot: 0, last: "" }; });
  var vh = innerHeight, maxScroll = 0, ticking = false, off = false;

  function measure() {
    vh = innerHeight;
    maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
    items.forEach(function (it) { var y = 0, n = it.el; while (n) { y += n.offsetTop; n = n.offsetParent; } it.top = y; it.bot = y + it.el.offsetHeight; it.last = ""; });
  }
  function clear(it) {
    it.el.classList.remove("cz-active"); it.el.style.transform = it.el.style.opacity = it.el.style.transformOrigin = "";
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
      var eIn = t * t * (3 - 2 * t);

      /* zoom-out: driven by where the section's BOTTOM edge sits as it leaves through the top */
      var botRel = it.bot - sy;
      var botAtMax = it.bot - maxScroll;                            // where the bottom edge ends up at the very end of the page
      var xStart = botAtMax > 0 ? Math.min(vh * 0.45, botAtMax - 2) : vh * 0.45;   // a section that can never scroll away (page end) never shrinks
      var xEnd = Math.min(-vh * 0.05, xStart - vh * 0.3);
      var tx = Math.min(1, Math.max(0, (xStart - botRel) / (xStart - xEnd)));
      var eOut = 1 - tx * tx * (3 - 2 * tx);

      var key = eIn.toFixed(4) + "|" + eOut.toFixed(4);
      if (key === it.last) return;
      it.last = key;
      if (eIn >= 0.999 && eOut >= 0.999) { clear(it); return; }
      var e = Math.min(eIn, eOut);
      it.el.classList.add("cz-active");
      it.el.style.transformOrigin = eOut < eIn ? "50% 85%" : "";   // leaving: shrink toward the bottom edge
      it.el.style.transform = "scale(" + (s0 + (1 - s0) * e).toFixed(4) + ")";
      it.el.style.opacity = (0.3 + 0.7 * e).toFixed(3);
      var n = it.kids.length, step = Math.min(0.08, 0.4 / n);
      it.kids.forEach(function (k, i) {
        var uIn = Math.min(1, Math.max(0, (eIn - i * step) / (1 - (n - 1) * step)));
        uIn = 1 - Math.pow(1 - uIn, 2);
        var uOut = Math.min(1, Math.max(0, (eOut - (n - 1 - i) * step) / (1 - (n - 1) * step)));   // first item leaves first
        uOut = 1 - Math.pow(1 - uOut, 2);
        var u = Math.min(uIn, uOut);
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
