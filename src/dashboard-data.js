(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NovaPayDashboardData = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function digits(currency) {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency || "USD").toUpperCase() }).resolvedOptions().maximumFractionDigits; }
    catch (_) { return 2; }
  }
  function formatMinor(value, currency) {
    var code = String(currency || "USD").toUpperCase(), places = digits(code), amount;
    try { amount = BigInt(value == null ? 0 : value); } catch (_) { return "—"; }
    var negative = amount < 0n; if (negative) amount = -amount;
    var scale = 10n ** BigInt(places), whole = amount / scale, fraction = places ? "." + String(amount % scale).padStart(places, "0") : "";
    return code + " " + (negative ? "-" : "") + whole.toLocaleString("en-US") + fraction;
  }
  function formatMajor(value, currency) {
    if (value == null || value === "") return "—";
    var places = digits(currency), raw = String(value == null ? "0" : value).trim(), match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!match) return "—";
    var fraction = (match[3] || "").slice(0, places).padEnd(places, "0"), minor;
    try { minor = BigInt(match[2]) * (10n ** BigInt(places)) + BigInt(fraction || "0"); } catch (_) { return "—"; }
    return formatMinor(match[1] ? -minor : minor, currency);
  }
  function totals(rows, field, predicate) {
    var byCurrency = Object.create(null);
    (rows || []).forEach(function (row) {
      if (predicate && !predicate(row)) return;
      var currency = String(row.currency || "USD").toUpperCase(), value;
      try { value = BigInt(row[field] == null ? 0 : row[field]); } catch (_) { return; }
      byCurrency[currency] = (byCurrency[currency] || 0n) + value;
    });
    return byCurrency;
  }
  function formatGroups(groups) {
    return Object.keys(groups).sort().map(function (currency) { return formatMinor(groups[currency], currency); }).join(" · ") || "—";
  }
  function localDate(value) {
    var date = value instanceof Date ? value : new Date(value);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function metrics(profitRows, feeRows, refundRows) {
    var revenue = totals(profitRows, "amount_minor", function (row) { return row.account_type === "revenue"; });
    var contra = totals(profitRows, "amount_minor", function (row) { return row.account_type === "contra_revenue"; });
    var expenses = totals(profitRows, "amount_minor", function (row) { return row.account_type === "expense"; });
    var fees = totals(feeRows, "fee_minor"), refunds = totals(refundRows, "refund_minor");
    var net = Object.create(null);
    new Set(Object.keys(revenue).concat(Object.keys(contra), Object.keys(expenses))).forEach(function (currency) {
      net[currency] = (revenue[currency] || 0n) - (contra[currency] || 0n) - (expenses[currency] || 0n);
    });
    return { revenue: formatGroups(revenue), fees: formatGroups(fees), refunds: formatGroups(refunds), net: formatGroups(net), revenueByCurrency: revenue, feesByCurrency: fees, refundsByCurrency: refunds, netByCurrency: net };
  }
  function cashMovement(rows) {
    var currencies = new Set((rows || []).map(function (row) { return String(row.currency || "USD").toUpperCase(); }));
    if (currencies.size > 1) return { multiCurrency: true, currencies: Array.from(currencies).sort(), points: [] };
    return { multiCurrency: false, currency: Array.from(currencies)[0] || null, points: (rows || []).map(function (row) { return { period: String(row.period || ""), value: String(row.cash_movement_minor || 0) }; }) };
  }
  return { formatMinor: formatMinor, formatMajor: formatMajor, metrics: metrics, cashMovement: cashMovement, localDate: localDate };
}));
