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
  const scheduleModal = document.getElementById("lesson-scheduler-modal");
  const scheduleOpenBtns = document.querySelectorAll("[data-schedule-open]");
  const scheduleCloseBtns = document.querySelectorAll("[data-schedule-close]");
  const scheduleDateOptions = document.getElementById("lesson-scheduler-dates");
  const scheduleSlotOptions = document.getElementById("lesson-scheduler-slots");
  const scheduleTimezone = document.getElementById("lesson-scheduler-timezone");
  const scheduleSelected = document.getElementById("lesson-scheduler-selected");
  const scheduleUseBtn = document.getElementById("lesson-scheduler-use");
  const messageField = document.getElementById("message");
  let lastFocusedBeforeModal = null;
  let selectedScheduleDateIndex = 0;
  let selectedScheduleSlot = null;

  const scheduleAvailability = [
    { offsetDays: 1, slots: [[9, 0, true], [10, 30, true], [18, 0, false], [20, 0, true]] },
    { offsetDays: 2, slots: [[8, 30, false], [11, 0, true], [19, 30, true]] },
    { offsetDays: 4, slots: [[9, 0, true], [13, 0, false], [18, 30, true]] },
    { offsetDays: 5, slots: [[10, 0, true], [14, 0, true], [20, 30, false]] },
    { offsetDays: 7, slots: [[8, 0, true], [12, 30, false], [19, 0, true]] },
  ];

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

  function updateModalBodyState() {
    const modalOpen =
      (hwBreakdownModal && !hwBreakdownModal.hidden) ||
      (scheduleModal && !scheduleModal.hidden);
    document.body.classList.toggle("is-modal-open", !!modalOpen);
  }

  function closeHwBreakdown() {
    if (!hwBreakdownModal || hwBreakdownModal.hidden) return;
    hwBreakdownModal.hidden = true;
    updateModalBodyState();
    if (lastFocusedBeforeModal instanceof HTMLElement) {
      lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
  }

  function openHwBreakdown() {
    if (!hwBreakdownModal) return;
    lastFocusedBeforeModal = document.activeElement;
    hwBreakdownModal.hidden = false;
    updateModalBodyState();
    hwBreakdownModal.querySelector("[data-hw-breakdown-close]")?.focus();
  }

  function scheduleDateForOffset(offsetDays) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return date;
  }

  function scheduleSlotDate(date, slot) {
    const next = new Date(date);
    next.setHours(slot[0], slot[1], 0, 0);
    return next;
  }

  function formatScheduleDate(date) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function formatScheduleTime(date) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function timezoneLabel() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone";
  }

  function updateScheduleSelected() {
    if (!scheduleSelected || !scheduleUseBtn) return;
    if (!selectedScheduleSlot) {
      scheduleSelected.textContent = "Select a date and time to add it to your message.";
      scheduleUseBtn.disabled = true;
      return;
    }
    scheduleSelected.textContent =
      "Selected: " +
      selectedScheduleSlot.dateLabel +
      " at " +
      selectedScheduleSlot.timeLabel +
      " (" +
      timezoneLabel() +
      ")";
    scheduleUseBtn.disabled = false;
  }

  function renderScheduleSlots() {
    if (!scheduleSlotOptions) return;
    scheduleSlotOptions.innerHTML = "";
    selectedScheduleSlot = null;

    const day = scheduleAvailability[selectedScheduleDateIndex] || scheduleAvailability[0];
    const date = scheduleDateForOffset(day.offsetDays);
    const dateLabel = formatScheduleDate(date);

    day.slots.forEach((slot) => {
      const slotDate = scheduleSlotDate(date, slot);
      const timeLabel = formatScheduleTime(slotDate);
      const available = !!slot[2];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "lesson-scheduler-slot" + (available ? "" : " lesson-scheduler-slot--unavailable");
      btn.textContent = timeLabel + (available ? "" : " unavailable");
      btn.disabled = !available;
      btn.setAttribute("aria-pressed", "false");
      if (available) {
        btn.addEventListener("click", () => {
          scheduleSlotOptions.querySelectorAll(".lesson-scheduler-slot").forEach((slotBtn) => {
            slotBtn.setAttribute("aria-pressed", "false");
          });
          btn.setAttribute("aria-pressed", "true");
          selectedScheduleSlot = { dateLabel, timeLabel };
          updateScheduleSelected();
        });
      }
      scheduleSlotOptions.appendChild(btn);
    });

    updateScheduleSelected();
  }

  function renderScheduleDates() {
    if (!scheduleDateOptions) return;
    scheduleDateOptions.innerHTML = "";
    scheduleAvailability.forEach((day, index) => {
      const date = scheduleDateForOffset(day.offsetDays);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lesson-scheduler-date";
      btn.textContent = formatScheduleDate(date);
      btn.setAttribute("aria-pressed", index === selectedScheduleDateIndex ? "true" : "false");
      btn.addEventListener("click", () => {
        selectedScheduleDateIndex = index;
        scheduleDateOptions.querySelectorAll(".lesson-scheduler-date").forEach((dateBtn) => {
          dateBtn.setAttribute("aria-pressed", "false");
        });
        btn.setAttribute("aria-pressed", "true");
        renderScheduleSlots();
      });
      scheduleDateOptions.appendChild(btn);
    });
    renderScheduleSlots();
  }

  function closeSchedule() {
    if (!scheduleModal || scheduleModal.hidden) return;
    scheduleModal.hidden = true;
    updateModalBodyState();
    if (lastFocusedBeforeModal instanceof HTMLElement) {
      lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
  }

  function openSchedule() {
    if (!scheduleModal) return;
    lastFocusedBeforeModal = document.activeElement;
    selectedScheduleSlot = null;
    scheduleModal.hidden = false;
    updateModalBodyState();
    if (scheduleTimezone) {
      scheduleTimezone.textContent = "Timezone: " + timezoneLabel();
    }
    renderScheduleDates();
    scheduleModal.querySelector("[data-schedule-close]")?.focus();
  }

  function useSelectedSchedule() {
    if (!selectedScheduleSlot) return;
    const line =
      "Preferred lesson time: " +
      selectedScheduleSlot.dateLabel +
      " at " +
      selectedScheduleSlot.timeLabel +
      " (" +
      timezoneLabel() +
      ").";
    if (messageField) {
      messageField.value = messageField.value.trim()
        ? messageField.value.trim() + "\n\n" + line
        : line;
    }
    preselectService("Private Lessons");
    closeSchedule();
    const contact = document.getElementById("contact");
    if (contact) scrollToSection(contact);
    messageField?.focus();
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
    closeSchedule();
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

  scheduleOpenBtns.forEach((btn) => {
    btn.addEventListener("click", openSchedule);
  });

  scheduleCloseBtns.forEach((btn) => {
    btn.addEventListener("click", closeSchedule);
  });

  scheduleUseBtn?.addEventListener("click", useSelectedSchedule);

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
