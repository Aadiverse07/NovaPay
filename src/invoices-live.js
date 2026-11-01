(function () {
  "use strict";
  var api = window.NovaPayApi, table = document.getElementById("invoice-table"), tbody = table && table.tBodies[0];
  var status = document.getElementById("invoice-live-status"), form = document.getElementById("invoice-create-form");
  var lineItems = document.getElementById("invoice-line-items"), lineTemplate = document.getElementById("invoice-line-template");
  var invoices = [], role = "", mode = "create", editingId = "", createKey = "", createNumber = "", deleteKeys = Object.create(null);
  var writers = ["owner", "admin", "accountant"];
  function canWrite() { return writers.indexOf(role) >= 0; }
  function showStatus(message, isError) { if (status) { status.textContent = message; status.className = isError ? "status warn" : ""; } }
  function toast(message) { var node = document.getElementById("dashboard-toast"); if (!node) return; node.textContent = message; node.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(function () { node.classList.remove("show"); }, 3200); }
  function money(invoice) { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: invoice.currency || "INR" }).format(Number(invoice.total)); } catch (_) { return String(invoice.total || "0.00") + " " + String(invoice.currency || ""); } }
  function label(state) { return ({ draft: "Draft", reviewed: "Reviewed · awaiting approval", sent: "Sent", paid: "Paid", void: "Void" })[state] || String(state || "Unknown"); }
  function dateText(value) { if (!value) return "—"; var date = new Date(value + "T00:00:00"); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(); }
  function newKey() { return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }); }
  function actionButton(cell, text, action, className) { var button = document.createElement("button"); button.type = "button"; button.className = className || "table-action"; button.textContent = text; button.dataset.invoiceAction = action; cell.appendChild(button); return button; }
  function render() {
    if (!tbody) return;
    tbody.replaceChildren();
    var counts = { paid: 0, draft: 0 };
    invoices.forEach(function (invoice) {
      if (invoice.state === "paid") counts.paid += 1;
      if (invoice.state === "draft") counts.draft += 1;
      var row = tbody.insertRow(); row.tabIndex = 0; row.dataset.invoiceId = invoice.id; row.dataset.description = (invoice.lines || []).map(function (line) { return line.description; }).join(", ");
      row.setAttribute("aria-label", "Open invoice " + invoice.invoiceNumber + " details");
      [invoice.invoiceNumber, invoice.customerName, dateText(invoice.issueDate || invoice.createdAt), dateText(invoice.dueDate), money(invoice)].forEach(function (value) { row.insertCell().textContent = value || "—"; });
      var state = row.insertCell(), badge = document.createElement("span"); badge.className = "status " + (invoice.state === "paid" ? "ok" : invoice.state === "draft" ? "info" : invoice.state === "void" ? "warn" : "info"); badge.textContent = label(invoice.state); state.appendChild(badge);
      var actions = row.insertCell(); actionButton(actions, "View", "view");
      if (canWrite()) {
        if (invoice.state === "draft") { actionButton(actions, "Edit", "edit"); actionButton(actions, "Review", "review"); actionButton(actions, "Delete", "delete"); }
        else if (invoice.state === "reviewed") { actionButton(actions, "Move to draft", "reopen"); actionButton(actions, "Send · SIMULATED", "send"); actionButton(actions, "Void", "void"); }
        else if (invoice.state === "sent") actionButton(actions, "Void", "void");
      }
    });
    var total = document.getElementById("invoice-count"), paid = document.getElementById("invoice-paid-count"), drafts = document.getElementById("invoice-draft-count"), create = document.getElementById("invoice-create-button");
    if (total) total.textContent = String(invoices.length); if (paid) paid.textContent = String(counts.paid); if (drafts) drafts.textContent = String(counts.draft); if (create) create.hidden = !canWrite();
    if (!invoices.length) { var row = tbody.insertRow(), cell = row.insertCell(); cell.colSpan = 7; cell.textContent = "No invoices in this organization yet."; }
    applyFilters();
  }
  function applyFilters() {
    var query = document.getElementById("invoice-search"), filter = document.getElementById("invoice-filter");
    if (!tbody || !query || !filter) return;
    Array.prototype.forEach.call(tbody.rows, function (row) {
      if (!row.dataset.invoiceId) return;
      var invoice = invoices.find(function (item) { return item.id === row.dataset.invoiceId; });
      var q = query.value.trim().toLowerCase(), stateFilter = filter.value.toLowerCase();
      row.hidden = (q && row.textContent.toLowerCase().indexOf(q) < 0) || (stateFilter && label(invoice.state).toLowerCase().indexOf(stateFilter) < 0);
    });
  }
  async function load() {
    if (!api || !tbody) return;
    showStatus("Loading live invoices…");
    try {
      var result = await api.request("/api/invoices?limit=100");
      invoices = Array.isArray(result.invoices) ? result.invoices : []; role = typeof result.role === "string" ? result.role : "";
      render(); showStatus("Live organization data · " + invoices.length + " invoice(s).");
    } catch (error) {
      invoices = []; role = ""; render();
      if (!invoices.length && tbody.rows[0]) tbody.rows[0].cells[0].textContent = "Invoice data is unavailable. Retry when the API is restored.";
      showStatus(error.message || "Live invoices could not be loaded. No sample invoices are shown.", true);
    }
  }
  function activeView() { return location.hash === "#invoices" || Boolean(document.querySelector("#view-invoices:not([hidden])")); }
  function lineRows() { return lineItems ? Array.prototype.slice.call(lineItems.querySelectorAll("[data-invoice-line]")) : []; }
  function addLine(data) {
    if (!lineTemplate || !lineItems) return;
    var row = lineTemplate.content.firstElementChild.cloneNode(true);
    if (data) ["description", "quantity", "unitPrice"].forEach(function (name) { var input = row.querySelector('[name="' + name + '"]'); if (input) input.value = data[name] == null ? "" : data[name]; });
    if (data && data.taxRate != null) { var tax = row.querySelector('[name="taxRate"]'); if (tax) tax.value = String(Number(data.taxRate) * 100); }
    lineItems.appendChild(row); updatePreview();
  }
  function clearLines() { if (lineItems) lineItems.replaceChildren(); }
  function clearErrors() {
    if (!form) return;
    form.querySelectorAll("[data-invoice-error]").forEach(function (node) { node.textContent = ""; });
    form.querySelectorAll("[aria-invalid=true]").forEach(function (node) { node.removeAttribute("aria-invalid"); });
    var error = document.getElementById("invoice-form-error"); if (error) error.textContent = "";
  }
  function setError(name, message) {
    if (!form) return;
    var input = form.querySelector('[name="' + CSS.escape(name) + '"]');
    var wrapper = input && input.closest("[data-invoice-line]");
    var target = wrapper ? wrapper.querySelector('[data-invoice-error="' + CSS.escape(name) + '"]') : form.querySelector('[data-invoice-error="' + CSS.escape(name) + '"]');
    if (target) target.textContent = message;
    if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }
    var summary = document.getElementById("invoice-form-error"); if (summary) summary.textContent = message;
    toast((name || "Invoice field") + ": " + message);
  }
  function getPayload() {
    var customerName = form.elements.customerName.value.trim(), customerEmail = form.elements.customerEmail.value.trim();
    var currency = form.elements.currency.value, issueDate = form.elements.issueDate.value, dueDate = form.elements.dueDate.value;
    var notes = form.elements.notes.value.trim(), lines = [];
    if (!customerName) return { error: ["customerName", "Customer name is required."] };
    if (!customerEmail || !form.elements.customerEmail.validity.valid) return { error: ["customerEmail", "Enter a valid customer email."] };
    if (!issueDate) return { error: ["issueDate", "Issue date is required."] };
    if (!dueDate) return { error: ["dueDate", "Due date is required."] };
    if (dueDate < issueDate) return { error: ["dueDate", "Due date must be on or after issue date."] };
    var rows = lineRows();
    if (!rows.length) return { error: ["description", "Add at least one line item."] };
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i], description = row.querySelector('[name="description"]').value.trim();
      var quantity = Number(row.querySelector('[name="quantity"]').value), unitPrice = Number(row.querySelector('[name="unitPrice"]').value), taxPercent = Number(row.querySelector('[name="taxRate"]').value);
      if (!description) return { error: ["description", "Line item description is required."] };
      if (!Number.isFinite(quantity) || quantity <= 0) return { error: ["quantity", "Quantity must be greater than zero."] };
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: ["unitPrice", "Unit price must be zero or greater."] };
      if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) return { error: ["taxRate", "Tax rate must be between 0 and 100 percent."] };
      lines.push({ description: description, quantity: String(quantity), unitPrice: unitPrice.toFixed(2), taxRate: (taxPercent / 100).toFixed(4) });
    }
    return { payload: { invoiceNumber: mode === "edit" ? form.elements.invoiceNumber.value : "", customerName: customerName, customerEmail: customerEmail, currency: currency, issueDate: issueDate, dueDate: dueDate, notes: notes, lines: lines } };
  }
  function updatePreview() {
    if (!form) return;
    var total = lineRows().reduce(function (sum, row) {
      var quantity = Number(row.querySelector('[name="quantity"]').value), price = Number(row.querySelector('[name="unitPrice"]').value), tax = Number(row.querySelector('[name="taxRate"]').value);
      return sum + (Number.isFinite(quantity * price * (1 + tax / 100)) ? quantity * price * (1 + tax / 100) : 0);
    }, 0);
    var currency = form.elements.currency.value || "INR", output = document.getElementById("invoice-form-total");
    if (output) { try { output.textContent = new Intl.NumberFormat(undefined, { style: "currency", currency: currency }).format(total); } catch (_) { output.textContent = total.toFixed(2) + " " + currency; } }
  }
  function setFormMode(nextMode, invoice) {
    mode = nextMode; editingId = invoice ? invoice.id : ""; clearErrors();
    document.getElementById("invoice-dialog-title").textContent = mode === "edit" ? "Edit draft invoice" : "Create new invoice";
    form.querySelector('button[type="submit"]').textContent = mode === "edit" ? "Save draft changes" : "Create draft";
    form.elements.invoiceNumber.value = invoice ? invoice.invoiceNumber : "";
    if (invoice) {
      form.elements.customerName.value = invoice.customerName || ""; form.elements.customerEmail.value = invoice.customerEmail || "";
      form.elements.currency.value = invoice.currency || "INR"; form.elements.issueDate.value = invoice.issueDate || ""; form.elements.dueDate.value = invoice.dueDate || ""; form.elements.notes.value = invoice.notes || "";
      clearLines(); (invoice.lines || []).forEach(function (line) { addLine(line); });
      if (!invoice.lines || !invoice.lines.length) addLine();
    } else { createKey = ""; createNumber = ""; clearLines(); addLine(); }
    updatePreview();
  }
  async function editInvoice(id, trigger) {
    try {
      var result = await api.request("/api/invoices/" + encodeURIComponent(id));
      if (!result.invoice || result.invoice.state !== "draft") { toast("Only draft invoices can be edited."); return; }
      window.NovaPayInvoiceModal.open(trigger); setFormMode("edit", result.invoice);
    } catch (error) { toast(error.message || "Invoice could not be loaded for editing."); }
  }
  async function downloadInvoice(id, invoice, button) {
    if (!api || !id) return;
    var oldLabel = button && button.getAttribute("aria-label"), oldTitle = button && button.title, oldText = button && button.textContent;
    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); button.setAttribute("aria-label", "Preparing invoice PDF"); button.title = "Preparing PDF…"; if (button.hasAttribute("data-invoice-detail-download")) button.textContent = "Preparing PDF…"; }
    try {
      var blob = await api.request("/api/invoices/" + encodeURIComponent(id) + "/download", { responseType: "blob" });
      var number = String(invoice && invoice.invoiceNumber || id).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 50), url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "invoice-" + number + ".pdf"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("Invoice PDF downloaded.");
    } catch (error) {
      var message = error.status === 401 ? "Session expired. Sign in again to download this invoice."
        : error.status === 404 ? "Invoice not found in this organization."
          : error.status === 429 ? "Invoice downloads are rate limited. Try again later."
            : error.status >= 500 ? "Invoice PDF failed (" + (error.code === "INVOICE_AUDIT_WRITE_FAILED" ? "audit unavailable" : "server error") + (error.requestId ? ", id " + error.requestId : "") + ")."
              : error.message || "Invoice PDF could not be prepared.";
      toast(message);
    }
    finally { if (button) { button.disabled = false; button.removeAttribute("aria-busy"); button.setAttribute("aria-label", oldLabel || "Download invoice PDF"); button.title = oldTitle || "Download PDF"; if (button.hasAttribute("data-invoice-detail-download")) button.textContent = oldText || "⇩ Download PDF"; } }
  }
  async function performAction(button) {
    var row = button.closest("tr"), invoice = row && invoices.find(function (item) { return item.id === row.dataset.invoiceId; });
    if (!invoice) return;
    var action = button.dataset.invoiceAction; button.disabled = true;
    try {
      if (action === "view") {
        if (window.NovaPayInvoiceDetail) window.NovaPayInvoiceDetail.showLoading(button);
        var view = await api.request("/api/invoices/" + encodeURIComponent(invoice.id));
        if (window.NovaPayInvoiceDetail) window.NovaPayInvoiceDetail.open(view.invoice, button);
        return;
      }
      if (action === "edit") { await editInvoice(invoice.id, button); return; }
      if (action === "review") { await api.request("/api/invoices/" + encodeURIComponent(invoice.id) + "/review", { method: "POST", body: {} }); toast("Invoice marked reviewed."); }
      else if (action === "reopen") { await api.request("/api/invoices/" + encodeURIComponent(invoice.id) + "/reopen", { method: "POST", body: {} }); toast("Invoice moved back to draft. You can edit it now."); }
      else if (action === "delete") {
        if (!window.confirm("Delete this draft invoice? This cannot be undone.")) return;
        deleteKeys[invoice.id] = deleteKeys[invoice.id] || newKey();
        await api.request("/api/invoices/" + encodeURIComponent(invoice.id), { method: "DELETE", headers: { "Idempotency-Key": deleteKeys[invoice.id] } }); delete deleteKeys[invoice.id]; toast("Invoice draft deleted.");
      } else if (action === "void") {
        if (!window.confirm("Void this invoice? It cannot be sent or edited afterward.")) return;
        await api.request("/api/invoices/" + encodeURIComponent(invoice.id) + "/void", { method: "POST", body: {} }); toast("Invoice voided.");
      } else if (action === "send") {
        await api.request("/api/invoices/" + encodeURIComponent(invoice.id) + "/send-approval", { method: "POST", body: {} }); toast("Send request added to Approvals; SIMULATED, not delivered.");
      }
      await load();
    } catch (error) { if (action === "view" && window.NovaPayInvoiceDetail) window.NovaPayInvoiceDetail.showError(error.message || "Invoice details could not be loaded."); else toast(error.message || "Invoice action could not be completed."); }
    finally { if (button.isConnected) button.disabled = false; }
  }
  document.addEventListener("DOMContentLoaded", function () {
    if (activeView()) load();
    document.addEventListener("click", function (event) {
      if (event.target.closest('[data-view="invoices"], [href="#invoices"]')) load();
      var action = event.target.closest("[data-invoice-action]"); if (action) performAction(action);
      var detailDownload = event.target.closest("[data-invoice-detail-download]");
      if (detailDownload) { var id = detailDownload.dataset.invoiceId, item = invoices.find(function (invoice) { return invoice.id === id; }); downloadInvoice(id, item, detailDownload); }
      if (event.target.closest("#invoice-add-line")) addLine();
      var remove = event.target.closest("[data-invoice-remove-line]");
      if (remove) { if (lineRows().length > 1) remove.closest("[data-invoice-line]").remove(); updatePreview(); }
    });
    window.addEventListener("hashchange", function () { if (activeView()) load(); });
    document.addEventListener("novapay:invoice-created", load);
    document.addEventListener("novapay:invoice-form-open", function () { if (form) setFormMode("create"); });
    document.addEventListener("novapay:auth", load);
    var query = document.getElementById("invoice-search"), filter = document.getElementById("invoice-filter");
    if (query) query.addEventListener("input", applyFilters); if (filter) filter.addEventListener("change", applyFilters);
    if (form) {
      form.addEventListener("input", updatePreview); form.addEventListener("change", updatePreview);
      form.addEventListener("submit", async function (event) {
        event.preventDefault(); clearErrors();
        var result = getPayload();
        if (result.error) { setError(result.error[0], result.error[1]); return; }
        var submit = form.querySelector('button[type="submit"]'); if (submit) submit.disabled = true;
        try {
          var payload = result.payload;
          if (mode === "create") {
            if (!createKey) { createKey = newKey(); createNumber = "INV-" + Date.now().toString(36).toUpperCase() + "-" + createKey.slice(0, 6).toUpperCase(); }
            payload.invoiceNumber = createNumber;
            await api.request("/api/invoices", { method: "POST", headers: { "Idempotency-Key": createKey }, body: payload });
          } else await api.request("/api/invoices/" + encodeURIComponent(editingId), { method: "PATCH", body: payload });
          window.NovaPayInvoiceModal.close(); await load(); toast(mode === "create" ? "Invoice draft created." : "Invoice draft updated.");
        } catch (error) {
          var fieldError = error.fields && error.fields[0], field = fieldError && fieldError.path;
          if (field) { var fieldName = field.replace(/^lines\.\d+\./, "").split(/[.[\]]/).pop(); setError(fieldName, fieldError.message || error.message || "Check this field."); }
          else { var summary = document.getElementById("invoice-form-error"); if (summary) summary.textContent = error.message || "Invoice could not be saved."; toast("Invoice: " + (error.message || "could not be saved.")); }
        } finally { if (submit) submit.disabled = false; }
      }, true);
    }
    if (lineItems && !lineRows().length) addLine();
  });
})();
