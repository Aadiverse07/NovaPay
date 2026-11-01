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
    var queue = [], gesture = false, draining = false, muted = false, currentTask = null, currentUtterance = null, cancelledAt = 0;
    function debug(step, detail) {
      try { if (options.debug || options.storage?.getItem("novapay:voiceDebug") === "1") console.debug("[NovaPay voice]", step, detail || ""); } catch (_) {}
    }
    function cleanText(value) {
      var text = String(value || "").replace(/```[\s\S]*?```/g, " ").replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, " ")
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, " ")
        .replace(/[*_~#>]/g, " ").replace(/\s+/g, " ").trim();
      if (/^[\[{].*[\]}]$/.test(text) && /[":{}\[\]]/.test(text)) return "Done. I completed that request.";
      return text || "Done. I completed that request.";
    }
    function markGesture() { gesture = true; debug("user gesture", "speech enabled"); drain(); }
    doc?.addEventListener("pointerdown", markGesture, true);
    doc?.addEventListener("keydown", markGesture, true);
    function voicesReady() {
      if (!synthesis) return Promise.resolve([]);
      var initial = synthesis.getVoices?.() || [];
      if (initial.length) return Promise.resolve(initial);
      return new Promise(function (resolve) {
        var done = false, timer = setTimeout(finish, 1000);
        function finish() {
          if (done) return; done = true; clearTimeout(timer);
          synthesis.removeEventListener?.("voiceschanged", finish);
          resolve(synthesis.getVoices?.() || []);
        }
        synthesis.addEventListener?.("voiceschanged", finish, { once: true });
      });
    }
    function chooseVoice(voices) {
      return voices.find(function (voice) { return /^en-IN(?:-|$)/i.test(voice.lang || ""); }) ||
        voices.find(function (voice) { return /^en-GB(?:-|$)/i.test(voice.lang || ""); }) ||
        voices.find(function (voice) { return /^en-US(?:-|$)/i.test(voice.lang || ""); }) ||
        voices.find(function (voice) { return voice.default; }) || voices[0] || null;
    }
    function chunks(text) {
      var sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text], output = [], current = "";
      sentences.forEach(function (sentence) {
        sentence = sentence.trim();
        if (!sentence) return;
        if (sentence.length > 220) {
          sentence.split(/\s+/).forEach(function (word) {
            if (current && (current + " " + word).length > 220) { output.push(current); current = ""; }
            current = current ? current + " " + word : word;
          });
        } else if (current && (current + " " + sentence).length > 220) { output.push(current); current = sentence; }
        else current = current ? current + " " + sentence : sentence;
      });
      if (current) output.push(current);
      return output;
    }
    function speak(text) {
      var spoken = cleanText(text);
      debug("speak call", { textLength: spoken.length, muted: muted, userGesture: gesture });
      return new Promise(function (resolve) {
        if (muted) { resolve({ ok: false, error: "muted" }); return; }
        queue.push({ text: spoken, resolve: resolve, retries: 0 });
        drain();
      });
    }
    async function drain() {
      if (draining || !gesture || !queue.length) return;
      if (!synthesis || !Utterance) { while (queue.length) queue.shift().resolve({ ok: false, error: "unsupported" }); return; }
      draining = true;
      while (gesture && queue.length) {
        var task = queue.shift(), parts = chunks(task.text), voices = await voicesReady(), voice = chooseVoice(voices), failed = null; currentTask = task;
        debug("voice selection", { textLength: task.text.length, voicesCount: voices.length, chosenVoice: voice ? { name: voice.name || "", lang: voice.lang || "", default: Boolean(voice.default) } : "browser default" });
        for (var i = 0; i < parts.length; i += 1) {
          if (cancelledAt && Date.now() - cancelledAt < 50) await new Promise(function (resolve) { setTimeout(resolve, 50 - (Date.now() - cancelledAt)); });
          try {
            await new Promise(function (resolve) {
              var settled = false;
              function finish(error) { if (settled) return; settled = true; if (error) failed = error; resolve(); }
              var utterance = new Utterance(parts[i]); currentUtterance = utterance; utterance.lang = voice?.lang || "en-IN"; utterance.rate = 1;
              if (voice) utterance.voice = voice;
              utterance.onstart = function () { debug("utterance onstart", { chunk: i + 1, count: parts.length, textLength: parts[i].length }); };
              utterance.onend = function () { debug("utterance onend", { chunk: i + 1, count: parts.length }); finish(null); };
              utterance.onerror = function (event) { var code = String(event?.error || "unavailable"); debug("utterance onerror", { chunk: i + 1, count: parts.length, code: code }); finish(code); };
              try { synthesis.resume?.(); } catch (_) {}
              debug("utterance queued", { chunk: i + 1, count: parts.length, textLength: parts[i].length }); synthesis.speak(utterance);
            });
            if (failed) break;
          } catch (error) { failed = String(error?.name || "unavailable"); break; }
        }
        debug("speak complete", { ok: !failed, error: failed || null, chunks: parts.length });
        if (failed === "not-allowed" && task.retries < 1) {
          task.resolve({ ok: false, error: failed });
          queue.unshift({ text: task.text, resolve: function () {}, retries: 1 }); gesture = false;
        } else task.resolve({ ok: !failed, error: failed || null });
        currentTask = null; currentUtterance = null;
      }
      draining = false;
      if (gesture && queue.length) drain();
    }
    function cancel() {
      var active = currentTask; currentTask = null; currentUtterance = null; cancelledAt = Date.now();
      if (active) active.resolve({ ok: false, error: "interrupted" });
      while (queue.length) queue.shift().resolve({ ok: false, error: "interrupted" });
      try { if (synthesis && (active || synthesis.speaking || synthesis.pending)) synthesis.cancel?.(); } catch (_) {}
    }
    function setMuted(value) {
      muted = Boolean(value);
      if (muted) cancel();
      debug("mute state", muted ? "muted" : "unmuted");
    }
    return { speak: speak, markGesture: markGesture, cancel: cancel, setMuted: setMuted, pending: function () { return queue.length + (currentTask ? 1 : 0); } };
  }
  return { create: create };
}));
