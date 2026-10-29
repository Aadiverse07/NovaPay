/* Opens every module popup the way the Transactions detail does: the dialog grows out of the
   button / row / card that was clicked (blurred, small -> full size), the backdrop fades in,
   the fields rise in one after another and money values count up.
   Covers: Approvals (review + confirm), Invoices (new + detail), Maintenance (new request),
   Reports (report detail) and the refund confirmation. Transactions and Campaign create already
   have their own origin animation and are left untouched.
   Visual only: no logic, data or markup is changed. */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)");
  var EASE = "cubic-bezier(.16,1,.3,1)";
  var MODALS = [
    { id: "approval-detail-modal", dialog: ".approval-dialog" },
    { id: "approval-confirm-modal", dialog: ".approval-dialog" },
    { id: "invoice-detail-modal", dialog: ".approval-dialog" },
    { id: "invoice-create-modal", dialog: ".invoice-dialog" },
    { id: "maintenance-create-modal", dialog: ".transaction-dialog" },
    { id: "report-detail-modal", dialog: ".transaction-dialog" },
    { id: "action-modal", dialog: ".action-dialog" }
  ];
  var TRIGGER = "button,[role='button'],a,tr,.btn,[data-ui-action],.approval-card,[data-proposal-id]";

  /* Remember what was pressed last. pointerdown / keydown are recorded as well as click, because some
     handlers open their dialog during an earlier click listener, before a click listener of ours runs. */
  var last = null;
  function record(node) {
    var el = node && node.closest && node.closest(TRIGGER);
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) last = { rect: r, t: performance.now() };
  }
  document.addEventListener("pointerdown", function (e) { record(e.target); }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") record(document.activeElement);
  }, true);
  document.addEventListener("click", function (e) { if (!last || performance.now() - last.t > 400) record(e.target); }, true);

  function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

  /* Count up "INR 2,000.00", "₹1,24,500", "-INR 5,000.00" ... then restore the exact original text. */
  var MONEY = /^(\s*[-−+]?\s*(?:INR|USD|EUR|GBP|₹|\$|€|£)\s?[-−+]?)(\d[\d,]*)(\.\d+)?(\s*(?:INR|USD|EUR|GBP)?\s*)$/;
  function countUp(el, ms) {
    var text = el.textContent, m = text.match(MONEY);
    if (!m || el.dataset.mooBusy) return;
    var target = parseFloat(m[2].replace(/,/g, "") + (m[3] || "")), dec = m[3] ? m[3].length - 1 : 0;
    var indian = /^\d{1,2}(,\d{2})+,\d{3}$/.test(m[2]);
    var loc = indian ? "en-IN" : "en-US", start = performance.now();
    el.dataset.mooBusy = "1";
    (function tick(now) {
      var p = Math.min(1, (now - start) / ms);
      if (p < 1) {
        el.textContent = m[1] + (target * easeOut(p)).toLocaleString(loc, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[4];
        requestAnimationFrame(tick);
      } else { el.textContent = text; delete el.dataset.mooBusy; }
    })(start);
  }

  function opened(modal, cfg) {
    if (reduce.matches) return;
    var dialog = modal.querySelector(cfg.dialog);
    if (!dialog || !dialog.animate) return;
    var origin = last && performance.now() - last.t < 2000 ? last.rect : null;
    last = null;

    var backdrop = modal.querySelector("[class*='-backdrop']");
    if (backdrop && backdrop.animate) backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease" });

    if (origin) {
      var d = dialog.getBoundingClientRect();
      var dx = origin.left + origin.width / 2 - (d.left + d.width / 2);
      var dy = origin.top + origin.height / 2 - (d.top + d.height / 2);
      dialog.animate([
        { transform: "translate(" + dx + "px," + dy + "px) scale(" + Math.max(.2, origin.width / d.width) + "," + Math.max(.06, origin.height / d.height) + ")", opacity: .2, borderRadius: "10px", filter: "blur(6px)" },
        { transform: "none", opacity: 1, borderRadius: "", filter: "blur(0)" }
      ], { duration: 560, easing: EASE });
    }

    /* Fields rise in one after another (skip any that already have their own CSS entrance). */
    var fields = dialog.querySelectorAll(".approval-detail-fields > div, .transaction-detail-grid > div, .invoice-form-grid > *, .campaign-form > *, .action-modal-buttons > *");
    Array.prototype.forEach.call(fields, function (el, i) {
      if (getComputedStyle(el).animationName !== "none") return;
      el.animate([
        { opacity: 0, transform: "translateY(10px) scale(.97)", filter: "blur(3px)" },
        { opacity: 1, transform: "none", filter: "blur(0)" }
      ], { duration: 420, delay: i % 3 === 0 ? 90 : i % 2 === 0 ? 45 : 0, easing: "cubic-bezier(.18,.78,.25,1)", fill: "backwards" });
    });

    setTimeout(function () {
      Array.prototype.forEach.call(dialog.querySelectorAll("dd, .action-dialog strong, .invoice-total strong, .invoice-total span"), function (el) {
        if (!el.children.length) countUp(el, 900);
      });
    }, 180);
  }

  MODALS.forEach(function (cfg) {
    var modal = document.getElementById(cfg.id);
    if (!modal) return;
    new MutationObserver(function () { if (!modal.hidden) opened(modal, cfg); })
      .observe(modal, { attributes: true, attributeFilter: ["hidden"] });
  });
})();
