import { structuredErrorBody } from './errorResponses.js';

export function authMiddleware({ config, identity }) {
  return async (req, res, next) => {
    if (req.path === '/status' || req.path === '/public-config' || req.path === '/webhook') return next();
    if (!config.hasSupabase || !identity) return res.status(503).json(structuredErrorBody('SUPABASE_NOT_CONFIGURED', 'Authentication is unavailable until Supabase is configured.'));
    const authorization = req.get('authorization') || '';
    const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
    if (!match) return res.status(401).json(structuredErrorBody('AUTH_REQUIRED', 'A valid Supabase bearer token is required.'));
    try {
      const user = await identity.verifyToken(match[1]);
      if (!user) return res.status(401).json(structuredErrorBody('AUTH_INVALID', 'The Supabase bearer token is invalid or expired.'));
      req.user = user;
      if (req.path === '/onboarding' && req.method === 'POST') return next();
      const orgId = req.get('x-org-id');
      if (!orgId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orgId)) return res.status(400).json(structuredErrorBody('ORG_HEADER_REQUIRED', 'A valid X-Org-Id UUID is required.'));
      const membership = await identity.membership(user.id, orgId);
      if (!membership) return res.status(403).json(structuredErrorBody('ORG_FORBIDDEN', 'You are not a member of the requested organization.'));
      req.orgId = orgId;
      req.orgRole = membership.role;
      return next();
    } catch {
      return res.status(503).json(structuredErrorBody('AUTH_UNAVAILABLE', 'Authentication could not be verified.'));
    }
  };
}

export function rbac(requiredRoles) {
  const roles = new Set(requiredRoles);
  return (req, res, next) => req.orgRole && roles.has(req.orgRole)
    ? next()
    : res.status(403).json(structuredErrorBody('ROLE_FORBIDDEN', 'Your organization role cannot perform this action.'));
}
