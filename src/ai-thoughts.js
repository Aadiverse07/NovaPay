/* NovaPay AI Assistant: "thinking" list shown while an answer is being prepared.
   Port of the React Bits "Animated List" (items scale 0.7 -> 1 + fade in, dark rounded cards, selected highlight).
   Steps appear slowly, one by one: Reading question, Searching all your data, Framing in your Language, Crafting your Answer.
   Usage: var t = NovaThoughts.create(container); ... t.complete(showAnswerFn); */
(function () {
  var STEPS = ["Reading question", "Searching all your data", "Framing in your Language", "Crafting your Answer"];
  var STEP_MS = 1500;   /* time each step stays selected while the answer is still being prepared */
  var FAST_MS = 800;    /* pace of the remaining steps once the answer is already ready */
  var HOLD_MS = 900;    /* pause on the last step before the answer replaces the list */
  var LEAVE_MS = 260;
  var CHECK = '<svg viewBox="0 0 16 16" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path class="ai-tick-path" d="M3.2 8.4l3 3 6.6-6.8"/></svg>';
  /* NovaPay dollar mark: ring + $ glyph, drawn with currentColor so it follows the theme */
  var DOLLAR = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.2"/><path d="M14.6 9.2c-.3-1-1.3-1.6-2.6-1.6-1.5 0-2.6.8-2.6 2 0 1.2 1 1.7 2.6 2.1 1.7.4 2.6.9 2.6 2.1 0 1.2-1.1 2-2.6 2-1.4 0-2.4-.7-2.7-1.7M12 6v1.6m0 8.8V18"/></svg>';

  function create(container) {
    var el = document.createElement("div");
    el.className = "scroll-list-container ai-thought";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    var heading = document.createElement("div");
    heading.className = "ai-thought-heading";
    var spinner = document.createElement("span");
    spinner.className = "ai-thought-spinner";
    spinner.setAttribute("aria-hidden", "true");
    spinner.innerHTML = DOLLAR;
    var title = document.createElement("strong");
    title.textContent = "Thinking";
    var dots = document.createElement("span");
    dots.className = "ai-thought-dots";
    dots.setAttribute("aria-hidden", "true");
    for (var d = 0; d < 4; d++) {
      var dot = document.createElement("i");
      dot.style.animationDelay = (d * 0.14) + "s";
      dots.appendChild(dot);
    }
    heading.appendChild(spinner);
    heading.appendChild(title);
    var timeEl = document.createElement("span");
    timeEl.className = "ai-thought-time";
    timeEl.textContent = "0.0s";
    heading.appendChild(dots);
    heading.appendChild(timeEl);
    var startedAt = Date.now();
    function fmt() { return (Math.max(0, Date.now() - startedAt) / 1000).toFixed(1) + "s"; }
    function paint() { timeEl.textContent = fmt(); }
    var clock = setInterval(function () {
      if (!el.isConnected) { clearInterval(clock); return; }
      paint();
    }, 100);
    function stopClock() { clearInterval(clock); paint(); timeEl.classList.add("is-done"); }
    el.appendChild(heading);
    var list = document.createElement("div");
    list.className = "scroll-list no-scrollbar";
    el.appendChild(list);
    container.appendChild(el);
    paint();

    var items = [], index = -1, timer = null, finished = false;

    function scroll() { container.scrollTop = container.scrollHeight; }
    function add(i) {
      var wrap = document.createElement("div");
      wrap.className = "animated-item";
      wrap.setAttribute("data-index", i);
      var card = document.createElement("div");
      card.className = "item";
      var mark = document.createElement("span");
      mark.className = "item-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.innerHTML = CHECK;
      var p = document.createElement("p");
      p.className = "item-text";
      p.textContent = STEPS[i];
      card.appendChild(mark);
      card.appendChild(p);
      wrap.appendChild(card);
      list.appendChild(wrap);
      items.push({ wrap: wrap, card: card, mark: mark });
      /* next frame so the scale/opacity transition plays */
      requestAnimationFrame(function () { requestAnimationFrame(function () { wrap.classList.add("is-in"); }); });
    }
    function select(i) {
      index = i;
      if (!items[i]) add(i);
      items.forEach(function (it, n) {
        it.card.classList.toggle("selected", n === i);
        it.card.classList.toggle("complete", n < i);
        it.card.classList.toggle("current", n === i);
      });
      scroll();
      setTimeout(scroll, 320);
    }
    function tick(delay) {
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (index < STEPS.length - 1) { select(index + 1); tick(finished ? FAST_MS : STEP_MS); }
      }, delay);
    }

    select(0);
    tick(STEP_MS);

    return {
      el: el,
      complete: function (done) {
        finished = true;
        clearTimeout(timer);
        (function step() {
          if (index < STEPS.length - 1) {
            select(index + 1);
            timer = setTimeout(step, FAST_MS);
          } else {
            stopClock();
            spinner.classList.add("is-done");
            var last = items[index];
            if (last) { last.card.classList.remove("current", "selected"); last.card.classList.add("complete"); }
            setTimeout(function () {
              el.classList.add("is-leaving");
              setTimeout(function () { el.remove(); done(); }, LEAVE_MS);
            }, HOLD_MS);
          }
        })();
      }
    };
  }

  window.NovaThoughts = { create: create, steps: STEPS };
})();
