/* Slide-in on scroll for NovaPay Capabilities cards: first row from left, second row from right. */
(function () {
  "use strict";
  var BASE_DELAY = 250;  // ms to wait after the card enters view before it animates (change to taste)
  var cards = [].slice.call(document.querySelectorAll(".feature-grid .feature-card"));
  if (!cards.length || !("IntersectionObserver" in window)) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Group cards into visual rows by their layout position (3 + 2 on desktop, 2/2/1 on tablet, 1 per row on mobile)
  function layout() {
    var tops = [];
    cards.forEach(function (c) {
      var t = Math.round(c.offsetTop / 10), r = tops.indexOf(t);
      if (r < 0) { tops.push(t); r = tops.length - 1; }
      c._row = r;
    });
    var seen = {};
    cards.forEach(function (c) {
      var i = seen[c._row] = (seen[c._row] || 0);
      seen[c._row]++;
      var fromRight = c._row % 2 === 1;                 // odd rows (the lower ones) come from the right
      c.classList.toggle("cc-right", fromRight);
      c.style.setProperty("--cc-d", (BASE_DELAY + i * 110) + "ms");     // gentle stagger within a row
    });
  }

  document.documentElement.classList.add("cc-ready");
  layout();
  addEventListener("resize", layout);

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var c = e.target;
      if (e.isIntersecting) { c.classList.add("cc-in"); }
      else if (e.boundingClientRect.top > 0) { c.classList.remove("cc-in"); }  // scrolled back above → replay next time
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  cards.forEach(function (c) { io.observe(c); });
})();
