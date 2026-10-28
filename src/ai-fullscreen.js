/* NovaPay AI Assistant: full-screen toggle for the chat card.
   Uses the browser Fullscreen API on the card; if that is blocked/unsupported, falls back to a fixed full-window overlay.
   Exit with the same button or Esc. */
(function () {
  var card = document.querySelector(".ai-command-card");
  var btn = document.getElementById("ai-fullscreen");
  if (!card || !btn) return;

  function nativeEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function isFs() { return nativeEl() === card || card.classList.contains("is-fs-fallback"); }

  function sync() {
    var on = isFs();
    card.classList.toggle("is-fullscreen", on);
    document.documentElement.classList.toggle("ai-fs-lock", card.classList.contains("is-fs-fallback"));
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Exit full screen" : "Enter full screen");
    btn.title = on ? "Exit full screen (Esc)" : "Full screen";
    var box = document.getElementById("ai-conversation");
    if (box) setTimeout(function () { box.scrollTop = box.scrollHeight; }, 60);
  }

  function enterFallback() { card.classList.add("is-fs-fallback"); sync(); }
  function enter() {
    var req = card.requestFullscreen || card.webkitRequestFullscreen;
    if (!req) return enterFallback();
    try {
      var p = req.call(card);
      if (p && p.catch) p.catch(enterFallback);
    } catch (e) { enterFallback(); }
  }
  function exit() {
    if (card.classList.contains("is-fs-fallback")) { card.classList.remove("is-fs-fallback"); sync(); }
    if (nativeEl() === card) {
      var ex = document.exitFullscreen || document.webkitExitFullscreen;
      if (ex) { try { var p = ex.call(document); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    }
  }

  btn.addEventListener("click", function () { if (isFs()) exit(); else enter(); });
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && card.classList.contains("is-fs-fallback")) exit();
  });
})();
