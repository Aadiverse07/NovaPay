export async function cleanupUnconfirmed({ listUsers, hasRetainedReferences, deleteUser, dryRun = true, now = Date.now(), minAgeMs = 24 * 60 * 60_000 }) {
  const users = await listUsers();
  const cutoff = now - minAgeMs;
  const eligible = users.filter((user) => {
    const confirmed = user.email_confirmed_at || user.confirmed_at;
    const createdAt = Date.parse(user.created_at || '');
    return user.id && !confirmed && Number.isFinite(createdAt) && createdAt <= cutoff;
  });
  let skippedReferenced = 0;
  let deleted = 0;
  for (const user of eligible) {
    if (await hasRetainedReferences(user.id)) { skippedReferenced += 1; continue; }
    if (!dryRun) { await deleteUser(user.id); deleted += 1; }
  }
  return { eligible: eligible.length, skippedReferenced, deleted, dryRun };
}
