(function (root) {
  "use strict";
  var core = root.NovaPayTransactionsGridCore, initialized = false, initializing = false, api = null, observer = null, timer = null, lastRows = [], freshIds = new Set(), host, source, tableBody, errorNode, columnsMenu, pendingAssistantView = null;
  var columnKeys = ["id", "date", "type", "buyer", "gross", "fee", "net", "status"];
  function byId(id) { return document.getElementById(id); }
  function reduceMotion() { return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function saveState() {
    if (!api) return;
    try { root.localStorage.setItem("novapay-tx-grid-state", JSON.stringify({ columns: api.getColumnState(), pageSize: api.paginationGetPageSize() || 10 })); } catch (_) {}
  }
  function readState() { try { return JSON.parse(root.localStorage.getItem("novapay-tx-grid-state") || "{}"); } catch (_) { return {}; } }
  function currentFilters() { return { type: byId("tx-type").value, status: byId("tx-status").value, from: byId("tx-from").value, to: byId("tx-to").value, min: byId("tx-min").value, max: byId("tx-max").value }; }
  function visibleRows() { var rows = []; if (api) api.forEachNodeAfterFilter(function (node) { if (node.data && !node.data._totals) rows.push(node.data); }); return rows; }
  function updateSummary() {
    if (!api) return;
    var count = api.getDisplayedRowCount(), empty = byId("tx-empty"), result = byId("tx-result-count");
    if (empty) empty.hidden = count > 0;
    if (result) result.textContent = count + " transaction" + (count === 1 ? "" : "s") + " shown";
    api.setGridOption("pinnedBottomRowData", core.totalsByCurrency(visibleRows()));
  }
  function filtersChanged() {
    if (!api) return;
    api.setGridOption("quickFilterText", byId("tx-search").value.trim());
    api.onFilterChanged();
    updateSummary();
  }
  function currencyFormatter(params) { return params.data && params.data._totals && params.value == null ? "—" : core.formatMoney(params.value, params.data && params.data.currency); }
  function badgeRenderer(kind) { return function (params) { var value = String(params.value || ""), wrapper = document.createElement("span");
    if (params.data && params.data._totals) { wrapper.textContent = value; return wrapper; }
    if (kind === "type") { var icon = document.createElement("span"), key = value.toLowerCase(), glyph = { payment: "↗", refund: "↩", dispute: "!", payout: "↗" }[key] || "•"; icon.className = "tx-badge " + (key === "payment" || key === "refund" || key === "dispute" || key === "payout" ? key : "payment"); icon.textContent = glyph; wrapper.append(icon, document.createTextNode(" " + value)); return wrapper; }
    var normalized = value.toLowerCase(), style = /complete|paid|success|refunded/.test(normalized) ? (normalized.indexOf("refund") >= 0 ? "danger" : "ok") : /review|duplicate|pending|failed|void/.test(normalized) ? "warn" : "info";
    wrapper.className = "status " + style; wrapper.textContent = value; return wrapper;
  }; }
  function dateComparator(filterDate, cellValue) { if (!cellValue) return -1; var day = String(cellValue).slice(0, 10), target = [filterDate.getFullYear(), String(filterDate.getMonth() + 1).padStart(2, "0"), String(filterDate.getDate()).padStart(2, "0")].join("-"); return day < target ? -1 : day > target ? 1 : 0; }
  function buildOptions(state) {
    return {
      theme: root.agGrid.themeQuartz.withParams({ accentColor: "var(--info-text)", backgroundColor: "var(--surface)", foregroundColor: "var(--text)", borderColor: "var(--border)", headerBackgroundColor: "var(--surface-sunken)", headerTextColor: "var(--text)", spacing: 7, fontFamily: "inherit", fontSize: 12 }),
      rowData: core.rowsFromDom(tableBody), getRowId: function (params) { return String(params.data.id); },
      columnDefs: [
        { field: "id", headerName: "ID", pinned: "left", lockPinned: true, minWidth: 170 },
        { field: "date", headerName: "Date", minWidth: 175, sort: "desc", comparator: function (a, b) { return String(a || "").localeCompare(String(b || "")); }, filter: "agDateColumnFilter", filterParams: { comparator: dateComparator }, valueFormatter: function (p) { return p.data && p.data.dateLabel || "Unavailable"; } },
        { field: "type", headerName: "Type", minWidth: 140, cellRenderer: badgeRenderer("type") },
        { field: "buyer", headerName: "Buyer", minWidth: 170 },
        { field: "gross", headerName: "Gross", type: "rightAligned", minWidth: 155, filter: "agNumberColumnFilter", valueFormatter: currencyFormatter },
        { field: "fee", headerName: "Fee", type: "rightAligned", minWidth: 145, filter: "agNumberColumnFilter", valueFormatter: currencyFormatter },
        { field: "net", headerName: "Net", type: "rightAligned", minWidth: 155, filter: "agNumberColumnFilter", valueFormatter: currencyFormatter },
        { field: "status", headerName: "Status", minWidth: 155, cellRenderer: badgeRenderer("status") },
      ],
      defaultColDef: { sortable: true, filter: true, resizable: true, minWidth: 110, enableCellChangeFlash: true, filterParams: { buttons: ["reset", "apply"], closeOnApply: true } },
      rowSelection: { mode: "multiRow", checkboxes: true, headerCheckbox: true, enableClickSelection: false }, selectionColumnDef: { pinned: "left", width: 48, maxWidth: 48, sortable: false, resizable: false },
      pagination: true, paginationPageSize: [10, 25, 50].includes(Number(state.pageSize)) ? Number(state.pageSize) : 10, paginationPageSizeSelector: [10, 25, 50],
      animateRows: !reduceMotion(), cellFlashDuration: reduceMotion() ? 0 : 1000,
      overlayLoadingTemplate: '<span class="tx-grid-overlay">Loading transactions…</span>', overlayNoRowsTemplate: '<span class="tx-grid-overlay">No transactions available.</span>',
      isExternalFilterPresent: function () { var f = currentFilters(); return Boolean(f.type || f.status || f.from || f.to || f.min || f.max); },
      doesExternalFilterPass: function (node) { return core.matchesExternalFilters(node.data || {}, currentFilters()); },
      getRowClass: function (params) { return params.data && freshIds.has(params.data.id) ? "tx-grid-row-live" : undefined; },
      onGridReady: function (event) { api = event.api; if (Array.isArray(state.columns)) { try { api.applyColumnState({ state: state.columns, applyOrder: true }); } catch (_) {} } api.hideOverlay(); updateSummary(); filtersChanged(); },
      onFirstDataRendered: function () { updateSummary(); }, onFilterChanged: updateSummary, onSortChanged: saveState,
      onColumnMoved: saveState, onColumnVisible: saveState, onColumnResized: function (event) { if (event.finished) saveState(); }, onPaginationChanged: saveState,
      onRowClicked: function (event) { if (event.event && event.event.target && event.event.target.closest && event.event.target.closest(".ag-selection-checkbox,.ag-checkbox-input-wrapper")) return; if (event.data && !event.data._totals && typeof root.NovaPayOpenTransaction === "function") root.NovaPayOpenTransaction(event.data.id); },
      onCellKeyDown: function (event) { if (event.event && (event.event.key === "Enter" || event.event.key === " ") && event.column && event.column.getColId() !== "ag-Grid-SelectionColumn" && event.data && !event.data._totals && typeof root.NovaPayOpenTransaction === "function") { event.event.preventDefault(); root.NovaPayOpenTransaction(event.data.id); } },
      onSelectionChanged: updateSelection, onCellFocused: function (event) { var node = event.rowIndex >= 0 && event.api.getDisplayedRowAtIndex(event.rowIndex); if (node && node.data && !node.data._totals) setAssistantSelection(node.data.id); },
      onModelUpdated: updateSummary,
    };
  }
  function setAssistantSelection(id) { root.NovaPayAssistantSelectionId = String(id || ""); }
  function updateSelection(event) { var selected = event.api.getSelectedRows().filter(function (row) { return row && !row._totals; }); if (selected.length) setAssistantSelection(selected[selected.length - 1].id); }
  function renderColumnsMenu() {
    if (!columnsMenu || !api) return;
    columnsMenu.textContent = "";
    columnKeys.forEach(function (key) { var label = document.createElement("label"), input = document.createElement("input"); input.type = "checkbox"; input.checked = api.getColumn(key) ? api.getColumn(key).isVisible() : true; input.addEventListener("change", function () { api.setColumnsVisible([key], input.checked); }); label.append(input, document.createTextNode(" " + key.charAt(0).toUpperCase() + key.slice(1))); columnsMenu.appendChild(label); });
  }
  function syncRows() {
    if (!api) return;
    var next = core.rowsFromDom(tableBody), previous = new Map(lastRows.map(function (r) { return [r.id, r]; })), current = new Map(next.map(function (r) { return [r.id, r]; }));
    var add = [], update = [], remove = [];
    next.forEach(function (row) { if (!previous.has(row.id)) { add.push(row); if (row.source === "paypal-sandbox" && /^(payment|refund)$/i.test(row.type)) freshIds.add(row.id); } else if (JSON.stringify(previous.get(row.id)) !== JSON.stringify(row)) update.push(row); });
    lastRows.forEach(function (row) { if (!current.has(row.id)) remove.push(row); });
    if (add.length || update.length || remove.length) api.applyTransaction({ add: add, update: update, remove: remove });
    lastRows = next;
    if (add.some(function (row) { return freshIds.has(row.id); }) && !reduceMotion()) {
      var rowNodes = add.filter(function (row) { return freshIds.has(row.id); }).map(function (row) { return api.getRowNode(row.id); }).filter(Boolean);
      if (rowNodes.length) api.flashCells({ rowNodes: rowNodes });
      setTimeout(function () { add.forEach(function (row) { freshIds.delete(row.id); }); api.refreshCells({ force: true }); }, 1100);
    }
    updateSummary();
  }
  function watchRows() { if (observer || !root.MutationObserver) return; observer = new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(syncRows, 35); }); observer.observe(tableBody, { childList: true }); }
  function showFallback(message) { if (errorNode) { errorNode.hidden = false; errorNode.textContent = message; } if (host) host.hidden = true; if (byId("tx-grid-toolbar")) byId("tx-grid-toolbar").hidden = true; if (source) { source.classList.remove("tx-grid-source"); source.removeAttribute("aria-hidden"); source.removeAttribute("inert"); } }
  function createGrid() {
    if (!root.agGrid || !root.agGrid.createGrid || !root.agGrid.AllCommunityModule || !core) throw new Error("AG Grid Community did not load.");
    root.agGrid.ModuleRegistry.registerModules([root.agGrid.AllCommunityModule]);
    lastRows = core.rowsFromDom(tableBody);
    api = root.agGrid.createGrid(host, buildOptions(readState()));
    if (api) watchRows();
    source.classList.add("tx-grid-source"); source.setAttribute("aria-hidden", "true"); source.setAttribute("inert", "");
    host.hidden = false;
    if (errorNode) errorNode.hidden = true;
    renderColumnsMenu();
    var search = byId("tx-search");
    [search].concat(["tx-type", "tx-status", "tx-from", "tx-to", "tx-min", "tx-max"].map(byId)).forEach(function (control) { if (!control || control.dataset.txGridBound) return; control.dataset.txGridBound = "1"; control.addEventListener(control === search ? "input" : "change", filtersChanged); });
    byId("tx-export-grid-csv").addEventListener("click", function () { if (!api) return; var selected = api.getSelectedRows().length > 0; api.exportDataAsCsv({ onlySelected: selected, fileName: "novapay-transactions.csv", columnKeys: columnKeys }); });
    byId("tx-columns-toggle").addEventListener("click", function () { var open = columnsMenu.hidden; columnsMenu.hidden = !open; byId("tx-columns-toggle").setAttribute("aria-expanded", String(open)); if (open) renderColumnsMenu(); });
    root.document.addEventListener("click", function (event) { if (!event.target.closest(".tx-grid-columns")) { columnsMenu.hidden = true; byId("tx-columns-toggle").setAttribute("aria-expanded", "false"); } });
    var themeObserver = new MutationObserver(function () { if (api) { var focused = document.activeElement; api.setGridOption("theme", buildOptions(readState()).theme); if (focused && focused.focus && host.contains(focused)) focused.focus(); } });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    filtersChanged();
    if (pendingAssistantView) { applyAssistantSort(pendingAssistantView); pendingAssistantView = null; }
  }
  function loadLibrary() {
    return new Promise(function (resolve, reject) { if (root.agGrid) return resolve(); var script = document.createElement("script"); script.src = "assets/vendor/ag-grid/ag-grid-community-33.3.2.min.js"; script.async = true; script.onload = resolve; script.onerror = function () { reject(new Error("Could not load the local AG Grid Community bundle.")); }; document.head.appendChild(script); });
  }
  function init() {
    if (initialized || initializing) return;
    host = byId("transactions-grid"); source = byId("transactions-table-source"); tableBody = byId("transactions-table-body"); errorNode = byId("tx-grid-error"); columnsMenu = byId("tx-columns-menu");
    if (!host || !source || !tableBody) return;
    initializing = true; host.hidden = false; host.innerHTML = '<div class="tx-grid-overlay">Loading transactions…</div>';
    loadLibrary().then(function () { createGrid(); initialized = true; }).catch(function (error) { showFallback("Interactive grid unavailable. The original transaction table is shown. " + error.message); }).finally(function () { initializing = false; });
  }
  function applyAssistantSort(args) { if (!api || !args || !args.sortBy) return; var key = args.sortBy === "amount" ? "gross" : args.sortBy; if (columnKeys.indexOf(key) < 0) return; api.applyColumnState({ defaultState: { sort: null }, state: [{ colId: key, sort: args.sortDir === "asc" ? "asc" : "desc" }] }); }
  function applyAssistantView(args) {
    args = args || {};
    function set(id, value) { var el = byId(id); if (el && value != null) el.value = String(value); }
    set("tx-type", args.type); set("tx-status", args.status); set("tx-from", args.dateFrom); set("tx-to", args.dateTo); set("tx-min", args.minAmount); set("tx-max", args.maxAmount); set("tx-search", args.search);
    if (api) { filtersChanged(); applyAssistantSort(args); } else pendingAssistantView = Object.assign({}, args);
  }
  root.NovaPayTransactionsGrid = { init: init, refresh: syncRows, filtersChanged: filtersChanged, applyAssistantView: applyAssistantView, getApi: function () { return api; } };
}(typeof window !== "undefined" ? window : globalThis));
