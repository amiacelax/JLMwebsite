/**
 * Homework landing — login, signup, and checkout redirect.
 */
(function () {
  const loginForm = document.getElementById("hw-login-form");
  const signupForm = document.getElementById("hw-signup-form");
  const forgotForm = document.getElementById("hw-forgot-form");
  const resetForm = document.getElementById("hw-reset-form");
  const loginError = document.getElementById("hw-login-error");
  const signupError = document.getElementById("hw-signup-error");
  const forgotError = document.getElementById("hw-forgot-error");
  const forgotOk = document.getElementById("hw-forgot-ok");
  const resetError = document.getElementById("hw-reset-error");
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
    const forgotPanel = document.getElementById("hw-auth-panel-forgot");
    const resetPanel = document.getElementById("hw-auth-panel-reset");
    if (loginPanel) loginPanel.hidden = name !== "login";
    if (signupPanel) signupPanel.hidden = name !== "signup";
    if (forgotPanel) forgotPanel.hidden = name !== "forgot";
    if (resetPanel) resetPanel.hidden = name !== "reset";
    if (loginError) loginError.hidden = true;
    if (signupError) signupError.hidden = true;
    if (forgotError) forgotError.hidden = true;
    if (forgotOk) forgotOk.hidden = true;
    if (resetError) resetError.hidden = true;
    if (name === "forgot") {
      const fromLogin = document.getElementById("hw-username")?.value ?? "";
      const forgotEmail = document.getElementById("hw-forgot-email");
      if (forgotEmail && !forgotEmail.value && fromLogin.includes("@")) {
        forgotEmail.value = fromLogin;
      }
    }
  }

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activateAuthTab(tab.getAttribute("data-auth-tab") || "login");
    });
  });

  const params = new URLSearchParams(window.location.search);
  const resetToken = String(params.get("reset") || "").trim();
  if (params.get("signup") === "1") activateAuthTab("signup");
  if (params.get("forgot") === "1") activateAuthTab("forgot");
  if (resetToken) activateAuthTab("reset");

  /* Guest Join → PayPal tab + this page: nudge them to finish account / I’ve paid. */
  if (params.get("paidPrompt") === "1" && !resetToken) {
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
  if (existing && !resetToken) {
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
      const confirmPassword =
        document.getElementById("hw-signup-password-confirm")?.value ?? "";
      const remember = true;

      if (password !== confirmPassword) {
        if (signupError) {
          signupError.hidden = false;
          signupError.textContent = "Those passwords don’t match.";
        }
        return;
      }

      const result = await HwAuth.signupAsync(
        {
          email,
          password,
          confirmPassword,
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

  if (forgotForm) {
    forgotForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("hw-forgot-email")?.value ?? "";
      if (forgotError) forgotError.hidden = true;
      if (forgotOk) forgotOk.hidden = true;
      const result = await HwAuth.requestPasswordResetAsync(email);
      if (result.ok) {
        if (forgotOk) {
          forgotOk.hidden = false;
          forgotOk.textContent = result.message;
        }
        return;
      }
      if (forgotError) {
        forgotError.hidden = false;
        forgotError.textContent = result.error;
      }
    });
  }

  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = document.getElementById("hw-reset-password")?.value ?? "";
      const confirmPassword =
        document.getElementById("hw-reset-password-confirm")?.value ?? "";
      if (password !== confirmPassword) {
        if (resetError) {
          resetError.hidden = false;
          resetError.textContent = "Those passwords don’t match.";
        }
        return;
      }
      const result = await HwAuth.resetPasswordAsync(
        {
          token: resetToken,
          password,
          confirmPassword,
        },
        true
      );
      if (result.ok) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("reset");
          window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        } catch {
          /* ignore */
        }
        redirectAfterAuth();
        return;
      }
      if (resetError) {
        resetError.hidden = false;
        resetError.textContent = result.error;
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

  /* What's Homework Hub? → plan popup (later: dedicated landing with video). */
  (function hwWhatsHubPopup() {
    const modal = document.getElementById("hw-breakdown-modal");
    if (!modal) return;

    function closeModal() {
      if (modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove("is-modal-open");
    }

    function openModal() {
      modal.hidden = false;
      document.body.classList.add("is-modal-open");
      modal.querySelector("[data-hw-breakdown-close]")?.focus();
    }

    document.querySelectorAll("[data-hw-breakdown-open]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openModal();
      });
    });
    document.querySelectorAll("[data-hw-breakdown-close]").forEach((btn) => {
      btn.addEventListener("click", closeModal);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  })();

})();
