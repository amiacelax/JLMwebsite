/**
 * Homework Hub v5 — post-submission completion zone (mock preview).
 */
(function (global) {
  "use strict";

  const STORAGE = {
    status: "jlm-hw-v5-demo-status",
    answers: "jlm-hw-v5-demo-answers",
    account: "jlm-hw-v5-demo-account",
    tab: "jlm-hw-v5-demo-tab",
  };

  const DEMO_ASSIGNMENT_URL = "/homework/assignments/sheet-uxrsqyd.json";

  const TIER_PLANS = {
    basic: {
      title: "Basic",
      price: 5,
      tip: "Homework once per month with written feedback.",
      detail: "basic",
      featured: false,
      video: false,
    },
    premium: {
      title: "Premium",
      price: 20,
      tip: "Four assignments per month, written feedback, AI tutor, and full game access.",
      detail: "premium",
      featured: true,
      badge: "Popular",
      video: false,
    },
    ultra: {
      title: "Ultra",
      price: 49,
      tip: "Four assignments per month with personal video feedback from JD on each.",
      detail: "ultra",
      featured: false,
      badge: "Video",
      video: true,
    },
  };

  const TIER_DETAIL_TITLES = {
    basic: "Basic — $5/mo",
    premium: "Premium — $20/mo",
    ultra: "Ultra — $49/mo",
  };

  const DEMO_ACCOUNTS = {
    noplan: {
      username: "noplan",
      displayName: "Alex",
      role: "student",
      accountLabel: "homework_only",
      tier: "pending",
    },
    hw_basic: {
      username: "demo",
      displayName: "Alex",
      role: "student",
      accountLabel: "homework_only",
      tier: "tier1",
    },
    hw_premium: {
      username: "demo",
      displayName: "Alex",
      role: "student",
      accountLabel: "homework_only",
      tier: "tier2",
    },
    hw_ultra: {
      username: "demo",
      displayName: "Alex",
      role: "student",
      accountLabel: "homework_only",
      tier: "tier3",
    },
    student_no_hw: {
      username: "demo",
      displayName: "Alex",
      role: "student",
      accountLabel: "current_student",
      tier: "student_special",
    },
    student_lessons: {
      username: "demo",
      displayName: "Alex",
      role: "student",
      accountLabel: "current_student",
      tier: "tier2",
    },
  };

  const LOCK_SVG =
    '<span class="course-card__lock" aria-hidden="true">' +
    '<svg class="course-card__lock-svg course-card__lock-svg--locked" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' +
    '<svg class="course-card__lock-svg course-card__lock-svg--unlocked" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path class="course-card__lock-shackle" d="M8 11V7a4 4 0 0 1 8 0"/></svg>' +
    "</span>";

  let demoAssignment = null;
  let worksheetForm = null;
  let tierDetailBound = false;

  const MOCK = {
    lessonUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessonMeta: "2026-06-17 ・ よく ・ あまり",
    history: [
      { title: "May 28 — たい form", date: "May 30" },
      { title: "May 14 — は vs が", date: "May 16" },
      { title: "Apr 30 — Counters", date: "May 2" },
    ],
    feedbackNote:
      "Nice work on よく! Watch あまり — it always pairs with a negative (ません / ない).",
  };

  function readStorage(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }

  function getDemoStatus() {
    return readStorage(STORAGE.status, "submitted");
  }

  function isCompleteView(status) {
    return status === "submitted" || status === "reviewed";
  }

  function setDemoStatus(status) {
    writeStorage(STORAGE.status, status);
    renderAll();
  }

  function getDemoAccountKey() {
    return readStorage(STORAGE.account, "noplan");
  }

  function setDemoAccountKey(key) {
    writeStorage(STORAGE.account, key);
    renderAll();
  }

  function getPreviewSession() {
    const key = getDemoAccountKey();
    const preset = DEMO_ACCOUNTS[key] || DEMO_ACCOUNTS.noplan;
    const tierMeta = global.HwAuth?.TIERS?.[preset.tier] || global.HwAuth?.TIERS?.pending;
    return {
      ...preset,
      tierDisplay: tierMeta?.name || "No plan yet",
      accountLabelDisplay:
        global.HwAuth?.ACCOUNT_LABELS?.[preset.accountLabel] || preset.accountLabel,
      videoResponseUnlock: preset.tier === "tier3",
      courses: [],
      source: "local",
    };
  }

  const TAB_IDS = ["homework", "lessons", "mistakes", "notifications", "games"];

  const TAB_ALIASES = {
    lesson: "lessons",
    study: "mistakes",
    more: "notifications",
  };

  function normalizeTabId(tabId) {
    const key = String(tabId || "").trim().toLowerCase();
    const mapped = TAB_ALIASES[key] || key;
    return TAB_IDS.includes(mapped) ? mapped : "homework";
  }

  function isMobileTabs() {
    return global.matchMedia("(max-width: 767px)").matches;
  }

  function setActiveTab(tabId, options) {
    const app = document.getElementById("hw-v5-app");
    if (!app) return;

    const tab = normalizeTabId(tabId);
    app.dataset.v5ActiveTab = tab;

    document.querySelectorAll("[data-v5-tab]").forEach((btn) => {
      const active = btn.getAttribute("data-v5-tab") === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    applyTabPanels(tab);

    if (options?.scrollTop) {
      app.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function applyTabPanels(tab) {
    const homeworkPanel = document.getElementById("hw-v5-panel-homework");
    const belowPanels = document.querySelectorAll("#hw-v5-below [data-v5-panel]");
    const activeTab = normalizeTabId(tab);

    if (!isMobileTabs()) {
      homeworkPanel?.classList.add("is-active");
      homeworkPanel?.removeAttribute("hidden");
      belowPanels.forEach((panel) => {
        panel.classList.add("is-active");
        panel.removeAttribute("hidden");
      });
      return;
    }

    const onHomework = activeTab === "homework";
    homeworkPanel?.classList.toggle("is-active", onHomework);
    if (onHomework) homeworkPanel?.removeAttribute("hidden");
    else homeworkPanel?.setAttribute("hidden", "");

    belowPanels.forEach((panel) => {
      const active = panel.getAttribute("data-v5-panel") === activeTab;
      panel.classList.toggle("is-active", active);
      if (active) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });
  }

  function initMobileTabs() {
    try {
      localStorage.removeItem(STORAGE.tab);
    } catch {
      /* ignore */
    }
    setActiveTab("homework");
    global.matchMedia("(max-width: 767px)").addEventListener("change", () => {
      setActiveTab(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab || "homework");
    });
  }

  function bindMobileTabs() {
    document.querySelectorAll("[data-v5-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setActiveTab(btn.getAttribute("data-v5-tab") || "homework", { scrollTop: true });
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function priceAria(amount) {
    const words = {
      5: "five",
      10: "ten",
      20: "twenty",
      49: "forty-nine",
    };
    const w = words[amount] || String(amount);
    return "Price: " + w + " dollars per month";
  }

  function bindTierDetailModal() {
    if (tierDetailBound) return;
    const modal = document.getElementById("hw-tier-detail-modal");
    if (!modal) return;
    tierDetailBound = true;

    const title = document.getElementById("hw-tier-detail-title");
    const panels = modal.querySelectorAll("[data-tier-detail-panel]");
    const closeEls = modal.querySelectorAll("[data-hw-tier-detail-close]");

    function closeModal() {
      modal.hidden = true;
      document.body.classList.remove("hw-modal-open");
    }

    function openModal(tierId) {
      const panel = document.getElementById("hw-tier-detail-" + tierId);
      if (!panel) return;
      panels.forEach((p) => {
        p.hidden = p !== panel;
      });
      if (title) title.textContent = TIER_DETAIL_TITLES[tierId] || "Plan details";
      modal.hidden = false;
      document.body.classList.add("hw-modal-open");
      modal.querySelector("[data-hw-tier-detail-close]")?.focus();
    }

    closeEls.forEach((el) => el.addEventListener("click", closeModal));
    document.addEventListener("keydown", (e) => {
      if (!modal.hidden && e.key === "Escape") closeModal();
    });

    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-hw-tier-detail]");
      if (!trigger || !document.getElementById("hw-v5-sellup")?.contains(trigger)) return;
      e.preventDefault();
      openModal(trigger.getAttribute("data-hw-tier-detail") || "");
    });
  }

  function buildTierCard(planId) {
    const plan = TIER_PLANS[planId];
    if (!plan) return null;

    const article = document.createElement("article");
    article.className =
      "course-card course-card--locked hw-hub-tier-plan" +
      (plan.featured ? " hw-hub-tier-plan--featured" : "") +
      (plan.video ? " hw-hub-tier-plan--video" : "");
    article.setAttribute("data-hw-tier-plan", planId);
    article.setAttribute("data-hw-tier-detail", plan.detail);
    article.tabIndex = 0;

    let inner = "";
    if (plan.badge) {
      inner +=
        '<p class="hw-hub-tier-plan__badge' +
        (plan.video ? " hw-hub-tier-plan__badge--video" : "") +
        '">' +
        escapeHtml(plan.badge) +
        "</p>";
    }
    inner += LOCK_SVG;
    inner += "<h3 class=\"course-card__title\">" + escapeHtml(plan.title) + "</h3>";
    inner += '<p class="hw-hub-tier-tip" role="tooltip">' + escapeHtml(plan.tip) + "</p>";
    inner +=
      '<div class="course-card__footer">' +
      '<button type="button" class="course-card__status" data-hw-tier-detail="' +
      escapeHtml(plan.detail) +
      '" aria-label="View ' +
      escapeHtml(plan.title) +
      ' plan details">' +
      '<span class="course-card__status-text course-card__status-text--locked">LOCKED</span>' +
      '<span class="course-card__status-text course-card__status-text--unlock">UNLOCK?</span>' +
      "</button>" +
      '<span class="course-card__price" aria-label="' +
      escapeHtml(priceAria(plan.price)) +
      '">$' +
      plan.price +
      '<span class="course-card__price-suffix">/mo</span></span>' +
      "</div>";

    article.innerHTML = inner;
    return article;
  }

  function buildWeeklyHomeworkCard() {
    const price = global.HwAuth?.WEEKLY_HOMEWORK_UPGRADE_PRICE || 10;
    const article = document.createElement("article");
    article.className =
      "course-card course-card--locked hw-addon-card hw-hub-v5-sellup-card hw-hub-v5-sellup-card--weekly";
    article.tabIndex = 0;
    article.innerHTML =
      LOCK_SVG +
      "<h3 class=\"course-card__title\">Weekly homework</h3>" +
      '<p class="course-card__desc">Student Special add-on — Premium-level HW on top of your lesson plan.</p>' +
      '<div class="course-card__footer">' +
      '<button type="button" class="course-card__status" data-hw-v5-weekly-upgrade aria-label="Add weekly homework for ' +
      price +
      ' dollars per month">' +
      '<span class="course-card__status-text course-card__status-text--locked">LOCKED</span>' +
      '<span class="course-card__status-text course-card__status-text--unlock">UNLOCK?</span>' +
      "</button>" +
      '<span class="course-card__price" aria-label="' +
      escapeHtml(priceAria(price)) +
      '">$' +
      price +
      '<span class="course-card__price-suffix">/mo</span></span>' +
      "</div>";
    article.querySelector("[data-hw-v5-weekly-upgrade]")?.addEventListener("click", () => {
      alert(
        "Weekly homework add-on ($" +
          price +
          "/mo) — PayPal coming soon. Message JD to sign up."
      );
    });
    return article;
  }

  function buildLessonsCard() {
    const article = document.createElement("article");
    article.className =
      "course-card hw-hub-v5-sellup-card hw-hub-v5-sellup-card--lessons hw-platform-card";
    article.innerHTML =
      "<h3 class=\"course-card__title\">Private lessons</h3>" +
      '<p class="course-card__desc">Live coaching with JD — pairs with Homework Hub or stands on its own.</p>' +
      '<div class="course-card__footer hw-hub-v5-sellup-card__footer">' +
      '<a class="btn btn--primary btn--full btn--sm" href="/#contact" data-service="Private lessons">Ask about lessons</a>' +
      '<a class="btn btn--ghost btn--full btn--sm" href="/courses.html">Browse courses</a>' +
      "</div>";
    return article;
  }

  function sellupCaptionText(variant) {
    if (variant === "upgrade-lessons") {
      return "Let\u2019s keep learning \u2014 upgrade or take lessons";
    }
    if (variant === "weekly") {
      return "Level up your lesson plan \u2014 add weekly homework";
    }
    if (variant === "tiers") {
      return "Want more from Homework Hub? \u2014 pick your next tier";
    }
    if (variant === "lessons") {
      return "Ready for live coaching? \u2014 lessons pair perfectly with HW";
    }
    return "";
  }

  function pickSellupVariant(offers) {
    const hasTiers = offers.some((o) => o.kind === "tier");
    const hasWeekly = offers.some((o) => o.kind === "weekly_homework");
    const hasLessons = offers.some((o) => o.kind === "lessons");
    if (hasWeekly) return "weekly";
    if (hasTiers && hasLessons) return "upgrade-lessons";
    if (hasTiers) return "tiers";
    if (hasLessons) return "lessons";
    return "";
  }

  function renderCompleteCard(status) {
    const pending = document.getElementById("hw-v5-pending-note");
    const title = document.getElementById("hw-v5-complete-title");
    if (pending) pending.hidden = status !== "submitted";
    if (title) {
      title.textContent =
        status === "reviewed"
          ? "JD reviewed your assignment!"
          : "You've finished your assignment!";
    }
  }

  function renderSellup() {
    const mount = document.getElementById("hw-v5-sellup");
    const caption = document.getElementById("hw-v5-sellup-caption");
    const frame = document.getElementById("hw-v5-sellup-frame");
    if (!mount) return;

    const session = getPreviewSession();
    const offers = global.HwAuth?.getPostSubmitSellupOffers?.(session) || [];
    mount.replaceChildren();
    const show = offers.length > 0;
    mount.hidden = !show;

    if (caption) {
      caption.hidden = !show;
      caption.textContent = show ? sellupCaptionText(pickSellupVariant(offers)) : "";
    }
    if (frame) frame.hidden = !show;

    offers.forEach((offer) => {
      let node = null;
      if (offer.kind === "tier") node = buildTierCard(offer.plan);
      else if (offer.kind === "weekly_homework") node = buildWeeklyHomeworkCard();
      else if (offer.kind === "lessons") node = buildLessonsCard();
      if (node) mount.appendChild(node);
    });

    bindTierDetailModal();
    global.HwCheckout?.bindCheckoutControls?.(mount);
  }

  async function loadDemoAssignment() {
    if (demoAssignment) return demoAssignment;
    const res = await fetch(DEMO_ASSIGNMENT_URL);
    if (!res.ok) throw new Error("Could not load demo worksheet.");
    let data = await res.json();
    if (global.HwWorksheet?.enrichAssignmentMedia) {
      data = global.HwWorksheet.enrichAssignmentMedia(JSON.parse(JSON.stringify(data)));
    }
    demoAssignment = data;
    return demoAssignment;
  }

  function renderHistory() {
    const list = document.getElementById("hw-v5-history");
    if (!list) return;
    list.replaceChildren();
    MOCK.history.forEach((h) => {
      const li = document.createElement("li");
      li.className = "hw-hub-v2-past-list__item";
      li.innerHTML =
        "<span>" + escapeHtml(h.title) + "</span><time>" + escapeHtml(h.date) + "</time>";
      list.appendChild(li);
    });
  }

  function renderLessons() {
    const meta = document.getElementById("hw-lesson-meta");
    const lessonBtn = document.getElementById("hw-latest-lesson");
    if (meta) meta.textContent = MOCK.lessonMeta;
    if (lessonBtn) {
      lessonBtn.href = MOCK.lessonUrl;
      lessonBtn.textContent = "Watch your latest lesson";
      lessonBtn.classList.add("btn--primary");
      lessonBtn.classList.remove("btn--ghost");
    }
  }

  function renderGames() {
    const footer = document.getElementById("hw-games-hub-footer");
    if (!footer) return;
    footer.replaceChildren();
    const link = document.createElement("a");
    link.className = "btn btn--ghost btn--full btn--sm";
    link.href = "/games.html";
    link.textContent = "Open games";
    footer.appendChild(link);
  }

  function renderFeedback(status) {
    const feedback = document.getElementById("hw-v2-feedback");
    const body = document.getElementById("hw-v2-feedback-body");
    if (!feedback) return;
    const show = status === "reviewed";
    feedback.hidden = !show;
    if (body && show) body.textContent = MOCK.feedbackNote;
  }

  function renderWorksheetZone(status) {
    const worksheetCard = document.getElementById("hw-v5-worksheet-card");
    const completeCard = document.getElementById("hw-v5-complete-card");
    const pastFold = document.getElementById("hw-v5-past-fold");
    const showComplete = isCompleteView(status);

    if (worksheetCard) worksheetCard.hidden = showComplete;
    if (completeCard) completeCard.hidden = !showComplete;
    if (pastFold) pastFold.hidden = !showComplete;

    if (!showComplete && !worksheetForm) {
      void mountWorksheet();
    }
  }

  function renderDemoBar(status) {
    document.querySelectorAll("[data-v5-demo-status]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-v5-demo-status") === status);
    });
    const accountKey = getDemoAccountKey();
    document.querySelectorAll("[data-v5-demo-account]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-v5-demo-account") === accountKey);
    });
    const greet = document.getElementById("hw-platform-greet");
    if (greet) greet.textContent = getPreviewSession().displayName || "Alex";
  }

  function renderAll() {
    const status = getDemoStatus();
    renderDemoBar(status);
    renderWorksheetZone(status);
    renderCompleteCard(status);
    renderSellup();
    renderFeedback(status);
    renderLessons();
    renderGames();
    renderHistory();
    if (isMobileTabs()) {
      setActiveTab(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab || "homework");
    }
  }

  async function mountWorksheet() {
    const mount = document.getElementById("hw-v2-worksheet-mount");
    const titleEl = document.getElementById("hw-v2-title");
    if (!mount || !global.HwWorksheet?.render) return;

    try {
      const assignment = await loadDemoAssignment();
      if (titleEl) titleEl.textContent = assignment.title || "Homework";
      mount.innerHTML = "";
      worksheetForm = global.HwWorksheet.render(mount, assignment, {
        omitMetaTitle: true,
        omitMetaHint: true,
        studentMeta: {
          username: "demo",
          displayName: "Alex",
          assignmentId: assignment.id || "hub-v5-demo",
          lessonName: assignment.title || "Homework",
        },
      });

      try {
        const saved = JSON.parse(readStorage(STORAGE.answers, "{}"));
        worksheetForm.querySelectorAll(".hw-blank").forEach((el) => {
          if (el.name && saved[el.name] != null) el.value = saved[el.name];
        });
        global.HwWorksheet?.updateSubmitButtonState?.(worksheetForm);
      } catch {
        /* ignore */
      }

      worksheetForm.addEventListener("input", () => {
        const data = {};
        worksheetForm.querySelectorAll(".hw-blank").forEach((el) => {
          if (el.name) data[el.name] = el.value;
        });
        writeStorage(STORAGE.answers, JSON.stringify(data));
        const statusEl = document.getElementById("hw-save-status");
        if (statusEl) statusEl.textContent = "Saved in your browser.";
      });
    } catch {
      mount.innerHTML =
        '<p class="hw-maker-status">Could not load the よく・あまり worksheet. Refresh and try again.</p>';
    }
  }

  function bindUi() {
    document.querySelectorAll("[data-v5-demo-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setDemoStatus(btn.getAttribute("data-v5-demo-status") || "submitted");
      });
    });

    document.querySelectorAll("[data-v5-demo-account]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setDemoAccountKey(btn.getAttribute("data-v5-demo-account") || "noplan");
      });
    });

    document.getElementById("hw-v5-past-btn")?.addEventListener("click", () => {
      if (isMobileTabs()) {
        setActiveTab("homework", { scrollTop: true });
      }
      const fold = document.getElementById("hw-v5-past-fold");
      if (fold && !fold.open) fold.open = true;
      if (!isMobileTabs()) {
        fold?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    bindMobileTabs();
    initMobileTabs();
  }

  function init() {
    bindUi();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
