import { createGeminiKeyPool, resolveGeminiKeySlots } from './geminiKeyPool.js';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const REQUEST_TIMEOUT_MS = 8_000;
const RETRY_BACKOFF_MS = 120;
export const FREE_GEMINI_MODELS = Object.freeze(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']);

function logCall(events, message, ok) {
  events?.addCall({ t: new Date().toISOString(), m: message, ok });
}

function providerError(message = 'LLM provider returned an error.', { retryable = false } = {}) {
  const error = new Error(message);
  error.retryable = retryable;
  return error;
}

async function readJson(response) {
  try { return await response.json(); } catch { throw providerError('LLM provider returned an invalid response.'); }
}

function extractGeminiText(data) {
  return (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error('timeout');
      error.code = 'LLM_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([fetchImpl(url, { ...options, signal: controller.signal }), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createGeminiAdapter({ apiKey, keyPool, model, fallbackModel, events, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS, sleep = delay, maxOutputTokens = 400 }) {
  const pool = keyPool || createGeminiKeyPool({ keys: apiKey ? [{ slot: 1, key: apiKey }] : [], events, sleep });
  return {
    async transcribeAudio({ audio, mimeType }) {
      if (!pool.configured) throw providerError('Gemini transcription is not configured.');
      if (!Buffer.isBuffer(audio) || !audio.length) throw providerError('Audio data is empty.');
      const result = await pool.generate({
        models: ['gemini-3.5-transcribe'], timeoutMs, deadlineMs: 20_000, endpoint: 'generateContent',
        request: async ({ apiKey: selectedKey, model: selectedModel, timeoutMs: attemptTimeout }) => {
          const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(selectedModel)}:generateContent`;
          return fetchWithTimeout(fetchImpl, url, {
            method: 'POST', headers: { 'x-goog-api-key': selectedKey, 'content-type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [
              { text: 'Transcribe the spoken words exactly. Return only the transcript, with no commentary or actions.' },
              { inline_data: { mime_type: mimeType, data: audio.toString('base64') } },
            ] }], generationConfig: { maxOutputTokens: 512 } }),
          }, attemptTimeout);
        },
        parse: async ({ response, model: selectedModel }) => {
          logCall(events, `POST gemini ${selectedModel}:generateContent transcription → ${response.status}`, response.ok);
          if (!response.ok) throw providerError('Speech transcription provider returned an error.', { retryable: response.status >= 500 || response.status === 408 });
          const data = await readJson(response), transcript = extractGeminiText(data).trim();
          if (!transcript) throw providerError('Speech transcription returned no words.');
          return { text: transcript.slice(0, 1000), model: selectedModel };
        },
      });
      return result.value.text;
    },
    async generate({ system, prompt }) {
      if (!pool.configured) throw providerError('LLM_API_KEY not set');
      try {
        const result = await pool.generate({
          models: fallbackModel && fallbackModel !== model ? [model, fallbackModel] : [model],
          timeoutMs,
          deadlineMs: 20_000,
          endpoint: 'generateContent',
          request: async ({ apiKey: selectedKey, model: selectedModel, timeoutMs: attemptTimeout }) => {
            const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(selectedModel)}:generateContent`;
            try {
              return await fetchWithTimeout(fetchImpl, url, {
                method: 'POST',
                headers: { 'x-goog-api-key': selectedKey, 'content-type': 'application/json' },
                body: JSON.stringify({
                  system_instruction: { parts: [{ text: system }] },
                  contents: [{ role: 'user', parts: [{ text: prompt }] }],
                  generationConfig: { responseMimeType: 'application/json', maxOutputTokens },
                }),
              }, attemptTimeout);
            } catch (error) {
              const timedOut = error?.code === 'LLM_TIMEOUT';
              logCall(events, `POST gemini ${selectedModel}:generateContent · ${timedOut ? 'timeout' : 'network error'}`, false);
              throw Object.assign(new Error('LLM provider is temporarily unavailable.'), { code: timedOut ? 'LLM_TIMEOUT' : 'LLM_NETWORK_ERROR' });
            }
          },
          parse: async ({ response, model: selectedModel }) => {
            logCall(events, `POST gemini ${selectedModel}:generateContent → ${response.status}`, response.ok);
            if (!response.ok) throw providerError('LLM provider returned an error.', { retryable: response.status >= 500 || response.status === 408 });
            let data;
            try { data = await readJson(response); } catch { throw providerError('LLM provider returned an invalid response.', { retryable: true }); }
            const text = extractGeminiText(data);
            if (!text.trim()) throw providerError('LLM provider returned an empty response.', { retryable: true });
            return { text, model: selectedModel, usage: { inputTokens: Number(data.usageMetadata?.promptTokenCount || 0), outputTokens: Number(data.usageMetadata?.candidatesTokenCount || 0) } };
          },
        });
        return result.value;
      } catch (error) {
        if (error?.code?.startsWith('GEMINI_') || error?.code === 'LLM_TIMEOUT' || error?.name === 'AbortError' || error?.name === 'TimeoutError') throw providerError('LLM provider is temporarily unavailable.');
        throw error;
      }
    },
  };
}

