(function (root) {
  "use strict";
  var data = root.NovaPayFinancialData;
  var transactionBusy = false, transactionQueued = false, ledgerBusy = false, ledgerQueued = false, ledgerCache = null, lastPassiveRefresh = 0;
  function byId(id) { return root.document.getElementById(id); }
  function message(error, resource) { return data.errorMessage(error, resource); }
  function showError(node, resource, retry) {
    if (!node) return;
    node.textContent = message(null, resource);
    var button = root.document.createElement("button");
    button.type = "button"; button.className = "btn btn--ghost"; button.textContent = "Retry";
    button.addEventListener("click", retry);
    node.appendChild(root.document.createTextNode(" ")); node.appendChild(button); node.hidden = false;
  }
  function clearError(node) { if (node) { node.hidden = true; node.textContent = ""; } }
  function request(path) {
    if (!root.NovaPayApi || typeof root.NovaPayApi.request !== "function") return Promise.reject(new Error("API client unavailable"));
    return root.NovaPayApi.request(path);
  }
  async function pages(path, field) {
    var result = [], limit = 50;
    for (var offset = 0; offset < 10000; offset += limit) {
      var pagePath = offset === 0 ? path : path + "?limit=" + limit + "&offset=" + offset;
      var response = await request(pagePath);
      var batch = response && response[field];
      if (!Array.isArray(batch)) throw new Error("Invalid " + field + " response");
      result = result.concat(batch);
      if (batch.length < limit) break;
    }
    return result;
  }
  function setNote(text) { var note = byId("tx-source-note"); if (note) note.textContent = text; }
  function makeTransactionNode(row) {
    var tr = root.document.createElement("tr"), mapped = data.transactionRow(row);
    tr.className = "transaction-row"; tr.tabIndex = 0;
    tr.dataset.txId = mapped.id; tr.dataset.sourceId = String(row.sourceId || row.source_id || row.sourceId || "");
    tr.dataset.captureId = String(row.captureId || row.capture_id || (row.source_type === "capture" || row.sourceType === "capture" ? row.sourceId || row.source_id || "" : ""));
    tr.dataset.type = mapped.type; tr.dataset.status = mapped.status;
    var paymentCheck = row.paymentCheck || null;
    if (paymentCheck && paymentCheck.state) {
      tr.dataset.paymentCheck = paymentCheck.state;
      tr.dataset.paymentReasons = JSON.stringify(paymentCheck.reasons || []);
      tr.dataset.verifiedWebhookReceived = paymentCheck.verifiedWebhookReceived ? "true" : "false";
    }
    tr.dataset.amount = mapped.amount; tr.dataset.currency = mapped.currency; tr.dataset.date = mapped.date;
    tr.dataset.buyer = mapped.buyer; tr.dataset.source = mapped.source;
    tr.dataset.note = "Loaded from the organization-scoped saved transaction API.";
    mapped.cells.forEach(function (text, index) {
      var td = root.document.createElement("td");
      if (index === 1) {
        var badge = root.document.createElement("span"); badge.className = "tx-badge " + (mapped.type === "Refund" ? "refund" : "payment"); badge.textContent = mapped.type === "Refund" ? "↩" : "↗";
        td.appendChild(badge); td.appendChild(root.document.createTextNode(" " + mapped.type));
      } else if (index === 6) {
        var status = root.document.createElement("span"), state = mapped.status.toLowerCase();
        status.className = "status " + (state === "completed" ? "ok" : state === "refunded" || state === "failed" ? "danger" : "warn");
        status.textContent = text; td.appendChild(status);
      } else td.textContent = text;
      tr.appendChild(td);
    });
    var checkCell = root.document.createElement("td");
    if (paymentCheck && paymentCheck.state) {
      var badge = root.document.createElement("span"), reasonText = (paymentCheck.reasons || []).join(" ");
      badge.className = "status " + (paymentCheck.state === "confirmed" ? "ok" : paymentCheck.state === "unconfirmed" ? "info" : "warn");
      badge.textContent = paymentCheck.state === "confirmed" ? "Confirmed" : paymentCheck.state === "unconfirmed" ? "Unconfirmed" : "Needs review";
      badge.title = (reasonText ? reasonText + " " : "PayPal returned COMPLETED. ") + (paymentCheck.verifiedWebhookReceived ? "Signature-verified webhook received." : "");
      checkCell.appendChild(badge);
      if (paymentCheck.verifiedWebhookReceived) { var detail = root.document.createElement("small"); detail.textContent = "Signature-verified webhook received"; checkCell.appendChild(root.document.createElement("br")); checkCell.appendChild(detail); }
    } else checkCell.textContent = "";
    tr.appendChild(checkCell);
    return tr;
  }
  async function loadTransactions() {
    if (transactionBusy) { transactionQueued = true; return; }
    var body = byId("transactions-table-body"), error = byId("tx-grid-error");
    if (!body) return;
    transactionBusy = true; setNote("Loading saved PayPal Sandbox transactions…");
    try {
      var auth = root.NovaPayAuth;
      if (auth && auth.ready) await auth.ready;
      if (!auth || auth.mode !== "supabase" || !auth.isAuthenticated()) {
        body.replaceChildren();
        setNote("Sign in to load organization transactions.");
        clearError(error);
        return;
      }
      var rows = data.dedupeTransactions(await pages("/api/transactions", "transactions"));
      body.replaceChildren();
      rows.forEach(function (row) { body.appendChild(makeTransactionNode(row)); });
      if (!rows.length) {
        var emptyRow = root.document.createElement("tr"), emptyCell = root.document.createElement("td");
        emptyRow.dataset.txEmpty = "true"; emptyCell.colSpan = 9; emptyCell.textContent = "No transactions yet. Create a sandbox payment to get started."; emptyRow.appendChild(emptyCell); body.appendChild(emptyRow);
      }
      setNote(rows.length ? "Saved transactions loaded from this organization." : "No transactions yet. Create a sandbox payment to get started.");
      clearError(error);
    } catch (cause) {
      root.console.error("Could not load saved transactions", cause);
      body.replaceChildren();
      var failedRow = root.document.createElement("tr"), failedCell = root.document.createElement("td");
      failedRow.dataset.txEmpty = "true"; failedCell.colSpan = 9; failedCell.textContent = "Couldn't load saved transactions."; failedRow.appendChild(failedCell); body.appendChild(failedRow);
      setNote("Couldn't load saved transactions.");
      showError(error, "transactions", loadTransactions);
    } finally { transactionBusy = false; if (transactionQueued) { transactionQueued = false; loadTransactions(); } }
  }
  function period() { var select = byId("ledger-period"); return select ? select.value : "Last 30 days"; }
  function setKpi(name, value, label, statusClass) {
    var amount = root.document.querySelector('[data-ledger-kpi="' + name + '"]');
    var badge = root.document.querySelector('[data-ledger-label="' + name + '"]');
    if (amount) amount.textContent = value;
    if (badge) { badge.textContent = label; badge.className = "status " + statusClass; }
  }
  function renderLedger(entries) {
    var body = byId("ledger-table-body"), liveStatus = byId("ledger-live-status");
    if (!body) return;
    var filtered = data.entriesInPeriod(entries, period());
    body.replaceChildren();
    if (!filtered.length) {
      var empty = root.document.createElement("tr"); empty.dataset.ledgerEmpty = "true";
      var emptyCell = root.document.createElement("td"); emptyCell.colSpan = 6;
      emptyCell.textContent = entries.length ? "No ledger entries for this period." : "No ledger entries yet. A saved transaction will create ledger entries.";
      empty.appendChild(emptyCell); body.appendChild(empty);
      setKpi("debits", "—", "No saved entries", "info");
      setKpi("credits", "—", "No saved entries", "info");
      setKpi("unreconciled", "0", "No entries", "info");
      if (liveStatus) liveStatus.textContent = entries.length ? "No saved journal entries for this period." : "No saved ledger entries in this organization.";
      return;
    }
    var summary = data.ledgerSummary(filtered);
    setKpi("debits", summary.debits, "Saved ledger totals", "info");
    setKpi("credits", summary.credits, "Saved ledger totals", "info");
    setKpi("unreconciled", String(summary.unreconciledCount), summary.balanced ? "Balanced" : "Unbalanced", summary.balanced ? "ok" : "warn");
    var rows = data.ledgerRows(filtered);
    if (!rows.length) {
      var empty = root.document.createElement("tr"); empty.dataset.ledgerEmpty = "true";
      var cell = root.document.createElement("td"); cell.colSpan = 6; cell.textContent = "No ledger entries for this period."; empty.appendChild(cell); body.appendChild(empty);
    } else rows.forEach(function (item) {
      var tr = root.document.createElement("tr"); tr.dataset.ledgerLive = "true";
      [item.date, item.reference, item.account, item.debit, item.credit, item.source].forEach(function (value) { var td = root.document.createElement("td"); td.textContent = value; tr.appendChild(td); });
      body.appendChild(tr);
    });
    if (liveStatus) liveStatus.textContent = "Saved journal entries from this organization · amounts grouped by currency.";
  }
  async function loadLedger(force) {
    if (ledgerBusy) { ledgerQueued = true; return; }
    var error = byId("ledger-live-error"); ledgerBusy = true;
    var status = byId("ledger-live-status"); if (status) status.textContent = "Loading saved ledger entries…";
    try {
      var auth = root.NovaPayAuth;
      if (auth && auth.ready) await auth.ready;
      if (!auth || auth.mode !== "supabase" || !auth.isAuthenticated()) {
        ledgerCache = [];
        renderLedger(ledgerCache);
        if (status) status.textContent = "Sign in to view organization ledger entries.";
        clearError(error);
        return;
      }
      if (force || !ledgerCache) ledgerCache = await pages("/api/ledger/entries", "entries");
      renderLedger(ledgerCache); clearError(error);
    } catch (cause) {
      root.console.error("Could not load saved ledger", cause);
      var body = byId("ledger-table-body");
      if (body) { body.replaceChildren(); var row = root.document.createElement("tr"), cell = root.document.createElement("td"); row.dataset.ledgerEmpty = "true"; cell.colSpan = 6; cell.textContent = "Couldn't load saved ledger."; row.appendChild(cell); body.appendChild(row); }
      if (status) status.textContent = "Couldn't load saved ledger.";
      setKpi("debits", "—", "Unavailable", "warn"); setKpi("credits", "—", "Unavailable", "warn"); setKpi("unreconciled", "—", "Unavailable", "warn");
      showError(error, "ledger", function () { loadLedger(true); });
    } finally { ledgerBusy = false; if (ledgerQueued) { ledgerQueued = false; loadLedger(true); } }
  }
  function activeView() { return String(root.location.hash || "#dashboard").slice(1); }
  function refreshVisible() {
    var view = activeView();
    if (view === "transactions") loadTransactions();
    if (view === "ledger") loadLedger(true);
  }
  function refreshPassive() {
    if (root.document.visibilityState === "hidden") return;
    var now = Date.now(); if (now - lastPassiveRefresh < 30000) return;
    lastPassiveRefresh = now; refreshVisible();
  }
  function refresh() { return Promise.all([loadTransactions(), loadLedger(true)]); }
  function openView(view) {
    if (view === "transactions") loadTransactions();
    if (view === "ledger") loadLedger(true);
  }
  root.document.addEventListener("click", function (event) {
    var link = event.target && event.target.closest && event.target.closest("#dashboard-nav a[data-view]");
    if (link) root.setTimeout(function () { openView(link.dataset.view); }, 0);
  });
  root.addEventListener("hashchange", refreshVisible);
  root.addEventListener("popstate", refreshPassive);
  root.addEventListener("focus", refreshPassive);
  root.document.addEventListener("visibilitychange", refreshPassive);
  root.document.addEventListener("novapay:financial-refresh", function (event) { var resources = event.detail && event.detail.resources; if (!resources || resources.indexOf("transactions") !== -1 || resources.indexOf("ledger") !== -1) refresh(); });
  var ledgerPeriod = byId("ledger-period"); if (ledgerPeriod) ledgerPeriod.addEventListener("change", function () { if (ledgerCache) renderLedger(ledgerCache); });
  root.NovaPayFinancialViews = { refresh: refresh, loadTransactions: loadTransactions, loadLedger: function () { return loadLedger(true); }, getLedgerEntries: function () { return (ledgerCache || []).slice(); } };
  openView(activeView());
}(typeof window !== "undefined" ? window : globalThis));
