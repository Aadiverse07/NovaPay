const UNSUPPORTED_SPEECH_MESSAGE = "Voice recognition isn't available in this browser (Brave blocks it). Use Chrome/Edge, or type or hold the mic button.";

export function createVoiceController(options = {}) {
  const Recognition = options.Recognition, speechOutput = options.speechOutput;
  const onQuery = options.onQuery || (async () => ({})), onState = options.onState || (() => {});
  const onTranscript = options.onTranscript || (() => {}), setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;
  let recognizer = null, recognizerActive = false, enabled = false, destroyed = false, state = "idle";
  let pendingText = "", silenceTimer = null, thinkingTimer = null, turnId = 0, muted = Boolean(options.muted);
  let lastReply = "", pendingConfirmation = null, confirmationTimer = null;
  const debugEnabled = () => { try { return options.debug === true || (options.debug !== false && globalThis.localStorage?.getItem("novapay:voiceDebug") === "1"); } catch (_) { return false; } };
  const debug = (step, detail) => { if (debugEnabled()) console.debug("[NovaPay voice]", step, detail || ""); };
  const setState = (next, message, problem) => { state = next; onState({ state: next, message: message || next, enabled, problem: Boolean(problem) }); };
  const clearSilence = () => { if (silenceTimer) clearTimer(silenceTimer); silenceTimer = null; };
  const clearThinking = () => { if (thinkingTimer) clearTimer(thinkingTimer); thinkingTimer = null; };
  const releaseRecognizer = () => { if (recognizer && recognizerActive) { recognizerActive = false; try { recognizer.stop(); } catch (_) {} } };

  function getRecognizer() {
    if (recognizer || !Recognition) return recognizer;
    recognizer = new Recognition();
    recognizer.lang = "en-IN"; recognizer.continuous = false; recognizer.interimResults = true;
    recognizer.onstart = () => { if (!enabled || destroyed) { try { recognizer.stop(); } catch (_) {} return; } recognizerActive = true; debug("recognizer start"); setState("listening", "Listening…"); };
    recognizer.onresult = handleResult;
    recognizer.onerror = (event) => {
      const code = String(event?.error || "unknown"); debug("recognizer error", code);
      clearSilence(); releaseRecognizer(); enabled = false;
      if (code === "network" || code === "service-not-allowed") {
        if (typeof window !== "undefined") window.NovaPayVoiceFallbackOnly = true;
        finishListening(UNSUPPORTED_SPEECH_MESSAGE, true); return;
      }
      if (code === "not-allowed") { finishListening("Microphone permission is blocked. Allow microphone access in browser site settings, then tap the mic.", true); return; }
      if (code === "no-speech" || code === "aborted") { finishListening("No speech was detected. Tap the mic and try again."); return; }
      finishListening(code === "audio-capture" ? "No working microphone was found. Check your microphone and try again." : "Voice input stopped. Type your question or tap the mic to retry.", true);
    };
    recognizer.onend = () => {
      recognizerActive = false;
      if (destroyed || !enabled || state !== "listening") return;
      if (pendingText) {
        if (!silenceTimer) silenceTimer = setTimer(() => { silenceTimer = null; submitTranscript(pendingText); }, 1200);
      } else finishListening("No speech was detected. Tap the mic and try again.");
    };
    return recognizer;
  }
  function handleResult(event) {
    if (!enabled || destroyed || state !== "listening") return;
    const parts = [], hasFinal = [];
    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i], text = String(result?.[0]?.transcript || "").trim();
      if (!text) continue;
      parts.push(text);
      if (result.isFinal) hasFinal.push(text);
    }
    const full = parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 1000);
    if (!full) return;
    pendingText = full; onTranscript(full, hasFinal.length ? "final" : "interim");
    debug("transcript", { kind: hasFinal.length ? "final" : "interim", text: full });
    clearSilence();
    if (hasFinal.length) { submitTranscript(full); return; }
    silenceTimer = setTimer(() => { silenceTimer = null; submitTranscript(pendingText); }, 1200);
  }
  function finishListening(message, problem) {
    clearSilence(); releaseRecognizer(); enabled = false; pendingText = "";
    setState("idle", message || "Tap the mic to speak.", problem);
  }
  function submitTranscript(text) {
    if (state !== "listening") return;
    clearSilence();
    const query = String(text || "").trim().slice(0, 1000); pendingText = "";
    if (!query) { finishListening("No speech was detected. Tap the mic and try again."); return; }
    if (pendingConfirmation && /^(?:yes|confirm|confirmed|no|cancel)$/i.test(query)) {
      if (/^(?:yes|confirm|confirmed)$/i.test(query)) confirmPending(); else cancelPendingConfirmation();
      finishTurn("Done."); return;
    }
    debug("query sent", query);
    const request = ++turnId; setState("thinking", "Thinking…"); releaseRecognizer();
    thinkingTimer = setTimer(() => {
      if (request !== turnId || state !== "thinking") return;
      thinkingTimer = null; turnId += 1; enabled = false;
      const message = "I’m taking too long to respond. Please try again, or type your question.";
      lastReply = message; setState("speaking", message); speak(message, turnId);
    }, 15000);
    Promise.resolve().then(() => onQuery(query, { source: "voice", speak: false })).then((response) => {
      if (request !== turnId || destroyed) return;
      clearThinking();
      debug("response received", { route: response?.route || "unknown", error: Boolean(response?.error) });
      if (response?.actions?.length) debug("actions parsed", response.actions.map((item) => item.id));
      const answer = String(response?.reply || response?.answer || "").trim() || "I could not complete that request. Please try again or type your question.";
      lastReply = answer; speak(String(response?.speak || answer).slice(0, 1000), request);
    }).catch((error) => {
      if (request !== turnId || destroyed) return;
      clearThinking();
      const message = "My AI service is busy right now. I can still open modules and run quick commands. " + String(error?.voiceMessage || error?.message || "The assistant request could not be completed.");
      lastReply = message; speak(message, request);
    });
  }
  function finishTurn(message) {
    clearThinking(); clearSilence(); releaseRecognizer(); enabled = false; pendingText = "";
    setState("idle", message || "Tap the mic to speak.");
  }
  function speak(text, request) {
    const spoken = String(text || "").trim();
    if (!spoken || muted || !speechOutput?.speak) { finishTurn(spoken || "Answer is shown in the chat."); return Promise.resolve({ ok: Boolean(spoken), error: muted ? "muted" : "unavailable" }); }
    setState("speaking", "Speaking…"); debug("speak start");
    return Promise.resolve(speechOutput.speak(spoken)).then((result) => {
      debug("speak end", result?.error || "ok");
      if (request === turnId && !destroyed) finishTurn(result?.ok ? "Tap the mic to speak." : "Answer is shown in the chat. Speech playback failed (" + String(result?.error || "unavailable") + "). Tap the mic to try voice again.");
      return result;
    }).catch((error) => {
      if (request === turnId && !destroyed) finishTurn("Answer is shown in the chat. Speech playback failed (" + String(error?.name || "unavailable") + ").");
      return { ok: false, error: String(error?.name || "unavailable") };
    });
  }
  function start() {
    if (destroyed || state === "listening") return false;
    if (state === "speaking" || state === "thinking") {
      ++turnId; clearThinking(); speechOutput?.cancel?.(); enabled = false; releaseRecognizer();
    }
    clearThinking(); clearSilence();
    if (!Recognition) { enabled = false; setState("idle", UNSUPPORTED_SPEECH_MESSAGE, true); return false; }
    enabled = true; pendingText = ""; ++turnId; setState("listening", "Listening…");
    const instance = getRecognizer();
    if (recognizerActive) return false;
    recognizerActive = true;
    try { instance.start(); return true; }
    catch (_) { recognizerActive = false; enabled = false; finishListening("Voice could not start. Tap the mic to retry or type your question.", true); return false; }
  }
  function toggle() { if (state === "listening") { stop(); return false; } return start(); }
  function stop() {
    ++turnId; clearThinking(); clearSilence(); enabled = false; pendingText = "";
    speechOutput?.cancel?.(); releaseRecognizer(); setState("idle", "Tap the mic to speak.");
  }
  function stopSpeaking() { speechOutput?.cancel?.(); if (state === "speaking") finishTurn("Tap the mic to speak."); }
  function confirmPending() {
    if (!pendingConfirmation) return;
    const execute = pendingConfirmation; pendingConfirmation = null;
    if (confirmationTimer) clearTimer(confirmationTimer); confirmationTimer = null;
    Promise.resolve().then(execute).catch(() => {});
  }
  function cancelPendingConfirmation() {
    pendingConfirmation = null;
    if (confirmationTimer) clearTimer(confirmationTimer); confirmationTimer = null;
    options.onConfirmationCancelled?.();
  }
  function requestConfirmation(execute, timeoutMs = 15000) {
    cancelPendingConfirmation(); pendingConfirmation = execute;
    confirmationTimer = setTimer(cancelPendingConfirmation, Math.min(15000, timeoutMs));
  }
  function setMuted(value) { muted = Boolean(value); speechOutput?.setMuted?.(muted); if (muted) stopSpeaking(); }
  function destroy() {
    stop(); destroyed = true;
    if (recognizer) { recognizer.onstart = null; recognizer.onresult = null; recognizer.onerror = null; recognizer.onend = null; try { recognizer.abort(); } catch (_) {} }
  }
  return {
    start, toggle, stop, stopSpeaking, setMuted, requestConfirmation, cancelPendingConfirmation,
    isEnabled: () => enabled, getState: () => state, getLastReply: () => lastReply, destroy,
    reportUnsupported: (message = UNSUPPORTED_SPEECH_MESSAGE) => { if (typeof window !== "undefined") window.NovaPayVoiceFallbackOnly = true; setState("idle", message, true); },
  };
}

