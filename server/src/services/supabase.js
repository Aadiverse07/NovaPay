import { createAuditHelper } from './audit.js';

async function readResponse(response) {
  try { return await response.json(); } catch { return null; }
}

export function createSupabaseServices(config, fetchImpl = fetch) {
  if (!config.hasSupabase) return null;
  const apiKey = config.SUPABASE_SERVICE_ROLE_KEY;
  const apiUrl = config.SUPABASE_URL.replace(/\/$/, '');
  const serviceHeaders = { apikey: apiKey, ...(apiKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${apiKey}` }) };
  async function request(path, { method = 'GET', token, body, publicKey = false } = {}) {
    const headers = { ...(publicKey ? { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } : serviceHeaders) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetchImpl(`${apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    } catch {
      throw new Error('Supabase service is unavailable.');
    }
    const data = await readResponse(response);
    if (!response.ok) return { response, data, error: true };
    return { response, data, error: false };
  }
  const client = {
    from(table) {
      if (table !== 'audit_log') throw new Error('Unsupported service table.');
      return {
        async insert(payload) {
          const { error, data } = await request('/rest/v1/audit_log', { method: 'POST', body: payload });
          return { error: error ? new Error('Audit write failed.') : null, data };
        },
      };
    },
  };
  return {
    audit: createAuditHelper(client),
    async verifyToken(token) {
      const { response, data, error } = await request('/auth/v1/user', { token, publicKey: true });
      if (error && [401, 403].includes(response.status)) return null;
      if (error || !data?.id) throw new Error('Supabase Auth could not verify the token.');
      return { id: data.id, email: typeof data.email === 'string' ? data.email : null };
    },
    async membership(userId, orgId) {
      const query = new URLSearchParams({ select: 'org_id,user_id,role', user_id: `eq.${userId}`, org_id: `eq.${orgId}`, limit: '1' });
      const { data, error } = await request(`/rest/v1/memberships?${query}`);
      if (error) throw new Error('Membership lookup failed.');
      return Array.isArray(data) ? data[0] || null : null;
    },
    async onboard(userId, name, requestId) {
      const { response, data, error } = await request('/rest/v1/rpc/create_organization_for_user', {
        method: 'POST', body: { p_user_id: userId, p_name: name, p_request_id: requestId },
      });
      if (error) {
        if (response.status === 409 || data?.code === '23505') throw new Error('ONBOARDING_ALREADY_COMPLETED');
        throw new Error('Onboarding could not be completed.');
      }
      return data;
    },
  };
}
