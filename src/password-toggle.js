/* Show / hide password on the Login and Sign Up forms. */
(function () {
  "use strict";
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-pw-toggle]");
    if (!btn) return;
    var input = document.getElementById(btn.getAttribute("data-pw-toggle"));
    if (!input) return;
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    var label = show ? "Hide password" : "Show password";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.classList.toggle("is-visible", show);
    input.focus();
  });
  // Always return to hidden when the dialog is closed / form submitted
  function reset() {
    document.querySelectorAll("[data-pw-toggle]").forEach(function (btn) {
      var input = document.getElementById(btn.getAttribute("data-pw-toggle"));
      if (input && input.type !== "password") { input.type = "password"; }
      btn.setAttribute("aria-pressed", "false"); btn.setAttribute("aria-label", "Show password");
      btn.title = "Show password"; btn.classList.remove("is-visible");
    });
  }
  document.addEventListener("submit", reset, true);
  document.addEventListener("click", function (e) { if (e.target.closest(".modal-close")) reset(); });
})();
