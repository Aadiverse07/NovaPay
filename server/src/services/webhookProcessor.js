function asMoney(value) { return value == null ? null : String(value); }

export function isWebhookEventTerminal(event) {
  return Boolean(event && ['processed', 'unverified', 'failed', 'error', 'dead_letter'].includes(event.processing_status));
}

export async function processPayPalEvent({ eventId, repos, paypal }) {
  const row = await repos.events.claim(eventId);
  if (!row) return { claimed: false };
  const payload = row.payload || {};
  try {
    const verification = await paypal.verifyWebhook(row.headers || {}, payload, row.rawBody);
    if (verification !== 'VERIFIED') {
      const state = verification === 'FAILED' ? 'failed' : verification === 'ERROR' ? 'error' : 'unverified';
      await repos.events.complete(row.id || eventId, state, null, 'unverified');
      return { claimed: true, verification: state, posted: false };
    }

    let orgId = null;
    let posted = false;
    const resource = payload.resource || {};
    if (payload.event_type === 'PAYMENT.CAPTURE.COMPLETED' && resource.status === 'COMPLETED') {
      const orderId = resource.supplementary_data?.related_ids?.order_id;
      if (!orderId) throw new Error('verified capture is missing its PayPal order reference');
      const breakdown = resource.seller_receivable_breakdown || {};
      const currency = String(breakdown.gross_amount?.currency_code || resource.amount?.currency_code || '');
      const currencies = [breakdown.gross_amount?.currency_code,breakdown.paypal_fee?.currency_code,breakdown.net_amount?.currency_code].filter(Boolean);
      if (currencies.some((value) => value !== currency)) throw new Error('verified capture currency breakdown is inconsistent');
      const stored = await repos.captures.addFromWebhook({
        id: String(resource.id || ''), orderId: String(orderId), value: asMoney(breakdown.gross_amount?.value || resource.amount?.value),
        fee: asMoney(breakdown.paypal_fee?.value), net: asMoney(breakdown.net_amount?.value),
        currency,
        status: String(resource.status), occurredAt: resource.update_time || resource.create_time || payload.create_time,
        providerPayload: { seller_receivable_breakdown: breakdown },
      });
      orgId = stored.orgId;
      posted = Boolean(orgId);
      const exchange = breakdown.exchange_rate;
      if (exchange && repos.fxRates) {
        const base=String(exchange.source_currency||'').toUpperCase(),quote=String(exchange.target_currency||'').toUpperCase(),rate=String(exchange.value||'');
        if(/^[A-Z]{3}$/.test(base)&&/^[A-Z]{3}$/.test(quote)&&base!==quote&&/^(?:0|[1-9]\d*)(?:\.\d{1,15})?$/.test(rate)) {
          await repos.fxRates.put({org_id:orgId,base_currency:base,quote_currency:quote,rate,fetched_at:new Date().toISOString(),source:'PayPal capture'}).catch(()=>{});
        }
      }
    } else if (payload.event_type === 'INVOICING.INVOICE.PAID' && resource.id && repos.invoices?.markPaid) {
      const result=await repos.invoices.markPaid(String(resource.id),payload);
      orgId=result?.orgId||null;
      posted=result?.updated===true;
    }
    await repos.events.complete(row.id || eventId, 'verified', orgId, 'processed');
    return { claimed: true, verification: 'verified', posted };
  } catch (error) {
    const maxAttempts = 5;
    const state = Number(row.attempts || 1) >= maxAttempts ? 'dead_letter' : 'retry';
    await repos.events.complete(row.id || eventId, 'verified', null, state, error instanceof Error ? error.message : 'event processing failed');
    return { claimed: true, verification: 'verified', posted: false, state };
  }
}

export function startWebhookWorker({ repos, paypal, intervalMs = 15000 }) {
  let stopped = false;
  const inFlight = new Set();
  async function run() {
    if (stopped) return;
    let pending = [];
    try { pending = await repos.events.pending(); } catch { return; }
    for (const item of pending || []) {
      const id = item.id || item.event_id;
      if (!id || inFlight.has(id)) continue;
      inFlight.add(id);
      void processPayPalEvent({ eventId: id, repos, paypal }).catch(() => {}).finally(() => inFlight.delete(id));
    }
  }
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  void run();
  return { stop() { stopped = true; clearInterval(timer); }, run };
}
