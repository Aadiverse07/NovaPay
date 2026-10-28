import { createAuditHelper } from './audit.js';

async function readResponse(response) {
  try { return await response.json(); } catch { return null; }
}

export function createSupabaseServices(config, fetchImpl = fetch) {
  if (!config.hasSupabase) return null;
  const apiKey = config.SUPABASE_SERVICE_ROLE_KEY;
  const apiUrl = config.SUPABASE_URL.replace(/\/$/, '');
  const serviceHeaders = { apikey: apiKey, ...(apiKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${apiKey}` }) };
  async function request(path, { method = 'GET', token, body, publicKey = false, prefer } = {}) {
    const headers = { ...(publicKey ? { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } : serviceHeaders) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    let response;
    try {
      response = await fetchImpl(`${apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    } catch {
      throw Object.assign(new Error('Supabase service is unavailable.'), { statusCode: 503, code: 'DATABASE_UNAVAILABLE' });
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
  const storage = {
    async upload(bucket, objectPath, bytes, contentType) {
      const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
      let response;
      try {
        response = await fetchImpl(`${apiUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
          method: 'POST', headers: { ...serviceHeaders, 'Content-Type': contentType, 'x-upsert': 'false' }, body: bytes,
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        throw Object.assign(new Error('Document storage is unavailable.'), { statusCode: 503, code: 'STORAGE_UNAVAILABLE' });
      }
      if (!response.ok) throw Object.assign(new Error('Document storage rejected the upload.'), { statusCode: response.status >= 500 ? 503 : 400, code: 'STORAGE_UPLOAD_FAILED' });
      return true;
    },
    async remove(bucket, objectPaths) {
      let response;
      try {
        response = await fetchImpl(`${apiUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
          method: 'DELETE', headers: { ...serviceHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: objectPaths }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw Object.assign(new Error('Document storage cleanup is unavailable.'), { statusCode: 503, code: 'STORAGE_UNAVAILABLE' });
      }
      if (!response.ok) throw Object.assign(new Error('Document storage cleanup failed.'), { statusCode: 503, code: 'STORAGE_DELETE_FAILED' });
      return true;
    },
  };
  const database = {
    async rpc(name, args) {
      if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid database operation.');
      const result = await request(`/rest/v1/rpc/${name}`, { method: 'POST', body: args });
      if (result.error) {
        const uploadLimit = name === 'reserve_document_upload' && result.data?.code === 'P0001';
        throw Object.assign(new Error(uploadLimit ? 'Document upload rate limit reached.' : 'Financial database operation failed.'), {
          statusCode: uploadLimit ? 429 : 503,
          code: uploadLimit ? 'DOCUMENT_UPLOAD_RATE_LIMITED' : 'DATABASE_UNAVAILABLE',
          databaseCode: result.data?.code || null,
        });
      }
      return result.data;
    },
    async select(table, query) {
      if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error('Invalid database table.');
      const result = await request(`/rest/v1/${table}?${query}`);
      if (result.error) throw Object.assign(new Error('Financial database read failed.'), { statusCode: 503, code: 'DATABASE_UNAVAILABLE', databaseCode: result.data?.code || null });
      return result.data;
    },
    async insert(table, payload, prefer = 'return=representation') {
      if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error('Invalid database table.');
      const result = await request(`/rest/v1/${table}`, { method: 'POST', body: payload, prefer });
      if (result.error) throw Object.assign(new Error('Financial database write failed.'), { statusCode: 503, code: 'DATABASE_UNAVAILABLE', databaseCode: result.data?.code || null });
      return result.data;
    },
    async upsert(table, payload, onConflict) {
      if (!/^[a-z][a-z0-9_]*$/.test(table) || !/^[a-z][a-z0-9_,]*$/.test(onConflict)) throw new Error('Invalid database operation.');
      const result = await request(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, { method: 'POST', body: payload, prefer: 'resolution=merge-duplicates,return=representation' });
      if (result.error) throw Object.assign(new Error('Financial database write failed.'), { statusCode: 503, code: 'DATABASE_UNAVAILABLE', databaseCode: result.data?.code || null });
      return result.data;
    },
    async patch(table, query, payload, prefer = 'return=representation') {
      if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error('Invalid database table.');
      const result = await request(`/rest/v1/${table}?${query}`, { method: 'PATCH', body: payload, prefer });
      if (result.error) throw Object.assign(new Error('Financial database write failed.'), { statusCode: 503, code: 'DATABASE_UNAVAILABLE', databaseCode: result.data?.code || null });
      return result.data;
    },
  };
  return {
    database,
    storage,
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
