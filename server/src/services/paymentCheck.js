const RULE_REASONS = {
  duplicate_amount_payer: 'Possible duplicate amount and payer.',
  fee_rate_spike: 'PayPal fee differs from the recent baseline.',
  refund_rate_spike: 'Refund rate is above the review threshold.',
  large_payout: 'Large payout was flagged for review.',
  stale_webhook: 'Related PayPal webhook is delayed.',
  dead_letter_webhook: 'Related PayPal webhook could not be processed.',
};

export function paymentCheck({ status, transactionId, captureId, anomalies = [], webhookEvents = [], sellerProtection } = {}) {
  const reasons = [];
  const ids = new Set([transactionId, captureId, ...webhookEvents.map((event) => event.event_id || event.eventId)].filter(Boolean).map(String));
  const related = anomalies.filter((anomaly) => anomaly?.status === 'open' &&
    (Array.isArray(anomaly.evidence_ids) ? anomaly.evidence_ids : []).some((id) => ids.has(String(id))));
  for (const anomaly of related) {
    const rule = String(anomaly.rule || 'review_signal');
    reasons.push(`${rule}: ${RULE_REASONS[rule] || 'Anomaly flagged for human review.'}`);
  }
  const failedWebhook = webhookEvents.some((event) => ['failed', 'error', 'unverified'].includes(String(event.verification_status || '').toLowerCase()) || String(event.processing_status || '').toLowerCase() === 'unverified');
  if (failedWebhook) reasons.push('webhook_signature: event is unverified or signature verification failed.');
  const normalizedStatus = String(status || '').toUpperCase();
  if (normalizedStatus !== 'COMPLETED') reasons.push(`paypal_status: PayPal status is ${normalizedStatus || 'unavailable'}, not COMPLETED.`);
  if (sellerProtection && String(sellerProtection.status || '').toUpperCase() !== 'ELIGIBLE') reasons.push('seller_protection: PayPal protection is not eligible.');
  const verifiedWebhookReceived = webhookEvents.some((event) => String(event.verification_status || '').toLowerCase() === 'verified');
  const state = failedWebhook ? 'unconfirmed' : (related.length || normalizedStatus !== 'COMPLETED' || (sellerProtection && String(sellerProtection.status || '').toUpperCase() !== 'ELIGIBLE')) ? 'needs_review' : 'confirmed';
  return { state, reasons, ...(verifiedWebhookReceived ? { verifiedWebhookReceived: true } : {}) };
}

export function paymentCheckForTransaction(row, anomalies = [], webhookEvents = []) {
  if (row?.source_type !== 'capture') return { state: 'needs_review', reasons: ['capture_status: capture-specific review signals do not apply to this transaction type.'] };
  const captureId = row.paypal_capture_id || row.source_id;
  const eventIds = new Set(webhookEvents.map((event) => String(event.event_id || event.eventId || '')));
  const relatedAnomalies = anomalies.filter((anomaly) => {
    const evidence = Array.isArray(anomaly.evidence_ids) ? anomaly.evidence_ids.map(String) : [];
    return evidence.includes(String(row.id)) || evidence.includes(String(captureId)) || evidence.some((id) => eventIds.has(id));
  });
  return paymentCheck({ status: row.status, transactionId: row.id, captureId, anomalies: relatedAnomalies, webhookEvents, sellerProtection: row.provider_payload?.seller_protection || row.providerPayload?.seller_protection });
}
