(function () {
  "use strict";
  var host = document.getElementById("notification-items"), empty = document.getElementById("notif-empty"), count = document.getElementById("notif-count"), dot = document.querySelector(".notification-dot");
  var auth = window.NovaPayAuth, api = window.NovaPayApi, busy = false;
  if (!host || !auth || !api) return;
  function targetFor(rule) {
    var value = String(rule || "").toLowerCase();
    if (value.indexOf("invoice") >= 0) return "invoices";
    if (value.indexOf("maintenance") >= 0 || value.indexOf("fund") >= 0) return "community-funds";
    if (value.indexOf("transaction") >= 0 || value.indexOf("refund") >= 0 || value.indexOf("fee") >= 0) return "transactions";
    return "approvals";
  }
  function label(rule) { return String(rule || "Organization alert").replace(/[_-]+/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }); }
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
      title.textContent = label(row.rule); detail.textContent = (row.severity || "info") + " · " + (row.created_at ? new Date(row.created_at).toLocaleString() : "Date unavailable");
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
  Promise.resolve(auth.ready).then(load);
  document.addEventListener("novapay:auth", load);
  document.addEventListener("novapay:financial-refresh", load);
  window.addEventListener("focus", load);
  document.getElementById("notifications").addEventListener("click", load);
}());
