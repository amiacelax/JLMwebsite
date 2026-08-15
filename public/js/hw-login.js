/**
 * Homework landing — login, signup, and checkout redirect.
 */
(function () {
  const loginForm = document.getElementById("hw-login-form");
  const signupForm = document.getElementById("hw-signup-form");
  const loginError = document.getElementById("hw-login-error");
  const signupError = document.getElementById("hw-signup-error");
  const loginFields = document.getElementById("hw-login-fields");
  const loggedInBar = document.getElementById("hw-logged-in-bar");
  const loggedInName = document.getElementById("hw-logged-in-name");
  const loggedInTier = document.getElementById("hw-logged-in-tier");
  const authTabs = document.querySelectorAll("[data-auth-tab]");

  function redirectAfterAuth() {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const checkout = params.get("checkout");
    const paidPrompt = params.get("paidPrompt") === "1";

    /* Guest already opened PayPal — after signup/login, confirm I’ve paid. */
    if (checkout && paidPrompt && window.HwCheckout?.openPaidConfirm) {
      HwCheckout.openPaidConfirm(checkout);
      showLoggedIn(HwAuth.getSession());
      return;
    }

    /* Same-tab PayPal (+ I’ve paid return) — don’t open a leftover new-tab link. */
    if (checkout && window.HwCheckout?.startCheckout) {
      HwCheckout.startCheckout(checkout);
      return;
    }
    const dest =
      next && next.startsWith("/")
        ? decodeURIComponent(next)
        : HwAuth.PLATFORM_PATH;
    window.location.href = dest;
  }

  function showLoggedIn(session) {
    if (loginFields) loginFields.hidden = true;
    if (loggedInBar) loggedInBar.hidden = false;
    if (loggedInName) {
      loggedInName.textContent = session.displayName || session.username;
    }
    if (loggedInTier) {
      loggedInTier.textContent = session.tier === "pending"
        ? "No plan yet — see plans on Homework Hub, then checkout with your account."
        : (session.tierDisplay || "Subscriber") + " account";
    }
  }

  function activateAuthTab(name) {
    const loginPanel = document.getElementById("hw-auth-panel-login");
    const signupPanel = document.getElementById("hw-auth-panel-signup");
    if (loginPanel) loginPanel.hidden = name !== "login";
    if (signupPanel) signupPanel.hidden = name !== "signup";
    if (loginError) loginError.hidden = true;
    if (signupError) signupError.hidden = true;
  }

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activateAuthTab(tab.getAttribute("data-auth-tab") || "login");
    });
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("signup") === "1") activateAuthTab("signup");

  /* Guest Join → PayPal tab + this page: nudge them to finish account / I’ve paid. */
  if (params.get("paidPrompt") === "1") {
    const tip = document.createElement("p");
    tip.className = "hw-login-inlay__optional";
    tip.setAttribute("role", "status");
    tip.style.cssText =
      "margin:0 0 0.85rem;padding:0.65rem 0.75rem;border-radius:0.5rem;border:1px solid color-mix(in srgb, var(--color-green) 35%, transparent);background:color-mix(in srgb, var(--color-green) 12%, transparent);";
    tip.textContent =
      "PayPal should be open in another tab. Create your account here (or log in), finish payment there, then use I’ve paid — continue.";
    const host =
      document.getElementById("hw-login-fields") ||
      document.querySelector(".hw-login-inlay");
    if (host) host.insertBefore(tip, host.firstChild);
    activateAuthTab("signup");
  }

  // Discord DMs (and other deep links) can prefill login: ?user=benm or email
  const prefillUser = String(params.get("user") || "").trim();
  if (prefillUser) {
    const userInput = document.getElementById("hw-username");
    if (userInput && !userInput.value) {
      userInput.value = prefillUser;
      const passInput = document.getElementById("hw-password");
      if (passInput) passInput.focus();
    }
  }

  const existing = HwAuth.getSession();
  if (existing) {
    showLoggedIn(existing);
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const loginId = document.getElementById("hw-username")?.value ?? "";
      const password = document.getElementById("hw-password")?.value ?? "";
      const remember = document.getElementById("hw-remember")?.checked ?? false;
      const result = await HwAuth.loginAsync(loginId, password, remember);
      if (result.ok) {
        redirectAfterAuth();
        return;
      }
      if (loginError) {
        loginError.hidden = false;
        loginError.textContent = result.error;
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const displayName =
        document.getElementById("hw-signup-display-name")?.value ?? "";
      const email = document.getElementById("hw-signup-email")?.value ?? "";
      const password = document.getElementById("hw-signup-password")?.value ?? "";
      const remember = true;

      const result = await HwAuth.signupAsync(
        {
          email,
          password,
          displayName,
        },
        remember
      );
      if (result.ok) {
        redirectAfterAuth();
        return;
      }
      if (signupError) {
        signupError.hidden = false;
        signupError.textContent = result.error;
      }
    });
  }

  document.getElementById("hw-go-platform")?.addEventListener("click", () => {
    window.location.href = HwAuth.PLATFORM_PATH;
  });

  document.getElementById("hw-landing-logout")?.addEventListener("click", () => {
    HwAuth.logout();
    window.location.reload();
  });

})();
