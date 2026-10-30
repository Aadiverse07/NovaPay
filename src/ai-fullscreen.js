/* NovaPay AI Assistant: fill the browser's visible page area while leaving
   browser tabs and address bar visible. */
(function () {
  var card = document.querySelector(".ai-command-card");
  var btn = document.getElementById("ai-fullscreen");
  if (!card || !btn) return;

  var placeholder = null;
  function isFs() { return card.classList.contains("is-fs-fallback"); }

  function sync() {
    var on = isFs();
    card.classList.toggle("is-fullscreen", on);
    document.documentElement.classList.toggle("ai-fs-lock", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Exit full screen" : "Enter full screen");
    btn.title = on ? "Exit full screen (Esc)" : "Full screen";
    var box = document.getElementById("ai-conversation");
    if (box) setTimeout(function () { box.scrollTop = box.scrollHeight; }, 60);
  }

  function enter() {
    placeholder = document.createComment("AI assistant original position");
    card.parentNode.insertBefore(placeholder, card);
    document.body.appendChild(card);
    card.classList.add("is-fs-fallback");
    sync();
  }

  function exit() {
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(card, placeholder);
      placeholder.remove();
    }
    placeholder = null;
    card.classList.remove("is-fs-fallback");
    sync();
  }

  btn.addEventListener("click", function () { if (isFs()) exit(); else enter(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isFs()) exit();
  });
})();
