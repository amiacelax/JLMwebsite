(function () {
  "use strict";

  const modal = document.getElementById("promo-modal");
  if (!modal) return;

  const pageName = document.body.dataset.promoPage || "Website";
  const form = document.getElementById("promo-form");
  const statusEl = document.getElementById("promo-status");
  const submitBtn = document.getElementById("promo-submit");
  const otherToggle = document.getElementById("promo-interest-other");
  const otherText = document.getElementById("promo-interest-other-text");
  const SUBSCRIBED_KEY = "jlm-promo-subscribed";
  const DISMISSED_KEY = "jlm-promo-dismissed";
  const SESSION_SHOWN_KEY = "jlm-promo-shown-session";
  const LEGACY_SEEN_KEY = "jlm-promo-seen";
  const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
  /* Timed auto-open only (no scroll-depth / exit-intent): Instagram/#contact
     deep links used to jump to contact and immediately hit scroll ≥45%,
     slamming this popup over the form. */
  const OPEN_DELAY_MS = 30000;
  const AUTO_SHOW_PAGES = new Set(["Home"]);
  let promoOpened = false;
  /* Skip auto-open for this visit when landing on #contact (Instagram links). */
  const landedOnContact = isContactHash(location.hash);

  function isContactHash(hash) {
    const h = String(hash || "").toLowerCase();
    return h === "#contact" || h.startsWith("#contact?");
  }

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

  function shouldAutoShowPromo() {
    if (landedOnContact) return false;
    if (isContactHash(location.hash)) return false;
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

  function syncOtherInput() {
    if (!otherText || !otherToggle) return;
    const on = otherToggle.checked;
    otherText.hidden = !on;
    otherText.required = on;
    if (!on) otherText.value = "";
    else otherText.focus();
  }

  otherToggle?.addEventListener("change", syncOtherInput);

  function collectInterests(formEl) {
    const interests = Array.from(formEl.querySelectorAll('input[name="interest"]:checked')).map(
      (el) => el.value
    );
    const otherRaw = String(new FormData(formEl).get("interestOther") || "").trim();
    return { interests, interestOther: otherRaw };
  }

  function validateInterests(interests, interestOther) {
    if (interests.includes("other") && interestOther.length < 3) {
      return "Please say a bit more for Other (at least 3 characters).";
    }
    return null;
  }

  function openModal() {
    modal.hidden = false;
    document.body.classList.add("promo-modal-open");
    syncOtherInput();
    modal.querySelector("input[type=email]")?.focus();
  }

  function closeModal(dismissed) {
    modal.hidden = true;
    document.body.classList.remove("promo-modal-open");
    if (dismissed) markDismissed();
  }

  function tryOpenPromo() {
    if (!AUTO_SHOW_PAGES.has(pageName)) return;
    if (!shouldAutoShowPromo()) return;
    if (!modal.hidden) return;
    markShownThisSession();
    openModal();
  }

  function openPromoFromUserGesture() {
    if (hasSubscribed()) return;
    if (!modal.hidden) return;
    markShownThisSession();
    openModal();
  }

  function bindTimedAutoOpen() {
    if (!AUTO_SHOW_PAGES.has(pageName)) return;
    if (landedOnContact) return;
    if (!shouldAutoShowPromo()) return;

    window.setTimeout(() => tryOpenPromo(), OPEN_DELAY_MS);
  }

  bindTimedAutoOpen();

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-promo-open]");
    if (!trigger) return;
    e.preventDefault();
    openPromoFromUserGesture();
  });

  modal.querySelectorAll("[data-promo-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(true));
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.matches?.(".promo-modal__backdrop")) closeModal(true);
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

    const { interests, interestOther } = collectInterests(form);
    const interestError = validateInterests(interests, interestOther);
    if (interestError) {
      showStatus(interestError, "error");
      otherText?.focus();
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
        body: JSON.stringify({
          email,
          page: pageName,
          interests,
          interestOther: interests.includes("other") ? interestOther : "",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        showStatus(data.error || "Something went wrong. Please try again.", "error");
        return;
      }

      markSubscribed();
      showStatus(data.message, "success");
      form.reset();
      syncOtherInput();
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
