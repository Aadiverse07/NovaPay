/* Transactions: count-up amounts, cursor spotlight + tilt, click ripple, row-to-dialog expansion. */
(function () {
  "use strict";
  var view = document.getElementById("view-transactions");
  var tbody = document.getElementById("transactions-table-body");
  if (!view || !tbody) return;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)");
  var ease = function (t) { return 1 - Math.pow(1 - t, 4); };

  /* Animate any number inside text, keeping prefix, sign, grouping and decimals. */
  function countUp(el, ms) {
    if (!el || reduce.matches) return;
    var text = el.textContent, m = text.match(/-?[\d,]+(\.\d+)?/);
    if (!m) return;
    var target = parseFloat(m[0].replace(/,/g, "")), dec = m[1] ? m[1].length - 1 : 0;
    var pre = text.slice(0, m.index), post = text.slice(m.index + m[0].length), neg = m[0][0] === "-";
    var start = performance.now(); ms = ms || 900;
    el.classList.add("tx-num");
    (function tick(now) {
      var p = Math.min(1, (now - start) / ms), v = Math.abs(target) * ease(p);
      el.textContent = pre + (neg ? "-" : "") + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post;
      if (p < 1) requestAnimationFrame(tick); else el.textContent = text;
    })(start);
  }

  /* Count amounts when a row reveals (initial load, filtering, new rows). */
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      var row = m.target;
      if (row.classList && row.classList.contains("tx-row-enter") && !row.dataset.txCounted) {
        row.dataset.txCounted = "1";
        setTimeout(function () { delete row.dataset.txCounted; }, 700);
        [3, 4, 5].forEach(function (i) { countUp(row.children[i], 850 + i * 80); });
      }
    });
  }).observe(tbody, { attributes: true, attributeFilter: ["class"], subtree: true });

  /* Result counter bumps whenever filters change it. */
  var count = document.getElementById("tx-result-count");
  if (count) new MutationObserver(function () {
    if (reduce.matches) return;
    count.classList.remove("tx-bump"); void count.offsetWidth; count.classList.add("tx-bump");
  }).observe(count, { childList: true, characterData: true, subtree: true });

  /* Cursor spotlight + gentle 3D tilt per row. */
  tbody.addEventListener("pointermove", function (e) {
    if (reduce.matches) return;
    var row = e.target.closest && e.target.closest("tr.transaction-row"); if (!row) return;
    var r = row.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    row.style.setProperty("--tx-pointer-x", (x * 100).toFixed(1) + "%");
    row.style.setProperty("--tx-tilt-y", ((x - .5) * 1.6).toFixed(2) + "deg");
    row.style.setProperty("--tx-tilt-x", "0deg");
  });
  tbody.addEventListener("pointerout", function (e) {
    var row = e.target.closest && e.target.closest("tr.transaction-row");
    if (row) { row.style.removeProperty("--tx-tilt-y"); row.style.removeProperty("--tx-pointer-x"); }
  });

  /* Ripple + remember the clicked row so the dialog can grow out of it. */
  var origin = null;
  tbody.addEventListener("pointerdown", function (e) {
    var row = e.target.closest && e.target.closest("tr.transaction-row"); if (!row) return;
    origin = row.getBoundingClientRect();
    if (reduce.matches) return;
    var td = e.target.closest("td"); if (!td) return;
    var r = td.getBoundingClientRect(), s = document.createElement("span");
    s.className = "tx-ripple"; s.style.left = (e.clientX - r.left) + "px"; s.style.top = (e.clientY - r.top) + "px";
    td.style.position = "relative"; td.style.overflow = "hidden"; td.appendChild(s);
    setTimeout(function () { s.remove(); }, 750);
  }, true);

  /* Dialog: expand from the row, count up the money fields. */
  var modal = document.getElementById("transaction-modal");
  var dialog = modal && modal.querySelector(".transaction-dialog");
  if (modal && dialog) new MutationObserver(function () {
    if (modal.hidden || reduce.matches) return;
    if (origin && dialog.animate) {
      var d = dialog.getBoundingClientRect();
      var dx = origin.left + origin.width / 2 - (d.left + d.width / 2), dy = origin.top + origin.height / 2 - (d.top + d.height / 2);
      dialog.animate([
        { transform: "translate(" + dx + "px," + dy + "px) scale(" + Math.max(.2, origin.width / d.width) + "," + Math.max(.06, origin.height / d.height) + ")", opacity: .2, borderRadius: "10px", filter: "blur(6px)" },
        { transform: "none", opacity: 1, borderRadius: "", filter: "blur(0)" }
      ], { duration: 560, easing: "cubic-bezier(.16,1,.3,1)" });
    }
    setTimeout(function () { ["detail-amount", "detail-fee", "detail-net"].forEach(function (id) { countUp(document.getElementById(id), 900); }); }, 180);
  }).observe(modal, { attributes: true, attributeFilter: ["hidden"] });
})();
