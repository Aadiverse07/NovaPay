/* Per-tab conversation history, isolated by organization and signed-in user. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NovaPayAssistantConversation = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  var MAX_TURNS = 20, MAX_TEXT = 800;
  function redact(value) {
    return String(value || "").slice(0, MAX_TEXT)
      .replace(/\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+\b/gi, "[email]")
      .replace(/\b(?:bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
      .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted token]")
      .replace(/\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|token)\s*[:=]\s*[^\s,;]+/gi, "[redacted]")
      .replace(/\b(?:\d[ -]*?){8,19}\b/g, "[redacted number]")
      .replace(/\+?\d[\d ().-]{7,}\d/g, "[redacted phone]");
  }
  function createConversationStore(storage) {
    if (!storage) { try { if (typeof sessionStorage !== "undefined") storage = sessionStorage; } catch (_) { storage = null; } }
    var scope = "", turns = [];
    function key(value) { return "novapay:assistant:conversation:" + value; }
    function load(nextScope) {
      var priorScope = scope; scope = String(nextScope || ""); turns = [];
      if (priorScope && priorScope !== scope && storage) { try { storage.removeItem(key(priorScope)); } catch (_) {} }
      if (!scope || !storage) return turns;
      try { var parsed = JSON.parse(storage.getItem(key(scope)) || "[]"); if (Array.isArray(parsed)) turns = parsed.filter(function (turn) { return turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string"; }).slice(-MAX_TURNS).map(function (turn) { return { role: turn.role, text: redact(turn.text) }; }); } catch (_) { turns = []; }
      return turns.slice();
    }
    function append(role, text) {
      if (!scope || !storage || (role !== "user" && role !== "assistant")) return turns.slice();
      var value = redact(text).trim(); if (!value) return turns.slice();
      turns.push({ role: role, text: value }); turns = turns.slice(-MAX_TURNS);
      try { storage.setItem(key(scope), JSON.stringify(turns)); } catch (_) {}
      return turns.slice();
    }
    function replace(nextTurns) {
      turns = (Array.isArray(nextTurns) ? nextTurns : []).filter(function (turn) { return turn && (turn.role === "user" || turn.role === "assistant"); }).slice(-MAX_TURNS).map(function (turn) { return { role: turn.role, text: redact(turn.text).trim() }; }).filter(function (turn) { return turn.text; });
      if (scope && storage) { try { storage.setItem(key(scope), JSON.stringify(turns)); } catch (_) {} }
      return turns.slice();
    }
    function clear() { if (scope && storage) { try { storage.removeItem(key(scope)); } catch (_) {} } turns = []; }
    return { load: load, append: append, replace: replace, clear: clear, turns: function () { return turns.slice(); } };
  }
  return { create: createConversationStore, redact: redact, maxTurns: MAX_TURNS, maxText: MAX_TEXT };
}));
