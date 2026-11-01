/* NovaPay voice status pill (dashboard).
   Connected  -> red ring with a green light inside + "Listening" (or "Thinking…" / "Speaking…").
   Otherwise  -> red line + "Not connected" and a short reason (tap to turn on, microphone blocked, ...).
   Event-driven only: no timers, no polling. voice-assistant.js calls NovaPayVoiceIndicator.update(snapshot). */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) api.mount(root);
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  var LIVE = { idle: "Listening", capturing: "Listening", thinking: "Thinking…", speaking: "Speaking…" };

  function describe(snapshot, supported) {
    if (supported === false) return { connected: false, text: "Not connected", sub: "Voice needs Chrome or Edge" };
    if (!snapshot || snapshot.state === "off") return { connected: false, text: "Not connected", sub: "Tap to turn on" };
    if (snapshot.problem || snapshot.state === "paused" || snapshot.state === "unsupported" || !snapshot.enabled || !LIVE[snapshot.state]) {
      return { connected: false, text: "Not connected", sub: String(snapshot.message || "Tap to turn on") };
    }
    return { connected: true, text: LIVE[snapshot.state], sub: "" };
  }

  var CSS = "#np-voice-indicator{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:2147483000;display:flex;align-items:center;gap:9px;max-width:min(320px,calc(100vw - 32px));padding:8px 14px 8px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:#0f172a;color:#fff;font:600 12px/1.15 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 6px 18px rgba(15,23,42,.35);cursor:pointer;text-align:left}"
    + "#np-voice-indicator:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}"
    + "#np-voice-indicator .np-vi-ring{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid #ef4444;display:none;align-items:center;justify-content:center;box-sizing:border-box}"
    + "#np-voice-indicator .np-vi-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;animation:np-vi-pulse 1.6s ease-in-out infinite}"
    + "#np-voice-indicator .np-vi-line{flex:none;width:18px;height:3px;border-radius:2px;background:#ef4444;display:block}"
    + "#np-voice-indicator[data-connected=true] .np-vi-ring{display:flex}#np-voice-indicator[data-connected=true] .np-vi-line{display:none}"
    + "#np-voice-indicator .np-vi-sub{display:block;margin-top:2px;font-weight:500;font-size:11px;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
    + "#np-voice-indicator .np-vi-sub:empty{display:none}"
    + "@keyframes np-vi-pulse{0%,100%{opacity:1}50%{opacity:.4}}"
    + "@media (prefers-reduced-motion:reduce){#np-voice-indicator .np-vi-dot{animation:none}}";

  function mount(win) {
    var doc = win.document;
    if (win.NovaPayVoiceIndicator || !doc.body && doc.readyState === "loading") {
      if (!win.NovaPayVoiceIndicator) doc.addEventListener("DOMContentLoaded", function () { mount(win); }, { once: true });
      return;
    }
    var supported = Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
    var style = doc.createElement("style"); style.textContent = CSS; doc.head.appendChild(style);
    var button = doc.createElement("button");
    button.id = "np-voice-indicator"; button.type = "button";
    button.innerHTML = '<span class="np-vi-ring" aria-hidden="true"><span class="np-vi-dot"></span></span><span class="np-vi-line" aria-hidden="true"></span><span><span class="np-vi-text"></span><span class="np-vi-sub"></span></span>';
    var text = button.querySelector(".np-vi-text"), sub = button.querySelector(".np-vi-sub");
    function render(snapshot) {
      var view = describe(snapshot, supported);
      button.dataset.connected = String(view.connected);
      text.textContent = view.text; sub.textContent = view.sub;
      button.setAttribute("aria-pressed", String(view.connected));
      button.setAttribute("aria-label", "Voice assistant: " + view.text + (view.sub ? ". " + view.sub : ""));
      button.title = view.sub ? view.text + " - " + view.sub : view.text;
    }
    button.addEventListener("click", function () {
      var mic = doc.getElementById("ai-mic");
      if (supported && mic) mic.click();
    });
    render(null);
    doc.body.appendChild(button);
    win.NovaPayVoiceIndicator = { update: render, describe: describe };

    // Come back on by itself after login/reload, but only if the user turned Voice on before AND the browser already granted the microphone.
    try {
      if (supported && win.localStorage.getItem("novapay-voice-enabled") === "true" && win.navigator.permissions && win.navigator.permissions.query) {
        win.navigator.permissions.query({ name: "microphone" }).then(function (permission) {
          if (permission.state !== "granted") return;
          var auth = win.NovaPayAuth;
          Promise.resolve(auth && auth.ready).then(function () {
            if (auth && auth.isAuthenticated && !auth.isAuthenticated()) return;
            var mic = doc.getElementById("ai-mic");
            if (mic && !win.NovaPayVoiceAssistantController) mic.click();
          });
        }).catch(function () {});
      }
    } catch (_) {}
  }

  return { describe: describe, mount: mount };
}));
