/* Live organization-scoped document upload and review. */
(function () {
  "use strict";
  var api = window.NovaPayApi;
  var rows = [];
  var role = "";
  var roleLoaded = false;
  var selected = null;
  var busy = false;
  var createdDraftId = "";
  function el(id) { return document.getElementById(id); }
  function status(message, kind) {
    var node = el("documents-live-status");
    if (!node) return;
    node.textContent = message;
    node.className = "module-status" + (kind ? " status " + kind : "");
  }
  function addText(parent, tag, text, className) {
    var node = document.createElement(tag);
    node.textContent = text == null || text === "" ? "Not detected" : String(text);
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }
  function canWrite() { return roleLoaded && ["owner", "admin", "accountant"].includes(role); }
  function renderList() {
    var list = el("documents-list");
    var count = el("documents-count");
    if (!list || !count) return;
    list.replaceChildren();
    count.textContent = rows.length + (rows.length === 1 ? " document" : " documents");
    if (!rows.length) {
      addText(list, "p", "No documents have been uploaded to this organization yet.");
      return;
    }
    rows.forEach(function (doc) {
      var item = document.createElement("div");
      item.className = "document-review";
      addText(item, "span", (doc.mime_type === "application/pdf" ? "PDF" : "IMG"), "document-thumb");
      var details = document.createElement("div");
      addText(details, "b", doc.filename || "Document");
      addText(details, "small", (doc.status || "unknown") + (doc.duplicate_of ? " · Possible duplicate" : ""));
      item.appendChild(details);
      var action = document.createElement("button");
      action.type = "button";
      action.className = "table-action";
      action.textContent = doc.status === "processed" ? "Review extraction →" : "View status →";
      action.addEventListener("click", function () { renderReview(doc); });
      item.appendChild(action);
      list.appendChild(item);
    });
  }
  function field(panel, label, value, confidence, key, type) {
    var wrap = document.createElement("label");
    wrap.className = "module-field";
    addText(wrap, "span", label);
    var input = document.createElement("input");
    input.type = type || "text";
    input.dataset.field = key;
    input.value = value == null ? "" : String(value);
    if (key === "total") { input.inputMode = "decimal"; input.required = true; }
    wrap.appendChild(input);
    if (typeof confidence === "number") addText(wrap, "small", "OCR confidence " + Math.round(confidence * 100) + "%");
    panel.appendChild(wrap);
  }
  function renderReview(doc) {
    selected = doc;
    createdDraftId = "";
    var panel = el("document-review-panel");
    panel.replaceChildren();
    var extraction = doc.extraction || {};
    var fields = extraction.fields || extraction;
    var confidence = fields.confidence || {};
    addText(panel, "p", (doc.status || "unknown").toUpperCase() + " · review extracted fields before confirming.", "module-status");
    if (doc.duplicate_of || extraction.duplicateOf) addText(panel, "p", "Possible duplicate detected. Review the matching document before proceeding.", "status warn");
    var warnings = extraction.validation && extraction.validation.warnings || [];
    if (warnings.length) addText(panel, "p", "Arithmetic warning: " + warnings.join(", ") + ". Check the total before creating a draft.", "status warn");
    else if (extraction.validation && extraction.validation.arithmetic === "unverified") addText(panel, "p", "Arithmetic could not be verified from the extracted fields.", "status info");
    if (extraction.confirmation) {
      addText(panel, "p", "Confirmed · invoice draft created. Nothing was sent.", "status success");
      return;
    }
    if (doc.status !== "processed" || !canWrite()) {
      addText(panel, "p", canWrite() ? "Processing state: " + (doc.status || "unknown") : "Read-only access. Your organization role cannot confirm or reject documents.");
      return;
    }
    field(panel, "Supplier", fields.vendorName, confidence.vendorName, "vendorName");
    field(panel, "Invoice number", fields.invoiceNumber, confidence.invoiceNumber, "invoiceNumber");
    field(panel, "Invoice date", fields.invoiceDate, confidence.invoiceDate, "invoiceDate");
    field(panel, "Currency", fields.currency, confidence.currency, "currency");
    field(panel, "Subtotal", fields.subtotal, confidence.subtotal, "subtotal");
    field(panel, "Tax", fields.tax, confidence.tax, "tax");
    field(panel, "Invoice total", fields.total, confidence.total, "total", "text");
    field(panel, "Supplier email (required for draft)", "", null, "customerEmail", "email");
    var actions = document.createElement("div");
    actions.className = "module-inline";
    var confirm = document.createElement("button");
    confirm.type = "button"; confirm.className = "btn btn--primary"; confirm.textContent = "Confirm and create invoice draft";
    confirm.addEventListener("click", function () { confirmDocument(doc, panel); });
    var reject = document.createElement("button");
    reject.type = "button"; reject.className = "btn btn--ghost"; reject.textContent = "Reject document";
    reject.addEventListener("click", function () { rejectDocument(doc); });
    actions.append(confirm, reject); panel.appendChild(actions);
    addText(panel, "small", "Confirmation creates a draft only. It never sends an invoice.");
  }
  async function load() {
    if (!api) return;
    role = "";
    roleLoaded = false;
    status("Loading organization documents…");
    try {
      var result = await api.request("/api/documents");
      rows = Array.isArray(result.documents) ? result.documents : [];
      role = result.role || "";
      roleLoaded = typeof result.role === "string" && Boolean(result.role);
      renderList();
      status(rows.length ? "Live organization data · " + rows.length + " document(s)." : "Live organization data · no documents yet.");
      if (selected) {
        var current = rows.find(function (doc) { return doc.id === selected.id; });
        if (current) renderReview(current);
      }
    } catch (error) {
      role = "";
      roleLoaded = false;
      status(error.message || "Documents could not be loaded. Retry when the API is available.", "warn");
      var list = el("documents-list"); if (list) { list.replaceChildren(); addText(list, "p", "Document data is unavailable. No sample records are shown."); }
    }
  }
  async function upload(file) {
    if (!file || busy) return;
    if (!roleLoaded) await load();
    if (!roleLoaded) { status("Your organization role could not be verified. Refresh and try again.", "warn"); return; }
    if (!canWrite()) { status("Upload requires an owner, admin or accountant role.", "warn"); return; }
    var selectedName = el("document-upload-name");
    if (selectedName) selectedName.textContent = file.name;
    busy = true; status("Uploading " + file.name + "…");
    try {
      var result = await api.request("/api/documents", { method: "POST", body: file, headers: { "Content-Type": file.type, "X-File-Name": file.name } });
      var doc = result.document;
      status("Upload complete · processing OCR…");
      await api.request("/api/documents/" + encodeURIComponent(doc.id) + "/process", { method: "POST" });
      await load();
    } catch (error) {
      status(error.code === "DUPLICATE_DOCUMENT" ? "Duplicate detected. The upload was flagged and not processed." : (error.message || "Upload or OCR processing failed."), "warn");
      await load();
    } finally { busy = false; }
  }
  async function confirmDocument(doc, panel) {
    if (busy || createdDraftId) return;
    var value = function (key) { return panel.querySelector('[data-field="' + key + '"]').value.trim(); };
    var total = value("total"), currency = value("currency").toUpperCase(), invoiceNumber = value("invoiceNumber");
    if (!/^[A-Z]{3}$/.test(currency) || !/^\d{1,10}(?:\.\d{1,2})?$/.test(total) || Number(total) <= 0 || !invoiceNumber || !value("vendorName") || !value("customerEmail")) {
      status("Review supplier, invoice number, currency, positive total, and supplier email before confirming.", "warn"); return;
    }
    busy = true;
    try {
      var draft = await api.request("/api/invoices", { method: "POST", body: { invoiceNumber: invoiceNumber.slice(0, 25), customerName: value("vendorName"), customerEmail: value("customerEmail"), currency: currency, lines: [{ description: ("Invoice " + invoiceNumber).slice(0, 200), quantity: "1", unitPrice: total, taxRate: "0" }] } });
      createdDraftId = draft.invoice && draft.invoice.id || "created";
      await api.request("/api/documents/" + encodeURIComponent(doc.id) + "/confirm", { method: "POST", body: { invoiceDraftId: createdDraftId } });
      status("Invoice draft created and document confirmed. Nothing was sent.", "success");
      await load();
    } catch (error) {
      status((createdDraftId ? "Draft created; document confirmation did not finish. Do not retry draft creation. " : "Could not create a draft. ") + (error.message || ""), "warn");
    } finally { busy = false; }
  }
  async function rejectDocument(doc) {
    if (busy) return;
    busy = true;
    try { await api.request("/api/documents/" + encodeURIComponent(doc.id) + "/reject", { method: "POST", body: { reason: "Rejected during field review" } }); status("Document rejected.", "success"); selected = null; await load(); }
    catch (error) { status(error.message || "Could not reject document.", "warn"); }
    finally { busy = false; }
  }
  document.addEventListener("DOMContentLoaded", function () {
    var file = el("document-upload");
    if (file) file.addEventListener("change", function () { if (file.files && file.files[0]) return upload(file.files[0]); });
    var refresh = el("documents-refresh"); if (refresh) refresh.addEventListener("click", load);
    var nav = document.querySelector('[data-view="documents"], [data-view-target="documents"], [href="#documents"]');
    if (nav) nav.addEventListener("click", load);
    if (window.NovaPayAuth) Promise.resolve(window.NovaPayAuth.ready).then(function () { load(); });
    document.addEventListener("novapay:auth", function (event) {
      role = ""; roleLoaded = false; rows = []; selected = null; renderList();
      if (event.detail && event.detail.signedIn) load();
      else status("Sign in to load organization documents.", "warn");
    });
  });
}());