export function createAnthropicAdapter({ apiKey, model, events, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS, maxOutputTokens = 400 }) {
  return {
    async generate({ system, prompt }) {
      if (!apiKey) throw providerError('LLM_API_KEY not set');
      let response;
      try {
        response = await fetchWithTimeout(fetchImpl, 'https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model, max_tokens: maxOutputTokens, system, messages: [{ role: 'user', content: prompt }] }),
        }, timeoutMs);
      } catch {
        logCall(events, 'POST anthropic /v1/messages · request failed', false);
        throw providerError('LLM provider is temporarily unavailable.');
      }
      logCall(events, `POST anthropic /v1/messages (${model}) → ${response.status}`, response.ok);
      if (!response.ok) throw providerError();
      let data;
      try { data = await readJson(response); } catch { throw providerError('LLM provider returned an invalid response.'); }
      const text = (data.content || []).map((item) => item.text || '').join('');
      if (!text.trim()) throw providerError('LLM provider returned an empty response.');
      return { text, model, usage: { inputTokens: Number(data.usage?.input_tokens || 0), outputTokens: Number(data.usage?.output_tokens || 0) } };
    },
  };
}

export function createFakeLLMAdapter({ response = '', error, onGenerate } = {}) {
  const calls = [];
  return {
    calls,
    async generate(request) {
      calls.push(request);
      if (onGenerate) return onGenerate(request);
      if (error) throw error;
      return typeof response === 'string' ? { text: response, model: 'fake-model' } : response;
    },
  };
}

export function createLLMAdapter({ config, events, fetchImpl = fetch, keyPool, purpose = 'chat' }) {
  const maxOutputTokens = config.AI_MAX_OUTPUT_TOKENS || 400;
  const apiKey = config.resolvedLLMApiKey || config.LLM_API_KEY || (config.LLM_PROVIDER === 'anthropic' ? config.ANTHROPIC_API_KEY : '');
  const model = config.resolvedLLMModel || config.LLM_MODEL || (config.LLM_PROVIDER === 'anthropic' ? config.ANTHROPIC_MODEL : 'gemini-3.5-flash-lite');
  if (purpose === 'transcription') {
    const audioAdapter = createGeminiAdapter({ apiKey, keyPool: keyPool || createGeminiKeyPool({ keys: resolveGeminiKeySlots(config), events }), model: 'gemini-3.5-transcribe', events, fetchImpl, maxOutputTokens });
    return { transcribeAudio: audioAdapter.transcribeAudio };
  }
  if (config.LLM_PROVIDER === 'anthropic') return createAnthropicAdapter({ apiKey, model, events, fetchImpl, maxOutputTokens });
  const fallbackModel = config.LLM_FALLBACK_MODEL || '';
  if (!FREE_GEMINI_MODELS.includes(model) || (fallbackModel && !FREE_GEMINI_MODELS.includes(fallbackModel))) {
    throw new Error('Configured Gemini models are not in the verified free-tier allow-list.');
  }
  const pool = keyPool || createGeminiKeyPool({ keys: resolveGeminiKeySlots(config), events });
  return createGeminiAdapter({ apiKey, keyPool: pool, model, fallbackModel, events, fetchImpl, maxOutputTokens });
}
