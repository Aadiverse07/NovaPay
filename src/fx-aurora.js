/* NovaPay FX — depth aurora (classic script).
   Effect 6: four soft gradient ribbons sit behind the content and move at different speeds with scroll so the page feels like it has depth. Opacity is kept low so text contrast stays
   accessible in both themes. Styles live in fx.css. Requires fx-core.js. */
(function () {
  "use strict";
  var ENABLED = true;                 // <- set false to disable
  var FX = window.NovaPayFX;
  if (!ENABLED || !FX) return;

  var wrap = document.createElement("div");
  wrap.className = "fx-aurora" + (FX.reduced || FX.low ? " is-static" : "");
  wrap.setAttribute("aria-hidden", "true");
  var ribs = [];
  for (var i = 0; i < 4; i++) {
    var r = document.createElement("i");
    r.className = "fx-rib fx-rib--" + (i + 1);
    wrap.appendChild(r); ribs.push(r);
  }
  document.body.insertBefore(wrap, document.body.firstChild);    // behind the dotted particle-field, above the ambient glow

  if (FX.reduced) return;                                        // static ribbons

  var sy = window.scrollY, tsy = sy, DEPTH = [0.5, 0.9, 1.4, 2.0];
  window.addEventListener("scroll", function () { tsy = window.scrollY; }, { passive: true });

  FX.add(function (dt) {
    var k = 1 - Math.exp(-dt * 3.2);
    sy += (tsy - sy) * k;
    for (var i = 0; i < ribs.length; i++) {
      var d = DEPTH[i];
      // oscillate instead of scrolling away, so a ribbon never leaves the viewport on long pages
      var dy = Math.sin(sy / (620 + i * 170) + i * 1.7) * (46 + i * 34);
      var dx = Math.cos(sy / (900 + i * 220) + i) * (30 + i * 26);
      ribs[i].style.transform = "translate3d(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px,0)";
    }
  });
})();
