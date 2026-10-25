import { moneyToMinor } from '../repos/postgres.js';

const amountMinor = (value, field) => {
  try { return moneyToMinor(value); } catch { throw new Error(`Invalid PayPal ${field} amount.`); }
};

function line(accountCode, debitMinor, creditMinor, currency) {
  if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor) || debitMinor < 0 || creditMinor < 0 || (debitMinor === 0) === (creditMinor === 0)) throw new Error('Invalid journal line.');
  return { accountCode, debitMinor, creditMinor, currency };
}

function assertBalanced(lines) {
  const debit = lines.reduce((sum, row) => sum + BigInt(row.debitMinor), 0n);
  const credit = lines.reduce((sum, row) => sum + BigInt(row.creditMinor), 0n);
  if (!lines.length || debit === 0n || debit !== credit) throw new Error('Journal entry is not balanced.');
  return lines;
}

function validCurrency(currency) {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) throw new Error('PayPal currency code is invalid.');
  return currency;
}

export function captureJournalLines(capture) {
  const currency = validCurrency(capture.currency || capture.amount?.currency_code);
  const grossText = capture.gross ?? capture.amount?.value;
  const feeText = capture.fee ?? capture.seller_receivable_breakdown?.paypal_fee?.value;
  const netText = capture.net ?? capture.seller_receivable_breakdown?.net_amount?.value;
  const gross = amountMinor(grossText, 'gross');
  if (gross <= 0) throw new Error('PayPal gross amount must be positive.');
  if (feeText != null && netText != null) {
    const fee = amountMinor(feeText, 'fee');
    const net = amountMinor(netText, 'net');
    if (net < 0 || fee < 0 || gross !== net + fee) throw new Error('PayPal capture breakdown does not balance.');
    return assertBalanced([
      ...(net ? [line('1000', net, 0, currency)] : []),
      ...(fee ? [line('5000', fee, 0, currency)] : []),
      line('4000', 0, gross, currency),
    ]);
  }
  return assertBalanced([line('1010', gross, 0, currency), line('4000', 0, gross, currency)]);
}

export function fundContributionJournalLines(capture) {
  return captureJournalLines(capture).map((entry) => entry.accountCode === '4000'
    ? { ...entry, accountCode: '4100' }
    : entry);
}

export function refundJournalLines(refund) {
  const currency = validCurrency(refund.currency || refund.amount?.currency_code);
  const grossText = refund.gross ?? refund.seller_payable_breakdown?.gross_amount?.value ?? refund.amount?.value;
  const feeText = refund.fee ?? refund.seller_payable_breakdown?.paypal_fee?.value;
  const netText = refund.net ?? refund.seller_payable_breakdown?.net_amount?.value;
  const gross = amountMinor(grossText, 'refund gross');
  if (gross <= 0) throw new Error('PayPal refund gross amount must be positive.');
  if (feeText == null || netText == null) return assertBalanced([line('4050', gross, 0, currency), line('1000', 0, gross, currency)]);
  const fee = amountMinor(feeText, 'refund fee');
  const net = amountMinor(netText, 'refund net');
  if (net < 0 || gross !== net + fee) throw new Error('PayPal refund breakdown does not balance.');
  const lines = [line('4050', gross, 0, currency)];
  if (fee >= 0) {
    if (net) lines.push(line('1000', 0, net, currency));
    if (fee) lines.push(line('5000', 0, fee, currency));
  } else {
    if (net) lines.push(line('1000', 0, net, currency));
    lines.push(line('5000', Math.abs(fee), 0, currency));
  }
  return assertBalanced(lines);
}

export const isJournalBalanced = (lines) => {
  const debit = lines.reduce((sum, row) => sum + BigInt(row.debitMinor), 0n);
  const credit = lines.reduce((sum, row) => sum + BigInt(row.creditMinor), 0n);
  return lines.length >= 2 && debit > 0n && debit === credit;
};
