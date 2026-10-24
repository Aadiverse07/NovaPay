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

export function createGeminiAdapter({ apiKey, model, fallbackModel, events, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS, sleep = delay }) {
  async function generateForModel(selectedModel, system, prompt) {
    if (!apiKey) throw providerError('LLM_API_KEY not set');
    const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(selectedModel)}:generateContent`;
    let response;
    try {
      response = await fetchWithTimeout(fetchImpl, url, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 600 },
        }),
      }, timeoutMs);
    } catch (error) {
      const timedOut = error?.code === 'LLM_TIMEOUT';
      logCall(events, `POST gemini ${selectedModel}:generateContent · ${timedOut ? 'timeout' : 'network error'}`, false);
      throw providerError('LLM provider is temporarily unavailable.', { retryable: true });
    }
    logCall(events, `POST gemini ${selectedModel}:generateContent → ${response.status}`, response.ok);
    if (!response.ok) {
      // Provider response bodies may contain account details; never expose or log them.
      throw providerError('LLM provider returned an error.', { retryable: response.status === 429 });
    }
    let data;
    try { data = await readJson(response); } catch { throw providerError('LLM provider returned an invalid response.'); }
    const text = extractGeminiText(data);
    if (!text.trim()) throw providerError('LLM provider returned an empty response.');
    return { text, model: selectedModel };
  }

  async function generateBounded(selectedModel, system, prompt) {
    try { return await generateForModel(selectedModel, system, prompt); }
    catch (error) {
      if (!error?.retryable) throw error;
      await sleep(RETRY_BACKOFF_MS);
      return generateForModel(selectedModel, system, prompt);
    }
  }

  return {
    async generate({ system, prompt }) {
      try { return await generateBounded(model, system, prompt); }
      catch (primaryError) {
        if (!fallbackModel || fallbackModel === model) throw providerError();
        try { return await generateBounded(fallbackModel, system, prompt); }
        catch { throw providerError('LLM provider is temporarily unavailable.'); }
      }
    },
  };
}

export function createAnthropicAdapter({ apiKey, model, events, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS }) {
  return {
    async generate({ system, prompt }) {
      if (!apiKey) throw providerError('LLM_API_KEY not set');
      let response;
      try {
        response = await fetchWithTimeout(fetchImpl, 'https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model, max_tokens: 600, system, messages: [{ role: 'user', content: prompt }] }),
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
      return { text, model };
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

export function createLLMAdapter({ config, events, fetchImpl = fetch }) {
  const apiKey = config.resolvedLLMApiKey || config.LLM_API_KEY || (config.LLM_PROVIDER === 'anthropic' ? config.ANTHROPIC_API_KEY : '');
  const model = config.resolvedLLMModel || config.LLM_MODEL || (config.LLM_PROVIDER === 'anthropic' ? config.ANTHROPIC_MODEL : 'gemini-3.5-flash-lite');
  if (config.LLM_PROVIDER === 'anthropic') return createAnthropicAdapter({ apiKey, model, events, fetchImpl });
  const fallbackModel = config.LLM_FALLBACK_MODEL || '';
  if (!FREE_GEMINI_MODELS.includes(model) || (fallbackModel && !FREE_GEMINI_MODELS.includes(fallbackModel))) {
    throw new Error('Configured Gemini models are not in the verified free-tier allow-list.');
  }
  return createGeminiAdapter({ apiKey, model, fallbackModel, events, fetchImpl });
}
