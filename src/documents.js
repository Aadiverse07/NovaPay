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
  function reviewConfidence(fields, key) {
    var model = fields.confidence && typeof fields.confidence[key] === "number" ? fields.confidence[key] : 0;
    var normalize = function (value) { return String(value == null ? "" : value).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""); };
    var text = normalize(fields.documentText || "");
    var value = fields[key], present = value != null && String(value).trim() !== "";
    var inText = present && normalize(value) && text.includes(normalize(value));
    if (["subtotal", "tax", "total"].includes(key)) {
      var nums = [fields.subtotal, fields.tax, fields.total].map(Number);
      var arithmetic = nums.every(Number.isFinite) && Math.round((nums[0] + nums[1]) * 100) === Math.round(nums[2] * 100);
      if (arithmetic) return { score: 1, basis: "Verified by arithmetic" };
    }
    if (key === "invoiceDate" && present) {
      var date = /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
      if (date && inText) return { score: 0.9, basis: "Calendar date matched in OCR text" };
    }
    if (key === "currency" && present) {
      var known = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF", "SGD", "NZD"];
      if (/^[A-Z]{3}$/.test(value) && known.includes(value) && inText) return { score: 0.9, basis: "ISO currency matched in OCR text" };
    }
    if ((key === "vendorName" || key === "invoiceNumber") && inText) return { score: 0.9, basis: "Matched in OCR text; model-reported, unverified" };
    return { score: present && inText ? Math.min(model, 0.7) : 0, basis: "Model-reported, unverified" };
  }
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
    wrap.className = "document-field-review";
    addText(wrap, "span", label);
    var input = document.createElement("input");
    input.type = type || "text";
    input.dataset.field = key;
    input.value = value == null ? "" : String(value);
    if (key === "total") { input.inputMode = "decimal"; input.required = true; }
    wrap.appendChild(input);
    if (confidence) {
      var badge = addText(wrap, "small", "Review confidence " + Math.round(confidence.score * 100) + "% · " + confidence.basis);
      badge.className = "document-confidence";
      badge.title = confidence.basis;
      badge.setAttribute("aria-label", "Review confidence " + Math.round(confidence.score * 100) + " percent; " + confidence.basis);
    }
    var error = document.createElement("small"); error.className = "document-field-error"; error.dataset.errorFor = key; error.setAttribute("aria-live", "polite"); wrap.appendChild(error);
    panel.appendChild(wrap);
  }
  function renderReview(doc) {
    selected = doc;
    createdDraftId = "";
    var panel = el("document-review-panel");
    panel.replaceChildren();
    var extraction = doc.extraction || {};
    var fields = extraction.fields || extraction;
    var confidence = {};
    ["vendorName", "invoiceNumber", "invoiceDate", "currency", "subtotal", "tax", "total"].forEach(function (key) { confidence[key] = reviewConfidence(fields, key); });
    addText(panel, "p", (doc.status || "unknown").toUpperCase() + " · review extracted fields before confirming.", "module-status");
    if (doc.duplicate_of || extraction.duplicateOf) addText(panel, "p", "Possible duplicate detected. Review the matching document before proceeding.", "status warn");
    var warnings = extraction.validation && extraction.validation.warnings || [];
    if (warnings.includes("currency_missing")) addText(panel, "p", "Currency is missing. Choose the correct currency before creating an invoice draft.", "status warn");
    var arithmeticWarnings = warnings.filter(function (warning) { return warning !== "currency_missing"; });
    if (arithmeticWarnings.length) addText(panel, "p", "Arithmetic warning: " + arithmeticWarnings.join(", ") + ". Check the total before creating a draft.", "status warn");
    else if (extraction.validation && extraction.validation.arithmetic === "unverified") addText(panel, "p", "Arithmetic could not be verified from the extracted fields.", "status info");
    if (extraction.confirmation) {
      addText(panel, "p", "Confirmed · invoice draft created. Nothing was sent.", "status success");
      var draftId = extraction.confirmation.invoiceDraftId;
      if (draftId) { var link = document.createElement("a"); link.href = "#invoices"; link.className = "btn btn--ghost document-draft-link"; link.textContent = "Open invoice draft"; link.addEventListener("click", function () { document.dispatchEvent(new CustomEvent("novapay:invoice-created", { detail: { invoiceId: draftId } })); }); panel.appendChild(link); }
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
    confirm.addEventListener("click", function () { confirmDocument(doc, panel, confirm); });
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
  async function confirmDocument(doc, panel, button) {
    if (busy || createdDraftId) return;
    var value = function (key) { return panel.querySelector('[data-field="' + key + '"]').value.trim(); };
    var names = { vendorName: "Supplier", invoiceNumber: "Invoice number", currency: "Currency", subtotal: "Subtotal", tax: "Tax", total: "Invoice total", customerEmail: "Supplier email" };
    var errors = [];
    Object.keys(names).forEach(function (key) {
      var input = panel.querySelector('[data-field="' + key + '"]'), error = panel.querySelector('[data-error-for="' + key + '"]');
      if (error) error.textContent = "";
      var current = input.value.trim(), invalid = !current;
      if (key === "customerEmail" && current) invalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current);
      if (key === "currency" && current) { var supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF", "SGD", "NZD"]; invalid = !/^[A-Za-z]{3}$/.test(current) || !supported.includes(current.toUpperCase()); }
      if (["subtotal", "tax", "total"].includes(key) && current) invalid = !/^\d{1,10}(?:\.\d{1,2})?$/.test(current);
      if (key === "total" && current && Number(current) <= 0) invalid = true;
      if (invalid) { if (error) error.textContent = names[key] + (current ? " is invalid." : " is required."); input.setAttribute("aria-invalid", "true"); errors.push(names[key]); }
      else input.removeAttribute("aria-invalid");
    });
    if (errors.length) { status(errors[0] + (errors.length === 1 ? " needs attention." : " and " + (errors.length - 1) + " other field(s) need attention."), "warn"); var toastNode = el("dashboard-toast"); if (toastNode) { toastNode.textContent = names[Object.keys(names).find(function (key) { return panel.querySelector('[data-error-for="' + key + '"]').textContent; })] + " is required or invalid."; toastNode.classList.add("show"); setTimeout(function () { toastNode.classList.remove("show"); }, 3200); } return; }
    var currency = value("currency").toUpperCase(), invoiceNumber = value("invoiceNumber");
    busy = true;
    if (button) button.disabled = true;
    try {
      var result = await api.request("/api/documents/" + encodeURIComponent(doc.id) + "/confirm", { method: "POST", body: { invoiceNumber: invoiceNumber.slice(0, 25), customerName: value("vendorName"), customerEmail: value("customerEmail"), currency: currency, subtotal: value("subtotal"), tax: value("tax"), total: value("total") } });
      createdDraftId = result.invoice && result.invoice.id || "";
      if (!createdDraftId) throw new Error("The server did not return the invoice draft.");
      document.dispatchEvent(new CustomEvent("novapay:invoice-created", { detail: { invoiceId: createdDraftId } }));
      status("Invoice draft created and document confirmed. Nothing was sent.", "success");
      await load();
    } catch (error) {
      status((error.message || "Could not create the invoice draft.") + " Nothing was sent.", "warn");
    } finally { busy = false; if (button) button.disabled = false; }
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
