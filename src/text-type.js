/* TextType — vanilla JS port of the React Bits <TextType /> component.
 * Same behaviour and props (typing, backspace/select delete, typos, fade/blur/rise
 * effects, gliding + blinking cursor). GSAP is replaced by the Web Animations API /
 * CSS transitions, so there is no dependency.
 *
 *   var tt = NovaTextType(el, { text: ["a","b"], typingSpeed: 75, ... });
 *   tt.finish();   // jump to the fully typed state
 *   tt.destroy();
 *
 * Declarative: <p data-text-type data-text-type-options='{"loop":false}'>Text</p>
 *
 * Extras over the original: onTypingComplete(sentence, index), onUpdate(),
 * hideCursorOnComplete, and finish().
 */
(function () {
  "use strict";

  var NEIGHBORS = {
    a: "qwsz", b: "vghn", c: "xdfv", d: "serfcx", e: "wsdr", f: "drtgvc", g: "ftyhbv", h: "gyujnb",
    i: "ujko", j: "huikmn", k: "jiolm", l: "kop", m: "njk", n: "bhjm", o: "iklp", p: "ol", q: "wa",
    r: "edft", s: "awedxz", t: "rfgy", u: "yhji", v: "cfgb", w: "qase", x: "zsdc", y: "tghu", z: "asx",
    0: "9p", 1: "2q", 2: "13w", 3: "24e", 4: "35r", 5: "46t", 6: "57y", 7: "68u", 8: "79i", 9: "80o"
  };

  var EFFECTS = {
    fade: {
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
      options: { duration: 360, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }
    },
    blur: {
      keyframes: [{ opacity: 0, filter: "blur(0.3em)" }, { opacity: 1, filter: "blur(0em)" }],
      options: { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    },
    rise: {
      keyframes: [{ opacity: 0, top: "0.6em" }, { opacity: 1, top: "0em" }],
      options: { duration: 480, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)" }
    }
  };

  var DEFAULTS = {
    text: "", prefix: "", prefixColor: "currentColor",
    typingSpeed: 50, initialDelay: 0, pauseDuration: 2000, deletingSpeed: 30,
    deleteMode: "backspace", typeEffect: "none", mistakes: 0, variableSpeed: null,
    loop: true, showCursor: true, cursorStyle: "character", cursorCharacter: "|",
    cursorColor: "currentColor", cursorBlinkDuration: 0.5, cursorGlide: true,
    hideCursorWhileTyping: false, cursorClassName: "", className: "", textColors: [],
    onSentenceComplete: null, startOnVisible: false, reverseMode: false,
    onTypingComplete: null, onUpdate: null, hideCursorOnComplete: false
  };

  function graphemes(value) {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), function (p) { return p.segment; });
    }
    return Array.from(value);
  }

  function typoFor(ch) {
    var keys = NEIGHBORS[ch.toLowerCase()];
    if (!keys) return null;
    var pick = keys[Math.floor(Math.random() * keys.length)];
    return ch === ch.toLowerCase() ? pick : pick.toUpperCase();
  }

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function TextType(root, userOpts) {
    var o = {};
    var k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in userOpts) if (userOpts[k] !== undefined) o[k] = userOpts[k];

    var textArray = (Array.isArray(o.text) ? o.text : [String(o.text == null ? "" : o.text)]).map(String);
    if (!textArray.length) textArray = [""];
    var charsCache = {};
    function charsFor(i) { return charsCache[i] || (charsCache[i] = graphemes(textArray[i])); }

    var minSpeed = o.variableSpeed ? o.variableSpeed.min : o.typingSpeed;
    var maxSpeed = o.variableSpeed ? o.variableSpeed.max : o.typingSpeed;
    var pace = (minSpeed + maxSpeed) / 2;
    var glideTime = Math.min(0.18, Math.max(0.06, pace * 0.0016));

    // ---- state (mirrors the React component) ----
    var textIndex = 0, count = 0, selected = 0, typo = null, isDeleting = false;
    var isVisible = !o.startOnVisible, reduceMotion = false, lastTypo = -1;
    var announced = false, finished = false, destroyed = false, done = false;
    var timer = null, observer = null, resizeObs = null, mq = null, mqHandler = null;

    // ---- DOM ----
    root.textContent = "";
    root.classList.add("text-type");
    if (o.className) o.className.split(/\s+/).forEach(function (c) { if (c) root.classList.add(c); });

    var sr = el("span", "text-type__sr");
    sr.textContent = o.prefix + textArray.join(" ");
    var content = el("span", "text-type__content");
    content.setAttribute("aria-hidden", "true");
    if (o.prefix) {
      var pre = el("span", "text-type__prefix");
      pre.style.color = o.prefixColor;
      pre.textContent = o.prefix;
      content.appendChild(pre);
    }
    var caret = el("span", "text-type__caret");
    caret.textContent = "​";
    var colorSpan = el("span");
    if (o.reverseMode) content.appendChild(caret);
    content.appendChild(colorSpan);
    if (!o.reverseMode) content.appendChild(caret);
    root.appendChild(sr);
    root.appendChild(content);

    var cursor = null, blink = null, blinkAnim = null, blinkResume = null, lastPos = null;
    if (o.showCursor) {
      cursor = el("span", "text-type__cursor text-type__cursor--" + o.cursorStyle + (o.cursorClassName ? " " + o.cursorClassName : ""));
      cursor.setAttribute("aria-hidden", "true");
      if (o.cursorColor && o.cursorColor !== "currentColor") cursor.style.color = o.cursorColor;
      blink = el("span", "text-type__blink");
      if (o.cursorStyle === "character") {
        if (o.cursorCharacter && o.cursorCharacter.nodeType) blink.appendChild(o.cursorCharacter);
        else blink.textContent = o.cursorCharacter;
      } else {
        blink.appendChild(el("span", "text-type__shape"));
      }
      cursor.appendChild(blink);
      root.appendChild(cursor);
    }

    // ---- reduced motion ----
    if (window.matchMedia) {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      reduceMotion = mq.matches;
      mqHandler = function () { reduceMotion = mq.matches; startBlink(); };
      if (mq.addEventListener) mq.addEventListener("change", mqHandler);
    }

    // ---- blink (GSAP timeline -> WAAPI keyframes; one cycle = 2 x blink duration) ----
    function startBlink() {
      if (!blink) return;
      if (blinkAnim) { blinkAnim.cancel(); blinkAnim = null; }
      blink.style.opacity = "1";
      if (reduceMotion || o.cursorBlinkDuration <= 0 || !blink.animate) return;
      var ease = "cubic-bezier(0.37, 0, 0.63, 1)"; // sine.inOut
      blinkAnim = blink.animate(
        [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.35, easing: ease },
          { opacity: 0, offset: 0.575 },
          { opacity: 0, offset: 0.775, easing: ease },
          { opacity: 1, offset: 1 }
        ],
        { duration: o.cursorBlinkDuration * 2000, iterations: Infinity }
      );
    }

    // ---- cursor positioning (GSAP power3.out glide -> CSS transition) ----
    function placeCursor(instant) {
      if (!cursor) return;
      var x = caret.offsetLeft, y = caret.offsetTop;
      var last = lastPos;
      if (last && Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5) return;
      lastPos = { x: x, y: y };
      var jump = instant || !last || !o.cursorGlide || reduceMotion || Math.abs(last.y - y) > 1;
      cursor.style.transition = jump ? "opacity 0.2s ease" : "transform " + glideTime + "s cubic-bezier(0.215, 0.61, 0.355, 1), opacity 0.2s ease";
      cursor.style.transform = "translate(" + x + "px," + y + "px)";
      if (instant || !blink) return;
      // stay solid while moving, then resume blinking
      if (blinkAnim) { blinkAnim.cancel(); blinkAnim = null; }
      blink.style.transition = "opacity 0.12s ease-out";
      blink.style.opacity = "1";
      clearTimeout(blinkResume);
      blinkResume = setTimeout(function () { if (destroyed) return; blink.style.transition = ""; startBlink(); }, 120);
    }

    // ---- rendering ----
    var nodes = {};
    function animateChar(node) {
      var effect = EFFECTS[o.typeEffect];
      if (!effect || reduceMotion || typeof node.animate !== "function") return;
      node.animate(effect.keyframes, effect.options);
    }
    function getNode(key, ch) {
      var n = nodes[key];
      if (!n) {
        n = el("span", "text-type__char");
        n.textContent = ch;
        nodes[key] = n;
        animateChar(n);
      } else if (n.textContent !== ch) {
        n.textContent = ch;
      }
      return n;
    }

    function render() {
      var chars = charsFor(textIndex % textArray.length);
      var total = chars.length, shown = Math.min(count, total);
      var start = o.reverseMode ? total - shown : 0;
      var marked = Math.min(selected, shown);
      var correct = [], mistyped = [], keep = {}, i, key, n;

      for (i = 0; i < shown; i++) {
        key = "c" + (start + i);
        n = getNode(key, chars[start + i]);
        var isMarked = o.reverseMode ? i < marked : i >= shown - marked;
        n.classList.toggle("text-type__char--selected", isMarked);
        keep[key] = 1;
        correct.push(n);
      }
      var tail = typo ? typo.tail : [];
      for (i = 0; i < tail.length; i++) {
        key = "t" + i;
        n = getNode(key, tail[i]);
        n.classList.remove("text-type__char--selected");
        keep[key] = 1;
        mistyped.push(n);
      }
      if (o.reverseMode) mistyped.reverse();
      var desired = o.reverseMode ? mistyped.concat(correct) : correct.concat(mistyped);

      for (key in nodes) if (!keep[key]) delete nodes[key];
      // reconcile without moving untouched nodes (moving would interrupt their animations)
      for (i = 0; i < desired.length; i++) {
        if (colorSpan.childNodes[i] !== desired[i]) colorSpan.insertBefore(desired[i], colorSpan.childNodes[i] || null);
      }
      while (colorSpan.childNodes.length > desired.length) colorSpan.removeChild(colorSpan.lastChild);

      colorSpan.style.color = o.textColors.length ? o.textColors[(textIndex % textArray.length) % o.textColors.length] : "inherit";

      if (cursor) {
        var typing = shown < total || isDeleting || typo !== null;
        var hide = (o.hideCursorWhileTyping && typing) || (done && o.hideCursorOnComplete);
        cursor.classList.toggle("text-type__cursor--hidden", !!hide);
      }
      placeCursor(false);
      if (o.onUpdate) o.onUpdate();
    }

    // ---- state machine (mirrors the React effect) ----
    function speed() { return minSpeed + Math.random() * (maxSpeed - minSpeed); }
    function wait(ms, fn) {
      timer = setTimeout(function () { if (destroyed) return; fn(); render(); step(); }, ms);
    }
    function complete(index) {
      if (announced) return;
      announced = true;
      if (!o.loop && index === textArray.length - 1) { done = true; if (cursor && o.hideCursorOnComplete) cursor.classList.add("text-type__cursor--hidden"); }
      if (o.onTypingComplete) o.onTypingComplete(textArray[index], index);
    }

    function step() {
      clearTimeout(timer);
      if (destroyed || finished || !isVisible) return;

      var index = textIndex % textArray.length;
      var chars = charsFor(index), total = chars.length, shown = Math.min(count, total);

      if (!isDeleting) {
        if (typo) {
          if (reduceMotion) {
            wait(0, function () { typo = null; });
          } else if (!typo.fixing) {
            if (typo.tail.length < typo.plan.length) {
              wait(speed(), function () { typo = { plan: typo.plan, tail: typo.plan.slice(0, typo.tail.length + 1), fixing: false }; });
            } else {
              wait(260 + Math.random() * 320, function () { typo = { plan: typo.plan, tail: typo.tail, fixing: true }; });
            }
          } else if (typo.tail.length) {
            wait(Math.max(45, o.deletingSpeed), function () { typo = { plan: typo.plan, tail: typo.tail.slice(0, -1), fixing: true }; });
          } else {
            wait(90 + Math.random() * 140, function () { typo = null; });
          }
        } else if (shown < total) {
          var lead = shown === 0 ? o.initialDelay : 0;
          var next = o.reverseMode ? total - shown - 1 : shown;
          var wrong = o.mistakes > 0 && shown > 0 && lastTypo !== next ? typoFor(chars[next]) : null;

          if (reduceMotion) {
            wait(lead, function () { count = total; });
          } else if (wrong && Math.random() < Math.min(1, o.mistakes) * 0.16) {
            lastTypo = next;
            var plan = [wrong];
            var follow = chars[o.reverseMode ? next - 1 : next + 1];
            if (follow && follow.trim() && Math.random() < 0.4) plan.push(follow);
            wait(lead + speed(), function () { typo = { plan: plan, tail: [wrong], fixing: false }; });
          } else {
            wait(lead + speed(), function () { count = shown + 1; });
          }
        } else {
          complete(index);
          if (o.loop || index < textArray.length - 1) {
            wait(o.pauseDuration, function () { isDeleting = true; });
          }
        }
      } else if (shown > 0) {
        if (reduceMotion) {
          wait(0, function () { count = 0; });
        } else if (o.deleteMode === "select") {
          if (selected < shown) {
            wait(o.deletingSpeed, function () { selected = selected + 1; });
          } else {
            wait(Math.max(160, o.deletingSpeed * 8), function () { selected = 0; count = 0; });
          }
        } else {
          wait(o.deletingSpeed, function () { count = shown - 1; });
        }
      } else {
        if (o.onSentenceComplete) o.onSentenceComplete(textArray[index], index);
        lastTypo = -1;
        selected = 0;
        isDeleting = false;
        announced = false;
        textIndex = (index + 1) % textArray.length;
        render();
        step();
      }
    }

    // ---- lifecycle ----
    function begin() {
      isVisible = true;
      step();
    }

    if (resizeObs === null && typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(function () { placeCursor(true); });
      resizeObs.observe(root);
    }

    render();
    startBlink();

    if (o.startOnVisible && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        observer.disconnect();
        observer = null;
        begin();
      }, { threshold: 0.1 });
      observer.observe(root);
    } else {
      isVisible = true;
      step();
    }

    return {
      /* Jump to the fully typed last sentence and stop. */
      finish: function () {
        if (destroyed || finished) return;
        finished = true;
        clearTimeout(timer);
        if (observer) { observer.disconnect(); observer = null; }
        typo = null; selected = 0; isDeleting = false;
        count = charsFor(textIndex % textArray.length).length;
        render();
        complete(textIndex % textArray.length);
      },
      destroy: function () {
        destroyed = true;
        clearTimeout(timer);
        clearTimeout(blinkResume);
        if (observer) observer.disconnect();
        if (resizeObs) resizeObs.disconnect();
        if (blinkAnim) blinkAnim.cancel();
        if (mq && mq.removeEventListener) mq.removeEventListener("change", mqHandler);
        if (cursor && cursor.parentNode) cursor.parentNode.removeChild(cursor);
      }
    };
  }

  function create(target, opts) {
    var node = typeof target === "string" ? document.querySelector(target) : target;
    if (!node) return null;
    if (node.__textType) node.__textType.destroy();
    opts = opts || {};
    if (opts.text == null) opts.text = node.textContent.trim();
    node.__textType = TextType(node, opts);
    return node.__textType;
  }

  function autoInit() {
    var list = document.querySelectorAll("[data-text-type]");
    for (var i = 0; i < list.length; i++) {
      if (list[i].__textType) continue;
      var opts = {};
      try { opts = JSON.parse(list[i].getAttribute("data-text-type-options") || "{}"); } catch (e) {}
      create(list[i], opts);
    }
  }

  window.NovaTextType = create;
  window.NovaTextType.autoInit = autoInit;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoInit);
  else autoInit();
})();
