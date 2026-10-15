/* NovaPay FX — particles (classic script).
   Effect 1  DEPTH SNOW      soft pastel flakes at different depths (dark theme); subtle shimmer in light theme
   Effect 2  WAKE            flakes near the moving pointer / reveal ribbon get pushed along, then settle back
   Effect 3  CURRENCY GLYPHS ₹ $ % ✓ drifting in 3D, softly out of focus, behind the content
   Requires fx-core.js. Toggle either layer with the two switches below. */
(function () {
  "use strict";
  var SNOW_ENABLED = false;     // snowflakes removed; set true to bring back effects 1 + 2
  var GLYPHS_ENABLED = true;    // <- set false to disable effect 3
  var FX = window.NovaPayFX;
  if (!FX || (!SNOW_ENABLED && !GLYPHS_ENABLED)) return;

  var root = document.documentElement;
  var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  var W = 0, H = 0;
  var rnd = Math.random;

  function mkCanvas(z, id) {
    var c = document.createElement("canvas");
    c.id = id; c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:" + z + ";";
    document.body.appendChild(c);
    return c;
  }
  var snowC = SNOW_ENABLED ? mkCanvas(15, "fx-snow") : null;
  var glyphC = GLYPHS_ENABLED ? mkCanvas(-1, "fx-glyphs") : null;
  var sctx = snowC && snowC.getContext("2d");
  var gctx = glyphC && glyphC.getContext("2d");

  function resize() {
    W = root.clientWidth; H = window.innerHeight;
    [snowC, glyphC].forEach(function (c) { if (c) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); } });
    if (FX.reduced) drawStatic();
  }

  /* =================== sprites =================== */
  /* Snowflake artwork: assets/snowflake.png (transparent background, supplied by the design owner).
     Four pre-rendered blur levels give the depth-of-field: far flakes crisp, near flakes soft. */
  var SNOW_OPACITY = 0.9;                 // global snow opacity multiplier (1 = original, 0.9 = 10% lighter)
  var flakeImg = new Image(), snowSprites = null, spritesReady = false;
  flakeImg.onload = function () {
    var S = 144, pad = 18, blurs = [0, 1.4, 3, 5.5], out = [];
    for (var b = 0; b < 4; b++) {
      var cv = document.createElement("canvas"); cv.width = cv.height = S;
      var g = cv.getContext("2d"), px = blurs[b], inner = S - pad * 2;
      if (px > 0 && typeof g.filter === "string") { g.filter = "blur(" + px + "px)"; g.drawImage(flakeImg, pad, pad, inner, inner); }
      else if (px > 0) {                                           // no ctx.filter (older Safari): blur by down/up-scaling
        var k = Math.max(2, Math.round(px * 1.6)), t = document.createElement("canvas"); t.width = t.height = Math.ceil(S / k);
        var tg = t.getContext("2d"); tg.imageSmoothingQuality = "high"; tg.drawImage(flakeImg, pad / k, pad / k, inner / k, inner / k);
        g.imageSmoothingQuality = "high"; g.drawImage(t, 0, 0, S, S);
      } else g.drawImage(flakeImg, pad, pad, inner, inner);
      out.push(cv);
    }
    snowSprites = out; spritesReady = true;
    if (FX.reduced) drawStatic();
  };
  flakeImg.src = "assets/snowflake.png";

  var MAX_FLAKES = 90, flakes = [];
  function mkFlake(initial) {
    var z = rnd();
    return {
      x: rnd() * W, y: initial ? rnd() * H : -30,
      z: z, ph: rnd() * 6.283, ivx: 0, ivy: 0,
      rot: rnd() * 6.283, rs: (rnd() - 0.5) * (0.5 + z * 0.9),     // slow tumble; nearer flakes turn a little faster
      tw: 0.6 + rnd() * 1.6                                        // twinkle speed (light theme)
    };
  }
  var par = { x: 0, y: 0 };

  function snowCount(theme) {
    var base = theme === "dark" ? 62 : 30;
    var k = FX.quality * (FX.low ? 0.4 : 1) * (FX.coarse ? 0.5 : 1) * (FX.isLens ? 0.6 : 1);
    return Math.max(10, Math.min(MAX_FLAKES, Math.round(base * k)));
  }

  function drawFlake(f, theme, t, ox, oy) {
    var z = f.z, a, d;
    var bl = z > 0.8 ? 3 : z > 0.55 ? 2 : z > 0.3 ? 1 : 0;
    var x = f.x + ox * (z - 0.5), y = f.y + oy * (z - 0.5);
    if (theme === "dark") {
      a = (0.34 + z * 0.5) * SNOW_OPACITY;
      d = 11 + z * 25;
    } else {                                                       // light theme: same flakes, calmer, gently twinkling
      var tw = 0.5 + 0.5 * Math.sin(t * 0.001 * f.tw * 2 + f.ph);
      a = (0.16 + z * 0.30) * (0.35 + 0.65 * tw) * SNOW_OPACITY;
      d = 10 + z * 20;
    }
    sctx.globalAlpha = a;
    sctx.setTransform(DPR, 0, 0, DPR, x * DPR, y * DPR);
    sctx.rotate(f.rot);
    sctx.drawImage(snowSprites[bl], -d / 2, -d / 2, d, d);
  }

  function stepSnow(dt, now) {
    var theme = FX.theme();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, snowC.width, snowC.height);
    if (!spritesReady) return;
    var n = Math.min(flakes.length, snowCount(theme));

    var damp = Math.exp(-2.4 * dt);
    for (var i = 0; i < n; i++) {
      var f = flakes[i], z = f.z;
      f.rot += f.rs * dt;
      if (theme === "dark") {
        var sway = Math.sin(now * 0.0006 + f.ph) * (7 + z * 15);
        f.ivx *= damp; f.ivy *= damp;
        f.x += (sway + f.ivx) * dt;
        f.y += (14 + z * 46 + f.ivy) * dt;
        if (f.y > H + 40) { f.y = -40; f.x = rnd() * W; f.ivx = f.ivy = 0; }
        else if (f.y < -80) { f.y = H + 30; }
        if (f.x < -50) f.x = W + 40; else if (f.x > W + 50) f.x = -40;
      } else {                                                     // light: gentle floating shimmer
        f.x += Math.sin(now * 0.0003 + f.ph) * 4 * dt;
        f.y += Math.cos(now * 0.00025 + f.ph) * 3 * dt;
      }
      drawFlake(f, theme, now, par.x, par.y);
    }
    sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1;
  }

  /* =================== glyphs =================== */
  var GLYPHS = ["₹", "$", "%", "✓"];
  var GLYPH_COLORS = {
    dark:  [[255, 182, 217], [239, 188, 255], [170, 234, 255], [175, 255, 208]],
    light: [[160, 130, 240], [110, 170, 255], [240, 120, 180], [80, 200, 160]]
  };
  var BUCKET = [20, 32, 48], gSprites = {};
  function glyphSprite(theme, gi, bucket) {
    var key = theme + gi + bucket;
    if (gSprites[key]) return gSprites[key];
    var fs = BUCKET[bucket] * 2, S = Math.ceil(fs * 2.2);
    var cv = document.createElement("canvas"); cv.width = cv.height = S;
    var g = cv.getContext("2d"), col = GLYPH_COLORS[theme][gi % 4];
    var blur = [0, fs * 0.05, fs * 0.13][bucket];                // near = out of focus, far = crisp & tiny
    g.font = "700 " + fs + "px Montserrat, 'Segoe UI', system-ui, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "rgba(" + col + ",1)";
    if (blur > 0) {                                              // cross-browser blur: draw off-canvas, keep only the shadow
      g.shadowColor = "rgba(" + col + ",1)"; g.shadowBlur = blur; g.shadowOffsetX = S * 3;
      g.fillText(GLYPHS[gi], S / 2 - S * 3, S / 2);
    } else g.fillText(GLYPHS[gi], S / 2, S / 2);
    return (gSprites[key] = cv);
  }
  var gl = [];
  function mkGlyph(initial) {
    var z = rnd();
    return { x: rnd() * W, y: initial ? rnd() * H : H + 60, z: z, gi: (rnd() * 4) | 0, ph: rnd() * 6.283,
             spin: 0.35 + rnd() * 0.6, tilt: (rnd() - 0.5) * 0.5 };
  }
  function glyphCount() { return Math.max(8, Math.round(26 * FX.quality * (FX.low ? 0.4 : 1) * (FX.coarse ? 0.5 : 1) * (FX.isLens ? 0.6 : 1))); }

  function drawGlyph(f, theme, ang) {
    var b = f.z < 0.33 ? 0 : f.z < 0.66 ? 1 : 2;
    var spr = glyphSprite(theme, f.gi, b);
    var size = (14 + f.z * 34) * 2.2 * DPR;                      // drawn size (sprite is 2x for crispness)
    var cs = Math.cos(ang), flip = Math.max(0.14, Math.abs(cs));
    var base = theme === "dark" ? 0.22 + f.z * 0.30 : 0.18 + f.z * 0.26;
    gctx.globalAlpha = base * (0.45 + 0.55 * flip);
    var ox = 0;
    gctx.setTransform(flip * DPR, 0, 0, DPR, (f.x + ox) * DPR, f.y * DPR);
    gctx.rotate(f.tilt);
    gctx.drawImage(spr, -size / (2 * DPR), -size / (2 * DPR), size / DPR, size / DPR);
  }
  function stepGlyphs(dt, now) {
    var theme = FX.theme(), n = Math.min(gl.length, glyphCount());
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, glyphC.width, glyphC.height);
    for (var i = 0; i < n; i++) {
      var f = gl[i];
      f.y -= (4 + f.z * 12) * dt;
      f.x += Math.sin(now * 0.0004 + f.ph) * (3 + f.z * 6) * dt;
      if (f.y < -60) { f.y = H + 50; f.x = rnd() * W; }
      drawGlyph(f, theme, now * 0.001 * f.spin + f.ph);
    }
    gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.globalAlpha = 1;
  }

  /* =================== static (reduced motion) =================== */
  function drawStatic() {
    var theme = FX.theme();
    if (sctx) {
      sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, snowC.width, snowC.height);
      if (spritesReady) {
        var n = Math.min(flakes.length, Math.round(snowCount(theme) * 0.7));
        for (var i = 0; i < n; i++) drawFlake(flakes[i], theme, 0, 0, 0);
      }
      sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1;
    }
    if (gctx) {
      gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, glyphC.width, glyphC.height);
      var m = Math.min(gl.length, Math.round(glyphCount() * 0.7));
      for (var j = 0; j < m; j++) drawGlyph(gl[j], theme, 0.3 + gl[j].ph * 0.1);
      gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.globalAlpha = 1;
    }
  }

  /* =================== boot =================== */
  resize();
  var i0;
  if (sctx) for (i0 = 0; i0 < MAX_FLAKES; i0++) flakes.push(mkFlake(true));
  if (gctx) for (i0 = 0; i0 < 40; i0++) gl.push(mkGlyph(true));
  var rt = 0;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(resize, 120); });

  if (FX.reduced) {
    drawStatic();
    new MutationObserver(drawStatic).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  } else {
    if (sctx) FX.add(stepSnow);
    if (gctx) FX.add(stepGlyphs);
  }
})();
