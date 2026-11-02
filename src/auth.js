/* NovaPay browser authentication bootstrap and helpers. */
(function () {
  "use strict";

  var AUTH_ORG_KEY = "novapay-org-id:";
  var WORKSPACE_FRESH_KEY = "novapay-workspace-checked:";
  var WORKSPACE_FRESH_MS = 15000;
  var client = null;
  var mode = "loading";
  var session = null;
  var demoReason = "";
  var workspaceError = "";

  function notifyAuth() {
    document.dispatchEvent(new CustomEvent("novapay:auth", { detail: { mode: mode, signedIn: isAuthenticated(), workspaceRequired: Boolean(workspaceError) } }));
  }

  function isAuthenticated() {
    if (mode === "supabase") return Boolean(session && session.access_token);
    try { return mode === "demo" && localStorage.getItem("novapay-demo-auth") === "true"; }
    catch (_) { return false; }
  }

  function updateModeLabels() {
    var demo = mode === "demo";
    var unavailable = mode === "unavailable";
    document.querySelectorAll(".auth-demo").forEach(function (el) {
      el.hidden = !demo && !unavailable;
      var label = el.querySelector("b");
      if (label) {
        label.textContent = demo ? "DEMO MODE" : unavailable ? "UNAVAILABLE" : "SECURE SIGN-IN";
        while (label.nextSibling) label.parentNode.removeChild(label.nextSibling);
        el.appendChild(document.createElement("br"));
        el.appendChild(document.createTextNode(demo
          ? "Backend authentication is unavailable. This session stays in this browser."
          : unavailable ? "Authentication could not be loaded. Please try again later." : "Sign in securely with Supabase Auth."));
      } else {
        el.textContent = demo
          ? "DEMO MODE · Backend authentication is unavailable. This session stays in this browser."
          : unavailable ? "Authentication is unavailable. Please try again later." : "Secure account · Supabase Auth";
      }
    });
    document.querySelectorAll(".auth-hint[data-auth-mode-hint]").forEach(function (el) {
      el.textContent = demo
        ? "DEMO MODE · This is a local sample session. No backend account is available."
        : unavailable ? "The authentication service could not be loaded." : "Your account is secured by Supabase Auth.";
    });
    document.querySelectorAll(".demo-session").forEach(function (el) {
      el.hidden = false;
      var label = el.querySelector("span:last-child");
      if (label) label.textContent = demo ? "Demo session · local only" : "Authenticated session";
    });
  }

  function errorMessage(body, fallback) {
    if (body && body.error && typeof body.error === "object") return body.error.message || fallback;
    if (body && typeof body.error === "string") return body.error;
    return fallback;
  }

  async function readJson(response) {
    var body = null;
    try { body = await response.json(); } catch (_) {}
    if (!response.ok) {
      var error = new Error(errorMessage(body, "The request could not be completed."));
      error.code = body && (body.code || (body.error && body.error.code));
      error.status = response.status;
      throw error;
    }
    return body || {};
  }

  function loginErrorCategory(error) {
    var code = String(error && error.code || "").toLowerCase();
    var status = Number(error && (error.status || error.statusCode) || 0);
    var message = String(error && error.message || "").toLowerCase();
    var detail = code + " " + message;
    if (status === 429 || /rate.?limit|too many (requests|attempts)|over_[a-z_]*rate_limit/.test(detail)) return "rate_limited";
    if (code === "email_not_confirmed" || /email (is )?not confirmed|confirm your email/.test(message)) return "email_not_confirmed";
    if (["invalid_credentials", "invalid_login_credentials", "invalid_grant"].includes(code) || /invalid login credentials|invalid email or password/.test(message)) return "invalid_credentials";
    return "network_config";
  }

  function loginErrorMessage(error) {
    return {
      invalid_credentials: "Email or password is incorrect.",
      email_not_confirmed: "Confirm your email address before signing in.",
      rate_limited: "Too many sign-in attempts. Wait a moment and try again.",
      network_config: "Sign-in is unavailable due to a network or configuration issue. Try again later."
    }[loginErrorCategory(error)];
  }

  function emailActionErrorMessage(error) {
    var code = String(error && error.code || "").toLowerCase();
    var status = Number(error && (error.status || error.statusCode) || 0);
    if (status === 429 || /rate.?limit|too_many|over_.*rate/.test(code)) return "Too many attempts. Wait before trying again.";
    if (/expired/.test(code)) return "That code expired. Request a new code and try again.";
    if (/otp|token|verification_code/.test(code)) return "That verification code is incorrect. Check it and try again.";
    if (/disposable/.test(code)) return "Use a non-disposable email address to create an account.";
    if (/already_exists|user_already_registered/.test(code)) return "An account may already use this email. Try signing in or resetting its password.";
    if (status === 401) return "Your session expired. Sign in again to continue.";
    return error && error.message || "The request could not be completed. Try again.";
  }

  function displayName(user) {
    var metadata = user && user.user_metadata || {};
    return String(metadata.full_name || metadata.name || (user && user.email ? user.email.split("@")[0] : "NovaPay User")).trim();
  }

  function maskEmail(email) {
    var parts = String(email || "").trim().toLowerCase().split("@");
    if (parts.length !== 2) return "your email address";
    var local = parts[0];
    return (local.length > 1 ? local.charAt(0) + "***" : "*") + "@" + parts[1];
  }

  function normalizeOtp(value) { return String(value || "").replace(/\D/g, "").slice(0, 6); }

  async function onboard(authSession, name) {
    var workspaceName = (String(name || "NovaPay").trim().slice(0, 110) || "NovaPay") + " Workspace";
    var response = await fetch("/api/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + authSession.access_token
      },
      body: JSON.stringify({ organizationName: workspaceName }),
      cache: "no-store"
    });
    var result = await readJson(response);
    if (!result.organizationId) throw new Error("Workspace setup did not return an organization.");
    try { localStorage.setItem(AUTH_ORG_KEY + authSession.user.id, result.organizationId); } catch (_) {}
    rememberWorkspace(authSession, result.organizationId);
    return result.organizationId;
  }

  function rememberWorkspace(authSession, orgId) {
    try { sessionStorage.setItem(WORKSPACE_FRESH_KEY + authSession.user.id, JSON.stringify({ orgId: orgId, checkedAt: Date.now() })); } catch (_) {}
  }

  function freshWorkspace(authSession) {
    try {
      var value = JSON.parse(sessionStorage.getItem(WORKSPACE_FRESH_KEY + authSession.user.id) || "null");
      var current = currentOrgId(authSession.user.id);
      return value && value.orgId && value.orgId === current && Date.now() - value.checkedAt < WORKSPACE_FRESH_MS ? current : "";
    } catch (_) { return ""; }
  }

  async function ensureWorkspace(authSession, name, options) {
    if (!authSession || !authSession.access_token || !authSession.user) throw new Error("Sign in again to set up your workspace.");
    options = options || {};
    if (!options.forceRefresh) {
      var verifiedOrgId = freshWorkspace(authSession);
      if (verifiedOrgId) return verifiedOrgId;
    }
    async function restore() {
      var lookup = await fetch("/api/onboarding", { headers: { "Authorization": "Bearer " + authSession.access_token }, cache: "no-store" });
      var current = await readJson(lookup);
      if (Array.isArray(current.organizations) && current.organizations.length) {
        var existing = current.organizations[0];
        if (!existing.organizationId) throw new Error("Workspace setup did not return an organization.");
        try { localStorage.setItem(AUTH_ORG_KEY + authSession.user.id, existing.organizationId); } catch (_) {}
        rememberWorkspace(authSession, existing.organizationId);
        workspaceError = "";
        return existing.organizationId;
      }
      return "";
    }
    try {
      var existingId = await restore();
      if (existingId) return existingId;
      var created = await onboard(authSession, name || displayName(authSession.user));
      workspaceError = "";
      return created;
    } catch (error) {
      if (error && error.code === "ONBOARDING_ALREADY_COMPLETED") {
        var restoredId = await restore();
        if (restoredId) return restoredId;
      }
      workspaceError = error && error.message || "Workspace setup failed.";
      throw error;
    }
  }

  function currentOrgId(userId) {
    try { return localStorage.getItem(AUTH_ORG_KEY + userId) || ""; } catch (_) { return ""; }
  }

  async function currentSession() {
    await api.ready;
    if (mode !== "supabase" || !client) return null;
    var result = await client.auth.getSession();
    if (result.error) throw result.error;
    session = result.data.session;
    return session;
  }

  async function signIn(email, password) {
    await api.ready;
    if (mode !== "supabase") throw new Error("Real sign-in is unavailable in demo mode.");
    var result = await client.auth.signInWithPassword({ email: email, password: password });
    if (result.error) throw result.error;
    session = result.data.session;
    await ensureWorkspace(session, displayName(session.user), { forceRefresh: true });
    notifyAuth();
    return session;
  }

  async function signUp(name, email, password) {
    await api.ready;
    if (mode !== "supabase") throw new Error("Real sign-up is unavailable in demo mode.");
    email = String(email || "").trim().toLowerCase();
    await authPreflight("signup", email);
    var result = await client.auth.signUp({
      email: email,
      password: password,
      options: { data: { full_name: name }, emailRedirectTo: window.location.origin + "/preview.html#login" }
    });
    if (result.error) throw result.error;
    if (result.data && result.data.user && Array.isArray(result.data.user.identities) && result.data.user.identities.length === 0) {
      throw Object.assign(new Error("This email could not be registered. Try signing in or resetting the password."), { code: "USER_ALREADY_EXISTS" });
    }
    session = null;
    return { user: result.data.user, session: null, email: email };
  }

  async function authPreflight(flow, email) {
    var query = new URLSearchParams({ flow: flow, email: String(email || "").trim().toLowerCase() });
    var response = await fetch("/api/auth/preflight?" + query.toString(), { headers: { Accept: "application/json" }, cache: "no-store" });
    return readJson(response);
  }

  async function verifySignup(email, token) {
    await api.ready;
    if (mode !== "supabase") throw new Error("Email verification is unavailable in demo mode.");
    email = String(email || "").trim().toLowerCase();
    await authPreflight("verify", email);
    var result = await client.auth.verifyOtp({ email: email, token: String(token || ""), type: "signup" });
    if (result.error) throw result.error;
    session = result.data.session;
    if (!session) throw new Error("Email verification succeeded, but no sign-in session was returned. Sign in to continue.");
    await ensureWorkspace(session, displayName(session.user), { forceRefresh: true });
    notifyAuth();
    return session;
  }

  async function resendSignup(email) {
    await api.ready;
    if (mode !== "supabase") throw new Error("Email verification is unavailable in demo mode.");
    email = String(email || "").trim().toLowerCase();
    await authPreflight("resend", email);
    var result = await client.auth.resend({ type: "signup", email: email });
    if (result.error) throw result.error;
  }

  async function resetPassword(email) {
    await api.ready;
    if (mode !== "supabase") throw new Error("Password recovery is unavailable in demo mode.");
    email = String(email || "").trim().toLowerCase();
    await authPreflight("recovery", email);
    var result = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/preview.html#login" });
    if (result.error) throw result.error;
  }

  async function verifyRecovery(email, token) {
    await api.ready;
    if (mode !== "supabase") throw new Error("Password recovery is unavailable in demo mode.");
    email = String(email || "").trim().toLowerCase();
    await authPreflight("verify", email);
    var result = await client.auth.verifyOtp({ email: email, token: String(token || ""), type: "recovery" });
    if (result.error) throw result.error;
    session = result.data.session;
    return session;
  }

  async function updatePassword(password) {
    await api.ready;
    if (mode !== "supabase" || !client) throw new Error("Password recovery is unavailable in demo mode.");
    var result = await client.auth.updateUser({ password: password });
    if (result.error) throw result.error;
    if (session) await ensureWorkspace(session, displayName(session.user));
    notifyAuth();
  }

  async function signInWithGoogle() {
    await api.ready;
    if (mode !== "supabase") throw new Error("Google sign-in is unavailable in demo mode.");
    var result = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/dashboard.html" }
    });
    if (result.error) throw result.error;
  }

  async function signOut() {
    await api.ready;
    if (mode === "supabase" && client) {
      var result = await client.auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
      session = null;
    } else {
      try {
        localStorage.removeItem("novapay-demo-auth");
        localStorage.removeItem("novapay-demo-user");
        localStorage.removeItem("novapay-demo-accounts");
      } catch (_) {}
    }
    notifyAuth();
  }

  var api = {
    ready: null,
    get mode() { return mode; },
    get demoReason() { return demoReason; },
    get client() { return client; },
    get workspaceError() { return workspaceError; },
    maskEmail: maskEmail,
    normalizeOtp: normalizeOtp,
    isAuthenticated: isAuthenticated,
    currentSession: currentSession,
    currentOrgId: currentOrgId,
    ensureWorkspace: ensureWorkspace,
    loginErrorCategory: loginErrorCategory,
    loginErrorMessage: loginErrorMessage,
    emailActionErrorMessage: emailActionErrorMessage,
    signIn: signIn,
    signUp: signUp,
    verifySignup: verifySignup,
    resendSignup: resendSignup,
    resetPassword: resetPassword,
    verifyRecovery: verifyRecovery,
    updatePassword: updatePassword,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut
  };

  api.ready = (async function () {
    var config;
    try {
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timeout = controller ? setTimeout(function () { controller.abort(); }, 5000) : null;
      var response;
      try {
        response = await fetch("/api/public-config", { headers: { Accept: "application/json" }, cache: "no-store", signal: controller ? controller.signal : undefined });
      } finally { if (timeout) clearTimeout(timeout); }
      if (!response.ok) throw new Error("The NovaPay API is not reachable.");
      config = await response.json();
    } catch (error) {
      mode = "demo";
      demoReason = error && error.message ? error.message : "Backend authentication is unavailable.";
      updateModeLabels();
      notifyAuth();
      return mode;
    }
    if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
      mode = "demo";
      demoReason = "Supabase public configuration is unavailable.";
    } else if (!window.supabase || typeof window.supabase.createClient !== "function") {
      mode = "unavailable";
      demoReason = "Supabase Auth could not be loaded.";
    } else {
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
      });
      mode = "supabase";
      try {
        var result = await client.auth.getSession();
        if (!result.error) {
          session = result.data.session;
          if (session) {
            try { await ensureWorkspace(session, displayName(session.user)); }
            catch (_) { demoReason = "The signed-in workspace could not be restored."; workspaceError = "Create your workspace to continue."; }
          }
        }
        else demoReason = "Supabase Auth could not verify the saved session.";
      } catch (_) { demoReason = "Supabase Auth could not verify the saved session."; }
      client.auth.onAuthStateChange(function (_event, nextSession) {
        session = nextSession;
        notifyAuth();
      });
    }
    updateModeLabels();
    notifyAuth();
    return mode;
  })();

  window.NovaPayAuth = api;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", updateModeLabels, { once: true });
}());
