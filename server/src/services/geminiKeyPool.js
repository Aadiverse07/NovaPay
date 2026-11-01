const INVALID_KEY_COOLDOWN_MS = 30 * 60 * 1000;
const DEFAULT_RETRY_COOLDOWN_MS = 60 * 1000;
const TRANSIENT_RETRY_DELAY_MS = 120;

function text(value) { return String(value || '').trim(); }

export function resolveGeminiKeySlots(source = {}) {
  const rows = [];
  const first = text(source.GEMINI_API_KEY_1);
  let legacy = '';
  if (!first) legacy = (source.LLM_PROVIDER || 'gemini') === 'gemini'
    ? text(source.LLM_API_KEY || source.resolvedLLMApiKey || source.GEMINI_API_KEY)
    : text(source.GEMINI_API_KEY);
  for (let slot = 1; slot <= 8; slot += 1) {
    const key = slot === 1 ? (first || legacy) : text(source[`GEMINI_API_KEY_${slot}`]);
    if (!key || rows.some((row) => row.key === key)) continue;
    rows.push({ slot, key });
  }
  return rows.slice(0, 8);
}

export function resolveGeminiCapabilities(source = {}) {
  const geminiAvailable = resolveGeminiKeySlots(source).length > 0;
  return {
    hasAI: geminiAvailable || ((source.LLM_PROVIDER || 'gemini') === 'anthropic' && Boolean(text(source.ANTHROPIC_API_KEY))),
    hasDocumentOCR: geminiAvailable,
  };
}

function parseRetryDelay(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  return Math.max(1, Math.ceil(amount * (unit === 'ms' ? 1 : unit === 'm' ? 60_000 : 1000)));
}

function findRetryDelay(value) {
  if (!value || typeof value !== 'object') return null;
  for (const [key, entry] of Object.entries(value)) {
    if (key.toLowerCase() === 'retrydelay') {
      const parsed = parseRetryDelay(entry);
      if (parsed !== null) return parsed;
    }
    const nested = findRetryDelay(entry);
    if (nested !== null) return nested;
  }
  return null;
}

async function errorPayload(response) {
  try { return await response.clone().json(); } catch { return {}; }
}

function isInvalidKey(response, payload) {
  if (response.status === 401 || response.status === 403) return true;
  if (response.status !== 400) return false;
  const data = JSON.stringify(payload || {});
  return /API_KEY_INVALID|API key not valid|invalid API key/i.test(data);
}

function isPerDay(payload) {
  return /per[\s_-]?day|daily quota|quota[^\n]{0,80}day/i.test(JSON.stringify(payload || {}));
}

export function nextLosAngelesMidnight(now = Date.now()) {
  const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(now));
  const parts = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
  const nextUtcDate = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1);
  const probe = new Date(nextUtcDate + 12 * 60 * 60 * 1000);
  const offsetText = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' }).formatToParts(probe).find((part) => part.type === 'timeZoneName')?.value || 'GMT-8';
  const match = offsetText.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const sign = match?.[1] === '-' ? -1 : 1;
  const offsetMinutes = match ? sign * (Number(match[2]) * 60 + Number(match[3] || 0)) : -480;
  return nextUtcDate - offsetMinutes * 60_000;
}

function poolError(code = 'GEMINI_KEYS_EXHAUSTED') {
  return Object.assign(new Error('Gemini is temporarily unavailable. Try again later.'), { code, statusCode: 503 });
}

