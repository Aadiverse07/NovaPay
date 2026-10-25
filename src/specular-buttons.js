/* Pointer-following specular highlight for the app's native and styled buttons. */
(function () {
  "use strict";

  var selector = "button, .btn, [role='button']";
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll(selector).forEach(function (button) {
    button.classList.add("specular-button");
    if (reduced || button.disabled) return;

    button.addEventListener("pointermove", function (event) {
      var rect = button.getBoundingClientRect();
      button.style.setProperty("--specular-x", ((event.clientX - rect.left) / rect.width * 100) + "%");
      button.style.setProperty("--specular-y", ((event.clientY - rect.top) / rect.height * 100) + "%");
      button.classList.add("specular-button--active");
    }, { passive: true });

    button.addEventListener("pointerleave", function () {
      button.classList.remove("specular-button--active");
    }, { passive: true });

    button.addEventListener("focus", function () {
      button.style.setProperty("--specular-x", "50%");
      button.style.setProperty("--specular-y", "15%");
      button.classList.add("specular-button--active");
    });

    button.addEventListener("blur", function () {
      button.classList.remove("specular-button--active");
    });
  });
})();
