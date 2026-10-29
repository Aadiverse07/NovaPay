/* One-time-per-tab opening sequence. */
(function () {
  "use strict";
  var intro = document.querySelector(".np-world-intro");
  if (!intro) return;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  try {
    if (sessionStorage.getItem("np-world-intro-seen") === "1") intro.remove();
    else sessionStorage.setItem("np-world-intro-seen", "1");
  } catch (_) {}
  if (!intro.isConnected) return;
  if (reduced) { intro.remove(); return; }
  intro.removeAttribute("aria-hidden");
  function dismiss() {
    if (!intro.isConnected) return;
    intro.classList.add("is-skipped");
    intro.setAttribute("aria-hidden", "true");
    window.setTimeout(function () { intro.remove(); }, 600);
  }
  intro.querySelector(".np-world-intro__skip").addEventListener("click", dismiss);
  window.setTimeout(dismiss, 7000);
}());
