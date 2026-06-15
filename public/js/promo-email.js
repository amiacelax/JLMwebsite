(function () {
  "use strict";

  const modal = document.getElementById("promo-modal");
  if (!modal) return;

  const pageName = document.body.dataset.promoPage || "Website";
  const form = document.getElementById("promo-form");
  const statusEl = document.getElementById("promo-status");
  const submitBtn = document.getElementById("promo-submit");
  const SUBSCRIBED_KEY = "jlm-promo-subscribed";
  const DISMISSED_KEY = "jlm-promo-dismissed";
  const SESSION_SHOWN_KEY = "jlm-promo-shown-session";
  const LEGACY_SEEN_KEY = "jlm-promo-seen";
  const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
  const OPEN_DELAY_MS = 5000;
  const SCROLL_DEPTH = 0.45;
  const AUTO_SHOW_PAGES = new Set(["Home"]);
  let promoOpened = false;

  function showStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = "promo-modal__status";
    if (type) statusEl.classList.add(`is-${type}`);
  }

  function hasSubscribed() {
    try {
      if (localStorage.getItem(SUBSCRIBED_KEY) === "1") return true;
      return localStorage.getItem(LEGACY_SEEN_KEY) === "1";
    } catch {
      return false;
    }
  }

  function wasDismissedRecently() {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (!raw) return false;
      const ts = Number(raw);
      if (!Number.isFinite(ts)) return false;
      return Date.now() - ts < DISMISS_TTL_MS;
    } catch {
      return false;
    }
  }

  function hasShownThisSession() {
    if (promoOpened) return true;
    try {
      return sessionStorage.getItem(SESSION_SHOWN_KEY) === "1";
    } catch {
      return promoOpened;
    }
  }

  function markShownThisSession() {
    promoOpened = true;
    try {
      sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
    } catch {
      /* private browsing / storage blocked */
    }
  }

  function shouldShowPromo() {
    if (hasSubscribed()) return false;
    if (wasDismissedRecently()) return false;
    if (hasShownThisSession()) return false;
    return true;
  }

  function markDismissed() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* private browsing / storage blocked */
    }
  }

  function markSubscribed() {
    try {
      localStorage.setItem(SUBSCRIBED_KEY, "1");
      localStorage.removeItem(DISMISSED_KEY);
    } catch {
      /* private browsing / storage blocked */
    }
  }

  function openModal() {
    modal.hidden = false;
    document.body.classList.add("promo-modal-open");
    modal.querySelector("input[type=email]")?.focus();
  }

  function closeModal(dismissed) {
    modal.hidden = true;
    document.body.classList.remove("promo-modal-open");
    if (dismissed) markDismissed();
  }

  function tryOpenPromo() {
    if (!AUTO_SHOW_PAGES.has(pageName)) return;
    if (!shouldShowPromo()) return;
    if (!modal.hidden) return;
    markShownThisSession();
    openModal();
  }

  function bindPromoTriggers() {
    if (!AUTO_SHOW_PAGES.has(pageName)) return;
    if (!shouldShowPromo()) return;

    window.setTimeout(() => tryOpenPromo(), OPEN_DELAY_MS);

    window.addEventListener(
      "scroll",
      () => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll <= 0) return;
        if (window.scrollY / maxScroll >= SCROLL_DEPTH) tryOpenPromo();
      },
      { passive: true }
    );

    document.addEventListener("mouseout", (e) => {
      if (e.relatedTarget || e.clientY > 0) return;
      tryOpenPromo();
    });
  }

  bindPromoTriggers();

  modal.querySelectorAll("[data-promo-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(true));
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal.querySelector(".promo-modal__backdrop")) closeModal(true);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal(true);
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showStatus("");

    const email = new FormData(form).get("email");
    if (!email || typeof email !== "string") {
      showStatus("Please enter your email.", "error");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }

    try {
      const res = await fetch("/api/promo-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, page: pageName }),
      });
      const data = await res.json();

      if (!res.ok) {
        showStatus(data.error || "Something went wrong. Please try again.", "error");
        return;
      }

      markSubscribed();
      showStatus(data.message, "success");
      form.reset();
      setTimeout(() => closeModal(false), 2200);
    } catch {
      showStatus("Network error. Please try again.", "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Get updates";
      }
    }
  });
})();
