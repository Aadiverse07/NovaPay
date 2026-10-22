const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

function logCall(events, message, ok) {
  events?.addCall({ t: new Date().toISOString(), m: message, ok });
}

function providerError(message = 'LLM provider returned an error.') {
  return new Error(message);
}

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function extractGeminiText(data) {
  return (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
}

export function createGeminiAdapter({ apiKey, model, fallbackModel, events, fetchImpl = fetch }) {
  async function generateForModel(selectedModel, system, prompt) {
    if (!apiKey) throw providerError('LLM_API_KEY not set');
    const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(selectedModel)}:generateContent`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 600 },
        }),
      });
    } catch {
      logCall(events, `POST gemini ${selectedModel}:generateContent · network error`, false);
      throw providerError();
    }
    const data = await readJson(response);
    logCall(events, `POST gemini ${selectedModel}:generateContent → ${response.status}`, response.ok);
    if (!response.ok) throw providerError();
    return { text: extractGeminiText(data), model: selectedModel };
  }

  return {
    async generate({ system, prompt }) {
      try { return await generateForModel(model, system, prompt); }
      catch (primaryError) {
        if (!fallbackModel || fallbackModel === model) throw primaryError;
        return generateForModel(fallbackModel, system, prompt);
      }
    },
  };
}

export function createAnthropicAdapter({ apiKey, model, events, fetchImpl = fetch }) {
  return {
    async generate({ system, prompt }) {
      if (!apiKey) throw providerError('LLM_API_KEY not set');
      let response;
      try {
        response = await fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model, max_tokens: 600, system, messages: [{ role: 'user', content: prompt }] }),
        });
      } catch {
        logCall(events, 'POST anthropic /v1/messages · network error', false);
        throw providerError();
      }
      const data = await readJson(response);
      logCall(events, `POST anthropic /v1/messages (${model}) → ${response.status}`, response.ok);
      if (!response.ok) throw providerError();
      return { text: (data.content || []).map((item) => item.text || '').join(''), model };
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
  return createGeminiAdapter({ apiKey, model, fallbackModel: config.LLM_FALLBACK_MODEL, events, fetchImpl });
}
