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

  auth.ready.then(async function () {
    if (auth.mode === "demo") { labelSampleViews(); return; }
    if (auth.mode !== "supabase") return;
    try { await waitForDashboard(); startFundraising(); }
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
