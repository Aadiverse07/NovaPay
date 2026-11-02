(function (root) {
  "use strict";
  function grouped(rows, field, predicate) {
    var totals = Object.create(null);
    (rows || []).forEach(function (row) {
      if (predicate && !predicate(row)) return;
      var currency = String(row.currency || "").toUpperCase();
      if (!currency || row[field] == null) return;
      var value; try { value = BigInt(String(row[field])); } catch (_) { return; }
      totals[currency] = (totals[currency] || 0n) + value;
    });
    return totals;
  }
  function formatGroups(groups, formatter) {
    return Object.keys(groups).sort().map(function (currency) { return formatter(groups[currency].toString(), currency); }).join(" · ") || "No activity";
  }
  function summary(pl, fees, refunds, formatter) {
    var revenue = grouped(pl, "amount_minor", function (r) { return r.account_type === "revenue"; });
    var costs = grouped(pl, "amount_minor", function (r) { return r.account_type === "contra_revenue" || r.account_type === "expense"; });
    var feeTotals = grouped(fees, "fee_minor"), refundTotals = grouped(refunds, "refund_minor"), net = Object.create(null);
    Object.keys(revenue).concat(Object.keys(costs)).filter(function (c, i, all) { return all.indexOf(c) === i; }).forEach(function (c) { net[c] = (revenue[c] || 0n) - (costs[c] || 0n); });
    return { revenue: formatGroups(revenue, formatter), fees: formatGroups(feeTotals, formatter), refunds: formatGroups(refundTotals, formatter), net: formatGroups(net, formatter) };
  }
  function trialTotals(rows, field, formatter) { return formatGroups(grouped(rows, field), formatter); }
  var api = { grouped: grouped, summary: summary, trialTotals: trialTotals };
  root.NovaPayReportsData = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
