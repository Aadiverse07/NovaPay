const SEP = "[\\s,.;:!?'\u2019-]*";
const WAKE = new RegExp(
  "(?:\\b(?:hey|hi|hello|ok|okay|hay|hei)\\b" + SEP + "(?:nova|noah|novo|no\\s?va|know\\s?va|nowa)" + SEP + "(?:pay|pe|pai|paid|pey|bay|pi|pays|play)?\\b"
  + "|\\ba" + SEP + "nova" + SEP + "pay\\b)", "i");
const STOP = /\b(?:stop|wait|no|cancel)\b/i;

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('en-US').replace(/[’‘]/g, "'").replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wakeQuery(value) {
  const match = String(value || '').match(WAKE);
  return match ? String(value).slice(match.index + match[0].length).replace(/^[\s,.:;!?-]+/, '').trim() : null;
}

function similarToSpeech(transcript, current) {
  const heard = normalizeText(transcript), spoken = normalizeText(current);
  if (!heard || !spoken) return false;
  if (spoken.includes(heard) || heard.includes(spoken)) return true;
  const a = new Set(heard.split(' ')), b = new Set(spoken.split(' '));
  const overlap = [...a].filter((word) => b.has(word)).length;
  return overlap / Math.max(1, a.size) >= 0.8;
}

