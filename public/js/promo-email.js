(function () {
  "use strict";

  const modal = document.getElementById("promo-modal");
  if (!modal) return;

  const pageName = document.body.dataset.promoPage || "Website";
  const form = document.getElementById("promo-form");
  const statusEl = document.getElementById("promo-status");
  const submitBtn = document.getElementById("promo-submit");
  const seenKey = "jlm-promo-seen";

  function showStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = "promo-modal__status";
    if (type) statusEl.classList.add(`is-${type}`);
  }

  function markPromoSeen() {
    try {
      localStorage.setItem(seenKey, "1");
    } catch {
      /* private browsing / storage blocked */
    }
  }

  function hasSeenPromo() {
    try {
      return localStorage.getItem(seenKey) === "1";
    } catch {
      return false;
    }
  }

  function openModal() {
    markPromoSeen();
    modal.hidden = false;
    document.body.classList.add("promo-modal-open");
    modal.querySelector("input[type=email]")?.focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("promo-modal-open");
    markPromoSeen();
  }

  if (!hasSeenPromo()) {
    requestAnimationFrame(openModal);
  }

  modal.querySelectorAll("[data-promo-close]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal.querySelector(".promo-modal__backdrop")) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showStatus("");

    const email = new FormData(form).get("email");
    if (!email || typeof email !== "string") {
      showStatus("Please enter your email.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

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

      showStatus(data.message, "success");
      form.reset();
      setTimeout(closeModal, 2200);
    } catch {
      showStatus("Network error. Please try again.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Get updates";
    }
  });
})();
