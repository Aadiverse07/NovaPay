import { z } from 'zod';
import '../../../src/assistant-actions.js';

export const ASSISTANT_ACTION_REGISTRY = globalThis.NovaPayAssistantActions;
const registry = new Map(ASSISTANT_ACTION_REGISTRY.registry.map((item) => [item.id, item]));
const uiRoleRules = {
  'invoice-create': ['owner', 'admin', 'accountant'], 'campaign-create': ['owner', 'admin', 'accountant'],
  'maintenance-new': ['owner', 'admin', 'accountant', 'approver', 'resident'],
  'ledger-export': ['owner', 'admin', 'accountant'], 'reports-export': ['owner', 'admin', 'accountant'],
};

function fromJsonSchema(definition) {
  if (definition.type === 'string') {
    let schema = z.string();
    if (definition.minLength) schema = schema.min(definition.minLength);
    if (definition.maxLength) schema = schema.max(definition.maxLength);
    if (definition.enum) schema = schema.refine((value) => definition.enum.includes(value));
    if (definition.pattern) schema = schema.regex(new RegExp(definition.pattern));
    if (definition.format === 'email') schema = schema.email();
    if (definition.format === 'uuid') schema = schema.uuid();
    if (definition.format === 'date') schema = schema.regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
    return schema;
  }
  if (definition.type === 'integer') {
    let schema = z.number().int();
    if (definition.minimum != null) schema = schema.min(definition.minimum);
    if (definition.maximum != null) schema = schema.max(definition.maximum);
    return schema;
  }
  if (definition.type === 'number') {
    let schema = z.number().finite();
    if (definition.minimum != null) schema = schema.min(definition.minimum);
    if (definition.exclusiveMinimum != null) schema = schema.gt(definition.exclusiveMinimum);
    if (definition.maximum != null) schema = schema.max(definition.maximum);
    return schema;
  }
  if (definition.type === 'array') {
    let schema = z.array(fromJsonSchema(definition.items));
    if (definition.minItems != null) schema = schema.min(definition.minItems);
    if (definition.maxItems != null) schema = schema.max(definition.maxItems);
    return schema;
  }
  if (definition.type === 'object') {
    const properties = Object.fromEntries(Object.entries(definition.properties || {}).map(([key, value]) => [key, fromJsonSchema(value)]));
    const required = new Set(definition.required || []);
    for (const key of Object.keys(properties)) if (!required.has(key)) properties[key] = properties[key].optional();
    return z.object(properties).strict();
  }
  return z.never();
}

export function validateAssistantActions(candidates, message, role = 'viewer') {
  if (!Array.isArray(candidates) || candidates.length > 5) return [];
  const text = String(message || '').toLocaleLowerCase('en-US');
  const result = [];
  for (const candidate of candidates) {
    const definition = registry.get(candidate?.id);
    if (!definition || !definition.roles.includes(role)) continue;
    const parsed = fromJsonSchema(definition.args).safeParse(candidate.args || {});
    if (!parsed.success) continue;
    const args = parsed.data;
    if (definition.id === 'ui.click' && ['ledger-export', 'reports-export'].includes(args.uiAction)) continue;
    if (definition.id === 'ui.click' && uiRoleRules[args.uiAction] && !uiRoleRules[args.uiAction].includes(role)) continue;
    if (!actionMatchesUserText(definition.id, args, text)) continue;
    result.push({ id: definition.id, title: definition.title, tier: definition.tier, args });
  }
  return result;
}

function actionMatchesUserText(id, args, text) {
  if (id === 'nav.open') return parseNavigationCommand(text)?.view === args.view;
  if (id === 'assistant.stopSpeaking') return /\b(stop|cancel|be quiet|quiet)\b/.test(text);
  if (id === 'assistant.repeat') return /\b(repeat|say that again|again)\b/.test(text);
  if (id === 'assistant.help') return /\b(help|what can you do|capabilities)\b/.test(text);
  if (id === 'data.query') return true;
  if (id === 'documents.promptUpload') return /\b(upload|attach|process)\b.{0,35}\b(document|file|receipt|invoice|pdf)\b/.test(text);
  if (id === 'maintenance.openNew') return /\b(new|create|open|start)\b.{0,35}\bmaintenance\b/.test(text);
  if (id === 'funds.openCampaign') return /\b(open|show|view)\b.{0,35}\b(campaign|funds?)\b/.test(text);
  if (id === 'invoice.createDraft') return /\b(create|make|new|generate|raise|prepare)\b.{0,60}\b(invoice|draft)\b|\b(invoice|draft)\b.{0,45}\b(create|make|generate|raise)\b/.test(text);
  if (id === 'invoice.downloadPdf') return /\b(download|save)\b.{0,35}\b(invoice|pdf)\b/.test(text);
  if (id === 'invoice.requestSendApproval') return /\b(send|deliver)\b.{0,35}\binvoice\b/.test(text);
  if (id === 'funds.createCampaignDraft') return /\b(create|make|prepare)\b.{0,40}\b(campaign|fundraiser)\b/.test(text);
  if (id === 'documents.proposeConfirm') return /\b(confirm|approve|post)\b.{0,40}\b(document|ocr|invoice)\b/.test(text);
  if (id === 'report.export' || id === 'ledger.export') return /\b(export|download)\b/.test(text);
  if (id === 'report.open') return /\b(open|show|view|go to)\b.{0,35}\breport/.test(text);
  if (id === 'documents.readReview') return /\b(read|review|show)\b.{0,35}\b(document|ocr)\b/.test(text);
  if (id === 'ui.click') return /\b(open|click|start|new|create|export|download)\b/.test(text);
  return false;
}

