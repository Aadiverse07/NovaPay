(function () {
  "use strict";
  var modal = document.getElementById("invoice-detail-modal"), returnFocus = null;
  if (!modal) return;
  var closeButtons = modal.querySelectorAll("[data-close-invoice-detail]");
  function field(label, value) {
    var wrapper = document.createElement("div"), term = document.createElement("dt"), detail = document.createElement("dd");
    term.textContent = label; detail.textContent = value == null || value === "" ? "—" : String(value);
    wrapper.appendChild(term); wrapper.appendChild(detail); return wrapper;
  }
  function formatMinor(minor, currency) {
    var code = String(currency || "").toUpperCase(), exponent = 2;
    try { exponent = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits; }
    catch (_) { code = "INR"; }
    var amount = Number(minor) / Math.pow(10, exponent);
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code, minimumFractionDigits: exponent, maximumFractionDigits: exponent }).format(amount) + " " + code;
  }
  function close() {
    if (modal.hidden) return;
    modal.hidden = true; modal.setAttribute("aria-hidden", "true"); document.body.classList.remove("modal-open");
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }
  function showLoading(trigger) {
    returnFocus = trigger || document.activeElement;
    modal.hidden = false; modal.setAttribute("aria-hidden", "false"); document.body.classList.add("modal-open");
    document.getElementById("invoice-detail-title").textContent = "Invoice details";
    document.getElementById("invoice-detail-subtitle").textContent = "Loading organization invoice…";
    document.getElementById("invoice-detail-status").textContent = "Loading invoice details…";
    document.getElementById("invoice-detail-fields").replaceChildren(); document.getElementById("invoice-detail-lines").replaceChildren();
    document.getElementById("invoice-detail-totals").textContent = ""; document.getElementById("invoice-detail-notes").textContent = "";
    document.getElementById("invoice-detail-history").replaceChildren();
    var download = modal.querySelector("[data-invoice-detail-download]"); download.hidden = true; download.disabled = true;
    modal.querySelector(".modal-close").focus();
  }
  function showError(message) {
    document.getElementById("invoice-detail-status").textContent = message || "Invoice details could not be loaded.";
    document.getElementById("invoice-detail-status").className = "status warn";
  }
  function open(invoice, trigger) {
    if (!invoice) return showError("Invoice details are unavailable.");
    if (trigger) returnFocus = trigger;
    var fields = document.getElementById("invoice-detail-fields"), lineBody = document.getElementById("invoice-detail-lines");
    var history = document.getElementById("invoice-detail-history"), status = document.getElementById("invoice-detail-status");
    document.getElementById("invoice-detail-title").textContent = "Invoice " + String(invoice.invoiceNumber || "");
    var statusLabel = ({ draft: "Draft", reviewed: "Reviewed", sent: "Sent · SIMULATED, not delivered", paid: "Paid", void: "Void" })[invoice.state] || String(invoice.state || "Unknown");
    status.textContent = statusLabel; status.className = "status " + (invoice.state === "paid" ? "success" : invoice.state === "void" ? "warn" : "info");
    fields.replaceChildren();
    [["Customer", invoice.customerName], ["Customer email", invoice.customerEmail], ["Issue date", invoice.issueDate], ["Due date", invoice.dueDate], ["Currency", invoice.currency]].forEach(function (item) { fields.appendChild(field(item[0], item[1])); });
    if (invoice.sourceDocumentId) {
      var wrapper = document.createElement("div"), term = document.createElement("dt"), detail = document.createElement("dd"), link = document.createElement("a");
      term.textContent = "Linked document"; link.href = "#documents"; link.textContent = "Document " + invoice.sourceDocumentId; detail.appendChild(link); wrapper.appendChild(term); wrapper.appendChild(detail); fields.appendChild(wrapper);
    } else fields.appendChild(field("Linked document", "None"));
    lineBody.replaceChildren();
    (invoice.lines || []).forEach(function (line) {
      var row = document.createElement("tr");
      [line.description, line.quantity, formatMinor(line.unitPriceMinor, invoice.currency), formatMinor(line.totalMinor, invoice.currency)].forEach(function (value) { var cell = document.createElement("td"); cell.textContent = String(value == null ? "—" : value); row.appendChild(cell); });
      lineBody.appendChild(row);
    });
    if (!lineBody.children.length) { var empty = document.createElement("tr"), cell = document.createElement("td"); cell.colSpan = 4; cell.textContent = "No line items recorded."; empty.appendChild(cell); lineBody.appendChild(empty); }
    document.getElementById("invoice-detail-totals").textContent = "Subtotal " + formatMinor(invoice.subtotalMinor, invoice.currency) + " · Tax " + formatMinor(invoice.taxMinor, invoice.currency) + " · Total " + formatMinor(invoice.totalMinor, invoice.currency);
    document.getElementById("invoice-detail-notes").textContent = invoice.notes || "No notes.";
    history.replaceChildren(); (invoice.events || []).forEach(function (event) { var item = document.createElement("li"); item.textContent = String(event.type || "Status update") + (event.occurredAt ? " · " + new Date(event.occurredAt).toLocaleString() : ""); history.appendChild(item); });
    if (!history.children.length) { var noHistory = document.createElement("li"); noHistory.textContent = "No status history available."; history.appendChild(noHistory); }
    var download = modal.querySelector("[data-invoice-detail-download]"); download.dataset.invoiceId = invoice.id; download.hidden = false; download.disabled = false;
    document.getElementById("invoice-detail-subtitle").textContent = invoice.state === "paid" ? "Paid invoice record" : "Organization invoice · " + statusLabel;
    status.className = "status " + (invoice.state === "paid" ? "success" : invoice.state === "void" ? "warn" : "info");
    modal.hidden = false; modal.setAttribute("aria-hidden", "false"); document.body.classList.add("modal-open");
  }
  closeButtons.forEach(function (button) { button.addEventListener("click", close); });
  modal.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    var controls = Array.prototype.slice.call(modal.querySelectorAll('button:not([disabled]):not([hidden]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])'));
    if (!controls.length) return;
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
    else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
  });
  window.NovaPayInvoiceDetail = { showLoading: showLoading, showError: showError, open: open, close: close, formatMinor: formatMinor };
})();
