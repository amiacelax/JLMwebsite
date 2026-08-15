/**
 * Account-gated checkout — PayPal links only after login; buyer id passed to PayPal.
 */
(function (global) {
  const LOGIN_PATH = "/homework.html";

  const PRODUCTS = {
    premium: {
      label: "Premium homework subscription",
      url: "https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-9CF38809GM2257018NIKG6UY",
      param: "custom_id",
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

  const HW_PLANS = {
    basic: "Basic homework",
    premium: "Premium homework",
    ultra: "Ultra homework",
    "student-special": "Student Special",
    "student-ultra": "Student Ultra",
    tier1: "Basic homework",
    tier2: "Premium homework",
    tier3: "Ultra homework",
    student_special: "Student Special",
    student_ultra: "Student Ultra",
  };

  function isHwPlan(productId) {
    return Object.prototype.hasOwnProperty.call(HW_PLANS, String(productId || ""));
  }

  function normalizePlanId(productId) {
    const p = String(productId || "").trim().toLowerCase();
    if (p === "tier1") return "basic";
    if (p === "tier2") return "premium";
    if (p === "tier3") return "ultra";
    if (p === "student_special") return "student-special";
    if (p === "student_ultra") return "student-ultra";
    return p;
  }

  function loginUrl(productId) {
    const next = encodeURIComponent(
      global.location.pathname + global.location.search + global.location.hash
    );
    let url = LOGIN_PATH + "?next=" + next;
    if (productId) url += "&checkout=" + encodeURIComponent(productId);
    return url;
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

  async function startCheckout(productId, options) {
    const plan = normalizePlanId(productId);
    if (!isHwPlan(plan) && !isHwPlan(productId)) {
      handleCheckoutClick({ preventDefault() {} }, productId);
      return;
    }
    const session = global.HwAuth?.getSession?.();
    if (!session) {
      requireLogin(plan);
      return;
    }
    try {
      const res = await fetch("/api/paypal/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          username: session.username,
          email: session.email,
          displayName: session.displayName,
          origin: global.location.origin,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fallback && !options?.forcePaypal) {
          const fallbackUrl = buildCheckoutUrl(plan === "premium" ? "premium" : plan, session);
          if (fallbackUrl) {
            global.location.href = fallbackUrl;
            return;
          }
        }
        throw new Error(data.error || "Could not start PayPal checkout.");
      }
      if (!data.approveUrl) throw new Error("PayPal did not return a checkout link.");
      global.location.href = data.approveUrl;
    } catch (err) {
      global.alert((err && err.message) || "Could not start PayPal checkout.");
    }
  }

  async function resumePaidReturn() {
    const params = new URLSearchParams(global.location.search);
    if (params.get("paid") !== "1") return;
    const session = global.HwAuth?.getSession?.();
    if (!session?.username) return;
    const plan = params.get("plan") || "";
    const subscriptionId = params.get("subscription_id") || "";
    try {
      const res = await fetch("/api/auth/activate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: session.username,
          displayName: session.displayName,
          plan,
          subscriptionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.session && global.HwAuth?.persistSession) {
        const remember = !!global.localStorage?.getItem?.("jlm-hw-session");
        global.HwAuth.persistSession(
          { ...data.session, loggedInAt: Date.now() },
          remember
        );
      }
    } catch {
      /* plan still activates from Teacher Hub if this ping fails */
    }
    params.delete("paid");
    params.delete("plan");
    params.delete("subscription_id");
    params.delete("ba_token");
    params.delete("token");
    const clean =
      global.location.pathname +
      (params.toString() ? "?" + params.toString() : "") +
      global.location.hash;
    global.history.replaceState({}, "", clean);
  }

  function handleCheckoutClick(event, productId) {
    const checkoutUrl = buildCheckoutUrl(productId, global.HwAuth?.getSession?.());
    if (isPlaceholderUrl(PRODUCTS[productId]?.url)) {
      event.preventDefault();
      if (global.CoursesComingSoon?.open) {
        global.CoursesComingSoon.open();
        return;
      }
      global.alert("Coming soon!");
      return;
    }

    const session = global.HwAuth?.getSession?.();
    if (!session) {
      event.preventDefault();
      requireLogin(productId);
      return;
    }

    if (isHwPlan(productId)) {
      event.preventDefault();
      void startCheckout(productId);
      return;
    }

    if (!checkoutUrl) {
      event.preventDefault();
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

    event.preventDefault();
    global.open(checkoutUrl, "_blank", "noopener,noreferrer");
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
    if (!productId || !global.HwAuth?.isAuthenticated?.()) return;

    const session = global.HwAuth.getSession();
    const checkoutUrl = buildCheckoutUrl(productId, session);
    if (!checkoutUrl) return;

    params.delete("checkout");
    const clean =
      global.location.pathname +
      (params.toString() ? "?" + params.toString() : "") +
      global.location.hash;
    global.history.replaceState({}, "", clean);
    global.open(checkoutUrl, "_blank", "noopener,noreferrer");
  }

  function init() {
    bindCheckoutControls(document);
    resumeCheckoutFromQuery();
    void resumePaidReturn();
  }

  global.HwCheckout = {
    PRODUCTS,
    LOGIN_PATH,
    buildCheckoutUrl,
    bindCheckoutControls,
    startCheckout,
    init,
    requireLogin,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
