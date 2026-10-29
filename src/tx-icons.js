/* Upgrades every .tx-badge (Payment / Refund / Dispute / Payout) from a text
   glyph to an animated inline SVG. Also catches rows added later by other scripts.
   Used by the Dashboard "Recent Transactions" list and the Transactions module. */
(function () {
  "use strict";

  var ICONS = {
    /* Payment: green diagonal arrow */
    payment:
      '<svg class="tx-ico tx-ico--payment" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path class="trail" d="M4.5 19.5 8 16"/>' +
      '<g class="shoot"><path d="M7.5 16.5 16.5 7.5"/><path d="M8.5 7.5h8v8"/></g>' +
      '</svg>',
    /* Refund: red return arrow */
    refund:
      '<svg class="tx-ico tx-ico--refund" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<g class="undo"><path d="M9 4.5 4.5 9 9 13.5"/><path d="M4.5 9H14a5 5 0 0 1 0 10h-3"/></g>' +
      '</svg>',
    /* Dispute: amber exclamation */
    dispute:
      '<svg class="tx-ico tx-ico--dispute" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<g class="bang"><path d="M12 5v9.2"/><circle class="dot fill" cx="12" cy="18.7" r="1.5"/></g>' +
      '</svg>',
    /* Payout: blue diagonal arrow */
    payout:
      '<svg class="tx-ico tx-ico--payout" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path class="trail" d="M4.5 19.5 8 16"/>' +
      '<g class="rise"><path d="M7.5 16.5 16.5 7.5"/><path d="M8.5 7.5h8v8"/></g>' +
      '</svg>'
  };

  function kindOf(el) {
    for (var k in ICONS) if (el.classList.contains(k)) return k;
    return null;
  }

  function upgrade(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var list = [].slice.call(scope.querySelectorAll(".tx-badge:not([data-ico])"));
    if (scope.classList && scope.classList.contains("tx-badge") && !scope.hasAttribute("data-ico")) list.push(scope);
    list.forEach(function (el) {
      var kind = kindOf(el);
      if (!kind) return;
      el.setAttribute("data-ico", kind);
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = ICONS[kind];
    });
  }

  upgrade(document);

  if (window.MutationObserver) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) upgrade(n); });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
