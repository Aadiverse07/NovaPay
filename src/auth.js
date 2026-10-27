/* NovaPay browser authentication bootstrap and helpers. */
(function () {
  "use strict";

  var AUTH_ORG_KEY = "novapay-org-id:";
  var client = null;
  var mode = "loading";
  var session = null;
  var demoReason = "";

  function notifyAuth() {
    document.dispatchEvent(new CustomEvent("novapay:auth", { detail: { mode: mode, signedIn: isAuthenticated() } }));
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
    document.querySelectorAll(".auth-hint").forEach(function (el) {
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

  function displayName(user) {
    var metadata = user && user.user_metadata || {};
    return String(metadata.full_name || metadata.name || (user && user.email ? user.email.split("@")[0] : "NovaPay User")).trim();
  }

  async function onboard(authSession, name) {
    var workspaceName = (String(name || "NovaPay").trim().slice(0, 110) || "NovaPay") + " Workspace";
    var response = await fetch("/api/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + authSession.access_token
      },
      body: JSON.stringify({ organizationName: workspaceName })
    });
    var result = await readJson(response);
    if (!result.organizationId) throw new Error("Workspace setup did not return an organization.");
    try { localStorage.setItem(AUTH_ORG_KEY + authSession.user.id, result.organizationId); } catch (_) {}
    return result.organizationId;
  }

  async function ensureWorkspace(authSession, name) {
    if (!authSession || !authSession.access_token || !authSession.user) throw new Error("Sign in again to set up your workspace.");
    return onboard(authSession, name || displayName(authSession.user));
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
    await ensureWorkspace(session, displayName(session.user));
    notifyAuth();
    return session;
  }

  async function signUp(name, email, password) {
    await api.ready;
    if (mode !== "supabase") throw new Error("Real sign-up is unavailable in demo mode.");
    var result = await client.auth.signUp({
      email: email,
      password: password,
      options: { data: { full_name: name }, emailRedirectTo: window.location.origin + "/preview.html#login" }
    });
    if (result.error) throw result.error;
    session = result.data.session;
    if (session) await ensureWorkspace(session, name);
    notifyAuth();
    return { user: result.data.user, session: session };
  }

  async function resetPassword(email) {
    await api.ready;
    if (mode !== "supabase") throw new Error("Password recovery is unavailable in demo mode.");
    var result = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/preview.html#login" });
    if (result.error) throw result.error;
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
    isAuthenticated: isAuthenticated,
    currentSession: currentSession,
    currentOrgId: currentOrgId,
    ensureWorkspace: ensureWorkspace,
    signIn: signIn,
    signUp: signUp,
    resetPassword: resetPassword,
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
        if (!result.error) session = result.data.session;
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
