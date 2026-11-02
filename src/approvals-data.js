(function (root) {
  "use strict";
  var labels = { refund: "Refund", "dispute-evidence": "Dispute evidence", "hold-payout": "Payout hold", "send-invoice": "Invoice send", "maintenance-payment": "Maintenance payment", other: "Approval" };
  function statusLabel(value) { return String(value || "pending").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function map(row) {
    var payload = row && row.requestPayload || {}, type = row && row.proposalType || "other";
    var evidence = Array.isArray(payload.evidenceIds) ? payload.evidenceIds : [];
    return {
      id: row.approvalId, approvalId: row.approvalId, type: labels[type] ? type : "other",
      txId: row.captureId || payload.targetId || "", captureId: row.captureId || "", invoiceId: row.invoiceId || "",
      title: String(payload.title || "Approval requiring review"), reason: String(payload.reason || "No reason supplied by requester."),
      source: payload.source === "ai" ? "NovaPay AI" : "Recorded request",
      display: row.amount != null ? String(row.currency || "") + " " + String(row.amount) : (row.currency || "Not applicable"),
      currency: row.currency || "", amount: row.amount == null ? null : String(row.amount),
      evidence: evidence.length ? "Evidence record IDs: " + evidence.join(", ") : "No supporting evidence IDs supplied.",
      status: statusLabel(row.status), rawStatus: row.status, persisted: true, simulatedOnly: false,
      resultId: row.result && row.result.refundId || "", resultStatus: row.result && row.result.status || "", error: row.decisionNote || ""
    };
  }
  function rows(response) { return Array.isArray(response && response.approvals) ? response.approvals.map(map) : []; }
  var api = { map: map, rows: rows, statusLabel: statusLabel };
  root.NovaPayApprovalsData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