export function mountVoiceAssistant(options = {}) {
  const button = document.getElementById("ai-mic"), stopButton = document.getElementById("ai-mic-stop");
  const visualizer = document.getElementById("ai-voice-visualizer"), status = document.getElementById("ai-live-status");
  const label = document.getElementById("ai-voice-label"), note = document.getElementById("ai-voice-note");
  const muteButton = document.getElementById("ai-voice-mute");
  if (!button || !status) return null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let muted = false, microphoneStream = null, requestingMicrophone = false;
  try { muted = localStorage.getItem("novapay-voice-muted") === "true"; } catch (_) {}
  options.speechOutput?.setMuted?.(muted);
  const releaseMicrophone = () => { microphoneStream?.getTracks?.().forEach((track) => track.stop()); microphoneStream = null; };
  const controller = createVoiceController({
    Recognition, speechOutput: options.speechOutput, muted, onQuery: options.onQuery, onTranscript: options.onTranscript,
    onConfirmationCancelled: options.onConfirmationCancelled,
    onState(snapshot) {
      try { window.NovaPayVoiceIndicator?.update(snapshot); } catch (_) {}
      if (!snapshot.enabled) releaseMicrophone();
      button.setAttribute("aria-pressed", String(snapshot.enabled));
      button.setAttribute("aria-label", snapshot.enabled ? "Cancel voice input" : "Tap to talk");
      button.title = snapshot.enabled ? "Tap to cancel or interrupt" : "Tap to talk";
      button.classList.toggle("is-listening", snapshot.state === "listening");
      if (visualizer) visualizer.hidden = snapshot.state !== "listening";
      if (label) label.textContent = snapshot.message;
      if (status) status.textContent = snapshot.message === "Tap the mic to speak." ? "" : snapshot.message;
      if (note && !snapshot.problem) note.textContent = "Tap the mic and tell me what you need. Hold it only if browser speech recognition is unavailable.";
    },
  });
  async function begin() {
    options.speechOutput?.markGesture?.();
    const current = controller.getState();
    if (current === "listening") { controller.stop(); return; }
    if (current === "speaking" || current === "thinking") { controller.start(); return; }
    if (requestingMicrophone) return;
    requestingMicrophone = true;
    try {
      const brave = await Promise.resolve(navigator.brave?.isBrave?.()).catch(() => false);
      if (brave || !Recognition) { controller.reportUnsupported(UNSUPPORTED_SPEECH_MESSAGE); return; }
      if (navigator.mediaDevices?.getUserMedia) microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      window.NovaPayVoiceFallbackOnly = false; controller.start();
    } catch (_) {
      controller.reportUnsupported("Microphone permission is blocked. Allow microphone access in browser site settings, then tap the mic.");
    } finally { requestingMicrophone = false; }
  }
  controller.enableVoice = begin;
  button.addEventListener("click", begin);
  stopButton?.addEventListener("click", () => controller.stop());
  muteButton?.addEventListener("click", () => {
    muted = !muted; controller.setMuted(muted);
    muteButton.setAttribute("aria-pressed", String(muted)); muteButton.textContent = muted ? "Unmute voice" : "Mute voice";
    try { localStorage.setItem("novapay-voice-muted", String(muted)); } catch (_) {}
  });
  if (muteButton) { muteButton.setAttribute("aria-pressed", String(muted)); muteButton.textContent = muted ? "Unmute voice" : "Mute voice"; }
  const onAuth = (event) => { if (event.detail?.signedIn === false || event.detail?.event === "SIGNED_OUT") controller.stop(); };
  const onPageHide = () => { controller.destroy(); releaseMicrophone(); document.removeEventListener("novapay:auth", onAuth); };
  document.addEventListener("novapay:auth", onAuth); window.addEventListener("pagehide", onPageHide, { once: true });
  document.getElementById("ai-voice-repeat")?.addEventListener("click", () => options.speechOutput?.speak(controller.getLastReply() || "There is no answer to repeat yet."));
  return controller;
}
