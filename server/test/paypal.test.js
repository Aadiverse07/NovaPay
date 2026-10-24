import test from 'node:test';
import assert from 'node:assert/strict';
import { approveUrl, createPayPalService, isValidOrderAmount, paypalRequestId, remainingRefundable } from '../src/services/paypal.js';

test('order amount accepts 0.01 through 10,000.00 with at most two decimals', () => {
  for (const value of ['0.01', '1', '1.2', '1.23', '10000', '10000.00']) assert.equal(isValidOrderAmount(value), true, value);
  for (const value of ['0', '0.001', '10000.01', '-1', '1.', '1.234', '1e2', ' 1']) assert.equal(isValidOrderAmount(value), false, value);
});

test('PayPal request ID is deterministic sha256(scope:id)', () => {
  assert.equal(paypalRequestId('order', 'abc'), 'np-5a65d01c227b73c76b84bd10b0c02411');
  assert.equal(paypalRequestId('order', 'abc'), paypalRequestId('order', 'abc'));
  assert.notEqual(paypalRequestId('capture', 'abc'), paypalRequestId('order', 'abc'));
});

test('approve URL requires https and a paypal.com hostname boundary', () => {
  assert.equal(approveUrl('https://www.paypal.com/checkoutnow'), 'https://www.paypal.com/checkoutnow');
  assert.equal(approveUrl('https://paypal.com/checkoutnow'), 'https://paypal.com/checkoutnow');
  for (const value of ['http://paypal.com/', 'https://evilpaypal.com/', 'https://paypal.com.evil.test/', 'javascript:alert(1)', '']) assert.equal(approveUrl(value), '');
});

test('refund remaining amount subtracts completed and reserved refunds', () => {
  assert.equal(remainingRefundable({ value: '50.00', refunded: 12.25, reserved: 7.75 }), 30);
  assert.equal(remainingRefundable({ value: '50.00' }), 50);
});

test('webhook verification request embeds the exact raw event bytes', async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies = [];
  globalThis.fetch = async (_url, options) => {
    if (String(options.body).includes('grant_type=client_credentials')) return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }), { status: 200 });
    requestBodies.push(options.body);
    return new Response(JSON.stringify({ verification_status: 'SUCCESS' }), { status: 200 });
  };
  try {
    const service = createPayPalService({ config: { PAYPAL_CLIENT_ID: 'test', PAYPAL_CLIENT_SECRET: 'test', PAYPAL_WEBHOOK_ID: 'test-hook' }, events: { addCall() {} } });
    const raw = ' { "id":"EVENT-1", "event_type":"PAYMENT.CAPTURE.COMPLETED" } ';
    const status = await service.verifyWebhook({ 'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api-m.sandbox.paypal.com/cert','paypal-transmission-id':'tx','paypal-transmission-sig':'sig','paypal-transmission-time':'time' }, JSON.parse(raw), raw);
    assert.equal(status,'VERIFIED');
    assert.ok(requestBodies[0].includes(`"webhook_event":${raw}}`));
    assert.deepEqual(JSON.parse(requestBodies[0]).webhook_event,JSON.parse(raw));
  } finally { globalThis.fetch = originalFetch; }
});

test('PayPal error activity logs expose only safe issue enums, not provider messages or debug ids',async()=>{
  const originalFetch=globalThis.fetch, calls=[];
  globalThis.fetch=async(_url,options)=>String(options.body).includes('grant_type=client_credentials')
    ?new Response(JSON.stringify({access_token:'test-token',expires_in:3600}),{status:200})
    :new Response(JSON.stringify({name:'INVALID_REQUEST',debug_id:'private-debug-value',message:'private provider text',details:[{issue:'INVALID_STRING_LENGTH',description:'private detail text'}]}),{status:400});
  try{
    const service=createPayPalService({config:{PAYPAL_CLIENT_ID:'test',PAYPAL_CLIENT_SECRET:'test'},events:{addCall(call){calls.push(call);}}});
    await assert.rejects(service.pp('POST','/v2/invoicing/invoices',{},'request-id','org'),{statusCode:502});
    const message=calls.at(-1).m;
    assert.match(message,/INVALID_REQUEST:INVALID_STRING_LENGTH/);
    assert.doesNotMatch(message,/private|debug|provider text/);
  }finally{globalThis.fetch=originalFetch;}
});

test('PayPal error activity keeps issue enums when provider omits name and labels unstructured bodies safely',async()=>{
  const originalFetch=globalThis.fetch;
  let body=JSON.stringify({details:[{issue:'INVOICE_ALREADY_EXISTS',description:'private description'}],message:'private message'});
  globalThis.fetch=async(_url,options)=>String(options.body).includes('grant_type=client_credentials')
    ?new Response(JSON.stringify({access_token:'test-token',expires_in:3600}),{status:200})
    :new Response(body,{status:400});
  try{
    const calls=[];
    const service=createPayPalService({config:{PAYPAL_CLIENT_ID:'test',PAYPAL_CLIENT_SECRET:'test'},events:{addCall(call){calls.push(call);}}});
    await assert.rejects(service.pp('POST','/v2/invoicing/invoices',{},'request-id','org'),{statusCode:502});
    assert.match(calls.at(-1).m,/PAYPAL_ERROR:INVOICE_ALREADY_EXISTS/);
    assert.doesNotMatch(calls.at(-1).m,/private/);
    body='<html>secretly private gateway response</html>';
    await assert.rejects(service.pp('POST','/v2/invoicing/invoices',{},'request-id-2','org'),{statusCode:502});
    assert.match(calls.at(-1).m,/NON_JSON_ERROR/);
    assert.doesNotMatch(calls.at(-1).m,/secretly|private|gateway/);
  }finally{globalThis.fetch=originalFetch;}
});
