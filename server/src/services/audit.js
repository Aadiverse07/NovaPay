export function createAuditHelper(supabase) {
  return async ({ orgId, actorId, action, entity, entityId = null, metadata = {}, requestId }) => {
    if (!supabase) throw new Error('Audit service is unavailable.');
    const { error } = await supabase.from('audit_log').insert({ org_id: orgId, actor_id: actorId, action, entity, entity_id: entityId, metadata, request_id: requestId });
    if (error) throw new Error('Audit entry could not be recorded.');
  };
}

export async function auditApiAction(identity, req, { action, entity, entityId = null, metadata = {} }) {
  if (!identity?.audit) return;
  await identity.audit({ orgId: req.orgId, actorId: req.user.id, action, entity, entityId, metadata, requestId: req.id });
}