export function createVoiceController(options = {}) {
  const Recognition = options.Recognition;
  const synthesis = options.synthesis;
  const Utterance = options.Utterance;
  const onQuery = options.onQuery || (async () => ({}));
  const onState = options.onState || (() => {});
  const now = options.now || Date.now;
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;
  let recognizer = null;
  let enabled = false;
  let state = 'off';
  let muted = Boolean(options.muted);
  let pendingText = '';
  let pendingWasInterrupted = false;
  let awaitingQueryAfterWake = false;
  let pendingTimer = null;
  let restartTimer = null;
  let restartDelay = 200;
  let failedRestarts = [];
  let restartHadResult = true;
  let currentSpeech = '';
  let speechQueue = [];
  let spokenOffset = 0;
  let spokenChars = 0;
  let lastReply = '';
  let history = [];
  let pendingConfirmation = null;
  let confirmationTimer = null;
  let destroyed = false;
  let sessionStartedAt = 0;
  let problem = false;

  const setState = (value, message, isProblem = false) => { state = value; problem = Boolean(isProblem); onState({ state, message: message || state, enabled, problem }); };
  const isEnabled = () => enabled;
  const getState = () => state;
  const createRecognizer = () => {
    if (recognizer || !Recognition) return recognizer;
    recognizer = new Recognition();
    recognizer.lang = 'en-IN';
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onstart = () => { sessionStartedAt = now(); setState(state === 'capturing' ? 'capturing' : 'idle', state === 'capturing' ? 'Listening…' : "Listening for ‘Hey NovaPay’"); };
    recognizer.onresult = handleResult;
    recognizer.onerror = (event) => {
      const code = event?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        stop(); setState('paused', code === 'not-allowed' ? 'Microphone is blocked. Allow it in your browser’s site settings, then tap Voice.' : 'The browser’s speech service is blocked here. Use Chrome or Edge.', true); return;
      }
      if (code === 'network' || code === 'audio-capture') {
        const message = code === 'network' ? 'Cannot reach the browser’s speech service. Check your internet connection (Brave and some VPNs block it).' : 'No working microphone was found.';
        if (recordRestartFailure() && enabled) setState(state, message, true);
      }
      // 'no-speech' and 'aborted' are normal when the room is quiet; they are not failures.
    };
    recognizer.onend = () => {
      if (!enabled || destroyed) return;
      // A session that lived a while is a normal end (Chrome closes continuous sessions after silence): restart quickly, never count it as a failure.
      const lived = now() - sessionStartedAt;
      if (restartHadResult || lived >= 1500) { restartDelay = 200; scheduleRestart(); return; }
      if (!recordRestartFailure()) return;
      scheduleRestart();
    };
    return recognizer;
  };
  function recordRestartFailure() {
    const cutoff = now() - 30000;
    failedRestarts = failedRestarts.filter((stamp) => stamp >= cutoff);
    failedRestarts.push(now());
    if (failedRestarts.length >= 5) {
      enabled = false;
      clearTimer(restartTimer);
      restartTimer = null;
      setState('paused', 'Voice paused after repeated speech-service failures. Tap Voice to resume.', true);
      return false;
    }
    return true;
  }
  function scheduleRestart() {
    if (!enabled || destroyed || restartTimer) return;
    const delay = restartDelay;
    restartDelay = Math.min(5000, restartDelay * 2);
    restartTimer = setTimer(() => {
      restartTimer = null;
      if (!enabled || destroyed) return;
      restartHadResult = false;
      try { recognizer.start(); } catch { if (recordRestartFailure()) scheduleRestart(); }
    }, delay);
  }
  function clearPending() { clearTimer(pendingTimer); pendingTimer = null; pendingText = ''; }
  function sendQuery(text, interrupted = false) {
    const query = String(text || '').trim().slice(0, 1000);
    clearPending();
    awaitingQueryAfterWake = false;
    if (!query) { setState('idle', "Listening for ‘Hey NovaPay’"); return; }
    const metadata = {
      context: options.getContext ? options.getContext() : undefined,
      history: history.slice(-6),
      ...(interrupted ? { interrupted: { previousReply: lastReply.slice(0, 1000), spokenChars } } : {}),
    };
    setState('thinking', 'Thinking…');
    Promise.resolve().then(() => onQuery(query, metadata)).then((response) => {
      if (!enabled || destroyed) return;
      const answer = String(response?.reply || response?.answer || '').trim();
      lastReply = answer;
      history.push({ role: 'user', text: query }, { role: 'assistant', text: answer });
      history = history.slice(-6);
      if ((response?.actions || []).some((action) => action.id === 'assistant.repeat')) { setState('idle', "Listening for ‘Hey NovaPay’"); return; }
      if (response?.error || !answer) {
        const message = String(response?.speak || answer || 'I could not complete that request.');
        setState('idle', message);
        if (!muted) speak(message);
        return;
      }
      const spoken = String(response?.speak || answer).slice(0, 1000);
      if (muted || !synthesis || !Utterance) { setState('idle', "Listening for ‘Hey NovaPay’"); return; }
      speak(spoken);
    }).catch((error) => {
      if (!enabled || destroyed) return;
      const message = String(error?.voiceMessage || error?.message || 'I could not complete that request.');
      setState('idle', message);
      speak(message);
    });
  }
  function speak(text) {
    if (!enabled || muted || !synthesis || !Utterance) { setState('idle', "Listening for ‘Hey NovaPay’"); return; }
    currentSpeech = String(text || '').slice(0, 1000);
    speechQueue = chunkSpeech(currentSpeech, 220);
    spokenChars = 0; spokenOffset = 0;
    setState('speaking', 'Speaking…');
    try { synthesis.cancel(); speakNextChunk(); } catch { speechQueue = []; currentSpeech = ''; setState('idle', "Listening for ‘Hey NovaPay’"); }
  }
  function chunkSpeech(value, maxLength) {
    const words = String(value || '').split(/\s+/).filter(Boolean), chunks = []; let chunk = '';
    for (const word of words) { if (chunk && (chunk + ' ' + word).length > maxLength) { chunks.push(chunk); chunk = ''; } chunk = chunk ? chunk + ' ' + word : word; }
    if (chunk) chunks.push(chunk); return chunks;
  }
  function speakNextChunk() {
    if (!speechQueue.length) { currentSpeech = ''; if (enabled && !destroyed) setState(awaitingQueryAfterWake ? 'capturing' : 'idle', awaitingQueryAfterWake ? 'Listening for your question…' : "Listening for ‘Hey NovaPay’"); return; }
    const chunk = speechQueue.shift(), chunkOffset = spokenOffset;
    const utterance = new Utterance(chunk); utterance.lang = 'en-IN'; utterance.rate = 1;
    const voices = synthesis.getVoices?.() || [];
    utterance.voice = voices.find((voice) => /^en-IN$/i.test(voice.lang)) || voices.find((voice) => /^en-US$/i.test(voice.lang)) || null;
    utterance.onboundary = (event) => { spokenChars = Math.max(spokenChars, chunkOffset + (Number(event.charIndex) || 0)); };
    utterance.onend = () => { spokenOffset += chunk.length + 1; speakNextChunk(); }; utterance.onerror = () => { speechQueue = []; speakNextChunk(); }; synthesis.speak(utterance);
  }
  function handleResult(event) {
    restartHadResult = true;
    restartDelay = 200;
    if (problem) setState(state, state === 'capturing' ? 'Listening…' : "Listening for ‘Hey NovaPay’");
    const heard = [];
    for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = String(result?.[0]?.transcript || '').trim();
      if (text) heard.push({ text, final: Boolean(result.isFinal) });
    }
    for (const item of heard) {
      const text = item.text;
      if (!item.final && state !== 'speaking') continue;
      if (state === 'speaking' && awaitingQueryAfterWake) {
        if (similarToSpeech(text, currentSpeech)) continue;
        synthesis?.cancel?.(); currentSpeech = ''; pendingText = text; pendingWasInterrupted = false;
        setState('capturing', 'Listening…'); scheduleQuery(false); continue;
      }
      if (state === 'speaking') {
        if (similarToSpeech(text, currentSpeech)) continue;
        const words = normalizeText(text).split(' ').filter(Boolean);
        if (pendingConfirmation && /^(?:yes|confirm|confirmed|no|cancel|stop)$/i.test(normalizeText(text))) {
          if (/^(?:yes|confirm|confirmed)$/i.test(normalizeText(text))) confirmPending(); else cancelPendingConfirmation();
          synthesis?.cancel?.(); currentSpeech = ''; setState('idle', "Listening for ‘Hey NovaPay’");
          continue;
        }
        if (words.length < 2 && !STOP.test(text)) continue;
        synthesis?.cancel?.(); currentSpeech = '';
        pendingText = text;
        pendingWasInterrupted = true;
        setState('capturing', 'Listening…');
        scheduleQuery(true);
        continue;
      }
      if (pendingConfirmation && item.final && /^(?:yes|confirm|confirmed|no|cancel)$/i.test(normalizeText(text))) {
        if (/^(?:yes|confirm|confirmed)$/i.test(normalizeText(text))) confirmPending(); else cancelPendingConfirmation();
        continue;
      }
      if (state === 'idle') {
        const query = wakeQuery(text);
        if (query !== null) {
          if (query) { pendingText = query; pendingWasInterrupted = false; setState('capturing', 'Listening…'); scheduleQuery(false); }
          else { awaitingQueryAfterWake = true; setState('capturing', 'Yes?'); speak('Yes?'); }
          continue;
        }
      } else if (state === 'capturing') {
        pendingText = `${pendingText} ${text}`.trim().slice(0, 1000);
        scheduleQuery(false);
      }
    }
  }
  function scheduleQuery(interrupted) {
    pendingWasInterrupted = pendingWasInterrupted || interrupted;
    clearTimer(pendingTimer);
    pendingTimer = setTimer(() => { pendingTimer = null; const text = pendingText; pendingText = ''; const wasInterrupted = pendingWasInterrupted; pendingWasInterrupted = false; sendQuery(text, wasInterrupted); }, 1200);
  }
  function confirmPending() {
    if (!pendingConfirmation) return;
    const execute = pendingConfirmation; pendingConfirmation = null; clearTimer(confirmationTimer); confirmationTimer = null;
    Promise.resolve().then(execute).catch(() => {});
  }
  function cancelPendingConfirmation() {
    pendingConfirmation = null; clearTimer(confirmationTimer); confirmationTimer = null;
    if (options.onConfirmationCancelled) options.onConfirmationCancelled();
  }
  function requestConfirmation(execute, timeoutMs = 15000) {
    cancelPendingConfirmation();
    pendingConfirmation = execute;
    confirmationTimer = setTimer(cancelPendingConfirmation, Math.min(15000, timeoutMs));
  }
  function start() {
    if (destroyed || enabled) return;
    if (!Recognition) { setState('unsupported', 'Voice wake word is not supported here. Type your question instead.'); return; }
    enabled = true;
    setState('idle', "Listening for ‘Hey NovaPay’");
    restartHadResult = false; sessionStartedAt = now();
    try { createRecognizer().start(); } catch { if (recordRestartFailure()) scheduleRestart(); }
  }
  function stop() {
    enabled = false;
    clearPending(); clearTimer(restartTimer); restartTimer = null;
    cancelPendingConfirmation();
    if (synthesis?.cancel) synthesis.cancel();
    speechQueue = [];
    currentSpeech = '';
    try { recognizer?.stop(); } catch {}
    setState('off', 'Voice is off.');
  }
  function stopSpeaking() {
    if (synthesis?.cancel) synthesis.cancel();
    speechQueue = [];
    currentSpeech = '';
    if (enabled) setState('idle', "Listening for ‘Hey NovaPay’");
  }
  function setMuted(value) { muted = Boolean(value); if (muted) stopSpeaking(); }
  function destroy() {
    stop(); destroyed = true;
    if (recognizer) { recognizer.onstart = null; recognizer.onresult = null; recognizer.onerror = null; recognizer.onend = null; try { recognizer.abort(); } catch {} }
    recognizer = null;
  }
  return { start, stop, stopSpeaking, setMuted, requestConfirmation, cancelPendingConfirmation, isEnabled, getState, destroy, speak };
}

