/* NovaPay — scroll-triggered intro for the "Start with NovaPay" section.
   Plays when the section scrolls into view (and again each time it re-enters after leaving). */
(function () {
  "use strict";
  var sec = document.getElementById("get-started-cta");
  if (!sec || !window.IntersectionObserver) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var kicker = sec.querySelector(".section-kicker"), h2 = sec.querySelector("h2"), p = sec.querySelector("p"), btn = document.getElementById("pricing-start");
  if (!kicker || !h2 || !p || !btn) return;
  kicker.classList.add("cta-text", "cta-kicker"); p.classList.add("cta-text");

  /* split the heading into words so they glide in one after another */
  var words = h2.textContent.trim().split(/\s+/);
  h2.setAttribute("aria-label", h2.textContent.trim());
  h2.innerHTML = words.map(function (w, i) { return '<span class="cta-word" aria-hidden="true" style="--cta-d:' + (150 + i * 75) + 'ms">' + w + "</span>"; }).join(" ");
  kicker.style.setProperty("--cta-d", "0ms");
  var pDelay = 150 + words.length * 75 + 120;          // paragraph follows the last heading word
  p.style.setProperty("--cta-d", pDelay + "ms");
  btn.style.setProperty("--cta-btn-d", (pDelay + 1000 + 80) + "ms");   // button pops once all the text has landed

  sec.classList.add("cta-anim");
  new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting && e.intersectionRatio >= 0.35) sec.classList.add("cta-in");
      else if (!e.isIntersecting) sec.classList.remove("cta-in");   // fully out of view → reset so it can replay
    });
  }, { threshold: [0, 0.35] }).observe(sec);
})();
