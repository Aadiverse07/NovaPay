/* Animated-List behaviours for every module: in-view springs, gliding selection, arrow keys, edge fades, stepper token. */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)");
  var SEL = ".module-table-wrap tbody tr, .table-scroll tbody tr, .transparency-row, .maintenance-list > article, .report-bars > div, .document-review";
  var EXCLUDE = "#view-transactions, #view-dashboard";
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("rb-in"); io.unobserve(e.target); } });
  }, { threshold: .12 }) : null;

  function hostOf(item) {
    var h = item.closest(".module-table-wrap, .table-scroll") || item.parentElement;
    h.classList.add("rb-host");
    if (!h._rb) { var ind = document.createElement("div"); ind.className = "rb-indicator"; ind.setAttribute("aria-hidden", "true"); h.appendChild(ind); h._rb = ind; fades(h); }
    return h;
  }
  function place(host, item) {
    var ind = host._rb, r = item.getBoundingClientRect(), b = host.getBoundingClientRect();
    var isTransparency = item.classList.contains("transparency-row");
    ind.style.width = (r.width + (isTransparency ? 20 : 8)) + "px"; ind.style.height = (r.height + 6) + "px";
    ind.style.transform = "translate(" + (r.left - b.left + host.scrollLeft - (isTransparency ? 16 : 4)) + "px," + (r.top - b.top + host.scrollTop - 3) + "px)";
    ind.classList.add("is-on");
  }
  function fades(h) {
    if (h.scrollHeight <= h.clientHeight + 4 || getComputedStyle(h).overflowY === "visible") return;
    h.classList.add("rb-fade");
    (h.onscroll = function () { h.style.setProperty("--rb-t", h.scrollTop > 4 ? "28px" : "0px"); h.style.setProperty("--rb-b", h.scrollTop + h.clientHeight < h.scrollHeight - 4 ? "28px" : "0px"); })();
  }

  /* Prepare a view's items: stagger index + spring when scrolled into view. */
  function prepare(view) {
    if (reduce.matches || view.matches(EXCLUDE)) return;
    var groups = new Map();
    view.querySelectorAll(SEL).forEach(function (it) {
      var h = hostOf(it), n = groups.get(h) || 0; groups.set(h, n + 1);
      it.classList.add("rb-item"); it.classList.remove("rb-in"); void it.offsetWidth;
      it.style.setProperty("--rb-i", Math.min(n, 12));
      if (it.tagName === "TR" || it.classList.contains("transparency-row") || it.classList.contains("document-review")) it.tabIndex = 0;
      if (io) io.observe(it); else it.classList.add("rb-in");
    });
    view.querySelectorAll(".workflow-steps").forEach(stepper);
  }

  /* Gliding selection on hover / focus. */
  function select(e) {
    var it = e.target.closest && e.target.closest(".rb-item"); if (!it || it.closest(EXCLUDE)) return;
    place(hostOf(it), it);
  }
  document.addEventListener("pointerover", select);
  document.addEventListener("focusin", select);
  document.addEventListener("pointerout", function (e) {
    var h = e.target.closest && e.target.closest(".rb-host"); if (h && h._rb && !h.contains(e.relatedTarget) && !h.contains(document.activeElement)) h._rb.classList.remove("is-on");
  });

  /* Arrow-key navigation across items (like the Animated List demo). */
  document.addEventListener("keydown", function (e) {
    var it = e.target.closest && e.target.closest(".rb-item"); if (!it || it.closest(EXCLUDE)) return;
    var sibs = Array.prototype.filter.call(it.parentElement.children, function (c) { return c.classList.contains("rb-item") && !c.hidden; });
    var i = sibs.indexOf(it), k = e.key, n = null;
    if (k === "ArrowDown" || k === "ArrowRight") n = sibs[Math.min(sibs.length - 1, i + 1)];
    else if (k === "ArrowUp" || k === "ArrowLeft") n = sibs[Math.max(0, i - 1)];
    else if (k === "Home") n = sibs[0]; else if (k === "End") n = sibs[sibs.length - 1];
    else if ((k === "Enter" || k === " ") && e.target === it) { var b = it.querySelector("button, .table-action, a"); if (b) { e.preventDefault(); b.click(); } return; }
    if (n) { e.preventDefault(); n.focus({ preventScroll: false }); n.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  });

  /* Stepper: a green token glides through every completed step and rests on the last one. */
  function stepper(w) {
    var done = w.querySelectorAll(".done"); if (!done.length) return;
    var tok = w._tok; if (!tok) { tok = w._tok = document.createElement("i"); tok.className = "rb-step-token"; w.insertBefore(tok, w.firstChild); }
    tok.classList.remove("is-on"); clearTimeout(w._t);
    var i = 0, wr = function () { var r = done[i].getBoundingClientRect(), b = w.getBoundingClientRect();
      tok.style.width = r.width + "px"; tok.style.height = r.height + "px"; tok.style.transform = "translate(" + (r.left - b.left) + "px," + (r.top - b.top) + "px)"; tok.classList.add("is-on"); };
    (function step() { if (!done[i] || !w.isConnected) return; wr(); i++; if (i < done.length) w._t = setTimeout(step, 520); })();
  }

  document.querySelectorAll("[data-view-panel]").forEach(function (v) {
    new MutationObserver(function () { if (!v.hidden) setTimeout(function () { prepare(v); }, 60); }).observe(v, { attributes: true, attributeFilter: ["hidden"] });
    if (!v.hidden) setTimeout(function () { prepare(v); }, 60);
  });
})();