export function mountVoiceAssistant(options = {}) {
  const button = document.getElementById('ai-mic');
  const stopButton = document.getElementById('ai-mic-stop');
  const visualizer = document.getElementById('ai-voice-visualizer');
  const status = document.getElementById('ai-live-status');
  const label = document.getElementById('ai-voice-label');
  const note = document.getElementById('ai-voice-note');
  const muteButton = document.getElementById('ai-voice-mute');
  if (!button || !status) return null;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    button.hidden = true;
    if (note) note.textContent = 'Voice wake word is unavailable in this browser. You can still type to NovaPay.';
    return null;
  }
  let muted = false;
  try { muted = localStorage.getItem('novapay-voice-muted') === 'true' || localStorage.getItem('novapay-sound') === 'off'; } catch {}
  const controller = createVoiceController({
    Recognition,
    synthesis: window.speechSynthesis,
    Utterance: window.SpeechSynthesisUtterance,
    muted,
    getContext: options.getContext,
    onQuery: options.onQuery,
    onState(snapshot) {
      try { window.NovaPayVoiceIndicator?.update(snapshot); } catch {}
      if (snapshot.problem && !snapshot.enabled) releaseMicrophone();
      const active = snapshot.enabled;
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? 'Turn voice assistant off' : 'Turn voice assistant on');
      button.title = active ? 'Voice on · listening for Hey NovaPay' : 'Voice off';
      button.classList.toggle('is-listening', active);
      if (visualizer) visualizer.hidden = !active;
      if (label) label.textContent = snapshot.message;
      if (status) status.textContent = snapshot.state === 'off' ? '' : snapshot.message;
      if (note) note.textContent = 'Voice uses your browser’s speech service; microphone access starts only when Voice is turned on.';
    },
    onConfirmationCancelled: options.onConfirmationCancelled,
  });
  let microphoneStream = null, requestingMicrophone = false;
  const releaseMicrophone = () => { microphoneStream?.getTracks?.().forEach((track) => track.stop()); microphoneStream = null; };
  const setPreference = (on) => { try { localStorage.setItem('novapay-voice-enabled', String(Boolean(on))); } catch {} };
  const stopVoice = () => { controller.stop(); releaseMicrophone(); };
  const startVoice = async () => {
    if (requestingMicrophone || controller.isEnabled()) return;
    requestingMicrophone = true;
    try {
      if (navigator.mediaDevices?.getUserMedia) microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      controller.start();
    } catch {
      setPreference(false);
      const message = 'Microphone permission is needed for voice. Allow it in your browser’s site settings, then tap Voice.';
      if (note) note.textContent = message;
      try { window.NovaPayVoiceIndicator?.update({ state: 'paused', enabled: false, problem: true, message }); } catch {}
    }
    finally { requestingMicrophone = false; }
  };
  controller.enableVoice = startVoice;
  button.addEventListener('click', () => { if (controller.isEnabled()) { setPreference(false); stopVoice(); } else { setPreference(true); startVoice(); } });
  stopButton?.addEventListener('click', () => controller.stopSpeaking());
  muteButton?.addEventListener('click', () => {
    muted = !muted; controller.setMuted(muted);
    muteButton.setAttribute('aria-pressed', String(muted)); muteButton.textContent = muted ? 'Unmute voice' : 'Mute voice';
    try { localStorage.setItem('novapay-voice-muted', String(muted)); } catch {}
  });
  let resumeAfterVisibility = false;
  const onVisibility = () => {
    if (document.hidden) { resumeAfterVisibility = controller.isEnabled(); if (resumeAfterVisibility) stopVoice(); }
    else if (resumeAfterVisibility) { resumeAfterVisibility = false; startVoice(); }
  };
  const onAuth = (event) => { if (event.detail?.signedIn === false || event.detail?.event === 'SIGNED_OUT') { resumeAfterVisibility = false; stopVoice(); } };
  const onPageHide = () => { controller.destroy(); releaseMicrophone(); document.removeEventListener('visibilitychange', onVisibility); document.removeEventListener('novapay:auth', onAuth); };
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('novapay:auth', onAuth);
  window.addEventListener('pagehide', onPageHide, { once: true });
  const repeat = document.getElementById('ai-voice-repeat');
  repeat?.addEventListener('click', () => {
    if (window.NovaPayIntroGreeting?.replay) window.NovaPayIntroGreeting.replay();
    else controller.speak(options.getLastReply?.() || 'There is no answer to repeat yet.');
  });
  return controller;
}
