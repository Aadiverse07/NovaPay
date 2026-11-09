const map = new Map();
function add(category, code, retryable, userMessage, nextStep, aliases = []) {
  for (const issue of [code, ...aliases]) map.set(issue, { category, code, retryable, userMessage, nextStep });
}
add('credentials','AUTHENTICATION_FAILURE',false,'PayPal could not verify the Sandbox credentials.','Ask an administrator to check the PayPal Sandbox app credentials.',['NOT_AUTHORIZED']);
add('bank_or_card_declined','INSTRUMENT_DECLINED',false,'The buyer’s payment method was declined.','Ask the buyer to choose another Sandbox payment method.');
add('payer_action_required','PAYER_ACTION_REQUIRED',false,'The buyer needs to complete an action before this payment can continue.','Return to PayPal and finish the requested buyer action.');
add('order_state','ORDER_NOT_APPROVED',false,'This order has not been approved by the buyer.','Approve the order in PayPal Sandbox before capturing it.',['ORDER_ALREADY_CAPTURED']);
add('account_restriction','PAYER_CANNOT_PAY',false,'The payer or merchant account cannot make this payment.','Review the account status in PayPal Sandbox.',['PAYER_ACCOUNT_RESTRICTED','PAYEE_BLOCKED_TRANSACTION']);
add('verification_required','CARD_EXPIRED',false,'The payment method needs attention before this payment can continue.','Ask the buyer to use a valid Sandbox payment method.');
add('validation','AMOUNT_MISMATCH',false,'The amount or currency did not match the expected payment.','Check the order and payment details before trying again.',['ITEM_TOTAL_MISMATCH']);
add('refund_limit','REFUND_AMOUNT_EXCEEDED',false,'The refund is greater than the remaining refundable amount.','Check completed and pending refunds, then request no more than the remaining balance.',['CAPTURED_AMOUNT_FULLY_REFUNDED']);
const result = (category, code, retryable, userMessage, nextStep) => ({ category, code, retryable, userMessage, nextStep });
export function classifyFailure(error = {}, context = {}) {
  if (error.networkError) return result('network','NETWORK_ERROR',true,'PayPal could not be reached.','Check the connection and recent PayPal Sandbox activity before retrying.');
  const candidates = [...(error.providerIssues || []), error.providerName, error.code].filter(Boolean).map(String);
  for (const candidate of candidates) if (map.has(candidate)) return { ...map.get(candidate) };
  const status = Number(error.httpStatus || error.statusCode);
  if (status === 429) return result('rate_limited','RATE_LIMITED',true,'PayPal is receiving too many requests.','Wait briefly, then retry with the same request.');
  if (status >= 500 && status <= 599) return result('provider_outage','PROVIDER_OUTAGE',true,'PayPal Sandbox is temporarily unavailable.','Wait for PayPal Sandbox to recover, then retry with the same request.');
  if (status === 401 || status === 403) return result('credentials','AUTHORIZATION_FAILURE',false,'PayPal did not authorize this request.','Ask an administrator to check the Sandbox app permissions.');
  if (context.validation) return result('validation','VALIDATION_ERROR',false,'The payment details are invalid.','Check the amount and currency.');
  return result('unknown','UNKNOWN_FAILURE',false,'The payment failed for an unclassified reason.','Review PayPal Sandbox activity or contact support.');
}
