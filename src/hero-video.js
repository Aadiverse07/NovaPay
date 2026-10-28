/* NovaPay hero payment video: loops continuously (hands -> phone -> tap -> "Payment Successful" -> repeat), never stops.
   - Two cuts of the same animation: light theme = natural skin tones, dark theme = blue hands (assets/novapay-payment-dark.*).
     The cut follows <html data-theme>; clicking the theme toggle swaps the cut and replays the animation from the start.
   - Replays if the hero scrolls out of view and back after it has finished.
   - prefers-reduced-motion: no playback, shows the final frame.
   - Safari can't show WebM transparency, so it gets the MP4 (white background). */
(function () {
  var v = document.querySelector(".hp-video");
  if (!v) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ua = navigator.userAgent;
  var noAlpha = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(ua);
  var FILES = {
    light: { webm: "assets/novapay-payment.webm", mp4: "assets/novapay-payment.mp4" },
    dark:  { webm: "assets/novapay-payment-dark.webm", mp4: "assets/novapay-payment-dark.mp4" }
  };
  var root = document.documentElement;
  var started = false, ended = false, visible = false, current = "light";
  v.loop = true;                                    // continuous loop, no stopping

  function themeNow() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function play() { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  function reveal() { v.classList.add("is-visible"); }
  function showLast() { try { v.currentTime = Math.max(0, (v.duration || 10) - 0.04); } catch (e) {} }
  function addSource(src, type) {
    var s = document.createElement("source");
    s.src = src; s.type = type; v.appendChild(s);
  }
  function mount(t) {
    current = t;
    var old = v.querySelectorAll("source");
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    if (!noAlpha) addSource(FILES[t].webm, "video/webm; codecs=vp9");
    addSource(FILES[t].mp4, "video/mp4");
    v.loop = true;
    v.load();
    v.classList.remove("is-visible");
  }

  // initial cut (the markup already points at the light files, so only reload when something else is needed)
  var t0 = themeNow();
  if (t0 !== "light" || noAlpha) mount(t0);

  // live theme switch: swap to the other cut and play the whole animation again from the start
  function onTheme() {
    var t = themeNow();
    if (t === current) return;
    mount(t);
    if (reduce) {                                   // reduced motion: no playback, just the final frame
      v.addEventListener("loadedmetadata", showLast, { once: true });
      return;
    }
    started = true; ended = false;
    v.addEventListener("loadedmetadata", function () {
      try { v.currentTime = 0; } catch (e) {}
      play();
    }, { once: true });
  }
  // watch <html data-theme> itself, so it works whichever script flips the theme (landing.js toggle, theme.js, OS change)
  new MutationObserver(onTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  if (reduce) {
    function showReducedFrame() { showLast(); reveal(); }
    if (v.readyState >= 1) showReducedFrame(); else v.addEventListener("loadedmetadata", showReducedFrame, { once: true });
    return;
  }
  v.addEventListener("playing", reveal);
  // safety net: if a browser ever ends/pauses the video, restart it immediately
  v.addEventListener("ended", function () { try { v.currentTime = 0; } catch (e) {} play(); });
  v.addEventListener("pause", function () { if (started && !v.ended && document.visibilityState === "visible") play(); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && started) play(); });
  function onVisible() {
    if (!started) { started = true; setTimeout(play, 350); }
    else { play(); }
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var now = e.isIntersecting;
        if (now && !visible) onVisible();
        visible = now;
      });
    }, { threshold: 0.35 }).observe(v);
  } else { onVisible(); }
})();
