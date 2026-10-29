/* Home page scroll zoom. The effect is tied to scroll position, so it reverses
   naturally when scrolling upward. It only targets sections on preview.html. */
(function () {
  "use strict";

  var motion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion && motion.matches) return;

  var sections = Array.prototype.slice.call(document.querySelectorAll(
    ".value-strip, .features-section, .pricing-band"
  ));
  if (!sections.length) return;

  var entries = sections.map(function (element) {
    return { element: element, children: Array.prototype.slice.call(element.children), top: 0, bottom: 0, last: "" };
  });
  var viewportHeight = window.innerHeight;
  var maxScroll = 0;
  var ticking = false;
  var disabled = false;

  function measure() {
    viewportHeight = window.innerHeight;
    maxScroll = Math.max(0, document.documentElement.scrollHeight - viewportHeight);
    entries.forEach(function (entry) {
      var top = 0;
      var node = entry.element;
      while (node) {
        top += node.offsetTop;
        node = node.offsetParent;
      }
      entry.top = top;
      entry.bottom = top + entry.element.offsetHeight;
      entry.last = "";
    });
  }

  function clear(entry) {
    entry.element.classList.remove("home-zoom-active");
    entry.element.style.transform = "";
    entry.element.style.opacity = "";
    entry.element.style.transformOrigin = "";
    entry.children.forEach(function (child) {
      child.style.transform = "";
      child.style.opacity = "";
      child.style.transformOrigin = "";
    });
  }

  function render() {
    ticking = false;
    var scrollY = window.scrollY;
    var width = window.innerWidth;
    var sectionStartScale = width < 700 ? 0.92 : width < 1100 ? 0.87 : 0.8;
    var childStartScale = width < 700 ? 0.7 : 0.55;

    entries.forEach(function (entry) {
      var relativeTop = entry.top - scrollY;
      var start = viewportHeight * 0.95;
      var end = Math.max(viewportHeight * 0.15, entry.top - maxScroll + 2);
      if (end > start - viewportHeight * 0.25) start = Math.min(viewportHeight, end + viewportHeight * 0.25);
      var incoming = Math.min(1, Math.max(0, (start - relativeTop) / (start - end)));
      incoming = incoming * incoming * (3 - 2 * incoming);

      var relativeBottom = entry.bottom - scrollY;
      var bottomAtPageEnd = entry.bottom - maxScroll;
      var outStart = bottomAtPageEnd > 0 ? Math.min(viewportHeight * 0.45, bottomAtPageEnd - 2) : viewportHeight * 0.45;
      var outEnd = Math.min(-viewportHeight * 0.05, outStart - viewportHeight * 0.3);
      var outgoing = Math.min(1, Math.max(0, (outStart - relativeBottom) / (outStart - outEnd)));
      outgoing = 1 - outgoing * outgoing * (3 - 2 * outgoing);

      var key = incoming.toFixed(4) + "|" + outgoing.toFixed(4);
      if (key === entry.last) return;
      entry.last = key;
      if (incoming >= 0.999 && outgoing >= 0.999) {
        clear(entry);
        return;
      }

      var progress = Math.min(incoming, outgoing);
      entry.element.classList.add("home-zoom-active");
      entry.element.style.transformOrigin = outgoing < incoming ? "50% 85%" : "";
      entry.element.style.transform = "scale(" + (sectionStartScale + (1 - sectionStartScale) * progress).toFixed(4) + ")";
      entry.element.style.opacity = (0.3 + 0.7 * progress).toFixed(3);

      var count = entry.children.length;
      var stagger = Math.min(0.08, 0.4 / count);
      entry.children.forEach(function (child, index) {
        var childIn = Math.min(1, Math.max(0, (incoming - index * stagger) / (1 - (count - 1) * stagger)));
        childIn = 1 - Math.pow(1 - childIn, 2);
        var childOut = Math.min(1, Math.max(0, (outgoing - (count - 1 - index) * stagger) / (1 - (count - 1) * stagger)));
        childOut = 1 - Math.pow(1 - childOut, 2);
        var childProgress = Math.min(childIn, childOut);
        child.style.transformOrigin = "50% 50%";
        child.style.transform = "scale(" + (childStartScale + (1 - childStartScale) * childProgress).toFixed(4) + ")";
        child.style.opacity = childProgress.toFixed(3);
      });
    });
  }

  function scheduleRender() {
    if (!ticking && !disabled) {
      ticking = true;
      window.requestAnimationFrame(render);
    }
  }

  function refresh() {
    measure();
    scheduleRender();
  }

  window.addEventListener("scroll", scheduleRender, { passive: true });
  window.addEventListener("resize", refresh);
  window.addEventListener("load", refresh);
  if (window.ResizeObserver) new ResizeObserver(refresh).observe(document.body);
  if (motion && motion.addEventListener) motion.addEventListener("change", function () {
    if (motion.matches) {
      disabled = true;
      entries.forEach(clear);
    }
  });
  refresh();
})();
