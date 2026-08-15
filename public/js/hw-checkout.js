/**
 * HW Hub checkout — Join prompts create-account (popup), then PayPal for that plan.
 * Logged-in: straight to PayPal (API approve URL when available).
 * After PayPal: return / “I’ve paid” → activate-plan → waiting screen.
 */
(function (global) {
  const LOGIN_PATH = "/homework.html";
  const INTENT_KEY = "jlm-hw-checkout-intent";

  const PRODUCTS = {
    basic: {
      label: "Basic homework subscription",
      url: "https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-3BS11069X4737034MNJ563OA",
      param: "custom_id",
      isHwPlan: true,
    },
    premium: {
      label: "Premium homework subscription",
      url: "https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-7RC25164AJ430933DNJ564GY",
      param: "custom_id",
      isHwPlan: true,
    },
    ultra: {
      label: "Ultra homework subscription",
      url: "https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-9VC563511T5680357NJ565KA",
      param: "custom_id",
      isHwPlan: true,
    },
    "student-special": {
      label: "Student Special homework subscription",
      url: "https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-34B653300B452420GNJ565WQ",
      param: "custom_id",
      isHwPlan: true,
    },
    "student-ultra": {
      label: "Student Ultra homework subscription",
      url: "https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=REPLACE_STUDENT_ULTRA",
      param: "custom_id",
      isHwPlan: true,
    },
    "course-pitch-accent": {
      label: "Easy Pitch Accent course",
      url: "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=REPLACE_PITCH_ACCENT",
      param: "custom",
    },
    "course-kansai": {
      label: "Kansai-ben course",
      url: "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=REPLACE_KANSAI",
      param: "custom",
    },
    "course-conjugation": {
      label: "Conjugation course",
      url: "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=REPLACE_CONJUGATION",
      param: "custom",
    },
    "course-core-grammar": {
      label: "Core Grammar course",
      url: "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=REPLACE_CORE_GRAMMAR",
      param: "custom",
    },
    "course-anime": {
      label: "Anime without Subtitles course",
      url: "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=REPLACE_ANIME",
      param: "custom",
    },
    "course-strategy": {
      label: "Language Learning Strategy course",
      url: "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=REPLACE_STRATEGY",
      param: "custom",
    },
    "course-job-interviews": {
      label: "Japanese Job Interviews course",
      url: "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=REPLACE_JOB_INTERVIEWS",
      param: "custom",
    },
    "course-bundle": {
      label: "All courses bundle",
      url: "https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=REPLACE_BUNDLE",
      param: "custom",
    },
  };

  const PLAN_LABELS = {
    basic: "Basic",
    premium: "Premium",
    ultra: "Ultra",
    "student-special": "Student Special",
    "student-ultra": "Student Ultra",
  };

  function loginUrl(productId, opts) {
    const afterPaypal = Boolean(opts && opts.afterPaypal);
    let url = LOGIN_PATH + "?signup=1";
    if (afterPaypal) {
      url += "&paidPrompt=1";
    } else {
      url += "&next=" + encodeURIComponent("/homework/platform.html");
    }
    if (productId) url += "&checkout=" + encodeURIComponent(productId);
    return url;
  }

  function accountAfterPaypalUrl(productId) {
    return loginUrl(productId, { afterPaypal: true });
  }

  function isPlaceholderUrl(url) {
    return !url || String(url).includes("REPLACE_");
  }

  function buildCheckoutUrl(productId, session) {
    const product = PRODUCTS[productId];
    if (!product) return null;
    if (isPlaceholderUrl(product.url)) return null;

    const url = new URL(product.url);
    const buyer = session?.username || "";
    if (buyer) url.searchParams.set(product.param, buyer);
    if (session?.email) url.searchParams.set("email", session.email);
    return url.href;
  }

  function requireLogin(productId) {
    global.location.href = loginUrl(productId);
  }

  function stashIntent(productId, session) {
    try {
      localStorage.setItem(
        INTENT_KEY,
        JSON.stringify({
          plan: productId,
          username: session?.username || "",
          at: Date.now(),
        })
      );
    } catch {
      /* ignore */
    }
  }

  function readIntent() {
    try {
      const raw = localStorage.getItem(INTENT_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.plan) return null;
      return data;
    } catch {
      return null;
    }
  }

  function clearIntent() {
    try {
      localStorage.removeItem(INTENT_KEY);
    } catch {
      /* ignore */
    }
  }

  function ensurePaidDialog() {
    let dialog = document.getElementById("hw-checkout-paid-dialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.id = "hw-checkout-paid-dialog";
    dialog.className = "hw-hub-feedback-dialog hw-checkout-paid-dialog";
    dialog.setAttribute("aria-labelledby", "hw-checkout-paid-title");
    dialog.innerHTML =
      '<form method="dialog" class="hw-hub-feedback-dialog__form" id="hw-checkout-paid-form">' +
      '<h3 class="hw-hub-feedback-dialog__title" id="hw-checkout-paid-title">Finish PayPal</h3>' +
      '<p class="hw-hub-feedback-dialog__desc" id="hw-checkout-paid-desc">' +
      "Complete checkout in the PayPal tab. When you\u2019re done, come back here and continue." +
      "</p>" +
      '<p class="hw-maker-status" id="hw-checkout-paid-status" role="status" aria-live="polite"></p>' +
      '<div class="hw-hub-feedback-dialog__actions">' +
      '<button type="submit" class="btn btn--ghost" value="cancel" id="hw-checkout-paid-cancel">Not yet</button>' +
      '<button type="button" class="btn btn--primary" id="hw-checkout-paid-confirm">I\u2019ve paid \u2014 continue</button>' +
      "</div></form>";
    document.body.appendChild(dialog);

    const form = dialog.querySelector("#hw-checkout-paid-form");
    const confirmBtn = dialog.querySelector("#hw-checkout-paid-confirm");
    const statusEl = dialog.querySelector("#hw-checkout-paid-status");

    form?.addEventListener("submit", (e) => {
      if (e.submitter && e.submitter.value === "cancel") return;
      e.preventDefault();
    });

    confirmBtn?.addEventListener("click", async () => {
      const intent = readIntent() || { plan: dialog.dataset.plan };
      const plan = String(intent?.plan || dialog.dataset.plan || "").trim();
      const session = global.HwAuth?.getSession?.();
      if (!plan || !PRODUCTS[plan]?.isHwPlan) {
        if (statusEl) {
          statusEl.textContent = "Pick a plan again, then continue after PayPal.";
          statusEl.classList.add("hw-maker-status--error");
        }
        return;
      }
      if (!session?.username) {
        if (statusEl) {
          statusEl.textContent =
            "Create your account or log in on this page first, then click I’ve paid.";
          statusEl.classList.add("hw-maker-status--error");
        }
        return;
      }

      confirmBtn.disabled = true;
      if (statusEl) {
        statusEl.textContent = "Activating your plan…";
        statusEl.classList.remove("hw-maker-status--error");
      }

      try {
        const result = await activatePlan(plan, session);
        if (!result.ok) throw new Error(result.error || "Could not activate plan.");
        clearIntent();
        if (statusEl) statusEl.textContent = result.message || "Plan active!";
        global.HwToast?.show?.(result.message || "Plan active — waiting for JD.");
        window.setTimeout(() => {
          if (typeof dialog.close === "function") dialog.close();
          else dialog.removeAttribute("open");
          goToHubAfterActivate();
        }, 400);
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = (err && err.message) || "Could not activate plan.";
          statusEl.classList.add("hw-maker-status--error");
        }
      } finally {
        confirmBtn.disabled = false;
      }
    });

    return dialog;
  }

  function openPaidConfirm(productId) {
    const dialog = ensurePaidDialog();
    const desc = dialog.querySelector("#hw-checkout-paid-desc");
    const statusEl = dialog.querySelector("#hw-checkout-paid-status");
    const label = PLAN_LABELS[productId] || PRODUCTS[productId]?.label || productId;
    dialog.dataset.plan = productId;
    if (desc) {
      desc.textContent =
        "Finish “" +
        label +
        "” in your PayPal tab. When payment is done, come back here and click I’ve paid — continue to unlock the hub.";
    }
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.classList.remove("hw-maker-status--error");
    }
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  async function activatePlan(plan, session, opts) {
    const subscriptionId = String(opts?.subscriptionId || "").trim();
    try {
      const res = await fetch("/api/auth/activate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: session.username,
          plan,
          displayName: session.displayName || session.username,
          ...(subscriptionId ? { subscriptionId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || "Could not activate plan." };
      }
      if (data.session && global.HwAuth?.persistSession) {
        const remember = Boolean(localStorage.getItem(global.HwAuth.SESSION_KEY));
        global.HwAuth.persistSession(
          {
            ...data.session,
            loggedInAt: Date.now(),
          },
          remember
        );
      }
      try {
        global.dispatchEvent(
          new CustomEvent("hw-plan-activated", {
            detail: { plan, session: data.session, planLabel: data.planLabel },
          })
        );
      } catch {
        /* ignore */
      }
      return {
        ok: true,
        message: data.message || "Plan active.",
        session: data.session,
        planLabel: data.planLabel,
      };
    } catch {
      return { ok: false, error: "Could not reach the server. Try again." };
    }
  }

  function goToHubAfterActivate() {
    const path = global.location.pathname || "";
    if (path.indexOf("/homework/platform") >= 0) {
      global.location.reload();
      return;
    }
    global.location.href = "/homework/platform.html";
  }

  function siteOrigin() {
    try {
      return global.location.origin;
    } catch {
      return "";
    }
  }

  function paidReturnPath(plan) {
    return (
      "/homework/platform.html?paid=1&plan=" + encodeURIComponent(plan)
    );
  }

  async function fetchApproveUrl(productId, session) {
    const res = await fetch("/api/paypal/create-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: productId,
        username: session.username,
        email: session.email || "",
        displayName: session.displayName || session.username,
        origin: siteOrigin(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.approveUrl) {
      return { ok: true, approveUrl: String(data.approveUrl) };
    }
    return {
      ok: false,
      fallback: Boolean(data.fallback) || data.code === "PAYPAL_NOT_CONFIGURED",
      error: data.error || "Could not start PayPal checkout.",
    };
  }

  function closeHwBreakdownIfOpen() {
    const modal = document.getElementById("hw-breakdown-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("is-modal-open");
  }

  function paidAwaitHubUrl(productId) {
    return (
      "/homework/platform.html?paidPrompt=1&checkout=" +
      encodeURIComponent(productId)
    );
  }

  function openHubPaidTab(productId, preopened) {
    const url = paidAwaitHubUrl(productId);
    if (preopened && !preopened.closed) {
      try {
        preopened.location.href = url;
        return preopened;
      } catch {
        /* fall through */
      }
    }
    return global.open(url, "_blank");
  }

  async function resolvePaypalUrl(productId, session) {
    if (session?.username) {
      try {
        const created = await fetchApproveUrl(productId, session);
        if (created.ok && created.approveUrl) return created.approveUrl;
      } catch {
        /* fall through */
      }
    }
    return buildCheckoutUrl(productId, session);
  }

  function ensureJoinAccountDialog() {
    let dialog = document.getElementById("hw-checkout-join-dialog");
    if (dialog) return dialog;

    dialog = document.createElement("dialog");
    dialog.id = "hw-checkout-join-dialog";
    dialog.className = "hw-hub-feedback-dialog hw-checkout-join-dialog";
    dialog.setAttribute("aria-labelledby", "hw-checkout-join-title");
    dialog.innerHTML =
      '<div class="hw-hub-feedback-dialog__form hw-checkout-join-dialog__body">' +
      '<h3 class="hw-hub-feedback-dialog__title" id="hw-checkout-join-title">Create an account</h3>' +
      '<p class="hw-hub-feedback-dialog__desc" id="hw-checkout-join-desc">' +
      "Make your Homework Hub account. You\u2019ll go to PayPal next, and a hub tab will wait for I\u2019ve paid." +
      "</p>" +
      '<p class="hw-maker-status" id="hw-checkout-join-status" role="status" aria-live="polite"></p>' +
      '<form id="hw-checkout-join-signup" class="hw-checkout-join-dialog__panel">' +
      '<label class="hw-checkout-join-dialog__field">First name' +
      '<input type="text" name="displayName" required maxlength="40" autocomplete="given-name" placeholder="David">' +
      "</label>" +
      '<label class="hw-checkout-join-dialog__field">Email' +
      '<input type="email" name="email" required autocomplete="email" placeholder="you@example.com">' +
      "</label>" +
      '<label class="hw-checkout-join-dialog__field">Password' +
      '<input type="password" name="password" required minlength="6" autocomplete="new-password" placeholder="••••••••">' +
      "</label>" +
      '<div class="hw-hub-feedback-dialog__actions">' +
      '<button type="button" class="btn btn--ghost" data-join-cancel>Cancel</button>' +
      '<button type="submit" class="btn btn--primary" id="hw-checkout-join-create">Create account</button>' +
      "</div>" +
      '<p class="hw-checkout-join-dialog__switch" id="hw-checkout-join-to-login" hidden>' +
      '<button type="button" class="hw-checkout-join-dialog__link" data-join-mode="login">Already have an account?</button>' +
      "</p>" +
      "</form>" +
      '<form id="hw-checkout-join-login" class="hw-checkout-join-dialog__panel" hidden>' +
      '<label class="hw-checkout-join-dialog__field">Email / username' +
      '<input type="text" name="loginId" required autocomplete="username" placeholder="you@example.com">' +
      "</label>" +
      '<label class="hw-checkout-join-dialog__field">Password' +
      '<input type="password" name="password" required autocomplete="current-password" placeholder="••••••••">' +
      "</label>" +
      '<div class="hw-hub-feedback-dialog__actions">' +
      '<button type="button" class="btn btn--ghost" data-join-cancel>Cancel</button>' +
      '<button type="submit" class="btn btn--primary" id="hw-checkout-join-login-btn">Log in</button>' +
      "</div>" +
      '<p class="hw-checkout-join-dialog__switch">' +
      '<button type="button" class="hw-checkout-join-dialog__link" data-join-mode="signup">Create a new account</button>' +
      "</p>" +
      "</form>" +
      "</div>";
    document.body.appendChild(dialog);

    const statusEl = () => dialog.querySelector("#hw-checkout-join-status");
    const clearStatus = () => {
      const el = statusEl();
      if (!el) return;
      el.textContent = "";
      el.classList.remove("hw-maker-status--error");
    };
    const showError = (msg) => {
      const el = statusEl();
      if (!el) return;
      el.textContent = msg;
      el.classList.add("hw-maker-status--error");
    };

    function setJoinMode(mode) {
      const signup = dialog.querySelector("#hw-checkout-join-signup");
      const login = dialog.querySelector("#hw-checkout-join-login");
      const title = dialog.querySelector("#hw-checkout-join-title");
      const desc = dialog.querySelector("#hw-checkout-join-desc");
      const plan = dialog.dataset.plan || "basic";
      const label = PLAN_LABELS[plan] || plan;
      if (signup) signup.hidden = mode !== "signup";
      if (login) login.hidden = mode !== "login";
      if (title) {
        title.textContent =
          mode === "login"
            ? "Log in to join " + label
            : "Create an account to join " + label;
      }
      if (desc) {
        desc.textContent =
          mode === "login"
            ? plan === "student-special"
              ? "Log in and you\u2019ll land in your hub. If you don\u2019t have weekly homework yet, unlock Student Special there ($10/mo)."
              : "Log in, then you\u2019ll go to PayPal for " + label + "."
            : plan === "student-special"
              ? "Make your Homework Hub account for Student Special. Create account sends you to PayPal, and opens your hub with I\u2019ve paid ready."
              : "Make your Homework Hub account for " +
                label +
                ". Create account sends you to PayPal, and opens your hub with I\u2019ve paid ready.";
      }
      clearStatus();
    }

    dialog.querySelectorAll("[data-join-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      });
    });

    dialog.querySelectorAll("[data-join-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setJoinMode(btn.getAttribute("data-join-mode") || "signup");
      });
    });

    dialog._setJoinMode = setJoinMode;

    dialog.querySelector("#hw-checkout-join-signup")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const plan = String(dialog.dataset.plan || "").trim();
      const displayName = form.displayName?.value || "";
      const email = form.email?.value || "";
      const password = form.password?.value || "";
      const submitBtn = dialog.querySelector("#hw-checkout-join-create");
      if (!plan || !PRODUCTS[plan]?.isHwPlan) {
        showError("Pick a plan again, then create your account.");
        return;
      }
      if (!global.HwAuth?.signupAsync) {
        showError("Account signup is not available right now.");
        return;
      }

      let hubTab = null;
      try {
        hubTab = global.open("about:blank", "_blank");
      } catch {
        hubTab = null;
      }

      clearStatus();
      if (submitBtn) submitBtn.disabled = true;
      const result = await global.HwAuth.signupAsync(
        { email, password, displayName },
        true
      );
      if (!result.ok) {
        if (submitBtn) submitBtn.disabled = false;
        try {
          hubTab?.close();
        } catch {
          /* ignore */
        }
        showError(result.error || "Could not create account.");
        return;
      }

      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");

      stashIntent(plan, result.session);
      openHubPaidTab(plan, hubTab);

      const paypalUrl = await resolvePaypalUrl(plan, result.session);
      if (!paypalUrl) {
        if (submitBtn) submitBtn.disabled = false;
        global.alert(
          "Account created, but PayPal for “" +
            (PLAN_LABELS[plan] || plan) +
            "” is not wired yet."
        );
        return;
      }
      navigateToPaypal(paypalUrl);
    });

    dialog.querySelector("#hw-checkout-join-login")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const plan = String(dialog.dataset.plan || "").trim();
      const loginId = form.loginId?.value || "";
      const password = form.password?.value || "";
      const submitBtn = dialog.querySelector("#hw-checkout-join-login-btn");
      if (!plan || !PRODUCTS[plan]?.isHwPlan) {
        showError("Pick a plan again, then log in.");
        return;
      }
      if (!global.HwAuth?.loginAsync) {
        showError("Login is not available right now.");
        return;
      }
      clearStatus();
      if (submitBtn) submitBtn.disabled = true;
      const result = await global.HwAuth.loginAsync(loginId, password, true);
      if (submitBtn) submitBtn.disabled = false;
      if (!result.ok) {
        showError(result.error || "Could not log in.");
        return;
      }
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");

      /* Student Special: hub unlock page if they don’t have weekly HW yet. */
      if (plan === "student-special" && shouldShowStuspecHub(result.session)) {
        global.location.href = stuspecHubUrl();
        return;
      }

      void startHwPlanCheckout(plan, result.session, { forcePaypal: true });
    });

    return dialog;
  }

  function stuspecHubUrl() {
    return "/homework/platform.html?focus=stuspec";
  }

  /** Lesson students eligible for Student Special, or anyone still pending a plan. */
  function shouldShowStuspecHub(session) {
    if (!session) return true;
    if (global.HwAuth?.canShowWeeklyHomeworkUpgrade?.(session)) return true;
    if (!global.HwAuth?.hasActiveSubscription?.(session)) return true;
    return false;
  }

  function openJoinAccountDialog(productId) {
    closeHwBreakdownIfOpen();
    const dialog = ensureJoinAccountDialog();
    const statusEl = dialog.querySelector("#hw-checkout-join-status");
    const toLogin = dialog.querySelector("#hw-checkout-join-to-login");
    dialog.dataset.plan = productId;
    if (statusEl) {
      statusEl.textContent = "";
      statusEl.classList.remove("hw-maker-status--error");
    }
    /* Already have an account? — especially for Student Special. */
    if (toLogin) toLogin.hidden = productId !== "student-special";
    if (typeof dialog._setJoinMode === "function") dialog._setJoinMode("signup");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector('#hw-checkout-join-signup input[name="displayName"]')?.focus();
  }

  function navigateToPaypal(url) {
    global.location.assign(url);
  }

  function openPaypalTab(url, preopened) {
    if (preopened && !preopened.closed) {
      try {
        preopened.location.href = url;
        try {
          preopened.focus();
        } catch {
          /* ignore */
        }
        return preopened;
      } catch {
        /* fall through */
      }
    }
    const tab = global.open(url, "_blank");
    try {
      tab?.focus?.();
    } catch {
      /* ignore */
    }
    return tab;
  }

  function isOnHomeworkHub() {
    try {
      return String(global.location.pathname || "").indexOf("/homework/platform") >= 0;
    } catch {
      return false;
    }
  }

  async function startHwPlanCheckout(productId, session, options) {
    options = options || {};
    if (!session?.username) {
      openJoinAccountDialog(productId);
      return;
    }

    stashIntent(productId, session);

    /* Logged-in Student Special without weekly HW yet → hub unlock page (not PayPal yet). */
    if (
      productId === "student-special" &&
      !options.forcePaypal &&
      shouldShowStuspecHub(session)
    ) {
      global.location.href = stuspecHubUrl();
      return;
    }

    /* Open during the click gesture so popup blockers allow PayPal. */
    let preopened = null;
    try {
      preopened = global.open("about:blank", "_blank");
    } catch {
      preopened = null;
    }

    const paypalUrl = await resolvePaypalUrl(productId, session);
    if (!paypalUrl) {
      try {
        preopened?.close();
      } catch {
        /* ignore */
      }
      global.alert(
        "Checkout for “" +
          (PRODUCTS[productId]?.label || productId) +
          "” is not wired yet."
      );
      return;
    }

    /*
     * Already on the hub (unlock card): PayPal must be the NEW tab (focused).
     * This tab stays only for the I’ve paid prompt — not the unlock page alone.
     */
    if (options.forcePaypal || isOnHomeworkHub()) {
      const paypalTab = openPaypalTab(paypalUrl, preopened);
      if (!paypalTab) {
        /* Popup blocked — leave the hub for PayPal. */
        navigateToPaypal(paypalUrl);
        return;
      }
      openPaidConfirm(productId);
      return;
    }

    /* From marketing/signup: I’ve paid hub in the other tab; this tab → PayPal. */
    openHubPaidTab(productId, preopened);
    navigateToPaypal(paypalUrl);
  }

  function startCheckout(productId, options) {
    options = options || {};
    if (isPlaceholderUrl(PRODUCTS[productId]?.url)) {
      if (global.CoursesComingSoon?.open) {
        global.CoursesComingSoon.open();
        return;
      }
      global.alert("Coming soon!");
      return;
    }

    const session = global.HwAuth?.getSession?.();

    if (PRODUCTS[productId]?.isHwPlan) {
      if (!session?.username) {
        openJoinAccountDialog(productId);
        return;
      }
      void startHwPlanCheckout(productId, session, options);
      return;
    }

    if (!session) {
      requireLogin(productId);
      return;
    }

    const checkoutUrl = buildCheckoutUrl(productId, session);
    if (!checkoutUrl) {
      if (global.CoursesComingSoon?.open) {
        global.CoursesComingSoon.open();
        return;
      }
      global.alert(
        "Checkout for “" +
          (PRODUCTS[productId]?.label || productId) +
          "” is not wired yet. Your account is ready — message JD to finish payment setup."
      );
      return;
    }

    global.open(checkoutUrl, "_blank", "noopener,noreferrer");
  }

  function handleCheckoutClick(event, productId) {
    event.preventDefault();
    startCheckout(productId);
  }

  function bindCheckoutControls(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-hw-checkout]").forEach((el) => {
      if (el.dataset.hwCheckoutBound === "true") return;
      el.dataset.hwCheckoutBound = "true";
      const productId = el.getAttribute("data-hw-checkout");
      if (!productId) return;

      el.addEventListener("click", (event) => {
        handleCheckoutClick(event, productId);
      });
    });
  }

  function resumeCheckoutFromQuery() {
    const params = new URLSearchParams(global.location.search);
    const productId = params.get("checkout");
    const paidPrompt = params.get("paidPrompt") === "1";
    if (!productId) return;

    /* After guest PayPal: stay here for account + I’ve paid — don’t reopen PayPal. */
    if (paidPrompt && PRODUCTS[productId]?.isHwPlan) {
      stashIntent(productId, global.HwAuth?.getSession?.() || null);
      params.delete("checkout");
      params.delete("paidPrompt");
      const clean =
        global.location.pathname +
        (params.toString() ? "?" + params.toString() : "") +
        global.location.hash;
      global.history.replaceState({}, "", clean);
      if (global.HwAuth?.isAuthenticated?.()) {
        openPaidConfirm(productId);
      }
      return;
    }

    if (!global.HwAuth?.isAuthenticated?.()) return;

    const session = global.HwAuth.getSession();

    params.delete("checkout");
    const clean =
      global.location.pathname +
      (params.toString() ? "?" + params.toString() : "") +
      global.location.hash;
    global.history.replaceState({}, "", clean);

    if (PRODUCTS[productId]?.isHwPlan) {
      void startHwPlanCheckout(productId, session);
      return;
    }

    const checkoutUrl = buildCheckoutUrl(productId, session);
    if (!checkoutUrl) return;
    global.open(checkoutUrl, "_blank", "noopener,noreferrer");
  }

  async function resumePaidReturnFromQuery() {
    const params = new URLSearchParams(global.location.search);
    const paid = params.get("paid");
    if (paid == null) return;

    let plan = String(params.get("plan") || "").trim().toLowerCase();
    if (!plan || !PRODUCTS[plan]?.isHwPlan) {
      const intent = readIntent();
      if (intent?.plan && PRODUCTS[intent.plan]?.isHwPlan) plan = intent.plan;
    }
    const subscriptionId = String(params.get("subscription_id") || "").trim();

    params.delete("paid");
    params.delete("plan");
    /* PayPal may append ba_token / subscription_id / token — strip common leftovers. */
    ["ba_token", "token", "subscription_id", "PayerID"].forEach((k) =>
      params.delete(k)
    );
    const clean =
      global.location.pathname +
      (params.toString() ? "?" + params.toString() : "") +
      global.location.hash;
    global.history.replaceState({}, "", clean);

    if (!global.HwAuth?.isAuthenticated?.()) {
      if (paid === "1" && plan) {
        global.location.href =
          LOGIN_PATH +
          "?next=" +
          encodeURIComponent(paidReturnPath(plan));
      }
      return;
    }

    const session = global.HwAuth.getSession();

    if (paid === "0") {
      global.HwToast?.show?.("PayPal checkout cancelled — pick a plan when you’re ready.");
      if (plan) openPaidConfirm(plan);
      return;
    }

    if (paid !== "1" || !plan || !PRODUCTS[plan]?.isHwPlan) return;

    stashIntent(plan, session);
    const result = await activatePlan(plan, session, { subscriptionId });
    if (result.ok) {
      clearIntent();
      global.HwToast?.show?.(result.message || "Plan active — waiting for JD.");
      goToHubAfterActivate();
      return;
    }

    openPaidConfirm(plan);
    const statusEl = document.getElementById("hw-checkout-paid-status");
    if (statusEl) {
      statusEl.textContent = result.error || "Confirm payment to unlock your plan.";
      statusEl.classList.add("hw-maker-status--error");
    }
  }

  function maybeReopenPendingIntent() {
    const intent = readIntent();
    if (!intent?.plan || !PRODUCTS[intent.plan]?.isHwPlan) return;
    if (!global.HwAuth?.isAuthenticated?.()) return;
    const session = global.HwAuth.getSession();
    if (intent.username && session?.username && intent.username !== session.username) {
      return;
    }
    if (intent.at && Date.now() - Number(intent.at) > 2 * 60 * 60 * 1000) {
      clearIntent();
      return;
    }
    if (global.HwAuth.hasActiveSubscription?.(session)) {
      clearIntent();
      return;
    }
    /* Do NOT auto-open a modal on login — that looked like a black screen with
       an empty rounded box (Edge/Brave). PayPal return (?paid=) still opens it. */
  }

  function init() {
    bindCheckoutControls(document);
    resumeCheckoutFromQuery();
    void resumePaidReturnFromQuery().then(() => {
      maybeReopenPendingIntent();
    });
  }

  global.HwCheckout = {
    PRODUCTS,
    LOGIN_PATH,
    INTENT_KEY,
    buildCheckoutUrl,
    bindCheckoutControls,
    init,
    requireLogin,
    startCheckout,
    activatePlan,
    openPaidConfirm,
    openJoinAccountDialog,
    clearIntent,
    readIntent,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
