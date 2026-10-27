/* Cross-module motion: view-enter restarts, KPI count-up, live report trend line, spotlight. */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)"), NS = "http://www.w3.org/2000/svg";
  var ease = function (t) { return 1 - Math.pow(1 - t, 4); };

  function countUp(el, ms) {
    if (!el || reduce.matches || el.dataset.mpBusy) return;
    var text = el.textContent, m = text.match(/\d[\d,]*(\.\d+)?/); if (!m) return;
    var target = parseFloat(m[0].replace(/,/g, "")), dec = m[1] ? m[1].length - 1 : 0;
    var pre = text.slice(0, m.index), post = text.slice(m.index + m[0].length), t0 = performance.now(); ms = ms || 1100;
    el.dataset.mpBusy = "1";
    (function tick(now) {
      var p = Math.min(1, (now - t0) / ms);
      el.textContent = pre + (target * ease(p)).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post;
      if (p < 1) requestAnimationFrame(tick); else { el.textContent = text; delete el.dataset.mpBusy; }
    })(t0);
  }

  function enter(view) {
    view.classList.remove("mp-in"); void view.offsetWidth; view.classList.add("mp-in");
    view.querySelectorAll(".spark-line").forEach(function (p) { p.setAttribute("pathLength", "1"); });
    view.querySelectorAll(".module-kpis strong, .report-summary-grid strong, .campaign-numbers b, .report-bars b, .kpi-card > strong").forEach(function (el, i) {
      setTimeout(function () { countUp(el, 1100); }, 120 + i * 90);
    });
  }

  document.querySelectorAll("[data-view-panel]").forEach(function (view) {
    new MutationObserver(function () { if (!view.hidden) enter(view); }).observe(view, { attributes: true, attributeFilter: ["hidden"] });
    if (!view.hidden) enter(view);
  });

  var period = document.getElementById("report-period");
  if (period) period.addEventListener("change", function () {
    var v = document.getElementById("view-reports"); if (v) enter(v);
  });

  /* Spotlight position on cards */
  var raf = 0;
  document.addEventListener("pointermove", function (e) {
    if (reduce.matches || raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var c = e.target.closest && e.target.closest(".dash-card, .campaign-card, .kpi-card"); if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  }, { passive: true });
})();
