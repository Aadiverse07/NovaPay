/* MagicBento-style pointer lighting and click pulse for dashboard summary cards. */
(function () {
  "use strict";

  var cards = Array.from(document.querySelectorAll(
    ".view article, .view .dashboard-hero-card"
  ));
  if (!cards.length) return;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  cards.forEach(function (card, index) {
    card.classList.add("magic-bento-card");
    card.style.setProperty("--mb-order", index);

    if (!reduce) {
      card.addEventListener("pointermove", function (event) {
        var rect = card.getBoundingClientRect();
        card.style.setProperty("--mb-x", ((event.clientX - rect.left) / rect.width * 100) + "%");
        card.style.setProperty("--mb-y", ((event.clientY - rect.top) / rect.height * 100) + "%");
        card.classList.add("magic-bento-card--active");
      }, { passive: true });

      card.addEventListener("pointerleave", function () {
        card.classList.remove("magic-bento-card--active");
      }, { passive: true });

      card.addEventListener("click", function (event) {
        var rect = card.getBoundingClientRect();
        var x = event.detail === 0 ? rect.width / 2 : event.clientX - rect.left;
        var y = event.detail === 0 ? rect.height / 2 : event.clientY - rect.top;
        var wave = document.createElement("span");
        wave.className = "magic-bento-card__wave";
        wave.setAttribute("aria-hidden", "true");
        wave.style.setProperty("--mb-click-x", x + "px");
        wave.style.setProperty("--mb-click-y", y + "px");
        card.appendChild(wave);
        wave.addEventListener("animationend", function () { wave.remove(); }, { once: true });
      });
    }
  });

  if (reduce || !("IntersectionObserver" in window)) {
    cards.forEach(function (card) { card.classList.add("magic-bento-card--shown"); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("magic-bento-card--shown");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  cards.forEach(function (card) { observer.observe(card); });
})();
