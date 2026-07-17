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
    notebookFocus: "hw-notebook-focus",
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
  /** Submission id for the reviewed worksheet open CTA. */
  let lastReviewedSubmissionId = "";
  /** Avoid auto-reopening after student returns to hub via status bubble. */
  let reviewedAutoOpenAttempted = "";
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
  /** Note-note slide deck on the reviewed complete card. */
  let reviewSlideIndex = 0;
  let reviewSlides = [];
  let reviewSlideNavBound = false;

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

  function normalizeSubmissionReviewStatus(sub) {
    if (!sub) return null;
    const raw = String(sub.reviewStatus || "").trim().toLowerCase();
    if (raw === "reviewed" || raw === "acknowledged" || raw === "submitted") return raw;
    if (sub.studentNotesAckedAt) return "acknowledged";
    if (sub.reviewedAt || sub.teacherNotesSubmittedAt) return "reviewed";
    return "submitted";
  }

  async function refreshLiveReviewStatus() {
    const session = getActiveSession();
    const username = String(session?.username || "").trim().toLowerCase();
    const assignmentId = String(getActiveAssignmentId() || "").trim();
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
          (entry) =>
            entry.type === "online" &&
            String(entry.assignmentId || "").trim() === assignmentId
        )
        .sort(
          (a, b) =>
            new Date(b.submittedAt || 0).getTime() -
            new Date(a.submittedAt || 0).getTime()
        );
      const latest = subs[0] || null;
      const status = normalizeSubmissionReviewStatus(latest);
      liveReviewStatusAssignmentId = assignmentId;
      liveReviewStatusReady = true;
      if (status === "reviewed") {
        liveReviewStatus = "reviewed";
        lastReviewedSubmissionId = String(latest.id || "");
        writeReviewedFlag(username, assignmentId);
      } else if (status === "acknowledged") {
        liveReviewStatus = "acknowledged";
        lastReviewedSubmissionId = "";
        writeReviewedFlag(username, assignmentId);
      } else if (latest) {
        liveReviewStatus = "submitted";
        lastReviewedSubmissionId = "";
      } else {
        liveReviewStatus = null;
        lastReviewedSubmissionId = "";
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
      if (
        liveReviewStatus === "reviewed" ||
        liveReviewStatus === "submitted" ||
        liveReviewStatus === "acknowledged"
      ) {
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
    return status === "submitted" || status === "reviewed" || status === "acknowledged";
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
    /* After submit/review the empty-shell cards are hidden — always mount
       sellup on the complete card when that view is active. */
    const status = getHubStatus();
    if (
      !isArchiveMode() &&
      isCompleteView(status) &&
      (studentHasActiveAssignment() ||
        status === "reviewed" ||
        status === "acknowledged")
    ) {
      return {
        mount: "hw-v5-sellup",
        caption: "hw-v5-sellup-caption",
        frame: "hw-v5-sellup-frame",
      };
    }
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
    if (card) {
      ensureReviewZoneSlideChrome(card);
      return card;
    }

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
      '<div class="hw-hub-v5-status-ping-host hw-hub-v5-status-ping-host--complete" id="hw-v5-complete-ping-host" hidden></div>' +
      '<div class="hw-hub-v5-pending" id="hw-v5-pending-note" hidden>' +
      '<p class="hw-hub-v5-pending__line">' +
      '<span class="hw-hub-v5-pending__pulse" aria-hidden="true"></span>' +
      "<strong>JD is reviewing your homework now.</strong></p>" +
      '<p class="hw-hub-v5-pending__sub">He\'ll send his notes back ASAP — watch for a Discord ping.</p>' +
      "</div>" +
      '<div class="hw-hub-v5-pending hw-hub-v5-pending--acked" id="hw-v5-acked-note" hidden>' +
      '<p class="hw-hub-v5-pending__line">' +
      '<span class="hw-hub-v5-pending__pulse" aria-hidden="true"></span>' +
      "<strong>Waiting for your next assignment.</strong></p>" +
      '<p class="hw-hub-v5-pending__sub">JD got your “done reviewing” ping — new homework will show up here when it\u2019s ready.</p>' +
      "</div>" +
      '<section class="hw-hub-v5-review-zone" id="hw-v5-review-zone" hidden aria-labelledby="hw-v5-review-zone-title">' +
      '<div class="hw-hub-v5-review-slide-head" id="hw-v5-review-slide-head">' +
      '<div class="hw-hub-v5-review-nav-row" id="hw-v5-review-nav-row">' +
      '<div class="hw-hub-v5-status-ping-host" id="hw-v5-status-ping-host" aria-hidden="false"></div>' +
      '<div class="hw-worksheet__slide-nav hw-hub-v5-review-nav" id="hw-v5-review-nav" role="navigation" aria-label="Review note navigation">' +
      '<button type="button" class="hw-worksheet__slide-btn" id="hw-v5-review-prev" aria-label="Previous note">\u2190</button>' +
      '<p class="hw-worksheet__slide-counter" id="hw-v5-review-counter" aria-live="polite">1 of 1</p>' +
      '<button type="button" class="hw-worksheet__slide-btn" id="hw-v5-review-next" aria-label="Next note">\u2192</button>' +
      "</div></div>" +
      '<h3 class="hw-hub-v5-review-zone__title" id="hw-v5-review-zone-title">Review your homework</h3>' +
      "</div>" +
      '<div class="hw-hub-v5-review-slides" id="hw-v5-review-slides"></div>' +
      '<div class="hw-hub-v5-review-zone__actions">' +
      '<button type="button" class="btn btn--primary btn--full" id="hw-v5-open-reviewed-btn">' +
      "Open reviewed worksheet</button>" +
      '<p class="hw-hub-v5-review-zone__soon">Blue = your note. Green / handwritten = JD\u2019s reply.</p>' +
      "</div>" +
      "</section>" +
      '<p class="hw-hub-v5-sellup-caption" id="hw-v5-sellup-caption" hidden></p>' +
      '<div class="hw-hub-v5-sellup-frame" id="hw-v5-sellup-frame" hidden>' +
      '<div class="hw-hub-v5-sellup" id="hw-v5-sellup" aria-label="Upgrade options"></div>' +
      "</div>" +
      '<div class="hw-hub-v5-complete__actions">' +
      '<button type="button" class="btn btn--primary btn--full" id="hw-v5-open-reviewed-btn" hidden>' +
      "Open reviewed worksheet</button>" +
      '<button type="button" class="btn btn--ghost btn--full" id="hw-v5-past-btn">Browse past homework</button>' +
      "</div>";
    return card;
  }

  function ensureReviewZoneSlideChrome(card) {
    const zone = card?.querySelector?.("#hw-v5-review-zone") || document.getElementById("hw-v5-review-zone");
    if (!zone) return;
    if (zone.querySelector("#hw-v5-review-slides")) {
      if (!document.getElementById("hw-v5-complete-ping-host") && card) {
        const host = document.createElement("div");
        host.className = "hw-hub-v5-status-ping-host hw-hub-v5-status-ping-host--complete";
        host.id = "hw-v5-complete-ping-host";
        host.hidden = true;
        const title = card.querySelector("#hw-v5-complete-title");
        if (title) title.insertAdjacentElement("afterend", host);
        else card.prepend(host);
      }
      const actions = card.querySelector(".hw-hub-v5-complete__actions");
      if (actions && !actions.querySelector("#hw-v5-open-reviewed-btn")) {
        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "btn btn--primary btn--full";
        openBtn.id = "hw-v5-open-reviewed-btn";
        openBtn.hidden = true;
        openBtn.textContent = "Open reviewed worksheet";
        actions.prepend(openBtn);
      }
      return;
    }
    const actions =
      zone.querySelector(".hw-hub-v5-review-zone__actions")?.outerHTML ||
      '<div class="hw-hub-v5-review-zone__actions">' +
        '<button type="button" class="btn btn--primary btn--full" id="hw-v5-open-reviewed-btn">' +
        "Open reviewed worksheet</button>" +
        '<p class="hw-hub-v5-review-zone__soon">Blue = your note. Green / handwritten = JD\u2019s reply.</p>' +
        "</div>";
    zone.innerHTML =
      '<div class="hw-hub-v5-review-slide-head" id="hw-v5-review-slide-head">' +
      '<div class="hw-hub-v5-review-nav-row" id="hw-v5-review-nav-row">' +
      '<div class="hw-hub-v5-status-ping-host" id="hw-v5-status-ping-host" aria-hidden="false"></div>' +
      '<div class="hw-worksheet__slide-nav hw-hub-v5-review-nav" id="hw-v5-review-nav" role="navigation" aria-label="Review note navigation">' +
      '<button type="button" class="hw-worksheet__slide-btn" id="hw-v5-review-prev" aria-label="Previous note">\u2190</button>' +
      '<p class="hw-worksheet__slide-counter" id="hw-v5-review-counter" aria-live="polite">1 of 1</p>' +
      '<button type="button" class="hw-worksheet__slide-btn" id="hw-v5-review-next" aria-label="Next note">\u2192</button>' +
      "</div></div>" +
      '<h3 class="hw-hub-v5-review-zone__title" id="hw-v5-review-zone-title">Review your homework</h3>' +
      "</div>" +
      '<div class="hw-hub-v5-review-slides" id="hw-v5-review-slides"></div>' +
      actions;
    if (!document.getElementById("hw-v5-complete-ping-host") && card) {
      const host = document.createElement("div");
      host.className = "hw-hub-v5-status-ping-host hw-hub-v5-status-ping-host--complete";
      host.id = "hw-v5-complete-ping-host";
      host.hidden = true;
      const title = card.querySelector("#hw-v5-complete-title");
      if (title) title.insertAdjacentElement("afterend", host);
      else card.prepend(host);
    }
    reviewSlideNavBound = false;
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

    try {
      v4Homework.classList.add("hw-v5-homework-zone");

      const worksheetSection = v4Homework.querySelector(".hw-hub-v2-worksheet");
      const completeCard = ensureCompleteCard();
      const noHwEmpty = ensureNoHwEmpty();
      const noPlanWelcome = ensureNoPlanWelcome();
      const notebookDiary = ensureNotebookDiary();

      const orphanFeedback = document.getElementById("hw-v2-feedback");
      if (orphanFeedback && completeCard && !completeCard.contains(orphanFeedback)) {
        orphanFeedback.remove();
      }

      /* Insert status/empty shells into the DOM first — later insertBefore
         calls need them as live children of v4Homework. */
      if (worksheetSection) {
        v4Homework.insertBefore(completeCard, worksheetSection);
        v4Homework.insertBefore(noPlanWelcome, worksheetSection);
        v4Homework.insertBefore(noHwEmpty, worksheetSection);
        v4Homework.insertBefore(notebookDiary, worksheetSection);
      } else {
        v4Homework.prepend(noHwEmpty);
        v4Homework.prepend(noPlanWelcome);
        v4Homework.prepend(completeCard);
        v4Homework.prepend(notebookDiary);
      }

      const assignCard = document.getElementById("hw-current-assignment-card");
      if (assignCard) {
        assignCard.classList.add("hw-hub-v5-landing-card");
        v4Homework.insertBefore(assignCard, completeCard);
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

      const completeCardMounted = document.getElementById("hw-v5-complete-card");
      if (!completeCardMounted) {
        throw new Error("Hub v5 complete card failed to mount");
      }

      shellBuilt = true;
      v4Homework.hidden = false;
    } catch (err) {
      console.error("[hw-hub-v5] shell build failed", err);
      shellBuilt = false;
    }
  }

  function teardownStatusBubble() {
    hideBubbleHint();
    statusBubbleBound = false;
    document.getElementById("hw-v5-status-bubble-wrap")?.remove();
    document.getElementById("hw-v5-status-bubble")?.remove();
    document.getElementById("hw-v5-status-bubble-hint")?.remove();
  }

  function mountStatusBubble(status) {
    const bubble = document.getElementById("hw-v5-status-bubble");
    const hint = document.getElementById("hw-v5-status-bubble-hint");
    if (!bubble || !hint) return;

    bubble.hidden = false;
    bubble.classList.remove(
      "hw-hub-v5-status-bubble--in-nav",
      "hw-hub-v5-status-bubble--in-head",
      "hw-hub-v5-status-bubble--dock",
      "hw-hub-v5-status-bubble--in-card",
      "hw-hub-v5-status-bubble--in-hub",
      "hw-hub-v5-status-bubble--hub-signal",
      "hw-hub-v5-status-bubble--in-diary"
    );

    const archive = isArchiveMode();
    const worksheetCard = document.querySelector(
      "#hw-hub-v4-homework .hw-hub-v2-worksheet"
    );
    const stickyHead = worksheetCard?.querySelector(".hw-worksheet__slide-sticky-head");
    const navRow = stickyHead?.querySelector(".hw-worksheet__slide-nav-row");

    /* Diary replaces the status slot — keep home ping on the notebook chrome. */
    if (notebookOpen) {
      ensureNotebookDiary();
      const diaryHost = document.getElementById("hw-v5-diary-ping-host");
      if (diaryHost) {
        bubble.classList.add(
          "hw-hub-v5-status-bubble--in-hub",
          "hw-hub-v5-status-bubble--hub-signal",
          "hw-hub-v5-status-bubble--in-diary"
        );
        if (bubble.parentElement !== diaryHost) diaryHost.appendChild(bubble);
        if (hint.parentElement !== document.body) document.body.appendChild(hint);
        if (bubble.matches(":hover")) scheduleBubbleHint();
        return;
      }
    }

    if (archive) {
      const host = navRow || stickyHead || worksheetCard;
      if (host) {
        bubble.classList.add(
          navRow
            ? "hw-hub-v5-status-bubble--in-nav"
            : stickyHead
              ? "hw-hub-v5-status-bubble--in-head"
              : "hw-hub-v5-status-bubble--in-card"
        );
        if (bubble.parentElement !== host) {
          if (navRow) host.insertBefore(bubble, host.firstChild);
          else host.appendChild(bubble);
        }
      } else {
        bubble.classList.add("hw-hub-v5-status-bubble--dock");
        if (bubble.parentElement !== document.body) document.body.appendChild(bubble);
      }
    } else {
      /* Hub complete screens: same colored ping as archive, at-a-glance status. */
      ensureCompleteCard();
      const reviewHost = document.getElementById("hw-v5-status-ping-host");
      const completeHost = document.getElementById("hw-v5-complete-ping-host");
      const reviewed = status === "reviewed";
      const host = reviewed ? reviewHost || completeHost : completeHost || reviewHost;
      if (completeHost) completeHost.hidden = reviewed;
      if (host) {
        host.hidden = false;
        bubble.classList.add(
          "hw-hub-v5-status-bubble--in-hub",
          "hw-hub-v5-status-bubble--hub-signal"
        );
        if (bubble.parentElement !== host) host.appendChild(bubble);
      } else {
        bubble.classList.add("hw-hub-v5-status-bubble--dock");
        if (bubble.parentElement !== document.body) document.body.appendChild(bubble);
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
    bubble.setAttribute("aria-label", "HW under review");
    bubble.innerHTML =
      '<span class="hw-hub-v5-status-bubble__ring" aria-hidden="true"></span>' +
      '<span class="hw-hub-v5-status-bubble__dot" aria-hidden="true"></span>';

    const hint = document.createElement("p");
    hint.id = "hw-v5-status-bubble-hint";
    hint.className = "hw-hub-v5-status-bubble__hint";
    hint.textContent = "HW under review";

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
      /* Status ping always restores hub status view (closes notebook / archive). */
      if (notebookOpen) closeNotebook();
      if (isArchiveMode()) exitArchiveMode();
      /* Full paint after exit so Past HW / complete card remount reliably. */
      renderAll();
    });
    bubble.addEventListener("mouseenter", (ev) => {
      trackBubblePointer(ev);
      scheduleBubbleHint();
    });
    bubble.addEventListener("mouseleave", hideBubbleHint);
    bubble.addEventListener("focus", scheduleBubbleHint);
    bubble.addEventListener("blur", hideBubbleHint);
  }

  function reviewedDismissStorageKey(submissionId) {
    return "hw-v5-reviewed-dismissed-" + String(submissionId || "");
  }

  function isReviewedAutoOpenDismissed(submissionId) {
    if (!submissionId) return false;
    try {
      return sessionStorage.getItem(reviewedDismissStorageKey(submissionId)) === "1";
    } catch {
      return false;
    }
  }

  function dismissReviewedAutoOpen(submissionId) {
    if (!submissionId) return;
    try {
      sessionStorage.setItem(reviewedDismissStorageKey(submissionId), "1");
    } catch {
      /* ignore */
    }
  }

  function clearReviewedAutoOpenDismiss(submissionId) {
    if (!submissionId) return;
    try {
      sessionStorage.removeItem(reviewedDismissStorageKey(submissionId));
    } catch {
      /* ignore */
    }
  }

  function exitArchiveMode() {
    const currentSubmissionId =
      (window.location.hash || "").match(/^#?hw-submission-(.+)$/i)?.[1] || "";
    if (currentSubmissionId && getHubStatus() === "reviewed") {
      dismissReviewedAutoOpen(currentSubmissionId);
    }

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
    const archive = isArchiveMode();
    const complete = isCompleteView(status);
    /* Archive, hub complete states, or notebook (home ping on diary chrome). */
    if (!archive && !complete && !notebookOpen) {
      teardownStatusBubble();
      const completeHost = document.getElementById("hw-v5-complete-ping-host");
      if (completeHost) completeHost.hidden = true;
      return;
    }

    ensureStatusBubble();
    bindStatusBubble();
    mountStatusBubble(status);
    window.requestAnimationFrame(() => mountStatusBubble(status));
    setTimeout(() => mountStatusBubble(status), 250);
    if (archive && !notebookOpen) {
      /* Worksheet chrome mounts after the past sheet loads — remount onto it. */
      setTimeout(() => mountStatusBubble(status), 900);
      setTimeout(() => mountStatusBubble(status), 1800);
    }

    const bubble = document.getElementById("hw-v5-status-bubble");
    const hint = document.getElementById("hw-v5-status-bubble-hint");
    if (!bubble) return;

    bubble.classList.remove(
      "hw-hub-v5-status-bubble--reviewing",
      "hw-hub-v5-status-bubble--reviewed",
      "hw-hub-v5-status-bubble--acked"
    );

    const homeExit = archive || notebookOpen;

    if (status === "reviewed") {
      bubble.classList.add("hw-hub-v5-status-bubble--reviewed");
      bubble.setAttribute(
        "aria-label",
        homeExit
          ? "JD’s notes are ready. Click to return to home"
          : "Homework reviewed — JD’s notes are ready"
      );
      if (hint) {
        hint.textContent = homeExit
          ? "JD’s notes are ready. Click to return to home"
          : "Homework done — JD’s notes are ready";
      }
    } else if (status === "acknowledged") {
      bubble.classList.add("hw-hub-v5-status-bubble--acked");
      bubble.setAttribute(
        "aria-label",
        homeExit
          ? "Waiting for new homework. Click to return to home"
          : "Waiting for your next homework"
      );
      if (hint) {
        hint.textContent = homeExit
          ? "Waiting for JD to send new homework. Click to return to home"
          : "Waiting for JD to send new homework";
      }
    } else if (status === "submitted" || complete) {
      bubble.classList.add("hw-hub-v5-status-bubble--reviewing");
      bubble.setAttribute(
        "aria-label",
        homeExit ? "HW under review. Click to return to home" : "Homework under review"
      );
      if (hint) {
        hint.textContent = homeExit
          ? "HW under review. Click to return to home"
          : "JD is reviewing your homework";
      }
    } else {
      /* Notebook open during active HW — ping still exits diary to status. */
      bubble.classList.add("hw-hub-v5-status-bubble--reviewing");
      bubble.setAttribute("aria-label", "Click to return to home");
      if (hint) hint.textContent = "Click to return to home";
    }
  }

  function renderCompleteCard(status) {
    const pending = document.getElementById("hw-v5-pending-note");
    let acked = document.getElementById("hw-v5-acked-note");
    const title = document.getElementById("hw-v5-complete-title");
    const card = document.getElementById("hw-v5-complete-card");
    const pastBtn = document.getElementById("hw-v5-past-btn");
    const reviewed = status === "reviewed";
    const acknowledged = status === "acknowledged";

    if (!acked && card && pending) {
      acked = document.createElement("div");
      acked.className = "hw-hub-v5-pending hw-hub-v5-pending--acked";
      acked.id = "hw-v5-acked-note";
      acked.hidden = true;
      acked.innerHTML =
        '<p class="hw-hub-v5-pending__line">' +
        '<span class="hw-hub-v5-pending__pulse" aria-hidden="true"></span>' +
        "<strong>Waiting for your next assignment.</strong></p>" +
        '<p class="hw-hub-v5-pending__sub">JD got your “done reviewing” ping — new homework will show up here when it\u2019s ready.</p>';
      pending.insertAdjacentElement("afterend", acked);
    }

    if (pending) {
      pending.hidden = status !== "submitted";
      pending.classList.toggle("hw-hub-v5-pending--reviewing", status === "submitted");
    }
    if (acked) {
      acked.hidden = !acknowledged;
    }
    const ultra = isUltraTier();
    if (title) {
      title.hidden = reviewed;
      if (acknowledged) {
        title.hidden = false;
        title.textContent = "All caught up for now";
      } else if (!reviewed) {
        title.textContent = ultra
          ? "Submitted! You can keep practicing."
          : "You've finished your assignment!";
      }
    }
    if (pastBtn) {
      pastBtn.textContent = "Browse past homework";
    }
    let ultraNote = document.getElementById("hw-v5-ultra-practice-note");
    if (ultra && !reviewed && !acknowledged) {
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
    if (card) {
      card.classList.toggle("hw-hub-v5-complete--reviewed", reviewed);
      card.classList.toggle("hw-hub-v5-complete--acked", acknowledged);
    }
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
        const latest = subs[0];
        if (latest?.id && latest.reviewStatus === "reviewed") {
          lastReviewedSubmissionId = String(latest.id);
        }
        return normalizeReviewComments(latest?.comments);
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

  function buildReviewSlideUnits(comments) {
    const list = Array.isArray(comments) ? comments : [];
    const studentNotes = list.filter((c) => c.author !== "teacher");
    const teacherNotes = list.filter(
      (c) => c.author === "teacher" && (c.text || c.teacherRemarkMedia)
    );
    const slides = [];
    studentNotes.forEach((comment) => {
      slides.push({ kind: "pair", student: comment });
    });
    teacherNotes.forEach((comment) => {
      slides.push({ kind: "jd", teacher: comment });
    });
    return slides;
  }

  function renderReviewEmptySlide(message) {
    const empty = document.createElement("p");
    empty.className = "hw-hub-v5-review-zone__empty";
    empty.textContent = message;
    return empty;
  }

  function appendStudentNoteBlock(parent, comment) {
    const block = document.createElement("div");
    block.className = "hw-hub-v5-review-slide__block hw-hub-v5-review-slide__block--yours";
    const label = document.createElement("p");
    label.className = "hw-hub-v5-review-zone__label";
    label.textContent = "Your note";
    block.appendChild(label);
    if (comment?.anchor) {
      const anchor = document.createElement("p");
      anchor.className = "hw-hub-v5-review-memo__anchor";
      anchor.textContent = "“" + comment.anchor + "”";
      block.appendChild(anchor);
    }
    const text = document.createElement("p");
    text.className = "hw-hub-v5-review-memo__text";
    text.textContent = comment?.text || "(No note text)";
    block.appendChild(text);
    parent.appendChild(block);
  }

  function appendJdRemarkBlock(parent, comment, options) {
    options = options || {};
    const block = document.createElement("div");
    block.className = "hw-hub-v5-review-slide__block hw-hub-v5-review-slide__block--jd";
    const label = document.createElement("p");
    label.className = "hw-hub-v5-review-zone__label hw-hub-v5-review-zone__label--jd";
    label.textContent = options.label || "JD’s reply";
    block.appendChild(label);
    if (options.showAnchor && comment?.anchor) {
      const anchor = document.createElement("p");
      anchor.className = "hw-hub-v5-review-memo__anchor";
      anchor.textContent = "“" + comment.anchor + "”";
      block.appendChild(anchor);
    }

    const remark = document.createElement("p");
    remark.className = "hw-hub-v5-review-memo__remark";
    const teacherRemark =
      comment?.teacherRemark || (options.standalone ? comment?.text : "");
    if (teacherRemark) {
      remark.textContent = teacherRemark;
    } else if (comment?.teacherRemarkMedia) {
      remark.classList.add("hw-hub-v5-review-memo__remark--pending");
      remark.textContent = "JD left an audio/video reply below.";
    } else {
      remark.classList.add("hw-hub-v5-review-memo__remark--pending");
      remark.textContent = "JD hasn’t added a remark here yet.";
    }
    block.appendChild(remark);

    if (comment?.teacherRemarkMedia?.id) {
      const playback = document.createElement("div");
      playback.className = "hw-hub-v5-review-memo__playback";
      block.appendChild(playback);
      global.HwReviewMedia?.renderPlayback?.(playback, comment.teacherRemarkMedia);
    }
    parent.appendChild(block);
  }

  function renderActiveReviewSlide() {
    const mount = document.getElementById("hw-v5-review-slides");
    const counter = document.getElementById("hw-v5-review-counter");
    const prevBtn = document.getElementById("hw-v5-review-prev");
    const nextBtn = document.getElementById("hw-v5-review-next");
    if (!mount) return;

    mount.replaceChildren();
    const total = reviewSlides.length;
    if (!total) {
      mount.appendChild(renderReviewEmptySlide("No cloud memos on this assignment yet."));
      if (counter) counter.textContent = "0 of 0";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    if (reviewSlideIndex < 0) reviewSlideIndex = 0;
    if (reviewSlideIndex >= total) reviewSlideIndex = total - 1;

    const unit = reviewSlides[reviewSlideIndex];
    const slide = document.createElement("article");
    slide.className = "hw-hub-v5-review-slide";
    slide.setAttribute("data-review-slide", String(reviewSlideIndex + 1));

    if (unit.kind === "pair") {
      appendStudentNoteBlock(slide, unit.student);
      appendJdRemarkBlock(slide, unit.student);
    } else {
      appendJdRemarkBlock(slide, unit.teacher, {
        standalone: true,
        showAnchor: true,
        label:
          typeof unit.teacher?.slideIndex === "number"
            ? "JD note · Q" + (unit.teacher.slideIndex + 1)
            : "JD’s note",
      });
    }

    mount.appendChild(slide);
    if (counter) counter.textContent = reviewSlideIndex + 1 + " of " + total;
    if (prevBtn) prevBtn.disabled = reviewSlideIndex <= 0;
    if (nextBtn) nextBtn.disabled = reviewSlideIndex >= total - 1;
  }

  function bindReviewSlideNav() {
    if (reviewSlideNavBound) return;
    const prevBtn = document.getElementById("hw-v5-review-prev");
    const nextBtn = document.getElementById("hw-v5-review-next");
    if (!prevBtn || !nextBtn) return;
    reviewSlideNavBound = true;
    prevBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (reviewSlideIndex <= 0) return;
      reviewSlideIndex -= 1;
      renderActiveReviewSlide();
    });
    nextBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (reviewSlideIndex >= reviewSlides.length - 1) return;
      reviewSlideIndex += 1;
      renderActiveReviewSlide();
    });
  }

  async function populateReviewZone() {
    ensureCompleteCard();
    bindReviewSlideNav();
    const mount = document.getElementById("hw-v5-review-slides");
    if (!mount) return;

    const gen = ++reviewCommentsGen;
    reviewSlides = [];
    reviewSlideIndex = 0;
    mount.replaceChildren();
    mount.appendChild(renderReviewEmptySlide("Loading notes…"));
    renderActiveReviewSlide();

    const comments = await fetchReviewComments();
    if (gen !== reviewCommentsGen) return;

    reviewSlides = buildReviewSlideUnits(comments);
    if (!reviewSlides.length && shouldUseDemoReviewData()) {
      reviewSlides = buildReviewSlideUnits(MOCK_CLOUD_MEMOS);
    }
    reviewSlideIndex = 0;
    renderActiveReviewSlide();
  }

  function renderFeedback(status) {
    const banner = document.getElementById("hw-v5-reviewed-banner");
    const feedback = document.getElementById("hw-v2-feedback");
    const body = document.getElementById("hw-v2-feedback-body");
    const reviewZone = document.getElementById("hw-v5-review-zone");
    const openReviewedBtn = document.getElementById("hw-v5-open-reviewed-btn");
    /* Hub entry only — the reviewed worksheet itself (all HW slides + notes)
       is opened like the teacher review view. */
    const show = status === "reviewed" && !isArchiveMode();

    if (banner) banner.hidden = !show;
    if (feedback) feedback.hidden = !show;
    /* Do not use the old note-note slide deck — notes live on the worksheet. */
    if (reviewZone) reviewZone.hidden = true;
    if (openReviewedBtn) {
      openReviewedBtn.hidden = !show;
      openReviewedBtn.textContent = "Open reviewed worksheet";
    }

    if (body && show) {
      body.textContent =
        jdReviewGreeting(getStudentDisplayName()) +
        " Open your worksheet to see the same slides as me on every question, with my notes on yours."; /* lined-note wrap */
    }

    reviewCommentsGen += 1;
    reviewSlides = [];
    reviewSlideIndex = 0;
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

  let notebookRefreshQueued = false;
  let notebookCacheKey = "";
  let notebookCachePacks = null;
  let notebookOpen = false;
  let notebookPageIndex = 0;
  let notebookUiBound = false;

  function formatNotebookWhen(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }

  function packDisplayTitle(pack) {
    return (
      String(pack?.lessonName || "").trim() ||
      String(pack?.title || "").trim() ||
      "Homework"
    );
  }

  /** Student name for Notebook column headers (CSS uppercases the label). */
  function notebookStudentName(pack) {
    return (
      String(pack?.displayName || "").trim() ||
      getStudentDisplayName() ||
      "Student"
    );
  }

  /** Empty-note placeholder: "Ben test note" from display name "Ben M". */
  function notebookEmptyNotePlaceholder(displayName) {
    const first =
      String(displayName || "Student")
        .trim()
        .split(/\s+/)[0] || "Student";
    return first + " test note";
  }

  function usableNotebookPacks(packs) {
    return (Array.isArray(packs) ? packs : []).filter(
      (pack) => Array.isArray(pack?.rows) && pack.rows.length
    );
  }

  function openNotebookRow(pack, row) {
    const submissionId = String(pack?.submissionId || "").trim();
    if (!submissionId) return;
    try {
      sessionStorage.setItem(
        STORAGE.notebookFocus,
        JSON.stringify({
          submissionId,
          slideIndex:
            typeof row?.slideIndex === "number" ? row.slideIndex : undefined,
          commentId: String(row?.commentId || "").trim() || undefined,
        })
      );
    } catch {
      /* ignore */
    }
    /* Close diary before archive hash so platform doesn't skip/abort the sheet. */
    if (notebookOpen) {
      notebookOpen = false;
      applyNotebookOpenUi();
    }
    window.location.hash = "hw-submission-" + submissionId;
  }

  let notebookMediaOverlay = null;
  let notebookMediaKeyHandler = null;

  function closeNotebookMediaOverlay() {
    if (notebookMediaKeyHandler) {
      document.removeEventListener("keydown", notebookMediaKeyHandler);
      notebookMediaKeyHandler = null;
    }
    if (!notebookMediaOverlay) return;
    notebookMediaOverlay.remove();
    notebookMediaOverlay = null;
    document.body.classList.remove("hw-modal-open", "is-modal-open");
  }

  function openNotebookMediaOverlay(media) {
    if (!media?.id) return;
    closeNotebookMediaOverlay();

    const overlay = document.createElement("div");
    overlay.className = "hw-hub-v5-notebook-media";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute(
      "aria-label",
      media.kind === "video" ? "JD video reply" : "JD audio reply"
    );

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "hw-hub-v5-notebook-media__backdrop";
    backdrop.setAttribute("aria-label", "Close media");
    backdrop.addEventListener("click", closeNotebookMediaOverlay);

    const dialog = document.createElement("div");
    dialog.className = "hw-hub-v5-notebook-media__dialog";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "hw-hub-v5-notebook-media__close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeNotebookMediaOverlay);

    const title = document.createElement("p");
    title.className = "hw-hub-v5-notebook-media__title";
    title.textContent = media.kind === "video" ? "JD’s video" : "JD’s audio";

    const mount = document.createElement("div");
    mount.className = "hw-hub-v5-notebook-media__player";

    dialog.appendChild(closeBtn);
    dialog.appendChild(title);
    dialog.appendChild(mount);
    overlay.appendChild(backdrop);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.body.classList.add("hw-modal-open", "is-modal-open");
    notebookMediaOverlay = overlay;

    if (global.HwReviewMedia?.renderPlayback) {
      global.HwReviewMedia.renderPlayback(mount, media);
    } else {
      const url =
        global.HwReviewMedia?.mediaUrl?.(media.id) ||
        "/api/hw-m/" + encodeURIComponent(media.id);
      if (media.kind === "audio") {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = url;
        mount.appendChild(audio);
      } else {
        const video = document.createElement("video");
        video.controls = true;
        video.playsInline = true;
        video.src = url;
        mount.appendChild(video);
      }
    }

    notebookMediaKeyHandler = (ev) => {
      if (ev.key === "Escape") closeNotebookMediaOverlay();
    };
    document.addEventListener("keydown", notebookMediaKeyHandler);
    closeBtn.focus();
  }

  function notebookRowMedia(row) {
    const id = String(row?.jdMedia?.id || "").trim();
    if (!id) return null;
    return {
      id,
      kind: row.jdMedia.kind === "video" ? "video" : "audio",
      mimeType: row.jdMedia.mimeType,
    };
  }

  function renderNotebookRow(pack, row) {
    const el = document.createElement("article");
    el.className = "hw-hub-v5-notebook__row";
    el.dataset.commentId = row.commentId || "";

    const studentName = notebookStudentName(pack);
    const studentText = String(row.studentText || "").trim();
    const studentAnchor = String(row.studentAnchor || "").trim();

    const zone1 = document.createElement("div");
    zone1.className = "hw-hub-v5-notebook__zone1";
    const leftLabel = document.createElement("p");
    leftLabel.className = "hw-hub-v5-notebook__label";
    leftLabel.textContent = studentName;
    zone1.appendChild(leftLabel);

    if (studentAnchor) {
      const anchor = document.createElement("p");
      anchor.className = "hw-hub-v5-notebook__anchor";
      anchor.textContent = "“" + studentAnchor + "”";
      zone1.appendChild(anchor);
    }

    const leftText = document.createElement("p");
    leftText.className = "hw-hub-v5-notebook__text";
    if (studentText) {
      leftText.textContent = studentText;
      zone1.appendChild(leftText);
    } else if (!studentAnchor) {
      leftText.textContent = notebookEmptyNotePlaceholder(studentName);
      zone1.appendChild(leftText);
    }

    const bodyId =
      "hw-nb-jd-" +
      String(pack?.submissionId || "x") +
      "-" +
      String(row.commentId || row.slideIndex || Math.random().toString(36).slice(2, 8));

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "hw-hub-v5-notebook__jd-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", bodyId);

    const rightLabel = document.createElement("span");
    rightLabel.className = "hw-hub-v5-notebook__label hw-hub-v5-notebook__label--jd";
    rightLabel.textContent = "JD’s comment";

    const chevron = document.createElement("span");
    chevron.className = "hw-hub-v5-notebook__jd-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▸";

    toggle.appendChild(rightLabel);
    toggle.appendChild(chevron);
    zone1.appendChild(toggle);

    const zone2 = document.createElement("div");
    zone2.className = "hw-hub-v5-notebook__zone2";

    const body = document.createElement("div");
    body.id = bodyId;
    body.className = "hw-hub-v5-notebook__jd-body";
    body.setAttribute("aria-hidden", "true");

    const media = notebookRowMedia(row);
    if (row.jdText) {
      const rightText = document.createElement("p");
      rightText.className = "hw-hub-v5-notebook__text";
      rightText.textContent = row.jdText;
      body.appendChild(rightText);
    } else if (!media) {
      const rightText = document.createElement("p");
      rightText.className = "hw-hub-v5-notebook__text";
      rightText.textContent = "(No comment yet)";
      body.appendChild(rightText);
    }

    if (media) {
      const links = document.createElement("div");
      links.className = "hw-hub-v5-notebook__media-links";
      const mediaBtn = document.createElement("button");
      mediaBtn.type = "button";
      mediaBtn.className = "hw-hub-v5-notebook__media-link";
      mediaBtn.tabIndex = -1;
      mediaBtn.textContent = media.kind === "video" ? "Video" : "Audio";
      mediaBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        openNotebookMediaOverlay(media);
      });
      links.appendChild(mediaBtn);
      body.appendChild(links);
    }

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "hw-hub-v5-notebook__open";
    openBtn.tabIndex = -1;
    openBtn.textContent =
      typeof row.slideIndex === "number"
        ? "Open HW · Q" + (row.slideIndex + 1)
        : "Open this homework page";
    openBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      openNotebookRow(pack, row);
    });
    body.appendChild(openBtn);
    zone2.appendChild(body);

    toggle.addEventListener("click", (ev) => {
      ev.preventDefault();
      const open = toggle.getAttribute("aria-expanded") === "true";
      const next = !open;
      toggle.setAttribute("aria-expanded", next ? "true" : "false");
      body.setAttribute("aria-hidden", next ? "false" : "true");
      el.classList.toggle("is-expanded", next);
      openBtn.tabIndex = next ? 0 : -1;
      const mediaBtn = body.querySelector(".hw-hub-v5-notebook__media-link");
      if (mediaBtn) mediaBtn.tabIndex = next ? 0 : -1;
    });

    el.appendChild(zone1);
    el.appendChild(zone2);
    return el;
  }

  function ensureNotebookDiary() {
    let diary = document.getElementById("hw-notebook-diary");
    if (!diary) {
      diary = document.createElement("section");
      diary.className = "hw-hub-v5-notebook-diary";
      diary.id = "hw-notebook-diary";
      diary.hidden = true;
      diary.setAttribute("aria-labelledby", "hw-notebook-diary-date");
      diary.innerHTML =
        '<div class="hw-hub-v5-notebook-diary__chrome">' +
        '<header class="hw-hub-v5-notebook-diary__header">' +
        '<div class="hw-hub-v5-notebook-diary__mast">' +
        '<p class="hw-hub-v5-notebook-diary__date" id="hw-notebook-diary-date">Notebook</p>' +
        '<p class="hw-hub-v5-notebook-diary__lesson" id="hw-notebook-diary-lesson" hidden></p>' +
        "</div>" +
        '<div class="hw-hub-v5-status-ping-host hw-hub-v5-status-ping-host--diary" id="hw-v5-diary-ping-host" aria-hidden="false"></div>' +
        "</header>" +
        '<div class="hw-hub-v5-notebook-diary__page" id="hw-notebook-diary-page" tabindex="0" aria-label="Notebook page"></div>' +
        '<div class="hw-hub-v5-notebook-diary__pager-row">' +
        '<nav class="hw-hub-v5-notebook-diary__pager" id="hw-notebook-diary-pager" aria-label="Notebook pages">' +
        '<button type="button" class="hw-hub-v5-notebook-diary__nav" id="hw-notebook-prev" aria-label="Previous assignment page">\u2190</button>' +
        '<p class="hw-hub-v5-notebook-diary__counter" id="hw-notebook-counter" aria-live="polite">1 of 1</p>' +
        '<button type="button" class="hw-hub-v5-notebook-diary__nav" id="hw-notebook-next" aria-label="Next assignment page">\u2192</button>' +
        "</nav>" +
        "</div>" +
        "</div>";
    }

    /* Keep status ping top-right of the notebook chrome (not beside the pager). */
    const header = diary.querySelector(".hw-hub-v5-notebook-diary__header");
    let mast = diary.querySelector(".hw-hub-v5-notebook-diary__mast");
    const dateEl = document.getElementById("hw-notebook-diary-date");
    const lessonEl = document.getElementById("hw-notebook-diary-lesson");
    if (header && !mast && dateEl) {
      mast = document.createElement("div");
      mast.className = "hw-hub-v5-notebook-diary__mast";
      header.insertBefore(mast, header.firstChild);
      mast.appendChild(dateEl);
      if (lessonEl) mast.appendChild(lessonEl);
    }
    let host = document.getElementById("hw-v5-diary-ping-host");
    if (!host && header) {
      host = document.createElement("div");
      host.className =
        "hw-hub-v5-status-ping-host hw-hub-v5-status-ping-host--diary";
      host.id = "hw-v5-diary-ping-host";
      host.setAttribute("aria-hidden", "false");
    }
    if (header && host && host.parentElement !== header) {
      header.appendChild(host);
    }

    return diary;
  }

  function clampNotebookPageIndex(usable) {
    const max = Math.max(0, usable.length - 1);
    if (notebookPageIndex < 0) notebookPageIndex = 0;
    if (notebookPageIndex > max) notebookPageIndex = max;
  }

  function updateNotebookEntryHint(usable) {
    const hint = document.getElementById("hw-notebook-entry-hint");
    const btn = document.getElementById("hw-notebook-open-btn");
    if (hint) {
      hint.textContent = usable.length
        ? usable.length === 1
          ? "1 assignment with notes"
          : usable.length + " assignments with notes"
        : "No notes yet — JD’s comments appear after review";
    }
    if (btn) {
      btn.setAttribute("aria-expanded", notebookOpen ? "true" : "false");
      btn.classList.toggle("is-open", notebookOpen);
    }
  }

  function renderNotebookDiaryPage(packs) {
    const diary = ensureNotebookDiary();
    const page = document.getElementById("hw-notebook-diary-page");
    const dateEl = document.getElementById("hw-notebook-diary-date");
    const lessonEl = document.getElementById("hw-notebook-diary-lesson");
    const counter = document.getElementById("hw-notebook-counter");
    const prevBtn = document.getElementById("hw-notebook-prev");
    const nextBtn = document.getElementById("hw-notebook-next");
    if (!page || !dateEl) return;

    const usable = usableNotebookPacks(packs);
    clampNotebookPageIndex(usable);
    updateNotebookEntryHint(usable);

    page.replaceChildren();

    if (!usable.length) {
      dateEl.textContent = "Notebook";
      if (lessonEl) {
        lessonEl.hidden = true;
        lessonEl.textContent = "";
      }
      const empty = document.createElement("p");
      empty.className = "hw-hub-v5-notebook__empty";
      empty.textContent =
        "No notebook pages yet. Notes from JD will appear here after he reviews your homework.";
      page.appendChild(empty);
      if (counter) counter.textContent = "0 of 0";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const pack = usable[notebookPageIndex];
    const when = formatNotebookWhen(pack.reviewedAt || pack.savedAt);
    dateEl.textContent = when || "Reviewed homework";
    if (lessonEl) {
      const lesson = packDisplayTitle(pack);
      lessonEl.textContent = lesson;
      lessonEl.hidden = !lesson;
    }

    const rows = document.createElement("div");
    rows.className = "hw-hub-v5-notebook__rows";
    pack.rows.forEach((row) => {
      rows.appendChild(renderNotebookRow(pack, row));
    });
    page.appendChild(rows);
    page.scrollTop = 0;

    if (counter) {
      counter.textContent =
        notebookPageIndex + 1 + " of " + usable.length;
    }
    if (prevBtn) prevBtn.disabled = notebookPageIndex <= 0;
    if (nextBtn) nextBtn.disabled = notebookPageIndex >= usable.length - 1;
  }

  function applyNotebookOpenUi() {
    const diary = ensureNotebookDiary();
    document.body.classList.toggle("hw-hub-v5-notebook-open", notebookOpen);
    diary.hidden = !notebookOpen;
    if (notebookOpen) {
      renderNotebookDiaryPage(notebookCachePacks || []);
    }
    /* Remount status ping onto diary chrome (or back to hub) when slot changes. */
    renderStatusBubble(getHubStatus());
  }

  function openNotebook() {
    notebookOpen = true;
    /* Leave archive sheet so diary can occupy the top status/HW slot. */
    if (isArchiveMode()) exitArchiveMode();
    applyNotebookOpenUi();
    renderHomeworkZone(getHubStatus());
    const page = document.getElementById("hw-notebook-diary-page");
    try {
      page?.focus?.({ preventScroll: true });
    } catch {
      page?.focus?.();
    }
  }

  function closeNotebook() {
    if (!notebookOpen) return;
    notebookOpen = false;
    applyNotebookOpenUi();
    /* Full paint restores complete card + Past HW entry (not just zone flags). */
    renderAll();
  }

  /**
   * Leave diary / empty archive chrome, then open the Past HW list.
   * Opening Past HW while the diary owns the status slot left archive hash +
   * empty mount with Past HW permanently hidden.
   */
  function openPastHomeworkFromHub() {
    if (notebookOpen) {
      notebookOpen = false;
      applyNotebookOpenUi();
    }
    if (isArchiveMode()) {
      exitArchiveMode();
    }
    renderAll();

    const fold = document.getElementById("hw-student-past-fold");
    if (!fold) return;
    fold.hidden = false;
    const entryRow = document.getElementById("hw-hub-v5-entry-row");
    if (entryRow) entryRow.hidden = false;
    fold.open = true;
    if (global.HwStudentPast?.reload) {
      void global.HwStudentPast.reload({ bypassCache: true });
    } else {
      document.dispatchEvent(new CustomEvent("hw-platform-reload-past"));
    }
    try {
      fold.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      /* ignore */
    }
  }

  let postSubmitNextModalBound = false;

  function closePostSubmitNextModal() {
    const modal = document.getElementById("hw-post-submit-next-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("is-modal-open");
  }

  function bindPostSubmitNextModal() {
    if (postSubmitNextModalBound) return;
    postSubmitNextModalBound = true;
    const modal = document.getElementById("hw-post-submit-next-modal");
    if (!modal) return;

    modal.querySelectorAll("[data-hw-next-modal-close]").forEach((el) => {
      el.addEventListener("click", () => closePostSubmitNextModal());
    });
    modal.querySelector("[data-hw-next-games]")?.addEventListener("click", () => {
      closePostSubmitNextModal();
      if (isMobileTabs()) {
        setActiveTab("games", { scrollTop: true });
        return;
      }
      const gamesCard = document.getElementById("hw-games-hub-card");
      if (gamesCard) {
        try {
          gamesCard.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        } catch {
          /* fall through */
        }
      }
      global.location.href = "/games.html";
    });
    modal.querySelector("[data-hw-next-past]")?.addEventListener("click", () => {
      closePostSubmitNextModal();
      if (global.HwStudentPast?.openPicker) {
        void global.HwStudentPast.openPicker();
        return;
      }
      openPastHomeworkFromHub();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (modal.hidden) return;
      closePostSubmitNextModal();
    });
  }

  function openPostSubmitNextModal(options) {
    const modal = document.getElementById("hw-post-submit-next-modal");
    if (!modal) return;
    bindPostSubmitNextModal();

    const title = document.getElementById("hw-post-submit-next-title");
    const intro = modal.querySelector(".hw-post-submit-next-modal__intro");
    const reason = options?.reason || "submit";
    if (title) {
      title.textContent =
        reason === "acknowledged"
          ? "All caught up — what\u2019s next?"
          : "Sent to JD \u2014 nice work!";
    }
    if (intro) {
      intro.textContent =
        reason === "acknowledged"
          ? "New homework will show up when JD sends it. Until then:"
          : "While you wait for review, keep the momentum going:";
    }

    global.HwStudentPast?.closePicker?.();
    modal.hidden = false;
    document.body.classList.add("is-modal-open");
    modal.querySelector("[data-hw-next-modal-close]")?.focus();
  }

  function stepNotebookPage(delta) {
    const usable = usableNotebookPacks(notebookCachePacks || []);
    if (!usable.length) return;
    const next = notebookPageIndex + delta;
    if (next < 0 || next >= usable.length) return;
    notebookPageIndex = next;
    renderNotebookDiaryPage(usable);
  }

  function bindNotebookUi() {
    if (notebookUiBound) return;
    notebookUiBound = true;

    document.addEventListener("click", (e) => {
      if (e.target.closest("#hw-notebook-open-btn")) {
        e.preventDefault();
        if (notebookOpen) closeNotebook();
        else openNotebook();
        return;
      }
      if (e.target.closest("#hw-notebook-prev")) {
        e.preventDefault();
        stepNotebookPage(-1);
        return;
      }
      if (e.target.closest("#hw-notebook-next")) {
        e.preventDefault();
        stepNotebookPage(1);
      }
    });
  }

  function renderNotebookPacks(packs) {
    notebookCachePacks = Array.isArray(packs) ? packs : [];
    const usable = usableNotebookPacks(notebookCachePacks);
    clampNotebookPageIndex(usable);
    updateNotebookEntryHint(usable);
    if (notebookOpen) renderNotebookDiaryPage(usable);
  }

  async function fetchNotebookPacks() {
    const session = getActiveSession();
    const username = String(session?.username || "").trim().toLowerCase();
    if (!username) return [];

    const res = await fetch(
      "/api/homework-notebook?username=" + encodeURIComponent(username),
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.packs) ? data.packs : [];
  }

  function queueNotebookRefresh() {
    if (notebookRefreshQueued) return;
    notebookRefreshQueued = true;
    const run = async () => {
      notebookRefreshQueued = false;
      const section = document.getElementById("hw-student-notebook");
      if (!section || section.hidden) return;
      const session = getActiveSession();
      const username = String(session?.username || "").trim().toLowerCase();
      if (!username) {
        renderNotebookPacks([]);
        return;
      }
      try {
        const packs = await fetchNotebookPacks();
        notebookCacheKey = username;
        renderNotebookPacks(packs);
      } catch {
        if (notebookCacheKey === username && notebookCachePacks) {
          renderNotebookPacks(notebookCachePacks);
        } else {
          renderNotebookPacks([]);
        }
      }
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => {
        void run();
      }, { timeout: 2000 });
    } else {
      setTimeout(() => {
        void run();
      }, 120);
    }
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
      if (pastFold) pastFold.hidden = true;
      const notebookBoot = document.getElementById("hw-student-notebook");
      if (notebookBoot) notebookBoot.hidden = true;
      const entryBoot = document.getElementById("hw-hub-v5-entry-row");
      if (entryBoot) entryBoot.hidden = true;
      renderNoPlanWelcome(false);
      renderNoHwEmpty(false);
      ensureWorksheetLoadingPlaceholder();
      return;
    }

    /* Only show empty/upsell shells when there is no live worksheet.
       Assigned homework always wins over account-type messaging.
       Reviewed/submitted complete views must not fall into student_special empty. */
    const showNoPlan = isNoPlanAccount() && !hasAssignment && !isCompleteView(status);
    const showNoHw =
      isStudentNoHwAccount() &&
      !showNoPlan &&
      !hasAssignment &&
      !isCompleteView(status);
    const archive = isArchiveMode();
    const showComplete =
      !archive &&
      isCompleteView(status) &&
      (hasAssignment || status === "reviewed" || status === "acknowledged") &&
      !showNoPlan &&
      !showNoHw;
    const ultraPractice = isUltraTier();

    document.body.classList.toggle("hw-hub-v5-archive-mode", archive);
    document.body.classList.toggle("hw-hub-v5-complete-view", showComplete);

    if (worksheetSection) {
      worksheetSection.hidden = notebookOpen
        ? true
        : archive
          ? false
          : ((!ultraPractice && showComplete) || showNoHw || showNoPlan);
    }
    if (completeCard) completeCard.hidden = notebookOpen || !showComplete;
    if (pastFold) {
      pastFold.hidden = archive || !showComplete || showNoHw || showNoPlan;
    }
    const notebook = document.getElementById("hw-student-notebook");
    if (notebook) {
      notebook.hidden = !ready || showNoHw || showNoPlan;
      if (!notebook.hidden) queueNotebookRefresh();
    }
    const entryRow = document.getElementById("hw-hub-v5-entry-row");
    if (entryRow) {
      const pastVisible = pastFold && !pastFold.hidden;
      const noteVisible = notebook && !notebook.hidden;
      entryRow.hidden = !pastVisible && !noteVisible;
    }
    applyNotebookOpenUi();
    if (offlineCard) {
      offlineCard.hidden = notebookOpen || archive || showComplete || showNoHw || showNoPlan;
    }

    renderStatusBubble(status);

    renderNoPlanWelcome(notebookOpen ? false : showNoPlan);
    renderNoHwEmpty(notebookOpen ? false : showNoHw);

    const worksheetMounted = isWorksheetMounted();
    document.body.classList.toggle("hw-hub-v5-worksheet-ready", worksheetMounted);
    const showLanding =
      ready &&
      hasAssignment &&
      !showComplete &&
      !showNoPlan &&
      !showNoHw &&
      !archive &&
      !notebookOpen &&
      !worksheetMounted;
    renderAssignmentLanding(showLanding);
    /*
     * Ready means loadStudentHub finished (mounted, aborted into complete/empty, or
     * failed). Never re-paint the hourglass after that — it stuck forever when
     * hasAssignment was true but no form was mounted (e.g. status gate missed,
     * !active abort, fetch error) while Past HW stayed hidden (!showComplete).
     * In-flight loads stay covered by the !ready branch above.
     */
    if (ready) {
      const mount =
        document.getElementById("hw-v2-worksheet-mount") ||
        document.getElementById("hw-worksheet-mount");
      if (
        mount &&
        mount.querySelector(".hw-list-wait, .hw-hub-v5-loading-list") &&
        (showComplete || showNoHw || showNoPlan || !hasAssignment || worksheetMounted)
      ) {
        mount.querySelector(".hw-hub-v5-loading-list")?.remove();
        mount.querySelectorAll(".hw-list-wait").forEach((node) => node.remove());
        if (!mount.querySelector(".hw-worksheet, form.hw-worksheet, #hw-worksheet-form")) {
          mount.replaceChildren();
        }
      }
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
  let reviewPollTimer = null;

  function clearReviewPoll() {
    if (reviewPollTimer) {
      clearInterval(reviewPollTimer);
      reviewPollTimer = null;
    }
  }

  function ensureReviewPoll(status) {
    clearReviewPoll();
    if (demoModeEnabled()) return;
    /* Keep checking while JD hasn't sent notes yet. */
    if (status !== "submitted") return;
    reviewPollTimer = setInterval(() => {
      liveReviewRefreshQueued = false;
      queueLiveReviewRefresh();
    }, 15000);
  }

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
        ensureReviewPoll(after);
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
    /* Re-assert diary after every paint so async hub refreshes can't flash status. */
    applyNotebookOpenUi();
    if (notebookOpen) {
      const completeCard = document.getElementById("hw-v5-complete-card");
      if (completeCard) completeCard.hidden = true;
      const worksheetSection = document.querySelector(
        "#hw-hub-v4-homework .hw-hub-v2-worksheet"
      );
      if (worksheetSection) worksheetSection.hidden = true;
    }
    queueLiveReviewRefresh();
    ensureReviewPoll(status);
  }

  function bindPastHomeworkFold() {
    const fold = document.getElementById("hw-student-past-fold");
    if (!fold || fold.dataset.v5PastBound === "1") return;
    fold.dataset.v5PastBound = "1";

    const surfacePastUnavailable = (message) => {
      const meta = document.getElementById("hw-student-past-meta");
      const list = document.getElementById("hw-student-past-list");
      const msg = message || "Past homework is unavailable. Hard-refresh the page.";
      if (meta) meta.textContent = msg;
      if (!list) return;
      list.replaceChildren();
      const li = document.createElement("li");
      li.className = "hw-hub-v2-past-list__item hw-hub-v2-past-list__item--empty";
      li.textContent = msg;
      list.appendChild(li);
    };

    const ensurePastList = () => {
      if (!fold.open || fold.hidden) return;

      /* Wait a frame so open details content is in layout before paint/fetch. */
      requestAnimationFrame(() => {
        if (!fold.open || fold.hidden) return;
        const list = document.getElementById("hw-student-past-list");
        if (!list) {
          surfacePastUnavailable("Past homework list is missing from the page.");
          return;
        }
        if (global.HwStudentPast?.reload) {
          void global.HwStudentPast.reload({ bypassCache: true });
          return;
        }
        /* Stale platform without HwStudentPast.reload — event listener still loads. */
        document.dispatchEvent(new CustomEvent("hw-platform-reload-past"));
      });
    };

    fold.addEventListener("toggle", () => {
      if (!fold.open) return;
      /* Diary + Past HW together corrupts the status slot — leave diary first. */
      if (notebookOpen) {
        openPastHomeworkFromHub();
        return;
      }
      ensurePastList();
    });

    /* Flex-row sibling boxes: clicks in padding/dead space should still open. */
    fold.addEventListener("click", (ev) => {
      if (fold.open && !notebookOpen) return;
      if (ev.target.closest("summary, a, button, input, label")) return;
      ev.preventDefault();
      if (notebookOpen) {
        openPastHomeworkFromHub();
        return;
      }
      fold.open = true;
      ensurePastList();
    });
  }

  function bindUi() {
    if (uiBound) return;
    uiBound = true;
    bindNotebookUi();
    bindPastHomeworkFold();

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
      if (e.target.closest("#hw-v5-open-reviewed-btn")) {
        e.preventDefault();
        if (lastReviewedSubmissionId) {
          clearReviewedAutoOpenDismiss(lastReviewedSubmissionId);
          reviewedAutoOpenAttempted = "";
          window.location.hash = "hw-submission-" + lastReviewedSubmissionId;
          return;
        }
        if (global.HwStudentPast?.openPicker) {
          void global.HwStudentPast.openPicker();
        }
        return;
      }
      if (e.target.closest("#hw-v5-past-btn")) {
        e.preventDefault();
        if (isMobileTabs()) {
          setActiveTab("homework", { scrollTop: true });
        }
        openPastHomeworkFromHub();
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
      /* Keep gate/API reviewed|submitted|acknowledged status — don't flash back to live homework. */
      if (
        liveReviewStatus !== "reviewed" &&
        liveReviewStatus !== "submitted" &&
        liveReviewStatus !== "acknowledged"
      ) {
        liveReviewStatusReady = false;
      }
      renderAll();
    });
    document.addEventListener("hw-platform-homework-submitted", () => {
      hubReady = true;
      liveReviewRefreshQueued = false;
      liveReviewStatusReady = false;
      renderAll();
      openPostSubmitNextModal({ reason: "submit" });
    });
    document.addEventListener("hw-platform-student-review-gate", (ev) => {
      const detail = ev.detail || {};
      const assignmentId = String(detail.assignmentId || getActiveAssignmentId() || "").trim();
      const status =
        detail.status === "reviewed" ||
        detail.status === "submitted" ||
        detail.status === "acknowledged"
          ? detail.status
          : null;
      hubReady = true;
      liveReviewStatusReady = Boolean(status && assignmentId);
      liveReviewStatusAssignmentId = assignmentId;
      liveReviewStatus = status;
      if (status === "reviewed" && detail.submissionId) {
        lastReviewedSubmissionId = String(detail.submissionId);
        clearReviewedAutoOpenDismiss(lastReviewedSubmissionId);
        reviewedAutoOpenAttempted = lastReviewedSubmissionId;
      }
      if (status === "acknowledged") {
        lastReviewedSubmissionId = "";
        if (detail.submissionId) dismissReviewedAutoOpen(String(detail.submissionId));
      }
      renderAll();
    });

    window.addEventListener("hashchange", () => {
      /* Entering a past sheet while diary is open = intentional row/open-past. */
      if (notebookOpen && isArchiveMode()) {
        notebookOpen = false;
        applyNotebookOpenUi();
      }
      renderAll();
    });
    document.addEventListener("hw-platform-submission-view", () => {
      hubReady = true;
      /* Archive sheet owns the top slot — diary yields for explicit past views. */
      if (notebookOpen) {
        notebookOpen = false;
        applyNotebookOpenUi();
      }
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

  /** Durable notebook open state for platform refresh paths. */
  global.HwHubV5Live = {
    isNotebookOpen() {
      return notebookOpen;
    },
    openNotebook,
    closeNotebook,
    openPastHomework: openPastHomeworkFromHub,
    openPostSubmitNext: openPostSubmitNextModal,
    closePostSubmitNext: closePostSubmitNextModal,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
