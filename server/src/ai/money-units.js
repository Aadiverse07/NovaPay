export function currencyMinorUnitExponent(currency) {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return null;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return null;
  }
}

export function decimalAmountToMinor(value, currency) {
  const exponent = currencyMinorUnitExponent(currency);
  const text = String(value ?? '');
  if (exponent === null || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new Error('Invalid currency amount.');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  if (fraction.length > exponent) throw new Error('Amount exceeds the currency minor-unit precision.');
  const scale = 10n ** BigInt(exponent);
  const minor = BigInt(whole) * scale + BigInt(fraction.padEnd(exponent, '0') || '0');
  return negative ? -minor : minor;
}

export function formatMinorAmount(minorValue, currency) {
  const exponent = currencyMinorUnitExponent(currency);
  if (exponent === null || !/^-?\d+$/.test(String(minorValue ?? ''))) return null;
  const minor = BigInt(minorValue);
  const absolute = minor < 0n ? -minor : minor;
  const scale = 10n ** BigInt(exponent);
  const whole = String(absolute / scale);
  const fraction = exponent ? `.${String(absolute % scale).padStart(exponent, '0')}` : '';
  return `${minor < 0n ? '-' : ''}${whole}${fraction} ${currency}`;
}
