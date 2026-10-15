/* NovaPay hero — orbiting cards (classic script, works from file://).
   • The 5 hero cards travel clockwise round a slanted glowing ring; they pass behind the laptop at the
     back of the ring and come forward in front of it at the bottom.
   • Hover a card  -> orbit pauses, card glides to the laptop centre and zooms. Move away -> it returns
     and the orbit resumes.
   • Click the centred card -> it opens full size on the laptop screen ("Back to dashboard" restores it).
   Presentation only: no auth / routing code is touched. Skipped on phones (<=700px) and for
   prefers-reduced-motion, where the original static layout is kept. */
(function () {
  "use strict";
  /* ---- tuning ---- */
  var SLANT = 24;        // ring tilt in degrees (higher = steeper diagonal)
  var SPEED = 0.55;      // radians / second (0.55 ~ one lap in 11 s)
  var SIZE = 0.68;       // resting size of the orbiting cards (1 = original size, lower = smaller)
  var ZOOM = 1.55;       // hover zoom (relative to the card's natural size)
  var START = { "flow-card": 250, "pay-card": 322, "ai-card": 34, "ledger-card": 106, "approval-card": 178 };

  var root = document.documentElement;
  var stage = document.getElementById("hero-stage");
  var display = document.getElementById("lp-display");
  if (!stage || !display) return;
  var wrap = stage.querySelector(".laptop-wrap");
  var cardEls = [].slice.call(stage.querySelectorAll(".float-card"));
  if (!wrap || !cardEls.length) return;

  var reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var mobileMQ = window.matchMedia("(max-width: 700px)");
  var T = SLANT * Math.PI / 180, COS = Math.cos(T), SIN = Math.sin(T);
  var NS = "http://www.w3.org/2000/svg";

  var items = cardEls.map(function (el) {
    var a = 178, k;
    for (k in START) if (el.classList.contains(k)) a = START[k];
    var r = parseFloat(getComputedStyle(el).getPropertyValue("--r")) || 0;
    return { el: el, a0: a * Math.PI / 180, r0: r, z: 0, inside: false, w: 0, h: 0 };
  });

  var on = false, raf = 0, last = 0, tt = 0, em = 0, startAt = 0, leaving = false, visible = true;
  var active = null, entry = 0, ring = null, G = { cx: 0, cy: 0, RX: 0, RY: 0, W: 0, H: 0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(x) { return 1 - Math.pow(1 - x, 3); }
  function smooth(z) { return z * z * (3 - 2 * z); }

  /* ---------- geometry ---------- */
  function measure() {
    var W = stage.offsetWidth, H = stage.offsetHeight;
    var cx = wrap.offsetLeft + wrap.offsetWidth / 2;
    var cy = wrap.offsetTop + wrap.offsetHeight * 0.46;
    var cw = 0, ch = 0;
    items.forEach(function (o) { o.w = o.el.offsetWidth; o.h = o.el.offsetHeight; cw = Math.max(cw, o.w * SIZE); ch += o.h * SIZE; });
    ch /= items.length;
    var availW = Math.max(Math.min(cx, W - cx) - cw * 0.5, wrap.offsetWidth * 0.5);
    var availH = Math.max(Math.min(cy, H - cy) - ch * 0.4, 130);
    var RX0 = 600, RY0 = 363;
    var hw = Math.hypot(RX0 * COS, RY0 * SIN), hh = Math.hypot(RX0 * SIN, RY0 * COS);
    var f = Math.min(availW / hw, availH / hh, 1.25);
    G = { cx: cx, cy: cy, RX: RX0 * f, RY: RY0 * f, W: W, H: H };
    buildRing();
  }

  function buildRing() {
    if (ring && ring.parentNode) ring.parentNode.removeChild(ring);
    var g = G, deg = SLANT, p = "M" + (g.cx + g.RX) + " " + g.cy + " A" + g.RX + " " + g.RY + " 0 1 1 " + (g.cx - g.RX) + " " + g.cy +
      " A" + g.RX + " " + g.RY + " 0 1 1 " + (g.cx + g.RX) + " " + g.cy;
    var arrows = "";
    [0, 2.5, 5, 7.5].forEach(function (b, i) {
      arrows += '<path d="M-14 -11 L15 0 L-14 11 L-7 0 Z" fill="' + (i % 2 ? "#7a3ff2" : "#2f66f5") + '"><animateMotion dur="10s" begin="-' + b +
        's" repeatCount="indefinite" rotate="auto" path="' + p + '"/></path>';
    });
    var e = function (rx, ry, extra) { return '<ellipse cx="' + g.cx + '" cy="' + g.cy + '" rx="' + rx + '" ry="' + ry + '" fill="none" ' + extra + "/>"; };
    ring = document.createElementNS(NS, "svg");
    ring.setAttribute("class", "np-ring"); ring.setAttribute("aria-hidden", "true");
    ring.setAttribute("width", g.W); ring.setAttribute("height", g.H); ring.setAttribute("viewBox", "0 0 " + g.W + " " + g.H);
    ring.innerHTML =
      '<defs><linearGradient id="np-g" x1="0" x2="1"><stop offset="0" stop-color="#7a3ff2"/><stop offset=".5" stop-color="#2f66f5"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>' +
      '<filter id="np-bl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter></defs>' +
      '<g transform="rotate(' + deg + " " + g.cx + " " + g.cy + ')">' +
      e(g.RX, g.RY, 'stroke="url(#np-g)" stroke-width="22" opacity=".45" filter="url(#np-bl)"') +
      e(g.RX, g.RY, 'stroke="url(#np-g)" stroke-width="4"') +
      e(g.RX, g.RY, 'stroke="#fff" stroke-width="1.5" opacity=".8"') +
      e(g.RX * .97, g.RY * .96, 'class="np-dash" stroke="#fff" stroke-width="3"') +
      e(g.RX * 1.04, g.RY * 1.05, 'class="np-dash np-dash2" stroke="#b7a6ff" stroke-width="2"') +
      arrows + "</g>";
    stage.insertBefore(ring, stage.firstChild);
    ring.style.opacity = em;
  }

  /* ---------- per-frame ---------- */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min((now - last) / 1000, 0.1); last = now;
    var anyZ = 0, i, o;
    for (i = 0; i < items.length; i++) if (items[i].z > anyZ) anyZ = items[i].z;
    if (!active && anyZ < 0.01 && !leaving) tt += dt * SPEED;
    if (leaving) em = Math.max(0, em - dt / 0.45);
    else if (now >= startAt) em = Math.min(1, em + dt / 1.4);
    var e = ease(em), g = G;
    ring.style.opacity = e;
    for (i = 0; i < items.length; i++) {
      o = items[i];
      var a = o.a0 + tt, u = g.RX * Math.cos(a), v = g.RY * Math.sin(a);
      var x = g.cx + u * COS - v * SIN, y = g.cy + u * SIN + v * COS;
      var d = (Math.sin(a) + 1) / 2;                         // 0 = back of ring, 1 = front
      var s = (0.8 + 0.36 * d) * SIZE * (0.35 + 0.65 * e), r = o.r0 * 0.6 + 8 * Math.cos(a);
      x = g.cx + (x - g.cx) * e; y = g.cy + (y - g.cy) * e;   // emerge from / return into the laptop
      o.z += ((o === active ? 1 : 0) - o.z) * Math.min(1, dt * 7);
      var ze = smooth(o.z), zs = Math.min(ZOOM, g.W * 0.72 / o.w);
      x += (g.cx - x) * ze; y += (g.cy - y) * ze; s += (zs - s) * ze; r *= (1 - ze);
      var st = o.el.style;
      st.setProperty("--np-t", "translate3d(" + (x - o.w / 2).toFixed(1) + "px," + (y - o.h / 2).toFixed(1) + "px,0) rotate(" + r.toFixed(2) + "deg) scale(" + s.toFixed(3) + ")");
      st.opacity = (o === active ? 1 : e * (0.82 + 0.18 * d) * (1 - 0.55 * anyZ)).toFixed(3);
      st.zIndex = o.z > 0.01 ? (o === active ? 31 : 30) : (d > 0.55 ? 5 : 1);
    }
  }

  /* ---------- hover / click ---------- */
  function ptr(e) { var r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function setActive(o, e) { active = o; if (o) { o.inside = false; var p = ptr(e); entry = Math.hypot(p.x - G.cx, p.y - G.cy); } }

  items.forEach(function (o) {
    o.el.addEventListener("pointerenter", function (e) {
      if (!on || leaving) return;
      if (active !== o) setActive(o, e); else o.inside = true;
    });
    o.el.addEventListener("pointerleave", function () {
      if (active === o && o.inside) { active = null; o.inside = false; }
    });
    o.el.addEventListener("click", function (e) {
      if (!on || leaving) return;
      if (active === o && o.z > 0.6) { showOnScreen(o); active = null; o.inside = false; }
      else if (active !== o) setActive(o, e);            // touch: first tap zooms, second tap opens
    });
  });
  stage.addEventListener("pointermove", function (e) {
    if (!active || active.inside) return;
    var p = ptr(e);
    if (Math.hypot(p.x - G.cx, p.y - G.cy) > entry + 80) active = null;   // moving away without reaching the card
  });
  stage.addEventListener("click", function (e) { if (active && !e.target.closest(".float-card")) active = null; });
  stage.addEventListener("pointerleave", function () { active = null; });

  /* ---------- show on laptop screen ---------- */
  var scr = document.createElement("div");
  scr.id = "np-screen"; scr.className = "np-screen";
  display.appendChild(scr);
  function closeScreen() { scr.classList.remove("on"); scr.innerHTML = ""; }
  function showOnScreen(o) {
    scr.innerHTML = "";
    var b = document.createElement("button");
    b.type = "button"; b.className = "np-back"; b.textContent = "\u2190 Back to dashboard";
    b.addEventListener("click", closeScreen);
    var cl = o.el.cloneNode(true);
    cl.removeAttribute("style"); cl.removeAttribute("id"); cl.removeAttribute("aria-hidden"); cl.classList.add("np-shown");
    [].forEach.call(cl.querySelectorAll(".fx-tilt"), function (n) { n.removeAttribute("style"); });
    scr.appendChild(b); scr.appendChild(cl); scr.classList.add("on");
    var k = Math.min(display.clientWidth * 0.9 / cl.offsetWidth, display.clientHeight * 0.84 / cl.offsetHeight);
    cl.style.setProperty("--np-fs", k.toFixed(3));
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeScreen(); active = null; } });

  /* ---------- lifecycle ---------- */
  function enable() {
    if (on) return;
    on = true; leaving = false; em = 0; tt = 0;
    stage.classList.add("np-orbit");
    items.forEach(function (o) { o.el.style.opacity = "0"; });
    var intro = root.classList.contains("fx-pre") || root.classList.contains("fx-run");
    startAt = performance.now() + (intro ? 900 : 0);      // let the lid start opening first
    measure(); last = performance.now(); run();
  }
  function disable() {
    if (!on) return;
    on = false; active = null; stop(); closeScreen();
    stage.classList.remove("np-orbit");
    if (ring && ring.parentNode) ring.parentNode.removeChild(ring);
    items.forEach(function (o) { var s = o.el.style; s.removeProperty("--np-t"); s.opacity = ""; s.zIndex = ""; o.z = 0; });
  }
  function run() { if (on && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function check() { if (reduceMQ.matches || mobileMQ.matches) disable(); else if (!on) enable(); else measure(); }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { visible = en[en.length - 1].isIntersecting; if (visible) run(); else stop(); }, { threshold: 0 }).observe(stage);
  }
  var rt = 0;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(check, 120); });

  /* "Open Dashboard": cards fly back into the laptop while the existing transition runs */
  function leave() { leaving = true; active = null; closeScreen(); }
  var orig = window.novapayOpenDashboard;
  if (typeof orig === "function") window.novapayOpenDashboard = function (h) { if (on) leave(); return orig(h); };
  document.addEventListener("click", function (e) { if (on && e.target.closest && e.target.closest("#open-dashboard")) leave(); }, true);
  window.addEventListener("pageshow", function (e) { if (e.persisted && on) { leaving = false; } });

  check();
})();