export function createGeminiKeyPool({ keys = [], now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), events } = {}) {
  const slots = keys.map((entry, index) => typeof entry === 'string'
    ? { slot: index + 1, key: text(entry) }
    : { slot: Number(entry.slot || index + 1), key: text(entry.key) })
    .filter((entry, index, all) => entry.key && all.findIndex((other) => other.key === entry.key) === index)
    .slice(0, 8)
    .sort((a, b) => a.slot - b.slot);
  const cooldowns = new Map();
  const disabled = new Map();
  const keyModel = (slot, model) => `${slot}:${model}`;
  const record = (message, ok = false) => {
    try { Promise.resolve(events?.addCall({ t: new Date(now()).toISOString(), m: message, ok })).catch(() => {}); } catch (_) {}
  };
  const activeModels = (slot, models, at) => models.filter((model) => (cooldowns.get(keyModel(slot.slot, model)) || 0) <= at);
  const logSwitch = (from, to, model, status, reason, endpoint) => {
    if (!from || !to) return;
    const message = reason === 'invalid'
      ? `POST gemini ${model}:${endpoint} -> ${status} · key #${from} invalid, switching to key #${to}`
      : `POST gemini ${model}:${endpoint} -> ${status} · key #${from} exhausted, switching to key #${to}`;
    record(message, false);
  };

  async function generate({ models, timeoutMs, deadlineMs, endpoint = 'generateContent', request, parse, retryDelayMs = TRANSIENT_RETRY_DELAY_MS }) {
    if (!slots.length) throw poolError('GEMINI_NOT_CONFIGURED');
    const modelList = [...new Set((Array.isArray(models) ? models : [models]).map(text).filter(Boolean))];
    if (!modelList.length) throw poolError('GEMINI_MODEL_NOT_CONFIGURED');
    const deadline = Number.isFinite(deadlineMs) ? now() + deadlineMs : Infinity;
    let pendingSwitch = null;
    let lastError = null;
    let sawInvalidKey = false;

    for (const slot of slots) {
      const startedAt = now();
      if ((disabled.get(slot.slot) || 0) > startedAt) { sawInvalidKey = true; continue; }
      const availableModels = activeModels(slot, modelList, startedAt);
      if (!availableModels.length) continue;
      if (pendingSwitch) {
        logSwitch(pendingSwitch.slot, slot.slot, pendingSwitch.model, pendingSwitch.status, pendingSwitch.reason, endpoint);
        pendingSwitch = null;
      }
      let keyDisabled = false;
      let nonQuotaFailure = false;

      for (const model of availableModels) {
        let retry = 0;
        while (true) {
          const remaining = deadline - now();
          if (remaining <= 0) throw poolError('GEMINI_DEADLINE_EXCEEDED');
          let response;
          try {
            response = await request({ apiKey: slot.key, slot: slot.slot, model, timeoutMs: Math.max(1, Math.min(timeoutMs, remaining)) });
          } catch (error) {
            if (retry++ === 0 && now() < deadline) { await sleep(retryDelayMs); continue; }
            lastError = error;
            nonQuotaFailure = true;
            break;
          }

          const payload = [400, 401, 403, 429].includes(response.status) ? await errorPayload(response) : {};
          if (response.status === 429) {
            const cooldownUntil = isPerDay(payload) ? nextLosAngelesMidnight(now()) : now() + (findRetryDelay(payload) || DEFAULT_RETRY_COOLDOWN_MS);
            cooldowns.set(keyModel(slot.slot, model), cooldownUntil);
            record(`POST gemini ${model}:${endpoint} -> ${response.status} · key #${slot.slot} exhausted`, false);
            pendingSwitch = { slot: slot.slot, model, status: response.status, reason: 'exhausted' };
            break;
          }
          if (isInvalidKey(response, payload)) {
            disabled.set(slot.slot, now() + INVALID_KEY_COOLDOWN_MS);
            sawInvalidKey = true;
            pendingSwitch = { slot: slot.slot, model, status: response.status, reason: 'invalid' };
            keyDisabled = true;
            break;
          }
          if ((response.status >= 500 || response.status === 408) && retry++ === 0 && now() < deadline) {
            await sleep(retryDelayMs);
            continue;
          }
          try {
            const value = await parse({ response, model, slot: slot.slot });
            return { value, model, slot: slot.slot };
          } catch (error) {
            if (error?.retryable && retry++ === 0 && now() < deadline) { await sleep(retryDelayMs); continue; }
            lastError = error;
            nonQuotaFailure = true;
            break;
          }
        }
        if (keyDisabled) break;
      }
      if (keyDisabled) continue;
      if (nonQuotaFailure) throw lastError || poolError();
      // Reaching the next slot is permitted only when every available model for this slot was exhausted.
    }
    if (pendingSwitch) {
      const reason = pendingSwitch.reason === 'invalid' ? 'invalid, no available key' : 'exhausted, no available key';
      record(`POST gemini ${pendingSwitch.model}:${endpoint} -> ${pendingSwitch.status} · key #${pendingSwitch.slot} ${reason}`, false);
    }
    const cooling = [...cooldowns.values()].some((until) => until > now());
    throw poolError(cooling ? 'GEMINI_KEYS_EXHAUSTED' : sawInvalidKey ? 'GEMINI_KEYS_UNAVAILABLE' : 'GEMINI_KEYS_EXHAUSTED');
  }

  return Object.freeze({ generate, get configured() { return slots.length; } });
}
