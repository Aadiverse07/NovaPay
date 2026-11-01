import 'dotenv/config';
import { config } from '../server/src/config.js';
import { cleanupUnconfirmed } from './lib/unconfirmed-user-cleanup.mjs';

if (!config.hasSupabase) throw new Error('Supabase service configuration is required.');
const base = config.SUPABASE_URL.replace(/\/$/, '');
const headers = { apikey: config.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error('Supabase cleanup operation failed.');
  return data;
}
async function listUsers() {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const rows = await request(`/auth/v1/admin/users?page=${page}&per_page=100`);
    users.push(...(rows.users || []));
    if (!rows.users || rows.users.length < 100) break;
  }
  return users;
}
async function hasRetainedReferences(userId) {
  const id = encodeURIComponent(`eq.${userId}`);
  const [memberships, audits] = await Promise.all([
    request(`/rest/v1/memberships?select=user_id&user_id=${id}&limit=1`),
    request(`/rest/v1/audit_log?select=id&actor_id=${id}&limit=1`),
  ]);
  return Boolean((memberships || []).length || (audits || []).length);
}
const dryRun = !process.argv.includes('--apply');
const result = await cleanupUnconfirmed({
  listUsers, hasRetainedReferences,
  async deleteUser(id) { await request(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  dryRun,
});
console.log(JSON.stringify({ event: 'unconfirmed_auth_cleanup', dryRun: result.dryRun, eligible: result.eligible, skippedReferenced: result.skippedReferenced, deleted: result.deleted, olderThanHours: 24 }));
