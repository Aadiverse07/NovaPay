import { detectAnomalies } from '../ai/anomalies.js';

export function createAnomalyService({ repos, config, now = () => new Date() }) {
  return async function runAnomalyScan(orgId) {
    if (!orgId) throw new Error('Verified organization context is required.');
    const at = now();
    const [transactions, events, reconciliation] = await Promise.all([
      repos.listTransactions(orgId, { limit: 1000, offset: 0 }),
      repos.events.anomalyCandidates(orgId, Number(config.ANOMALY_STALE_WEBHOOK_MINUTES || 10)),
      repos.reconcile(orgId, 'USD'),
    ]);
    const findings = detectAnomalies({ transactions: transactions || [], events: events || [], reconciliation, config, now: at });
    const created = [];
    for (const finding of findings) {
      const result = await repos.anomalies.record(orgId, finding, at);
      if (result?.inserted) created.push(result.anomaly);
    }
    return { scannedAt: at.toISOString(), checkedTransactions: (transactions || []).length, checkedEvents: (events || []).length, findings: findings.length, created: created.length, anomalies: created };
  };
}

export function startAnomalyWorker({ repos, runAnomalyScan, intervalMs = 21600000, logger = console }) {
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running || typeof repos.ai?.listOrgIds !== 'function') return;
    running = true;
    try {
      const orgIds = await repos.ai.listOrgIds();
      for (const orgId of orgIds || []) {
        try { await runAnomalyScan(orgId); } catch { logger.warn?.('NovaPay anomaly scan failed for an organization.'); }
      }
    } catch { logger.warn?.('NovaPay anomaly scan could not list organizations.'); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return { run, stop() { stopped = true; clearInterval(timer); } };
}
