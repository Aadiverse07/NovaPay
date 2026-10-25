import { paypalRequestId } from './paypal.js';
import { auditApiAction } from './audit.js';

const problem = (status, code, message, retryBlocked = false) => ({ status, body: { error: { code, message }, ...(retryBlocked ? { retryBlocked: true } : {}) } });

function legacyRefundShape(approval) {
  const result = approval?.result;
  if (!result) return null;
  if (result.refundId) return result;
  return { refundId: result.id, status: result.status, captureId: approval.captureId, amount: approval.amount, currency: approval.currency };
}

export async function decideApproval({ repos, paypal, identity, req, approvalId, decision, note = '' }) {
  const current = await repos.approvals.get(approvalId, req.orgId);
  if (!current) return problem(404, 'APPROVAL_NOT_FOUND', 'The approval was not found in this organization.');
  if (current.proposalType !== 'refund') return problem(400, 'APPROVAL_TYPE_UNSUPPORTED', 'Only linked refund approvals can be processed in this phase.');
  if (decision === 'approve' && current.status?.toLowerCase() === 'completed') return { status: 200, body: legacyRefundShape(current), completed: true };

  if (!identity?.database) await auditApiAction(identity, req, { action: `approval.${decision}`, entity: 'approval', entityId: approvalId, metadata: { decision, note } });
  let result;
  try { result = await repos.approvals.decide(approvalId, req.orgId, decision, note, req.user.id, req.id); }
  catch (error) {
    if (error.message?.includes('remaining amount') || error.databaseCode === '22003') return problem(400, 'REFUND_AMOUNT_EXCEEDED', 'Refund amount exceeds the remaining refundable amount.');
    if (error.databaseCode === 'P0002') return problem(404, 'APPROVAL_NOT_FOUND', 'The approval was not found in this organization.');
    if (error.databaseCode === '23505') return problem(409, 'APPROVAL_ALREADY_DECIDED', 'This approval is no longer pending.');
    throw error;
  }
  if (result.result === 'missing') return problem(404, 'APPROVAL_NOT_FOUND', 'The approval was not found in this organization.');
  if (result.result === 'already_decided') return problem(409, 'APPROVAL_ALREADY_DECIDED', 'This approval is no longer pending.');
  if (result.result === 'already_submitted') {
    const cached = legacyRefundShape(result.approval);
    return result.approval?.status?.toLowerCase() === 'completed' && cached
      ? { status: 200, body: cached, completed: true }
      : problem(409, 'REFUND_ALREADY_SUBMITTED', 'This refund is already being processed or requires PayPal verification.', true);
  }
  if (decision === 'reject') return { status: 200, body: { approvalId, status: 'rejected', reviewerId: req.user.id, decisionNote: note } };

  const approval = result.approval;
  const capture = await repos.captures.get(approval.captureId, req.orgId);
  if (!capture || capture.status !== 'COMPLETED') {
    await repos.approvals.setRefundOutcome(approvalId, req.orgId, 'pending', { error: 'Capture is no longer available.' });
    return problem(404, 'CAPTURE_NOT_FOUND', 'The completed capture linked to this approval is unavailable.');
  }
  const amount = approval.amount;
  try {
    const data = await paypal.pp('POST', `/v2/payments/captures/${encodeURIComponent(approval.captureId)}/refund`, {
      amount: { value: amount, currency_code: approval.currency },
      note_to_payer: String(note || 'Refund approved in NovaPay').slice(0, 255),
    }, paypalRequestId('refund', `${req.orgId}:${approvalId}`), req.orgId);
    if (data.status !== 'COMPLETED' || !data.id) {
      const incomplete = { id: data.id || null, status: String(data.status || 'UNKNOWN'), amount: data.amount || { value: amount, currency_code: approval.currency }, seller_payable_breakdown: data.seller_payable_breakdown || null };
      await repos.approvals.setRefundOutcome(approvalId, req.orgId, 'pending_verification', incomplete);
      return problem(409, 'REFUND_PENDING_VERIFICATION', `PayPal returned ${incomplete.status}; verify the refund before retrying.`, true);
    }
    const financial = {
      id: data.id,
      status: data.status,
      amount: data.amount || { value: amount, currency_code: approval.currency },
      seller_payable_breakdown: data.seller_payable_breakdown || null,
      update_time: data.update_time || null,
    };
    const saved = await repos.approvals.finishRefund(approvalId, req.orgId, financial);
    const response = legacyRefundShape(saved);
    return { status: 200, body: response || { refundId: data.id, status: data.status, captureId: approval.captureId, amount, currency: approval.currency }, completed: true };
  } catch (error) {
    if (error.requestSent && !error.paypalResponse) {
      await repos.approvals.setRefundOutcome(approvalId, req.orgId, 'pending_verification', { status: 'UNKNOWN' });
      return problem(503, 'REFUND_OUTCOME_UNCERTAIN', 'PayPal request outcome is uncertain. Verify PayPal Sandbox before taking further action.', true);
    }
    await repos.approvals.setRefundOutcome(approvalId, req.orgId, 'pending', { status: 'FAILED' });
    throw error;
  }
}
