const GREETING_KEY = 'novapay-voice-greeting-spoken';

export function buildVoiceGreeting(registry) {
  const nav = registry?.registry?.find((item) => item.id === 'nav.open');
  const views = nav?.args?.properties?.view?.enum || [];
  const names = views.filter((view) => view !== 'dashboard' && view !== 'ai-assistant').map((view) => ({
    'community-funds': 'community funds', sandbox: 'PayPal Sandbox',
  }[view] || view.replaceAll('-', ' ')));
  const capabilities = names.length ? `I can help with everything inside NovaPay, including ${names.join(', ')}.` : 'I can help with the NovaPay modules available in this workspace.';
  return `Hey, I’m NovaPay, the AI assistant for NovaPay Finance. ${capabilities} To use me, tap the mic and tell me what you need. I’ll answer by voice, and I can open modules and help with supported tasks.`;
}

export function createIntroSpeaker({ registry, speechOutput, sessionStore }) {
  let spokenThisPage = false;
  function speak({ replay = false } = {}) {
    if (!speechOutput || spokenThisPage) return false;
    if (!replay) {
      try { if (sessionStore?.getItem(GREETING_KEY)) return false; } catch {}
    }
    spokenThisPage = true;
    try {
      Promise.resolve(speechOutput.speak(buildVoiceGreeting(registry))).then((result) => {
        if (result?.ok) { try { sessionStore?.setItem(GREETING_KEY, 'true'); } catch {} }
        else { spokenThisPage = false; try { sessionStore?.removeItem(GREETING_KEY); } catch {} }
      }).catch(() => { spokenThisPage = false; });
      return true;
    } catch { spokenThisPage = false; return false; }
  }
  return { speak: () => speak(), replay: () => { spokenThisPage = false; return speak({ replay: true }); }, text: () => buildVoiceGreeting(registry) };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  let sessionStore = null;
  try { sessionStore = window.sessionStorage; } catch {}
  const speaker = createIntroSpeaker({
    registry: window.NovaPayAssistantActions,
    speechOutput: window.NovaPaySpeechOutputInstance,
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
  const onPageHide = () => { document.removeEventListener('click', hear, true); document.removeEventListener('keydown', hear, true); window.removeEventListener('novapay:opening-done', onOpeningDone); window.removeEventListener('pagehide', onPageHide); };
  window.addEventListener('novapay:opening-done', onOpeningDone, { once: true });
  if (window.__npOpeningDone) onOpeningDone();
  document.addEventListener('click', hear, true);
  document.addEventListener('keydown', hear, true);
  window.addEventListener('pagehide', onPageHide, { once: true });
  chip?.addEventListener('click', (event) => {
    event.preventDefault();
    if (speaker.replay()) chip.textContent = 'Replay greeting';
  });
}
