import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { webhookRoutes } from '../src/routes/webhook.js';
import { captureJournalLines, isJournalBalanced } from '../src/services/ledger.js';
import { isWebhookEventTerminal, processPayPalEvent } from '../src/services/webhookProcessor.js';

test('webhook verifier waits past the inbox initial state until processing is terminal', () => {
  assert.equal(isWebhookEventTerminal({ verification_status: 'unverified', processing_status: 'processing' }), false);
  assert.equal(isWebhookEventTerminal({ verification_status: 'verified', processing_status: 'retry' }), false);
  assert.equal(isWebhookEventTerminal({ verification_status: 'verified', processing_status: 'processed' }), true);
  assert.equal(isWebhookEventTerminal({ verification_status: 'failed', processing_status: 'unverified' }), true);
});

function makeHarness(verification = 'VERIFIED') {
  const rows = new Map();
  const journalEntries = new Map();
  let verificationCalls = 0;
  let captureCalls = 0;
  const repos = {
    events: {
      async receive(event) {
        const existing = rows.get(event.id);
        if (existing) return existing.id;
        const id = `db-${event.id}`;
        rows.set(event.id, { ...event, id, verificationStatus: 'unverified', status: 'queued', attempts: 0 });
        return id;
      },
      async claim(id) {
        const row = [...rows.values()].find((event) => event.id === id);
        if (!row || !['queued','retry'].includes(row.status)) return null;
        row.status = 'processing'; row.attempts += 1; return row;
      },
      async complete(id, status, orgId, processingStatus) {
        const row = [...rows.values()].find((event) => event.id === id);
        if (row) { row.verificationStatus = status; row.orgId = orgId; row.status = processingStatus; }
      },
    },
    orders: { async findByPayPalId() { return { orgId: 'org-a' }; } },
    captures: {
      async addFromWebhook(capture) {
        captureCalls += 1;
        if (!journalEntries.has(capture.id)) {
          const lines = captureJournalLines({ gross: capture.value, fee: capture.fee, net: capture.net, currency: capture.currency });
          assert.equal(isJournalBalanced(lines), true);
          journalEntries.set(capture.id, lines);
        }
        return { orgId: 'org-a' };
      },
    },
  };
  const paypal = { async verifyWebhook() { verificationCalls += 1; return verification; } };
  const app = express();
  app.use('/api', webhookRoutes({ paypal, repos }));
  return { app, rows, journalEntries, get verificationCalls() { return verificationCalls; }, get captureCalls() { return captureCalls; } };
}

async function withServer(app, run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

const eventBody = (id) => ` { "id":"${id}", "event_type":"PAYMENT.CAPTURE.COMPLETED", "resource": { "id":"CAPTURE-1", "status":"COMPLETED", "amount":{"value":"10.00","currency_code":"USD"}, "supplementary_data":{"related_ids":{"order_id":"ORDER-1"}}, "seller_receivable_breakdown":{"gross_amount":{"value":"10.00","currency_code":"USD"},"paypal_fee":{"value":"0.50","currency_code":"USD"},"net_amount":{"value":"9.50","currency_code":"USD"}} } } `;

test('five duplicate verified webhook deliveries produce one journal source and preserve raw bytes', async () => {
  const h = makeHarness();
  await withServer(h.app, async (base) => {
    for (let i = 0; i < 5; i += 1) {
      const body = eventBody('EVENT-REPLAY-1');
      const response = await fetch(`${base}/api/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, verification: 'UNVERIFIED' });
      assert.equal([...h.rows.values()][0].rawBody, body);
    }
    for (let i = 0; i < 100 && [...h.rows.values()][0].status !== 'processed'; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(h.verificationCalls, 1);
    assert.equal(h.captureCalls, 1);
    assert.equal(h.journalEntries.size, 1);
    assert.equal([...h.rows.values()][0].verificationStatus, 'verified');
  });
});

test('unverified webhook events are retained but never reach the posting path', async () => {
  const h = makeHarness('UNVERIFIED');
  await withServer(h.app, async (base) => {
    const response = await fetch(`${base}/api/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: eventBody('EVENT-UNVERIFIED') });
    assert.equal(response.status, 200);
    for (let i = 0; i < 100 && [...h.rows.values()][0].status !== 'unverified'; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal([...h.rows.values()][0].verificationStatus, 'unverified');
    assert.equal(h.captureCalls, 0);
    assert.equal(h.journalEntries.size, 0);
  });
});

test('verified invoice amount mismatch is handled without claiming a paid posting',async()=>{
  let completed;
  const repos={
    events:{async claim(){return {id:'event-row',event_id:'EVENT-MISMATCH',event_type:'INVOICING.INVOICE.PAID',payload:{id:'EVENT-MISMATCH',event_type:'INVOICING.INVOICE.PAID',resource:{id:'INV-1',status:'PAID',amount:{value:'1.00',currency_code:'USD'}}},attempts:1};},async complete(...args){completed=args;}},
    invoices:{async markPaid(){return {updated:false,mismatch:true,orgId:'org-a'};}}
  };
  const result=await processPayPalEvent({eventId:'EVENT-MISMATCH',repos,paypal:{async verifyWebhook(){return 'VERIFIED';}}});
  assert.deepEqual(result,{claimed:true,verification:'verified',posted:false});
  assert.equal(completed[2],'org-a');
  assert.equal(completed[3],'processed');
});
