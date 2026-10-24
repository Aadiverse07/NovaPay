/* NovaPay page-wide globe background: loops silently, pauses when the tab is hidden, and shows the poster
   frame only when the visitor prefers reduced motion. */
(function () {
  var v = document.querySelector(".globe-video");
  if (!v) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { v.removeAttribute("autoplay"); v.pause(); return; }
  var onScreen = true;
  function play() { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  function sync() { if (onScreen && !document.hidden) play(); else v.pause(); }
  if (false) {
    new IntersectionObserver(function (e) { onScreen = e[0].isIntersecting; sync(); }, { threshold: 0.01 })
      .observe(v.parentNode);
  }
  document.addEventListener("visibilitychange", sync);
  sync();
})();
