(function () {
  "use strict";
  var api = window.NovaPayApi;
  var table = document.getElementById("invoice-table");
  var tbody = table && table.tBodies[0];
  var status = document.getElementById("invoice-live-status");
  var invoices = [];

  function showStatus(message, isError) {
    if (!status) return;
    status.textContent = message;
    status.className = isError ? "status warn" : "";
  }
  function money(invoice) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: invoice.currency || "USD" }).format(Number(invoice.total)); }
    catch (_) { return String(invoice.currency || "") + " " + String(invoice.total || "0.00"); }
  }
  function stateLabel(state) {
    return ({ draft: "Draft", reviewed: "Awaiting approval", sent: "Sent", paid: "Paid", void: "Void" })[state] || String(state || "Unknown");
  }
  function render() {
    if (!tbody) return;
    tbody.replaceChildren();
    var counts = { paid: 0, draft: 0 };
    invoices.forEach(function (invoice) {
      if (invoice.state === "paid") counts.paid += 1;
      if (invoice.state === "draft") counts.draft += 1;
      var row = tbody.insertRow();
      row.tabIndex = 0;
      row.setAttribute("aria-label", "Open invoice " + invoice.invoiceNumber + " details");
      [invoice.invoiceNumber, invoice.customerName, invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : "—", "—", money(invoice)].forEach(function (value) { row.insertCell().textContent = value || "—"; });
      var state = row.insertCell(), badge = document.createElement("span");
      badge.className = "status " + (invoice.state === "paid" ? "ok" : invoice.state === "draft" ? "info" : "warn");
      badge.textContent = stateLabel(invoice.state); state.appendChild(badge);
      var action = row.insertCell(), button = document.createElement("button");
      button.type = "button"; button.className = "table-action"; button.dataset.uiAction = "invoice-review"; button.textContent = "View"; action.appendChild(button);
      row.dataset.description = invoice.lines && invoice.lines.map(function (line) { return line.description; }).join(", ") || "";
      if (invoice.lines && invoice.lines[0]) { row.dataset.quantity = invoice.lines[0].quantity; row.dataset.rate = invoice.lines[0].unitPrice; }
    });
    var total = document.getElementById("invoice-count"), paid = document.getElementById("invoice-paid-count"), drafts = document.getElementById("invoice-draft-count");
    if (total) total.textContent = String(invoices.length);
    if (paid) paid.textContent = String(counts.paid);
    if (drafts) drafts.textContent = String(counts.draft);
    if (!invoices.length) { var row = tbody.insertRow(); var cell = row.insertCell(); cell.colSpan = 7; cell.textContent = "No invoices in this organization yet. Confirm a reviewed document to create a draft."; }
  }
  async function load() {
    if (!api || !tbody) return;
    showStatus("Loading live invoices…");
    try {
      var result = await api.request("/api/invoices?limit=100");
      invoices = Array.isArray(result.invoices) ? result.invoices : [];
      render();
      showStatus("Live organization data · " + invoices.length + " invoice(s).");
      var query = document.getElementById("invoice-search"); if (query) query.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (error) {
      invoices = []; render();
      if (tbody && tbody.rows.length) tbody.rows[0].cells[0].textContent = "Invoice data is unavailable. Retry when the API is restored.";
      showStatus(error.message || "Live invoices could not be loaded.", true);
    }
  }
  function activeView() { return location.hash === "#invoices" || Boolean(document.querySelector("#view-invoices:not([hidden])")); }
  document.addEventListener("DOMContentLoaded", function () {
    if (activeView()) load();
    document.addEventListener("click", function (event) { if (event.target.closest('[data-view="invoices"], [href="#invoices"]')) load(); });
    window.addEventListener("hashchange", function () { if (activeView()) load(); });
    document.addEventListener("novapay:invoice-created", load);
    var form = document.getElementById("invoice-create-form");
    if (form) form.addEventListener("submit", async function (event) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (!api) { document.getElementById("invoice-form-error").textContent = "Invoice API is unavailable."; return; }
      var customer = form.elements.customer.value.trim(), email = form.elements.customerEmail.value.trim();
      var description = form.elements.description.value.trim(), quantity = String(form.elements.quantity.value), unitPrice = String(form.elements.rate.value);
      if (!customer || !email || !description || !Number.isFinite(Number(quantity)) || !Number.isFinite(Number(unitPrice)) || Number(unitPrice) <= 0) {
        document.getElementById("invoice-form-error").textContent = !email ? "Customer email is required." : "Complete each field with valid invoice details."; return;
      }
      var submit = form.querySelector('button[type="submit"]'); if (submit) submit.disabled = true;
      try {
        await api.request("/api/invoices", { method: "POST", body: { invoiceNumber: "INV-" + Date.now(), customerName: customer, customerEmail: email, currency: "INR", lines: [{ description: description, quantity: quantity, unitPrice: unitPrice, taxRate: "0" }] } });
        var close = form.querySelector("[data-invoice-close]"); if (close) close.click();
        await load();
        var toast = document.getElementById("dashboard-toast"); if (toast) { toast.textContent = "Invoice draft saved. Sending is disabled."; toast.classList.add("show"); setTimeout(function () { toast.classList.remove("show"); }, 3200); }
      } catch (error) { document.getElementById("invoice-form-error").textContent = error.message || "Invoice draft could not be saved."; }
      finally { if (submit) submit.disabled = false; }
    }, true);
  });
})();
