/**
 * Homework Hub v5 — live student hub (tabs, post-submit sellup, review zone).
 * Enabled via HwFeatureFlags.hubV5() (default on). Demo bar is local-only.
 */
(function (global) {
  "use strict";

  if (!global.__JLM_HUB_V5) return;

  function demoModeEnabled() {
    return global.HwFeatureFlags?.hubV5Demo?.() === true;
  }

  const STORAGE = {
    status: "jlm-hw-v5-live-demo-status",
    account: "jlm-hw-v5-live-demo-account",
    archiveReturnHash: "hw-v5-archive-return-hash",
  };

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

  const MOCK_FEEDBACK =
    "Nice work on よく! Watch あまり — it always pairs with a negative (ません / ない).";

  const MOCK_CLOUD_MEMOS = [
    {
      id: "demo-memo-1",
      anchor: "よく",
      text: "Pretty sure I got this one!",
    },
    {
      id: "demo-memo-2",
      anchor: "あまり",
      text: "Does this always need a negative verb?",
    },
  ];

  const TAB_IDS = ["homework", "lessons", "mistakes", "notifications", "games"];

  let shellBuilt = false;
  let tierDetailBound = false;
  let uiBound = false;
  let reviewCommentsGen = 0;
  /** Wait for platform worksheet load before showing empty/upsell shells. */
  let hubReady = false;
  /** Latest submission reviewStatus for the active assignment (from KV). */
  let liveReviewStatus = null;
  let liveReviewStatusAssignmentId = "";
  let liveReviewStatusReady = false;
  let liveReviewStatusGen = 0;
  let statusBubbleBound = false;
  let bubbleHintTimer = null;
  let bubblePointerBound = false;
  let bubbleHovering = false;
  const bubblePointer = { x: 0, y: 0 };

  function clearBubbleHintTimer() {
    if (bubbleHintTimer) {
      clearTimeout(bubbleHintTimer);
      bubbleHintTimer = null;
    }
  }

  function hideBubbleHint() {
    bubbleHovering = false;
    clearBubbleHintTimer();
    document.getElementById("hw-v5-status-bubble-hint")?.classList.remove("is-visible");
  }

  function trackBubblePointer(ev) {
    if (typeof ev?.clientX === "number") bubblePointer.x = ev.clientX;
    if (typeof ev?.clientY === "number") bubblePointer.y = ev.clientY;
  }

  function isPointerOverBubble() {
    const bubble = document.getElementById("hw-v5-status-bubble");
    if (!bubble || bubble.hidden) return false;
    const rect = bubble.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const x = bubblePointer.x;
    const y = bubblePointer.y;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function placeBubbleHint() {
    const bubble = document.getElementById("hw-v5-status-bubble");
    const hint = document.getElementById("hw-v5-status-bubble-hint");
    if (!bubble || !hint) return;
    const rect = bubble.getBoundingClientRect();
    const mobile = window.innerWidth <= 520;
    if (mobile) {
      hint.style.left = Math.round(rect.left + rect.width / 2) + "px";
      hint.style.top = Math.round(rect.top - 10) + "px";
      hint.style.transform = "translate(-50%, -100%)";
    } else {
      hint.style.left = Math.round(rect.right + 10) + "px";
      hint.style.top = Math.round(rect.top + rect.height / 2) + "px";
      hint.style.transform = "translateY(-50%)";
    }
  }

  function scheduleBubbleHint() {
    clearBubbleHintTimer();
    bubbleHovering = true;
    bubbleHintTimer = window.setTimeout(() => {
      bubbleHintTimer = null;
      if (!bubbleHovering) return;
      placeBubbleHint();
      document.getElementById("hw-v5-status-bubble-hint")?.classList.add("is-visible");
    }, 500);
  }

  function bindBubblePointerTrack() {
    if (bubblePointerBound) return;
    bubblePointerBound = true;
    document.addEventListener(
      "pointermove",
      (ev) => {
        bubblePointer.x = ev.clientX;
        bubblePointer.y = ev.clientY;
        if (
          document
            .getElementById("hw-v5-status-bubble-hint")
            ?.classList.contains("is-visible") &&
          !isPointerOverBubble()
        ) {
          hideBubbleHint();
        }
      },
      { passive: true }
    );
  }

  function isArchiveMode() {
    return /^#hw-submission-/i.test(window.location.hash || "");
  }

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

  function getDemoAccountKey() {
    return readStorage(STORAGE.account, "noplan");
  }

  function setDemoAccountKey(key) {
    writeStorage(STORAGE.account, key);
    renderAll();
  }

  function setDemoStatus(status) {
    writeStorage(STORAGE.status, status);
    renderAll();
  }

  function getActiveSession() {
    if (demoModeEnabled()) {
      const key = getDemoAccountKey();
      if (DEMO_ACCOUNTS[key]) {
        const preset = DEMO_ACCOUNTS[key];
        const tierMeta = global.HwAuth?.TIERS?.[preset.tier] || global.HwAuth?.TIERS?.pending;
        return {
          ...preset,
          tierDisplay: tierMeta?.name || "No plan yet",
          accountLabelDisplay:
            global.HwAuth?.ACCOUNT_LABELS?.[preset.accountLabel] || preset.accountLabel,
          videoResponseUnlock: preset.tier === "tier3",
          courses: [],
          source: "demo",
        };
      }
    }

    return global.HwAuth?.getSession?.() || null;
  }

  function getPreviewSession() {
    return getActiveSession() || DEMO_ACCOUNTS.noplan;
  }

  /** No HW subscription yet — homework-only pending / no active HW tier. */
  function isNoPlanAccount() {
    const session = getActiveSession();
    if (!session || session.role !== "student") return true;
    const label = session.accountLabel || "homework_only";
    const tier = session.tier || "pending";
    if (label === "current_student") return false;
    return tier === "pending" || !global.HwAuth?.hasActiveSubscription?.(session);
  }

  /** Lesson student without weekly HW add-on (Student Special / pending special). */
  function isStudentNoHwAccount() {
    const session = getActiveSession();
    return Boolean(
      session &&
        session.accountLabel === "current_student" &&
        (session.tier === "student_special" || session.tier === "pending")
    );
  }

  function isStudentLessonsAccount() {
    const session = getActiveSession();
    return Boolean(
      session &&
        session.accountLabel === "current_student" &&
        session.tier &&
        session.tier !== "student_special" &&
        session.tier !== "pending"
    );
  }

  function readCatalogAssignmentId() {
    const session = getActiveSession();
    const user = String(session?.username || "").trim().toLowerCase();
    if (!user) return "";

    try {
      const raw = sessionStorage.getItem("jlm-hw-catalog-v1");
      if (raw) {
        const cached = JSON.parse(raw);
        const id = cached?.data?.studentProfiles?.[user]?.currentHomeworkId;
        if (id) return String(id).trim();
        const mine = (cached?.data?.assignments || []).filter((entry) =>
          (entry.students || []).includes(user)
        );
        if (mine.length === 1) return String(mine[0].id || "").trim();
      }
    } catch {
      /* ignore */
    }

    try {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash && hash.startsWith("hw-") && !hash.startsWith("hw-submission-")) {
        return hash.replace(/^hw-/, "").trim();
      }
    } catch {
      /* ignore */
    }

    return "";
  }

  function getActiveAssignmentId() {
    const form = document.querySelector(
      "#hw-hub-v4-homework [data-assignment-id], #hw-hub-v4-homework form[data-assignment-id]"
    );
    const fromForm = String(form?.getAttribute("data-assignment-id") || "").trim();
    if (fromForm) return fromForm;
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.querySelector("#hw-hub-v4-homework .hw-worksheet");
    const fromMount = String(mount?.getAttribute?.("data-assignment-id") || "").trim();
    if (fromMount) return fromMount;
    return readCatalogAssignmentId();
  }

  function isWorksheetMounted() {
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    return Boolean(
      mount?.querySelector(".hw-worksheet, form.hw-worksheet, #hw-worksheet-form")
    );
  }

  function readSubmittedFlag(username, assignmentId) {
    if (!username || !assignmentId) return false;
    try {
      return Boolean(
        localStorage.getItem("jlm-hw-submitted-" + username + "-" + assignmentId)
      );
    } catch {
      return false;
    }
  }

  function readReviewedFlag(username, assignmentId) {
    if (!username || !assignmentId) return false;
    try {
      return Boolean(
        localStorage.getItem("jlm-hw-reviewed-" + username + "-" + assignmentId)
      );
    } catch {
      return false;
    }
  }

  function writeReviewedFlag(username, assignmentId) {
    if (!username || !assignmentId) return;
    try {
      localStorage.setItem("jlm-hw-reviewed-" + username + "-" + assignmentId, "1");
    } catch {
      /* ignore */
    }
  }

  async function refreshLiveReviewStatus() {
    const session = getActiveSession();
    const username = String(session?.username || "").trim().toLowerCase();
    const assignmentId = getActiveAssignmentId();
    if (!username || !assignmentId || demoModeEnabled()) return null;

    const gen = ++liveReviewStatusGen;
    try {
      const res = await fetch(
        "/api/homework-submissions?username=" + encodeURIComponent(username)
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (gen !== liveReviewStatusGen) return null;
      const subs = (Array.isArray(data.submissions) ? data.submissions : [])
        .filter(
          (entry) => entry.type === "online" && entry.assignmentId === assignmentId
        )
        .sort(
          (a, b) =>
            new Date(b.submittedAt || 0).getTime() -
            new Date(a.submittedAt || 0).getTime()
        );
      const latest = subs[0] || null;
      liveReviewStatusAssignmentId = assignmentId;
      liveReviewStatusReady = true;
      if (latest?.reviewStatus === "reviewed") {
        liveReviewStatus = "reviewed";
        writeReviewedFlag(username, assignmentId);
      } else if (latest) {
        liveReviewStatus = "submitted";
      } else {
        liveReviewStatus = null;
      }
      return liveReviewStatus;
    } catch {
      return null;
    }
  }

  function getLiveStatus() {
    const session = getActiveSession();
    const username = String(session?.username || "").trim().toLowerCase();
    const assignmentId = getActiveAssignmentId();

    /* Server is source of truth once synced for this assignment. */
    if (
      liveReviewStatusReady &&
      liveReviewStatusAssignmentId === assignmentId &&
      assignmentId
    ) {
      if (liveReviewStatus === "reviewed" || liveReviewStatus === "submitted") {
        return liveReviewStatus;
      }
      /* Server has no submission yet — keep optimistic local flags. */
      if (readReviewedFlag(username, assignmentId)) return "reviewed";
      if (readSubmittedFlag(username, assignmentId)) return "submitted";
      return "in_progress";
    }

    /* Optimistic UI right after submit, before server sync completes. */
    if (readReviewedFlag(username, assignmentId)) return "reviewed";
    if (readSubmittedFlag(username, assignmentId)) return "submitted";
    return "in_progress";
  }

  function getHubStatus() {
    if (demoModeEnabled()) {
      return readStorage(STORAGE.status, "in_progress");
    }
    return getLiveStatus();
  }

  function isCompleteView(status) {
    return status === "submitted" || status === "reviewed";
  }

  function isUltraTier() {
    const session = getActiveSession();
    return session?.tier === "tier3";
  }

  function getSellupOffers() {
    if (demoModeEnabled()) {
      const key = getDemoAccountKey();
      if (key === "student_no_hw") {
        return [{ kind: "weekly_homework", studentSpecial: true }];
      }
      if (key === "student_lessons") {
        return [
          { kind: "tier", plan: "ultra" },
          { kind: "games" },
        ];
      }
    }
    return global.HwAuth?.getPostSubmitSellupOffers?.(getActiveSession()) || [];
  }

  function getSellupMountTarget() {
    if (isNoPlanAccount()) {
      return {
        mount: "hw-v5-noplan-sellup",
        caption: "hw-v5-noplan-sellup-caption",
        frame: "hw-v5-noplan-sellup-frame",
      };
    }
    if (isStudentNoHwAccount()) {
      return {
        mount: "hw-v5-no-hw-sellup",
        caption: "hw-v5-no-hw-sellup-caption",
        frame: "hw-v5-no-hw-sellup-frame",
      };
    }
    return {
      mount: "hw-v5-sellup",
      caption: "hw-v5-sellup-caption",
      frame: "hw-v5-sellup-frame",
    };
  }

  function normalizeTabId(tabId) {
    const key = String(tabId || "").trim().toLowerCase();
    const aliases = { lesson: "lessons", study: "mistakes", more: "notifications" };
    const mapped = aliases[key] || key;
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
    setActiveTab("homework");
    global.matchMedia("(max-width: 767px)").addEventListener("change", () => {
      setActiveTab(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab || "homework");
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
    const words = { 5: "five", 10: "ten", 20: "twenty", 49: "forty-nine" };
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
      document.body.classList.remove("hw-modal-open", "is-modal-open");
    }

    function openModal(tierId) {
      const panel = document.getElementById("hw-tier-detail-" + tierId);
      if (!panel) return;
      panels.forEach((p) => {
        p.hidden = p !== panel;
      });
      if (title) title.textContent = TIER_DETAIL_TITLES[tierId] || "Plan details";
      modal.hidden = false;
      document.body.classList.add("hw-modal-open", "is-modal-open");
      global.HwCheckout?.bindCheckoutControls?.(modal);
      modal.querySelector("[data-hw-tier-detail-close]")?.focus();
    }

    closeEls.forEach((el) => el.addEventListener("click", closeModal));
    document.addEventListener("keydown", (e) => {
      if (!modal.hidden && e.key === "Escape") closeModal();
    });

    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-hw-tier-detail]");
      const sellup = document.getElementById("hw-v5-sellup");
      const noplanSellup = document.getElementById("hw-v5-noplan-sellup");
      if (
        !trigger ||
        (!sellup?.contains(trigger) && !noplanSellup?.contains(trigger))
      ) {
        return;
      }
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
    inner += '<h3 class="course-card__title">' + escapeHtml(plan.title) + "</h3>";
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

  function buildWeeklyHomeworkCard(options) {
    options = options || {};
    const price = global.HwAuth?.WEEKLY_HOMEWORK_UPGRADE_PRICE || 10;
    const comparePrice = 20;
    const studentSpecial = Boolean(options.studentSpecial);
    const desc = studentSpecial
      ? "Four interactive assignments per month with written feedback from JD — priced for lesson students."
      : "Student Special add-on — Premium-level HW on top of your lesson plan.";
    let priceInner =
      "$" +
      price +
      '<span class="course-card__price-suffix">/mo</span>';
    if (studentSpecial) {
      priceInner =
        '<span class="hw-hub-v5-price-compare" aria-hidden="true">$' +
        comparePrice +
        "</span>" +
        priceInner;
    }
    const priceAriaLabel = studentSpecial
      ? "Student Special price: ten dollars per month, standalone Premium is twenty"
      : escapeHtml(priceAria(price));

    const article = document.createElement("article");
    article.className =
      "course-card course-card--locked hw-addon-card hw-hub-v5-sellup-card hw-hub-v5-sellup-card--weekly";
    article.tabIndex = 0;
    article.innerHTML =
      LOCK_SVG +
      "<h3 class=\"course-card__title\">Weekly homework</h3>" +
      '<p class="course-card__desc">' +
      escapeHtml(desc) +
      "</p>" +
      '<div class="course-card__footer">' +
      '<button type="button" class="course-card__status" data-hw-v5-weekly-upgrade aria-label="View weekly homework details">' +
      '<span class="course-card__status-text course-card__status-text--locked">LOCKED</span>' +
      '<span class="course-card__status-text course-card__status-text--unlock">UNLOCK?</span>' +
      "</button>" +
      '<span class="course-card__price" aria-label="' +
      priceAriaLabel +
      '">' +
      priceInner +
      "</span>" +
      "</div>";
    article.querySelector("[data-hw-v5-weekly-upgrade]")?.addEventListener("click", () => {
      alert(
        "Weekly homework for lesson students ($" +
          price +
          "/mo; standalone Premium is $" +
          comparePrice +
          "/mo) — message JD to add it to your plan."
      );
    });
    return article;
  }

  function buildGamesCard() {
    const article = document.createElement("article");
    article.className =
      "course-card hw-hub-v5-sellup-card hw-hub-v5-sellup-card--games hw-platform-card";
    article.innerHTML =
      "<h3 class=\"course-card__title\">Learning games 👾</h3>" +
      '<p class="course-card__desc">Keep relaxing with Japanese — full library unlocks with Ultra.</p>' +
      '<div class="course-card__footer hw-hub-v5-sellup-card__footer">' +
      '<a class="btn btn--primary btn--full btn--sm" href="/games.html">Open games</a>' +
      '<a class="btn btn--ghost btn--full btn--sm" href="/game/lantern-hunt/" target="_blank" rel="noopener noreferrer">Lantern Word Hunt</a>' +
      "</div>";
    return article;
  }

  function buildLessonsCard() {
    const article = document.createElement("article");
    article.className =
      "course-card hw-hub-v5-sellup-card hw-hub-v5-sellup-card--lessons hw-platform-card";
    article.innerHTML =
      '<h3 class="course-card__title">Private lessons</h3>' +
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
      return "Homework between lessons \u2014 Student Special pricing";
    }
    if (variant === "student_no_hw") {
      return "Homework between lessons \u2014 Student Special pricing";
    }
    if (variant === "ultra-games") {
      return "Video feedback from JD \u2014 or relax with Japanese games";
    }
    if (variant === "tiers") {
      return "Want more from Homework Hub? \u2014 pick your next tier";
    }
    if (variant === "lessons") {
      return "Ready for live coaching? \u2014 lessons pair perfectly with HW";
    }
    if (variant === "noplan") {
      return "Choose a tier to get started";
    }
    return "";
  }

  function pickSellupVariant(offers) {
    const hasTiers = offers.some((o) => o.kind === "tier");
    const hasWeekly = offers.some((o) => o.kind === "weekly_homework");
    const hasLessons = offers.some((o) => o.kind === "lessons");
    const hasGames = offers.some((o) => o.kind === "games");
    if (hasWeekly && offers.length === 1 && offers[0].studentSpecial) return "student_no_hw";
    if (hasWeekly) return "weekly";
    if (hasTiers && hasGames) return "ultra-games";
    if (hasTiers && hasLessons) return "upgrade-lessons";
    if (hasTiers) return "tiers";
    if (hasLessons) return "lessons";
    return "";
  }

  function getStudentDisplayName() {
    const session = getActiveSession();
    return session?.displayName || session?.username || "there";
  }

  function jdReviewGreeting(name) {
    const who = String(name || "there").trim() || "there";
    return "Hey " + who + "! I finished reviewing your homework.";
  }

  function ensureCompleteCard() {
    let card = document.getElementById("hw-v5-complete-card");
    if (card) return card;

    card = document.createElement("section");
    card.className = "hw-hub-v5-complete hw-hub-worksheet-card";
    card.id = "hw-v5-complete-card";
    card.hidden = true;
    card.setAttribute("aria-labelledby", "hw-v5-complete-title");
    card.innerHTML =
      '<div class="hw-hub-v5-reviewed-banner" id="hw-v5-reviewed-banner" hidden>' +
      '<section class="hw-hub-v2-feedback hw-hub-jd-memo hw-hub-jd-memo--overlap" id="hw-v2-feedback" aria-labelledby="hw-v2-feedback-body">' +
      '<div class="hw-hub-jd-memo__sheet">' +
      '<p class="hw-hub-jd-memo__body hw-hub-v2-feedback__body" id="hw-v2-feedback-body"></p>' +
      "</div></section></div>" +
      '<h2 class="hw-hub-v5-complete__title" id="hw-v5-complete-title">You\'ve finished your assignment!</h2>' +
      '<div class="hw-hub-v5-pending" id="hw-v5-pending-note" hidden>' +
      '<p class="hw-hub-v5-pending__line">' +
      '<span class="hw-hub-v5-pending__pulse" aria-hidden="true"></span>' +
      "<strong>JD is reviewing your homework now.</strong></p>" +
      '<p class="hw-hub-v5-pending__sub">He\'ll send his notes back ASAP — watch for a Discord ping.</p>' +
      "</div>" +
      '<section class="hw-hub-v5-review-zone" id="hw-v5-review-zone" hidden aria-labelledby="hw-v5-review-zone-title">' +
      '<h3 class="hw-hub-v5-review-zone__title" id="hw-v5-review-zone-title">Review your homework</h3>' +
      '<div class="hw-hub-v5-review-zone__grid">' +
      '<div class="hw-hub-v5-review-zone__block">' +
      '<p class="hw-hub-v5-review-zone__label">Your notes</p>' +
      '<div class="hw-hub-v5-review-zone__content hw-hub-v5-review-zone__content--yours" id="hw-v5-student-review-notes"></div>' +
      "</div>" +
      '<div class="hw-hub-v5-review-zone__block">' +
      '<p class="hw-hub-v5-review-zone__label">JD\u2019s notes</p>' +
      '<div class="hw-hub-v5-review-zone__content hw-hub-v5-review-zone__content--jd" id="hw-v5-jd-review-notes"></div>' +
      "</div></div>" +
      '<p class="hw-hub-v5-review-zone__soon">Full assignment review — layout coming soon.</p>' +
      "</section>" +
      '<p class="hw-hub-v5-sellup-caption" id="hw-v5-sellup-caption" hidden></p>' +
      '<div class="hw-hub-v5-sellup-frame" id="hw-v5-sellup-frame" hidden>' +
      '<div class="hw-hub-v5-sellup" id="hw-v5-sellup" aria-label="Upgrade options"></div>' +
      "</div>" +
      '<div class="hw-hub-v5-complete__actions">' +
      '<button type="button" class="btn btn--ghost btn--full" id="hw-v5-past-btn">View past assignments</button>' +
      "</div>";
    return card;
  }

  function ensureNoHwEmpty() {
    let empty = document.getElementById("hw-v5-no-hw-empty");
    if (empty) return empty;

    empty = document.createElement("section");
    empty.className = "hw-hub-v5-no-hw hw-hub-worksheet-card";
    empty.id = "hw-v5-no-hw-empty";
    empty.hidden = true;
    empty.setAttribute("aria-labelledby", "hw-v5-no-hw-title");
    empty.innerHTML =
      '<h2 class="hw-hub-v5-no-hw__title" id="hw-v5-no-hw-title">Keep the momentum between lessons</h2>' +
      '<p class="hw-hub-v5-no-hw__desc">You\u2019re on a lesson plan \u2014 add weekly homework when you want structured practice and feedback from JD between sessions.</p>' +
      '<p class="hw-hub-v5-sellup-caption" id="hw-v5-no-hw-sellup-caption" hidden></p>' +
      '<div class="hw-hub-v5-sellup-frame" id="hw-v5-no-hw-sellup-frame" hidden>' +
      '<div class="hw-hub-v5-sellup" id="hw-v5-no-hw-sellup" aria-label="Weekly homework add-on"></div>' +
      "</div>";
    return empty;
  }

  function ensureNoPlanWelcome() {
    let welcome = document.getElementById("hw-v5-noplan-welcome");
    if (welcome) return welcome;

    welcome = document.createElement("section");
    welcome.className = "hw-hub-v5-noplan hw-hub-worksheet-card";
    welcome.id = "hw-v5-noplan-welcome";
    welcome.hidden = true;
    welcome.setAttribute("aria-labelledby", "hw-v5-noplan-title");
    welcome.innerHTML =
      '<h2 class="hw-hub-v5-noplan__title" id="hw-v5-noplan-title">Your account is ready</h2>' +
      '<p class="hw-hub-v5-noplan__desc">You\u2019ve created your Homework Hub account \u2014 pick a plan below to subscribe and get your first assignment from JD.</p>' +
      '<p class="hw-hub-v5-sellup-caption" id="hw-v5-noplan-sellup-caption" hidden></p>' +
      '<div class="hw-hub-v5-sellup-frame" id="hw-v5-noplan-sellup-frame" hidden>' +
      '<div class="hw-hub-v5-sellup" id="hw-v5-noplan-sellup" aria-label="Homework Hub plans"></div>' +
      "</div>";
    return welcome;
  }

  function wrapBelowPanel(panelId, tabId, labelledBy, node) {
    const panel = document.createElement("div");
    panel.className = "hw-hub-v5-panel";
    panel.id = panelId;
    panel.dataset.v5Panel = tabId;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", labelledBy);
    panel.hidden = true;
    if (node) panel.appendChild(node);
    return panel;
  }

  function buildV5Shell() {
    if (shellBuilt) return;
    const studentOnly = document.getElementById("hw-platform-student-only");
    const v4Homework = document.getElementById("hw-hub-v4-homework");
    const studentGrid = document.getElementById("hw-student-grid");
    if (!studentOnly || !v4Homework || !studentGrid) return;

    shellBuilt = true;
    v4Homework.classList.add("hw-v5-homework-zone");

    const worksheetSection = v4Homework.querySelector(".hw-hub-v2-worksheet");
    const completeCard = ensureCompleteCard();
    const noHwEmpty = ensureNoHwEmpty();
    const noPlanWelcome = ensureNoPlanWelcome();

    const orphanFeedback = document.getElementById("hw-v2-feedback");
    if (orphanFeedback && completeCard && !completeCard.contains(orphanFeedback)) {
      orphanFeedback.remove();
    }

    const assignCard = document.getElementById("hw-current-assignment-card");
    if (assignCard) {
      assignCard.classList.add("hw-hub-v5-landing-card");
      if (worksheetSection) {
        v4Homework.insertBefore(assignCard, completeCard);
      } else {
        v4Homework.insertBefore(assignCard, v4Homework.firstChild);
      }
    }

    if (worksheetSection) {
      v4Homework.insertBefore(completeCard, worksheetSection);
      v4Homework.insertBefore(noPlanWelcome, worksheetSection);
      v4Homework.insertBefore(noHwEmpty, worksheetSection);
    } else {
      v4Homework.prepend(noHwEmpty);
      v4Homework.prepend(noPlanWelcome);
      v4Homework.prepend(completeCard);
    }

    const offlineCard = document.getElementById("hw-offline-tools-card");
    if (offlineCard && worksheetSection) {
      v4Homework.insertBefore(offlineCard, worksheetSection);
    }

    const app = document.createElement("div");
    app.className = "hw-hub-v5-app";
    app.id = "hw-v5-app";
    app.dataset.v5ActiveTab = "homework";

    const tabs = document.createElement("nav");
    tabs.className = "hw-hub-v5-tabs";
    tabs.id = "hw-v5-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Hub sections");
    tabs.innerHTML =
      '<button type="button" class="hw-hub-v5-tabs__btn is-active" role="tab" id="hw-v5-tab-homework" data-v5-tab="homework" aria-selected="true" aria-controls="hw-v5-panel-homework">HW</button>' +
      '<button type="button" class="hw-hub-v5-tabs__btn" role="tab" id="hw-v5-tab-lessons" data-v5-tab="lessons" aria-selected="false" aria-controls="hw-v5-panel-lessons">Lessons</button>' +
      '<button type="button" class="hw-hub-v5-tabs__btn" role="tab" id="hw-v5-tab-mistakes" data-v5-tab="mistakes" aria-selected="false" aria-controls="hw-v5-panel-mistakes">Mistakes</button>' +
      '<button type="button" class="hw-hub-v5-tabs__btn" role="tab" id="hw-v5-tab-notifications" data-v5-tab="notifications" aria-selected="false" aria-controls="hw-v5-panel-notifications">Notifications</button>' +
      '<button type="button" class="hw-hub-v5-tabs__btn" role="tab" id="hw-v5-tab-games" data-v5-tab="games" aria-selected="false" aria-controls="hw-v5-panel-games">Games</button>';

    const homeworkPanel = document.createElement("div");
    homeworkPanel.className = "hw-hub-v5-panel hw-hub-v5-panel--homework is-active";
    homeworkPanel.id = "hw-v5-panel-homework";
    homeworkPanel.dataset.v5Panel = "homework";
    homeworkPanel.setAttribute("role", "tabpanel");
    homeworkPanel.setAttribute("aria-labelledby", "hw-v5-tab-homework");
    homeworkPanel.appendChild(v4Homework);

    const below = document.createElement("div");
    below.className = "hw-hub-v5-below hw-platform-grid hw-platform-grid--student hw-hub-v4-below";
    below.id = "hw-v5-below";

    const gridStack = document.getElementById("hw-grid-stack");
    const mistakesCard = document.getElementById("hw-student-mistakes-card");
    const gamesCard = document.getElementById("hw-games-hub-card");
    const notifsCard = studentGrid.querySelector(".hw-grid-notifs");

    if (gridStack) {
      below.appendChild(
        wrapBelowPanel("hw-v5-panel-lessons", "lessons", "hw-v5-tab-lessons", gridStack)
      );
    }
    if (mistakesCard) {
      below.appendChild(
        wrapBelowPanel("hw-v5-panel-mistakes", "mistakes", "hw-v5-tab-mistakes", mistakesCard)
      );
    }
    if (notifsCard) {
      below.appendChild(
        wrapBelowPanel(
          "hw-v5-panel-notifications",
          "notifications",
          "hw-v5-tab-notifications",
          notifsCard
        )
      );
    }
    if (gamesCard) {
      below.appendChild(
        wrapBelowPanel("hw-v5-panel-games", "games", "hw-v5-tab-games", gamesCard)
      );
    }

    app.appendChild(tabs);
    app.appendChild(homeworkPanel);
    app.appendChild(below);

    studentOnly.insertBefore(app, studentOnly.firstChild);

    const legacySection = document.getElementById("hw-worksheet-section");
    if (legacySection) legacySection.hidden = true;

    const weeklyCard = document.getElementById("hw-weekly-upgrade-card");
    if (weeklyCard) weeklyCard.hidden = true;

    studentGrid.hidden = true;

    v4Homework.hidden = false;
  }

  function teardownStatusBubble() {
    hideBubbleHint();
    statusBubbleBound = false;
    document.getElementById("hw-v5-status-bubble-wrap")?.remove();
    document.getElementById("hw-v5-status-bubble")?.remove();
    document.getElementById("hw-v5-status-bubble-hint")?.remove();
  }

  function mountStatusBubble() {
    const bubble = document.getElementById("hw-v5-status-bubble");
    const hint = document.getElementById("hw-v5-status-bubble-hint");
    if (!bubble || !hint) return;

    bubble.hidden = false;
    const mobile = window.innerWidth <= 520;
    bubble.classList.toggle("hw-hub-v5-status-bubble--in-nav", false);
    bubble.classList.toggle("hw-hub-v5-status-bubble--in-head", !mobile);

    if (mobile) {
      if (bubble.parentElement !== document.body) document.body.appendChild(bubble);
    } else {
      const stickyHead = document.querySelector(
        "#hw-worksheet-form .hw-worksheet__slide-sticky-head"
      );
      const navRow =
        stickyHead?.querySelector(".hw-worksheet__slide-nav-row") ||
        stickyHead?.querySelector(".hw-worksheet__slide-nav")?.parentElement;
      const nav = document.querySelector("#hw-worksheet-form .hw-worksheet__slide-nav");
      if (navRow) {
        if (bubble.parentElement !== navRow) {
          navRow.insertBefore(bubble, navRow.firstChild);
        }
      } else if (stickyHead) {
        if (bubble.parentElement !== stickyHead) {
          stickyHead.insertBefore(bubble, stickyHead.firstChild);
        }
      } else if (nav?.parentElement) {
        const head = nav.parentElement;
        if (bubble.parentElement !== head) {
          head.insertBefore(bubble, head.firstChild);
        }
      } else if (bubble.parentElement !== document.body) {
        document.body.appendChild(bubble);
      }
    }

    if (hint.parentElement !== document.body) document.body.appendChild(hint);

    if (bubble.matches(":hover")) {
      scheduleBubbleHint();
    }
  }

  function ensureStatusBubble() {
    const existing = document.getElementById("hw-v5-status-bubble");
    if (existing) return existing;

    bindBubblePointerTrack();

    const bubble = document.createElement("button");
    bubble.type = "button";
    bubble.id = "hw-v5-status-bubble";
    bubble.className = "hw-hub-v5-status-bubble";
    bubble.hidden = true;
    bubble.setAttribute("aria-label", "HW under review. Return to main page");
    bubble.innerHTML =
      '<span class="hw-hub-v5-status-bubble__ring" aria-hidden="true"></span>' +
      '<span class="hw-hub-v5-status-bubble__dot" aria-hidden="true"></span>';

    const hint = document.createElement("p");
    hint.id = "hw-v5-status-bubble-hint";
    hint.className = "hw-hub-v5-status-bubble__hint";
    hint.textContent = "HW under review. Click to return to mainpage";

    document.body.appendChild(hint);
    document.body.appendChild(bubble);
    return bubble;
  }

  function bindStatusBubble() {
    const bubble = ensureStatusBubble() || document.getElementById("hw-v5-status-bubble");
    if (!bubble) return;
    if (statusBubbleBound && bubble.dataset.statusBubbleBound === "1") return;
    statusBubbleBound = true;
    bubble.dataset.statusBubbleBound = "1";
    bubble.addEventListener("click", (ev) => {
      ev.preventDefault();
      exitArchiveMode();
    });
    bubble.addEventListener("mouseenter", (ev) => {
      trackBubblePointer(ev);
      scheduleBubbleHint();
    });
    bubble.addEventListener("mouseleave", hideBubbleHint);
    bubble.addEventListener("focus", scheduleBubbleHint);
    bubble.addEventListener("blur", hideBubbleHint);
  }

  function exitArchiveMode() {
    let returnHash = "";
    try {
      returnHash = sessionStorage.getItem(STORAGE.archiveReturnHash) || "";
      sessionStorage.removeItem(STORAGE.archiveReturnHash);
    } catch {
      /* ignore */
    }

    const target = returnHash
      ? returnHash.startsWith("#")
        ? returnHash
        : "#" + returnHash
      : "";

    if (target) {
      if (window.location.hash !== target) {
        window.location.hash = target.slice(1);
      } else {
        window.location.hash = "";
        window.location.hash = target.slice(1);
      }
      return;
    }

    if (window.location.hash) {
      const url = window.location.pathname + window.location.search;
      history.replaceState(null, "", url);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }

  function renderStatusBubble(status) {
    const show = isArchiveMode() && isCompleteView(status);
    if (!show) {
      teardownStatusBubble();
      return;
    }

    ensureStatusBubble();
    bindStatusBubble();
    mountStatusBubble();

    const bubble = document.getElementById("hw-v5-status-bubble");
    const hint = document.getElementById("hw-v5-status-bubble-hint");
    if (!bubble) return;

    if (!document.querySelector("#hw-worksheet-form .hw-worksheet__slide-nav")) {
      window.requestAnimationFrame(() => mountStatusBubble());
    }

    bubble.classList.remove(
      "hw-hub-v5-status-bubble--reviewing",
      "hw-hub-v5-status-bubble--reviewed"
    );

    if (status === "reviewed") {
      bubble.classList.add("hw-hub-v5-status-bubble--reviewed");
      bubble.setAttribute("aria-label", "JD's notes are ready. Return to main page");
      if (hint) {
        hint.textContent = "JD's notes are ready. Click to return to mainpage";
      }
    } else {
      bubble.classList.add("hw-hub-v5-status-bubble--reviewing");
      bubble.setAttribute("aria-label", "HW under review. Return to main page");
      if (hint) {
        hint.textContent = "HW under review. Click to return to mainpage";
      }
    }
  }

  function renderCompleteCard(status) {
    const pending = document.getElementById("hw-v5-pending-note");
    const title = document.getElementById("hw-v5-complete-title");
    const card = document.getElementById("hw-v5-complete-card");
    const reviewed = status === "reviewed";

    if (pending) {
      pending.hidden = status !== "submitted";
      pending.classList.toggle("hw-hub-v5-pending--reviewing", status === "submitted");
    }
    const ultra = isUltraTier();
    if (title) {
      title.hidden = reviewed;
      if (!reviewed) {
        title.textContent = ultra
          ? "Submitted! You can keep practicing."
          : "You've finished your assignment!";
      }
    }
    let ultraNote = document.getElementById("hw-v5-ultra-practice-note");
    if (ultra && !reviewed) {
      if (!ultraNote && card) {
        ultraNote = document.createElement("p");
        ultraNote.id = "hw-v5-ultra-practice-note";
        ultraNote.className = "hw-hub-v5-ultra-practice-note";
        title?.insertAdjacentElement("afterend", ultraNote);
      }
      if (ultraNote) {
        ultraNote.hidden = false;
        ultraNote.textContent =
          "With Ultra, you can redo this homework as many times as you want — change your answers and submit again whenever you're ready.";
      }
    } else if (ultraNote) {
      ultraNote.hidden = true;
    }
    if (card) card.classList.toggle("hw-hub-v5-complete--reviewed", reviewed);
  }

  function renderSellup() {
    const target = getSellupMountTarget();
    const mount = document.getElementById(target.mount);
    const caption = document.getElementById(target.caption);
    const frame = document.getElementById(target.frame);
    if (!mount) return;

    const ready = hubReady || demoModeEnabled();
    /* While a student is working on assigned HW, don't replace the worksheet
       with plan upsells. Sellup still appears on the complete card after submit. */
    const workingOnAssignment =
      studentHasActiveAssignment() && !isCompleteView(getHubStatus());
    let offers = getSellupOffers();
    if (!ready) {
      offers = [];
    } else if (workingOnAssignment && (isNoPlanAccount() || isStudentNoHwAccount())) {
      offers = [];
    }
    mount.replaceChildren();
    const show = offers.length > 0;
    mount.hidden = !show;

    [
      "hw-v5-sellup",
      "hw-v5-noplan-sellup",
      "hw-v5-no-hw-sellup",
    ].forEach((id) => {
      if (id === target.mount) return;
      const otherMount = document.getElementById(id);
      if (otherMount) {
        otherMount.replaceChildren();
        otherMount.hidden = true;
      }
    });

    [
      ["hw-v5-sellup-caption", target.caption],
      ["hw-v5-noplan-sellup-caption", target.caption],
      ["hw-v5-no-hw-sellup-caption", target.caption],
    ].forEach(([id, activeId]) => {
      if (id === activeId) return;
      const otherCaption = document.getElementById(id);
      if (otherCaption) {
        otherCaption.hidden = true;
        otherCaption.textContent = "";
      }
    });

    [
      ["hw-v5-sellup-frame", target.frame],
      ["hw-v5-noplan-sellup-frame", target.frame],
      ["hw-v5-no-hw-sellup-frame", target.frame],
    ].forEach(([id, activeId]) => {
      if (id === activeId) return;
      const otherFrame = document.getElementById(id);
      if (otherFrame) otherFrame.hidden = true;
    });

    if (caption) {
      caption.hidden = !show;
      caption.textContent = show ? sellupCaptionText(pickSellupVariant(offers)) : "";
    }
    if (frame) frame.hidden = !show;

    offers.forEach((offer) => {
      let node = null;
      if (offer.kind === "tier") node = buildTierCard(offer.plan);
      else if (offer.kind === "weekly_homework") {
        node = buildWeeklyHomeworkCard({ studentSpecial: offer.studentSpecial });
      } else if (offer.kind === "lessons") node = buildLessonsCard();
      else if (offer.kind === "games") node = buildGamesCard();
      if (node) mount.appendChild(node);
    });

    bindTierDetailModal();
    global.HwCheckout?.bindCheckoutControls?.(mount);
  }

  function shouldUseDemoReviewData() {
    return demoModeEnabled();
  }

  function normalizeReviewComments(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((comment) => ({
        id: String(comment?.id || ""),
        author: String(comment?.author || "student").toLowerCase() === "teacher"
          ? "teacher"
          : "student",
        anchor: String(comment?.anchor || "").trim(),
        text: String(comment?.text || "").trim(),
        teacherRemark: String(comment?.teacherRemark || comment?.jdRemark || "").trim(),
        teacherRemarkMedia:
          comment?.teacherRemarkMedia?.id
            ? {
                id: String(comment.teacherRemarkMedia.id),
                kind:
                  comment.teacherRemarkMedia.kind === "video" ? "video" : "audio",
                mimeType: comment.teacherRemarkMedia.mimeType
                  ? String(comment.teacherRemarkMedia.mimeType)
                  : undefined,
              }
            : undefined,
        slideIndex:
          typeof comment?.slideIndex === "number" ? comment.slideIndex : undefined,
      }))
      .filter(
        (comment) =>
          comment.text ||
          comment.anchor ||
          comment.teacherRemark ||
          comment.teacherRemarkMedia ||
          comment.author === "teacher"
      );
  }

  function readLocalReviewComments(username, assignmentId) {
    if (!username || !assignmentId) return [];
    try {
      const raw = localStorage.getItem(
        "jlm-hw-comments-" + username + "-" + assignmentId
      );
      if (!raw) return [];
      return normalizeReviewComments(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  async function fetchReviewComments() {
    const session = getActiveSession();
    const username = String(session?.username || "").trim().toLowerCase();
    const assignmentId = getActiveAssignmentId();
    const preferSubmission =
      getHubStatus() === "reviewed" || liveReviewStatus === "reviewed";

    async function fromSubmission() {
      if (!username || !assignmentId) return [];
      try {
        const res = await fetch(
          "/api/homework-submissions?username=" + encodeURIComponent(username)
        );
        if (!res.ok) return [];
        const data = await res.json();
        const subs = (Array.isArray(data.submissions) ? data.submissions : [])
          .filter(
            (entry) =>
              entry.type === "online" && entry.assignmentId === assignmentId
          )
          .sort(
            (a, b) =>
              new Date(b.submittedAt || 0).getTime() -
              new Date(a.submittedAt || 0).getTime()
          );
        return normalizeReviewComments(subs[0]?.comments);
      } catch {
        return [];
      }
    }

    if (preferSubmission) {
      const submitted = await fromSubmission();
      if (submitted.length) return submitted;
    }

    if (global.HwHomeworkComments?.getCommentsForSubmit) {
      const live = normalizeReviewComments(global.HwHomeworkComments.getCommentsForSubmit());
      if (live.length && !preferSubmission) return live;
    }

    if (username && assignmentId) {
      if (!preferSubmission) {
        const local = readLocalReviewComments(username, assignmentId);
        if (local.length) return local;

        try {
          const res = await fetch(
            "/api/homework-comments-draft?username=" +
              encodeURIComponent(username) +
              "&assignmentId=" +
              encodeURIComponent(assignmentId)
          );
          if (res.ok) {
            const data = await res.json();
            const draft = normalizeReviewComments(data.draft?.comments);
            if (draft.length) return draft;
          }
        } catch {
          /* ignore */
        }
      }

      const submitted = await fromSubmission();
      if (submitted.length) return submitted;
    }

    if (shouldUseDemoReviewData()) return normalizeReviewComments(MOCK_CLOUD_MEMOS);
    return [];
  }

  function renderReviewEmpty(container, message) {
    if (!container) return;
    container.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "hw-hub-v5-review-zone__empty";
    empty.textContent = message;
    container.appendChild(empty);
  }

  function renderYourReviewNotes(container, comments) {
    if (!container) return;
    container.replaceChildren();
    const yours = comments.filter((c) => c.author !== "teacher");
    if (!yours.length) {
      renderReviewEmpty(container, "No cloud memos on this assignment yet.");
      return;
    }

    yours.forEach((comment) => {
      const item = document.createElement("article");
      item.className = "hw-hub-v5-review-memo";
      if (comment.anchor) {
        const anchor = document.createElement("p");
        anchor.className = "hw-hub-v5-review-memo__anchor";
        anchor.textContent = "\u201c" + comment.anchor + "\u201d";
        item.appendChild(anchor);
      }
      const text = document.createElement("p");
      text.className = "hw-hub-v5-review-memo__text";
      text.textContent = comment.text || "(No note text)";
      item.appendChild(text);
      container.appendChild(item);
    });
  }

  function renderJdReviewNotes(container, comments) {
    if (!container) return;
    container.replaceChildren();

    const studentNotes = comments.filter((c) => c.author !== "teacher");
    const teacherNotes = comments.filter((c) => c.author === "teacher" && c.text);
    const hasAnyRemark =
      studentNotes.some((c) => c.teacherRemark || c.teacherRemarkMedia) || teacherNotes.length > 0;

    if (!studentNotes.length && !teacherNotes.length) {
      renderReviewEmpty(container, "JD\u2019s remarks will appear here after review.");
      return;
    }

    studentNotes.forEach((comment, index) => {
      const item = document.createElement("article");
      item.className = "hw-hub-v5-review-memo hw-hub-v5-review-memo--jd";
      if (comment.anchor) {
        const anchor = document.createElement("p");
        anchor.className = "hw-hub-v5-review-memo__anchor";
        anchor.textContent = "\u201c" + comment.anchor + "\u201d";
        item.appendChild(anchor);
      }

      const memoLabel = document.createElement("p");
      memoLabel.className = "hw-hub-v5-review-memo__subhead";
      memoLabel.textContent = "Cloud memo";
      item.appendChild(memoLabel);

      const memoText = document.createElement("p");
      memoText.className = "hw-hub-v5-review-memo__text";
      memoText.textContent = comment.text || "(No note text)";
      item.appendChild(memoText);

      const remarkLabel = document.createElement("p");
      remarkLabel.className = "hw-hub-v5-review-memo__subhead hw-hub-v5-review-memo__subhead--jd";
      remarkLabel.textContent = "JD\u2019s remark";
      item.appendChild(remarkLabel);

      const remark = document.createElement("p");
      remark.className = "hw-hub-v5-review-memo__remark";
      const teacherRemark = comment.teacherRemark;
      if (teacherRemark) {
        remark.textContent = teacherRemark;
      } else if (!comment.teacherRemarkMedia) {
        if (shouldUseDemoReviewData() && index === 1 && !hasAnyRemark) {
          remark.textContent = MOCK_FEEDBACK;
        } else {
          remark.classList.add("hw-hub-v5-review-memo__remark--pending");
          remark.textContent = "JD hasn\u2019t added a remark here yet.";
        }
      } else {
        remark.classList.add("hw-hub-v5-review-memo__remark--pending");
        remark.textContent = "JD left an audio/video reply below.";
      }
      item.appendChild(remark);

      if (comment.teacherRemarkMedia?.id) {
        const playback = document.createElement("div");
        playback.className = "hw-hub-v5-review-memo__playback";
        item.appendChild(playback);
        global.HwReviewMedia?.renderPlayback?.(playback, comment.teacherRemarkMedia);
      }

      container.appendChild(item);
    });

    teacherNotes.forEach((comment) => {
      const item = document.createElement("article");
      item.className = "hw-hub-v5-review-memo hw-hub-v5-review-memo--jd";
      const head = document.createElement("p");
      head.className = "hw-hub-v5-review-memo__subhead hw-hub-v5-review-memo__subhead--jd";
      head.textContent =
        typeof comment.slideIndex === "number"
          ? "JD note · question " + (comment.slideIndex + 1)
          : "JD note on a question";
      item.appendChild(head);
      const text = document.createElement("p");
      text.className = "hw-hub-v5-review-memo__remark";
      text.textContent = comment.text;
      item.appendChild(text);
      if (comment.teacherRemarkMedia?.id) {
        const playback = document.createElement("div");
        playback.className = "hw-hub-v5-review-memo__playback";
        item.appendChild(playback);
        global.HwReviewMedia?.renderPlayback?.(playback, comment.teacherRemarkMedia);
      }
      container.appendChild(item);
    });
  }

  async function populateReviewZone() {
    const yours = document.getElementById("hw-v5-student-review-notes");
    const jd = document.getElementById("hw-v5-jd-review-notes");
    if (!yours || !jd) return;

    const gen = ++reviewCommentsGen;
    yours.replaceChildren();
    jd.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "hw-hub-v5-review-zone__empty";
    loading.textContent = "Loading cloud memos\u2026";
    yours.appendChild(loading.cloneNode(true));
    jd.appendChild(loading);

    const comments = await fetchReviewComments();
    if (gen !== reviewCommentsGen) return;

    renderYourReviewNotes(yours, comments);
    renderJdReviewNotes(jd, comments);
  }

  function renderFeedback(status) {
    const banner = document.getElementById("hw-v5-reviewed-banner");
    const feedback = document.getElementById("hw-v2-feedback");
    const body = document.getElementById("hw-v2-feedback-body");
    const reviewZone = document.getElementById("hw-v5-review-zone");
    const show =
      status === "reviewed" && !isNoPlanAccount() && !isStudentNoHwAccount();

    if (banner) banner.hidden = !show;
    if (feedback) feedback.hidden = !show;
    if (reviewZone) reviewZone.hidden = !show;

    if (body && show) {
      body.textContent = jdReviewGreeting(getStudentDisplayName());
    }

    if (show) {
      void populateReviewZone();
    } else {
      reviewCommentsGen += 1;
      renderYourReviewNotes(
        document.getElementById("hw-v5-student-review-notes"),
        []
      );
      renderJdReviewNotes(document.getElementById("hw-v5-jd-review-notes"), []);
    }
  }

  function renderNoPlanWelcome(show) {
    const welcome = document.getElementById("hw-v5-noplan-welcome");
    if (welcome) welcome.hidden = !show;
    document.body.classList.toggle("hw-hub-v5-noplan-view", show);
  }

  function renderNoHwEmpty(show) {
    const empty = document.getElementById("hw-v5-no-hw-empty");
    if (empty) empty.hidden = !show;
    document.body.classList.toggle("hw-hub-v5-no-hw-view", show);
  }

  function ensureWorksheetLoadingPlaceholder() {
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    if (!mount) return;
    const intro = document.getElementById("hw-v4-worksheet-intro");
    let clearedStaleIntro = false;
    if (
      intro &&
      !intro.hidden &&
      /not allowed|could not load submission/i.test(String(intro.textContent || ""))
    ) {
      intro.textContent = "";
      intro.hidden = true;
      clearedStaleIntro = true;
    }
    if (mount.querySelector(".hw-worksheet, form.hw-worksheet, .hw-list-wait, [data-assignment-id]")) {
      return;
    }
    if (clearedStaleIntro) {
      document.dispatchEvent(new CustomEvent("hw-v5-retry-student-hub"));
    }
    if (global.HwLoading?.showListWait) {
      const wrap = document.createElement("ul");
      wrap.className = "hw-hub-v5-loading-list";
      wrap.setAttribute("aria-busy", "true");
      mount.replaceChildren(wrap);
      global.HwLoading.showListWait(wrap, { message: "Loading…" });
      return;
    }
    mount.innerHTML = '<p class="hw-worksheet-intro">Loading…</p>';
  }

  function studentHasActiveAssignment() {
    const assignmentId = getActiveAssignmentId();
    if (assignmentId) return true;

    const mount =
      document.getElementById("hw-v4-worksheet-mount") ||
      document.getElementById("hw-v2-worksheet-mount") ||
      document.querySelector("#hw-hub-v4-homework .hw-worksheet") ||
      document.getElementById("hw-worksheet-mount");
    if (mount && mount.querySelector(".hw-worksheet, form.hw-worksheet, [data-assignment-id]")) {
      return true;
    }

    const intro = document.getElementById("hw-v4-worksheet-intro");
    const introText = String(intro?.textContent || "");
    if (intro && !intro.hidden && /no assignment/i.test(introText)) {
      return false;
    }

    return Boolean(readCatalogAssignmentId());
  }

  function renderAssignmentLanding(show) {
    const assignCard = document.getElementById("hw-current-assignment-card");
    if (assignCard) assignCard.hidden = !show;
    document.body.classList.toggle("hw-hub-v5-show-landing", show);
  }

  function renderHomeworkZone(status) {
    const worksheetSection = document.querySelector(
      "#hw-hub-v4-homework .hw-hub-v2-worksheet"
    );
    const completeCard = document.getElementById("hw-v5-complete-card");
    const pastFold = document.getElementById("hw-student-past-fold");
    const offlineCard = document.getElementById("hw-offline-tools-card");
    const hasAssignment = studentHasActiveAssignment();
    const ready = hubReady || demoModeEnabled();

    /* While the platform is still loading, keep the normal Loading… /
       hourglass worksheet chrome — never flash empty/upsell shells. */
    if (!ready) {
      if (worksheetSection) worksheetSection.hidden = false;
      if (completeCard) completeCard.hidden = true;
      renderNoPlanWelcome(false);
      renderNoHwEmpty(false);
      ensureWorksheetLoadingPlaceholder();
      return;
    }

    /* Only show empty/upsell shells when there is no live worksheet.
       Assigned homework always wins over account-type messaging. */
    const showNoPlan = isNoPlanAccount() && !hasAssignment;
    const showNoHw = isStudentNoHwAccount() && !showNoPlan && !hasAssignment;
    const archive = isArchiveMode();
    const showComplete =
      !archive && isCompleteView(status) && hasAssignment && !showNoPlan && !showNoHw;
    const ultraPractice = isUltraTier();

    document.body.classList.toggle("hw-hub-v5-archive-mode", archive);

    if (worksheetSection) {
      worksheetSection.hidden = archive
        ? false
        : ((!ultraPractice && showComplete) || showNoHw || showNoPlan);
    }
    if (completeCard) completeCard.hidden = !showComplete;
    if (pastFold) pastFold.hidden = archive || !showComplete || showNoHw;
    if (offlineCard) offlineCard.hidden = archive || showComplete || showNoHw || showNoPlan;

    renderStatusBubble(status);

    renderNoPlanWelcome(showNoPlan);
    renderNoHwEmpty(showNoHw);

    const worksheetMounted = isWorksheetMounted();
    document.body.classList.toggle("hw-hub-v5-worksheet-ready", worksheetMounted);
    const showLanding =
      ready &&
      hasAssignment &&
      !showComplete &&
      !showNoPlan &&
      !showNoHw &&
      !archive &&
      !worksheetMounted;
    renderAssignmentLanding(showLanding);
    if (ready && hasAssignment && !worksheetMounted && !showComplete && !showNoPlan && !showNoHw) {
      ensureWorksheetLoadingPlaceholder();
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
  }

  let liveReviewRefreshQueued = false;

  function queueLiveReviewRefresh() {
    if (demoModeEnabled()) return;
    const assignmentId = getActiveAssignmentId();
    if (!assignmentId) return;
    if (liveReviewRefreshQueued) return;

    liveReviewRefreshQueued = true;
    const before = getHubStatus();
    void refreshLiveReviewStatus()
      .then(() => {
        liveReviewRefreshQueued = false;
        const after = getHubStatus();
        if (after !== before) renderAll();
      })
      .catch(() => {
        liveReviewRefreshQueued = false;
      });
  }

  function renderAll() {
    buildV5Shell();
    const status = getHubStatus();
    renderDemoBar(status);
    renderHomeworkZone(status);
    renderCompleteCard(status);
    renderSellup();
    renderFeedback(status);
    if (isMobileTabs()) {
      setActiveTab(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab || "homework");
    } else {
      applyTabPanels(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab || "homework");
    }
    queueLiveReviewRefresh();
  }

  function bindUi() {
    if (uiBound) return;
    uiBound = true;

    document.querySelectorAll("[data-v5-demo-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!demoModeEnabled()) return;
        setDemoStatus(btn.getAttribute("data-v5-demo-status") || "in_progress");
      });
    });

    document.querySelectorAll("[data-v5-demo-account]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!demoModeEnabled()) return;
        setDemoAccountKey(btn.getAttribute("data-v5-demo-account") || "noplan");
      });
    });

    document.addEventListener("click", (e) => {
      if (e.target.closest("#hw-v5-past-btn")) {
        e.preventDefault();
        if (global.HwStudentPast?.openPicker) {
          void global.HwStudentPast.openPicker();
          return;
        }
        if (isMobileTabs()) {
          setActiveTab("homework", { scrollTop: true });
        }
        const fold = document.getElementById("hw-student-past-fold");
        if (fold && !fold.open) fold.open = true;
        if (!isMobileTabs()) {
          fold?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });

    document.querySelectorAll("[data-v5-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setActiveTab(btn.getAttribute("data-v5-tab") || "homework", { scrollTop: true });
      });
    });

    document.addEventListener("hw-platform-student-ready", () => {
      hubReady = true;
      liveReviewRefreshQueued = false;
      liveReviewStatusReady = false;
      renderAll();
    });
    document.addEventListener("hw-platform-homework-submitted", () => {
      hubReady = true;
      liveReviewRefreshQueued = false;
      liveReviewStatusReady = false;
      renderAll();
    });

    window.addEventListener("hashchange", () => {
      renderAll();
    });
  }

  function activateChrome() {
    document.body.classList.add("hw-hub-v5-page", "hw-hub-v3-page", "hw-hub-v4-page");
    const showDemo = demoModeEnabled();
    const banner = document.getElementById("hw-v5-live-banner");
    const demoBar = document.getElementById("hw-v5-live-demo-bar");
    if (banner) {
      banner.hidden = !showDemo;
      if (!showDemo) banner.setAttribute("hidden", "");
    }
    if (demoBar) {
      demoBar.hidden = !showDemo;
      if (!showDemo) demoBar.setAttribute("hidden", "");
    }
    document.body.classList.toggle("hw-hub-v5-demo", showDemo);

    const tierPick = document.getElementById("hw-hub-tier-pick");
    if (tierPick) tierPick.hidden = true;
  }

  function init() {
    activateChrome();
    buildV5Shell();
    bindUi();
    initMobileTabs();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
