/* Shared, public action catalog. The server imports this same file for validation. */
(function (root) {
  "use strict";
  var views = ["dashboard", "transactions", "ai-assistant", "approvals", "sandbox", "ledger", "invoices", "reports", "documents", "community-funds", "maintenance"];
  var uiActions = ["report-open", "maintenance-view", "maintenance-new", "campaign-view", "campaign-create", "invoice-create", "ledger-export", "reports-export"];
  var noArgs = { type: "object", properties: {}, additionalProperties: false };
  var invoiceWriters = ["owner", "admin", "accountant"];
  function validDateParts(year, month, day) {
    var date = new Date(Date.UTC(year, month, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day;
  }
  function dateISO(year, month, day) { return validDateParts(year, month, day) ? String(year).padStart(4, "0") + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0") : ""; }
  function parseFutureDate(value, today) {
    var text = String(value || "").trim(), base = String(today || new Date().toISOString().slice(0, 10)), parts = base.split("-").map(Number), year = parts[0], month = parts[1] - 1, day = parts[2];
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/), date;
    if (iso) date = dateISO(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    else if (/^tomorrow$/i.test(text)) { var next = new Date(Date.UTC(year, month, day + 1)); date = dateISO(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate()); }
    else {
      var months = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
      var dayFirst = text.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/i), monthFirst = text.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i), matched = dayFirst || monthFirst;
      if (matched) {
        var monthName = dayFirst ? matched[2] : matched[1], wantedDay = Number(dayFirst ? matched[1] : matched[2]), wantedMonth = months[monthName.toLowerCase()], wantedYear = Number(matched[3] || year);
        if (wantedMonth == null) return "";
        date = dateISO(wantedYear, wantedMonth, wantedDay);
        if (!matched[3] && date && date <= base) date = dateISO(wantedYear + 1, wantedMonth, wantedDay);
      }
    }
    return date && date > base ? date : "";
  }
  function parseInvoiceAmount(value, currency) {
    var text = String(value || "").trim().replace(/^(?:change the amount to|amount is|it is|that is)\s+/i, "").replace(/,/g, "").replace(/^(?:₹|\$|€|Rs\.?|INR|USD|EUR)\s*/i, "").replace(/\s*(?:INR|USD|EUR)$/i, "");
    if (!/^\d+(?:\.\d{1,3})?$/.test(text)) return null;
    try {
      var code = String(currency || "INR").toUpperCase(), helper = root.NovaPayCurrency && root.NovaPayCurrency.majorToMinor;
      if (helper) return helper(text, code);
      var digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
      var minor = Math.round(Number(text) * Math.pow(10, digits));
      return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
    } catch (_) { return null; }
  }
  function parseInvoiceCreateText(value, today) {
    var text = String(value || "").normalize("NFKC").replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
    if (!/\b(?:(?:create|make|generate|raise|prepare)\b.{0,60}\binvoices?\b|new\s+invoices?\b)/i.test(text)) return null;
    var currencyMatch = text.match(/\b(INR|USD|EUR)\b|₹|\$|€/i), currency = currencyMatch ? ({ "₹": "INR", "$": "USD", "€": "EUR" }[currencyMatch[0]] || currencyMatch[0].toUpperCase()) : "INR";
    var nameMatch = text.match(/\bfor\s+(?!me\b|myself\b)([A-Za-z0-9&.'’ -]{1,160}?)(?=\s+(?:for\s+(?:(?:₹|\$|€|INR|USD|EUR|Rs\.?)\s*)?\d|due\b|by\b|amount\b)|[,;.!?]|$)/i);
    var emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    var amountSource = text.replace(/\b(?:due|by)\b.*$/i, ""), amountMatch = amountSource.match(/(?:₹|\$|€|Rs\.?|INR|USD|EUR)\s*(\d[\d,]*(?:\.\d{1,3})?)|\b(?:for|of|amount(?:\s+of)?|total(?:\s+of)?)\s+(\d[\d,]*(?:\.\d{1,3})?)/i);
    var amountText = amountMatch && (amountMatch[1] || amountMatch[2]), descriptionMatch = text.match(/\bdescription\s*(?:is|:)?\s*([^,;.!?]+)/i);
    var dueMatch = text.match(/\bdue\s+(?:on\s+)?(\d{4}-\d{2}-\d{2}|tomorrow|\d{1,2}\s+[a-z]+(?:\s+\d{4})?|[a-z]+\s+\d{1,2}(?:,?\s+\d{4})?)/i);
    return { customerName: nameMatch ? nameMatch[1].trim() : "", customerEmail: emailMatch ? emailMatch[0] : "", amountMinor: amountText ? parseInvoiceAmount(amountText, currency) : null, currency: currency, description: descriptionMatch ? descriptionMatch[1].trim() : "", dueDate: dueMatch ? parseFutureDate(dueMatch[1], today) : "", issueDate: String(today || new Date().toISOString().slice(0, 10)) };
  }
  function parseInvoiceSlot(field, value, pending, today) {
    var text = String(value || "").trim(), currency = pending && pending.currency || "INR";
    if (field === "customerName") { var name = text.replace(/^(?:it is|it's|for)\s+/i, "").trim(); return name && !/^(?:me|myself)$/i.test(name) && name.length <= 160 ? { value: name } : { error: "Please provide a customer or business name." }; }
    if (field === "customerEmail") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) && text.length <= 254 ? { value: text } : { error: "Please give me a valid customer email address." };
    if (field === "amountMinor") { var amount = parseInvoiceAmount(text, currency), cur = text.match(/\b(INR|USD|EUR)\b/i); return amount ? { value: amount, currency: cur ? cur[1].toUpperCase() : currency } : { error: "Please enter an amount greater than zero, such as 12000." }; }
    if (field === "currency") return /^(?:INR|USD|EUR)$/i.test(text) ? { value: text.toUpperCase() } : { error: "Please choose INR, USD, or EUR." };
    if (field === "description") return text && text.length <= 200 ? { value: text } : { error: "Please give the invoice line a short description." };
    if (field === "dueDate") { var due = parseFutureDate(text.replace(/^(?:the due date is|due date is|due on|change the due date to|it is)\s+/i, ""), today); return due ? { value: due } : { error: "Please give a valid future due date, such as 15 November." }; }
    return { error: "I couldn't use that invoice detail. Please try again." };
  }
  function nextInvoiceSlot(data) {
    return ["customerName", "customerEmail", "amountMinor", "description", "dueDate"].find(function (field) { return field === "amountMinor" ? !(Number(data.amountMinor) > 0) : !String(data[field] || "").trim(); }) || "";
  }
  var registry = [
    { id: "nav.open", title: "Open a module", tier: 0, roles: ["owner", "admin", "accountant", "approver", "viewer", "donor", "resident"], speakableName: "open a module", examples: ["open ledger"], args: { type: "object", required: ["view"], properties: { view: { type: "string", enum: views } }, additionalProperties: false } },
    { id: "ui.click", title: "Open an app control", tier: 0, roles: ["owner", "admin", "accountant", "approver", "viewer", "donor", "resident"], speakableName: "open an app control", examples: ["open the new maintenance request form"], args: { type: "object", required: ["uiAction"], properties: { uiAction: { type: "string", enum: uiActions } }, additionalProperties: false } },
    { id: "data.query", title: "Ask about workspace data", tier: 0, roles: ["owner", "admin", "accountant", "approver", "viewer", "donor", "resident"], speakableName: "query workspace data", examples: ["show refunds this month"], args: { type: "object", required: ["topic"], properties: { topic: { type: "string", enum: ["transactions", "ledger", "invoices", "refunds", "fees", "funds", "maintenance", "approvals", "notifications"] }, filters: { type: "object", additionalProperties: false, properties: { from: { type: "string", maxLength: 10 }, to: { type: "string", maxLength: 10 } } } }, additionalProperties: false } },
    { id: "invoice.createDraft", title: "Create invoice draft", tier: 1, roles: ["owner", "admin", "accountant"], speakableName: "create a draft invoice", examples: ["create a draft invoice"], args: { type: "object", required: [], properties: { customerName: { type: "string", minLength: 1, maxLength: 160 }, customerEmail: { type: "string", format: "email", maxLength: 254 }, currency: { type: "string", pattern: "^[A-Z]{3}$" }, issueDate: { type: "string", format: "date" }, dueDate: { type: "string", format: "date" }, amountMinor: { type: "integer", minimum: 1 }, description: { type: "string", minLength: 1, maxLength: 200 }, notes: { type: "string", maxLength: 2000 }, lines: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", required: ["description", "quantity", "unitPriceMinor"], properties: { description: { type: "string", minLength: 1, maxLength: 200 }, quantity: { type: "number", exclusiveMinimum: 0, maximum: 100000 }, unitPriceMinor: { type: "integer", minimum: 0, maximum: 100000000000 }, taxRate: { type: "number", minimum: 0, maximum: 1 } }, additionalProperties: false } } }, additionalProperties: false } },
    { id: "invoice.downloadPdf", title: "Download invoice PDF", tier: 1, roles: ["owner", "admin", "accountant", "approver", "viewer"], speakableName: "download an invoice PDF", examples: ["download the invoice PDF"], args: { type: "object", required: ["invoiceId"], properties: { invoiceId: { type: "string", format: "uuid" } }, additionalProperties: false } },
    { id: "invoice.requestSendApproval", title: "Request invoice send approval", tier: 2, roles: ["owner", "admin", "accountant"], speakableName: "request invoice send approval", examples: ["send this invoice"], args: { type: "object", required: ["invoiceId"], properties: { invoiceId: { type: "string", format: "uuid" } }, additionalProperties: false } },
    { id: "report.open", title: "Open a report", tier: 0, roles: ["owner", "admin", "accountant", "approver", "viewer"], speakableName: "open a report", examples: ["open reports"], args: { type: "object", required: ["report"], properties: { report: { type: "string", enum: ["overview", "cash-flow", "income", "expenses", "trial-balance"] } }, additionalProperties: false } },
    { id: "report.export", title: "Export a report", tier: 1, roles: ["owner", "admin", "accountant"], speakableName: "export a report", examples: ["export the cash flow report"], args: { type: "object", required: ["report"], properties: { report: { type: "string", enum: ["cash-flow", "income", "expenses", "trial-balance"] } }, additionalProperties: false } },
    { id: "ledger.export", title: "Export ledger", tier: 1, roles: ["owner", "admin", "accountant"], speakableName: "export the ledger", examples: ["export ledger CSV"], args: noArgs },
    { id: "funds.openCampaign", title: "Open community campaigns", tier: 0, roles: ["owner", "admin", "accountant", "approver", "viewer", "donor", "resident"], speakableName: "open community funds", examples: ["open campaigns"], args: noArgs },
    { id: "funds.createCampaignDraft", title: "Create campaign draft", tier: 1, roles: ["owner", "admin", "accountant"], speakableName: "create a campaign draft", examples: ["create a campaign draft"], args: { type: "object", required: ["title", "purpose", "targetMinor", "currency", "deadline", "organiser"], properties: { title: { type: "string", minLength: 1, maxLength: 160 }, purpose: { type: "string", minLength: 1, maxLength: 2000 }, targetMinor: { type: "integer", minimum: 1 }, currency: { type: "string", pattern: "^[A-Z]{3}$" }, deadline: { type: "string", format: "date" }, organiser: { type: "string", minLength: 1, maxLength: 160 } }, additionalProperties: false } },
    { id: "maintenance.openNew", title: "Open maintenance request form", tier: 0, roles: ["owner", "admin", "accountant", "approver", "resident"], speakableName: "open a maintenance request", examples: ["new maintenance request"], args: noArgs },
    { id: "documents.promptUpload", title: "Open document upload", tier: 0, roles: ["owner", "admin", "accountant"], speakableName: "open document upload", examples: ["upload my document"], args: noArgs },
    { id: "documents.readReview", title: "Read document review", tier: 0, roles: ["owner", "admin", "accountant", "approver", "viewer"], speakableName: "read document review", examples: ["read my document review"], args: { type: "object", required: ["documentId"], properties: { documentId: { type: "string", format: "uuid" } }, additionalProperties: false } },
    { id: "documents.proposeConfirm", title: "Prepare document confirmation", tier: 2, roles: ["owner", "admin", "accountant"], speakableName: "prepare document confirmation", examples: ["confirm this document"], args: { type: "object", required: ["documentId"], properties: { documentId: { type: "string", format: "uuid" } }, additionalProperties: false } },
    { id: "assistant.stopSpeaking", title: "Stop speaking", tier: 0, roles: ["owner", "admin", "accountant", "approver", "viewer", "donor", "resident"], speakableName: "stop speaking", examples: ["stop"], args: noArgs },
    { id: "assistant.repeat", title: "Repeat answer", tier: 0, roles: ["owner", "admin", "accountant", "approver", "viewer", "donor", "resident"], speakableName: "repeat the answer", examples: ["repeat"], args: noArgs },
    { id: "assistant.help", title: "List assistant capabilities", tier: 0, roles: ["owner", "admin", "accountant", "approver", "viewer", "donor", "resident"], speakableName: "list what I can do", examples: ["help"], args: noArgs }
  ];
  root.NovaPayAssistantActions = Object.freeze({ registry: registry, views: Object.freeze(views), uiActions: Object.freeze(uiActions), isInvoiceCreateIntent: function(value){return /\b(?:(?:create|make|new|generate|raise|prepare)\b.{0,60}\binvoices?\b|\binvoices?\b.{0,45}\b(?:create|make|generate|raise)\b)/i.test(String(value||""));}, parseInvoiceCreateText: parseInvoiceCreateText, parseInvoiceSlot: parseInvoiceSlot, nextInvoiceSlot: nextInvoiceSlot, parseFutureDate: parseFutureDate });
  if (typeof module === "object" && module.exports) module.exports = root.NovaPayAssistantActions;
})(typeof globalThis === "object" ? globalThis : this);
