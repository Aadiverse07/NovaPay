const GREETING_KEY = 'novapay-voice-greeting-spoken';

export function buildVoiceGreeting(registry) {
  const nav = registry?.registry?.find((item) => item.id === 'nav.open');
  const views = nav?.args?.properties?.view?.enum || [];
  const names = views.filter((view) => view !== 'dashboard' && view !== 'ai-assistant').map((view) => ({
    'community-funds': 'community funds', sandbox: 'PayPal Sandbox',
  }[view] || view.replaceAll('-', ' ')));
  const capabilities = names.length ? `I can help with everything inside NovaPay, including ${names.join(', ')}.` : 'I can help with the NovaPay modules available in this workspace.';
  return `Hey, I’m NovaPay, the AI assistant for NovaPay Finance. ${capabilities} To use me, just say “Hey NovaPay” and then ask or tell me what you need. I’ll answer by voice, and I can open modules and help with supported tasks.`;
}

export function createIntroSpeaker({ registry, synthesis, Utterance, sessionStore }) {
  let spokenThisPage = false;
  function speak({ replay = false } = {}) {
    if (!synthesis || !Utterance || spokenThisPage) return false;
    if (!replay) {
      try { if (sessionStore?.getItem(GREETING_KEY)) return false; } catch {}
    }
    const utterance = new Utterance(buildVoiceGreeting(registry));
    utterance.lang = 'en-IN'; utterance.rate = 1;
    const voices = synthesis.getVoices?.() || [];
    utterance.voice = voices.find((voice) => /^en-IN$/i.test(voice.lang)) || voices.find((voice) => /^en-US$/i.test(voice.lang)) || null;
    utterance.onstart = () => {
      spokenThisPage = true;
      try { sessionStore?.setItem(GREETING_KEY, 'true'); } catch {}
    };
    utterance.onerror = () => {
      if (!replay) { spokenThisPage = false; try { sessionStore?.removeItem(GREETING_KEY); } catch {} }
    };
    try { synthesis.speak(utterance); return true; } catch { return false; }
  }
  return { speak: () => speak(), replay: () => { spokenThisPage = false; return speak({ replay: true }); }, text: () => buildVoiceGreeting(registry) };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  let sessionStore = null;
  try { sessionStore = window.sessionStorage; } catch {}
  const speaker = createIntroSpeaker({
    registry: window.NovaPayAssistantActions,
    synthesis: window.speechSynthesis,
    Utterance: window.SpeechSynthesisUtterance,
    sessionStore,
  });
  window.NovaPayIntroGreeting = speaker;
  const chip = document.getElementById('intro-voice-hear');
  const hear = (event) => {
    if (chip && event.target === chip) return;
    if (!event?.isTrusted) return;
    if (speaker.speak()) {
      document.removeEventListener('click', hear, true);
      document.removeEventListener('keydown', hear, true);
      if (chip) chip.textContent = 'Replay greeting';
    }
  };
  const onOpeningDone = () => { if (chip) chip.hidden = false; };
  const onPageHide = () => { document.removeEventListener('click', hear, true); document.removeEventListener('keydown', hear, true); document.removeEventListener('novapay:opening-done', onOpeningDone); window.removeEventListener('pagehide', onPageHide); };
  document.addEventListener('novapay:opening-done', onOpeningDone, { once: true });
  document.addEventListener('click', hear, true);
  document.addEventListener('keydown', hear, true);
  window.addEventListener('pagehide', onPageHide, { once: true });
  chip?.addEventListener('click', (event) => {
    event.preventDefault();
    if (speaker.replay()) chip.textContent = 'Replay greeting';
  });
}
