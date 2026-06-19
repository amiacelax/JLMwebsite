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
  }

  global.HwCheckout = {
    PRODUCTS,
    LOGIN_PATH,
    buildCheckoutUrl,
    bindCheckoutControls,
    init,
    requireLogin,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
