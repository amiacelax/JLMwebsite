/**
 * Courses page — locked courses & bundle show a Coming soon modal.
 */
(function (global) {
  const modal = document.getElementById("coming-soon-modal");
  if (!modal) return;

  const closeBtns = modal.querySelectorAll("[data-coming-soon-close]");
  const emailForm = document.getElementById("coming-soon-email-form");
  const emailStatus = document.getElementById("coming-soon-email-status");
  const emailSubmit = document.getElementById("coming-soon-email-submit");
  const SUBSCRIBED_KEY = "jlm-promo-subscribed";
  let lastFocus = null;

  function showEmailStatus(message, type) {
    if (!emailStatus) return;
    emailStatus.textContent = message;
    emailStatus.className = "coming-soon-modal__status";
    if (type) emailStatus.classList.add("is-" + type);
  }

  function openModal() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("is-modal-open");
    showEmailStatus("");
    modal.querySelector("#coming-soon-email")?.focus();
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("is-modal-open");
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  }

  closeBtns.forEach((el) => el.addEventListener("click", closeModal));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  document.querySelectorAll(".course-card--locked").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      e.preventDefault();
      openModal();
    });
  });

  document.querySelectorAll("[data-coming-soon]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });
  });

  document.querySelectorAll(".course-card--locked [data-hw-checkout]").forEach((btn) => {
    btn.addEventListener("click", (e) => e.stopPropagation());
  });

  emailForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showEmailStatus("");

    const email = new FormData(emailForm).get("email");
    if (!email || typeof email !== "string") {
      showEmailStatus("Please enter your email.", "error");
      return;
    }

    if (emailSubmit) {
      emailSubmit.disabled = true;
      emailSubmit.textContent = "Submitting…";
    }

    try {
      const res = await fetch("/api/promo-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, page: "Courses" }),
      });
      const data = await res.json();

      if (!res.ok) {
        showEmailStatus(data.error || "Something went wrong. Please try again.", "error");
        return;
      }

      try {
        localStorage.setItem(SUBSCRIBED_KEY, "1");
      } catch {
        /* storage blocked */
      }

      showEmailStatus(data.message || "You're on the list — I'll email you when courses launch.", "success");
      emailForm.reset();
      window.setTimeout(closeModal, 2200);
    } catch {
      showEmailStatus("Network error. Please try again.", "error");
    } finally {
      if (emailSubmit) {
        emailSubmit.disabled = false;
        emailSubmit.textContent = "Get notified";
      }
    }
  });

  global.CoursesComingSoon = { open: openModal, close: closeModal };
})();
