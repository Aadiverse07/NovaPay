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
  var DEMO_EMAIL = "user@novapay.app", DEMO_PASSWORD = "novapay123";

  function getAccounts() { try { return JSON.parse(localStorage.getItem("novapay-demo-accounts") || "{}"); } catch (e) { return {}; } }
  function saveAccounts(a) { try { localStorage.setItem("novapay-demo-accounts", JSON.stringify(a)); } catch (e) {} }
  function isAuthed() {
    if (window.NovaPayAuth && window.NovaPayAuth.mode === "supabase") return window.NovaPayAuth.isAuthenticated();
    try { return window.NovaPayAuth && window.NovaPayAuth.mode === "demo" && localStorage.getItem("novapay-demo-auth") === "true"; } catch (e) { return false; }
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
    loginBox.inert = signup;  loginBox.setAttribute("aria-hidden", String(signup));
    signBox.inert = !signup;  signBox.setAttribute("aria-hidden", String(!signup));
  }
  function focusFirst() { try { (authMode === "signup" ? signName : loginEmail).focus({ preventScroll: true }); } catch (e) {} }
  function setMode(mode) { authMode = mode; syncAuthMode(); focusFirst(); }

  function openModal(mode) {
    if (isAuthed() && mode === "login") { window.location.href = "dashboard.html"; return; }
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
    var e = loginEmail.value.trim().toLowerCase(), p = loginPass.value, acct = getAccounts()[e];
    if (e === DEMO_EMAIL && p === DEMO_PASSWORD) {
      setSession({ name: "NovaPay User", email: DEMO_EMAIL });
    } else if (acct && acct.password === p) {
      setSession({ name: acct.name, email: e });
    } else {
      showToast("Login failed. Use user@novapay.app / novapay123, or an account you created here.");
      loginPass.focus();
      return;
    }
    goDashboard();
  }
  function googleDemo() {
    var ready = window.NovaPayAuth ? window.NovaPayAuth.ready : Promise.resolve("demo");
    ready.then(function () {
      if (window.NovaPayAuth && window.NovaPayAuth.mode === "supabase") {
        window.NovaPayAuth.signInWithGoogle().catch(function (error) { showToast(error.message || "Google sign-in is unavailable."); });
      } else if (window.NovaPayAuth && window.NovaPayAuth.mode === "demo") {
        setSession({ name: "Google User", email: "google-user@novapay.app" });
        showToast("Google sign-in is simulated in demo mode.");
        setTimeout(goDashboard, 450);
      } else showToast("Authentication is unavailable. Please try again later.");
    });
  }

  document.querySelectorAll("[data-open]").forEach(function (el) {
    el.addEventListener("click", function () { openModal(el.getAttribute("data-open")); });
  });
  $("login").addEventListener("click", function (e) { if (isAuthed()) return openViaLaptop(e); openModal("login"); });
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
  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var ready = window.NovaPayAuth ? window.NovaPayAuth.ready : Promise.resolve("demo");
    ready.then(function () {
      if (window.NovaPayAuth && window.NovaPayAuth.mode === "supabase") {
        window.NovaPayAuth.signIn(loginEmail.value.trim(), loginPass.value).then(function () {
          showToast("Signed in. Opening your workspace…");
          goDashboard();
        }, function (error) { showToast(error.message || "Sign-in failed. Check your details and try again."); loginPass.focus(); });
      } else if (window.NovaPayAuth && window.NovaPayAuth.mode === "unavailable") showToast("Authentication is unavailable. Please try again later.");
      else validateDemoLogin();
    });
  });
  $("signup-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var ready = window.NovaPayAuth ? window.NovaPayAuth.ready : Promise.resolve("demo");
    ready.then(function () {
      var addr = signEmail.value.trim().toLowerCase();
      var name = signName.value.trim() || "NovaPay User";
      var password = signPass.value;
      if (window.NovaPayAuth && window.NovaPayAuth.mode === "supabase") {
        window.NovaPayAuth.signUp(name, addr, password).then(function (result) {
          if (result.session) {
            showToast("Account created and workspace ready. Opening your dashboard…");
            goDashboard();
          } else {
            showToast("Account created. Check your email to confirm, then sign in to finish workspace setup.");
            setMode("login");
          }
        }, function (error) { showToast(error.message || "Sign-up failed. Please try again."); });
        return;
      }
      if (window.NovaPayAuth && window.NovaPayAuth.mode === "unavailable") { showToast("Authentication is unavailable. Please try again later."); return; }
      if (addr === DEMO_EMAIL || getAccounts()[addr]) { showToast("That email already has an account. Please log in."); return; }
      if (password.length < 4) { showToast("Use a password with at least 4 characters."); return; }
      var all = getAccounts(); all[addr] = { name: name, password: password }; saveAccounts(all);
      setSession({ name: name, email: addr });
      showToast("Account created in demo mode. Opening your dashboard…");
      setTimeout(goDashboard, 450);
    });
  });
  $("forgot-password").addEventListener("click", function () {
    var addr = loginEmail.value.trim().toLowerCase();
    if (!addr || !loginEmail.checkValidity()) { showToast("Enter your email above, then choose Forgot Password."); loginEmail.focus(); return; }
    var ready = window.NovaPayAuth ? window.NovaPayAuth.ready : Promise.resolve("demo");
    ready.then(function () {
      if (window.NovaPayAuth && window.NovaPayAuth.mode === "supabase") {
        window.NovaPayAuth.resetPassword(addr).then(function () { showToast("If an account exists for that email, a password reset link has been sent."); }, function (error) { showToast(error.message || "Password recovery is unavailable."); });
        return;
      }
      if (window.NovaPayAuth && window.NovaPayAuth.mode === "unavailable") { showToast("Password recovery is unavailable. Please try again later."); return; }
      var accts = getAccounts();
      if (accts[addr]) { accts[addr].password = DEMO_PASSWORD; saveAccounts(accts); }
      showToast("Demo mode only: no email was sent. Use the sample login or create a local demo account.");
      loginPass.focus();
    });
  });
  $("google-demo").addEventListener("click", googleDemo);
  $("google-demo-2").addEventListener("click", googleDemo);
  authMode = "login";
  syncAuthMode();
  if (location.hash === "#login" && !isAuthed()) { openModal("login"); history.replaceState(null, "", location.pathname); }

  /* Navigation: mobile menu, active-section highlight, logged-in state */
  var menu = $("mobile-menu"), mtoggle = $("menu-toggle");
  function setMenu(open) { menu.hidden = !open; mtoggle.setAttribute("aria-expanded", String(open)); mtoggle.setAttribute("aria-label", open ? "Close menu" : "Open menu"); }
  mtoggle.addEventListener("click", function () { setMenu(menu.hidden); });
  menu.addEventListener("click", function (e) { if (e.target.tagName === "A" && e.target.id !== "mm-login") setMenu(false); });
  $("mm-login").addEventListener("click", function (e) { e.preventDefault(); setMenu(false); if (isAuthed()) return openViaLaptop(e); openModal("login"); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) setMenu(false); });
  document.addEventListener("click", function (e) { if (!menu.hidden && !menu.contains(e.target) && !mtoggle.contains(e.target)) setMenu(false); });

  var spyLinks = [].slice.call(document.querySelectorAll(".landing-nav a, .mobile-menu a[href^='#']")), spyIds = ["home", "features"];
  function spy() {
    var cur = "home", y = window.scrollY + 140;
    spyIds.forEach(function (id) { var s = $(id); if (s && s.offsetTop <= y && id !== "home") cur = id; });
    spyLinks.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + cur); });
  }
  window.addEventListener("scroll", spy, { passive: true }); spy();

  function syncAuthLinks() {
    var signedIn = isAuthed();
    $("login").textContent = signedIn ? "Dashboard" : "Login";
    $("mm-login").textContent = signedIn ? "Dashboard" : "Login";
    $("mm-login").setAttribute("href", signedIn ? "dashboard.html" : "#");
  }
  if (window.NovaPayAuth) {
    window.NovaPayAuth.ready.then(syncAuthLinks);
    document.addEventListener("novapay:auth", syncAuthLinks);
  }
  syncAuthLinks();

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
