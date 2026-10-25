/* Visual-only entrance, row highlight, and row reveal effects for Transactions. */
(function () {
  "use strict";

  var view = document.getElementById("view-transactions");
  var tbody = document.getElementById("transactions-table-body");
  var scroller = tbody && tbody.closest(".table-scroll");
  if (!view || !tbody || !scroller) return;

  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  var rowSelector = "tr.transaction-row";
  var indicator = document.createElement("div");
  indicator.className = "al-indicator";
  indicator.setAttribute("aria-hidden", "true");
  scroller.appendChild(indicator);
  scroller.classList.add("al-active");

  function animateRow(row) {
    if (reduceMotion.matches || row.hidden) return;
    row.classList.remove("tx-row-enter");
    void row.offsetWidth;
    row.classList.add("tx-row-enter");
  }

  function animateVisibleRows() {
    if (reduceMotion.matches) return;
    Array.prototype.forEach.call(tbody.querySelectorAll(rowSelector), function (row) {
      if (!row.hidden) animateRow(row);
    });
  }

  function positionIndicator(row) {
    var rowRect = row.getBoundingClientRect();
    var scrollRect = scroller.getBoundingClientRect();
    var x = rowRect.left - scrollRect.left + scroller.scrollLeft - 7;
    var width = rowRect.width + 14;
    if (x < 0) { width += x; x = 0; }
    indicator.style.transform = "translate(" + x.toFixed(1) + "px," + (rowRect.top - scrollRect.top + scroller.scrollTop - 3).toFixed(1) + "px)";
    indicator.style.width = width.toFixed(1) + "px";
    indicator.style.height = (rowRect.height + 6).toFixed(1) + "px";
  }

  var activeRow = null;
  function selectRow(row) {
    if (!row || row.hidden) return clearSelection();
    activeRow = row;
    positionIndicator(row);
    indicator.classList.add("is-on");
  }
  function clearSelection() {
    activeRow = null;
    indicator.classList.remove("is-on");
  }

  tbody.addEventListener("pointerover", function (event) {
    var row = event.target.closest && event.target.closest(rowSelector);
    if (row && row !== activeRow) selectRow(row);
  });
  tbody.addEventListener("focusin", function (event) {
    var row = event.target.closest && event.target.closest(rowSelector);
    if (row) selectRow(row);
  });
  scroller.addEventListener("pointerleave", function () {
    if (!tbody.contains(document.activeElement)) clearSelection();
  });
  tbody.addEventListener("focusout", function () {
    setTimeout(function () {
      if (!tbody.contains(document.activeElement) && !scroller.matches(":hover")) clearSelection();
    }, 0);
  });
  scroller.addEventListener("scroll", function () {
    if (activeRow && !activeRow.hidden) positionIndicator(activeRow);
  }, { passive: true });
  window.addEventListener("resize", function () {
    if (activeRow && !activeRow.hidden) positionIndicator(activeRow);
  });

  new MutationObserver(function (mutations) {
    if (view.hidden || reduceMotion.matches) return;
    mutations.forEach(function (mutation) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && node.matches(rowSelector)) animateRow(node);
        });
      } else if (mutation.type === "attributes" && mutation.attributeName === "hidden" && !mutation.target.hidden) {
        animateRow(mutation.target);
      }
    });
  }).observe(tbody, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });

  function enterTransactions() {
    view.classList.remove("tx-enter");
    requestAnimationFrame(function () {
      if (view.hidden) return;
      view.classList.add("tx-enter");
      setTimeout(animateVisibleRows, 280);
    });
  }
  new MutationObserver(function () {
    if (!view.hidden) enterTransactions();
  }).observe(view, { attributes: true, attributeFilter: ["hidden"] });
  if (!view.hidden) enterTransactions();
})();
