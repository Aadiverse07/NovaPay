export function buildMaintenanceRunFixtures(runId) {
  const suffix = String(runId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80);
  if (!suffix) throw new Error('maintenance verifier run ID is required');
  return {
    contractor: 'T3 Fixed Live Verification Contractor',
    low: { title: `T3 Verifier ${suffix} Self Approval`, documentRef: `T3-LIVE-${suffix}-LOW`, amountMinor: 9999, requester: 'owner' },
    threshold: { title: `T3 Verifier ${suffix} Dual Approval`, documentRef: `T3-LIVE-${suffix}-THRESHOLD`, amountMinor: 10000, requester: 'accountant' },
  };
}

export async function cleanupMaintenanceRun({ orgId, requests, contractor, service }) {
  const ids = [...new Set((requests || []).map((row) => row?.id).filter(Boolean))];
  if (!ids.length && !contractor?.id) return { requests: 0, contractor: 0 };
  const call = async (table, filters, method, body) => {
    const query = new URLSearchParams({ org_id: `eq.${orgId}`, ...filters }).toString();
    const result = await service(`/rest/v1/${table}?${query}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: body === undefined ? { Prefer: 'return=representation' } : { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    });
    if (![200, 204].includes(result.status)) throw new Error(`cleanup-${table}-failed-http-${result.status}`);
    return result;
  };

  if (ids.length) {
    const inIds = `in.(${ids.join(',')})`;
    // Unlink selected quotations before deleting mutually-referencing rows.
    await call('maintenance_requests', { id: inIds }, 'PATCH', { chosen_quotation_id: null });
    for (const table of ['fund_maintenance_payments', 'fund_completion_evidence', 'fund_allocations', 'fund_approvals_chain', 'fund_quotations']) {
      await call(table, { maintenance_request_id: inIds }, 'DELETE');
    }
    await call('maintenance_requests', { id: inIds }, 'DELETE');
  }
  if (contractor?.id) await call('fund_contractors', { id: `eq.${contractor.id}` }, 'DELETE');
  return { requests: ids.length, contractor: contractor?.id ? 1 : 0 };
}
