(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NovaPayFinancialData = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function digits(currency) {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: String(currency || "USD").toUpperCase() }).resolvedOptions().maximumFractionDigits; }
    catch (_) { return 2; }
  }
  function formatMajor(value, currency) {
    if (value == null || value === "") return "—";
    var number = Number(value), code = String(currency || "USD").toUpperCase(), places = digits(code);
    if (!Number.isFinite(number)) return "—";
    return code + " " + number.toLocaleString("en-US", { minimumFractionDigits: places, maximumFractionDigits: places });
  }
  function formatMinor(value, currency) {
    var code = String(currency || "USD").toUpperCase(), places = digits(code), amount;
    try { amount = BigInt(value == null ? 0 : value); } catch (_) { return "—"; }
    var negative = amount < 0n; if (negative) amount = -amount;
    var scale = 10n ** BigInt(places), whole = amount / scale, fraction = places ? "." + String(amount % scale).padStart(places, "0") : "";
    return code + " " + (negative ? "-" : "") + whole.toLocaleString("en-US") + fraction;
  }
  function key(row) { return String(row && (row.refundId || row.captureId || row.id || row.sourceId) || ""); }
  function dedupeTransactions(rows) {
    var seen = new Set();
    return (rows || []).filter(function (row) { var id = key(row); if (!id || seen.has(id)) return false; seen.add(id); return true; });
  }
  function dateLabel(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return "Date unavailable";
    return new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  function transactionRow(row) {
    var currency = String(row.currency || "USD").toUpperCase(), id = key(row), type = row.type === "refund" || row.refundId ? "Refund" : "Payment";
    var amount = Number(row.amount), fee = row.fee == null ? null : Number(row.fee), net = row.net == null ? null : Number(row.net);
    var date = row.occurredAt || row.createdAt || "", buyer = row.buyerName || row.payerName || row.payerEmail || "PayPal Sandbox";
    return {
      id: id, type: type, status: String(row.status || "Unavailable"), currency: currency,
      amount: Number.isFinite(amount) ? String(amount) : "", date: date, buyer: buyer, source: "paypal-sandbox",
      cells: [dateLabel(date), type === "Refund" ? "↩ Refund" : "↗ Payment", buyer,
        formatMajor(row.amount, currency), formatMajor(row.fee, currency), formatMajor(row.net, currency),
        String(row.status || "Unavailable"), id],
      gross: Number.isFinite(amount) ? amount : null, fee: Number.isFinite(fee) ? fee : null, net: Number.isFinite(net) ? net : null
    };
  }
  function periodRange(period, now) {
    now = now instanceof Date ? now : new Date(now || Date.now());
    var start = new Date(now);
    if (period === "This year") start = new Date(now.getFullYear(), 0, 1);
    else if (period === "This quarter") start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    else start.setDate(start.getDate() - 30);
    return { from: start, to: now };
  }
  function entriesInPeriod(entries, period, now) {
    var range = periodRange(period, now);
    return (entries || []).filter(function (entry) { var time = Date.parse(entry.created_at || entry.createdAt || ""); return Number.isFinite(time) && time >= range.from.getTime() && time <= range.to.getTime(); });
  }
  function ledgerRows(entries) {
    return (entries || []).flatMap(function (entry) {
      return (entry.lines || []).map(function (line) {
        var account = line.accounts || line.account || {}, currency = line.currency || entry.currency || "USD";
        return { date: dateLabel(entry.created_at || entry.createdAt), reference: entry.source_id || entry.sourceId || entry.id,
          account: [account.code, account.name].filter(Boolean).join(" · ") || "Account", debit: formatMinor(line.debit_minor, currency),
          credit: formatMinor(line.credit_minor, currency), source: String(entry.source_type || entry.sourceType || "Journal"), currency: currency };
      });
    });
  }
  function ledgerSummary(entries) {
    var totals = Object.create(null), unbalanced = new Set();
    (entries || []).forEach(function (entry) {
      (entry.lines || []).forEach(function (line) {
        var currency = String(line.currency || entry.currency || "USD").toUpperCase();
        if (!totals[currency]) totals[currency] = { debit: 0n, credit: 0n };
        try { totals[currency].debit += BigInt(line.debit_minor || 0); totals[currency].credit += BigInt(line.credit_minor || 0); } catch (_) {}
      });
      var byCurrency = Object.create(null);
      (entry.lines || []).forEach(function (line) {
        var currency = String(line.currency || entry.currency || "USD").toUpperCase();
        if (!byCurrency[currency]) byCurrency[currency] = { debit: 0n, credit: 0n };
        try { byCurrency[currency].debit += BigInt(line.debit_minor || 0); byCurrency[currency].credit += BigInt(line.credit_minor || 0); } catch (_) {}
      });
      Object.keys(byCurrency).forEach(function (currency) { if (byCurrency[currency].debit !== byCurrency[currency].credit) unbalanced.add(String(entry.id || entry.source_id) + ":" + currency); });
    });
    var currencies = Object.keys(totals).sort(), formatTotal = function (side) { return currencies.length ? currencies.map(function (currency) { return formatMinor(totals[currency][side], currency); }).join(" · ") : "—"; };
    return { debits: formatTotal("debit"), credits: formatTotal("credit"), balanced: unbalanced.size === 0, unreconciledCount: unbalanced.size, currencies: currencies };
  }
  function errorMessage(error, resource) {
    var label = resource === "ledger" ? "ledger" : "saved transactions";
    if (error && typeof error.message === "string" && error.message.trim()) return "Couldn't load " + label + ".";
    return "Couldn't load " + label + ".";
  }
  return { digits: digits, formatMajor: formatMajor, formatMinor: formatMinor, key: key, dedupeTransactions: dedupeTransactions,
    transactionRow: transactionRow, periodRange: periodRange, entriesInPeriod: entriesInPeriod, ledgerRows: ledgerRows, ledgerSummary: ledgerSummary, errorMessage: errorMessage };
}));
