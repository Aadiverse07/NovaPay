(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NovaPaySpeechOutput = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function create(options) {
    options = options || {};
    var synthesis = options.synthesis, Utterance = options.Utterance, doc = options.document;
    var queue = [], gesture = false, draining = false, currentTask = null, currentUtterance = null;
    function debug(step, detail) {
      try { if (options.debug || options.storage?.getItem("novapay:voiceDebug") === "1") console.debug("[NovaPay voice]", step, detail || ""); } catch (_) {}
    }
    function markGesture() { gesture = true; drain(); }
    doc?.addEventListener("pointerdown", markGesture, true);
    doc?.addEventListener("keydown", markGesture, true);
    function voicesReady() {
      if (!synthesis || synthesis.getVoices?.().length) return Promise.resolve(synthesis?.getVoices?.() || []);
      return new Promise(function (resolve) {
        var done = false, timer = setTimeout(finish, 500);
        function finish() {
          if (done) return; done = true; clearTimeout(timer);
          synthesis.removeEventListener?.("voiceschanged", finish);
          resolve(synthesis.getVoices?.() || []);
        }
        synthesis.addEventListener?.("voiceschanged", finish, { once: true });
      });
    }
    function chunks(text) {
      var output = [], current = "";
      String(text || "").split(/\s+/).filter(Boolean).forEach(function (word) {
        if (current && (current + " " + word).length > 220) { output.push(current); current = ""; }
        current = current ? current + " " + word : word;
      });
      if (current) output.push(current);
      return output;
    }
    function speak(text) {
      return new Promise(function (resolve) {
        queue.push({ text: String(text || "").slice(0, 1000), resolve: resolve, retries: 0 });
        drain();
      });
    }
    async function drain() {
      if (draining || !gesture || !queue.length) return;
      if (!synthesis || !Utterance) { while (queue.length) queue.shift().resolve({ ok: false, error: "unsupported" }); return; }
      draining = true;
      while (gesture && queue.length) {
        var task = queue.shift(), parts = chunks(task.text), voices = await voicesReady(), failed = null; currentTask = task;
        for (var i = 0; i < parts.length; i += 1) {
          try {
            await new Promise(function (resolve) {
              var utterance = new Utterance(parts[i]); currentUtterance = utterance; utterance.lang = "en-IN"; utterance.rate = 1;
              utterance.voice = voices.find(function (voice) { return /^en-IN$/i.test(voice.lang); }) || voices.find(function (voice) { return /^en-US$/i.test(voice.lang); }) || null;
              utterance.onend = resolve;
              utterance.onerror = function (event) { failed = String(event?.error || "unavailable"); resolve(); };
              debug("speak start", { chunk: i + 1, count: parts.length }); synthesis.speak(utterance);
            });
            if (failed) break;
          } catch (error) { failed = String(error?.name || "unavailable"); break; }
        }
        debug("speak end", failed || "ok");
        if (failed === "not-allowed" && task.retries < 1) {
          task.resolve({ ok: false, error: failed });
          queue.unshift({ text: task.text, resolve: function () {}, retries: 1 });
          gesture = false;
        } else task.resolve({ ok: !failed, error: failed });
        currentTask = null; currentUtterance = null;
      }
      draining = false;
      if (gesture && queue.length) drain();
    }
    function cancel() {
      var active = currentTask; currentTask = null; currentUtterance = null;
      if (active) active.resolve({ ok: false, error: "interrupted" });
      while (queue.length) queue.shift().resolve({ ok: false, error: "interrupted" });
      try { synthesis?.cancel?.(); } catch (_) {}
    }
    return { speak: speak, markGesture: markGesture, cancel: cancel, pending: function () { return queue.length + (currentTask ? 1 : 0); } };
  }
  return { create: create };
}));
