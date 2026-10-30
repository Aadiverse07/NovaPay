/* Settings → Help & support: quick links, support message form. */
(function () {
  "use strict";
  var SUPPORT_EMAIL = "support@novapay.example"; /* replace with your real support address */
  var $ = function (id) { return document.getElementById(id); };

  document.querySelectorAll("[data-help-view]").forEach(function (b) {
    b.addEventListener("click", function () {
      var link = document.querySelector('.dashboard-nav a[data-view="' + b.dataset.helpView + '"]');
      if (link) link.click();
    });
  });

  var form = $("help-form"), msg = $("help-message"), status = $("help-status");
  if (!form) return;
  function say(t, ok) { status.textContent = t; status.className = "set-status" + (ok === true ? " is-ok" : ok === false ? " is-error" : ""); }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = (msg.value || "").trim();
    if (text.length < 10) { say("Please write at least 10 characters so we can help.", false); msg.focus(); return; }
    var topic = $("help-topic").value;
    window.location.href = "mailto:" + SUPPORT_EMAIL + "?subject=" + encodeURIComponent("NovaPay support: " + topic) + "&body=" + encodeURIComponent(text);
    say("Your email app should open with the message ready to send.", true);
  });

  $("help-copy").addEventListener("click", function () {
    function ok() { say("Support email copied: " + SUPPORT_EMAIL, true); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(SUPPORT_EMAIL).then(ok, function () { say("Support email: " + SUPPORT_EMAIL); });
    else say("Support email: " + SUPPORT_EMAIL);
  });
})();
