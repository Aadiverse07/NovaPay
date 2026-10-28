/* Shared same-origin client for tenant-scoped NovaPay API calls. */
(function () {
  "use strict";

  function apiError(response, body) {
    var detail = body && body.error;
    var message = detail && typeof detail === "object" ? detail.message : typeof detail === "string" ? detail : "The request could not be completed.";
    var error = new Error(message || "The request could not be completed.");
    error.status = response.status;
    error.code = (body && body.code) || (detail && typeof detail === "object" && detail.code) || "API_ERROR";
    error.retryBlocked = Boolean(body && body.retryBlocked);
    error.body = body;
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

    var response;
    try {
      response = await fetch(path, { method: method, headers: headers, body: body, credentials: "same-origin" });
    } catch (_) {
      var unavailable = new Error("NovaPay API is unreachable. Check your connection and try again.");
      unavailable.code = "API_UNAVAILABLE";
      dispatchError(unavailable);
      throw unavailable;
    }
    var payload = null;
    try { payload = response.ok && options.responseType === "text" ? await response.text() : await response.json(); } catch (_) {}
    if (!response.ok) {
      var error = apiError(response, payload);
      dispatchError(error);
      if (response.status === 401) {
        auth.signOut().catch(function () {});
        window.setTimeout(function () { window.location.replace("preview.html#login"); }, 0);
      }
      throw error;
    }
    return payload || {};
  }

  window.NovaPayApi = { request: request };
}());
