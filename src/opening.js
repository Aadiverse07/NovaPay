/* NovaPay opening — see opening.css. Classic script (works from file://).
   Trail model (from the reference video): a head that flows by itself in a wave through the wordmark lays down a dense, overlapping ribbon of small portrait photos
   (newest on top, slightly tilted). Each card pops in, drifts a little, then shrinks away from the tail of the trail,
   leaving a few tiny square fragments.
   PHOTOS: the series in assets/intro-person-01..32.png, then assets/intro-portraits/*.jpg, shown in that order
   (cards are center-cropped with CSS, so no canvas is needed). Generated placeholder portraits are only a fallback. */
(function () {
  "use strict";
  var el = document.getElementById("np-opening");
  if (!el) return;
  if (!window.__npOpening) { el.parentNode.removeChild(el); return; }

  var word = el.querySelector(".np-open-word"), hintMode = el.querySelector("#np-open-mode");
  var enterBtn = el.querySelector(".np-open-enter"), modeItems = [].slice.call(el.querySelectorAll(".np-open-top li[data-mode]"));
  var WORD = "NOVAPAY";
  WORD.split("").forEach(function (ch, i) {
    var s = document.createElement("span"); s.textContent = ch; s.style.animationDelay = (0.05 + i * 0.06) + "s"; word.appendChild(s);
  });

  /* ---- fit the wordmark to the viewport width ---- */
  var wordW = window.innerWidth * 0.89;
  function fit() {
    word.style.fontSize = "100px";
    var w = word.getBoundingClientRect().width || 1;
    word.style.fontSize = (100 * (window.innerWidth * 0.89) / w) + "px";
    wordW = word.getBoundingClientRect().width || window.innerWidth * 0.89;
  }
  fit(); window.addEventListener("resize", fit);
  if (document.fonts && document.fonts.load) document.fonts.load("400 100px 'Rubik Mono One'").then(fit, function () {});

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---- photos: real ones from assets/trail/, else generated placeholder portraits ---- */
  var tex = [];
  var SKIN = ["#f1c9a5", "#e0ac82", "#c68642", "#8d5524", "#5b3a24", "#f3d2b8", "#a86f4a", "#3e2a1e"];
  var HAIR = ["#16110d", "#2a1b12", "#5a3a22", "#b88a52", "#d8d2c8", "#7a2e1a"];
  var CLOTH = ["#1f3a5f", "#7a2e2e", "#2d5a4a", "#c78a2c", "#3b3f58", "#8a4b6b", "#e8e4da", "#274c77"];
  function ell(g, x, y, rx, ry, col) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); }
  function portrait(i) {                                            // stylised placeholder: varied skin tones, hair, clothing
    var c = document.createElement("canvas"); c.width = 240; c.height = 300; var g = c.getContext("2d");
    var skin = SKIN[i % SKIN.length], hair = HAIR[(i * 5 + 1) % HAIR.length], cloth = CLOTH[(i * 3 + 2) % CLOTH.length], st = i % 6;
    var bg = g.createLinearGradient(0, 0, 240, 300); bg.addColorStop(0, i % 2 ? "#3a2a22" : "#1f2a33"); bg.addColorStop(1, "#0a0a0c");
    g.fillStyle = bg; g.fillRect(0, 0, 240, 300);
    ell(g, 120, 330, 108, 96, cloth);                                // shoulders
    if (st === 1) ell(g, 120, 178, 58, 92, hair);                   // long hair behind
    if (st === 2) ell(g, 120, 116, 64, 60, hair);                   // curly / afro
    if (st === 4) ell(g, 120, 160, 60, 78, cloth);                  // headscarf
    g.fillStyle = skin; g.fillRect(104, 196, 32, 50);               // neck
    ell(g, 120, st === 4 ? 160 : 150, st === 4 ? 40 : 44, st === 4 ? 50 : 56, skin);   // face
    if (st === 0 || st === 3 || st === 1) { g.fillStyle = hair; g.beginPath(); g.ellipse(120, 126, 47, 44, 0, Math.PI, 2 * Math.PI); g.fill(); }
    if (st === 3) ell(g, 120, 78, 17, 17, hair);                    // bun
    if (st === 5) ell(g, 120, 188, 33, 26, hair);                   // beard
    g.fillStyle = "rgba(10,10,10,.8)"; ell(g, 105, 152, 3.2, 2.4, "#120c0a"); ell(g, 135, 152, 3.2, 2.4, "#120c0a");
    if (i % 4 === 1) { g.strokeStyle = "rgba(20,20,20,.85)"; g.lineWidth = 2; g.beginPath(); g.arc(105, 152, 11, 0, 7); g.moveTo(146, 152); g.arc(135, 152, 11, 0, 7); g.stroke(); }
    g.fillStyle = "rgba(60,20,20,.5)"; g.fillRect(110, 178, 20, 2.5);
    var l = g.createRadialGradient(rnd(40, 200), rnd(60, 160), 5, 120, 160, 210);   // warm side-light, like the reference grade
    l.addColorStop(0, "rgba(255,130,50,.45)"); l.addColorStop(1, "rgba(0,0,0,.55)"); g.fillStyle = l; g.fillRect(0, 0, 240, 300);
    for (var k = 0; k < 30; k++) { g.fillStyle = "rgba(255,255,255," + rnd(.03, .14) + ")"; g.fillRect(rnd(0, 240), rnd(0, 300), 1.4, 1.4); }
    return c.toDataURL("image/jpeg", .86);
  }
  var PHOTOS = [];
  for (var q = 1; q <= 32; q++) PHOTOS.push("assets/intro-person-" + (q < 10 ? "0" : "") + q + ".png");
  ["australia", "brazil", "finland", "france", "india", "japan", "mexico", "uk", "usa"].forEach(function (c) { PHOTOS.push("assets/intro-portraits/" + c + ".jpg"); });
  (function loadPhotos() {                                          // 6 at a time, in series order: first photos show almost at once
    var slots = [], next = 0, active = 0, pending = PHOTOS.length;
    function fin() {
      active--; pending--;
      if (!pending && !tex.length) for (var p = 0; p < 12; p++) tex.push(portrait(p));   // fallback only if nothing loaded
      else pump();
    }
    function pump() {
      while (active < 6 && next < PHOTOS.length) (function (i) {
        active++;
        var im = new Image();
        im.onload = function () { slots[i] = PHOTOS[i]; tex = slots.filter(Boolean); fin(); };
        im.onerror = fin; im.src = PHOTOS[i];
      }(next++));
    }
    pump();
  }());

  /* ---- trail modes (index 0 = the reference video) ---- */
  var MODES = [
    { name: "TRAIL",   rot: 18, drift: 10, life: 950,  step: .03, size: .085 },
    { name: "STACK",   rot: 4,  drift: 6,  life: 1400, step: .028, size: .085 },
    { name: "SCATTER", rot: 40, drift: 90, life: 1000, step: .05,  size: .075 }
  ];
  var mode = 0, last = null, n = 0, alive = 0, leaving = false;

  function dot(x, y, dx, dy) {                                      // tiny square fragments
    var d = document.createElement("div"); d.className = "np-open-dot";
    var s = rnd(2, 5); d.style.cssText = "width:" + s + "px;height:" + s + "px;left:" + x + "px;top:" + y + "px;background:" + (Math.random() < .55 ? "#fff" : "#111");
    var ang = Math.atan2(dy, dx) + rnd(-1.6, 1.6), dist = rnd(18, 60);
    var a = d.animate([{ transform: "translate(0,0) rotate(0)", opacity: 1 },
      { transform: "translate(" + Math.cos(ang) * dist + "px," + Math.sin(ang) * dist + "px) rotate(" + rnd(-200, 200) + "deg)", opacity: 0 }],
      { duration: rnd(350, 650), easing: "cubic-bezier(.2,.7,.3,1)" });
    el.appendChild(d); a.onfinish = function () { d.remove(); };
  }
  function spawn(x, y, ux, uy) {
    if (alive > 46 || !tex.length) return;
    var m = MODES[mode], card = document.createElement("div"); card.className = "np-open-card";
    var w = Math.max(54, Math.min(150, wordW * m.size)) * rnd(.85, 1.15), h = w * 1.25;
    var rot = rnd(-m.rot, m.rot) + 9 * Math.sin(n * .55);
    card.style.cssText = "width:" + w + "px;height:" + h + "px;left:" + (x - w / 2) + "px;top:" + (y - h / 2) + "px;z-index:" + (2 + (n % 1000) * .001) + ";background-image:url(\"" + tex[n++ % tex.length] + "\")";
    var ang = Math.atan2(uy, ux), dr = m.drift * rnd(.6, 1.3), vx = Math.cos(ang) * dr, vy = Math.sin(ang) * dr, spin = rnd(-14, 14);
    alive++;
    var a = card.animate([
      { transform: "translate(0,0) rotate(" + rot + "deg) scale(.55)", opacity: 0, easing: "cubic-bezier(.2,.9,.3,1.2)" },
      { transform: "translate(0,0) rotate(" + rot + "deg) scale(1)", opacity: 1, offset: .08, easing: "linear" },
      { transform: "translate(" + vx * .5 + "px," + vy * .5 + "px) rotate(" + (rot + spin * .4) + "deg) scale(1)", opacity: 1, offset: .52, easing: "cubic-bezier(.5,0,.9,.6)" },
      { transform: "translate(" + vx + "px," + vy + "px) rotate(" + (rot + spin) + "deg) scale(.2)", opacity: 1, offset: .93, easing: "linear" },
      { transform: "translate(" + vx * 1.1 + "px," + vy * 1.1 + "px) rotate(" + (rot + spin * 1.2) + "deg) scale(.04)", opacity: 0 }
    ], { duration: m.life * rnd(.9, 1.1) });
    el.appendChild(card);
    a.onfinish = function () {
      alive--; card.remove();
      var k = Math.random() < .6 ? 2 : 1; while (k--) dot(x + vx, y + vy, ux, uy);
    };
    if (Math.random() < .3) dot(x + ux * 30, y + uy * 30, ux, uy);  // sparks just ahead of the head
  }
  function move(x, y) {
    if (!last) { last = { x: x, y: y }; return; }
    var dx = x - last.x, dy = y - last.y, d = Math.hypot(dx, dy), s = Math.max(14, wordW * MODES[mode].step);
    if (d < s) return;
    var ux = dx / d, uy = dy / d, cnt = Math.min(6, Math.floor(d / s));
    for (var i = 1; i <= cnt; i++) spawn(last.x + ux * s * i, last.y + uy * s * i, ux, uy);
    last = { x: last.x + ux * s * cnt, y: last.y + uy * s * cnt };
  }
  function setMode(i) {
    mode = i % MODES.length; modeItems.forEach(function (li, k) { li.classList.toggle("on", k === mode); });
    if (hintMode) hintMode.textContent = "NOVAPAY TRAIL: " + MODES[mode].name + " / INTENSITY: 50";
  }
  setMode(0);

  /* ---- leave ---- */
  var t0 = performance.now(), autoTimer = 0;
  function leave() {
    if (leaving) return; leaving = true; clearTimeout(autoTimer);
    el.classList.add("is-leaving");
    if (window.__npOpeningEnd) window.__npOpeningEnd(850);          // starts the hero intro as the wipe begins
    setTimeout(function () { if (window.novapayLogoReplay) window.novapayLogoReplay(); }, 250);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
  }
  function schedule(ms) {                                           // idle -> auto leave, capped at 9s total
    clearTimeout(autoTimer);
    autoTimer = setTimeout(leave, Math.max(300, Math.min(ms, 9000 - (performance.now() - t0))));
  }
  schedule(8500);

  /* ---- input: no pointer tracking — the photo series runs by itself ---- */
  el.addEventListener("pointerdown", function (e) { if (e.target === enterBtn || e.target.closest(".np-open-top")) return; setMode(mode + 1); });
  modeItems.forEach(function (li, k) { li.addEventListener("click", function () { setMode(k); }); });
  enterBtn.addEventListener("click", leave);
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); leave(); }
    else if (e.key === " " || e.key.toLowerCase() === "m") { e.preventDefault(); setMode(mode + 1); }
  });

  /* ---- the wave: the head sweeps left <-> right through NOVAPAY on a sine path, the photos follow it ---- */
  function wave(t) {
    var r = word.getBoundingClientRect(), pad = r.width * .05;
    var left = r.left - pad, right = r.right + pad, cy = r.top + r.height * .5, amp = r.height * .3;
    var u = (t / 2.9) % 2, pos = u < 1 ? u : 2 - u;                 // ping-pong 0..1..0, continuous at the turns
    return { x: left + pos * (right - left), y: cy + amp * Math.sin(pos * Math.PI * 5) + amp * .12 * Math.sin(pos * 31) };
  }
  function run(ts) {
    if (leaving) return;
    var t = (ts - t0) / 1000 - 0.5;
    if (t > 0) { var q = wave(t); move(q.x, q.y); }
    requestAnimationFrame(run);
  }
  requestAnimationFrame(run);
}());
