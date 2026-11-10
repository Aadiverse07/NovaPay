/* Safe API contract helpers for the dashboard assistant. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NovaPayAssistantClient = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  var ROUTES = { code: "Code", sql: "Database", ocr: "OCR", retrieval: "Retrieval", llm: "LLM" };
  var QUICK_VIEWS = { ledger: "ledger", invoices: "invoices", approvals: "approvals", transactions: "transactions", reports: "reports", documents: "documents", dashboard: "dashboard" };
  function parseQuickCommand(message) {
    var text = String(message || "").toLocaleLowerCase("en-US").replace(/[’‘]/g, "'").trim();
    var nav = text.match(/^(?:please\s+)?(?:open|go to|navigate to|switch to|take me to|show)(?:\s+the)?\s+(.+?)[.! ]*$/);
    if (nav && QUICK_VIEWS[nav[1].trim()]) {
      var view = QUICK_VIEWS[nav[1].trim()];
      return { action: { id: "nav.open", tier: 0, args: { view: view } }, reply: "Opening " + (view[0].toUpperCase() + view.slice(1)) + ".", speak: true };
    }
    if (/^(?:stop|stop speaking|cancel|be quiet|quiet)[.! ]*$/.test(text)) return { action: { id: "assistant.stopSpeaking", tier: 0, args: {} }, reply: "Okay, I stopped speaking.", speak: false };
    if (/^(?:repeat|say that again|again)[.! ]*$/.test(text)) return { action: { id: "assistant.repeat", tier: 0, args: {} }, reply: "I will repeat my previous answer.", speak: false };
    if (/^(?:help|what can you do\??|capabilities\??)[.! ]*$/.test(text)) return { action: { id: "assistant.help", tier: 0, args: {} }, reply: "I can open NovaPay modules, answer organization questions, and guide you through supported reviews.", speak: true };
    return null;
  }
  function normalize(payload) {
    payload = payload && typeof payload === "object" ? payload : {};
    var reply = typeof payload.answer === "string" ? payload.answer : payload.reply;
    if (typeof reply !== "string" || !reply.trim()) throw Object.assign(new Error("The assistant returned no answer."), { code: "AI_EMPTY_RESPONSE" });
    return {
      reply: reply.trim(), route: Object.prototype.hasOwnProperty.call(ROUTES, payload.route) ? payload.route : "llm",
      reason: typeof payload.reason === "string" ? payload.reason : "", evidence: Array.isArray(payload.citations) ? payload.citations : Array.isArray(payload.evidence) ? payload.evidence : [],
      proposal: payload.proposal || null, insufficientEvidence: Boolean(payload.insufficient_evidence || payload.insufficientEvidence),
      mode: typeof payload.mode === "string" ? payload.mode.slice(0, 100) : "",
      speak: typeof payload.speak === "string" ? payload.speak.slice(0, 300) : "",
      actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 5) : [],
      limited: Boolean(payload.limited), unavailable: Boolean(payload.unavailable), usage: payload.usage || null,
    };
  }
  function errorMessage(error) {
    var code = String(error && error.code || "");
    var status = Number(error && error.status || 0);
    if (status === 401 || code === "AUTH_REQUIRED") return "Your session expired. Sign in again to continue.";
    if (code === "AI_TRANSCRIPTION_RATE_LIMITED") return "Voice transcription is rate-limited. Wait 15 minutes or type your question.";
    if (status === 429 || /AI_(?:DAILY|USER_DAILY|ORG_DAILY)_LIMIT/.test(code)) return "The AI daily request limit has been reached. Try again after the daily reset.";
    if (code === "API_UNAVAILABLE" || code === "AI_OFFLINE" || (!status && !code)) return "NovaPay is offline. Check your connection and try again.";
    if (status >= 500 || /AI_TEMPORARILY_UNAVAILABLE|AI_PROVIDER/.test(code)) return "The AI provider is temporarily unavailable. Please try again later.";
    if (status === 403) return "Your organization does not allow this assistant request.";
    return error && error.message ? error.message : "The assistant request could not be completed.";
  }
  function canUseDemoFallback(auth, session) { return Boolean(auth && auth.mode === "demo" && !session); }
  async function send(api, message, metadata) {
    metadata = metadata || {};
    var body = { message: String(message || "").slice(0, 1000) };
    if (metadata.context && typeof metadata.context === "object") body.context = {
      ...(typeof metadata.context.view === "string" ? { view: metadata.context.view.slice(0, 40) } : {}),
      ...(typeof metadata.context.selection === "string" ? { selection: metadata.context.selection.slice(0, 150) } : {}),
      ...(Array.isArray(metadata.context.selectedTransactionIds) ? { selectedTransactionIds: metadata.context.selectedTransactionIds.filter(function (id) { return typeof id === "string"; }).slice(0, 10).map(function (id) { return id.slice(0, 150); }) } : {}),
      ...(Array.isArray(metadata.context.filteredTransactionIds) ? { filteredTransactionIds: metadata.context.filteredTransactionIds.filter(function (id) { return typeof id === "string"; }).slice(0, 10).map(function (id) { return id.slice(0, 150); }) } : {}),
    };
    if (metadata.interrupted && typeof metadata.interrupted === "object") body.interrupted = {
      previousReply: String(metadata.interrupted.previousReply || "").slice(0, 1000),
      spokenChars: Math.max(0, Math.min(2000, Number(metadata.interrupted.spokenChars) || 0)),
    };
    if (Array.isArray(metadata.history)) body.history = metadata.history.slice(-10).map(function (turn) {
      return { role: turn && turn.role === "assistant" ? "assistant" : "user", text: String(turn && turn.text || "").slice(0, 800) };
    });
    var payload = await api.request("/api/ai/chat", { method: "POST", body: body });
    return normalize(payload);
  }
  async function transcribe(api, blob) {
    if (!blob || !blob.size) throw Object.assign(new Error('No speech was recorded.'), { code: 'AI_AUDIO_INVALID' });
    var mimeType = String(blob.type || 'audio/webm').split(';')[0];
    var result = await api.request('/api/ai/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Audio-Mime-Type': mimeType }, body: blob });
    var transcript = String(result && result.transcript || '').trim().slice(0, 1000);
    if (!transcript) throw Object.assign(new Error('No words were recognized.'), { code: 'AI_EMPTY_TRANSCRIPT' });
    return transcript;
  }
  async function transcribeAndHandle(api, blob, handleQuery, onTranscript) {
    var transcript = await transcribe(api, blob);
    if (onTranscript) onTranscript(transcript);
    return handleQuery(transcript, { source: 'push-to-talk', speak: true });
  }
  return { routeLabels: ROUTES, normalize: normalize, errorMessage: errorMessage, canUseDemoFallback: canUseDemoFallback, parseQuickCommand: parseQuickCommand, send: send, transcribe: transcribe, transcribeAndHandle: transcribeAndHandle };
}));
