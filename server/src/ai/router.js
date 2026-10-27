const ROUTES = new Set(['code', 'sql', 'ocr', 'retrieval', 'llm']);

const normalize = (value) => String(value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase('en-US')
  .replace(/[’‘]/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const hasCurrencyPair = (text) => {
  const currency = '(?:usd|inr|eur|gbp|cad|aud|jpy|cny|rupees?|dollars?|euros?|pounds?)';
  return new RegExp(`\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?\\s*${currency}\\s+(?:to|into|in)\\s+${currency}\\b`, 'i').test(text)
    || new RegExp(`\\b(?:convert|exchange|fx)\\b.{0,48}\\b${currency}\\b.{0,24}\\b(?:to|into)\\b.{0,12}\\b${currency}\\b`, 'i').test(text);
};

const hasFXIntent = (text) => hasCurrencyPair(text)
  || /\b(?:convert|conversion|exchange rate|foreign exchange|forex|fx rate|currency conversion)\b/i.test(text);

const hasArithmeticIntent = (text) => /\b(?:calculate|compute|evaluate|add|subtract|multiply|divide)\b.{0,30}\d+(?:\.\d+)?\s*(?:\+|-|\*|\/|plus|minus|times|divided by|and)\s*\d+/i.test(text)
  || /\b(?:what is|what's)\s+-?\d+(?:\.\d+)?\s*(?:\+|-|\*|\/|plus|minus|times|divided by)\s*-?\d+/i.test(text);

const hasStructuredIntent = (text) => {
  const queryVerb = /\b(show|list|find|get|give me|report|how many|what is|what's|total|summari[sz]e|break down|rank|top|dame|muestra|muestrame|cuantos|cuántos|cuanto|cuánto|qué)\b/i.test(text);
  const periodOrGrouping = /\b(last|previous|current|today|yesterday|month|week|year|by week|weekly|monthly|quarter|between|from|mes|semana|mês|mois)\b/i.test(text);
  const refunds = /\b(refund|refunds|refunded|refund rate)\b/i.test(text);
  const fees = /\b(fee|fees|paypal fee|processing fee|charges)\b/i.test(text);
  const customers = /\b(top|largest|biggest|highest|most valuable)\b.{0,20}\b(customers?|clients?|buyers?|donors?)\b/i.test(text)
    || /\b(customers?|clients?|buyers?|donors?)\b.{0,28}\b(top|largest|biggest|highest|most valuable)\b/i.test(text);
  const balance = /\b(balance|balances|trial balance)\b/i.test(text);
  const invoiceStatus = /\b(invoice|invoices)\b.{0,40}\b(status|state|paid|due|overdue|draft|sent)\b/i.test(text)
    || /\b(status|state|paid|due|overdue|draft|sent)\b.{0,30}\b(invoice|invoices)\b/i.test(text);
  const transactions = /\b(transactions?|payments?|captures?|payouts?)\b/i.test(text);

  if (refunds && (queryVerb || periodOrGrouping)) return 'refunds';
  if (fees && (queryVerb || periodOrGrouping)) return 'fees';
  if (customers && (queryVerb || /\b(top|largest|biggest|highest)\b/i.test(text))) return 'top_customers';
  if (balance && (queryVerb || /\b(check|show|current|what is|what's)\b/i.test(text))) return 'balance';
  if (invoiceStatus && (queryVerb || /\b(invoice|invoices)\b/i.test(text))) return 'invoice_status';
  if (transactions && (queryVerb || periodOrGrouping)) return 'transactions';
  return null;
};

const hasDocumentIntent = (text) => /\b(?:this|the|attached|uploaded|my)?\s*(?:document|pdf|receipt|statement|invoice(?: file| document)?|image|photo|scan)\b/i.test(text)
  && /\b(?:read|extract|scan|parse|summari[sz]e|review|what does|from|uploaded|attached)\b/i.test(text);

const hasExplanationIntent = (text) => /\b(?:why|because|explica|explicar|explique|explain|what caused|how did|how come|analy[sz]e|compare|tell me about|what does .* mean|describe)\b|por qué/i.test(text);

export function classifyAIIntent(message) {
  const text = normalize(message);
  if (!text) return { route: 'llm', reason: 'empty_or_unrecognized_question', intent: 'unknown' };

  // Explicit numeric/FX operations run before any data-query classification.
  if (hasFXIntent(text)) return { route: 'code', reason: 'currency_conversion_or_fx_rate', intent: 'fx' };
  if (hasArithmeticIntent(text)) return { route: 'code', reason: 'deterministic_arithmetic', intent: 'arithmetic' };

  const structured = hasStructuredIntent(text);
  if (structured) return { route: 'sql', reason: `structured_${structured}_query`, intent: structured };

  if (hasDocumentIntent(text)) return { route: 'ocr', reason: 'document_extraction_request', intent: 'document' };
  if (hasExplanationIntent(text)) return { route: 'retrieval', reason: 'evidence_based_explanation', intent: 'explanation' };
  return { route: 'llm', reason: 'general_read_only_question', intent: 'general' };
}

export function createAIRouter(handlers = {}) {
  return async function routeAIMessage(message, context = {}) {
    const classification = classifyAIIntent(message);
    const route = ROUTES.has(classification.route) ? classification.route : 'llm';
    const handler = handlers[route];
    if (!handler) return { ...classification, route };
    const result = await handler({ message: String(message ?? ''), context, classification });
    return { ...result, route, reason: classification.reason };
  };
}

export const AI_ROUTE_VALUES = Object.freeze([...ROUTES]);
