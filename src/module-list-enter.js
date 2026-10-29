/* Plays the Transactions-style opening animation whenever a module is opened.
   Adds .ml-enter on open and removes it once the animation is over, so later list updates
   (new rows, filters, refreshes) are not re-animated. */
(function () {
  "use strict";
  var ids = ["approvals", "sandbox", "ledger", "invoices", "reports", "documents", "community-funds", "maintenance"];
  var reduce = matchMedia("(prefers-reduced-motion: reduce)");

  ids.forEach(function (id) {
    var view = document.getElementById("view-" + id);
    if (!view) return;
    view.classList.add("ml-view");
    var timer = 0;

    function enter() {
      if (reduce.matches) return;
      clearTimeout(timer);
      view.classList.remove("ml-enter");
      void view.offsetWidth;
      view.classList.add("ml-enter");
      timer = setTimeout(function () { view.classList.remove("ml-enter"); }, 1900);
    }

    new MutationObserver(function () {
      if (!view.hidden) enter();
      else { clearTimeout(timer); view.classList.remove("ml-enter"); }
    }).observe(view, { attributes: true, attributeFilter: ["hidden"] });

    if (!view.hidden) enter();
  });
})();
