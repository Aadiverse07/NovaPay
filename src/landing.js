/* NovaPay landing interactions — classic script so it works from file:// (ES-module imports are blocked there). */
(function () {
  var KEY = "novapay-theme", root = document.documentElement;
  var $ = function (i) { return document.getElementById(i); };
  var mq = matchMedia("(prefers-color-scheme: dark)");
  function saved() { try { var t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : null; } catch (e) { return null; } }
  function cur() { return saved() || (mq.matches ? "dark" : "light"); }
  function apply(t) {
    root.setAttribute("data-theme", t);
    var b = $("theme"), d = t === "dark";
    b.setAttribute("aria-pressed", String(d));
    b.setAttribute("aria-label", d ? "Switch to light theme" : "Switch to dark theme");
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
    m.content = d ? "#081523" : "#f3f7fc";
  }
  $("theme").addEventListener("click", function () {
    var t = cur() === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, t); } catch (e) {}
    apply(t);
  });
  mq.addEventListener("change", function () { if (!saved()) apply(cur()); });
  apply(cur());

  var toast = $("toast"), toastTimer;
  function showToast(msg) { toast.textContent = msg; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove("show"); }, 3200); }

  /* ---------- Login / Sign Up panel (animated split layout, see src/auth-panel.css) ---------- */
  var modal = $("modal-backdrop"), authStage = $("auth-stage"), lastFocus = null, authMode = "login";
  var loginEmail = $("login-email"), loginPass = $("login-password");
  var signName = $("signup-name"), signEmail = $("signup-email"), signPass = $("signup-password");
  var loginBox = authStage.querySelector(".form-box.Login"), signBox = authStage.querySelector(".form-box.Register");
  var otpBox = $("otp-panel"), otpCode = $("otp-code"), otpEmail = "", otpMode = "signup", otpTimer = null, resendSeconds = 0, otpBusy = false;
  var DEMO_EMAIL = "user@novapay.app", DEMO_PASSWORD = "novapay123";

  function getAccounts() { try { return JSON.parse(localStorage.getItem("novapay-demo-accounts") || "{}"); } catch (e) { return {}; } }
  function saveAccounts(a) { try { localStorage.setItem("novapay-demo-accounts", JSON.stringify(a)); } catch (e) {} }
  function isAuthed() {
    var auth = window.NovaPayAuth;
    if (!auth) return false;
    if (auth && auth.mode === "supabase") return auth.isAuthenticated();
    if (auth && auth.mode !== "demo") return false;
    try { return localStorage.getItem("novapay-demo-auth") === "true"; } catch (e) { return false; }
  }
  function setSession(user) {
    try {
      localStorage.setItem("novapay-demo-user", JSON.stringify(user));
      localStorage.setItem("novapay-demo-auth", "true");
    } catch (e) {}
  }

  // Slides the panel between Login and Sign Up. The hidden side is made inert so it can't be tabbed to or clicked.
  function syncAuthMode() {
    var signup = authMode === "signup";
    authStage.classList.toggle("active", signup);
    authStage.classList.toggle("otp-active", authMode === "otp");
    loginBox.inert = authMode !== "login"; loginBox.setAttribute("aria-hidden", String(authMode !== "login"));
    signBox.inert = authMode !== "signup"; signBox.setAttribute("aria-hidden", String(authMode !== "signup"));
    otpBox.inert = authMode !== "otp"; otpBox.setAttribute("aria-hidden", String(authMode !== "otp"));
    var otpInfo = authStage.querySelector(".info-content.OTP");
    if (otpInfo) otpInfo.setAttribute("aria-hidden", String(authMode !== "otp"));
  }
  function focusFirst() { try { (authMode === "signup" ? signName : authMode === "otp" ? otpCode : loginEmail).focus({ preventScroll: true }); } catch (e) {} }
  function setMode(mode) { authMode = mode; syncAuthMode(); focusFirst(); }

  function inlineError(id, message) {
    var el = $(id); if (!el) return;
    el.textContent = message || ""; el.hidden = !message;
  }
  function categoryMessage(error) {
    var auth = window.NovaPayAuth;
    if (auth && auth.emailActionErrorMessage) return auth.emailActionErrorMessage(error);
    var code = String(error && error.code || "").toLowerCase(), status = Number(error && (error.status || error.statusCode) || 0);
    if (status === 429 || /rate.?limit|too_many|over_.*rate/.test(code)) return "Too many attempts. Wait before trying again.";
    if (/expired/.test(code)) return "That code expired. Request a new code and try again.";
    if (/otp|token|code/.test(code)) return "That verification code is incorrect. Check it and try again.";
    if (code === "disposable_email_blocked") return "Use a non-disposable email address to create an account.";
    if (/already_exists|user_already_registered/.test(code)) return "An account may already use this email. Try signing in or resetting its password.";
    if (status === 401) return "Your session expired. Sign in again to continue.";
    return error && error.message || "The request could not be completed. Try again.";
  }
  function startResendCountdown() {
    clearInterval(otpTimer); resendSeconds = 60;
    var button = $("otp-resend"); button.disabled = true;
    var tick = function () {
      button.textContent = resendSeconds > 0 ? "Resend in " + resendSeconds + "s" : "Resend code";
      button.disabled = resendSeconds > 0;
      if (resendSeconds <= 0) { clearInterval(otpTimer); otpTimer = null; }
      else resendSeconds -= 1;
    };
    tick(); otpTimer = setInterval(tick, 1000);
  }
  function openOtp(kind, email) {
    otpMode = kind; otpEmail = String(email || "").trim().toLowerCase();
    var recovery = kind === "recovery", auth = window.NovaPayAuth;
    $("otp-title").textContent = recovery ? "Reset your password" : "Verify your email";
    $("otp-description").textContent = "We sent a 6-digit code to " + (auth && auth.maskEmail ? auth.maskEmail(otpEmail) : "your email address");
    $("otp-submit").textContent = recovery ? "Update password" : "Verify";
    $("recovery-password-box").hidden = !recovery; $("recovery-confirm-box").hidden = !recovery;
    $("recovery-password").required = recovery; $("recovery-confirm-password").required = recovery;
    inlineError("otp-error", ""); otpCode.value = ""; $("recovery-password").value = ""; $("recovery-confirm-password").value = "";
    $("otp-welcome-title").textContent = recovery ? "Account security" : "Welcome!";
    $("otp-welcome-copy").textContent = recovery ? "Verify your email to choose a new password." : "Verify your email to secure your NovaPay workspace.";
    authMode = "otp"; syncAuthMode(); startResendCountdown();
    if (!modal.hidden) requestAnimationFrame(focusFirst);
  }

  function openModal(mode) {
    if (isAuthed() && mode === "login") { openViaLaptop(); return; }
    lastFocus = document.activeElement;
    authMode = mode === "signup" ? "signup" : "login";
    syncAuthMode();                                   // set the state while hidden, so opening doesn't animate
    modal.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(focusFirst);
  }
  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }
  function goDashboard() { window.location.href = "dashboard.html"; }
  function openViaLaptop(e) {                     // header/mobile "Dashboard" button: go through the hero laptop screen
    if (e) e.preventDefault();
    var mm = $("mobile-menu"); if (mm) mm.hidden = true;
    if (typeof window.novapayOpenDashboard === "function") window.novapayOpenDashboard("dashboard.html"); else goDashboard();
  }
  function validateDemoLogin() {
    var e = loginEmail.value.trim().toLowerCase(), p = loginPass.value, acct = getAccounts()[e], ok = false, name = "";
    if (acct && typeof acct.password === "string") { ok = acct.password === p; name = acct.name; }   // created accounts, or a changed demo password
    else if (e === DEMO_EMAIL) { ok = p === DEMO_PASSWORD; name = acct && acct.name; }
    if (!ok) {
      showToast("Login failed. Use user@novapay.app / novapay123, or an account you created here.");
      loginPass.focus();
      return;
    }
    setSession({ name: name || "NovaPay User", email: e });
    goDashboard();
  }
  async function validateLogin() {
    var auth = window.NovaPayAuth;
    if (!auth) { showToast("Sign-in is unavailable due to a network or configuration issue. Try again later."); return; }
    try { await auth.ready; }
    catch (error) { showToast(auth.loginErrorMessage(error)); loginPass.focus(); return; }
    if (auth.mode === "supabase") {
      try { await auth.signIn(loginEmail.value.trim().toLowerCase(), loginPass.value); goDashboard(); }
      catch (error) {
        var category = auth.loginErrorCategory(error), workspaceFailure = /workspace|onboarding/i.test(String(error && error.message || ""));
        var message = workspaceFailure ? "Sign-in succeeded, but workspace setup needs attention. Use Create your workspace to continue." : category === "email_not_confirmed" ? "Confirm your email address before signing in." : category === "invalid_credentials" ? "Email or password is incorrect." : auth.loginErrorMessage(error);
        inlineError("login-error", message); showToast(message);
        $("login-verify").hidden = category !== "email_not_confirmed";
        $("workspace-retry").hidden = !workspaceFailure;
        loginPass.focus();
      }
      return;
    }
    if (auth.mode !== "demo") {
      showToast(auth.loginErrorMessage(new Error("Supabase authentication configuration is unavailable.")));
      loginPass.focus();
      return;
    }
    validateDemoLogin();
  }
  function googleDemo() {
    var auth = window.NovaPayAuth;
    if (auth && auth.mode === "supabase") { auth.signInWithGoogle().catch(function (error) { showToast(categoryMessage(error)); }); return; }
    if (auth && auth.mode !== "demo") { showToast("Sign-in is unavailable due to a network or configuration issue."); return; }
    setSession({ name: "Google User", email: "google-user@novapay.app" });
    showToast("Google sign-in is simulated.");
    setTimeout(goDashboard, 450);
  }

  document.querySelectorAll("[data-open]").forEach(function (el) {
    el.addEventListener("click", function () { openModal(el.getAttribute("data-open")); });
  });
  $("login").addEventListener("click", function () { if (isAuthed()) { openViaLaptop(); return; } openModal("login"); });
  [["get-started"], ["hero-start"], ["pricing-start"]].forEach(function (a) {
    var el = $(a[0]);
    if (el) el.addEventListener("click", function () { openModal("signup"); });
  });
  authStage.querySelector(".SignUpLink").addEventListener("click", function (e) { e.preventDefault(); setMode("signup"); });
  authStage.querySelector(".SignInLink").addEventListener("click", function (e) { e.preventDefault(); setMode("login"); });
  $("modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) {
    if (modal.hidden) return;
    if (e.key === "Escape") return closeModal();
    if (e.key === "Tab") {
      var f = modal.querySelectorAll("button:not([disabled]),input,a[href]");
      f = [].filter.call(f, function (n) { return n.offsetParent !== null && !n.closest("[inert]"); });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus({ preventScroll: true }); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus({ preventScroll: true }); }
    }
  });
  $("login-form").addEventListener("submit", function (e) { e.preventDefault(); validateLogin(); });
  $("signup-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var addr = signEmail.value.trim().toLowerCase();
    var name = signName.value.trim() || "NovaPay User";
    var password = signPass.value;
    var confirm = $("signup-confirm-password").value, auth = window.NovaPayAuth;
    inlineError("signup-error", "");
    if (!addr || !signEmail.checkValidity()) { inlineError("signup-error", "Enter a valid email address."); signEmail.focus(); return; }
    if (password.length < 8) { inlineError("signup-error", "Use a password with at least 8 characters."); showToast("Password must be at least 8 characters."); signPass.focus(); return; }
    if (password !== confirm) { inlineError("signup-error", "Passwords do not match."); showToast("Confirm password must match."); $("signup-confirm-password").focus(); return; }
    if (auth && auth.mode === "demo") {
      if (addr === DEMO_EMAIL || getAccounts()[addr]) { inlineError("signup-error", "This demo email already exists. Sign in instead."); return; }
      var all = getAccounts(); all[addr] = { name: name, password: password }; saveAccounts(all); setSession({ name: name, email: addr });
      showToast("DEMO MODE · Local sample account created."); setTimeout(goDashboard, 450); return;
    }
    if (!auth || auth.mode !== "supabase") { var unavailable = "Sign-up is unavailable due to a network or configuration issue."; inlineError("signup-error", unavailable); showToast(unavailable); return; }
    auth.signUp(name, addr, password).then(function () { openOtp("signup", addr); showToast("Verification code sent. Check your email."); })
      .catch(function (error) { var message = categoryMessage(error); inlineError("signup-error", message); showToast(message); });
  });
  $("forgot-password").addEventListener("click", function () {
    var addr = loginEmail.value.trim().toLowerCase();
    if (!addr || !loginEmail.checkValidity()) { showToast("Enter your email above, then choose Forgot Password."); loginEmail.focus(); return; }
    var auth = window.NovaPayAuth;
    if (auth && auth.mode === "supabase") auth.resetPassword(addr).then(function () { openOtp("recovery", addr); showToast("Password reset code sent. Check your email."); }).catch(function (error) { var message = categoryMessage(error); inlineError("login-error", message); showToast(message); });
    else if (auth && auth.mode === "demo") { var accts = getAccounts(); if (accts[addr]) { accts[addr].password = DEMO_PASSWORD; saveAccounts(accts); } showToast("DEMO MODE · Local sample password reset; no email was sent."); loginPass.focus(); }
    else { var message = "Password recovery is unavailable due to a network or configuration issue."; inlineError("login-error", message); showToast(message); }
  });
  $("login-verify").addEventListener("click", function () {
    var auth = window.NovaPayAuth, addr = loginEmail.value.trim().toLowerCase();
    if (!auth || auth.mode !== "supabase") return;
    auth.resendSignup(addr).then(function () { openOtp("signup", addr); showToast("Verification code sent. Check your email."); }).catch(function (error) { var message = categoryMessage(error); inlineError("login-error", message); showToast(message); });
  });
  $("workspace-retry").addEventListener("click", function () {
    var auth = window.NovaPayAuth; if (!auth) return;
    auth.currentSession().then(function (session) { return auth.ensureWorkspace(session); }).then(goDashboard).catch(function (error) { var message = "Create your workspace failed: " + categoryMessage(error); inlineError("login-error", message); showToast(message); });
  });
  function submitOtp() {
    if (otpBusy) return;
    var auth = window.NovaPayAuth, code = auth && auth.normalizeOtp ? auth.normalizeOtp(otpCode.value) : otpCode.value.replace(/\D/g, "").slice(0, 6);
    otpCode.value = code; inlineError("otp-error", "");
    if (code.length !== 6) { inlineError("otp-error", "Enter the 6-digit code from your email."); otpCode.focus(); return; }
    if (otpMode === "recovery") {
      var nextPassword = $("recovery-password").value, confirmPassword = $("recovery-confirm-password").value;
      if (nextPassword.length < 8) { inlineError("otp-error", "Use a new password with at least 8 characters."); $("recovery-password").focus(); return; }
      if (nextPassword !== confirmPassword) { inlineError("otp-error", "Passwords do not match."); $("recovery-confirm-password").focus(); return; }
    }
    if (!auth || auth.mode !== "supabase") { inlineError("otp-error", "Email verification is unavailable in this mode."); return; }
    otpBusy = true; var button = $("otp-submit"), original = otpMode === "recovery" ? "Update password" : "Verify"; button.disabled = true; button.textContent = "Please wait…";
    var operation = otpMode === "signup" ? auth.verifySignup(otpEmail, code) : auth.verifyRecovery(otpEmail, code).then(function () { return auth.updatePassword($("recovery-password").value); });
    operation.then(function () {
      if (otpMode === "signup") { showToast("Email verified. Opening your workspace…"); goDashboard(); }
      else { clearInterval(otpTimer); otpTimer = null; setMode("login"); inlineError("login-error", "Password updated. Sign in with your new password."); showToast("Password updated. Sign in with your new password."); }
    }).catch(function (error) { var message = categoryMessage(error); inlineError("otp-error", message); showToast(message); })
      .finally(function () { otpBusy = false; button.disabled = false; button.textContent = original; });
  }
  $("otp-form").addEventListener("submit", function (e) { e.preventDefault(); submitOtp(); });
  $("otp-code").addEventListener("input", function () {
    var auth = window.NovaPayAuth; otpCode.value = auth && auth.normalizeOtp ? auth.normalizeOtp(otpCode.value) : otpCode.value.replace(/\D/g, "").slice(0, 6);
    if (otpCode.value.length === 6) submitOtp();
  });
  $("otp-resend").addEventListener("click", function () {
    if (resendSeconds > 0 || otpBusy) return;
    var auth = window.NovaPayAuth, send = otpMode === "signup" ? auth.resendSignup(otpEmail) : auth.resetPassword(otpEmail);
    send.then(function () { startResendCountdown(); showToast("A new code was sent. Check your email."); }).catch(function (error) { var message = categoryMessage(error); inlineError("otp-error", message); showToast(message); });
  });
  $("otp-change-email").addEventListener("click", function () { clearInterval(otpTimer); otpTimer = null; setMode(otpMode === "signup" ? "signup" : "login"); });
  $("google-demo").addEventListener("click", googleDemo);
  $("google-demo-2").addEventListener("click", googleDemo);
  authMode = "login";
  syncAuthMode();
  function handleLoginHash() {
    if (location.hash !== "#login") return;
    var finish = function () {
      var bounced = false;                         // dashboard just sent us here: do NOT send the user straight back (redirect-loop breaker)
      try { var t = Number(sessionStorage.getItem("novapay-auth-bounce") || 0); bounced = t > 0 && Date.now() - t < 10000; sessionStorage.removeItem("novapay-auth-bounce"); } catch (_) {}
      if (isAuthed() && !bounced) goDashboard();
      else openModal("login");
      history.replaceState(null, "", location.pathname);
    };
    if (window.NovaPayAuth) window.NovaPayAuth.ready.then(finish, finish);
    else finish();
  }
  handleLoginHash();
  try {
    if (localStorage.getItem("novapay-signout-reason") === "inactive") {
      localStorage.removeItem("novapay-signout-reason");
      setTimeout(function () { showToast("You were signed out after a period of inactivity."); }, 300);
    }
  } catch (err) {}

  /* Navigation: mobile menu, active-section highlight, logged-in state */
  var menu = $("mobile-menu"), mtoggle = $("menu-toggle");
  function setMenu(open) { menu.hidden = !open; mtoggle.setAttribute("aria-expanded", String(open)); mtoggle.setAttribute("aria-label", open ? "Close menu" : "Open menu"); }
  mtoggle.addEventListener("click", function () { setMenu(menu.hidden); });
  menu.addEventListener("click", function (e) { if (e.target.tagName === "A" && e.target.id !== "mm-login") setMenu(false); });
  $("mm-login").addEventListener("click", function (e) { e.preventDefault(); setMenu(false); if (isAuthed()) openViaLaptop(e); else openModal("login"); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) setMenu(false); });
  document.addEventListener("click", function (e) { if (!menu.hidden && !menu.contains(e.target) && !mtoggle.contains(e.target)) setMenu(false); });

  var spyLinks = [].slice.call(document.querySelectorAll(".landing-nav a, .mobile-menu a[href^='#']")), spyIds = ["home", "features"];
  function spy() {
    var cur = "home", y = window.scrollY + 140;
    spyIds.forEach(function (id) { var s = $(id); if (s && s.offsetTop <= y && id !== "home") cur = id; });
    spyLinks.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + cur); });
  }
  window.addEventListener("scroll", spy, { passive: true }); spy();

  function syncLoginNavigation() {
    var signedIn = isAuthed();
    $("login").textContent = signedIn ? "Dashboard" : "Login";
    $("mm-login").textContent = signedIn ? "Dashboard" : "Login";
    $("mm-login").setAttribute("href", signedIn ? "dashboard.html" : "#login");
  }
  syncLoginNavigation();
  if (window.NovaPayAuth) {
    window.NovaPayAuth.ready.then(syncLoginNavigation);
    document.addEventListener("novapay:auth", syncLoginNavigation);
  }

  var stage = $("hero-stage");
  document.querySelectorAll("[data-demo-action]").forEach(function (b) {
    b.addEventListener("click", function () { showToast(b.dataset.demoAction === "approve" ? "Approval selected." : "Review selected."); });
  });

  var featureMap = {
    "Automatic Bookkeeping": "Organize PayPal activity into a clear double-entry ledger.",
    "AI Assistant": "Get clear explanations and answers to financial questions.",
    "Smart Ledger": "Review structured, balanced accounting entries.",
    "Anomaly Detection": "Review unusual refunds, disputes, and transaction patterns.",
    "Safe Actions": "Review recommended actions and keep the merchant in control."
  };
  document.querySelectorAll("[data-feature]").forEach(function (b) {
    b.addEventListener("click", function () {
      var message = featureMap[b.getAttribute("data-feature")];
      if (message) showToast(message);
    });
  });

  var motion = matchMedia("(prefers-reduced-motion: no-preference)").matches;
  for (var n = 0; n < 18; n++) { /* particles */
    var p = document.createElement("span"); p.className = "particle"; p.setAttribute("aria-hidden", "true");
    var s = 3 + Math.random() * 5;
    p.style.cssText = "left:" + Math.random() * 100 + "%;top:" + Math.random() * 100 + "%;width:" + s + "px;height:" + s + "px;--d:" + (5 + Math.random() * 6) + "s;animation-delay:-" + Math.random() * 8 + "s";
    stage.appendChild(p);
  }
  /* Pointer-following parallax animation removed per branding update. */

  /* Phase 8 runtime polish: pause ambient motion when hidden and keep decorative
     parallax pointer-only. */
  document.addEventListener("visibilitychange", function () {
    document.documentElement.classList.toggle("page-paused", document.hidden);
  });
})();
