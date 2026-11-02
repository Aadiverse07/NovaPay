const PERIOD = /\b(?:today|yesterday|this month|last month|previous month|last week|this week)\b/i;

export function resolveAIContext(message, memory = {}) {
  const original = String(message || '').trim();
  const turns = Array.isArray(memory.turns) ? memory.turns : [];
  const previousUser = [...turns].reverse().find((turn) => turn.role === 'user')?.text || '';
  const ids = [...new Set([...(memory.focus?.recordIds || []), memory.focus?.lastInvoiceId, memory.focus?.lastDocumentId].filter((id) => typeof id === 'string' && id.length <= 150))].slice(0, 10);
  if (/^(?:and\s+(?:last month|this month|today)|same for\s+(?:refunds?|disputes?|fees?)|what about\s+(?:refunds?|disputes?|fees?))\??[.! ]*$/i.test(original)) {
    if (!previousUser) return { message: original, unresolved: true };
    const category = original.match(/(?:same for|what about)\s+(refunds?|disputes?|fees?)/i)?.[1];
    const period = original.match(/last month|this month|today/i)?.[0];
    let base = previousUser;
    if (category) base = base.replace(/\b(?:transactions?|payments?|invoices?|refunds?|disputes?|fees?)\b/ig, category);
    if (period) base = base.replace(PERIOD, '').trim() + ` ${period}`;
    return { message: base, unresolved: false };
  }
  if (/^(?:explain|describe|show)\s+(?:it|that|this|that one|this one|that transaction|the last one|the previous one)[.!? ]*$/i.test(original)) {
    if (!ids.length) return { message: original, unresolved: true };
    if (/previous one/i.test(original) && ids.length < 2) return { message: original, unresolved: true };
    const focusId = /previous one/i.test(original) ? ids[1] : (memory.focus?.lastInvoiceId || memory.focus?.lastDocumentId || ids[0]);
    const kind = focusId === memory.focus?.lastInvoiceId ? 'invoice' : focusId === memory.focus?.lastDocumentId ? 'document' : 'transaction';
    return { message: `Explain ${kind} ${focusId}`, unresolved: false, focusId };
  }
  if (/^(?:what about\s+)?(?:the\s+)?(?:refund|dispute|fee|invoice)\s+one\??[.! ]*$/i.test(original)) {
    if (!ids.length) return { message: original, unresolved: true };
    return { message: `Explain record ${ids[0]}`, unresolved: false, focusId: ids[0] };
  }
  if (/^(?:download|export)(?:\s+the\s+report)?\s+(?:for\s+)?(?:it|that|that one|the last one)[.!? ]*$/i.test(original) || /^(?:open|refund|void|pay|approve)\s+it[.!? ]*$/i.test(original)) {
    const targetId = memory.focus?.lastInvoiceId || memory.focus?.lastDocumentId || ids[0];
    if (!targetId) return { message: original, unresolved: true };
    const kind = memory.focus?.lastInvoiceId ? 'invoice' : memory.focus?.lastDocumentId ? 'document' : 'record';
    return { message: `${original.replace(/\b(?:it|that|that one|the last one)\b/i, `${kind} ${targetId}`)}`, unresolved: false, focusId: targetId };
  }
  if (/^(?:and the unpaid ones|the other one)\??[.! ]*$/i.test(original)) {
    if (!previousUser || /the other one/i.test(original)) return { message: original, unresolved: true };
    return { message: `${previousUser.replace(/\b(?:paid|unpaid|pending|completed|failed)\b/ig, '').trim()} unpaid`, unresolved: false };
  }
  return { message: original, unresolved: false };
}
