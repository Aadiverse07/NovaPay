(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var auth = window.NovaPayAuth, data = window.NovaPayDashboardData, api = window.NovaPayApi;
  if (!auth || !data || !api) return;
  var busy = false, queued = false;
  function periodRange(value) {
    var now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), 1), end = now;
    if (value === "last-month" || value === "30D" || !value) { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); }
    if (value === "year") { start = new Date(now.getFullYear(), 0, 1); end = now; }
    return "?from=" + start.toISOString().slice(0, 10) + "&to=" + end.toISOString().slice(0, 10);
  }
  function setStatus(message, isError, retry) {
    var node = $("dashboard-live-status"); if (!node) return;
    node.textContent = message;
    if (isError && retry) { var button = document.createElement("button"); button.type = "button"; button.className = "btn btn--ghost"; button.textContent = "Retry"; button.addEventListener("click", retry); node.appendChild(document.createTextNode(" ")); node.appendChild(button); }
    node.hidden = !message; node.setAttribute("role", isError ? "alert" : "status");
  }
  function clearVisuals() {
    ["revenue", "fees", "refunds", "disputes", "net"].forEach(function (key) { var value = $("kpi-" + key), trend = $("kpi-" + key + "-trend"), spark = $("spark-" + key); if (value) value.textContent = "—"; if (trend) trend.textContent = ""; if (spark) spark.replaceChildren(); });
    ["cash-in", "cash-out", "cash-net"].forEach(function (id) { if ($(id)) $(id).textContent = "—"; });
    ["cf-grid", "cf-y", "cf-x"].forEach(function (id) { if ($(id)) $(id).replaceChildren(); });
    ["cash-in-area", "cash-net-area", "cash-in-line", "cash-out-line", "cash-net-line"].forEach(function (id) { if ($(id)) $(id).setAttribute("d", ""); });
    if ($("cf-tip")) $("cf-tip").hidden = true;
  }
  function currencyForSingle(value) { return value || "USD"; }
  function renderCash(rows) {
    var movement = data.cashMovement(rows), plot = $("cf-plot");
    ["cash-in-area", "cash-out-line", "cash-in-area", "cash-net-area"].forEach(function (id) { if ($(id)) $(id).setAttribute("d", ""); });
    if (plot) plot.setAttribute("aria-label", "Organization net cash movement by month");
    var sub = $("cf-sub");
    if (movement.multiCurrency) { if ($("cash-in")) $("cash-in").parentElement.hidden = true; if ($("cash-out")) $("cash-out").parentElement.hidden = true; if ($("cf-x")) $("cf-x").replaceChildren(); if (sub) sub.textContent = "Net cash movement · currencies shown separately in reports"; if ($("cash-in")) $("cash-in").textContent = "Multiple currencies"; if ($("cash-out")) $("cash-out").textContent = "—"; if ($("cash-net")) $("cash-net").textContent = "See Reports"; return; }
    var currency = currencyForSingle(movement.currency), points = movement.points.slice(-12), vals = points.map(function (p) { return Number(p.value); });
    var total = vals.reduce(function (sum, n) { return sum + (Number.isFinite(n) ? n : 0); }, 0);
    if ($("cash-in")) $("cash-in").textContent = "—";
    if ($("cash-out")) $("cash-out").textContent = "—";
    if ($("cash-in")) $("cash-in").parentElement.hidden = true;
    if ($("cash-out")) $("cash-out").parentElement.hidden = true;
    if ($("cash-net")) $("cash-net").textContent = rows.length ? data.formatMinor(total, currency) : "No activity";
    if (sub) sub.textContent = rows.length ? "Net cash movement · monthly ledger totals · " + currency : "No cash movement recorded yet.";
    var labels = $("cf-x"); if (labels) { labels.replaceChildren(); points.forEach(function (point) { var span = document.createElement("span"); span.textContent = point.period.slice(0, 7); labels.appendChild(span); }); }
    var path = $("cash-net-line");
    if (path && vals.length) { var max = Math.max(1, ...vals.map(Math.abs)), coords = vals.map(function (v, i) { var x = 14 + i * (872 / Math.max(1, vals.length - 1)), y = 130 - (v / max) * 110; return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }); path.setAttribute("d", coords.join(" ")); }
  }
  function renderRecent(rows, failed) {
    var recent = document.querySelector(".recent-card tbody"); if (!recent) return;
    recent.replaceChildren();
    if (!rows.length) { var empty = document.createElement("tr"), cell = document.createElement("td"); cell.colSpan = 6; cell.textContent = failed ? "Couldn't load recent transactions." : "No transactions yet. Create a sandbox payment to get started."; empty.appendChild(cell); recent.appendChild(empty); }
    rows.slice(0, 5).forEach(function (row) {
      var tr = document.createElement("tr"), values = [row.type || "Transaction", data.formatMajor(row.amount, row.currency), data.formatMajor(row.fee, row.currency), data.formatMajor(row.net, row.currency), row.status || "Unknown", row.occurredAt ? new Date(row.occurredAt).toLocaleString() : "Date unavailable"];
      values.forEach(function (value) { var td = document.createElement("td"); td.textContent = value; tr.appendChild(td); }); recent.appendChild(tr);
    });
    var subtitle = document.querySelector(".recent-card .card-heading p"); if (subtitle) subtitle.textContent = rows.length ? "Latest organization transactions" : "No transactions yet. Create a sandbox payment to get started.";
  }
  async function load() {
    if (busy) { queued = true; return; }
    busy = true; clearVisuals(); setStatus("Loading organization data…", false);
    try {
      var activeTab = document.querySelector("#cashflow-tabs button.active"), selection = $("dashboard-date") && $("dashboard-date").value || (activeTab && activeTab.dataset.range), range = periodRange(selection);
      var responses = await Promise.all([api.request("/api/reports/profit-and-loss" + range), api.request("/api/reports/fees" + range), api.request("/api/reports/refunds" + range), api.request("/api/reports/cash-movement" + range), api.request("/api/transactions?limit=50&offset=0")]);
      var metric = data.metrics(responses[0].rows || [], responses[1].rows || [], responses[2].rows || []), transactions = responses[4].transactions || [];
      $("kpi-revenue").textContent = metric.revenue; $("kpi-fees").textContent = metric.fees; $("kpi-refunds").textContent = metric.refunds; $("kpi-net").textContent = metric.net;
      $("kpi-disputes").textContent = "Unavailable";
      ["revenue", "fees", "refunds", "net", "disputes"].forEach(function (key) { var trend = $("kpi-" + key + "-trend"); if (trend) trend.textContent = key === "disputes" ? "No disputes report endpoint" : "Organization ledger data · by currency"; });
      renderCash(responses[3].rows || []); renderRecent(transactions);
      var health = document.querySelector(".financial-health-card"); if (health) { var number = health.querySelector("[data-health-value]"), segment = health.querySelector(".health-segment-main"); if (number) number.textContent = "Live"; if (segment) segment.style.strokeDasharray = "0 100"; var caption = health.querySelector(".health-callout"); if (caption) caption.textContent = "Organization data loaded from Supabase"; }
      setStatus(transactions.length ? "Dashboard totals use organization-scoped reports. Amounts are separated by currency." : "No transactions yet. Create a sandbox payment to get started.", false);
    } catch (error) { clearVisuals(); renderRecent([], true); setStatus("Couldn't load dashboard data.", true, load); console.error("Could not load organization dashboard data", error); }
    finally { busy = false; if (queued) { queued = false; load(); } }
  }
  Promise.resolve(auth.ready).then(function () { if (auth.mode !== "supabase" || !auth.isAuthenticated()) return; document.querySelectorAll("[data-dashboard-sample]").forEach(function (node) { node.hidden = true; }); load(); });
  document.addEventListener("novapay:dashboard-period", load);
  document.addEventListener("novapay:financial-refresh", load);
  window.addEventListener("hashchange", function () { if (location.hash === "#dashboard" && auth.mode === "supabase" && auth.isAuthenticated()) load(); });
  window.addEventListener("focus", function () { if (auth.mode === "supabase" && auth.isAuthenticated()) load(); });
}());
