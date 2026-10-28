/* Reveal NovaPay capability cards from alternating sides as they enter view. */
(function () {
  "use strict";
  var cards = Array.prototype.slice.call(document.querySelectorAll("#features .feature-grid .feature-card"));
  if (!cards.length) return;

  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  cards.forEach(function (card, index) {
    card.classList.add(index < 3 ? "capability-enter-left" : "capability-enter-right");
    card.style.setProperty("--capability-delay", Math.min(index, 4) * 110 + "ms");
  });

  if (reducedMotion || !("IntersectionObserver" in window)) {
    cards.forEach(function (card) { card.classList.add("is-entered"); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      entry.target.classList.toggle("is-entered", entry.isIntersecting);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });

  cards.forEach(function (card) { observer.observe(card); });
})();
