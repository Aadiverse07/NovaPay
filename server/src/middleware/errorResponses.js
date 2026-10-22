export function legacyErrorCode(method, path, status) {
  const route = String(path || '/')
    .toUpperCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^A-Z0-9]+/g, '_') || 'ROOT';
  return `LEGACY_${String(method || 'GET').toUpperCase()}_${route}_${Number(status) || 500}`;
}

export function legacyErrorBody(method, path, status, message) {
  return { error: String(message), code: legacyErrorCode(method, path, status) };
}

export function structuredErrorBody(code, message) {
  return { error: { code: String(code), message: String(message) } };
}

// Keep the Phase 0 error string byte-for-byte compatible and add a stable route/status code.
export function legacyErrorCompatibility(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && typeof body.error === 'string' && typeof body.code !== 'string') {
      const path = String(req.originalUrl || req.path).split('?')[0];
      body = { ...body, code: legacyErrorCode(req.method, path, res.statusCode) };
    }
    return json(body);
  };
  next();
}
