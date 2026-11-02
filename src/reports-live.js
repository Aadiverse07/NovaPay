(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); }, api = window.NovaPayApi, data = window.NovaPayReportsData, dashboard = window.NovaPayDashboardData;
  if (!api || !data || !dashboard) return;
  var cache = {}, loading = false, sequence = 0, modal = $("report-detail-modal"), returnFocus = null;
  function format(minor, currency) { return dashboard.formatMinor(minor, currency); }
  function periodRange() {
    var select = $("report-period"), choice = select && select.value || "month", now = new Date(), from;
    if (choice === "year") from = new Date(now.getFullYear(), 0, 1);
    else if (choice === "quarter") from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    else from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10), label: choice === "year" ? "This year" : choice === "quarter" ? "This quarter" : "This month" };
  }
  function status(message, failed) { var node = $("reports-live-status"); if (node) { node.textContent = message; node.className = failed ? "module-foot status warn" : "module-foot"; } }
  function clearValues() { ["report-gross", "report-fees", "report-refunds", "report-net"].forEach(function (id) { if ($(id)) $(id).textContent = "—"; }); if ($("reports-chart")) { $("reports-chart").replaceChildren(); var p = document.createElement("p"); p.textContent = "No report activity yet."; $("reports-chart").appendChild(p); } }
  function renderChart(rows) {
    var box = $("reports-chart"); if (!box) return; box.replaceChildren();
    var groups = Object.create(null);
    (rows || []).forEach(function (r) { if (r.account_type !== "revenue") return; var key = String(r.period || "") + "|" + String(r.currency || ""); if (!key || key.charAt(0) === "|") return; var n; try { n = BigInt(String(r.amount_minor || 0)); } catch (_) { return; } groups[key] = (groups[key] || 0n) + n; });
    var keys = Object.keys(groups).sort(); if (!keys.length) { var empty = document.createElement("p"); empty.textContent = "No report activity yet."; box.appendChild(empty); return; }
    var maxima = Object.create(null); keys.forEach(function (key) { var currency = key.split("|")[1], n = groups[key]; if (!(currency in maxima) || n > maxima[currency]) maxima[currency] = n; });
    keys.forEach(function (key) { var parts = key.split("|"), row = document.createElement("div"), label = document.createElement("span"), bar = document.createElement("i"), value = document.createElement("b"), max = maxima[parts[1]] || 1n; row.dataset.currency = parts[1]; label.textContent = parts[0].slice(0, 7) + " · " + parts[1]; bar.style.setProperty("--bar", Math.max(2, Number(groups[key] * 100n / max)) + "%"); value.textContent = format(groups[key].toString(), parts[1]); row.appendChild(label); row.appendChild(bar); row.appendChild(value); box.appendChild(row); });
  }
  function queryPath(name, range) { return "/api/reports/" + name + "?from=" + encodeURIComponent(range.from) + "&to=" + encodeURIComponent(range.to); }
  async function load() {
    if (loading) return; var auth = window.NovaPayAuth, retry = $("reports-retry"), range = periodRange(), request = ++sequence;
    if (auth && auth.ready) await auth.ready;
    if (!auth || auth.mode !== "supabase" || !auth.isAuthenticated()) { cache = {}; clearValues(); status(auth && auth.mode === "demo" ? "DEMO MODE · no sample report figures are shown." : "Sign in to load organization reports."); return; }
    loading = true; status("Loading organization reports…"); if (retry) retry.hidden = true; clearValues();
    try {
      var results = await Promise.all([api.request(queryPath("profit-and-loss", range)), api.request(queryPath("fees", range)), api.request(queryPath("refunds", range)), api.request(queryPath("trial-balance", range))]);
      if (request !== sequence) return;
      cache = { range: range, profit: results[0].rows || [], fees: results[1].rows || [], refunds: results[2].rows || [], trial: results[3].rows || [] };
      var totals = data.summary(cache.profit, cache.fees, cache.refunds, format);
      $("report-gross").textContent = totals.revenue; $("report-fees").textContent = totals.fees; $("report-refunds").textContent = totals.refunds; $("report-net").textContent = totals.net;
      $("report-period-label").textContent = range.label + " · " + range.from + " to " + range.to + " · amounts grouped by currency";
      renderChart(cache.profit); status(cache.profit.length || cache.fees.length || cache.refunds.length ? "Organization report data loaded from the ledger." : "No report activity in this period.");
    } catch (error) { if (request !== sequence) return; cache = {}; clearValues(); status("Couldn't load organization reports. Retry.", true); if (retry) retry.hidden = false; if (window.console) console.error("Could not load organization reports", error); }
    finally { loading = false; }
  }
  function fill(row, values) { row.replaceChildren(); values.forEach(function (value) { var cell = document.createElement("td"); cell.textContent = String(value == null ? "—" : value); row.appendChild(cell); }); }
  function detail(type, trigger) {
    if (!modal) return; returnFocus = trigger || document.activeElement;
    if (!cache.range) { load().then(function () { detail(type, trigger); }); return; }
    var isProfit = type === "profit-loss", title = $("report-detail-title"), description = $("report-detail-description"), head = $("report-detail-head"), body = $("report-detail-rows"), total = $("report-detail-total"), note = $("report-detail-note");
    title.textContent = isProfit ? "Profit & loss" : "Trial balance"; description.textContent = (isProfit ? "Income, fees, refunds, and net activity" : "Debits and credits by account") + " · " + cache.range.from + " to " + cache.range.to;
    head.replaceChildren(); var headers = isProfit ? ["Period", "Account", "Currency", "Amount"] : ["Period", "Account", "Currency", "Debit", "Credit"];
    headers.forEach(function (text) { var th = document.createElement("th"); th.scope = "col"; th.textContent = text; head.appendChild(th); }); body.replaceChildren();
    var rows = isProfit ? cache.profit : cache.trial;
    rows.forEach(function (item) { var row = document.createElement("tr"), values = isProfit ? [item.period, item.name || item.code, item.currency, format(item.amount_minor, item.currency)] : [item.period, item.name || item.code, item.currency, format(item.debit_minor, item.currency), format(item.credit_minor, item.currency)]; fill(row, values); body.appendChild(row); });
    if (!rows.length) { var empty = document.createElement("tr"), cell = document.createElement("td"); cell.colSpan = headers.length; cell.textContent = "No report activity in this period."; empty.appendChild(cell); body.appendChild(empty); }
    var currencies = Array.from(new Set(rows.map(function (r) { return r.currency; }).filter(Boolean))).sort();
    if (isProfit) fill(total, ["Totals are shown by currency above", "", "", currencies.length ? currencies.map(function (c) { return format(data.grouped(rows, "amount_minor", function (r) { return r.currency === c && r.account_type === "revenue"; })[c] || 0n, c); }).join(" · ") : "No activity"]);
    else fill(total, ["Totals by currency", "", "", currencies.map(function (c) { return format(data.grouped(rows, "debit_minor", function (r) { return r.currency === c; })[c] || 0n, c); }).join(" · ") || "No activity", currencies.map(function (c) { return format(data.grouped(rows, "credit_minor", function (r) { return r.currency === c; })[c] || 0n, c); }).join(" · ") || "No activity"]);
    note.textContent = "Organization-scoped report data from Supabase. Currency totals are not combined."; modal.hidden = false; modal.setAttribute("aria-hidden", "false"); document.body.classList.add("modal-open"); var close = modal.querySelector(".modal-close"); if (close) close.focus();
  }
  function close() { if (!modal || modal.hidden) return; modal.hidden = true; modal.setAttribute("aria-hidden", "true"); document.body.classList.remove("modal-open"); if (returnFocus && returnFocus.isConnected) returnFocus.focus(); }
  function csvCell(value) { var text = String(value == null ? "" : value); if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; }
  function exportCsv() { if (!cache.range) { load().then(exportCsv); return; } var rows = [["Report", "Period", "Account", "Currency", "Amount", "Debit", "Credit"]]; cache.profit.forEach(function (r) { rows.push(["profit-and-loss", r.period, r.name || r.code, r.currency, format(r.amount_minor, r.currency), "", ""]); }); cache.trial.forEach(function (r) { rows.push(["trial-balance", r.period, r.name || r.code, r.currency, "", format(r.debit_minor, r.currency), format(r.credit_minor, r.currency)]); }); if (rows.length === 1) { status("No saved report rows to export."); return; } var blob = new Blob([rows.map(function (row) { return row.map(csvCell).join(","); }).join("\r\n")], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "novapay-organization-reports.csv"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  var period = $("report-period"), retry = $("reports-retry"); if (period) period.addEventListener("change", load); if (retry) retry.addEventListener("click", load);
  if (modal) { modal.addEventListener("click", function (event) { if (event.target.closest("[data-report-close]")) close(); }); document.addEventListener("keydown", function (event) { if (event.key === "Escape") close(); }); }
  document.addEventListener("click", function (event) { var button = event.target.closest('[data-ui-action="report-open"]'); if (button) detail(button.dataset.reportType, button); });
  var lastFocusRefresh = 0;
  function active() { return location.hash === "#reports" || Boolean(document.querySelector("#view-reports:not([hidden])")); }
  function loadIfActive() { if (active()) load(); }
  document.addEventListener("novapay:auth", loadIfActive);
  document.addEventListener("novapay:financial-refresh", function (event) { var resources = event.detail && event.detail.resources; if ((!resources || resources.indexOf("reports") !== -1) && active()) load(); });
  window.addEventListener("hashchange", loadIfActive);
  window.addEventListener("focus", function () { if (document.visibilityState === "hidden" || !active() || Date.now() - lastFocusRefresh < 30000) return; lastFocusRefresh = Date.now(); loadIfActive(); });
  window.NovaPayReports = { load: load, open: detail, exportCsv: exportCsv };
  if (active()) load();
})();
