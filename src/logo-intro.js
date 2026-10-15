/* Replays the header logo "forming" animation when the logo is clicked (the intro itself is pure CSS). */
(function () {
  "use strict";
  var brand = document.querySelector(".np-brand");
  if (!brand) return;
  function replay() {
    brand.classList.remove("np-anim");
    void brand.offsetWidth;                 // restart the CSS animations
    brand.classList.add("np-anim");
  }
  window.novapayLogoReplay = replay;
  brand.addEventListener("click", replay);
}());
