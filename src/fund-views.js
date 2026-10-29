/* Live fund views. Existing sample cards remain visible only in the labelled demo workspace. */
(function () {
  "use strict";

  var auth = window.NovaPayAuth;
  if (!auth) return;
  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var make = function (tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  var amount = function (minor) {
    var value = Number(minor || 0) / 100;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  };
  var date = function (value) {
    if (!value) return "Date unavailable";
    var parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleString();
  };
  var trustedRole = function (session) {
    var metadata = session && session.user && session.user.app_metadata || {};
    return String(metadata.organization_role || metadata.org_role || "").toLowerCase();
  };
  var waitForDashboard = function () {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      (function check() {
        if (typeof window.NovaPayActivateView === "function") return resolve();
        if (Date.now() - started > 10000) return reject(new Error("Dashboard could not be initialized."));
        window.setTimeout(check, 50);
      })();
    });
  };

  function labelSampleViews() {
    ["fundraising", "maintenance", "transparency"].forEach(function (name) {
      var intro = $("#view-" + name + " .page-intro");
      if (!intro || $("[data-sample-view-label]", intro)) return;
      var badge = make("span", "status warn", "Sample data · Demo workspace");
      badge.setAttribute("data-sample-view-label", "");
      intro.appendChild(badge);
    });
  }

  function startFundraising() {
    var panel = $("#view-fundraising");
    if (!panel) return;
    panel.querySelectorAll(":scope > .empty-state").forEach(function (node) { node.remove(); });
    var root = make("div", "fund-live-view");
    root.setAttribute("data-fund-live-root", "");
    panel.appendChild(root);
    var roleNote = "";

    function showMessage(kind, message) {
      root.textContent = "";
      var box = make("div", "empty-state");
      box.setAttribute("role", kind === "error" ? "alert" : "status");
      box.appendChild(make("h3", "", kind === "error" ? "Fundraising data unavailable" : "No live campaigns yet"));
      box.appendChild(make("p", "", message));
      root.appendChild(box);
      if (roleNote) root.appendChild(make("p", "module-foot", roleNote));
    }

    function render(campaigns, summaries, contributions, receiptError, role) {
      root.textContent = "";
      var header = make("article", "dash-card module-card");
      header.appendChild(make("div", "card-heading"));
      var heading = $(".card-heading", header);
      var headingCopy = make("div");
      headingCopy.appendChild(make("h3", "", "Fundraising campaigns"));
      headingCopy.appendChild(make("p", "", "Amounts are USD. A pledge is intent only; only a verified capture counts as received."));
      heading.appendChild(headingCopy);
      header.appendChild(make("p", "", "PayPal Sandbox only. Sandbox demonstrates the workflow; eligibility, local rules, and product availability apply. Do not treat this as real-money fundraising."));
      root.appendChild(header);

      if (roleNote) root.appendChild(make("p", "module-foot", roleNote));
      if (!campaigns.length) {
        var empty = make("div", "empty-state");
        empty.appendChild(make("h3", "", "No live campaigns yet"));
        empty.appendChild(make("p", "", "This organization has no campaign records."));
        root.appendChild(empty);
      }

      if (["owner", "admin", "accountant"].indexOf(role) >= 0) {
        var createCard = make("article", "dash-card campaign-create");
        createCard.appendChild(make("h3", "", "Create campaign"));
        var createForm = make("form", "module-toolbar");
        createForm.innerHTML = '<label>Campaign title<input name="title" required maxlength="140" autocomplete="off"></label><label>Purpose<input name="purpose" required maxlength="2000" autocomplete="off"></label><label>Target (USD)<input name="target" type="number" required min="0.01" step="0.01" inputmode="decimal"></label><label>Deadline<input name="deadline" type="date"></label>';
        var createButton = make("button", "btn btn--primary", "Create campaign");
        createButton.type = "submit";
        createForm.appendChild(createButton);
        createForm.addEventListener("submit", async function (event) {
          event.preventDefault();
          var form = new FormData(createForm);
          var targetMinor = Math.round(Number(form.get("target")) * 100);
          if (!Number.isSafeInteger(targetMinor) || targetMinor <= 0) return showMessage("error", "Enter a valid positive USD target.");
          createButton.disabled = true;
          try {
            await window.NovaPayApi.request("/api/funds/campaigns", { method: "POST", body: {
              title: String(form.get("title")).trim(), purpose: String(form.get("purpose")).trim(), targetMinor: targetMinor,
              deadline: form.get("deadline") || null, organiser: "Organization", status: "active"
            } });
            createForm.reset();
            await load();
          } catch (error) { showMessage("error", error.message || "Campaign could not be created."); }
          finally { createButton.disabled = false; }
        });
        createCard.appendChild(createForm);
        root.appendChild(createCard);
      }

      var grid = make("div", "campaign-grid");
      campaigns.forEach(function (campaign, index) {
        var summary = summaries[index] || {};
        var values = [
          ["Target", summary.campaign && summary.campaign.targetMinor != null ? summary.campaign.targetMinor : campaign.targetMinor],
          ["Pledged", summary.pledgedMinor], ["Received", summary.receivedMinor],
          ["Allocated", summary.allocatedMinor], ["Spent", summary.actualSpendingMinor], ["Remaining", summary.remainingMinor]
        ];
        var card = make("article", "dash-card campaign-card");
        card.appendChild(make("span", "status " + (campaign.status === "active" ? "success" : "info"), String(campaign.status || "unknown")));
        card.appendChild(make("h3", "", campaign.title || "Untitled campaign"));
        card.appendChild(make("p", "", campaign.purpose || "No campaign purpose supplied."));
        var target = Number(values[0][1] || 0), received = Number(summary.receivedMinor || 0);
        var progress = make("div", "campaign-progress");
        var bar = make("span");
        bar.style.width = (target > 0 ? Math.min(100, Math.max(0, received / target * 100)) : 0) + "%";
        progress.appendChild(bar);
        card.appendChild(progress);
        var numbers = make("div", "campaign-numbers");
        values.forEach(function (entry) {
          var item = make("span");
          item.setAttribute("data-fund-metric", entry[0].toLowerCase());
          item.appendChild(make("small", "", entry[0]));
          item.appendChild(make("b", "", amount(entry[1])));
          numbers.appendChild(item);
        });
        card.appendChild(numbers);
        card.appendChild(make("small", "", "Updated " + date(summary.asOf)));
        if (summary.legalCaution) card.appendChild(make("small", "", summary.legalCaution));

        if (["owner", "admin", "accountant", "approver"].indexOf(role) >= 0) {
          var pledgeForm = make("form", "module-toolbar");
          pledgeForm.innerHTML = '<label>Pledge (USD)<input name="amount" type="number" required min="0.01" step="0.01" inputmode="decimal"></label>';
          var pledgeButton = make("button", "btn btn--ghost", "Record pledge");
          pledgeButton.type = "submit";
          pledgeForm.appendChild(pledgeButton);
          pledgeForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            var amountMinor = Math.round(Number(new FormData(pledgeForm).get("amount")) * 100);
            if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return showMessage("error", "Enter a valid positive USD pledge.");
            pledgeButton.disabled = true;
            try {
              var result = await window.NovaPayApi.request("/api/funds/campaigns/" + encodeURIComponent(campaign.id) + "/pledges", { method: "POST", body: { amountMinor: amountMinor } });
              var orderButton = make("button", "btn btn--primary", "Create PayPal Sandbox order");
              orderButton.type = "button";
              orderButton.addEventListener("click", async function () {
                orderButton.disabled = true;
                try {
                  var order = await window.NovaPayApi.request("/api/funds/contributions/" + encodeURIComponent(result.contribution.id) + "/paypal-order", { method: "POST" });
                  var link = make("a", "btn btn--primary", "Continue to PayPal Sandbox");
                  link.href = order.approveUrl;
                  link.target = "_blank";
                  link.rel = "noopener noreferrer";
                  orderButton.replaceWith(link);
                  pledgeForm.appendChild(make("p", "module-foot", "Sandbox order created. Only a signed capture webhook posts the contribution; the approval redirect alone is not proof of payment."));
                } catch (error) { pledgeForm.appendChild(make("p", "module-foot", error.message || "Sandbox order could not be created.")); orderButton.disabled = false; }
              });
              pledgeForm.textContent = result.message || "Pledge recorded as intent only; it does not count as received funds.";
              pledgeForm.appendChild(orderButton);
              pledgeForm.appendChild(make("span", "status warn", "PayPal Sandbox · no receipt until verified capture"));
              summary.pledgedMinor = Number(summary.pledgedMinor || 0) + amountMinor;
              var pledgedMetric = card.querySelector('[data-fund-metric="pledged"] b');
              if (pledgedMetric) pledgedMetric.textContent = amount(summary.pledgedMinor);
            } catch (error) { showMessage("error", error.message || "Pledge could not be recorded."); }
            finally { pledgeButton.disabled = false; }
          });
          card.appendChild(pledgeForm);
        }
        grid.appendChild(card);
      });
      if (campaigns.length) root.appendChild(grid);

      var receiptsCard = make("article", "dash-card module-card");
      receiptsCard.appendChild(make("h3", "", "Verified contribution receipts"));
      var received = contributions.filter(function (item) { return item.status === "received"; });
      if (!received.length) receiptsCard.appendChild(make("p", "empty-state", "No verified contribution receipts are available yet."));
      received.forEach(function (item) {
        var row = make("div", "transparency-row");
        var receiptNo = item.receiptNumber || item.receipt && item.receipt.receiptNumber;
        row.appendChild(make("span", "", receiptNo ? "Receipt " + receiptNo : "Verified contribution · receipt reference not returned by the read API"));
        row.appendChild(make("b", "", amount(item.amountMinor)));
        row.appendChild(make("small", "", date(item.receipt && item.receipt.issuedAt || item.receivedAt || item.createdAt)));
        receiptsCard.appendChild(row);
      });
      if (receiptError) receiptsCard.appendChild(make("p", "module-foot", "Receipt list could not be refreshed: " + receiptError));
      root.appendChild(receiptsCard);
    }

    async function load() {
      root.textContent = "";
      root.appendChild(make("p", "empty-state", "Loading live campaign data…"));
      try {
        var result = await window.NovaPayApi.request("/api/funds/campaigns");
        var campaigns = Array.isArray(result.campaigns) ? result.campaigns : [];
        var pair = await Promise.all([
          Promise.all(campaigns.map(function (campaign) { return window.NovaPayApi.request("/api/funds/campaigns/" + encodeURIComponent(campaign.id) + "/summary"); })),
          window.NovaPayApi.request("/api/funds/transparency").then(function (data) { return { data: data, error: "" }; }, function (error) { return { data: { contributions: [] }, error: error.message || "Receipt list unavailable." }; })
        ]);
        var session = await auth.currentSession();
        var role = trustedRole(session);
        roleNote = role === "donor" || role === "resident"
          ? "Read-only access for your organization role."
          : role ? "Organization role: " + role + ". API permissions are enforced by the server."
            : "Organization role is not available in trusted browser metadata; write controls are hidden until the role is resolved.";
        render(campaigns, pair[0], Array.isArray(pair[1].data.contributions) ? pair[1].data.contributions : [], pair[1].error, role);
      } catch (error) {
        showMessage("error", error.message || "Live fundraising data could not be loaded.");
      }
    }
    load();
  }

  function startMaintenance() {
    var panel = $("#view-maintenance");
    if (!panel) return;
    panel.querySelectorAll(":scope > .empty-state").forEach(function (node) { node.remove(); });
    var root = make("div", "fund-live-view");
    root.setAttribute("data-maintenance-live-root", "");
    panel.appendChild(root);
    var sessionRequests = [], currentExpenses = [], campaigns = [], currentRole = "", currentUserId = "";
    var managerRoles = ["owner", "admin", "accountant", "approver"];
    var reviewerRoles = ["owner", "admin", "approver"];
    var textField = function (form, labelText, name, options) {
      var label = make("label", "", labelText);
      var input = make(options && options.tag || "input");
      input.name = name;
      if (options && options.type) input.type = options.type;
      if (options && options.required) input.required = true;
      if (options && options.min) input.min = options.min;
      if (options && options.step) input.step = options.step;
      if (options && options.maxLength) input.maxLength = options.maxLength;
      label.appendChild(input);
      form.appendChild(label);
      return input;
    };
    var addAction = function (card, label, onClick, disabled) {
      var button = make("button", "btn btn--ghost", label);
      button.type = "button";
      button.disabled = Boolean(disabled);
      button.addEventListener("click", onClick);
      card.appendChild(button);
      return button;
    };

    function openDetails(item) {
      var modal = make("div", "action-modal maintenance-detail-modal");
      modal.setAttribute("role", "presentation");
      var backdrop = make("div", "action-modal-backdrop");
      var dialog = make("section", "action-dialog");
      dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "maintenance-detail-title");
      var close = make("button", "modal-close", "×"); close.type = "button"; close.setAttribute("aria-label", "Close request details");
      close.addEventListener("click", function () { modal.remove(); });
      dialog.appendChild(close);
      dialog.appendChild(make("span", "status info", "Maintenance request"));
      var title = make("h2", "", item.title || "Maintenance request"); title.id = "maintenance-detail-title"; dialog.appendChild(title);
      var fields = make("dl", "maintenance-detail-fields");
      var details = [["Request ID", item.id || "Unavailable"], ["Status", String(item.status || "unknown").replaceAll("_", " ")], ["Scope", item.scope || "Unavailable"], ["Amount", item.amountMinor == null ? "Unavailable" : amount(item.amountMinor)], ["Contractor", item.contractor && item.contractor.name || "Unavailable"], ["Quotation", item.quotation ? amount(item.quotation.amountMinor) + " · " + (item.quotation.id || "") : "Unavailable"], ["Payment", item.payment ? (item.payment.mode || "Unavailable") + (item.paymentReference ? " · " + item.paymentReference : "") : "Unavailable"], ["Evidence", (item.evidence || []).length ? item.evidence.map(function (entry) { return (entry.kind || "item") + " · " + (entry.reviewStatus || entry.review_status || "pending"); }).join(", ") : "Unavailable"]];
      details.forEach(function (pair) { var wrap = make("div"), dt = make("dt", "", pair[0]), dd = make("dd", "", String(pair[1])); wrap.appendChild(dt); wrap.appendChild(dd); fields.appendChild(wrap); });
      dialog.appendChild(fields);
      if (item.gap) dialog.appendChild(make("p", "module-foot", item.gap));
      if (item.mode === "SIMULATED" || item.payment && item.payment.mode === "SIMULATED") dialog.appendChild(make("p", "module-foot", "SIMULATED · no money sent"));
      modal.appendChild(backdrop); modal.appendChild(dialog); document.body.appendChild(modal);
      backdrop.addEventListener("click", function () { modal.remove(); });
      modal.addEventListener("keydown", function (event) { if (event.key === "Escape") modal.remove(); });
      close.focus();
    }

    function message(title, copy, isError) {
      root.textContent = "";
      var state = make("div", "empty-state");
      state.setAttribute("role", isError ? "alert" : "status");
      state.appendChild(make("h3", "", title));
      state.appendChild(make("p", "", copy));
      root.appendChild(state);
    }

    function replaceRequest(item, result) {
      var request = result && result.request || null;
      if (request && request.status) item.status = request.status;
      else if (result && ["requested", "quoting", "scope_approved", "contractor_verified", "payment_approved", "paid", "evidence_submitted", "reviewed", "closed"].indexOf(result.status) >= 0) item.status = result.status;
      if (result && result.contractor) item.contractor = result.contractor;
      if (result && result.quotation) item.quotation = result.quotation;
      if (result && result.approval) item.approval = result.approval;
      if (result && result.approvals !== undefined) {
        item.paymentApprovalCount = Number(result.approvals);
        item.paymentRequired = Number(result.required || 1);
        item.lastPaymentApproverId = currentUserId;
      }
      if (result && result.mode) { item.mode = result.mode; item.gap = result.gap || "simulated, no ledger entry"; }
      if (result && result.evidence) {
        item.evidence = item.evidence || [];
        item.evidenceSubmitterId = currentUserId;
        var found = item.evidence.findIndex(function (entry) { return entry.id === result.evidence.id; });
        if (found < 0) item.evidence.push(result.evidence); else item.evidence[found] = result.evidence;
      }
    }

    async function submit(item, button, path, body) {
      button.disabled = true;
      try {
        var result = await window.NovaPayApi.request(path, { method: "POST", body: body || {} });
        replaceRequest(item, result);
        render();
      } catch (error) {
        button.disabled = false;
        var alert = make("p", "module-foot", error.message || "The maintenance action could not be completed.");
        alert.setAttribute("role", "alert");
        root.prepend(alert);
      }
    }

    function stages(card, status) {
      var names = ["requested", "quoting", "scope_approved", "contractor_verified", "payment_approved", "paid", "evidence_submitted", "reviewed", "closed"];
      var labels = ["Requested", "Quotation", "Scope approval", "Contractor verification", "Payment approval", "Payment", "Evidence", "Review", "Closed"];
      var current = names.indexOf(status);
      var list = make("div", "workflow-steps");
      names.forEach(function (_name, index) {
        var step = make("span", index <= current ? "done" : "", labels[index]);
        if (index > current) step.setAttribute("aria-disabled", "true");
        list.appendChild(step);
      });
      card.appendChild(list);
      card.appendChild(make("span", "status warn", "State · " + String(status || "unknown").replaceAll("_", " ")));
    }

    function render() {
      root.textContent = "";
      var header = make("article", "dash-card module-card");
      header.appendChild(make("h3", "", "Maintenance workflow"));
      header.appendChild(make("p", "", "PayPal Payouts are unavailable. A queued payment is SIMULATED and does not move money or post to the ledger."));
      addAction(header, "Refresh transparency data", refresh, false);
      root.appendChild(header);
      if (!currentRole) root.appendChild(make("p", "module-foot", "Organization role is unavailable in trusted browser metadata; maintenance write controls are hidden."));
      else if (currentRole === "donor" || currentRole === "resident") root.appendChild(make("p", "module-foot", "Read-only access for your organization role."));

      if (managerRoles.indexOf(currentRole) >= 0) {
        var createCard = make("article", "dash-card campaign-create");
        createCard.appendChild(make("h3", "", "New maintenance request"));
        var form = make("form", "module-toolbar");
        var campaignLabel = make("label", "", "Campaign (optional)");
        var campaignSelect = make("select");
        campaignSelect.name = "campaignId";
        var none = make("option", "", "No campaign"); none.value = ""; campaignSelect.appendChild(none);
        campaigns.forEach(function (campaign) { var option = make("option", "", campaign.title); option.value = campaign.id; campaignSelect.appendChild(option); });
        campaignLabel.appendChild(campaignSelect); form.appendChild(campaignLabel);
        textField(form, "Request title", "title", { required: true, maxLength: 160 });
        textField(form, "Scope", "scope", { required: true, maxLength: 4000 });
        textField(form, "Estimate (USD)", "estimate", { type: "number", min: "0.01", step: "0.01" });
        var create = make("button", "btn btn--primary", "Submit request"); create.type = "submit"; form.appendChild(create);
        form.addEventListener("submit", async function (event) {
          event.preventDefault(); create.disabled = true;
          var values = new FormData(form), estimate = Number(values.get("estimate"));
          var estimateMinor = estimate > 0 ? Math.round(estimate * 100) : null;
          var body = { campaignId: values.get("campaignId") || null, title: String(values.get("title")).trim(), scope: String(values.get("scope")).trim(), estimateMinor: estimateMinor };
          try {
            var result = await window.NovaPayApi.request("/api/funds/maintenance", { method: "POST", body: body });
            var request = result.request || {};
            sessionRequests.unshift({ id: request.id, title: request.title || body.title, scope: body.scope, status: request.status || "requested", amountMinor: estimateMinor, createdBy: currentUserId, evidence: [] });
            render();
          } catch (error) { create.disabled = false; message("Request not created", error.message || "The maintenance request failed.", true); }
        });
        createCard.appendChild(form); root.appendChild(createCard);
      }

      var rows = sessionRequests.slice();
      currentExpenses.forEach(function (expense) {
        if (!rows.some(function (item) { return item.id === expense.requestId; })) rows.push({
          id: expense.requestId, title: expense.title, status: expense.status, amountMinor: expense.amountMinor,
          quotation: expense.quotation, paymentApproval: expense.paymentApproval, payment: expense.payment,
          paymentReference: expense.paymentReference, ledgerEntryId: expense.ledgerEntryId,
          evidence: expense.completionEvidence || [], approvals: expense.approvals || [], gaps: expense.gaps || [], persisted: true
        });
      });
      if (!rows.length) {
        var empty = make("div", "empty-state"); empty.appendChild(make("h3", "", "No maintenance records available"));
        empty.appendChild(make("p", "", "Transparency currently lists requests after a payment row exists. Pre-payment request and quotation list routes are not available; newly created requests stay visible in this open dashboard session."));
        root.appendChild(empty);
      }
      rows.forEach(function (item) {
        var card = make("article", "dash-card module-card");
        card.tabIndex = 0; card.setAttribute("aria-label", "Open details for " + (item.title || "maintenance request"));
        card.addEventListener("click", function (event) { if (!event.target.closest("button,a,input,select,textarea,form")) openDetails(item); });
        card.addEventListener("keydown", function (event) { if ((event.key === "Enter" || event.key === " ") && event.target === card) { event.preventDefault(); openDetails(item); } });
        card.appendChild(make("h3", "", item.title || "Maintenance request"));
        card.appendChild(make("p", "", "Request " + String(item.id || "Unavailable") + " · " + (item.scope || "Scope details are not exposed by the transparency read.")));
        card.appendChild(make("p", "", "Amount " + (item.amountMinor == null ? "Unavailable" : amount(item.amountMinor))));
        stages(card, item.status);
        if (item.contractor) card.appendChild(make("p", "", "Contractor · " + (item.contractor.name || "Created")));
        if (item.quotation) card.appendChild(make("p", "", "Quotation · " + amount(item.quotation.amountMinor) + " · " + item.quotation.id));
        if (item.paymentApproval) card.appendChild(make("p", "", "Payment approval · " + (item.paymentApproval.id || "queued") + " · " + (item.paymentApproval.status || "pending")));
        if (item.paymentApprovalCount !== undefined) card.appendChild(make("p", "", "Distinct payment approvals · " + item.paymentApprovalCount + " of " + item.paymentRequired));
        if (item.mode === "SIMULATED" || item.payment && item.payment.mode === "SIMULATED") card.appendChild(make("span", "status warn", "SIMULATED · no money sent"));
        if (item.gap) card.appendChild(make("p", "module-foot", item.gap));
        (item.gaps || []).forEach(function (gap) { card.appendChild(make("p", "module-foot", gap.gap || String(gap))); });
        (item.evidence || []).forEach(function (evidence) { card.appendChild(make("p", "module-foot", "Evidence metadata · " + (evidence.kind || "item") + " · " + (evidence.reviewStatus || evidence.review_status || "pending") + " · " + evidence.id)); });

        var itemRole = managerRoles.indexOf(currentRole) >= 0 && currentRole !== "resident";
        var isRequester = item.createdBy && item.createdBy === currentUserId;
        var base = "/api/funds/maintenance/" + encodeURIComponent(item.id || "");
        if (itemRole && ["requested", "quoting"].indexOf(item.status) >= 0 && !item.contractor) {
          var contractorForm = make("form", "module-toolbar");
          textField(contractorForm, "Contractor name", "name", { required: true, maxLength: 160 });
          var contractorButton = make("button", "btn btn--ghost", "Add contractor"); contractorButton.type = "submit"; contractorForm.appendChild(contractorButton);
          contractorForm.addEventListener("submit", async function (event) { event.preventDefault(); contractorButton.disabled = true; var name = String(new FormData(contractorForm).get("name")).trim(); try { var result = await window.NovaPayApi.request("/api/funds/contractors", { method: "POST", body: { name: name } }); item.contractor = result.contractor; render(); } catch (error) { contractorButton.disabled = false; contractorForm.appendChild(make("p", "module-foot", error.message)); } });
          card.appendChild(contractorForm);
        }
        if (itemRole && ["requested", "quoting"].indexOf(item.status) >= 0 && item.contractor) {
          var quoteForm = make("form", "module-toolbar");
          textField(quoteForm, "Quotation (USD)", "amount", { type: "number", required: true, min: "0.01", step: "0.01" });
          textField(quoteForm, "Document reference (optional)", "documentRef", { maxLength: 500 });
          var quoteButton = make("button", "btn btn--ghost", "Submit quotation"); quoteButton.type = "submit"; quoteForm.appendChild(quoteButton);
          quoteForm.addEventListener("submit", async function (event) { event.preventDefault(); var values = new FormData(quoteForm), minor = Math.round(Number(values.get("amount")) * 100); if (!Number.isSafeInteger(minor) || minor < 1) return; quoteButton.disabled = true; await submit(item, quoteButton, base + "/quotations", { contractorId: item.contractor.id, amountMinor: minor, documentRef: String(values.get("documentRef") || "").trim() || null }); });
          card.appendChild(quoteForm);
        }
        if (item.status === "quoting" && item.quotation && reviewerRoles.indexOf(currentRole) >= 0) addAction(card, "Approve scope", function (event) { submit(item, event.currentTarget, base + "/scope-approval", { quotationId: item.quotation.id, note: "Scope and quote reviewed." }); }, isRequester);
        if (item.status === "scope_approved" && reviewerRoles.indexOf(currentRole) >= 0) addAction(card, "Verify contractor", function (event) { submit(item, event.currentTarget, base + "/contractor-verification", {}); }, isRequester);
        if (item.status === "contractor_verified" && reviewerRoles.indexOf(currentRole) >= 0) addAction(card, "Approve payment step", function (event) { submit(item, event.currentTarget, base + "/payment-approval", { note: "Payment reviewed." }); }, isRequester || (item.paymentApprovalCount !== undefined && item.paymentApprovalCount < item.paymentRequired && item.lastPaymentApproverId === currentUserId));
        if (item.status === "payment_approved" && itemRole && !item.approval) addAction(card, "Queue SIMULATED payment", function (event) { submit(item, event.currentTarget, base + "/payment", {}); }, false);
        if (item.status === "paid" && ["owner", "admin", "accountant"].indexOf(currentRole) >= 0) {
          var evidenceForm = make("form", "module-toolbar");
          var kindLabel = make("label", "", "Evidence type"); var kind = make("select"); kind.name = "kind"; ["inspection", "photo", "invoice", "other"].forEach(function (value) { var option = make("option", "", value); option.value = value; kind.appendChild(option); }); kindLabel.appendChild(kind); evidenceForm.appendChild(kindLabel);
          textField(evidenceForm, "Description", "description", { required: true, maxLength: 2000 });
          textField(evidenceForm, "File reference (metadata only)", "fileRef", { maxLength: 500 });
          evidenceForm.appendChild(make("p", "module-foot", "Evidence supports, but does not prove, that work was done correctly. No file is uploaded."));
          var evidenceButton = make("button", "btn btn--ghost", "Submit evidence"); evidenceButton.type = "submit"; evidenceForm.appendChild(evidenceButton);
          evidenceForm.addEventListener("submit", async function (event) { event.preventDefault(); var values = new FormData(evidenceForm); evidenceButton.disabled = true; await submit(item, evidenceButton, base + "/evidence", { kind: values.get("kind"), description: String(values.get("description")).trim(), fileRef: String(values.get("fileRef") || "").trim() || null }); });
          card.appendChild(evidenceForm);
        }
        if (item.status === "evidence_submitted" && reviewerRoles.indexOf(currentRole) >= 0) {
          (item.evidence || []).filter(function (entry) { return (entry.reviewStatus || entry.review_status) === "pending"; }).forEach(function (entry) {
            var submitterKnown = Boolean(item.evidenceSubmitterId);
            addAction(card, "Accept evidence " + String(entry.id).slice(0, 8), function (event) { submit(item, event.currentTarget, base + "/evidence/" + encodeURIComponent(entry.id) + "/review", { decision: "accept", note: "Completion evidence reviewed." }); }, !submitterKnown || item.evidenceSubmitterId === currentUserId || Boolean(item.createdBy && item.createdBy === currentUserId));
            if (!submitterKnown) card.appendChild(make("small", "", "Review disabled because submitter identity is withheld by the read API."));
          });
        }
        if (item.status === "reviewed" && reviewerRoles.indexOf(currentRole) >= 0) {
          addAction(card, "Close request", function (event) { submit(item, event.currentTarget, base + "/close", {}); }, isRequester || Boolean(item.persisted));
          if (item.persisted) card.appendChild(make("small", "", "Close disabled because requester identity is withheld by the read API."));
        }
        if (item.status === "payment_approved" && item.approval) card.appendChild(make("p", "module-foot", "Payment approval must be decided in Approvals. Until then, evidence submission is disabled."));
        root.appendChild(card);
      });
    }

    async function refresh() {
      root.textContent = ""; root.appendChild(make("p", "empty-state", "Loading maintenance records…"));
      try {
        var session = await auth.currentSession(); currentUserId = session && session.user && session.user.id || ""; currentRole = trustedRole(session);
        var results = await Promise.all([window.NovaPayApi.request("/api/funds/transparency"), window.NovaPayApi.request("/api/funds/campaigns")]);
        currentExpenses = Array.isArray(results[0].expenses) ? results[0].expenses : [];
        campaigns = Array.isArray(results[1].campaigns) ? results[1].campaigns : [];
        render();
      } catch (error) { message("Maintenance data unavailable", error.message || "Maintenance records could not be loaded.", true); }
    }
    window.NovaPayFundViews = window.NovaPayFundViews || {};
    window.NovaPayFundViews.refreshMaintenance = refresh;
    refresh();
  }

  function startTransparency() {
    var panel = $("#view-transparency");
    if (!panel) return;
    panel.querySelectorAll(":scope > .empty-state").forEach(function (node) { node.remove(); });
    var root = make("div", "fund-live-view");
    root.setAttribute("data-transparency-live-root", "");
    panel.appendChild(root);
    var role = "";

    function showError(error) {
      root.textContent = "";
      var state = make("div", "empty-state"); state.setAttribute("role", "alert");
      state.appendChild(make("h3", "", "Transparency data unavailable"));
      state.appendChild(make("p", "", error.message || "The organization transparency view could not be loaded."));
      root.appendChild(state);
    }

    function value(label, text) {
      var row = make("div", "transparency-row");
      row.appendChild(make("span", "", label)); row.appendChild(make("b", "", text));
      return row;
    }

    function render(data) {
      root.textContent = "";
      var intro = make("article", "dash-card transparency-hero");
      intro.appendChild(make("span", "status success", "Organization transparency · read only"));
      intro.appendChild(make("h2", "", "Fund transparency"));
      intro.appendChild(make("p", "", data.legalCaution || "Sandbox demonstrates the workflow only. No payout is implied by a SIMULATED record."));
      intro.appendChild(make("small", "", "Personal donor names and evidence file paths are withheld by the API."));
      root.appendChild(intro);

      if (["owner", "admin"].indexOf(role) >= 0) {
        var exportButton = make("button", "btn btn--primary", "Download audit CSV");
        exportButton.type = "button";
        exportButton.addEventListener("click", async function () {
          exportButton.disabled = true;
          try {
            var csv = await window.NovaPayApi.request("/api/funds/transparency/audit.csv", { responseType: "text" });
            var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
            var link = make("a"); link.href = url; link.download = "fund-audit.csv"; link.hidden = true;
            document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          } catch (error) { root.appendChild(make("p", "module-foot", "Audit export failed: " + (error.message || "Request unavailable."))); }
          finally { exportButton.disabled = false; }
        });
        root.appendChild(exportButton);
      }

      var summaryCard = make("article", "dash-card module-card");
      summaryCard.appendChild(make("h3", "", "Campaign summaries"));
      var summaries = Array.isArray(data.campaigns) ? data.campaigns : [];
      if (!summaries.length) summaryCard.appendChild(make("p", "empty-state", "No live campaign summaries are available."));
      summaries.forEach(function (item) {
        var summary = item.summary || item;
        var campaign = summary.campaign || item.campaign || {};
        var row = make("section", "transparency-row");
        row.appendChild(make("b", "", campaign.title || "Campaign"));
        row.appendChild(make("span", "", "Target " + amount(campaign.targetMinor) + " · Pledged " + amount(summary.pledgedMinor) + " · Received " + amount(summary.receivedMinor) + " · Allocated " + amount(summary.allocatedMinor) + " · Spent " + amount(summary.actualSpendingMinor) + " · Remaining " + amount(summary.remainingMinor)));
        summaryCard.appendChild(row);
      });
      root.appendChild(summaryCard);

      var expenses = Array.isArray(data.expenses) ? data.expenses : [];
      var heading = make("div", "card-heading"); heading.appendChild(make("h3", "", "Maintenance expenses"));
      root.appendChild(heading);
      if (!expenses.length) {
        var empty = make("div", "empty-state"); empty.appendChild(make("h3", "", "No live maintenance expenses"));
        empty.appendChild(make("p", "", "No expense rows are returned for this organization yet.")); root.appendChild(empty);
      }
      expenses.forEach(function (expense) {
        var card = make("article", "dash-card module-card");
        card.appendChild(make("h3", "", expense.title || "Maintenance expense"));
        card.appendChild(make("span", "status " + (expense.status === "closed" ? "success" : "info"), "State · " + String(expense.status || "unknown").replaceAll("_", " ")));
        card.appendChild(value("Amount", amount(expense.amountMinor)));
        var approvals = Array.isArray(expense.approvals) ? expense.approvals : [];
        if (expense.paymentApproval) approvals = approvals.concat([expense.paymentApproval]);
        if (!approvals.length) card.appendChild(value("Approval", "No approval returned"));
        approvals.forEach(function (approval) { card.appendChild(value("Approval · " + (approval.step || "payment"), [approval.decision || approval.status || "pending", approval.id || ""].filter(Boolean).join(" · "))); });
        card.appendChild(value("Quotation", expense.quotation ? amount(expense.quotation.amountMinor) + " · " + (expense.quotation.id || "reference unavailable") : "No quotation returned"));
        var payment = expense.payment || {};
        if (payment.mode === "SIMULATED") card.appendChild(make("span", "status warn", "SIMULATED · no money sent"));
        card.appendChild(value("Payment", [payment.mode || "", payment.status || "not returned"].filter(Boolean).join(" · ")));
        card.appendChild(value("Payment reference", expense.paymentReference || "No payment reference"));
        card.appendChild(value("Ledger entry", expense.ledgerEntryId || "No ledger entry"));
        var evidence = Array.isArray(expense.completionEvidence) ? expense.completionEvidence : [];
        if (!evidence.length) card.appendChild(value("Completion evidence", "No completion evidence"));
        evidence.forEach(function (item) {
          var safeUrl = "";
          try { var parsed = new URL(item.url || item.fileUrl || "", location.origin); if (parsed.protocol === "https:" || parsed.origin === location.origin) safeUrl = parsed.href; } catch (_) {}
          var row = make("div", "transparency-row");
          row.appendChild(make("span", "", (item.kind || "Evidence") + " · " + (item.reviewStatus || "status unavailable") + " · " + (item.id || "reference unavailable")));
          if (safeUrl) { var link = make("a", "table-action", "Open evidence"); link.href = safeUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; row.appendChild(link); }
          else row.appendChild(make("small", "", "Evidence metadata only; the API does not return a file link."));
          card.appendChild(row);
        });
        (Array.isArray(expense.gaps) ? expense.gaps : []).forEach(function (gap) { card.appendChild(make("p", "module-foot", gap.gap || String(gap))); });
        root.appendChild(card);
      });
    }

    async function load() {
      root.textContent = ""; root.appendChild(make("p", "empty-state", "Loading live transparency data…"));
      try {
        var session = await auth.currentSession(); role = trustedRole(session);
        var data = await window.NovaPayApi.request("/api/funds/transparency");
        render(data);
      } catch (error) { showError(error); }
    }
    load();
  }

  auth.ready.then(async function () {
    if (auth.mode === "demo") { labelSampleViews(); return; }
    if (auth.mode !== "supabase") return;
    try { await waitForDashboard(); startFundraising(); startMaintenance(); startTransparency(); }
    catch (error) {
      var panel = $("#view-fundraising");
      if (panel) {
        var intro = $(".page-intro", panel);
        var state = make("div", "empty-state", error.message || "Dashboard initialization failed.");
        state.setAttribute("role", "alert");
        panel.appendChild(state);
        if (intro) intro.appendChild(make("span", "status danger", "Live data unavailable"));
      }
    }
  }).catch(function () {});
}());
