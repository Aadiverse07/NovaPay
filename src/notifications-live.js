(function () {
  "use strict";
  var host = document.getElementById("notification-items"), empty = document.getElementById("notif-empty"), count = document.getElementById("notif-count"), dot = document.querySelector(".notification-dot");
  var auth = window.NovaPayAuth, api = window.NovaPayApi, busy = false, scanBusy = false, scanRole = "";
  var scanButtons = [document.getElementById("notif-run-scan"), document.getElementById("tx-run-scan")].filter(Boolean);
  var scanStatuses = [document.getElementById("notif-scan-status"), document.getElementById("tx-scan-status")].filter(Boolean);
  if (!host || !auth || !api) return;
  var scanRoles = ["owner", "admin", "accountant"];
  function targetFor(rule) {
    var value = String(rule || "").toLowerCase();
    if (value.indexOf("invoice") >= 0) return "invoices";
    if (value.indexOf("maintenance") >= 0 || value.indexOf("fund") >= 0) return "community-funds";
    if (value.indexOf("transaction") >= 0 || value.indexOf("refund") >= 0 || value.indexOf("fee") >= 0) return "transactions";
    return "approvals";
  }
  function label(rule, row) { if(rule==="support_ticket_reply"){var ids=row&&row.evidence_ids||row&&row.evidenceIds||[],number=ids.find(function(id){return String(id).indexOf("ticket_number:")===0;});return "Support replied to "+(number?String(number).slice("ticket_number:".length):"your ticket")}return String(rule || "Organization alert").replace(/[_-]+/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }); }
  function scanStatus(message) { scanStatuses.forEach(function (node) { node.textContent = message || ""; }); }
  function setScanVisibility(role) {
    scanRole = String(role || "").toLowerCase();
    var enabled = auth.mode === "supabase" && auth.isAuthenticated() && (!scanRole || scanRoles.indexOf(scanRole) >= 0);
    scanButtons.forEach(function (button) { button.hidden = !enabled; });
  }
  async function resolveScanRole() {
    await auth.ready;
    if (auth.mode !== "supabase" || !auth.isAuthenticated()) { setScanVisibility(""); return; }
    try {
      var session = await auth.currentSession(), metadata = session && session.user && session.user.app_metadata || {};
      var role = metadata.organization_role || metadata.org_role || "";
      if (!role && session && session.user) {
        var workspace = await api.request("/api/onboarding", { requiresOrg: false });
        var orgId = auth.currentOrgId(session.user.id), membership = (workspace.organizations || []).find(function (item) { return item.organizationId === orgId; });
        role = membership && membership.role || "";
      }
      setScanVisibility(role);
    } catch (error) {
      // The server remains the authority when role metadata could not be loaded.
      setScanVisibility("");
    }
  }
  async function runScan() {
    if (scanBusy || auth.mode !== "supabase" || !auth.isAuthenticated()) return;
    scanBusy = true;
    scanButtons.forEach(function (button) { button.disabled = true; button.textContent = "Scanning…"; });
    scanStatus("Scanning…");
    try {
      var result = await api.request("/api/anomalies/run", { method: "POST", body: {} });
      var created = Number(result && result.created || 0);
      if (created > 0) {
        scanStatus("Scan complete: " + created + " new " + (created === 1 ? "finding." : "findings."));
        api.invalidate(["notifications", "transactions"]);
        if (window.NovaPayNotifications) await window.NovaPayNotifications.refresh();
        if (window.NovaPayFinancialViews && window.NovaPayFinancialViews.loadTransactions) await window.NovaPayFinancialViews.loadTransactions();
      } else scanStatus("Scan complete: no new findings (already recorded today).");
    } catch (error) {
      if (error && (error.code === "ROLE_FORBIDDEN" || error.status === 403)) scanStatus("Your role can't run scans. Ask an owner, admin or accountant.");
      else if (error && error.status === 401) scanStatus("Your session expired. Sign in again, then retry.");
      else if (error && error.status === 429) scanStatus("The scan is rate limited. Try again shortly.");
      else scanStatus("Scan couldn't complete. Try again.");
      if (window.console) console.error("Could not run organization anomaly scan", error && (error.code || error.status) || "API_ERROR");
    } finally {
      scanBusy = false;
      scanButtons.forEach(function (button) { button.disabled = false; button.textContent = "Run scan"; });
    }
  }
  function setStatus(message, retry) {
    host.replaceChildren(); var p = document.createElement("p"); p.className = "module-foot"; p.setAttribute("role", "status"); p.textContent = message; host.appendChild(p);
    if (count) count.textContent = retry ? "Unavailable" : "Loading…";
    if (dot) dot.hidden = true;
    if (empty) empty.hidden = true;
    if (retry) { var button = document.createElement("button"); button.type = "button"; button.className = "btn btn--ghost"; button.textContent = "Retry"; button.addEventListener("click", load); host.appendChild(button); }
  }
  function render(rows) {
    host.replaceChildren(); var unread = rows.filter(function (row) { return row.status === "unread"; }).length;
    if (count) count.textContent = unread ? unread + " new" : "All clear";
    if (dot) dot.hidden = unread === 0;
    if (empty) empty.hidden = rows.length !== 0;
    rows.forEach(function (row) {
      var item = document.createElement("button"), icon = document.createElement("span"), copy = document.createElement("span"), title = document.createElement("b"), detail = document.createElement("small"), badge = document.createElement("span");
      item.type = "button"; item.className = "notification-item"; item.dataset.notificationView = targetFor(row.rule); item.dataset.notifKind = "live"; item.dataset.notificationId = row.id; item.dataset.notificationStatus = row.status || "read";
      icon.className = "notif-icon " + (row.severity === "critical" || row.severity === "high" ? "warn" : "info"); icon.textContent = row.severity === "critical" ? "!" : "•";
      title.textContent = label(row.rule,row); detail.textContent = row.rule==="support_ticket_reply"?"Check your email.":(row.severity || "info") + " · " + (row.created_at ? new Date(row.created_at).toLocaleString() : "Date unavailable");
      copy.append(title, detail); item.append(icon, copy);
      if (row.status === "unread") { badge.className = "status info"; badge.textContent = "New"; item.appendChild(badge); }
      item.addEventListener("click", async function () { try { if (row.status === "unread") { await api.request("/api/notifications/" + encodeURIComponent(row.id) + "/read", { method: "POST", body: {} }); row.status = "read"; load(); } } catch (error) { console.error("Could not mark organization notification read", error); } if (window.NovaPayActivateView) window.NovaPayActivateView(item.dataset.notificationView, true); var popover = document.getElementById("notification-popover"), button = document.getElementById("notifications"); if (popover) popover.hidden = true; if (button) button.setAttribute("aria-expanded", "false"); });
      host.appendChild(item);
    });
  }
  async function load() {
    if (busy || auth.mode !== "supabase" || !auth.isAuthenticated()) return;
    busy = true; setStatus("Loading organization notifications…", false);
    try { var result = await api.request("/api/notifications?limit=50&offset=0"); render(Array.isArray(result.notifications) ? result.notifications : []); }
    catch (error) { setStatus("Couldn't load organization notifications.", true); console.error("Could not load organization notifications", error); }
    finally { busy = false; }
  }
  window.NovaPayNotifications = { refresh: load };
  scanButtons.forEach(function (button) { button.addEventListener("click", runScan); });
  window.NovaPayNotifications.runScan = runScan;
  Promise.resolve(auth.ready).then(function () { load(); resolveScanRole(); });
  document.addEventListener("novapay:auth", function () { load(); resolveScanRole(); });
  document.getElementById("notifications").addEventListener("click", load);
}());
