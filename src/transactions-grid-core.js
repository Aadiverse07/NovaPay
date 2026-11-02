(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NovaPayTransactionsGridCore = api;
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  function parseMoney(value) {
    var text = String(value == null ? "" : value).replace(/\u00a0/g, " ").trim();
    if (!text || /unavailable|not returned|^—$|^-$/.test(text.toLowerCase())) return null;
    var match = text.match(/-?\s*\d[\d,]*(?:\.\d+)?/);
    if (!match) return null;
    var number = Number(match[0].replace(/[\s,]/g, ""));
    if (/^\s*[-−(]/.test(text)) number = -Math.abs(number);
    return Number.isFinite(number) ? number : null;
  }
  function textCell(row, index) { return row && row.cells && row.cells[index] ? String(row.cells[index].textContent || "").trim() : ""; }
  function rowFromDom(row) {
    var data = row && row.dataset || {}, currency = String(data.currency || "").toUpperCase();
    return {
      id: String(data.txId || textCell(row, 7)), type: String(data.type || textCell(row, 1).replace(/^\S+\s*/, "")),
      buyer: String(data.buyer || textCell(row, 2) || "Unavailable"), status: String(data.status || textCell(row, 6)), currency,
      gross: parseMoney(textCell(row, 3)) == null ? parseMoney(data.amount) : parseMoney(textCell(row, 3)),
      fee: parseMoney(textCell(row, 4)), net: parseMoney(textCell(row, 5)), date: String(data.date || ""),
      dateLabel: textCell(row, 0), source: String(data.source || "demo"),
    };
  }
  function rowsFromDom(tbody) { return Array.prototype.map.call(tbody ? tbody.querySelectorAll("tr[data-tx-id]") : [], rowFromDom).filter(function (row) { return row.id; }); }
  function matchesExternalFilters(row, filters) {
    filters = filters || {};
    var day = String(row.date || "").slice(0, 10), amount = Number(row.gross);
    return (!filters.type || row.type.toLowerCase() === String(filters.type).toLowerCase()) &&
      (!filters.status || row.status.toLowerCase() === String(filters.status).toLowerCase()) &&
      (!filters.from || (day && day >= filters.from)) && (!filters.to || (day && day <= filters.to)) &&
      (!filters.min || (Number.isFinite(amount) && amount >= Number(filters.min))) &&
      (!filters.max || (Number.isFinite(amount) && amount <= Number(filters.max)));
  }
  function matchesFilters(row, filters) {
    var query = String(filters && filters.search || "").trim().toLocaleLowerCase("en-US");
    var text = [row.id, row.type, row.buyer, row.status, row.currency, row.source, row.dateLabel].join(" ").toLocaleLowerCase("en-US");
    return matchesExternalFilters(row, filters) && (!query || text.indexOf(query) >= 0);
  }
  function totalsByCurrency(rows) {
    var byCurrency = Object.create(null);
    (rows || []).forEach(function (row) {
      var currency = String(row.currency || "UNKNOWN").toUpperCase();
      if (!byCurrency[currency]) byCurrency[currency] = { id: "__total__" + currency, type: "Totals (" + currency + ")", buyer: "", status: "", currency: currency, gross: 0, fee: 0, net: 0, _totals: true };
      ["gross", "fee", "net"].forEach(function (key) { var amount = Number(row[key]); if (Number.isFinite(amount)) byCurrency[currency][key] += amount; });
    });
    return Object.keys(byCurrency).sort().map(function (currency) { return byCurrency[currency]; });
  }
  function formatMoney(amount, currency) {
    if (amount == null || !Number.isFinite(Number(amount))) return "Unavailable";
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(Number(amount)).replace(/\u00a0/g, " "); }
    catch (_) { return (currency || "") + " " + Number(amount).toFixed(2); }
  }
  return { parseMoney: parseMoney, rowFromDom: rowFromDom, rowsFromDom: rowsFromDom, matchesExternalFilters: matchesExternalFilters, matchesFilters: matchesFilters, totalsByCurrency: totalsByCurrency, formatMoney: formatMoney };
}));
