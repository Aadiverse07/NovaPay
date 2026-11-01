/* Safe API contract helpers for the dashboard assistant. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NovaPayAssistantClient = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  var ROUTES = { code: "Code", sql: "Database", ocr: "OCR", retrieval: "Retrieval", llm: "LLM" };
  function normalize(payload) {
    payload = payload && typeof payload === "object" ? payload : {};
    var reply = typeof payload.answer === "string" ? payload.answer : payload.reply;
    if (typeof reply !== "string" || !reply.trim()) throw Object.assign(new Error("The assistant returned no answer."), { code: "AI_EMPTY_RESPONSE" });
    return {
      reply: reply.trim(), route: Object.prototype.hasOwnProperty.call(ROUTES, payload.route) ? payload.route : "llm",
      reason: typeof payload.reason === "string" ? payload.reason : "", evidence: Array.isArray(payload.citations) ? payload.citations : Array.isArray(payload.evidence) ? payload.evidence : [],
      proposal: payload.proposal || null, insufficientEvidence: Boolean(payload.insufficient_evidence || payload.insufficientEvidence),
      limited: Boolean(payload.limited), unavailable: Boolean(payload.unavailable), usage: payload.usage || null,
    };
  }
  function errorMessage(error) {
    var code = String(error && error.code || "");
    var status = Number(error && error.status || 0);
    if (status === 401 || code === "AUTH_REQUIRED") return "Your session expired. Sign in again to continue.";
    if (status === 429 || /AI_(?:DAILY|USER_DAILY|ORG_DAILY)_LIMIT/.test(code)) return "The AI daily request limit has been reached. Try again after the daily reset.";
    if (code === "API_UNAVAILABLE" || code === "AI_OFFLINE" || (!status && !code)) return "NovaPay is offline. Check your connection and try again.";
    if (status >= 500 || /AI_TEMPORARILY_UNAVAILABLE|AI_PROVIDER/.test(code)) return "The AI provider is temporarily unavailable. Please try again later.";
    if (status === 403) return "Your organization does not allow this assistant request.";
    return error && error.message ? error.message : "The assistant request could not be completed.";
  }
  function canUseDemoFallback(auth, session) { return Boolean(auth && auth.mode === "demo" && !session); }
  async function send(api, message) {
    var payload = await api.request("/api/ai/chat", { method: "POST", body: { message: String(message || "").slice(0, 1000) } });
    return normalize(payload);
  }
  return { routeLabels: ROUTES, normalize: normalize, errorMessage: errorMessage, canUseDemoFallback: canUseDemoFallback, send: send };
}));
