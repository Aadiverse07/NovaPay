import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseServices } from '../src/services/supabase.js';

const config = { hasSupabase: true, SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret' };

test('Supabase service verifies bearer tokens with anon key and uses service role only server-side', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-a', email: 'a@example.test' }), { status: 200 });
    if (String(url).includes('/rest/v1/memberships?')) return new Response(JSON.stringify([{ org_id: 'org-a', user_id: 'user-a', role: 'owner' }]), { status: 200 });
    if (String(url).endsWith('/rest/v1/rpc/create_organization_for_user')) return new Response(JSON.stringify({ organizationId: 'org-a', created: true }), { status: 200 });
    if (String(url).endsWith('/rest/v1/audit_log')) return new Response(null, { status: 201 });
    throw new Error('unexpected request');
  };
  const services = createSupabaseServices(config, fetchImpl);
  assert.deepEqual(await services.verifyToken('jwt-token'), { id: 'user-a', email: 'a@example.test' });
  assert.equal((await services.membership('user-a', 'org-a')).role, 'owner');
  assert.deepEqual(await services.onboard('user-a', 'Org A', 'request-1'), { organizationId: 'org-a', created: true });
  await services.audit({ orgId: 'org-a', actorId: 'user-a', action: 'test', entity: 'test', requestId: 'request-1' });
  assert.equal(calls[0].options.headers.apikey, config.SUPABASE_ANON_KEY);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer jwt-token');
  assert.equal(calls[0].options.headers.Authorization.includes(config.SUPABASE_SERVICE_ROLE_KEY), false);
  assert.equal(calls[1].options.headers.apikey, config.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(calls.length, 4);
});

test('invalid JWT is rejected; Supabase service outages fail closed', async () => {
  const unauthorized = createSupabaseServices(config, async () => new Response('{}', { status: 401 }));
  assert.equal(await unauthorized.verifyToken('expired'), null);
  const offline = createSupabaseServices(config, async () => { throw new Error('provider details'); });
  await assert.rejects(offline.verifyToken('valid-looking'), /Supabase service is unavailable/);
});

test('new Supabase secret keys are sent as apikey only, never as bearer JWTs', async () => {
  let seen;
  const services = createSupabaseServices({ ...config, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_new-format' }, async (_url, options) => {
    seen = options.headers;
    return new Response(JSON.stringify([]), { status: 200 });
  });
  await services.membership('user-a', 'org-a');
  assert.equal(seen.apikey, 'sb_secret_new-format');
  assert.equal(Object.hasOwn(seen, 'Authorization'), false);
});

test('document upload SQL rate limit is surfaced as HTTP 429 without database details', async () => {
  const services = createSupabaseServices(config, async () => new Response(JSON.stringify({ code: 'P0001', message: 'document upload rate limit reached' }), { status: 400 }));
  await assert.rejects(services.database.rpc('reserve_document_upload', {}), (error) => {
    assert.equal(error.statusCode, 429);
    assert.equal(error.code, 'DOCUMENT_UPLOAD_RATE_LIMITED');
    assert.equal(error.message, 'Document upload rate limit reached.');
    return true;
  });
});

test('private Storage download uses the server-side service role and returns bytes without logging content', async () => {
  let seen;
  const bytes = Buffer.from('%PDF-test');
  const services = createSupabaseServices(config, async (url, options) => {
    seen = { url: String(url), options };
    return new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } });
  });
  const downloaded = await services.storage.download('novapay-documents', 'org-id/document-id/sample file.pdf');
  assert.equal(downloaded.toString(), bytes.toString());
  assert.match(seen.url, /sample%20file\.pdf$/);
  assert.equal(seen.options.headers.apikey, config.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(seen.options.method, 'GET');
});
