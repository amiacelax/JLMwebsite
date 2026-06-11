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
    if (checkout && window.HwCheckout?.buildCheckoutUrl) {
      const session = HwAuth.getSession();
      const url = HwCheckout.buildCheckoutUrl(checkout, session);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
    const dest =
      next && next.startsWith("/")
        ? decodeURIComponent(next)
        : HwAuth.PLATFORM_PATH;
    window.location.href = dest;
  }

  function showLoggedIn(session) {
    if (loginFields) loginFields.hidden = true;
    document.querySelector(".hw-auth-tabs")?.setAttribute("hidden", "true");
    if (loggedInBar) loggedInBar.hidden = false;
    if (loggedInName) {
      loggedInName.textContent = session.displayName || session.username;
    }
    if (loggedInTier) {
      loggedInTier.textContent = session.tier === "pending"
        ? "No plan yet — pick a tier below, then checkout with your account."
        : (session.tierDisplay || "Subscriber") + " account";
    }
  }

  function activateAuthTab(name) {
    authTabs.forEach((tab) => {
      const on = tab.getAttribute("data-auth-tab") === name;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
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

  const existing = HwAuth.getSession();
  if (existing) {
    showLoggedIn(existing);
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("hw-username")?.value ?? "";
      const password = document.getElementById("hw-password")?.value ?? "";
      const remember = document.getElementById("hw-remember")?.checked ?? false;
      const result = await HwAuth.loginAsync(username, password, remember);
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
      const email = document.getElementById("hw-signup-email")?.value ?? "";
      const username = document.getElementById("hw-signup-username")?.value ?? "";
      const password = document.getElementById("hw-signup-password")?.value ?? "";
      const remember = true;

      const result = await HwAuth.signupAsync(
        {
          email,
          username,
          password,
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
