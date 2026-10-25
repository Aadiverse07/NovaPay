import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../server/src/config.js';
import { createApp } from '../server/src/app.js';

if (!config.hasSupabase) throw new Error('Supabase configuration is incomplete.');

const projectRef = new URL(config.SUPABASE_URL).hostname.split('.')[0];
const serviceKey = config.SUPABASE_SERVICE_ROLE_KEY;
const adminHeaders = {
  apikey: serviceKey,
  ...(serviceKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${serviceKey}` }),
  'content-type': 'application/json',
};
const publicHeaders = { apikey: config.SUPABASE_ANON_KEY, 'content-type': 'application/json' };
const secretValues = [serviceKey, config.PAYPAL_CLIENT_SECRET, config.resolvedLLMApiKey].filter(Boolean);
const artifacts = [];
const trackedResponses = [];
let server;
let serverUrl;
let cliTemp;
let outcome = 'FAIL';

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  trackedResponses.push(text);
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { status: response.status, body, text };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function adminCreateUser(email, password) {
  const result = await request(`${config.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert([200, 201].includes(result.status) && result.body?.id, 'Could not create a throwaway Supabase user.');
  artifacts.push({ userId: result.body.id });
  return result.body.id;
}

async function signIn(email, password) {
  const result = await request(`${config.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: publicHeaders,
    body: JSON.stringify({ email, password }),
  });
  assert(result.status === 200 && result.body?.access_token, 'Could not sign in a throwaway Supabase user.');
  return result.body.access_token;
}

function userHeaders(token, orgId) {
  return { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(orgId ? { 'x-org-id': orgId } : {}) };
}

async function api(pathname, { token, orgId, method = 'GET', body } = {}) {
  return request(`${serverUrl}${pathname}`, {
    method,
    headers: { ...(token ? userHeaders(token, orgId) : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function runCliSql(sql, label) {
  const file = path.join(cliTemp, `${label}.sql`);
  // The query contains only script-generated UUIDs, never environment values.
  return writeFile(file, sql, { mode: 0o600 }).then(() => {
    try {
      execFileSync('npx', ['--yes', 'supabase', 'db', 'query', '--linked', '--project-ref', projectRef, '--file', file, '--output', 'json'], {
        cwd: process.cwd(), stdio: 'pipe', encoding: 'utf8', env: process.env,
      });
    } catch {
      throw new Error(`Supabase CLI ${label} query failed. Confirm CLI login and project database access.`);
    }
  });
}

async function checkMigrationAndPrivileges() {
  const sql = `do $$ begin
    if to_regclass('public.organizations') is null or to_regclass('public.profiles') is null or
       to_regclass('public.memberships') is null or to_regclass('public.audit_log') is null or
       to_regprocedure('public.create_organization_for_user(uuid,text,text)') is null then
      raise exception 'Phase 1 migration objects are missing';
    end if;
    if not has_table_privilege('service_role','public.audit_log','INSERT') or
       has_table_privilege('service_role','public.audit_log','SELECT') or
       has_table_privilege('service_role','public.audit_log','UPDATE') or
       has_table_privilege('service_role','public.audit_log','DELETE') then
      raise exception 'audit_log service-role privileges do not match insert-only policy';
    end if;
  end $$;`;
  await runCliSql(sql, 'preflight');
}

async function cleanup() {
  if (artifacts.some((item) => item.orgId) && artifacts.some((item) => item.userId)) {
    const orgIds = artifacts.filter((item) => item.orgId).map((item) => `'${item.orgId}'::uuid`).join(',');
    const userIds = artifacts.filter((item) => item.userId).map((item) => `'${item.userId}'::uuid`).join(',');
    const sql = `begin;
      delete from public.audit_log where org_id in (${orgIds}) or actor_id in (${userIds});
      delete from public.organizations where id in (${orgIds});
      commit;`;
    await runCliSql(sql, 'cleanup');
  }
  for (const item of artifacts.filter((entry) => entry.userId)) {
    const result = await request(`${config.SUPABASE_URL}/auth/v1/admin/users/${item.userId}`, { method: 'DELETE', headers: adminHeaders });
    assert([200, 204].includes(result.status), 'Could not remove a throwaway Supabase user.');
  }
}

try {
  cliTemp = await mkdtemp(path.join(os.tmpdir(), 'novapay-phase1-'));
  await checkMigrationAndPrivileges();

  const app = createApp({ config });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  serverUrl = `http://127.0.0.1:${server.address().port}`;

  const unauthenticated = await api('/api/events');
  assert(unauthenticated.status === 401 && unauthenticated.body?.error?.code === 'AUTH_REQUIRED', 'Unauthenticated request did not return 401.');

  const suffix = randomUUID();
  const users = [
    { email: `novapay-phase1-a-${suffix}@example.test`, password: randomBytes(32).toString('base64url') },
    { email: `novapay-phase1-b-${suffix}@example.test`, password: randomBytes(32).toString('base64url') },
  ];
  const userA = await adminCreateUser(users[0].email, users[0].password);
  const userB = await adminCreateUser(users[1].email, users[1].password);
  const tokenA = await signIn(users[0].email, users[0].password);
  const tokenB = await signIn(users[1].email, users[1].password);

  const onboardA = await api('/api/onboarding', { token: tokenA, method: 'POST', body: { organizationName: `Phase 1 A ${suffix.slice(0, 8)}` } });
  assert(onboardA.status === 201 && onboardA.body?.created === true, 'First onboarding did not create an organization.');
  const orgA = onboardA.body.organizationId;
  artifacts.push({ orgId: orgA });
  const repeatA = await api('/api/onboarding', { token: tokenA, method: 'POST', body: { organizationName: 'Ignored repeat name' } });
  assert(repeatA.status === 200 && repeatA.body?.created === false && repeatA.body.organizationId === orgA, 'Repeated onboarding was not idempotent.');

  const onboardB = await api('/api/onboarding', { token: tokenB, method: 'POST', body: { organizationName: `Phase 1 B ${suffix.slice(0, 8)}` } });
  assert(onboardB.status === 201 && onboardB.body?.created === true, 'Second onboarding did not create an organization.');
  const orgB = onboardB.body.organizationId;
  artifacts.push({ orgId: orgB });

  const crossOrgQuery = new URLSearchParams({ select: 'id', id: `eq.${orgB}` });
  const crossOrg = await request(`${config.SUPABASE_URL}/rest/v1/organizations?${crossOrgQuery}`, { headers: userHeaders(tokenA) });
  assert(crossOrg.status === 200 && Array.isArray(crossOrg.body) && crossOrg.body.length === 0, 'Organization A could read organization B.');

  const auditQuery = new URLSearchParams({ select: 'id,action,actor_id,org_id', org_id: `eq.${orgB}`, actor_id: `eq.${userB}`, action: 'eq.organization.created' });
  const audit = await request(`${config.SUPABASE_URL}/rest/v1/audit_log?${auditQuery}`, { headers: userHeaders(tokenB) });
  assert(audit.status === 200 && Array.isArray(audit.body) && audit.body.length === 1, 'Owner could not read its onboarding audit row through JWT and RLS.');

  const demote = await request(`${config.SUPABASE_URL}/rest/v1/memberships?${new URLSearchParams({ org_id: `eq.${orgA}`, user_id: `eq.${userA}` })}`, {
    method: 'PATCH', headers: { ...adminHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ role: 'viewer' }),
  });
  assert(demote.status === 204, 'Could not set throwaway user A to viewer for the RBAC check.');
  const viewerAction = await api('/api/approvals/register', { token: tokenA, orgId: orgA, method: 'POST', body: {} });
  assert(viewerAction.status === 403 && viewerAction.body?.error?.code === 'ROLE_FORBIDDEN', 'Viewer was not denied the approver-only action.');

  const publicConfig = await api('/api/public-config');
  assert(publicConfig.status === 200 && publicConfig.body?.supabaseAnonKey === config.SUPABASE_ANON_KEY, 'Public config shape is incorrect.');
  for (const text of trackedResponses) {
    for (const secret of secretValues) assert(!text.includes(secret), 'A server-side secret appeared in an HTTP response.');
  }

  outcome = 'PASS';
  console.log('Live Phase 1 checks passed: migration/RLS grants, unauthenticated 401, cross-tenant isolation, viewer RBAC, onboarding idempotency, JWT/RLS audit read, public-config secret exclusion.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Live Phase 1 verification failed.');
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    await cleanup();
    if (artifacts.length) console.log('Throwaway Supabase users and organizations cleaned up.');
  } catch (error) {
    outcome = 'FAIL';
    console.error(error instanceof Error ? error.message : 'Throwaway Supabase cleanup failed.');
  }
  if (cliTemp) await rm(cliTemp, { recursive: true, force: true });
}

if (outcome !== 'PASS') process.exitCode = 1;
