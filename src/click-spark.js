/* Lightweight vanilla-JS adaptation of React Bits ClickSpark for NovaPay. */
(function () {
  "use strict";

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var canvas = document.createElement("canvas");
  canvas.className = "click-spark-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  if (!ctx) { canvas.remove(); return; }

  var bursts = [];
  var raf = 0;
  var colors = ["#2f66f5", "#7a3ff2", "#42c7d5"];
  var duration = 520;
  var radius = 34;
  var count = 8;
  var dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
  }

  function burst(x, y) {
    var offset = Math.random() * colors.length;
    bursts.push({
      x: x, y: y, start: performance.now(),
      sparks: Array.from({ length: count }, function (_, i) {
        return {
          angle: (Math.PI * 2 * i / count) - Math.PI / 2 + (Math.random() - 0.5) * 0.24,
          length: 8 + Math.random() * 7,
          reach: radius * (0.78 + Math.random() * 0.42),
          color: colors[(i + Math.floor(offset)) % colors.length]
        };
      })
    });
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function draw(now) {
    raf = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    bursts = bursts.filter(function (item) {
      var progress = (now - item.start) / duration;
      if (progress >= 1) return false;
      var ease = 1 - Math.pow(1 - progress, 3);
      var fade = 1 - progress;
      item.sparks.forEach(function (spark) {
        var distance = spark.reach * ease;
        var x1 = item.x + Math.cos(spark.angle) * distance;
        var y1 = item.y + Math.sin(spark.angle) * distance;
        var tail = spark.length * Math.pow(1 - progress, 1.3);
        ctx.globalAlpha = fade;
        ctx.strokeStyle = spark.color;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + Math.cos(spark.angle) * tail, y1 + Math.sin(spark.angle) * tail);
        ctx.stroke();
      });
      return true;
    });
    ctx.globalAlpha = 1;
    if (bursts.length) raf = requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    burst(event.clientX, event.clientY);
  }, { passive: true });
  document.addEventListener("click", function (event) {
    if (event.detail !== 0) return;
    var target = event.target instanceof Element ? event.target : document.body;
    var rect = target.getBoundingClientRect();
    burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, { passive: true });
})();
