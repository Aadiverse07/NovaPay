/* Cross-module motion: view-enter restarts, KPI count-up, live report trend line, spotlight. */
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)"), NS = "http://www.w3.org/2000/svg";
  var ease = function (t) { return 1 - Math.pow(1 - t, 4); };

  function animateApprovalCard(card) {
    if (!card || reduce.matches || typeof card.animate !== "function") return;
    var queue = card.parentElement;
    var index = queue ? Array.prototype.indexOf.call(queue.children, card) : 0;
    var offset = Math.max(160, Math.min(window.innerWidth * 0.32, 460));
    var animation = card.animate([
      { opacity: 0, transform: "translate3d(" + offset + "px, 0, 0)" },
      { opacity: 1, transform: "translate3d(0, 0, 0)" }
    ], { duration: 560, delay: Math.min(Math.max(index, 0), 5) * 75, easing: "cubic-bezier(.2,.75,.3,1)", fill: "both" });
    animation.onfinish = function () { animation.cancel(); };
  }

  var approvalQueue = document.getElementById("approval-queue");
  if (approvalQueue && window.MutationObserver) {
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && node.matches(".approval-card")) animateApprovalCard(node);
        });
      });
    }).observe(approvalQueue, { childList: true });
  }

  /* The native selects remain the source of truth for the existing queue filters;
     these themed controls provide a consistent cross-browser menu surface. */
  document.querySelectorAll("#view-approvals .approval-filters select").forEach(function (select) {
    if (select.dataset.themedDropdown === "true") return;
    select.dataset.themedDropdown = "true";
    var wrapper = document.createElement("div");
    var trigger = document.createElement("button");
    var menu = document.createElement("div");
    var options = [];
    wrapper.className = "approval-select";
    trigger.type = "button";
    trigger.className = "approval-select__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", select.id + "-options");
    var label = Array.prototype.find.call(select.parentElement.childNodes, function (node) { return node.nodeType === 3 && node.textContent.trim(); });
    if (label) trigger.setAttribute("aria-label", label.textContent.trim());
    menu.id = select.id + "-options";
    menu.className = "approval-select__menu";
    menu.setAttribute("role", "listbox");

    Array.prototype.forEach.call(select.options, function (option) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "approval-select__option";
      item.setAttribute("role", "option");
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.tabIndex = -1;
      menu.appendChild(item);
      options.push(item);
      item.addEventListener("click", function () {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close();
        trigger.focus();
      });
    });

    function sync() {
      var selected = select.options[select.selectedIndex];
      trigger.textContent = (selected ? selected.textContent : "Select") + "  ▾";
      options.forEach(function (item) {
        item.setAttribute("aria-selected", String(item.dataset.value === select.value));
      });
    }
    function open() {
      wrapper.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      var active = options.find(function (item) { return item.dataset.value === select.value; }) || options[0];
      if (active) active.focus();
    }
    function close() {
      wrapper.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    }
    trigger.addEventListener("click", function () {
      if (wrapper.classList.contains("is-open")) close(); else open();
    });
    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
    menu.addEventListener("keydown", function (event) {
      var current = options.indexOf(document.activeElement), next = current;
      if (event.key === "ArrowDown") next = (current + 1) % options.length;
      else if (event.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "Escape") { event.preventDefault(); close(); trigger.focus(); return; }
      else if (event.key === "Tab") { close(); return; }
      else return;
      event.preventDefault();
      options[next].focus();
    });
    select.addEventListener("change", sync);
    select.hidden = true;
    select.classList.add("approval-select__native");
    select.insertAdjacentElement("afterend", wrapper);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    sync();
    document.addEventListener("pointerdown", function (event) { if (!wrapper.contains(event.target)) close(); });
  });

  /* FX currency choices use an in-page themed menu because native option popups
     ignore the dashboard surface colors in several desktop browsers. */
  document.querySelectorAll("#view-reports .fx-controls select").forEach(function (select) {
    if (select.dataset.themedDropdown === "true") return;
    select.dataset.themedDropdown = "true";
    var wrapper = document.createElement("div"), trigger = document.createElement("button"), menu = document.createElement("div"), arrow = document.createElement("span"), options = [];
    var label = select.parentElement;
    var labelText = label ? Array.prototype.find.call(label.childNodes, function (node) { return node.nodeType === 3 && node.textContent.trim(); }) : null;
    wrapper.className = "fx-select";
    trigger.type = "button";
    trigger.className = "fx-select__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", labelText ? labelText.textContent.trim() : "Choose currency");
    menu.className = "fx-select__menu";
    menu.id = select.id + "-options";
    menu.setAttribute("role", "listbox");
    trigger.setAttribute("aria-controls", menu.id);
    arrow.className = "fx-select__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "⌄";
    Array.prototype.forEach.call(select.options, function (option) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "fx-select__option";
      item.setAttribute("role", "option");
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.tabIndex = -1;
      menu.appendChild(item);
      options.push(item);
      item.addEventListener("click", function () {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close();
        trigger.focus();
      });
    });
    function sync() {
      var selected = select.options[select.selectedIndex];
      trigger.textContent = selected ? selected.textContent : "Select currency";
      trigger.appendChild(arrow);
      options.forEach(function (item) { item.setAttribute("aria-selected", String(item.dataset.value === select.value)); });
    }
    function close() { wrapper.classList.remove("is-open"); trigger.setAttribute("aria-expanded", "false"); }
    function open() {
      wrapper.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      var active = options.find(function (item) { return item.dataset.value === select.value; }) || options[0];
      if (active) active.focus();
    }
    trigger.addEventListener("click", function () { if (wrapper.classList.contains("is-open")) close(); else open(); });
    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
    menu.addEventListener("keydown", function (event) {
      var current = options.indexOf(document.activeElement), next = current;
      if (event.key === "ArrowDown") next = (current + 1) % options.length;
      else if (event.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "Escape") { event.preventDefault(); close(); trigger.focus(); return; }
      else if (event.key === "Tab") { close(); return; }
      else return;
      event.preventDefault();
      options[next].focus();
    });
    select.addEventListener("change", sync);
    select.hidden = true;
    select.classList.add("fx-select__native");
    select.insertAdjacentElement("afterend", wrapper);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    sync();
    document.addEventListener("pointerdown", function (event) { if (!wrapper.contains(event.target)) close(); });
  });

  document.querySelectorAll("#view-ledger #ledger-period").forEach(function (select) {
    if (select.dataset.themedDropdown === "true") return;
    select.dataset.themedDropdown = "true";
    var wrapper = document.createElement("div"), trigger = document.createElement("button"), menu = document.createElement("div"), arrow = document.createElement("span"), options = [];
    wrapper.className = "fx-select ledger-period-select";
    trigger.type = "button";
    trigger.className = "fx-select__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Ledger period");
    menu.className = "fx-select__menu";
    menu.id = "ledger-period-options";
    menu.setAttribute("role", "listbox");
    trigger.setAttribute("aria-controls", menu.id);
    arrow.className = "fx-select__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "⌄";
    Array.prototype.forEach.call(select.options, function (option) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "fx-select__option";
      item.setAttribute("role", "option");
      item.dataset.value = option.value;
      item.textContent = option.textContent;
      item.tabIndex = -1;
      menu.appendChild(item);
      options.push(item);
      item.addEventListener("click", function () {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close();
        trigger.focus();
      });
    });
    function sync() {
      var selected = select.options[select.selectedIndex];
      trigger.textContent = selected ? selected.textContent : "Select period";
      trigger.appendChild(arrow);
      options.forEach(function (item) { item.setAttribute("aria-selected", String(item.dataset.value === select.value)); });
    }
    function close() { wrapper.classList.remove("is-open"); trigger.setAttribute("aria-expanded", "false"); }
    function open() {
      wrapper.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      var active = options.find(function (item) { return item.dataset.value === select.value; }) || options[0];
      if (active) active.focus();
    }
    trigger.addEventListener("click", function () { if (wrapper.classList.contains("is-open")) close(); else open(); });
    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
    menu.addEventListener("keydown", function (event) {
      var current = options.indexOf(document.activeElement), next = current;
      if (event.key === "ArrowDown") next = (current + 1) % options.length;
      else if (event.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "Escape") { event.preventDefault(); close(); trigger.focus(); return; }
      else if (event.key === "Tab") { close(); return; }
      else return;
      event.preventDefault();
      options[next].focus();
    });
    select.addEventListener("change", sync);
    select.hidden = true;
    select.classList.add("fx-select__native");
    select.insertAdjacentElement("afterend", wrapper);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    sync();
    document.addEventListener("pointerdown", function (event) { if (!wrapper.contains(event.target)) close(); });
  });

  function countUp(el, ms) {
    if (!el || reduce.matches || el.dataset.mpBusy) return;
    var text = el.textContent, m = text.match(/\d[\d,]*(\.\d+)?/); if (!m) return;
    var target = parseFloat(m[0].replace(/,/g, "")), dec = m[1] ? m[1].length - 1 : 0;
    var pre = text.slice(0, m.index), post = text.slice(m.index + m[0].length), t0 = performance.now(); ms = ms || 1100;
    el.dataset.mpBusy = "1";
    (function tick(now) {
      var p = Math.min(1, (now - t0) / ms);
      el.textContent = pre + (target * ease(p)).toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post;
      if (p < 1) requestAnimationFrame(tick); else { el.textContent = text; delete el.dataset.mpBusy; }
    })(t0);
  }

  function enter(view) {
    view.classList.remove("mp-in"); void view.offsetWidth; view.classList.add("mp-in");
    if (view.id === "view-approvals") {
      if (window.NovaLive && typeof window.NovaLive.renderQueue === "function") window.NovaLive.renderQueue();
    }
    view.querySelectorAll(".spark-line").forEach(function (p) { p.setAttribute("pathLength", "1"); });
    if (view.id === "view-community-funds") return; /* keep campaign totals steady; no count-up flicker */
    view.querySelectorAll(".module-kpis strong, .report-summary-grid strong, .campaign-numbers b, .report-bars b, .kpi-card > strong").forEach(function (el, i) {
      setTimeout(function () { countUp(el, 1100); }, 120 + i * 90);
    });
  }

  document.querySelectorAll("[data-view-panel]").forEach(function (view) {
    new MutationObserver(function () { if (!view.hidden) enter(view); }).observe(view, { attributes: true, attributeFilter: ["hidden"] });
    if (!view.hidden) enter(view);
  });

  var period = document.getElementById("report-period");
  if (period) period.addEventListener("change", function () {
    var v = document.getElementById("view-reports"); if (v) enter(v);
  });

  /* Spotlight position on cards */
  var raf = 0;
  document.addEventListener("pointermove", function (e) {
    if (reduce.matches || raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var c = e.target.closest && e.target.closest(".dash-card, .campaign-card, .kpi-card"); if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  }, { passive: true });
})();
