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
  const jumpstartModal = document.getElementById("jumpstart-modal");
  const jumpstartOpenBtns = document.querySelectorAll("[data-jumpstart-open]");
  const jumpstartCloseBtns = document.querySelectorAll("[data-jumpstart-close]");
  const scheduleModal = document.getElementById("lesson-scheduler-modal");
  const scheduleOpenBtns = document.querySelectorAll("[data-schedule-open]");
  const scheduleCloseBtns = document.querySelectorAll("[data-schedule-close]");
  const scheduleDateOptions = document.getElementById("lesson-scheduler-dates");
  const scheduleSlotOptions = document.getElementById("lesson-scheduler-slots");
  const scheduleTimezone = document.getElementById("lesson-scheduler-timezone");
  const scheduleSelected = document.getElementById("lesson-scheduler-selected");
  const scheduleUseBtn = document.getElementById("lesson-scheduler-use");
  const scheduleWeekPrev = document.getElementById("lesson-scheduler-week-prev");
  const scheduleWeekNext = document.getElementById("lesson-scheduler-week-next");
  const scheduleWeekRange = document.getElementById("lesson-scheduler-week-range");
  const messageField = document.getElementById("message");
  let lastFocusedBeforeModal = null;
  let selectedScheduleDateIndex = 0;
  let selectedScheduleSlot = null;
  let scheduleWeekOffset = 0;
  const SCHEDULE_SHARE_HASH = "#availability";
  const SCHEDULE_SHARE_PATH = "/availability";

  const JAPAN_TIMEZONE = "Asia/Tokyo";
  const JAPAN_WEEKLY_AVAILABILITY = {
    0: { label: "Sunday", note: "Japanese Sundays are unavailable.", slots: [] },
    1: {
      label: "Monday",
      slots: [
        [[10, 0], [11, 0]],
        [[11, 15], [12, 15]],
        [[12, 30], [13, 30]],
        [[13, 45], [14, 45]],
        [[22, 0], [23, 0]],
      ],
    },
    2: {
      label: "Tuesday",
      slots: [
        [[12, 15], [13, 15]],
        [[13, 30], [14, 30]],
        [[21, 15], [22, 15]],
      ],
    },
    3: {
      label: "Wednesday",
      slots: [
        [[11, 15], [12, 15]],
        [[12, 30], [13, 30]],
        [[13, 45], [14, 45]],
        [[15, 0], [16, 0]],
        [[21, 15], [22, 15]],
      ],
    },
    4: { label: "Thursday", note: "Thursday sometimes opens up — ask me directly.", slots: [] },
    5: {
      label: "Friday",
      slots: [
        [[11, 15], [12, 15]],
        [[12, 30], [13, 30]],
        [[13, 45], [14, 45]],
      ],
    },
    6: {
      label: "Saturday",
      note: "Makeup day for missed lessons.",
      slots: [
        [[10, 0], [11, 15]],
        [[11, 30], [12, 30]],
        [[12, 45], [13, 45]],
        [[21, 15], [22, 15]],
      ],
    },
  };

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const contactDiscordLink = document.getElementById("contact-discord-link");

  function resolveDiscordProfileUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";

    const fromUrl = value.match(/discord\.com\/users\/(\d{17,20})/i);
    if (fromUrl) return `https://discord.com/users/${fromUrl[1]}`;

    if (/^\d{17,20}$/.test(value)) return `https://discord.com/users/${value}`;

    return /^https?:\/\//i.test(value) ? value : "";
  }

  if (contactDiscordLink) {
    const profileUrl = resolveDiscordProfileUrl(window.JLM_DISCORD_PROFILE_URL);
    if (profileUrl) contactDiscordLink.href = profileUrl;
  }

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
      (jumpstartModal && !jumpstartModal.hidden) ||
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

  function closeJumpstart() {
    if (!jumpstartModal || jumpstartModal.hidden) return;
    jumpstartModal.hidden = true;
    updateModalBodyState();
    if (lastFocusedBeforeModal instanceof HTMLElement) {
      lastFocusedBeforeModal.focus();
    }
    lastFocusedBeforeModal = null;
  }

  function openJumpstart() {
    if (!jumpstartModal) return;
    lastFocusedBeforeModal = document.activeElement;
    jumpstartModal.hidden = false;
    updateModalBodyState();
    jumpstartModal.querySelector("[data-jumpstart-close]")?.focus();
  }

  function formatScheduleDate(date) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function formatJapanScheduleDate(date) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "numeric",
      day: "numeric",
      timeZone: JAPAN_TIMEZONE,
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

  function japanDateParts(date) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: JAPAN_TIMEZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      year: Number(byType.year),
      month: Number(byType.month),
      day: Number(byType.day),
    };
  }

  function addJapanDays(parts, days) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
  }

  function dateFromJapanTime(parts, hour, minute) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - 9, minute));
  }

  function japanWeekday(parts) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  }

  function scheduleShareRequested() {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    return window.location.hash === SCHEDULE_SHARE_HASH || path === SCHEDULE_SHARE_PATH;
  }

  function setScheduleShareUrl(active) {
    const base = window.location.pathname + window.location.search;
    if (active) {
      if (window.location.hash !== SCHEDULE_SHARE_HASH) {
        history.pushState({ schedule: true }, "", SCHEDULE_SHARE_HASH);
      }
      return;
    }
    if (window.location.hash === SCHEDULE_SHARE_HASH) {
      history.replaceState(null, "", base || "/");
    }
  }

  function buildScheduleDays(weekOffset) {
    const todayJapan = japanDateParts(new Date());
    const weekStart = (weekOffset || 0) * 7;
    return Array.from({ length: 7 }, (_, offset) => {
      const parts = addJapanDays(todayJapan, weekStart + offset);
      const weekday = japanWeekday(parts);
      const availability = JAPAN_WEEKLY_AVAILABILITY[weekday] || JAPAN_WEEKLY_AVAILABILITY[0];
      const slots = availability.slots.map(([start, end]) => {
        const startDate = dateFromJapanTime(parts, start[0], start[1]);
        const endDate = dateFromJapanTime(parts, end[0], end[1]);
        return {
          available: true,
          localDateLabel: formatScheduleDate(startDate),
          localTimeLabel: formatScheduleTime(startDate) + "–" + formatScheduleTime(endDate),
          japanTimeLabel:
            availability.label +
            " " +
            String(start[0]).padStart(2, "0") +
            ":" +
            String(start[1]).padStart(2, "0") +
            "–" +
            String(end[0]).padStart(2, "0") +
            ":" +
            String(end[1]).padStart(2, "0") +
            " JST",
        };
      });

      return {
        dateBubbleLabel: formatJapanScheduleDate(dateFromJapanTime(parts, 12, 0)),
        japanDateLabel: formatJapanScheduleDate(dateFromJapanTime(parts, 12, 0)),
        japanDayLabel: availability.label,
        note: availability.note || "",
        slots,
      };
    });
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
      selectedScheduleSlot.localDateLabel +
      " at " +
      selectedScheduleSlot.localTimeLabel +
      " (" +
      timezoneLabel() +
      "). Japan time: " +
      selectedScheduleSlot.japanTimeLabel +
      ".";
    scheduleUseBtn.disabled = false;
  }

  function renderScheduleSlots() {
    if (!scheduleSlotOptions) return;
    scheduleSlotOptions.innerHTML = "";
    selectedScheduleSlot = null;

    if (selectedScheduleDateIndex == null) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lesson-scheduler-slot lesson-scheduler-slot--unavailable";
      btn.textContent = "Select a date to see available times.";
      btn.disabled = true;
      btn.setAttribute("aria-pressed", "false");
      scheduleSlotOptions.appendChild(btn);
      updateScheduleSelected();
      return;
    }

    const day =
      buildScheduleDays(scheduleWeekOffset)[selectedScheduleDateIndex] ||
      buildScheduleDays(scheduleWeekOffset)[0];

    if (!day.slots.length) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lesson-scheduler-slot lesson-scheduler-slot--unavailable";
      btn.textContent = day.note || "No preset availability";
      btn.disabled = true;
      btn.setAttribute("aria-pressed", "false");
      scheduleSlotOptions.appendChild(btn);
      updateScheduleSelected();
      return;
    }

    if (day.note) {
      const note = document.createElement("p");
      note.className = "lesson-scheduler-note";
      note.textContent = day.note;
      scheduleSlotOptions.appendChild(note);
    }

    day.slots.forEach((slot) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lesson-scheduler-slot";
      btn.textContent = slot.localTimeLabel;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        if (selectedScheduleSlot === slot) {
          btn.setAttribute("aria-pressed", "false");
          selectedScheduleSlot = null;
          updateScheduleSelected();
          return;
        }

        scheduleSlotOptions.querySelectorAll(".lesson-scheduler-slot").forEach((slotBtn) => {
          slotBtn.setAttribute("aria-pressed", "false");
        });
        btn.setAttribute("aria-pressed", "true");
        selectedScheduleSlot = slot;
        updateScheduleSelected();
      });
      scheduleSlotOptions.appendChild(btn);
    });

    updateScheduleSelected();
  }

  function updateScheduleWeekNav() {
    const todayJapan = japanDateParts(new Date());
    const weekStart = scheduleWeekOffset * 7;
    const startParts = addJapanDays(todayJapan, weekStart);
    const endParts = addJapanDays(todayJapan, weekStart + 6);
    if (scheduleWeekRange) {
      scheduleWeekRange.textContent =
        formatScheduleDate(dateFromJapanTime(startParts, 12, 0)) +
        " – " +
        formatScheduleDate(dateFromJapanTime(endParts, 12, 0));
    }
    if (scheduleWeekPrev) scheduleWeekPrev.disabled = scheduleWeekOffset <= 0;
  }

  function changeScheduleWeek(delta) {
    const next = scheduleWeekOffset + delta;
    if (next < 0) return;
    scheduleWeekOffset = next;
    selectedScheduleDateIndex = 0;
    selectedScheduleSlot = null;
    updateScheduleWeekNav();
    renderScheduleDates();
  }

  function renderScheduleDates() {
    if (!scheduleDateOptions) return;
    scheduleDateOptions.innerHTML = "";
    const scheduleDays = buildScheduleDays(scheduleWeekOffset);
    scheduleDays.forEach((day, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "lesson-scheduler-date" + (day.slots.length ? "" : " lesson-scheduler-date--unavailable");
      btn.textContent = day.dateBubbleLabel;
      btn.setAttribute("aria-pressed", index === selectedScheduleDateIndex ? "true" : "false");
      btn.addEventListener("click", () => {
        const isSelected = selectedScheduleDateIndex === index;
        selectedScheduleDateIndex = isSelected ? null : index;
        scheduleDateOptions.querySelectorAll(".lesson-scheduler-date").forEach((dateBtn) => {
          dateBtn.setAttribute("aria-pressed", "false");
        });
        btn.setAttribute("aria-pressed", isSelected ? "false" : "true");
        renderScheduleSlots();
      });
      scheduleDateOptions.appendChild(btn);
    });
    renderScheduleSlots();
  }

  function closeSchedule(fromHashChange) {
    if (!scheduleModal || scheduleModal.hidden) return;
    scheduleModal.hidden = true;
    updateModalBodyState();
    if (!fromHashChange) setScheduleShareUrl(false);
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
    setScheduleShareUrl(true);
    if (scheduleTimezone) {
      scheduleTimezone.textContent = "Timezone: " + timezoneLabel();
    }
    updateScheduleWeekNav();
    renderScheduleDates();
    scheduleModal.querySelector("[data-schedule-close]")?.focus();
  }

  function useSelectedSchedule() {
    if (!selectedScheduleSlot) return;
    const line =
      "Preferred time: " +
      selectedScheduleSlot.localDateLabel +
      " at " +
      selectedScheduleSlot.localTimeLabel +
      " (" +
      timezoneLabel() +
      "). Japan time: " +
      selectedScheduleSlot.japanTimeLabel +
      ".";
    if (messageField) {
      messageField.value = messageField.value.trim()
        ? messageField.value.trim() + "\n\n" + line
        : line;
    }
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
    closeJumpstart();
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

  jumpstartOpenBtns.forEach((btn) => {
    btn.addEventListener("click", openJumpstart);
  });

  jumpstartCloseBtns.forEach((btn) => {
    btn.addEventListener("click", closeJumpstart);
  });

  scheduleOpenBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      closeMenu();
      openSchedule();
    });
  });

  scheduleCloseBtns.forEach((btn) => {
    btn.addEventListener("click", () => closeSchedule(false));
  });

  scheduleUseBtn?.addEventListener("click", useSelectedSchedule);

  scheduleWeekPrev?.addEventListener("click", () => changeScheduleWeek(-1));
  scheduleWeekNext?.addEventListener("click", () => changeScheduleWeek(1));

  window.addEventListener("hashchange", () => {
    if (scheduleShareRequested()) {
      if (scheduleModal?.hidden) openSchedule();
      return;
    }
    if (scheduleModal && !scheduleModal.hidden) closeSchedule(true);
  });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href");
      if (!id || id === "#" || id === "#top") return;
      if (id === SCHEDULE_SHARE_HASH) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      preselectService(link.getAttribute("data-service"));
      scrollToSection(target);
      history.replaceState(null, "", id);
    });
  });

  if (scheduleShareRequested()) {
    if (window.location.pathname.replace(/\/$/, "") === SCHEDULE_SHARE_PATH) {
      history.replaceState({ schedule: true }, "", SCHEDULE_SHARE_HASH);
    }
    openSchedule();
  }

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
