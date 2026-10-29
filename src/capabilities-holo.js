/* Pointer-reactive holographic tilt for cards across the NovaPay website. */
(function () {
  "use strict";
  var selector = [
    "#features .feature-grid .feature-card", "#feature-summary", "#hero-stage .float-card",
    "#hero-stage .lpui-card", "#hero-stage .lpui-kpi", ".dashboard-main .dashboard-hero-card",
    ".dashboard-main .kpi-card", ".dashboard-main .dash-kpis > article",
    ".dashboard-main .ledger-summary > article", ".dashboard-main .dash-card", ".dashboard-main article",
    ".dashboard-main .document-review", ".dashboard-main .report-card",
    ".dashboard-main .maintenance-list > article", ".dashboard-main .campaign-grid > article",
    ".dashboard-main .approval-card", ".dashboard-main .agent-card",
    ".dashboard-main .ai-proposal-card", ".dashboard-main .suggested-action",
    ".dashboard-main .hero-paypal-card", ".action-modal .action-dialog", ".transaction-modal .transaction-dialog",
    ".action-modal .action-summary"
  ].join(",");
  if (!window.matchMedia || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var initialized = new WeakSet();
  function initialize(root) {
    var cards = [];
    if (root.nodeType === 1 && root.matches(selector)) cards.push(root);
    if (root.querySelectorAll) cards = cards.concat([].slice.call(root.querySelectorAll(selector)));
    cards.forEach(function (card) {
      if (initialized.has(card)) return;
      initialized.add(card);
      card.classList.add("holo-target");

      function move(event) {
        var nearestCard = event.target && event.target.closest ? event.target.closest(".holo-target") : null;
        if (nearestCard && nearestCard !== card) return;
        var rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        var y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        if (card.id === "feature-summary") {
          card.style.setProperty("--holo-x", (x * 100).toFixed(1) + "%");
          card.style.setProperty("--holo-y", (y * 100).toFixed(1) + "%");
          card.style.setProperty("--holo-angle", (Math.atan2(y - .5, x - .5) * 180 / Math.PI).toFixed(1) + "deg");
          card.classList.add("holo-active");
          return;
        }
        var isHeroCard = card.matches("#hero-stage .float-card, #hero-stage .lpui-card, #hero-stage .lpui-kpi");
        var isDashboardCard = card.matches(".dashboard-main .holo-target, .action-modal .holo-target, .transaction-modal .transaction-dialog.holo-target");
        var rx = ((.5 - y) * 11);
        var ry = ((x - .5) * 13);
        card.style.setProperty("--holo-rx", rx.toFixed(2) + "deg");
        card.style.setProperty("--holo-ry", ry.toFixed(2) + "deg");
        if (isHeroCard || isDashboardCard) {
          var angle = Math.hypot(rx, ry);
          var axisX = angle ? (ry / angle).toFixed(4) : "0";
          var axisY = angle ? (rx / angle).toFixed(4) : "0";
          card.style.setProperty("--holo-rotation", axisX + " " + axisY + " 0 " + angle.toFixed(2) + "deg");
        }
        card.style.setProperty("--holo-x", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--holo-y", (y * 100).toFixed(1) + "%");
        card.style.setProperty("--holo-angle", (Math.atan2(y - .5, x - .5) * 180 / Math.PI).toFixed(1) + "deg");
        card.classList.add("holo-active");
      }

      function reset() {
        card.classList.remove("holo-active");
        card.style.setProperty("--holo-rx", "0deg");
        card.style.setProperty("--holo-ry", "0deg");
        card.style.setProperty("--holo-x", "50%");
        card.style.setProperty("--holo-y", "50%");
        if (card.matches("#hero-stage .float-card, #hero-stage .lpui-card, #hero-stage .lpui-kpi, .dashboard-main .holo-target, .action-modal .holo-target, .transaction-modal .transaction-dialog.holo-target")) card.style.removeProperty("--holo-rotation");
      }

      card.addEventListener("pointerenter", move, { passive: true });
      card.addEventListener("pointermove", move, { passive: true });
      card.addEventListener("pointerleave", reset, { passive: true });
      card.addEventListener("focusin", function () { card.classList.add("holo-active"); });
      card.addEventListener("focusout", function (event) { if (!card.contains(event.relatedTarget)) reset(); });
    });
  }

  initialize(document);
  if (window.MutationObserver) {
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) { if (node.nodeType === 1) initialize(node); });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
