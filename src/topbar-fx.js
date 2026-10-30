/* NovaPay top-bar button motion: click pop, particles, coin flip, theme reveal. */
(function () {
  "use strict";
  var root = document.documentElement;
  var bar = document.querySelector(".top-actions");
  var themeBtn = document.getElementById("dashboard-theme"), busy = false, deferred = null;
  if (!bar) return;

  function reduced() {
    return root.classList.contains("reduce-motion") ||
      (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function replay(el, cls, ms) {
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    clearTimeout(el["_t" + cls]);
    el["_t" + cls] = setTimeout(function () { el.classList.remove(cls); }, ms);
  }
  function burst(btn, items, opts) {
    var box = document.createElement("span");
    box.className = "fx-burst";
    box.setAttribute("aria-hidden", "true");
    btn.appendChild(box);
    items.forEach(function (it, i) {
      var p = document.createElement("i");
      p.className = it.cls || "";
      if (it.bg) p.style.background = it.bg;
      if (it.text) p.textContent = it.text;
      box.appendChild(p);
      var ang = it.angle, dist = it.dist, g = it.gravity || 0;
      var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      p.animate([
        { transform: "translate(0,0) scale(.3) rotate(0)", opacity: 1 },
        { transform: "translate(" + dx * .7 + "px," + (dy * .7 - g) + "px) scale(1.1) rotate(" + (it.spin || 0) * .5 + "deg)", opacity: 1, offset: .45 },
        { transform: "translate(" + dx + "px," + (dy + g * .8) + "px) scale(.5) rotate(" + (it.spin || 0) + "deg)", opacity: 0 }
      ], { duration: (opts && opts.duration) || 750, delay: i * 14, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" });
    });
    setTimeout(function () { box.remove(); }, ((opts && opts.duration) || 750) + items.length * 14 + 60);
  }
  function fan(n, from, to) {
    var a = []; for (var i = 0; i < n; i++) a.push(from + (to - from) * (n === 1 ? .5 : i / (n - 1)) + (Math.random() - .5) * .25);
    return a;
  }

  /* per-button click effects */
  var effects = {
    "calendar-button": function () {},
    "notifications": function (btn) {
      var angles = fan(7, -Math.PI * .95, -Math.PI * .05), items = [];
      angles.forEach(function (a, i) {
        items.push(i % 3 === 2
          ? { cls: "is-txt", text: i % 2 ? "$" : "₹", angle: a, dist: 30 + Math.random() * 18, gravity: 10, spin: (Math.random() - .5) * 160 }
          : { cls: "is-coin", angle: a, dist: 26 + Math.random() * 22, gravity: 12, spin: (Math.random() - .5) * 240 });
      });
      burst(btn, items);
    },
    "dashboard-theme": function (btn) {
      var goingDark = root.getAttribute("data-theme") === "dark"; /* the app handler already ran */
      var col = goingDark ? ["#c7d0ff", "#8b9cff", "#fff"] : ["#ffd25a", "#f59e0b", "#ffb347"];
      var items = [];
      for (var i = 0; i < 10; i++) items.push({ cls: "is-star", bg: col[i % 3], angle: (Math.PI * 2 * i / 10) + Math.random() * .3, dist: 28 + Math.random() * 14, spin: 120 });
      burst(btn, items, { duration: 650 });
    },
    "more-button": function () {}
  };

  bar.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn || !bar.contains(btn) || reduced()) return;
    replay(btn, "fx-ring", 700);
    replay(btn, "fx-go", 900);
    var fx = effects[btn.id];
    if (!fx) return;
    if (busy && btn === themeBtn) { deferred = function () { fx(btn); }; return; } /* page is frozen in a view transition */
    fx(btn);
  });

  /* stagger index for calendar day cells (re-rendered every time it opens) */
  var days = document.getElementById("cal-days");
  if (days && window.MutationObserver) {
    new MutationObserver(function () {
      Array.prototype.forEach.call(days.children, function (c, i) { c.style.setProperty("--i", i); });
    }).observe(days, { childList: true });
  }

  /* theme: circular reveal growing from the button */
  document.addEventListener("click", function (e) {
    if (!themeBtn || busy || !e.target.closest || e.target.closest("#dashboard-theme") !== themeBtn) return;
    if (!document.startViewTransition || reduced()) return;
    e.stopPropagation();
    busy = true;
    themeBtn.style.viewTransitionName = "theme-btn"; /* keep the spinning sun above the reveal */
    var r = themeBtn.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    var vt;
    try {
      vt = document.startViewTransition(function () { themeBtn.click(); }); /* re-dispatch: runs the app's own handler */
    } catch (err) { busy = false; themeBtn.style.viewTransitionName = ""; themeBtn.click(); return; }
    vt.ready.then(function () {
      root.animate(
        { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + end + "px at " + x + "px " + y + "px)"] },
        { duration: 650, easing: "cubic-bezier(.4,0,.2,1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(function () {});
    function done() {
      busy = false; themeBtn.style.viewTransitionName = "";
      if (deferred) { var f = deferred; deferred = null; f(); }
    }
    vt.finished.then(done, done);
  }, true);
})();
