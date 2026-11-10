(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var auth = window.NovaPayAuth, data = window.NovaPayDashboardData, api = window.NovaPayApi;
  if (!auth || !data || !api) return;
  var busy = false, queued = false, lastPassiveRefresh = 0, periodOverride = null;
  function periodRange(value) {
    var now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), 1), end = now;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value||""))) { start = new Date(value+"T00:00:00"); end = new Date(value+"T00:00:00"); }
    if (value === "yesterday") { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1); end = new Date(start); }
    if (value === "week" || value === "7D") start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-6);
    if (value === "last-month" || value === "30D") { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); }
    if (value === "year") { start = new Date(now.getFullYear(), 0, 1); end = now; }
    return "?from=" + data.localDate(start) + "&to=" + data.localDate(end);
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
  function axisLabel(minor, currency) {
    var code = String(currency || "USD").toUpperCase(), places = 2;
    try { places = new Intl.NumberFormat("en-US", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits; } catch (_) {}
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: code, notation: "compact", maximumFractionDigits: 1 }).format(Number(minor) / Math.pow(10, places)); }
    catch (_) { return data.formatMinor(minor, currency); }
  }
  var selectedCurrency = "";
  function cashText(minor, currency) { return data.formatMinor(minor, currency); }
  function renderCash(rows) {
    var currencyGroups=data.cashCurrencies(rows),currencies=currencyGroups.currencies,wrap=$("cashflow-currency-wrap"),selector=$("cashflow-currency");
    if(selector){selector.replaceChildren();currencies.forEach(function(code){var option=document.createElement("option");option.value=code;option.textContent=code;selector.appendChild(option)});if(currencies.length>1){wrap.hidden=false;selectedCurrency=currencies.includes(selectedCurrency)?selectedCurrency:currencyGroups.defaultCurrency;selector.value=selectedCurrency}else{wrap.hidden=true;selectedCurrency=currencies[0]||""}}
    var points=rows.filter(function(row){return !selectedCurrency||row.currency===selectedCurrency}), plot=$("cf-plot"),path=$("cash-net-line"),currency=selectedCurrency||"USD";
    ["cash-in-line","cash-out-line","cash-net-line"].forEach(function(id){var line=$(id);if(line) ["stroke-dasharray","stroke-dashoffset","transition"].forEach(function(property){line.style.removeProperty(property)})});
    var totals=data.cashTotals(points,currency);
    $("cash-in").textContent=cashText(totals.moneyIn,currency);$("cash-out").textContent=cashText(totals.moneyOut,currency);$("cash-net").textContent=cashText(totals.net,currency);
    if($("cf-sub"))$("cf-sub").textContent=points.length?"Live ledger cash flow · "+currency:"No activity in this period";
    if(plot)plot.setAttribute("aria-label","Live cash flow in "+currency);
    var nums=points.map(function(row){return Number(row.net_minor||0)}),max=Math.max(1,...nums.map(Math.abs)),W=900,H=260,P=14;
    var x=nums.map(function(_,i){return nums.length===1?450:P+i*(W-P*2)/(nums.length-1)}), y=nums.map(function(v){return 130-v/max*110});
    path.setAttribute("d",nums.length?nums.map(function(_,i){return(i?"L":"M")+x[i].toFixed(1)+" "+y[i].toFixed(1)}).join(" "):"");
    ["cash-in-area","cash-net-area","cash-in-line","cash-out-line"].forEach(function(id){var node=$(id);if(node)node.setAttribute("d","")});
    var grid=$("cf-grid"),axis=$("cf-y"),labels=$("cf-x");grid.replaceChildren();axis.replaceChildren();labels.replaceChildren();
    for(var i=0;i<=4;i++){var line=document.createElementNS("http://www.w3.org/2000/svg","line");line.setAttribute("x1","0");line.setAttribute("x2","900");line.setAttribute("y1",String(20+i*55));line.setAttribute("y2",String(20+i*55));grid.appendChild(line);var label=document.createElement("span");label.textContent=cashText(BigInt(Math.round(max*(1-i/2))),currency);axis.appendChild(label)}
    points.forEach(function(row){var label=document.createElement("span");label.textContent=row.period.slice(0,7);labels.appendChild(label)});
    window.NovaPayLiveCash={points:points,currency:currency};document.dispatchEvent(new CustomEvent("novapay:cashflow-live",{detail:window.NovaPayLiveCash}));
    if(!points.length&&$("cf-empty"))$("cf-empty").hidden=false;else if($("cf-empty"))$("cf-empty").hidden=true;
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
    busy = true; setStatus("Loading organization data…", false);
    try {
      var activeTab = document.querySelector("#cashflow-tabs button.active"), selection = periodOverride || ($("dashboard-date") && $("dashboard-date").value) || (activeTab && activeTab.dataset.range), range = periodRange(selection);
      var responses = await Promise.all([api.request("/api/reports/profit-and-loss" + range), api.request("/api/reports/fees" + range), api.request("/api/reports/refunds" + range), api.request("/api/reports/cash-flow-series" + range), api.request("/api/transactions?limit=50&offset=0")]);
      var metric = data.metrics(responses[0].rows || [], responses[1].rows || [], responses[2].rows || []), transactions = responses[4].transactions || [];
      $("kpi-revenue").textContent = metric.revenue; $("kpi-fees").textContent = metric.fees; $("kpi-refunds").textContent = metric.refunds; $("kpi-net").textContent = metric.net;
      $("kpi-disputes").textContent = "Unavailable";
      ["revenue", "fees", "refunds", "net", "disputes"].forEach(function (key) { var trend = $("kpi-" + key + "-trend"); if (trend) trend.textContent = key === "disputes" ? "No disputes report endpoint" : "Organization ledger data · by currency"; });
      renderCash(responses[3].rows || []); renderRecent(transactions);
      var health = document.querySelector(".financial-health-card"); if (health) { var number = health.querySelector("[data-health-value]"), segment = health.querySelector(".health-segment-main"); if (number) number.textContent = "Live"; if (segment) segment.style.strokeDasharray = "0 100"; var caption = health.querySelector(".health-callout"); if (caption) caption.textContent = "Organization data loaded from Supabase"; }
      setStatus(transactions.length ? "Dashboard totals use organization-scoped reports. Amounts are separated by currency." : "No transactions yet. Create a sandbox payment to get started.", false);
    } catch (error) { setStatus("Couldn't load dashboard data.", true, load); console.error("Could not load organization dashboard data", error); }
    finally { busy = false; if (queued) { queued = false; load(); } }
  }
  function active() { return String(location.hash || "#dashboard") === "#dashboard"; }
  function loadIfActive() { if (active() && auth.mode === "supabase" && auth.isAuthenticated()) load(); }
  function refreshOnFocus() { if (!active() || auth.mode !== "supabase" || !auth.isAuthenticated()) return; var now = Date.now(); if (now - lastPassiveRefresh < 30000) return; lastPassiveRefresh = now; load(); }
  Promise.resolve(auth.ready).then(function () { if (auth.mode !== "supabase" || !auth.isAuthenticated()) return; document.querySelectorAll("[data-dashboard-sample]").forEach(function (node) { node.hidden = true; }); loadIfActive(); });
  document.addEventListener("novapay:dashboard-period", function(event){periodOverride=event.detail&&event.detail.period||null;loadIfActive()});
  if($("cashflow-currency"))$("cashflow-currency").addEventListener("change",function(){selectedCurrency=this.value;loadIfActive()});
  document.addEventListener("novapay:financial-refresh", function (event) { var resources = event.detail && event.detail.resources; if ((!resources || resources.indexOf("dashboard") !== -1) && active()) loadIfActive(); });
  document.addEventListener("novapay:auth", loadIfActive);
  window.addEventListener("hashchange", loadIfActive);
  window.addEventListener("focus", refreshOnFocus);
}());