const viewAliases = [
  ['ai-assistant', /\b(?:ai assistant|assistant)\b/], ['community-funds', /\b(?:community funds|campaigns?|funds?)\b/],
  ['transactions', /\btransactions?\b/], ['approvals', /\bapprovals?\b/], ['sandbox', /\b(?:paypal )?sandbox\b/],
  ['ledger', /\b(?:ledger|trial balance)\b/], ['invoices', /\binvoices?\b/], ['reports', /\breports?\b/],
  ['documents', /\b(?:documents?|receipts?)\b/], ['maintenance', /\bmaintenance\b/], ['dashboard', /\b(?:dashboard|home)\b/],
];

export function parseNavigationCommand(value) {
  const text = String(value || '').toLocaleLowerCase('en-US').replace(/[’‘]/g, "'").trim();
  if (!/^(?:please\s+)?(?:open|go to|navigate to|switch to|take me to|show me)\s+/.test(text)) return null;
  return viewAliases.map(([view, pattern]) => pattern.test(text) ? view : null).find(Boolean)
    ? { view: viewAliases.map(([view, pattern]) => pattern.test(text) ? view : null).find(Boolean) }
    : null;
}

export function parseFastAssistantCommand(message, role = 'viewer') {
  const text = String(message || '').toLocaleLowerCase('en-US').replace(/[’‘]/g, "'").trim();
  let action;
  const navigation = parseNavigationCommand(text);
  if (navigation) action = { id: 'nav.open', tier: 0, args: navigation };
  else if (/^(?:stop|stop speaking|cancel|be quiet|quiet)[.! ]*$/.test(text)) action = { id: 'assistant.stopSpeaking', tier: 0, args: {} };
  else if (/^(?:repeat|say that again|again)[.! ]*$/.test(text)) action = { id: 'assistant.repeat', tier: 0, args: {} };
  else if (/^(?:help|what can you do\??|capabilities\??)[.! ]*$/.test(text)) action = { id: 'assistant.help', tier: 0, args: {} };
  else if (/^(?:(?:download|save) (?:my |the )?(?:last|latest) invoice(?: pdf)?|download (?:it|that))[.! ]*$/.test(text)) action = { id: 'invoice.downloadPdf', tier: 1, args: {} };
  else if (/^(?:upload|attach|process) (?:my |the )?(?:document|file|receipt|invoice|pdf)[.! ]*$/.test(text)) action = { id: 'documents.promptUpload', tier: 0, args: {} };
  else if (/^(?:new|create|open|start) (?:a )?maintenance request[.! ]*$/.test(text)) action = { id: 'maintenance.openNew', tier: 0, args: {} };
  if (!action) return null;
  const registered = registry.get(action.id);
  if (!registered || !registered.roles.includes(role)) return null;
  const phrases = {
    'assistant.stopSpeaking': 'Okay, I stopped speaking.', 'assistant.repeat': 'I will repeat my previous answer.',
    'assistant.help': 'I can open NovaPay modules, answer questions from your organization data, and guide you to supported forms and reviews.',
    'documents.promptUpload': 'Please attach your document. I opened Documents so you can choose the file.',
    'maintenance.openNew': 'I opened the maintenance request form.',
  };
  const names = { dashboard: 'dashboard', transactions: 'Transactions', 'ai-assistant': 'AI Assistant', approvals: 'Approvals', sandbox: 'PayPal Sandbox', ledger: 'Ledger', invoices: 'Invoices', reports: 'Reports', documents: 'Documents', 'community-funds': 'Community Funds', maintenance: 'Maintenance' };
  return { route: 'code', reason: 'deterministic_assistant_command', reply: action.id === 'nav.open' ? `Opening ${names[action.args.view]}.` : phrases[action.id], actions: [action], usage: { model: null, inputTokens: 0, outputTokens: 0 }, cached: false };
}
