/* NovaPay hero: laptop-open intro, floating cards, and the "Open Dashboard" screen transition.
   Classic script (works from file://). Presentation only — it never touches auth:
   "Open Dashboard" navigates to dashboard.html, whose own guard decides login vs dashboard. */
(function () {
  "use strict";
  var root = document.documentElement;
  var ENTER = "novapay-hero-enter";
  var stage = document.getElementById("hero-stage");
  var display = document.getElementById("lp-display");
  var cta = document.getElementById("open-dashboard");

  window.__fxStarted = true;                       // tells the <head> failsafe that JS took over
  function clearPre() { root.classList.remove("fx-pre"); }
  try { sessionStorage.removeItem(ENTER); } catch (e) {}   // stale flag (e.g. login redirect) must not leak

  if (!stage || !display) { clearPre(); return; }

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mobileMQ = window.matchMedia("(max-width: 700px)");
  var cards = [].slice.call(stage.querySelectorAll(".float-card"));
  var canWAAPI = typeof Element.prototype.animate === "function";

  /* ---------- helpers ---------- */
  function centerOf(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function store(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  /* ---------- Intro ---------- */
  var introActive = false, introTimer = 0;

  function measureCards() {
    var dc = centerOf(display.getBoundingClientRect());
    var order = { "flow-card": 0, "ai-card": 1, "pay-card": 2, "ledger-card": 3, "approval-card": 4 };
    cards.forEach(function (c) {
      var cc = centerOf(c.getBoundingClientRect()), k = 0;
      for (var name in order) { if (c.classList.contains(name)) k = order[name]; }
      c.style.setProperty("--fx-dx", Math.round(dc.x - cc.x) + "px");
      c.style.setProperty("--fx-dy", Math.round(dc.y - cc.y) + "px");
      c.style.setProperty("--fx-d", (mobileMQ.matches ? 450 + k * 90 : 1000 + k * 90) + "ms");
    });
  }

  function endIntro() {
    if (!introActive) return;
    introActive = false; clearTimeout(introTimer);
    document.removeEventListener("pointerdown", skipIntro, true);
    document.removeEventListener("keydown", skipIntro, true);
  }
  function skipIntro() {                          // jump straight to the final composition
    if (!introActive) return;
    endIntro();
    root.classList.remove("fx-run");
    clearPre();
  }
  function startIntro() {
    measureCards();
    root.classList.add("fx-run");                 // both swaps in one frame: no flash of the final state
    clearPre();
    introActive = true;
    document.addEventListener("pointerdown", skipIntro, true);
    document.addEventListener("keydown", skipIntro, true);
    introTimer = setTimeout(endIntro, 2600);      // longest card: 1000 + 4*90 + 1000 ms
  }

  if (root.classList.contains("fx-pre")) {
    if (reduceMQ.matches || !canWAAPI) { clearPre(); }
    else {
      /* The hero has no images or web fonts to wait for, so start as soon as the DOM + CSS are ready. */
      requestAnimationFrame(function () { requestAnimationFrame(startIntro); });
    }
  }

  /* Pause idle motion while the hero is off-screen */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      stage.classList.toggle("fx-offscreen", !entries[entries.length - 1].isIntersecting);
    }, { threshold: 0 }).observe(stage);
  }

  /* ---------- Open Dashboard transition ---------- */
  var leaving = false, navigated = false, portal = null, veil = null, timers = [];
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }

  function navigate(href) {
    if (navigated) return; navigated = true;
    store(ENTER, "1");
    window.location.href = href;
  }

  function lite(href) {                           // mobile: short fade, no 3D
    veil = document.createElement("div"); veil.className = "fx-veil"; veil.setAttribute("aria-hidden", "true");
    document.body.appendChild(veil);
    veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out", fill: "forwards" });
    later(function () { navigate(href); }, 280);
  }

  function openDashboard(href) {
    if (leaving) return; leaving = true;
    skipIntro();
    if (reduceMQ.matches || !canWAAPI || document.hidden) { navigate(href); return; }
    if (mobileMQ.matches) { lite(href); return; }

    var STRAIGHTEN = 280, EXPAND = 700;
    var wrap = stage.querySelector(".laptop-wrap");
    var d0 = centerOf(display.getBoundingClientRect());

    /* any click / key during the transition = go now */
    var hurry = function () { navigate(href); };
    document.addEventListener("pointerdown", hurry, true);
    document.addEventListener("keydown", hurry, true);
    later(function () { navigate(href); }, STRAIGHTEN + EXPAND + 500);   // hard safety net

    /* 1) cards fly back into the screen while the laptop squares up */
    stage.classList.add("fx-straighten");
    cards.forEach(function (c, i) {
      var cc = centerOf(c.getBoundingClientRect());
      var t = getComputedStyle(c).transform;
      c.animate([
        { transform: t === "none" ? "translate3d(0,0,0)" : t, opacity: 1 },
        { transform: "translate3d(" + Math.round(d0.x - cc.x) + "px," + Math.round(d0.y - cc.y) + "px,-240px) scale(.38)", opacity: 0 }
      ], { duration: 560, delay: i * 40, easing: "cubic-bezier(.55,0,.25,1)", fill: "forwards" });
    });

    /* 2) the real screen becomes a full-viewport surface */
    later(function () {
      var dr = display.getBoundingClientRect(), ui = display.querySelector(".lpui");
      var vw = window.innerWidth, vh = window.innerHeight;
      var S = Math.max(vw / dr.width, vh / dr.height) * 1.06;      // cover, aspect preserved
      var W = dr.width * S, H = dr.height * S;
      portal = document.createElement("div");
      portal.className = "fx-portal"; portal.setAttribute("aria-hidden", "true");
      portal.style.width = W + "px"; portal.style.height = H + "px";
      var clone = ui.cloneNode(true); portal.appendChild(clone);
      document.body.appendChild(portal);
      var from = "translate(" + dr.left + "px," + dr.top + "px) scale(" + (1 / S) + ")";
      var to = "translate(" + (vw - W) / 2 + "px," + (vh - H) / 2 + "px) scale(1)";
      portal.style.transform = from;
      portal.animate([{ transform: from }, { transform: to }],
        { duration: EXPAND, easing: "cubic-bezier(.65,0,.2,1)", fill: "forwards" });
      clone.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: .72 }, { opacity: 0, offset: 1 }],
        { duration: EXPAND, easing: "linear", fill: "forwards" });
      if (wrap) wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, delay: 120, easing: "ease-out", fill: "forwards" });
      later(function () { navigate(href); }, EXPAND + 40);
    }, STRAIGHTEN);
  }

  /* Any other "Dashboard" button on the home page (e.g. the header one) uses the same laptop transition. */
  window.novapayOpenDashboard = function (href) {
    href = href || "dashboard.html";
    var r = stage.getBoundingClientRect();
    var visible = r.top >= -r.height * 0.1 && r.bottom <= window.innerHeight + r.height * 0.1;
    if (visible || (window.scrollY || 0) < 4) { openDashboard(href); return; }
    window.scrollTo({ top: 0, behavior: reduceMQ.matches ? "auto" : "smooth" });
    setTimeout(function () { openDashboard(href); }, reduceMQ.matches ? 0 : 450);   // let the laptop scroll into view first
  };

  if (cta) {
    cta.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      openDashboard(cta.getAttribute("href") || "dashboard.html");
    });
  }

  /* Back/forward cache: restore a clean hero if the user comes back */
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    timers.forEach(clearTimeout); timers = [];
    if (portal && portal.parentNode) portal.parentNode.removeChild(portal);
    if (veil && veil.parentNode) veil.parentNode.removeChild(veil);
    portal = veil = null;
    stage.getAnimations({ subtree: true }).forEach(function (a) {   // only our scripted (WAAPI) return animations
      var css = (typeof CSSAnimation !== "undefined" && a instanceof CSSAnimation) || (typeof CSSTransition !== "undefined" && a instanceof CSSTransition);
      if (!css) { try { a.cancel(); } catch (x) {} }
    });
    stage.classList.remove("fx-straighten");
    root.classList.remove("fx-run", "fx-pre");
    leaving = navigated = false;
    try { sessionStorage.removeItem(ENTER); } catch (x) {}
  });
})();
