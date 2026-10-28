import { createHash } from 'node:crypto';

export const DOCUMENT_EMBEDDING_MODEL = 'gemini-embedding-001';
export const DOCUMENT_EMBEDDING_DIMENSIONS = 768;
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 150;
const MAX_CHUNKS = 20;
const approximateTokens = (text) => Math.max(1, Math.ceil(String(text).length / 4));

export function chunkDocumentText(value) {
  const text = String(value || '').replace(/\u0000/g, '').trim().slice(0, 30000);
  if (!text) return [];
  const chunks = [];
  let start = 0;
  while (start < text.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(text.length, start + CHUNK_SIZE);
    if (end < text.length) {
      const boundary = text.lastIndexOf('\n', end);
      if (boundary > start + Math.floor(CHUNK_SIZE * 0.6)) end = boundary;
    }
    const content = text.slice(start, end).trim();
    if (content) chunks.push(content);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks;
}

export function documentIndexText(fields) {
  const data = fields && typeof fields === 'object' ? fields : {};
  const structured = {
    documentType: data.documentType,
    vendorName: data.vendorName,
    invoiceNumber: data.invoiceNumber,
    invoiceDate: data.invoiceDate,
    currency: data.currency,
    subtotal: data.subtotal,
    tax: data.tax,
    total: data.total,
    lineItems: data.lineItems,
  };
  return [String(data.documentText || ''), JSON.stringify(structured)].filter(Boolean).join('\n\n');
}

export function createGeminiDocumentEmbeddingProvider({ apiKey, model = DOCUMENT_EMBEDDING_MODEL, dimensions = DOCUMENT_EMBEDDING_DIMENSIONS, fetchImpl = fetch, timeoutMs = 25000, events } = {}) {
  return {
    async embed(texts, taskType = 'RETRIEVAL_DOCUMENT') {
      if (!apiKey) throw Object.assign(new Error('Document search is temporarily unavailable.'), { code: 'EMBEDDING_NOT_CONFIGURED', statusCode: 503 });
      const inputs = (Array.isArray(texts) ? texts : [texts]).map((text) => String(text).slice(0, 12000));
      if (!inputs.length || inputs.some((text) => !text.trim())) throw Object.assign(new Error('Document search input is invalid.'), { code: 'EMBEDDING_INPUT_INVALID', statusCode: 400 });
      const requests = inputs.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: dimensions,
      }));
      let response;
      try {
        response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`, {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ requests }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        events?.addCall({ t: new Date().toISOString(), m: `POST Gemini embeddings ${model} · network error`, ok: false });
        throw Object.assign(new Error('Document search is temporarily unavailable.'), { code: 'EMBEDDING_PROVIDER_UNAVAILABLE', statusCode: 503 });
      }
      events?.addCall({ t: new Date().toISOString(), m: `POST Gemini embeddings ${model} → ${response.status}`, ok: response.ok });
      if (!response.ok) throw Object.assign(new Error('Document search is temporarily unavailable.'), { code: response.status === 429 ? 'EMBEDDING_PROVIDER_RATE_LIMITED' : 'EMBEDDING_PROVIDER_UNAVAILABLE', statusCode: response.status === 429 ? 429 : 503 });
      let body;
      try { body = await response.json(); } catch { throw Object.assign(new Error('Document search is temporarily unavailable.'), { code: 'EMBEDDING_INVALID_RESPONSE', statusCode: 503 }); }
      const embeddings = body.embeddings?.map((entry) => entry.values);
      if (!Array.isArray(embeddings) || embeddings.length !== inputs.length || embeddings.some((values) => !Array.isArray(values) || values.length !== dimensions || values.some((number) => !Number.isFinite(number)))) {
        throw Object.assign(new Error('Document search is temporarily unavailable.'), { code: 'EMBEDDING_INVALID_RESPONSE', statusCode: 503 });
      }
      return { embeddings, model, inputTokens: inputs.reduce((sum, text) => sum + approximateTokens(text), 0) };
    },
  };
}

export function createDocumentRag({ config, database, embeddingProvider, events } = {}) {
  const provider = embeddingProvider || createGeminiDocumentEmbeddingProvider({ apiKey: config?.GEMINI_API_KEY, model: config?.DOCUMENT_EMBEDDING_MODEL || DOCUMENT_EMBEDDING_MODEL, dimensions: DOCUMENT_EMBEDDING_DIMENSIONS, timeoutMs: config?.DOCUMENT_EMBEDDING_TIMEOUT_MS || 25000, events });
  const model = config?.DOCUMENT_EMBEDDING_MODEL || DOCUMENT_EMBEDDING_MODEL;
  const reserve = async ({ orgId, userId, text }) => {
    const reservation = await database.rpc('reserve_ai_usage', {
      p_org: orgId, p_user: userId, p_route: 'embedding', p_model: model,
      p_input_tokens: approximateTokens(text), p_user_limit: Number(config?.AI_DAILY_USER_LIMIT || 5), p_org_limit: Number(config?.AI_DAILY_ORG_LIMIT || 20),
    });
    if (!reservation?.allowed) throw Object.assign(new Error('The daily AI request limit has been reached. Try again after the UTC day reset.'), { code: 'AI_DAILY_LIMIT', statusCode: 429, limited: true });
    const usageId = reservation.usageId || reservation.usage_id;
    if (!usageId) throw Object.assign(new Error('Document search is temporarily unavailable.'), { code: 'AI_USAGE_UNAVAILABLE', statusCode: 503 });
    return usageId;
  };
  const withUsage = async ({ orgId, userId, texts, taskType, run }) => {
    const joined = texts.join('\n');
    const started = Date.now();
    let usageId;
    try {
      usageId = await reserve({ orgId, userId, text: joined });
    } catch (error) {
      if (error?.code === 'AI_DAILY_LIMIT' || error?.code === 'AI_USAGE_UNAVAILABLE') throw error;
      throw Object.assign(new Error('Document search is temporarily unavailable.'), { code: 'AI_USAGE_UNAVAILABLE', statusCode: 503 });
    }
    try {
      const result = await run();
      await database.rpc('complete_ai_usage', {
        p_usage_id: usageId, p_input_tokens: result.inputTokens || approximateTokens(joined), p_output_tokens: 0,
        p_latency_ms: Date.now() - started, p_model: result.model || model, p_status: 'completed',
      });
      return result;
    } catch (error) {
      await database.rpc('complete_ai_usage', {
        p_usage_id: usageId, p_input_tokens: approximateTokens(joined), p_output_tokens: 0,
        p_latency_ms: Date.now() - started, p_model: model, p_status: error?.code === 'EMBEDDING_INVALID_RESPONSE' ? 'invalid_response' : 'error',
      }).catch(() => {});
      throw error;
    }
  };

  return {
    async indexDocument({ orgId, userId, documentId, fields }) {
      if (!database?.rpc || !database?.upsert || !provider?.embed) throw Object.assign(new Error('Document indexing is unavailable.'), { code: 'DOCUMENT_INDEX_UNAVAILABLE', statusCode: 503 });
      const chunks = chunkDocumentText(documentIndexText(fields));
      if (!chunks.length) throw Object.assign(new Error('The document contains no searchable text.'), { code: 'DOCUMENT_TEXT_EMPTY', statusCode: 422 });
      const result = await withUsage({ orgId, userId, texts: chunks, taskType: 'RETRIEVAL_DOCUMENT', run: () => provider.embed(chunks, 'RETRIEVAL_DOCUMENT') });
      const rows = chunks.map((content, chunkIndex) => ({ org_id: orgId, document_id: documentId, chunk_index: chunkIndex, content, embedding: `[${result.embeddings[chunkIndex].join(',')}]`, metadata: { source: 'ocr', model: result.model || model } }));
      await database.upsert('document_chunks', rows, 'document_id,chunk_index');
      return { chunkCount: rows.length, model: result.model || model };
    },
    async search({ orgId, userId, query, limit = 8 }) {
      if (!database?.rpc || !database?.insert || !provider?.embed || !orgId || !userId) return { records: [] };
      const text = String(query || '').trim().slice(0, 1000);
      if (!text) return { records: [] };
      const result = await withUsage({ orgId, userId, texts: [text], taskType: 'RETRIEVAL_QUERY', run: () => provider.embed([text], 'RETRIEVAL_QUERY') });
      const rows = await database.rpc('search_document_chunks', {
        p_org: orgId, p_user: userId, p_query: text, p_embedding: `[${result.embeddings[0].join(',')}]`, p_limit: Math.max(1, Math.min(12, limit)),
      });
      const records = (Array.isArray(rows) ? rows : []).map((row) => ({
        id: String(row.chunk_id), sourceId: String(row.document_id), recordType: 'document_chunk',
        filename: String(row.filename || 'document'), chunkIndex: Number(row.chunk_index), content: String(row.content || '').slice(0, 12000),
        lexicalRank: Number(row.lexical_rank || 0), semanticSimilarity: Number(row.semantic_similarity || 0),
      }));
      if (records.length) {
        const grouped = new Map();
        for (const record of records) grouped.set(record.sourceId, [...(grouped.get(record.sourceId) || []), record.id]);
        const queryHash = createHash('sha256').update(`${orgId}\n${userId}\n${text.normalize('NFKC').toLocaleLowerCase('en-US')}`).digest('hex');
        await database.insert('document_search_hits', [...grouped].map(([documentId, chunkIds]) => ({ org_id: orgId, document_id: documentId, user_id: userId, query_hash: queryHash, chunk_ids: chunkIds })));
      }
      return { records };
    },
  };
}
