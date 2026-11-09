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
  var workspaceState = "idle";
  var workspaceRetryAt = 0;
  var securityStartedToken = "";
  var publicConfig = null;
  var stepUpClient = null;
  var recoveryFlow = false;

  function notifyAuth() {
    document.dispatchEvent(new CustomEvent("novapay:auth", { detail: { mode: mode, signedIn: isAuthenticated(), workspaceRequired: workspaceState === "missing", workspaceState: workspaceState } }));
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
      var retryAfter = response.headers && response.headers.get("Retry-After");
      if (retryAfter) { var seconds = Number(retryAfter), date = Date.parse(retryAfter); error.retryAfterMs = Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0; }
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

  function transientWorkspaceError(error) {
    var status = Number(error && (error.status || error.statusCode) || 0);
    return status === 429 || status >= 500 || error && (error.code === "API_UNAVAILABLE" || error.name === "TypeError");
  }

  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

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
    if (workspaceRetryAt > Date.now()) {
      var cooling = new Error("Server busy, retry workspace access shortly.");
      cooling.status = 429; cooling.code = "WORKSPACE_RETRY_BACKOFF"; cooling.retryAfterMs = workspaceRetryAt - Date.now();
      workspaceState = "transient"; workspaceError = "Server busy, retrying…";
      throw cooling;
    }
    var lookupConfirmedEmpty = false;
    async function restore() {
      var lookup;
      try { lookup = await fetch("/api/onboarding", { headers: { "Authorization": "Bearer " + authSession.access_token }, cache: "no-store" }); }
      catch (networkError) { networkError.code = "API_UNAVAILABLE"; throw networkError; }
      var current = await readJson(lookup);
      if (Array.isArray(current.organizations) && current.organizations.length) {
        var existing = current.organizations[0];
        if (!existing.organizationId) throw new Error("Workspace setup did not return an organization.");
        try { localStorage.setItem(AUTH_ORG_KEY + authSession.user.id, existing.organizationId); } catch (_) {}
        rememberWorkspace(authSession, existing.organizationId);
        workspaceError = "";
        workspaceState = "ready";
        return existing.organizationId;
      }
      lookupConfirmedEmpty = true;
      workspaceState = "missing";
      return "";
    }
    async function restoreWithBackoff() {
      var delayMs = 1000;
      for (var attempt = 0; attempt < 3; attempt++) {
        try { return await restore(); }
        catch (error) {
          if (!transientWorkspaceError(error) || attempt === 2) throw error;
          workspaceState = "transient";
          workspaceError = "Server busy, retrying…";
          notifyAuth();
          var waitMs = Math.max(delayMs, Number(error.retryAfterMs) || 0);
          workspaceRetryAt = Date.now() + waitMs;
          if (waitMs > 3000) throw error;
          await delay(waitMs);
          workspaceRetryAt = 0;
          delayMs = Math.min(30000, delayMs * 2);
        }
      }
      return "";
    }
    try {
      var existingId = await restoreWithBackoff();
      if (existingId) return existingId;
      var created = await onboard(authSession, name || displayName(authSession.user));
      workspaceError = "";
      workspaceState = "ready";
      return created;
    } catch (error) {
      if (error && error.code === "ONBOARDING_ALREADY_COMPLETED") {
        var restoredId = await restoreWithBackoff();
        if (restoredId) return restoredId;
      }
      if (transientWorkspaceError(error)) {
        workspaceState = "transient";
        workspaceError = "Server busy, retrying…";
      } else if (lookupConfirmedEmpty) {
        workspaceState = "missing";
        workspaceError = "Your email is verified, but no organization workspace is available yet.";
      } else {
        workspaceState = "unavailable";
        workspaceError = "Your workspace could not be verified. Retry when the service is available.";
      }
      notifyAuth();
      throw error;
    }
  }

  function currentOrgId(userId) {
    try { return localStorage.getItem(AUTH_ORG_KEY + userId) || ""; } catch (_) { return ""; }
  }

  function persistentDeviceId() {
    var key = "novapay-security-device-id", id = "";
    try { id = localStorage.getItem(key) || ""; } catch (_) {}
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return id;
    id = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c){var r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16)});
    try { localStorage.setItem(key,id); } catch (_) {}
    return id;
  }

  function startSecuritySession(authSession) {
    if (mode !== "supabase" || !authSession || !authSession.access_token || !authSession.user) return Promise.resolve();
    if (securityStartedToken === authSession.access_token) return Promise.resolve();
    var orgId = currentOrgId(authSession.user.id);
    if (!orgId) return Promise.resolve();
    securityStartedToken = authSession.access_token;
    return fetch("/api/security/session-start", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: "Bearer " + authSession.access_token, "X-Org-Id": orgId }, body: JSON.stringify({ deviceId: persistentDeviceId() }), cache: "no-store" }).then(function(){},function(){});
  }

  async function currentSession() {
    await api.ready;
    if (mode !== "supabase" || !client) return null;
    var result = await client.auth.getSession();
    if (result.error) throw result.error;
    session = result.data.session;
    recoveryFlow = true;
    return session;
  }

  async function signIn(email, password) {
    await api.ready;
    if (mode !== "supabase") throw new Error("Real sign-in is unavailable in demo mode.");
    email = String(email || "").trim().toLowerCase();
    await authPreflight("login", email);
    var result;
    try { result = await client.auth.signInWithPassword({ email: email, password: password }); }
    catch (error) { await reportLoginAttempt(email, false); throw error; }
    if (result.error) { await reportLoginAttempt(email, false); throw result.error; }
    await reportLoginAttempt(email, true, result.data && result.data.session);
    session = result.data.session;
    await ensureWorkspace(session, displayName(session.user), { forceRefresh: true });
    await startSecuritySession(session);
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

  async function reportLoginAttempt(email, success, authSession) {
    try {
      var headers={Accept:"application/json","Content-Type":"application/json"};
      if(success&&authSession&&authSession.access_token)headers.Authorization="Bearer "+authSession.access_token;
      await fetch("/api/auth/login-attempt", { method:"POST", headers:headers, body:JSON.stringify({email:email,success:Boolean(success)}), cache:"no-store" });
    } catch (_) {}
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
    await startSecuritySession(session);
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

  async function sendStepUpOtp() {
    await api.ready;
    if(mode!=="supabase"||!client||!session||!session.user.email||!publicConfig)throw new Error("Email re-authentication is unavailable.");
    if(!stepUpClient) stepUpClient=window.supabase.createClient(publicConfig.supabaseUrl,publicConfig.supabaseAnonKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false,flowType:"implicit"}});
    var result=await stepUpClient.auth.signInWithOtp({email:String(session.user.email).trim().toLowerCase(),options:{shouldCreateUser:false}});
    if(result.error){var code=String(result.error.code||result.error.name||"").toLowerCase(),e=new Error(result.error.status===429||/rate_limit|too_many/.test(code)?"Too many code requests. Wait before trying again.":/smtp|email.*disabled|not configured|provider_disabled/.test((result.error.message||"")+" "+code)?"Email delivery is not configured. Contact support.":/user_not_found|user_not_allowed/.test(code)?"This account could not be found for email verification. Sign in again and use its registered address.":"An email code could not be sent. Try again later.");e.code=code;e.status=result.error.status;throw e;}
  }

  async function verifyStepUpOtp(code,deviceId) {
    await api.ready;
    if(!stepUpClient||!session||!session.user.email)throw new Error("Request an email code first.");
    var result=await stepUpClient.auth.verifyOtp({email:String(session.user.email).trim().toLowerCase(),token:normalizeOtp(code),type:"email"});
    if(result.error){var e=new Error(result.error.status===429?"Too many code attempts. Wait a minute.":"That code is wrong or expired.");e.code=result.error.code||result.error.name;e.status=result.error.status;throw e;}
    var temporary=result.data&&result.data.session;
    if(!temporary||!temporary.access_token)throw new Error("The verification code did not create a valid proof.");
    try{return await window.NovaPayApi.request("/api/security/step-up/otp/verify",{method:"POST",body:{deviceId:deviceId,accessToken:temporary.access_token}});}
    finally{try{await stepUpClient.auth.signOut({scope:"local"});}catch(_){} stepUpClient=null;}
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
    recoveryFlow = true;
    return session;
  }

  async function updatePassword(password, nonce) {
    await api.ready;
    if (mode !== "supabase" || !client) throw Object.assign(new Error("Password recovery is unavailable in demo mode."),{code:"session_not_found"});
    var current=await client.auth.getSession();
    if(current.error)throw Object.assign(new Error("Sign in again before changing your password."),{code:"session_not_found",status:401});
    session=current.data.session||session;
    if(!session||!session.access_token)throw Object.assign(new Error("Sign in again before changing your password."),{code:"session_not_found",status:401});
    if(recoveryFlow&& !session.user)throw Object.assign(new Error("Sign in again before changing your password."),{code:"session_not_found",status:401});
    var attrs={password:password};if(nonce)attrs.nonce=nonce;
    var result=await client.auth.updateUser(attrs);
    if(result.error)throw result.error;
    session=(await client.auth.getSession()).data.session||session;recoveryFlow=false;
    await ensureWorkspace(session,displayName(session.user));
    if(window.NovaPayApi&&typeof window.NovaPayApi.request==="function")try{await window.NovaPayApi.request("/api/security/credential-changed",{method:"POST",body:{deviceId:persistentDeviceId()}})}catch(error){throw Object.assign(new Error("Password changed, but NovaPay could not record the security update. Refresh your session and try again."),{code:"credential_audit_failed",passwordChanged:true});}
    notifyAuth();
  }

  async function reauthenticatePasswordChange(){await api.ready;if(mode!=="supabase"||!client||!session)throw Object.assign(new Error("Sign in again before changing your password."),{code:"session_not_found"});var result=await client.auth.reauthenticate();if(result.error)throw result.error;}


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
    get workspaceState() { return workspaceState; },
    get workspaceRequired() { return workspaceState === "missing"; },
    maskEmail: maskEmail,
    normalizeOtp: normalizeOtp,
    isAuthenticated: isAuthenticated,
    currentSession: currentSession,
    currentOrgId: currentOrgId,
    securityDeviceId: persistentDeviceId,
    sendStepUpOtp: sendStepUpOtp,
    verifyStepUpOtp: verifyStepUpOtp,
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
    reauthenticatePasswordChange: reauthenticatePasswordChange,
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
      publicConfig = config;
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
            catch (error) { demoReason = "The signed-in workspace could not be restored."; if (!workspaceState) { workspaceState = transientWorkspaceError(error) ? "transient" : "unavailable"; workspaceError = transientWorkspaceError(error) ? "Server busy, retrying…" : "Your workspace could not be verified. Retry when the service is available."; } }
          }
        }
        else demoReason = "Supabase Auth could not verify the saved session.";
      } catch (_) { demoReason = "Supabase Auth could not verify the saved session."; }
      client.auth.onAuthStateChange(function (_event, nextSession) {
        session = nextSession;
        if (_event === "SIGNED_IN") startSecuritySession(nextSession);
        notifyAuth();
      });
      if (session) await startSecuritySession(session);
    }
    updateModeLabels();
    notifyAuth();
    return mode;
  })();

  window.NovaPayAuth = api;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", updateModeLabels, { once: true });
}());
