/* NovaPay home page header: click ring, theme sparks and circular theme reveal. */
(function () {
  "use strict";
  var root = document.documentElement;
  var bar = document.querySelector(".header-actions");
  var themeBtn = document.getElementById("theme");
  if (!bar || !themeBtn) return;
  var busy = false, deferred = null;

  function reduced() {
    return root.classList.contains("reduce-motion") ||
      (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function replay(el, cls, ms) {
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    clearTimeout(el["_t" + cls]); el["_t" + cls] = setTimeout(function () { el.classList.remove(cls); }, ms);
  }
  function sparks(btn) {
    var dark = root.getAttribute("data-theme") === "dark"; /* theme already switched */
    var col = dark ? ["#c7d0ff", "#8b9cff", "#ffffff"] : ["#ffd25a", "#f59e0b", "#ffb347"];
    var box = document.createElement("span");
    box.className = "fx-burst"; box.setAttribute("aria-hidden", "true"); btn.appendChild(box);
    for (var i = 0; i < 10; i++) {
      var p = document.createElement("i"); p.style.background = col[i % 3]; box.appendChild(p);
      var a = Math.PI * 2 * i / 10 + Math.random() * .3, d = 30 + Math.random() * 14;
      p.animate([
        { transform: "translate(0,0) scale(.3) rotate(0)", opacity: 1 },
        { transform: "translate(" + Math.cos(a) * d * .7 + "px," + Math.sin(a) * d * .7 + "px) scale(1.1) rotate(60deg)", opacity: 1, offset: .45 },
        { transform: "translate(" + Math.cos(a) * d + "px," + Math.sin(a) * d + "px) scale(.5) rotate(120deg)", opacity: 0 }
      ], { duration: 650, delay: i * 14, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" });
    }
    setTimeout(function () { box.remove(); }, 900);
  }

  bar.addEventListener("click", function (e) {
    var btn = e.target.closest(".icon-button");
    if (!btn || !bar.contains(btn) || reduced()) return;
    replay(btn, "fx-ring", 700);
    if (btn === themeBtn) {
      replay(btn, "fx-go", 900);
      if (busy) deferred = function () { sparks(btn); }; else sparks(btn); /* page is frozen mid view-transition */
    }
  });

  document.addEventListener("click", function (e) {
    if (busy || !e.target.closest || e.target.closest("#theme") !== themeBtn) return;
    if (!document.startViewTransition || reduced()) return;
    e.stopPropagation();
    busy = true;
    themeBtn.style.viewTransitionName = "theme-btn";
    var r = themeBtn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    var end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    function done() {
      busy = false; themeBtn.style.viewTransitionName = "";
      if (deferred) { var f = deferred; deferred = null; f(); }
    }
    var vt;
    try { vt = document.startViewTransition(function () { themeBtn.click(); }); }
    catch (err) { busy = false; themeBtn.style.viewTransitionName = ""; themeBtn.click(); return; }
    vt.ready.then(function () {
      root.animate(
        { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + end + "px at " + x + "px " + y + "px)"] },
        { duration: 650, easing: "cubic-bezier(.4,0,.2,1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(function () {});
    vt.finished.then(done, done);
  }, true);
})();
