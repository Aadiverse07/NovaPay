/* NovaPay FX — glass orb / coin (classic script).
   Effect 5: a slowly rotating, translucent NovaPay coin in the hero. Pure CSS 3D (front face, back face and a
   28-slice rim) whose pastel "refraction" gradient and glossy sweep move as it turns; The DOM is created here, so the HTML only needs the script + fx.css. Requires fx-core.js. */
(function () {
  "use strict";
  var ENABLED = false;                // <- set false to disable
  var FX = window.NovaPayFX;
  var stage = document.getElementById("hero-stage");
  if (!ENABLED || !FX || !stage) return;

  var SLICES = 28, R = 46, T = 15, W = 2 * Math.PI * R / SLICES + 1.2;
  var orb = document.createElement("div");
  orb.className = "fx-orb" + (FX.reduced || FX.low ? " is-static" : "");
  orb.setAttribute("aria-hidden", "true");

  var rim = "";
  for (var i = 0; i < SLICES; i++) {
    rim += '<i class="fx-rim" style="width:' + W.toFixed(2) + "px;height:" + T + "px;margin:" + (-T / 2) + "px 0 0 " + (-W / 2).toFixed(2) +
           "px;transform:rotateZ(" + (i * 360 / SLICES).toFixed(2) + "deg) translateY(" + (-R) + "px) rotateX(90deg)\"></i>";
  }
  var logo = '<novapay-logo size="40" variant="mark"></novapay-logo>';
  orb.innerHTML =
    '<div class="fx-orb-halo"></div>' +
    '<div class="fx-orb-tilt"><div class="fx-coin">' +
      '<div class="fx-face fx-front" style="transform:translateZ(' + T / 2 + 'px)">' + logo + '<i class="fx-gloss"></i></div>' +
      '<div class="fx-face fx-back" style="transform:rotateY(180deg) translateZ(' + T / 2 + 'px)">' + logo + '<i class="fx-gloss"></i></div>' +
      rim +
    "</div></div>";
  stage.appendChild(orb);

})();
