/* Shared same-origin client for tenant-scoped NovaPay API calls. */
(function () {
  "use strict";

  var GET_TTL_MS = 20000;
  var responseCache = new Map();
  var inFlightGets = new Map();
  var retryAfterByPath = new Map();
  var requestCounts = new Map();

  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
  }

  function retryAfterMs(response, fallbackMs) {
    var header = response && response.headers && response.headers.get("Retry-After");
    if (header) {
      var seconds = Number(header);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
      var date = Date.parse(header);
      if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    }
    return fallbackMs;
  }

  function affectedResource(path) {
    if (/^\/api\/paypal\/(capture|refund)$/.test(path)) return ["transactions", "ledger", "reports", "events", "approvals"];
    if (/^\/api\/approvals\/[^/]+\/decision$/.test(path)) return ["approvals", "transactions", "ledger", "reports", "invoices", "notifications"];
    if (/^\/api\/invoices(?:\/|$)/.test(path)) return ["invoices", "approvals", "reports"];
    if (/^\/api\/funds(?:\/|$)/.test(path)) return ["funds", "maintenance", "ledger", "reports", "notifications"];
    if (/^\/api\/notifications(?:\/|$)/.test(path)) return ["notifications"];
    if (/^\/api\/documents(?:\/|$)/.test(path)) return ["documents", "invoices"];
    if (/^\/api\/(?:approvals)(?:\?|$)/.test(path)) return ["approvals"];
    return [];
  }

  function resourceFor(path) {
    if (/^\/api\/transactions(?:\?|$)/.test(path)) return "transactions";
    if (/^\/api\/ledger\//.test(path)) return "ledger";
    if (/^\/api\/reports\//.test(path)) return "reports";
    if (/^\/api\/approvals(?:\?|$)/.test(path)) return "approvals";
    if (/^\/api\/notifications(?:\?|$)/.test(path)) return "notifications";
    if (/^\/api\/funds\/maintenance/.test(path)) return "maintenance";
    if (/^\/api\/funds\//.test(path)) return "funds";
    if (/^\/api\/invoices(?:\/|\?|$)/.test(path)) return "invoices";
    if (/^\/api\/documents(?:\?|$)/.test(path)) return "documents";
    if (/^\/api\/events(?:\?|$)/.test(path)) return "events";
    return "";
  }

  function invalidateResources(resources) {
    if (!resources || !resources.length) return;
    responseCache.forEach(function (entry, key) { if (resources.indexOf(entry.resource) !== -1) responseCache.delete(key); });
  }

  function getStats() {
    var stats = {};
    requestCounts.forEach(function (count, path) { stats[path] = count; });
    return stats;
  }

  function apiError(response, body) {
    var detail = body && body.error;
    var message = detail && typeof detail === "object" ? detail.message : typeof detail === "string" ? detail : "The request could not be completed.";
    var error = new Error(message || "The request could not be completed.");
    error.status = response.status;
    error.code = (body && body.code) || (detail && typeof detail === "object" && detail.code) || "API_ERROR";
    error.retryBlocked = Boolean(body && body.retryBlocked);
    error.body = body;
    error.requestId = detail && typeof detail === "object" ? detail.requestId || null : null;
    error.fields = body && Array.isArray(body.fields) ? body.fields : [];
    return error;
  }

  function dispatchError(error) {
    document.dispatchEvent(new CustomEvent("novapay:api-error", {
      detail: { status: error.status, code: error.code, message: error.message }
    }));
  }

  async function request(path, options) {
    options = options || {};
    var auth = window.NovaPayAuth;
    if (!auth) throw new Error("NovaPay authentication is not initialized.");
    await auth.ready;
    var authSession = await auth.currentSession();
    if (!authSession || !authSession.access_token) {
      var missing = new Error("Sign in to continue.");
      missing.status = 401;
      missing.code = "AUTH_REQUIRED";
      dispatchError(missing);
      throw missing;
    }

    var headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    headers.set("Authorization", "Bearer " + authSession.access_token);
    var body = options.body;
    var rawBody = typeof Blob !== "undefined" && body instanceof Blob;
    if (body !== undefined && body !== null && typeof body !== "string" && !(body instanceof FormData) && !rawBody) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }
    var method = String(options.method || (body ? "POST" : "GET")).toUpperCase();
    var orgExempt = options.requiresOrg === false || path === "/api/onboarding" || path === "/api/public-config";
    if (!orgExempt) {
      var orgId = auth.currentOrgId(authSession.user.id);
      if (!orgId) {
        var missingOrg = new Error("Choose or set up an organization before continuing.");
        missingOrg.status = 400;
        missingOrg.code = "ORG_HEADER_REQUIRED";
        dispatchError(missingOrg);
        throw missingOrg;
      }
      headers.set("X-Org-Id", orgId);
    }

    var cacheable = method === "GET" && options.cache !== false && options.responseType !== "blob" && options.responseType !== "text";
    var cacheKey = cacheable ? [authSession.user && authSession.user.id || "", orgId || "", path].join("\n") : "";
    if (cacheKey) {
      var cached = responseCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return clone(cached.value);
      if (cached) responseCache.delete(cacheKey);
      if (inFlightGets.has(cacheKey)) return clone(await inFlightGets.get(cacheKey));
    }

    async function send() {
      var response;
      var attempt = 0;
      var cooldownUntil = retryAfterByPath.get(path) || 0;
      if (method === "GET" && cooldownUntil > Date.now()) {
        var cooling = new Error("This request is rate limited. Wait before trying again.");
        cooling.status = 429; cooling.code = "RATE_LIMITED"; cooling.retryAfterMs = cooldownUntil - Date.now();
        throw cooling;
      }
      while (true) {
        try {
          requestCounts.set(path, (requestCounts.get(path) || 0) + 1);
          response = await fetch(path, { method: method, headers: headers, body: body, credentials: "same-origin", cache: "no-store" });
        } catch (_) {
          var unavailable = new Error("NovaPay API is unreachable. Check your connection and try again.");
          unavailable.code = "API_UNAVAILABLE";
          dispatchError(unavailable);
          throw unavailable;
        }
        if (response.status !== 429) break;
        var waitMs = retryAfterMs(response, Math.min(30000, 1000 * Math.pow(2, attempt)));
        retryAfterByPath.set(path, Date.now() + waitMs);
        // Retry quickly only when the server's Retry-After is short. Longer waits
        // are surfaced to the view, and repeat clicks are held until that time.
        if (method !== "GET" || attempt >= 1 || waitMs > 3000) break;
        attempt += 1;
        await new Promise(function (resolve) { setTimeout(resolve, waitMs); });
      }
      var payload = null;
      try {
        if (response.ok && options.responseType === "text") payload = await response.text();
        else if (response.ok && options.responseType === "blob") payload = await response.blob();
        else payload = await response.json();
      } catch (_) {}
      if (!response.ok) {
        var error = apiError(response, payload);
        if (response.status === 429) error.retryAfterMs = retryAfterMs(response, 1000);
        dispatchError(error);
        if (response.status === 401) {
          var toLogin = function () {
            try { sessionStorage.setItem("novapay-auth-bounce", String(Date.now())); } catch (_) {}
            window.location.replace("preview.html#login");
          };
          auth.signOut().then(toLogin, toLogin);
        }
        throw error;
      }
      retryAfterByPath.delete(path);
      if (method !== "GET") invalidateResources(affectedResource(path));
      return payload || {};
    }

    if (cacheKey) {
      var pending = send();
      inFlightGets.set(cacheKey, pending);
      try {
        var value = await pending;
        responseCache.set(cacheKey, { value: clone(value), expiresAt: Date.now() + GET_TTL_MS, resource: resourceFor(path) });
        return clone(value);
      } finally { inFlightGets.delete(cacheKey); }
    }
    return send();
  }

  window.NovaPayApi = { request: request, getRequestStats: getStats, invalidate: invalidateResources };
}());
