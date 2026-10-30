/* NovaPay date picker — replaces the browser-native <input type="date"> with the
   same calendar look + motion as the top-bar calendar on the dashboard.
   Opt in with:  <input type="date" data-datepicker>
   Optional:     data-dp-min-input="<id>"  /  data-dp-max-input="<id>"  (range linking)
   The original input stays in the DOM (hidden) and keeps holding the ISO value
   (yyyy-mm-dd), so existing code that reads/sets `.value` or listens for
   "change" keeps working unchanged. */
(function () {
  "use strict";

  var DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3.5 10h17"/></svg>';
  var valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  var open = null; /* the picker currently showing */

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  /* local-time ISO (toISOString would shift the day in non-UTC zones) */
  function toISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fromISO(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }
  function fmt(s) { var d = fromISO(s); return d ? pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() : ""; }
  function reduced() {
    return document.documentElement.classList.contains("reduce-motion") ||
      (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function create(input) {
    if (input.dataset.dpReady) return;
    input.dataset.dpReady = "1";

    var label = input.getAttribute("aria-label") || "Choose date";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dp-trigger";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", label);
    btn.innerHTML = '<span class="dp-text"></span><span class="dp-ico">' + ICON + "</span>";
    var text = btn.firstChild;

    /* trigger goes BEFORE the input so a wrapping <label> activates it */
    input.parentNode.insertBefore(btn, input);
    input.classList.add("dp-native");
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");

    function sync() {
      var v = valueDesc.get.call(input);
      text.textContent = v ? fmt(v) : "dd/mm/yyyy";
      btn.classList.toggle("is-empty", !v);
    }
    /* keep the trigger in step when other code assigns input.value (e.g. "Reset filters") */
    Object.defineProperty(input, "value", {
      configurable: true,
      get: function () { return valueDesc.get.call(input); },
      set: function (v) { valueDesc.set.call(input, v); sync(); }
    });
    sync();

    var pop = null, view = null, dayBtns = [];

    function limit(attr) {
      var id = input.dataset[attr];
      var el = id && document.getElementById(id);
      return el ? fromISO(valueDesc.get.call(el)) : null;
    }

    function build() {
      pop = document.createElement("div");
      pop.className = "popover dp-popover";
      pop.setAttribute("role", "dialog");
      pop.setAttribute("aria-label", label);
      pop.innerHTML =
        '<div class="cal-head"><button type="button" class="cal-nav" data-dp="prev" aria-label="Previous month">\u2039</button><b class="dp-title" aria-live="polite"></b><button type="button" class="cal-nav" data-dp="next" aria-label="Next month">\u203A</button></div>' +
        '<div class="cal-grid cal-dow" aria-hidden="true">' + DOW.map(function (d) { return "<span>" + d + "</span>"; }).join("") + "</div>" +
        '<div class="cal-grid dp-days"></div>' +
        '<div class="dp-foot"><button type="button" class="dp-link" data-dp="clear">Clear</button><button type="button" class="dp-link" data-dp="today">Today</button></div>';
      document.body.appendChild(pop);

      pop.addEventListener("click", function (e) {
        e.stopPropagation();
        var b = e.target.closest("button");
        if (!b || !pop.contains(b)) return;
        var act = b.dataset.dp;
        if (act === "prev") { view.setMonth(view.getMonth() - 1); render(); }
        else if (act === "next") { view.setMonth(view.getMonth() + 1); render(); }
        else if (act === "clear") { choose(""); }
        else if (act === "today") { choose(toISO(new Date())); }
        else if (b.dataset.date) { choose(b.dataset.date); }
      });
      pop.addEventListener("keydown", onKey);
    }

    function render() {
      var title = pop.querySelector(".dp-title"), days = pop.querySelector(".dp-days");
      var today = new Date(), sel = fromISO(valueDesc.get.call(input));
      var min = limit("dpMinInput"), max = limit("dpMaxInput");
      var y = view.getFullYear(), m = view.getMonth();
      var first = new Date(y, m, 1).getDay(), count = new Date(y, m + 1, 0).getDate(), html = "", i;
      title.textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(view);
      for (i = 0; i < first; i++) html += '<span class="cal-empty"></span>';
      for (i = 1; i <= count; i++) {
        var d = new Date(y, m, i), iso = toISO(d);
        var isToday = i === today.getDate() && m === today.getMonth() && y === today.getFullYear();
        var isSel = !!sel && sel.getTime() === d.getTime();
        var off = (min && d < min) || (max && d > max);
        html += '<button type="button" class="cal-day dp-day' + (isToday ? " is-today-ring" : "") + (isSel ? " is-selected" : "") + '"' +
          ' style="--i:' + (first + i - 1) + '" data-date="' + iso + '"' +
          (isToday ? ' aria-current="date"' : "") + (isSel ? ' aria-pressed="true"' : "") + (off ? " disabled" : "") + ">" + i + "</button>";
      }
      days.innerHTML = html;
      dayBtns = Array.prototype.slice.call(days.querySelectorAll(".dp-day"));
    }

    function place() {
      if (!pop) return;
      var r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, gap = 9;
      var left = Math.max(10, Math.min(r.left, window.innerWidth - w - 10));
      var top = r.bottom + gap;
      var flip = top + h > window.innerHeight - 10 && r.top - gap - h > 10;
      if (flip) top = r.top - gap - h;
      pop.style.left = left + "px";
      pop.style.top = top + "px";
      pop.style.transformOrigin = (flip ? "bottom " : "top ") + Math.max(16, Math.min(r.left + r.width / 2 - left, w - 16)) + "px";
    }

    function choose(iso) {
      if (iso !== valueDesc.get.call(input)) {
        input.value = iso; /* setter -> sync() */
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      close(true);
    }

    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); close(true); return; }
      var cur = dayBtns.indexOf(document.activeElement);
      var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (cur < 0 || !step) return;
      e.preventDefault();
      var next = dayBtns[cur + step];
      if (next && !next.disabled) next.focus();
    }

    function show() {
      if (open && open !== api) open.close();
      if (!pop) build();
      var cur = fromISO(valueDesc.get.call(input)) || new Date();
      view = new Date(cur.getFullYear(), cur.getMonth(), 1);
      render();
      pop.hidden = false;
      /* restart the spring-open animation each time */
      pop.classList.remove("is-open"); void pop.offsetWidth; pop.classList.add("is-open");
      pop.style.visibility = "hidden"; place(); pop.style.visibility = "";
      btn.setAttribute("aria-expanded", "true");
      open = api;
      var target = pop.querySelector(".dp-day.is-selected") || pop.querySelector(".dp-day.is-today-ring") || pop.querySelector(".dp-day:not(:disabled)");
      if (target) target.focus({ preventScroll: true });
    }

    function close(refocus) {
      if (!pop || pop.hidden) return;
      pop.hidden = true;
      pop.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
      if (open === api) open = null;
      if (refocus) btn.focus({ preventScroll: true });
    }

    var api = { btn: btn, pop: function () { return pop; }, close: close, place: place };
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (pop && !pop.hidden) close(); else show();
    });
  }

  function init(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('input[type="date"][data-datepicker]'), create);
  }

  /* outside click / reposition / resize */
  document.addEventListener("click", function (e) {
    if (!open) return;
    var p = open.pop();
    if ((p && p.contains(e.target)) || open.btn.contains(e.target)) return;
    open.close();
  });
  window.addEventListener("resize", function () { if (open) open.place(); });
  window.addEventListener("scroll", function () { if (open) open.place(); }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(); });
  else init();
  window.NovaPayDatePicker = { init: init };
})();
