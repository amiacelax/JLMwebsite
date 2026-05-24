(function () {
  "use strict";

  const html = document.documentElement;
  const nav = document.querySelector(".nav");
  const navToggle = document.querySelector(".nav__toggle");
  const navMenu = document.querySelector(".nav__menu");
  const themeToggle = document.querySelector(".theme-toggle");
  const contactForm = document.getElementById("contact-form");
  const formStatus = document.getElementById("form-status");
  const submitBtn = document.getElementById("submit-btn");
  const yearEl = document.getElementById("year");
  const hwBreakdownModal = document.getElementById("hw-breakdown-modal");
  const hwBreakdownOpenBtns = document.querySelectorAll("[data-hw-breakdown-open]");
  const hwBreakdownCloseBtns = document.querySelectorAll("[data-hw-breakdown-close]");
  let lastFocusedBeforeModal = null;

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* Theme toggle */
  function getTheme() {
    return html.getAttribute("data-theme") || "dark";
  }

  function setTheme(theme) {
    html.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }

  themeToggle?.addEventListener("click", () => {
    setTheme(getTheme() === "dark" ? "light" : "dark");
  });

  function closeMenu() {
    nav?.classList.remove("is-open");
    navMenu?.classList.remove("is-open");
    document.body.classList.remove("is-nav-open");
    navToggle?.setAttribute("aria-expanded", "false");
    navToggle?.setAttribute("aria-label", "Open menu");
  }

  function openMenu() {
    nav?.classList.add("is-open");
    navMenu?.classList.add("is-open");
    document.body.classList.add("is-nav-open");
    navToggle?.setAttribute("aria-expanded", "true");
    navToggle?.setAttribute("aria-label", "Close menu");
  }

  function closeHwBreakdown() {
    if (!hwBreakdownModal || hwBreakdownModal.hidden) return;
    hwBreakdownModal.hidden = true;
    document.body.classList.remove("is-modal-open");
    if (lastFocusedBeforeModal instanceof HTMLElement) {
      lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
  }

  function openHwBreakdown() {
    if (!hwBreakdownModal) return;
    lastFocusedBeforeModal = document.activeElement;
    hwBreakdownModal.hidden = false;
    document.body.classList.add("is-modal-open");
    hwBreakdownModal.querySelector("[data-hw-breakdown-close]")?.focus();
  }

  navToggle?.addEventListener("click", () => {
    if (navMenu?.classList.contains("is-open")) closeMenu();
    else openMenu();
  });

  navMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeMenu();
    closeHwBreakdown();
  });

  function headerScrollOffset() {
    const header = document.querySelector(".site-header");
    return (header?.offsetHeight ?? 60) + 12;
  }

  function scrollToSection(target) {
    const y =
      target.getBoundingClientRect().top + window.scrollY - headerScrollOffset();
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  const serviceSelect = document.getElementById("service");

  function preselectService(serviceName) {
    if (!serviceSelect || !serviceName) return;
    const option = Array.from(serviceSelect.options).find(
      (opt) => opt.value === serviceName
    );
    if (option) serviceSelect.value = serviceName;
  }

  window.jlmPreselectService = preselectService;

  hwBreakdownOpenBtns.forEach((btn) => {
    btn.addEventListener("click", openHwBreakdown);
  });

  hwBreakdownCloseBtns.forEach((btn) => {
    btn.addEventListener("click", closeHwBreakdown);
  });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href");
      if (!id || id === "#" || id === "#top") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      preselectService(link.getAttribute("data-service"));
      scrollToSection(target);
      history.replaceState(null, "", id);
    });
  });

  document.querySelectorAll(".service-card__lesson-video").forEach((details) => {
    details.addEventListener("toggle", () => {
      const video = details.querySelector("video");
      if (!video || details.open) return;
      video.pause();
      video.currentTime = 0;
    });
  });

  document.querySelector(".nav__brand")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", "#top");
  });

  /* Active nav link on scroll */
  const observedSections = [
    { element: document.getElementById("about"), linkId: "about" },
    { element: document.getElementById("services"), linkId: "services" },
    { element: document.getElementById("contact"), linkId: "contact" },
  ].filter((entry) => entry.element);
  const navLinks = document.querySelectorAll(".nav__links a");

  if (observedSections.length && navLinks.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const match = observedSections.find((item) => item.element === entry.target);
          if (!match) return;
          navLinks.forEach((link) => {
            link.style.color =
              link.getAttribute("href") === `#${match.linkId}`
                ? "var(--color-text)"
                : "";
          });
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    observedSections.forEach(({ element }) => observer.observe(element));
  }

  /* Contact form */
  function showStatus(message, type) {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.className = "form-status";
    if (type) formStatus.classList.add(`is-${type}`);
  }

  contactForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showStatus("");

    const formData = new FormData(contactForm);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      service: formData.get("service"),
      message: formData.get("message"),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        showStatus(data.error || "Something went wrong. Please try again.", "error");
        return;
      }

      showStatus(data.message, "success");
      contactForm.reset();
    } catch {
      showStatus("Network error. Please check your connection and try again.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Message";
    }
  });
})();
