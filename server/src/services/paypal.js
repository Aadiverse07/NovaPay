import crypto from 'node:crypto';

export const PAYPAL_API = 'https://api-m.sandbox.paypal.com';
export const paypalRequestId = (scope, id) => `np-${crypto.createHash('sha256').update(`${scope}:${id}`).digest('hex').slice(0, 32)}`;
export const isValidOrderAmount = (raw) => /^(?:\d{1,5})(?:\.\d{1,2})?$/.test(raw) && Number(raw) >= 0.01 && Number(raw) <= 10000;
const minor = (value) => {
  const text = String(value ?? '0');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return NaN;
  const [whole, fraction = ''] = text.split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return Number(result);
};
export const remainingRefundable = (capture) => {
  const amount = Number.isSafeInteger(capture.amountMinor) ? capture.amountMinor : minor(capture.value);
  const refunded = Number.isSafeInteger(capture.refundedMinor) ? capture.refundedMinor : minor(capture.refunded || 0);
  const reserved = Number.isSafeInteger(capture.reservedMinor) ? capture.reservedMinor : minor(capture.reserved || 0);
  return Number.isFinite(amount) && Number.isFinite(refunded) && Number.isFinite(reserved) ? (amount - refunded - reserved) / 100 : NaN;
};

export function approveUrl(href) {
  try {
    const parsed = new URL(href || '');
    return parsed.protocol === 'https:' && /(^|\.)paypal\.com$/i.test(parsed.hostname) ? parsed.href : '';
  } catch { return ''; }
}

export function createPayPalService({ config, events }) {
  let token = { value: null, expiresAt: 0, failUntil: 0 };
  const log = (message, ok = true, orgId = null) => { Promise.resolve(events.addCall({ t: new Date().toISOString(), m: message, ok, orgId }, orgId)).catch(() => {}); };

  async function ppToken() {
    if (token.value && Date.now() < token.expiresAt) return token.value;
    if (Date.now() < token.failUntil) throw Object.assign(new Error('PayPal Sandbox connection is unavailable. Check credentials or connection and try again shortly.'), { statusCode: 502 });
    let response;
    try {
      response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
    } catch {
      token.failUntil = Date.now() + 60000; log('POST /v1/oauth2/token · network error', false);
      throw Object.assign(new Error('PayPal Sandbox could not be reached.'), { statusCode: 502 });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      token.failUntil = Date.now() + 60000; log(`POST /v1/oauth2/token → ${response.status}`, false);
      throw Object.assign(new Error('PayPal Sandbox credentials could not be verified. Check the sandbox app credentials.'), { statusCode: 502 });
    }
    token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000, failUntil: 0 };
    log('POST /v1/oauth2/token'); return token.value;
  }

  async function pp(method, url, body, requestId, orgId = null, rawJsonBody = null) {
    let accessToken;
    try { accessToken = await ppToken(); } catch (error) { error.requestSent = false; throw error; }
    let response;
    try {
      response = await fetch(PAYPAL_API + url, { method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': requestId || `np-${Date.now()}${Math.random().toString(36).slice(2)}` }, body: rawJsonBody ?? (body ? JSON.stringify(body) : undefined) });
    } catch {
      log(`${method} ${url} · network error`, false, orgId);
      throw Object.assign(new Error('PayPal Sandbox request failed. Check the connection and recent API activity.'), { requestSent: true, statusCode: 502 });
    }
    const responseText = await response.text().catch(() => '');
    let data = {};
    let structuredError = false;
    try { data = responseText ? JSON.parse(responseText) : {}; structuredError = Boolean(responseText); } catch {}
    const providerName=String(data?.name||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,48);
    const providerIssues=Array.isArray(data?.details)?[...new Set(data.details.map((item)=>String(item?.issue||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,48)).filter(Boolean))].slice(0,4):[];
    const safeDiagnostic=!response.ok?` [${providerName|| (providerIssues.length?'PAYPAL_ERROR':structuredError?'UNCLASSIFIED_ERROR':'NON_JSON_ERROR')}${providerIssues.length?':'+providerIssues.join(','):''}]`:'';
    log(`${method} ${url} → ${response.status}${safeDiagnostic}`, response.ok, orgId);
    if (!response.ok) { const error = new Error('PayPal Sandbox returned an error for this request. Check the API activity log and sandbox order state.'); error.requestSent = true; error.paypalResponse = true; error.statusCode = 502; throw error; }
    return data;
  }

  async function verifyWebhook(headers, body, rawBody) {
    if (!config.PAYPAL_WEBHOOK_ID) return 'UNVERIFIED';
    const required = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
    if (required.some((key) => typeof headers[key] !== 'string' || !headers[key])) return 'ERROR';
    try {
      const verificationRequest = { auth_algo: headers['paypal-auth-algo'], cert_url: headers['paypal-cert-url'], transmission_id: headers['paypal-transmission-id'], transmission_sig: headers['paypal-transmission-sig'], transmission_time: headers['paypal-transmission-time'], webhook_id: config.PAYPAL_WEBHOOK_ID };
      const rawVerificationBody = typeof rawBody === 'string' && rawBody
        ? `${JSON.stringify(verificationRequest).slice(0,-1)},"webhook_event":${rawBody}}`
        : null;
      const data = await pp('POST', '/v1/notifications/verify-webhook-signature', { ...verificationRequest, webhook_event: body }, undefined, null, rawVerificationBody);
      return data.verification_status === 'SUCCESS' ? 'VERIFIED' : 'FAILED';
    } catch { return 'ERROR'; }
  }
  return { pp, ppToken, verifyWebhook };
}
