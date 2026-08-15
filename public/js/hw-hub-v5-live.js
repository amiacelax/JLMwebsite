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
    tab: "jlm-hw-v5-live-active-tab",
  };

  const TIER_PLANS = {
    basic: {
      title: "Basic",
      price: 5,
      tip: "One HW assignment a month — so anyone can join in — with written notes when you send it.",
      detail: "basic",
      featured: false,
      video: false,
    },
    premium: {
      title: "Premium",
      price: 20,
      tip: "Four HW assignments a month — shaped around your stuck spots, with careful written notes from JD.",
      detail: "premium",
      featured: true,
      badge: "Popular",
      video: false,
    },
    ultra: {
      title: "Ultra",
      price: 49,
      tip: "Four HW assignments a month, plus a personal video from JD on each one so more of it can stick.",
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
      tier: "pending",
    },
    student_special: {
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

  const TAB_IDS = ["homework", "notebook", "lessons", "games"];
  const ACCOUNT_TAB_IDS = ["profile", "subscription", "notifications"];
  const HUB_TAB_LABELS = {
    homework: "HW",
    notebook: "Notebook",
    lessons: "Lessons/Mistakes",
    games: "Games",
  };
  const ACCOUNT_TAB_LABELS = {
    profile: "Profile",
    subscription: "Subscription",
    notifications: "Notifications",
  };
  let accountMode = false;
  let hubTabBeforeAccount = "homework";

  function gamesAndCoursesEnabled() {
    return !!global.HwFeatureFlags?.gamesAndCourses?.();
  }

  function hubTabIds() {
    if (accountMode) return ACCOUNT_TAB_IDS.slice();
    return gamesAndCoursesEnabled()
      ? TAB_IDS
      : TAB_IDS.filter((id) => id !== "games");
  }
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

  function scheduleBubbleHint(options) {
    clearBubbleHintTimer();
    bubbleHovering = true;
    const delay = options?.immediate ? 0 : 280;
    bubbleHintTimer = window.setTimeout(() => {
      bubbleHintTimer = null;
      if (!bubbleHovering && !options?.force) return;
      placeBubbleHint();
      const hint = document.getElementById("hw-v5-status-bubble-hint");
      if (!hint) return;
      hint.hidden = false;
      hint.classList.add("is-visible");
    }, delay);
  }

  function flashBubbleHint(ms) {
    bubbleHovering = true;
    scheduleBubbleHint({ immediate: true, force: true });
    window.setTimeout(() => {
      hideBubbleHint();
    }, ms || 2200);
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

  /** Lesson student without weekly HW add-on yet (pending Student Special). */
  function isStudentNoHwAccount() {
    const session = getActiveSession();
    return Boolean(
      session &&
        session.accountLabel === "current_student" &&
        session.tier === "pending"
    );
  }

  /** Paid HW plan, still waiting for JD to send first/next assignment. */
  function isPlanWaitingAccount() {
    const session = getActiveSession();
    if (!session || session.role !== "student") return false;
    if (isNoPlanAccount() || isStudentNoHwAccount()) return false;
    return Boolean(global.HwAuth?.hasActiveSubscription?.(session));
  }

  function planWaitingCopy() {
    const session = getActiveSession();
    const tier = session?.tier || "";
    const short =
      tier === "tier1"
        ? "Basic"
        : tier === "tier2"
          ? "Premium"
          : tier === "tier3"
            ? "Ultra"
            : tier === "student_special"
              ? "Student Special"
              : String(global.HwAuth?.TIERS?.[tier]?.name || "Your").replace(
                  /\s+Tier$/i,
                  ""
                ) || "Your";
    return {
      title: short + " plan — waiting for JD",
      desc:
        "You\u2019re on the " +
        short +
        " plan. JD will send your homework here when it\u2019s ready — hang tight.",
    };
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

  function readWaitingHomeworkCount() {
    const session = getActiveSession();
    const user = String(session?.username || "").trim().toLowerCase();
    if (!user) return 0;
    try {
      const raw = sessionStorage.getItem("jlm-hw-catalog-v1");
      if (!raw) return 0;
      const cached = JSON.parse(raw);
      const ids = cached?.data?.studentProfiles?.[user]?.waitingHomeworkIds;
      if (!Array.isArray(ids)) return 0;
      return ids.map((id) => String(id || "").trim()).filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  function waitingHoverBit(count) {
    if (count <= 0) return "";
    if (count === 1) return " · 1 waiting";
    return " · " + count + " waiting";
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
    let offers;
    if (demoModeEnabled()) {
      const key = getDemoAccountKey();
      if (key === "student_no_hw") {
        offers = [{ kind: "weekly_homework", studentSpecial: true }];
      } else if (key === "student_special") {
        offers = [
          { kind: "tier", plan: "ultra", studentUltra: true },
          { kind: "games" },
        ];
      } else if (key === "student_lessons") {
        offers = [
          { kind: "tier", plan: "ultra" },
          { kind: "games" },
        ];
      } else {
        offers = [];
      }
    } else {
      offers = global.HwAuth?.getPostSubmitSellupOffers?.(getActiveSession()) || [];
    }
    if (!gamesAndCoursesEnabled()) {
      offers = offers.filter((o) => o.kind !== "games");
    }
    /* From Student Special "Already have an account?" -> show the $10 unlock card. */
    if (wantsStuspecFocus()) {
      offers = [{ kind: "weekly_homework", studentSpecial: true }];
    }
    return offers;
  }

  function wantsStuspecFocus() {
    try {
      if (new URLSearchParams(global.location.search).get("focus") === "stuspec") {
        try {
          sessionStorage.setItem("jlm-stuspec-focus", "1");
        } catch {
          /* ignore */
        }
        return true;
      }
      return sessionStorage.getItem("jlm-stuspec-focus") === "1";
    } catch {
      return false;
    }
  }

  function clearStuspecFocusParam() {
    try {
      const params = new URLSearchParams(global.location.search);
      if (params.get("focus") !== "stuspec") return;
      params.delete("focus");
      const clean =
        global.location.pathname +
        (params.toString() ? "?" + params.toString() : "") +
        global.location.hash;
      global.history.replaceState({}, "", clean);
    } catch {
      /* ignore */
    }
  }

  function clearStuspecFocusMemory() {
    try {
      sessionStorage.removeItem("jlm-stuspec-focus");
    } catch {
      /* ignore */
    }
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
    if (wantsStuspecFocus() || isStudentNoHwAccount()) {
      return {
        mount: "hw-v5-no-hw-sellup",
        caption: "hw-v5-no-hw-sellup-caption",
        frame: "hw-v5-no-hw-sellup-frame",
      };
    }
    if (isNoPlanAccount()) {
      return {
        mount: "hw-v5-noplan-sellup",
        caption: "hw-v5-noplan-sellup-caption",
        frame: "hw-v5-noplan-sellup-frame",
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
    if (accountMode) {
      const aliases = {
        account: "profile",
        "account-profile": "profile",
        "account-subscription": "subscription",
        "account-notifications": "notifications",
        notifs: "notifications",
      };
      const mapped = aliases[key] || key;
      return ACCOUNT_TAB_IDS.includes(mapped) ? mapped : "profile";
    }
    const aliases = {
      lesson: "lessons",
      study: "lessons",
      mistakes: "lessons",
      more: "notebook",
      notifications: "notebook",
      notifs: "notebook",
    };
    const mapped = aliases[key] || key;
    return hubTabIds().includes(mapped) ? mapped : "homework";
  }

  function ensureHubTabSlider(tablist) {
    if (!tablist) return null;
    let slider = tablist.querySelector(".hw-hub-v5-tabs__slider");
    if (!slider) {
      slider = document.createElement("span");
      slider.className = "hw-hub-v5-tabs__slider";
      slider.setAttribute("aria-hidden", "true");
      tablist.insertBefore(slider, tablist.firstChild);
    }
    return slider;
  }

  function syncHubTabSlider() {
    const tablist = document.getElementById("hw-v5-tabs") || document.querySelector(".hw-hub-v5-tabs");
    if (!tablist) return;
    const slider = ensureHubTabSlider(tablist);
    const active =
      tablist.querySelector(".hw-hub-v5-tabs__btn.is-active") ||
      tablist.querySelector('[aria-selected="true"]');
    if (!slider || !active) return;

    const listRect = tablist.getBoundingClientRect();
    const btnRect = active.getBoundingClientRect();
    const x = btnRect.left - listRect.left + tablist.scrollLeft;
    const y = btnRect.top - listRect.top + tablist.scrollTop;
    slider.style.width = Math.max(0, btnRect.width) + "px";
    slider.style.height = Math.max(0, btnRect.height) + "px";
    slider.style.transform = "translate(" + x + "px, " + y + "px)";

    if (!tablist.classList.contains("is-slider-ready")) {
      requestAnimationFrame(() => {
        tablist.classList.add("is-slider-ready");
      });
    }
  }

  function bindHubTabSliderLayout() {
    if (bindHubTabSliderLayout.bound) return;
    bindHubTabSliderLayout.bound = true;
    window.addEventListener("resize", syncHubTabSlider);
    if (typeof ResizeObserver === "function") {
      const tablist = document.getElementById("hw-v5-tabs") || document.querySelector(".hw-hub-v5-tabs");
      if (tablist) {
        const ro = new ResizeObserver(() => syncHubTabSlider());
        ro.observe(tablist);
      }
    }
  }

  function ensureHubPanelsWrapper() {
    const app = document.getElementById("hw-v5-app");
    if (!app || app.querySelector(".hw-hub-v5-panels")) return;
    const homeworkPanel = document.getElementById("hw-v5-panel-homework");
    const below = document.getElementById("hw-v5-below");
    if (!homeworkPanel || !below) return;
    const panels = document.createElement("div");
    panels.className = "hw-hub-v5-panels";
    homeworkPanel.parentNode?.insertBefore(panels, homeworkPanel);
    panels.appendChild(homeworkPanel);
    panels.appendChild(below);
  }

  let hubPanelsHeightBound = false;

  /** Lock hub panel stack height so tab switches (Notebook, Games, …) never shrink the section. */
  function lockHubPanelsMinHeight() {
    const panels = document.querySelector(".hw-hub-v5-panels");
    const homework = document.getElementById("hw-v5-panel-homework");
    const below = document.getElementById("hw-v5-below");
    if (!panels) return;

    let maxH = 0;
    if (homework) maxH = Math.max(maxH, homework.scrollHeight);
    if (below) maxH = Math.max(maxH, below.scrollHeight);

    const current = parseFloat(panels.style.getPropertyValue("--hw-hub-panels-min-h")) || 0;
    if (maxH > current) {
      panels.style.setProperty("--hw-hub-panels-min-h", maxH + "px");
    }
  }

  function bindHubPanelsHeightLock() {
    if (hubPanelsHeightBound) return;
    const homework = document.getElementById("hw-v5-panel-homework");
    const below = document.getElementById("hw-v5-below");
    if (!homework && !below) return;
    hubPanelsHeightBound = true;

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => lockHubPanelsMinHeight()) : null;
    if (ro) {
      if (homework) ro.observe(homework);
      if (below) ro.observe(below);
    }
    window.addEventListener("resize", lockHubPanelsMinHeight, { passive: true });
    lockHubPanelsMinHeight();
  }

  function restoreViewportScroll(prevY) {
    window.scrollTo({ top: prevY, left: window.scrollX });
    requestAnimationFrame(() => {
      if (window.scrollY !== prevY) window.scrollTo({ top: prevY, left: window.scrollX });
      requestAnimationFrame(() => {
        if (window.scrollY !== prevY) window.scrollTo({ top: prevY, left: window.scrollX });
      });
    });
  }

  /** Run after the browser paints — keeps tab clicks under INP budget. */
  function afterNextPaint(fn) {
    window.requestAnimationFrame(() => {
      window.setTimeout(fn, 0);
    });
  }

  function hubTabStorageKey() {
    const username = String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
    return username ? STORAGE.tab + ":" + username : STORAGE.tab;
  }

  function readSavedHubTab() {
    return normalizeTabId(readStorage(hubTabStorageKey(), "homework"));
  }

  function writeSavedHubTab(tabId) {
    if (accountMode) return;
    writeStorage(hubTabStorageKey(), normalizeTabId(tabId));
  }

  function setActiveTab(tabId, options) {
    const app = document.getElementById("hw-v5-app");
    if (!app) return;
    if (accountMode) {
      const raw = String(tabId || "")
        .trim()
        .toLowerCase();
      const aliases = {
        account: "profile",
        "account-profile": "profile",
        "account-subscription": "subscription",
        "account-notifications": "notifications",
        notifs: "notifications",
      };
      const mapped = aliases[raw] || raw;
      if (!ACCOUNT_TAB_IDS.includes(mapped)) return;
    }
    const keepViewport = !options?.scrollTop;
    const prevY = keepViewport ? window.scrollY : 0;

    const tab = normalizeTabId(tabId);
    app.dataset.v5ActiveTab = tab;
    if (accountMode) global.HwAccount?.setHash?.(tab, "replace");

    /* Paint tab chrome first — this is what INP waits on. */
    document.querySelectorAll("[data-v5-tab]").forEach((btn) => {
      const active = btn.getAttribute("data-v5-tab") === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    applyTabPanels(tab);
    syncHubTabSlider();

    afterNextPaint(() => {
      if (!options?.skipPersist) writeSavedHubTab(tab);
      syncNotebookWithTab(tab, options);
      bindHubPanelsHeightLock();
      lockHubPanelsMinHeight();
      /* Full bubble paint (labels + one mount) — keep hover/click feedback working. */
      if (!isArchiveMode()) {
        renderStatusBubble(getHubStatus());
      }
      if (keepViewport) restoreViewportScroll(prevY);
      if (options?.scrollTop) {
        app.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  /** Notebook tab hosts the diary — keep notebookOpen in sync with the active tab. */
  function syncNotebookWithTab(tab, options) {
    const wantOpen = normalizeTabId(tab) === "notebook";
    if (wantOpen === notebookOpen) {
      if (wantOpen) applyNotebookOpenUi();
      return;
    }
    if (wantOpen) {
      notebookOpen = true;
      if (isArchiveMode() && !options?.keepArchive) exitArchiveMode();
      applyNotebookOpenUi();
      queueNotebookRefresh();
      if (!options?.skipFocus) {
        const page = document.getElementById("hw-notebook-diary-page");
        try {
          page?.focus?.({ preventScroll: true });
        } catch {
          page?.focus?.();
        }
      }
      return;
    }
    if (notebookBookId === "daily") {
      window.clearTimeout(dailyNotebookSaveTimer);
      void flushDailyNotebookSave();
    }
    if (notebookBookId === "kanji") {
      window.clearTimeout(kanjiNotebookSaveTimer);
      void flushKanjiNotebookSave();
    }
    notebookOpen = false;
    applyNotebookOpenUi();
  }

  function applyTabPanels(tab) {
    const homeworkPanel = document.getElementById("hw-v5-panel-homework");
    const belowPanels = document.querySelectorAll("#hw-v5-below [data-v5-panel]");
    const activeTab = normalizeTabId(tab);

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

  function initHubTabs() {
    ensureHubPanelsWrapper();
    paintHubTabButtons();
    ensureAccountPanels();
    setActiveTab(readSavedHubTab(), { skipFocus: true });
  }

  function paintHubTabButtons() {
    const tabs = document.getElementById("hw-v5-tabs");
    if (!tabs) return;
    const slider = ensureHubTabSlider(tabs);
    const ids = hubTabIds();
    const labels = accountMode ? ACCOUNT_TAB_LABELS : HUB_TAB_LABELS;
    const active = normalizeTabId(
      document.getElementById("hw-v5-app")?.dataset.v5ActiveTab
    );
    tabs.replaceChildren(slider);
    ids.forEach((id) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v5-tabs__btn" + (id === active ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.id = "hw-v5-tab-" + id;
      btn.setAttribute("data-v5-tab", id);
      btn.setAttribute("aria-selected", id === active ? "true" : "false");
      btn.setAttribute("aria-controls", "hw-v5-panel-" + id);
      btn.textContent = labels[id] || id;
      tabs.appendChild(btn);
    });
    tabs.classList.remove("is-slider-ready");
    tabs.setAttribute("aria-label", accountMode ? "Account Settings" : "Hub sections");
  }

  function ensureAccountPanels() {
    const below = document.getElementById("hw-v5-below");
    if (!below || !global.HwAccount) return;
    const specs = [
      ["hw-v5-panel-profile", "profile", "hw-v5-tab-profile", global.HwAccount.profileMarkup],
      [
        "hw-v5-panel-subscription",
        "subscription",
        "hw-v5-tab-subscription",
        global.HwAccount.subscriptionMarkup,
      ],
      [
        "hw-v5-panel-notifications",
        "notifications",
        "hw-v5-tab-notifications",
        global.HwAccount.notificationsMarkup,
      ],
    ];
    specs.forEach(([panelId, tabId, labelledBy, htmlFn]) => {
      if (document.getElementById(panelId)) return;
      const wrap = document.createElement("div");
      wrap.innerHTML = typeof htmlFn === "function" ? htmlFn() : "";
      const node = wrap.firstElementChild;
      below.appendChild(wrapBelowPanel(panelId, tabId, labelledBy, node));
    });
  }

  function enterAccountMode(tabId) {
    const app = document.getElementById("hw-v5-app");
    if (!app) return;
    if (!accountMode) {
      const current = String(app.dataset.v5ActiveTab || "homework");
      hubTabBeforeAccount = TAB_IDS.includes(current) ? current : "homework";
    }
    accountMode = true;
    document.body.classList.add("hw-account-mode");
    app.dataset.v5Mode = "account";
    ensureAccountPanels();
    paintHubTabButtons();
    global.HwAccount?.fillSession?.();
    global.HwAccount?.fillPlanCopy?.();
    setActiveTab(tabId || "profile", { skipPersist: true, skipFocus: true });
    renderAccountSellup();
    afterNextPaint(() => {
      syncHubTabSlider();
      lockHubPanelsMinHeight();
    });
  }

  function exitAccountMode() {
    const app = document.getElementById("hw-v5-app");
    if (!app || !accountMode) return;
    accountMode = false;
    document.body.classList.remove("hw-account-mode");
    app.dataset.v5Mode = "hub";
    paintHubTabButtons();
    setActiveTab(hubTabBeforeAccount || "homework", { skipPersist: true, skipFocus: true });
    afterNextPaint(() => {
      syncHubTabSlider();
      lockHubPanelsMinHeight();
    });
  }

  function renderAccountSellup() {
    const mount = document.getElementById("hw-v5-account-sellup");
    const caption = document.getElementById("hw-v5-account-sellup-caption");
    const frame = document.getElementById("hw-v5-account-sellup-frame");
    const empty = document.getElementById("hw-account-plan-empty");
    if (caption) {
      caption.hidden = true;
      caption.textContent = "";
    }
    if (empty) empty.hidden = true;
    if (frame) frame.hidden = false;
    if (mount) mount.hidden = false;
    if (global.HwAccount?.paintAccountPlans) {
      global.HwAccount.paintAccountPlans();
    }
    bindTierDetailModal();
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
      if (!trigger) return;
      const sellup = document.getElementById("hw-v5-sellup");
      const noplanSellup = document.getElementById("hw-v5-noplan-sellup");
      const noHwSellup = document.getElementById("hw-v5-no-hw-sellup");
      const accountSellup = document.getElementById("hw-v5-account-sellup");
      if (accountSellup?.contains(trigger)) return;
      if (
        !sellup?.contains(trigger) &&
        !noplanSellup?.contains(trigger) &&
        !noHwSellup?.contains(trigger)
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
      "course-card course-card--locked hw-addon-card hw-hub-v5-sellup-card hw-hub-v5-sellup-card--weekly hw-hub-v5-sellup-card--clickable";
    article.tabIndex = 0;
    article.setAttribute("role", "link");
    article.setAttribute(
      "aria-label",
      "Unlock weekly homework — Student Special $" + price + " per month"
    );
    article.innerHTML =
      LOCK_SVG +
      "<h3 class=\"course-card__title\">Weekly homework</h3>" +
      '<p class="course-card__desc">' +
      escapeHtml(desc) +
      "</p>" +
      '<div class="course-card__footer">' +
      '<span class="course-card__status" aria-hidden="true">' +
      '<span class="course-card__status-text course-card__status-text--locked">LOCKED</span>' +
      '<span class="course-card__status-text course-card__status-text--unlock">UNLOCK?</span>' +
      "</span>" +
      '<span class="course-card__price" aria-label="' +
      priceAriaLabel +
      '">' +
      priceInner +
      "</span>" +
      "</div>";

    function goStudentSpecialCheckout() {
      if (global.HwCheckout?.startCheckout) {
        global.HwCheckout.startCheckout("student-special", { forcePaypal: true });
        try {
          sessionStorage.removeItem("jlm-stuspec-focus");
        } catch {
          /* ignore */
        }
        return;
      }
      alert(
        "Weekly homework for lesson students ($" +
          price +
          "/mo; standalone Premium is $" +
          comparePrice +
          "/mo) — open Student Special checkout after login."
      );
    }

    article.addEventListener("click", (event) => {
      event.preventDefault();
      goStudentSpecialCheckout();
    });
    article.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      goStudentSpecialCheckout();
    });
    return article;
  }

  function buildStudentUltraCard() {
    const price = global.HwAuth?.STUDENT_ULTRA_PRICE || 25;
    const comparePrice = global.HwAuth?.STUDENT_ULTRA_COMPARE_PRICE || 49;
    const priceInner =
      '<span class="hw-hub-v5-price-compare" aria-hidden="true">$' +
      comparePrice +
      "</span>$" +
      price +
      '<span class="course-card__price-suffix">/mo</span>';

    const article = document.createElement("article");
    article.className =
      "course-card course-card--locked hw-hub-tier-plan hw-hub-tier-plan--video hw-hub-v5-sellup-card hw-hub-v5-sellup-card--clickable";
    article.tabIndex = 0;
    article.setAttribute("role", "link");
    article.setAttribute(
      "aria-label",
      "Unlock Student Ultra — video feedback $" +
        price +
        " per month, standalone Ultra is $" +
        comparePrice
    );
    article.innerHTML =
      '<p class="hw-hub-tier-plan__badge hw-hub-tier-plan__badge--video">Video</p>' +
      LOCK_SVG +
      '<h3 class="course-card__title">Ultra</h3>' +
      '<p class="course-card__desc">Video notes from JD on each assignment — Student Special rate for lesson students.</p>' +
      '<div class="course-card__footer">' +
      '<span class="course-card__status" aria-hidden="true">' +
      '<span class="course-card__status-text course-card__status-text--locked">LOCKED</span>' +
      '<span class="course-card__status-text course-card__status-text--unlock">UNLOCK?</span>' +
      "</span>" +
      '<span class="course-card__price" aria-label="Student Ultra price: ' +
      price +
      " dollars per month, standalone Ultra is " +
      comparePrice +
      '">' +
      priceInner +
      "</span>" +
      "</div>";

    function goStudentUltraCheckout() {
      if (global.HwCheckout?.startCheckout) {
        global.HwCheckout.startCheckout("student-ultra", { forcePaypal: true });
        return;
      }
      alert(
        "Student Ultra ($" +
          price +
          "/mo; standalone Ultra is $" +
          comparePrice +
          "/mo) — open checkout after login."
      );
    }

    article.addEventListener("click", (event) => {
      event.preventDefault();
      goStudentUltraCheckout();
    });
    article.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      goStudentUltraCheckout();
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
      "</div>";
    return article;
  }

  function sellupCaptionText(variant) {
    if (variant === "upgrade-lessons") {
      return "Let\u2019s keep learning \u2014 upgrade or take lessons";
    }
    if (variant === "weekly") {
      return "Weekly homework \u2014 Student Special";
    }
    if (variant === "student_no_hw") {
      return "Weekly homework \u2014 Student Special";
    }
    if (variant === "student_ultra") {
      return "Student Ultra \u2014 video feedback from JD";
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
    const hasStudentUltra = offers.some((o) => o.kind === "tier" && o.studentUltra);
    if (hasWeekly && offers.length === 1 && offers[0].studentSpecial) return "student_no_hw";
    if (hasWeekly) return "weekly";
    if (hasStudentUltra) return "student_ultra";
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
      '<h2 class="hw-hub-v5-no-hw__title" id="hw-v5-no-hw-title">Homework between lessons</h2>' +
      '<p class="hw-hub-v5-no-hw__desc">Add weekly homework for practice and feedback from JD.</p>' +
      '<p class="hw-hub-v5-sellup-caption" id="hw-v5-no-hw-sellup-caption" hidden></p>' +
      '<div class="hw-hub-v5-sellup-frame" id="hw-v5-no-hw-sellup-frame" hidden>' +
      '<div class="hw-hub-v5-sellup" id="hw-v5-no-hw-sellup" aria-label="Weekly homework add-on"></div>' +
      "</div>";
    return empty;
  }

  function ensurePlanWaiting() {
    let card = document.getElementById("hw-v5-plan-waiting");
    if (card) return card;

    card = document.createElement("section");
    card.className = "hw-hub-v5-plan-waiting hw-hub-worksheet-card";
    card.id = "hw-v5-plan-waiting";
    card.hidden = true;
    card.setAttribute("aria-labelledby", "hw-v5-plan-waiting-title");
    card.innerHTML =
      '<div class="hw-hub-v5-pending hw-hub-v5-pending--plan" id="hw-v5-plan-waiting-note">' +
      '<p class="hw-hub-v5-pending__line">' +
      '<span class="hw-hub-v5-pending__pulse" aria-hidden="true"></span>' +
      '<strong id="hw-v5-plan-waiting-title">Waiting for JD</strong></p>' +
      '<p class="hw-hub-v5-pending__sub" id="hw-v5-plan-waiting-desc">' +
      "Your plan is active. JD will send your first homework here when it\u2019s ready." +
      "</p></div>";
    return card;
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

  function ensureLessonLinkPills(stack) {
    let tabs = document.getElementById("hw-v5-lesson-tabs");
    if (!tabs) {
      tabs = document.createElement("nav");
      tabs.className = "hw-hub-v5-lesson-tabs";
      tabs.id = "hw-v5-lesson-tabs";
      tabs.setAttribute("aria-label", "Lesson links");
      stack.insertBefore(tabs, stack.firstChild);
    } else {
      tabs.removeAttribute("role");
      tabs.setAttribute("aria-label", "Lesson links");
    }

    const makeLink = (id, extraClass, label) => {
      let a = document.getElementById(id);
      if (a && a.tagName !== "A") {
        a.remove();
        a = null;
      }
      if (!a) {
        a = document.createElement("a");
        a.id = id;
        a.href = "#";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.setAttribute("aria-disabled", "true");
      }
      a.className =
        "hw-hub-v5-lesson-tabs__btn" + (extraClass ? " " + extraClass : "");
      a.classList.remove("btn", "btn--primary", "btn--ghost", "btn--full", "btn--sm");
      a.removeAttribute("role");
      a.removeAttribute("aria-selected");
      a.removeAttribute("aria-controls");
      a.removeAttribute("data-lesson-pane");
      a.removeAttribute("type");
      a.textContent = label;
      return a;
    };

    const latest = makeLink("hw-latest-lesson", "", "Latest lesson");
    const playlist = makeLink(
      "hw-lesson-playlist",
      "hw-lesson-playlist",
      "Lesson playlist"
    );
    playlist.hidden = false;
    tabs.replaceChildren(latest, playlist);

    /* Remove leftover nested lesson card UI. */
    stack.querySelectorAll(".hw-grid-lesson, .hw-hub-v5-lesson-pane, .hw-lesson-actions").forEach((el) => {
      el.remove();
    });
    document.querySelectorAll(".hw-grid-lesson").forEach((el) => el.remove());
    document.getElementById("hw-lesson-meta")?.remove();
    document.getElementById("hw-lesson-playlist-meta")?.remove();

    const lessonsTab = document.getElementById("hw-v5-tab-lessons");
    if (lessonsTab) lessonsTab.textContent = "Lessons/Mistakes";

    return tabs;
  }

  function ensureLessonsStack(gridStack, mistakesCard) {
    const existing = document.getElementById("hw-v5-lessons-stack");
    if (existing) {
      ensureLessonLinkPills(existing);
      if (mistakesCard && !existing.contains(mistakesCard)) {
        existing.appendChild(mistakesCard);
      }
      return existing;
    }

    const stack = document.createElement("div");
    stack.className = "hw-hub-v5-lessons-stack";
    stack.id = "hw-v5-lessons-stack";
    ensureLessonLinkPills(stack);
    if (mistakesCard) stack.appendChild(mistakesCard);

    /* Drop emptied grid stack leftovers (offline already moved into HW zone). */
    if (gridStack && gridStack.parentNode) {
      gridStack.replaceWith(stack);
    }

    return stack;
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
      const planWaiting = ensurePlanWaiting();
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
        v4Homework.insertBefore(planWaiting, worksheetSection);
        v4Homework.insertBefore(noHwEmpty, worksheetSection);
      } else {
        v4Homework.prepend(noHwEmpty);
        v4Homework.prepend(planWaiting);
        v4Homework.prepend(noPlanWelcome);
        v4Homework.prepend(completeCard);
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

      const tabsWrap = document.createElement("div");
      tabsWrap.className = "hw-hub-v5-tabs-wrap";

      const tabs = document.createElement("nav");
      tabs.className = "hw-hub-v5-tabs";
      tabs.id = "hw-v5-tabs";
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "Hub sections");
      tabs.innerHTML =
        '<span class="hw-hub-v5-tabs__slider" aria-hidden="true"></span>';
      tabsWrap.appendChild(tabs);

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
      const sachikoCard = document.getElementById("hw-sachiko-card");
      const lessonsStack = ensureLessonsStack(gridStack, mistakesCard);

      below.appendChild(
        wrapBelowPanel("hw-v5-panel-lessons", "lessons", "hw-v5-tab-lessons", lessonsStack)
      );
      below.appendChild(
        wrapBelowPanel("hw-v5-panel-notebook", "notebook", "hw-v5-tab-notebook", notebookDiary)
      );
      if (gamesAndCoursesEnabled() && (gamesCard || sachikoCard)) {
        const gamesStack = document.createElement("div");
        gamesStack.className = "hw-hub-v5-games-stack";
        if (gamesCard) gamesStack.appendChild(gamesCard);
        if (sachikoCard) gamesStack.appendChild(sachikoCard);
        below.appendChild(
          wrapBelowPanel("hw-v5-panel-games", "games", "hw-v5-tab-games", gamesStack)
        );
      } else {
        if (gamesCard) gamesCard.hidden = true;
        if (sachikoCard) sachikoCard.hidden = true;
      }

      const panels = document.createElement("div");
      panels.className = "hw-hub-v5-panels";
      panels.appendChild(homeworkPanel);
      panels.appendChild(below);

      app.appendChild(tabsWrap);
      app.appendChild(panels);

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

  /**
   * Status ping only on HW — worksheet Glass/Cloud host-local point (49.5, 41.4).
   * Hidden on Notebook / Lessons / Games.
   */
  function ensureHubStatusPingHost() {
    const panels = document.querySelector(".hw-hub-v5-panels");
    if (!panels) return null;

    let host = document.getElementById("hw-v5-diary-ping-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "hw-v5-diary-ping-host";
      host.setAttribute("aria-hidden", "false");
    }
    host.className =
      "hw-hub-v5-status-ping-host hw-hub-v5-status-ping-host--diary hw-hub-v5-status-ping-host--hub";
    if (host.parentElement !== panels) panels.appendChild(host);

    const activeTab =
      document.getElementById("hw-v5-app")?.dataset.v5ActiveTab || "homework";
    if (activeTab !== "homework") {
      host.hidden = true;
      host.classList.remove("hw-hub-v5-status-ping-host--parked");
      return null;
    }

    const PING_X = 49.5;
    const PING_Y = 41.4;
    host.classList.remove("hw-hub-v5-status-ping-host--parked");
    host.style.bottom = "";

    const worksheet = document.querySelector(
      "#hw-hub-v4-homework .hw-hub-v2-worksheet"
    );
    if (worksheet) {
      const wr = worksheet.getBoundingClientRect();
      const pr = panels.getBoundingClientRect();
      /* Only pin to Glass/Cloud when the worksheet is actually laid out —
         otherwise (49.5, 41.4) lands on the tab row and blocks nav. */
      if (wr.width > 40 && wr.height > 80 && wr.top >= pr.top - 2) {
        host.hidden = false;
        host.style.left = wr.left - pr.left + PING_X + "px";
        host.style.top = wr.top - pr.top + PING_Y + "px";
        return host;
      }
    }
    host.hidden = true;
    return null;
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
    const activeTab =
      document.getElementById("hw-v5-app")?.dataset.v5ActiveTab || "homework";
    const worksheetCard = document.querySelector(
      "#hw-hub-v4-homework .hw-hub-v2-worksheet"
    );
    const stickyHead = worksheetCard?.querySelector(".hw-worksheet__slide-sticky-head");
    const navRow = stickyHead?.querySelector(".hw-worksheet__slide-nav-row");
    /* Still filling the sheet — ping covers the title; only useful after send. */
    const workingOnHw =
      status !== "submitted" &&
      status !== "reviewed" &&
      status !== "acknowledged";

    /* Hide legacy complete-card ping slots — hub uses the persistent host. */
    const reviewHost = document.getElementById("hw-v5-status-ping-host");
    const completeHost = document.getElementById("hw-v5-complete-ping-host");
    if (completeHost) completeHost.hidden = true;
    if (reviewHost) reviewHost.hidden = true;

    if (archive) {
      const hubHost = document.getElementById("hw-v5-diary-ping-host");
      if (hubHost) hubHost.hidden = true;
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
    } else if (activeTab !== "homework") {
      ensureHubStatusPingHost();
      bubble.hidden = true;
      if (hint) hint.hidden = true;
    } else if (workingOnHw && !notebookOpen) {
      /* Active homework sheet — no yellow ping on the title. */
      const hubHost = document.getElementById("hw-v5-diary-ping-host");
      if (hubHost) hubHost.hidden = true;
      bubble.hidden = true;
      if (hint) hint.hidden = true;
    } else {
      ensureCompleteCard();
      const hubHost = ensureHubStatusPingHost();
      if (hubHost) {
        hubHost.hidden = false;
        bubble.classList.add(
          "hw-hub-v5-status-bubble--in-hub",
          "hw-hub-v5-status-bubble--hub-signal",
          "hw-hub-v5-status-bubble--in-diary"
        );
        if (bubble.parentElement !== hubHost) hubHost.appendChild(bubble);
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
    bubble.setAttribute("aria-label", "Working on your homework");
    bubble.setAttribute("aria-describedby", "hw-v5-status-bubble-hint");
    bubble.innerHTML =
      '<span class="hw-hub-v5-status-bubble__ring" aria-hidden="true"></span>' +
      '<span class="hw-hub-v5-status-bubble__dot" aria-hidden="true"></span>';

    const hint = document.createElement("p");
    hint.id = "hw-v5-status-bubble-hint";
    hint.className = "hw-hub-v5-status-bubble__hint";
    hint.setAttribute("role", "tooltip");
    hint.textContent = "Working on your homework";

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
      flashBubbleHint(2200);
      /* Status ping always restores hub status view (closes notebook / archive). */
      if (notebookOpen) closeNotebook();
      if (isArchiveMode()) exitArchiveMode();
      /* Full paint after exit so Past HW / complete card remount reliably. */
      renderAll();
    });
    bubble.addEventListener("pointerdown", (ev) => {
      trackBubblePointer(ev);
    });
    bubble.addEventListener("mouseenter", (ev) => {
      trackBubblePointer(ev);
      scheduleBubbleHint({ immediate: true });
    });
    bubble.addEventListener("mouseleave", hideBubbleHint);
    bubble.addEventListener("focus", () => scheduleBubbleHint({ immediate: true }));
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

  /**
   * Hover / a11y copy for the status ping — plain student language matching
   * pending-card and complete-card phrasing. Uses the custom blue hint only
   * (no native title tooltip).
   */
  function statusBubbleLabels(status, homeExit) {
    let aria;
    let hint;
    const waitingCount = readWaitingHomeworkCount();
    const waitingBit = waitingHoverBit(waitingCount);
    const noHw =
      !studentHasActiveAssignment() ||
      platformSaysNoLinkedAssignment() ||
      document.body.classList.contains("hw-hub-v5-noplan-view") ||
      document.body.classList.contains("hw-hub-v5-no-hw-view") ||
      document.body.classList.contains("hw-hub-v5-plan-waiting-view");

    if (noHw && status !== "reviewed" && status !== "submitted") {
      /* Empty hub / waiting for first or next assignment */
      if (waitingCount > 0) {
        aria = waitingCount === 1 ? "New homework waiting" : waitingCount + " assignments waiting";
        hint = aria;
      } else {
        aria = "Waiting for homework";
        hint = "Waiting for homework";
      }
    } else if (status === "reviewed") {
      aria = "Homework reviewed — JD’s notes are ready" + waitingBit;
      hint = "Homework done — JD’s notes are ready" + waitingBit;
    } else if (status === "acknowledged") {
      if (waitingCount > 0) {
        aria = waitingCount === 1 ? "New homework waiting" : waitingCount + " assignments waiting";
        hint = aria;
      } else {
        aria = "Waiting for your next homework";
        hint = "Waiting for JD to send new homework";
      }
    } else if (status === "submitted") {
      aria = "Homework under review" + waitingBit;
      hint = "JD is reviewing your homework" + waitingBit;
    } else {
      /* in_progress / working on assigned HW */
      aria = "Working on your homework" + waitingBit;
      hint = "Working on your homework" + waitingBit;
    }
    if (homeExit) {
      const returnBit = " Click to return to home";
      if (noHw && status !== "reviewed" && status !== "submitted") {
        aria =
          (waitingCount > 0
            ? waitingCount === 1
              ? "New homework waiting."
              : waitingCount + " assignments waiting."
            : "Waiting for homework.") + returnBit;
        hint = aria;
      } else if (status === "reviewed") {
        aria = "JD’s notes are ready" + waitingBit + "." + returnBit;
        hint = "JD’s notes are ready" + waitingBit + "." + returnBit;
      } else if (status === "acknowledged") {
        aria =
          (waitingCount > 0
            ? waitingCount === 1
              ? "New homework waiting."
              : waitingCount + " assignments waiting."
            : "Waiting for new homework.") + returnBit;
        hint = aria;
      } else if (status === "submitted") {
        aria = "HW under review" + waitingBit + "." + returnBit;
        hint = "HW under review" + waitingBit + "." + returnBit;
      } else {
        aria = "Working on your homework" + waitingBit + "." + returnBit;
        hint = "Working on your homework" + waitingBit + "." + returnBit;
      }
    }
    return { aria: aria, hint: hint };
  }

  function renderStatusBubble(status) {
    const archive = isArchiveMode();
    ensureStatusBubble();
    bindStatusBubble();
    bindBubblePointerTrack();
    mountStatusBubble(status);
    /* Remount once after layout — avoid stacked 250ms/900ms remount spam. */
    window.requestAnimationFrame(() => mountStatusBubble(status));
    if (archive && !notebookOpen) {
      window.setTimeout(() => mountStatusBubble(status), 400);
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
    const labels = statusBubbleLabels(status, homeExit);

    if (status === "reviewed") {
      bubble.classList.add("hw-hub-v5-status-bubble--reviewed");
    } else if (status === "acknowledged") {
      bubble.classList.add("hw-hub-v5-status-bubble--acked");
    } else {
      bubble.classList.add("hw-hub-v5-status-bubble--reviewing");
    }

    bubble.setAttribute("aria-label", labels.aria);
    bubble.removeAttribute("title");
    if (hint) {
      /* Don't force the tip visible when the ping itself is hidden (active HW). */
      hint.hidden = !!bubble.hidden;
      hint.textContent = labels.hint;
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
      if (acknowledged) {
        const waitingCount = readWaitingHomeworkCount();
        const line = acked.querySelector(".hw-hub-v5-pending__line strong");
        const sub = acked.querySelector(".hw-hub-v5-pending__sub");
        if (line) {
          line.textContent =
            waitingCount > 0
              ? waitingCount === 1
                ? "New homework waiting."
                : waitingCount + " assignments waiting."
              : "Waiting for your next assignment.";
        }
        if (sub) {
          sub.textContent =
            waitingCount > 0
              ? "Refresh or reopen Homework Hub to load the next sheet."
              : "JD got your “done reviewing” ping — new homework will show up here when it’s ready.";
        }
      }
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
      if (offer.kind === "tier" && offer.studentUltra) node = buildStudentUltraCard();
      else if (offer.kind === "tier") node = buildTierCard(offer.plan);
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

  function renderPlanWaiting(show) {
    const card = document.getElementById("hw-v5-plan-waiting");
    if (card) {
      if (show) {
        const copy = planWaitingCopy();
        const title = card.querySelector("#hw-v5-plan-waiting-title");
        const desc = card.querySelector("#hw-v5-plan-waiting-desc");
        if (title) title.textContent = copy.title;
        if (desc) desc.textContent = copy.desc;
      }
      card.hidden = !show;
    }
    document.body.classList.toggle("hw-hub-v5-plan-waiting-view", show);
  }

  let notebookRefreshQueued = false;
  let notebookCacheKey = "";
  let notebookCachePacks = null;
  let notebookOpen = false;
  let notebookPageIndex = 0;
  let notebookUiBound = false;
  let notebookBookId = "daily";
  let notebookSearchQuery = "";
  let dailyNotebookDateKey = "";
  let dailyNotebookTodayKey = "";
  let dailyNotebookText = "";
  let dailyNotebookSaveTimer = 0;
  let dailyNotebookLoadGen = 0;
  let dailyNotebookDirty = false;
  let dailyNotebookStatus = "";
  let dailyNotebookDates = [];
  /** dateKey → text, filled from API for Daily notebook search. */
  let dailyNotebookTextCache = Object.create(null);
  let kanjiNotebookPageIndex = 0;
  let kanjiNotebookPages = [0];
  let kanjiNotebookText = "";
  let kanjiNotebookSaveTimer = 0;
  let kanjiNotebookLoadGen = 0;
  let kanjiNotebookDirty = false;
  /** pageIndex → text, filled from API for Kanji notebook search. */
  let kanjiNotebookTextCache = Object.create(null);
  const KANJI_NOTEBOOK_COLS = 4;
  const KANJI_NOTEBOOK_ROWS = 5;
  const KANJI_NOTEBOOK_CELLS = KANJI_NOTEBOOK_COLS * KANJI_NOTEBOOK_ROWS;

  const NOTEBOOK_WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"];

  const NOTEBOOK_BOOK_DEFAULTS = [
    { id: "daily", label: "Daily Notebook", paper: "lined" },
    { id: "hw", label: "HW Notebook", paper: "lined" },
    { id: "kanji", label: "Kanji Notebook", paper: "kanji" },
  ];

  function notebookCustomBooksKey() {
    const username = String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
    return username ? "hw-nb-custom-books:" + username : "hw-nb-custom-books";
  }

  function loadCustomNotebookBooks() {
    try {
      const raw = localStorage.getItem(notebookCustomBooksKey());
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      return list
        .map((item) => ({
          id: String(item?.id || "").trim(),
          label: String(item?.label || "").trim(),
          paper: item?.paper === "kanji" ? "kanji" : "lined",
        }))
        .filter((item) => item.id && item.label);
    } catch {
      return [];
    }
  }

  function saveCustomNotebookBooks(list) {
    try {
      localStorage.setItem(notebookCustomBooksKey(), JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  function getNotebookBooks() {
    return NOTEBOOK_BOOK_DEFAULTS.concat(loadCustomNotebookBooks());
  }

  function getActiveNotebookBook() {
    const books = getNotebookBooks();
    return books.find((b) => b.id === notebookBookId) || books[0];
  }

  function formatNotebookWhen(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      /* Prefer Japan calendar day for the notebook date line. */
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        weekday: "short",
      }).formatToParts(d);
      const get = (type) => parts.find((p) => p.type === type)?.value || "";
      const weekEn = get("weekday");
      const weekMap = {
        Sun: "日",
        Mon: "月",
        Tue: "火",
        Wed: "水",
        Thu: "木",
        Fri: "金",
        Sat: "土",
      };
      const w =
        weekMap[weekEn] ||
        NOTEBOOK_WEEKDAYS_JA[d.getDay()] ||
        "";
      return (
        get("year") +
        "年" +
        get("month") +
        "月" +
        get("day") +
        "日（" +
        w +
        "）"
      );
    } catch {
      return "";
    }
  }

  function tokyoDateKeyFromDate(from) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(from || new Date());
  }

  function formatNotebookDateKey(dateKey) {
    const key = String(dateKey || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
    const [y, m, d] = key.split("-").map(Number);
    /* Noon UTC keeps the Japan calendar day stable for formatting. */
    return formatNotebookWhen(new Date(Date.UTC(y, m - 1, d, 3, 0, 0)).toISOString());
  }

  function shiftNotebookDateKey(dateKey, deltaDays) {
    const [y, m, d] = String(dateKey || "")
      .split("-")
      .map(Number);
    if (!y || !m || !d) return tokyoDateKeyFromDate();
    return tokyoDateKeyFromDate(new Date(Date.UTC(y, m - 1, d + deltaDays, 3, 0, 0)));
  }

  function syncDailyNotebookDates(rawDates) {
    const today = dailyNotebookTodayKey || tokyoDateKeyFromDate();
    dailyNotebookDates = (Array.isArray(rawDates) ? rawDates : [])
      .map((k) => String(k || "").trim())
      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k <= today)
      .sort();
  }

  function syncDailyNotebookTextCache(rawTexts) {
    if (!rawTexts || typeof rawTexts !== "object") return;
    Object.keys(rawTexts).forEach((k) => {
      const key = String(k || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      dailyNotebookTextCache[key] = String(rawTexts[k] || "");
    });
  }

  /** First page = earliest saved entry day; if none yet, today only. */
  function dailyNotebookFirstKey() {
    const today = dailyNotebookTodayKey || tokyoDateKeyFromDate();
    return dailyNotebookDates[0] || today;
  }

  /** Calendar days from first saved entry through today (inclusive). */
  function dailyNotebookDayKeys() {
    const first = dailyNotebookFirstKey();
    const today = dailyNotebookTodayKey || tokyoDateKeyFromDate();
    const keys = [];
    let cur = first;
    for (let i = 0; i < 4000 && cur <= today; i += 1) {
      keys.push(cur);
      if (cur === today) break;
      cur = shiftNotebookDateKey(cur, 1);
    }
    return keys;
  }

  function dailyNotebookDaySearchText(dateKey) {
    const key = String(dateKey || "");
    const label = formatNotebookDateKey(key);
    const text =
      key === dailyNotebookDateKey
        ? dailyNotebookText
        : String(dailyNotebookTextCache[key] || "");
    return [key, label, text]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
  }

  function filterDailyNotebookDayKeys() {
    const keys = dailyNotebookDayKeys();
    const q = getNotebookSearchQuery().toLowerCase();
    if (!q) return keys;
    return keys.filter((key) => dailyNotebookDaySearchText(key).includes(q));
  }

  function updateDailyNotebookPagerUi() {
    const counter = document.getElementById("hw-notebook-counter");
    const prevBtn = document.getElementById("hw-notebook-prev");
    const nextBtn = document.getElementById("hw-notebook-next");
    const q = getNotebookSearchQuery();
    const keys = filterDailyNotebookDayKeys();
    let idx = keys.indexOf(dailyNotebookDateKey);
    if (idx < 0 && !q) {
      dailyNotebookDateKey = keys[keys.length - 1] || dailyNotebookTodayKey;
      idx = Math.max(0, keys.indexOf(dailyNotebookDateKey));
    }
    if (counter) {
      if (q && !keys.length) {
        counter.textContent = "0 of 0";
      } else if (idx < 0) {
        counter.textContent = keys.length ? "— of " + keys.length : "0 of 0";
      } else {
        counter.textContent = keys.length
          ? idx + 1 + " of " + keys.length
          : "1 of 1";
      }
    }
    if (prevBtn) {
      prevBtn.disabled = idx <= 0;
      prevBtn.setAttribute("aria-label", "Previous day");
    }
    if (nextBtn) {
      nextBtn.disabled = idx < 0 || idx >= keys.length - 1;
      nextBtn.setAttribute("aria-label", "Next day");
    }
  }

  function packDisplayTitle(pack) {
    const stripDatePrefix = (raw) =>
      String(raw || "")
        .trim()
        .replace(/^\d{4}-\d{2}-\d{2}\s*[—–\-:・]\s*/u, "")
        .replace(
          /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?\s*[—–\-:・]\s*/iu,
          ""
        )
        .trim();

    /* Prefer clean HW title; drop leftover "2026-06-17 — …" date prefixes. */
    const title = stripDatePrefix(pack?.title);
    const lesson = stripDatePrefix(pack?.lessonName);
    return title || lesson || String(pack?.title || pack?.lessonName || "").trim() || "Homework";
  }

  function notebookRowSearchText(row) {
    return [
      row?.studentText,
      row?.studentAnchor,
      row?.jdText,
      row?.teacherText,
      row?.commentText,
      typeof row?.slideIndex === "number" ? "Q" + (row.slideIndex + 1) : "",
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join("\n");
  }

  function notebookPackSearchText(pack) {
    const iso = pack?.reviewedAt || pack?.savedAt || "";
    const when = formatNotebookWhen(iso);
    const title = packDisplayTitle(pack);
    const rowText = (Array.isArray(pack?.rows) ? pack.rows : [])
      .map(notebookRowSearchText)
      .join("\n");
    return [when, title, iso, pack?.lessonName, pack?.title, rowText]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
  }

  function getNotebookSearchQuery() {
    const input = document.getElementById("hw-notebook-search");
    if (input) notebookSearchQuery = String(input.value || "");
    return String(notebookSearchQuery || "").trim();
  }

  function filterNotebookPacks(packs) {
    const usable = usableNotebookPacks(packs);
    const q = getNotebookSearchQuery().toLowerCase();
    if (!q) return usable;

    return usable
      .map((pack) => {
        const title = packDisplayTitle(pack).toLowerCase();
        const when = formatNotebookWhen(pack.reviewedAt || pack.savedAt).toLowerCase();
        const iso = String(pack.reviewedAt || pack.savedAt || "").toLowerCase();
        const packHit =
          title.includes(q) || when.includes(q) || iso.includes(q);

        const matchingRows = (pack.rows || []).filter((row) =>
          notebookRowSearchText(row).toLowerCase().includes(q)
        );

        if (packHit) return pack;
        if (matchingRows.length) {
          return Object.assign({}, pack, { rows: matchingRows });
        }
        return null;
      })
      .filter(Boolean);
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
    /* Leave Notebook tab before archive hash so platform doesn't skip/abort the sheet. */
    if (notebookOpen) {
      setActiveTab("homework", { skipFocus: true });
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

  function ensureNotebookBookTabs(diary) {
    let booksNav = diary.querySelector(".hw-hub-v5-notebook-books");
    if (!booksNav) {
      booksNav = document.createElement("nav");
      booksNav.className = "hw-hub-v5-notebook-books";
      booksNav.id = "hw-notebook-books";
      booksNav.setAttribute("aria-label", "Notebooks");
      diary.insertBefore(booksNav, diary.firstChild);
    }

    const books = getNotebookBooks();
    const active = getActiveNotebookBook();
    notebookBookId = active.id;

    booksNav.replaceChildren();
    books.forEach((book) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v5-notebook-books__btn";
      if (book.id === notebookBookId) btn.classList.add("is-active");
      btn.setAttribute("data-nb-book", book.id);
      btn.setAttribute("aria-pressed", book.id === notebookBookId ? "true" : "false");
      btn.textContent = book.label;
      booksNav.appendChild(btn);
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className =
      "hw-hub-v5-notebook-books__btn hw-hub-v5-notebook-books__btn--add";
    addBtn.setAttribute("data-nb-book-add", "1");
    addBtn.textContent = "Add Notebook";
    booksNav.appendChild(addBtn);
    return booksNav;
  }

  function applyNotebookPaperStyle() {
    const page = document.getElementById("hw-notebook-diary-page");
    const diary = document.getElementById("hw-notebook-diary");
    const book = getActiveNotebookBook();
    if (!page || !book) return;
    page.classList.remove(
      "hw-hub-v5-notebook-diary__page--lined",
      "hw-hub-v5-notebook-diary__page--kanji"
    );
    page.classList.add(
      book.paper === "kanji"
        ? "hw-hub-v5-notebook-diary__page--kanji"
        : "hw-hub-v5-notebook-diary__page--lined"
    );
    page.setAttribute(
      "aria-label",
      book.label + (book.paper === "kanji" ? " — kanji boxes" : " — lined page")
    );
    diary?.classList.toggle("hw-hub-v5-notebook-diary--daily", book.id === "daily");
  }

  function setNotebookBook(bookId) {
    const books = getNotebookBooks();
    const next = books.find((b) => b.id === bookId);
    if (!next) return;
    if (notebookBookId === "daily" && next.id !== "daily") {
      window.clearTimeout(dailyNotebookSaveTimer);
      void flushDailyNotebookSave();
    }
    if (notebookBookId === "kanji" && next.id !== "kanji") {
      window.clearTimeout(kanjiNotebookSaveTimer);
      void flushKanjiNotebookSave();
    }
    notebookBookId = next.id;
    if (next.id === "daily" && !dailyNotebookDateKey) {
      dailyNotebookDateKey = tokyoDateKeyFromDate();
      dailyNotebookTodayKey = dailyNotebookDateKey;
    }
    ensureNotebookBookTabs(ensureNotebookDiary());
    applyNotebookPaperStyle();
    renderNotebookDiaryPage(notebookCachePacks || []);
  }

  function promptAddNotebook() {
    const label = String(
      window.prompt("Name for the new notebook:", "") || ""
    ).trim();
    if (!label) return;
    const custom = loadCustomNotebookBooks();
    const id =
      "custom-" +
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) +
      "-" +
      Date.now().toString(36);
    custom.push({ id, label, paper: "lined" });
    saveCustomNotebookBooks(custom);
    setNotebookBook(id);
  }

  function ensureNotebookSearch(diary) {
    const chrome = diary.querySelector(".hw-hub-v5-notebook-diary__chrome");
    const header = diary.querySelector(".hw-hub-v5-notebook-diary__header");
    const page =
      diary.querySelector("#hw-notebook-diary-page") ||
      document.getElementById("hw-notebook-diary-page");
    if (!chrome || !header) return null;

    /* Prefer querySelector on diary — getElementById misses nodes not yet
       attached to the document, which used to insert a second search bar. */
    let wraps = Array.from(
      diary.querySelectorAll(".hw-hub-v5-notebook-diary__search")
    );
    if (!wraps.length) {
      const orphan = document.getElementById("hw-notebook-search-wrap");
      if (orphan) wraps = [orphan];
    }
    let wrap = wraps[0] || null;
    wraps.slice(1).forEach((extra) => extra.remove());

    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "hw-hub-v5-notebook-diary__search";
      wrap.id = "hw-notebook-search-wrap";
      wrap.innerHTML =
        '<label class="visually-hidden" for="hw-notebook-search">Search notebook</label>' +
        '<input type="search" class="hw-hub-v5-notebook-diary__search-input" id="hw-notebook-search" placeholder="Search\u2026" autocomplete="off" enterkeyhint="search" />';
      if (page && page.parentElement === chrome) {
        chrome.insertBefore(wrap, page);
      } else {
        header.insertAdjacentElement("afterend", wrap);
      }
    } else {
      wrap.id = "hw-notebook-search-wrap";
      const inputEl = wrap.querySelector('input[type="search"]');
      if (inputEl) inputEl.id = "hw-notebook-search";
    }

    const input =
      wrap.querySelector("#hw-notebook-search") ||
      wrap.querySelector('input[type="search"]') ||
      document.getElementById("hw-notebook-search");
    if (input && input.value !== notebookSearchQuery) {
      input.value = notebookSearchQuery;
    }

    wrap.hidden = false;
    updateNotebookSearchPlaceholder();
    return wrap;
  }

  function updateNotebookSearchPlaceholder() {
    const input = document.getElementById("hw-notebook-search");
    const label = document.querySelector('label[for="hw-notebook-search"]');
    if (!input) return;
    const book = getActiveNotebookBook();
    const id = book?.id || "hw";
    let placeholder = "Search\u2026";
    let aria = "Search notebook";
    if (id === "hw") {
      placeholder = "Search comments, homework, dates\u2026";
      aria = "Search HW notebook";
    } else if (id === "daily") {
      placeholder = "Search days, notes, dates\u2026";
      aria = "Search daily notebook";
    } else if (id === "kanji") {
      placeholder = "Search kanji pages\u2026";
      aria = "Search kanji notebook";
    } else {
      placeholder = "Search notebook\u2026";
      aria = "Search " + (book?.label || "notebook");
    }
    input.placeholder = placeholder;
    input.setAttribute("aria-label", aria);
    if (label) label.textContent = aria;
  }

  function ensureNotebookDiary() {
    let diary = document.getElementById("hw-notebook-diary");
    if (!diary) {
      diary = document.createElement("section");
      diary.className = "hw-hub-v5-notebook-diary";
      diary.id = "hw-notebook-diary";
      diary.hidden = false;
      diary.setAttribute("aria-labelledby", "hw-notebook-diary-date");
      diary.innerHTML =
        '<div class="hw-hub-v5-notebook-diary__chrome">' +
        '<header class="hw-hub-v5-notebook-diary__header">' +
        '<div class="hw-hub-v5-notebook-diary__mast">' +
        '<p class="hw-hub-v5-notebook-diary__date" id="hw-notebook-diary-date">Notebook</p>' +
        '<p class="hw-hub-v5-notebook-diary__lesson" id="hw-notebook-diary-lesson" hidden></p>' +
        "</div>" +
        "</header>" +
        '<div class="hw-hub-v5-notebook-diary__search" id="hw-notebook-search-wrap">' +
        '<label class="visually-hidden" for="hw-notebook-search">Search notebook</label>' +
        '<input type="search" class="hw-hub-v5-notebook-diary__search-input" id="hw-notebook-search" placeholder="Search\u2026" autocomplete="off" enterkeyhint="search" />' +
        "</div>" +
        '<div class="hw-hub-v5-notebook-diary__page hw-hub-v5-notebook-diary__page--lined" id="hw-notebook-diary-page" tabindex="0" aria-label="Notebook page"></div>' +
        '<div class="hw-hub-v5-notebook-diary__pager-row" id="hw-notebook-pager-row">' +
        '<nav class="hw-hub-v5-notebook-diary__pager" id="hw-notebook-diary-pager" aria-label="Notebook pages">' +
        '<button type="button" class="hw-hub-v5-notebook-diary__nav" id="hw-notebook-prev" aria-label="Previous assignment page">\u2190</button>' +
        '<p class="hw-hub-v5-notebook-diary__counter" id="hw-notebook-counter" aria-live="polite">1 of 1</p>' +
        '<button type="button" class="hw-hub-v5-notebook-diary__nav" id="hw-notebook-next" aria-label="Next assignment page">\u2192</button>' +
        "</nav>" +
        "</div>" +
        "</div>";
    }

    ensureNotebookBookTabs(diary);
    ensureNotebookSearch(diary);

    /* Status ping lives on the hub panels shell (all tabs), not diary chrome. */
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
    const strayDiaryPing = header?.querySelector("#hw-v5-diary-ping-host");
    if (strayDiaryPing) strayDiaryPing.remove();

    let pagerRow = document.getElementById("hw-notebook-pager-row");
    if (!pagerRow) {
      pagerRow = diary.querySelector(".hw-hub-v5-notebook-diary__pager-row");
      if (pagerRow) pagerRow.id = "hw-notebook-pager-row";
    }

    applyNotebookPaperStyle();

    return diary;
  }

  function clampNotebookPageIndex(usable) {
    const max = Math.max(0, usable.length - 1);
    if (notebookPageIndex < 0) notebookPageIndex = 0;
    if (notebookPageIndex > max) notebookPageIndex = max;
  }

  function updateNotebookEntryHint(usable) {
    /* Hint lived on the old View notebook button — diary page counter covers this now. */
    void usable;
  }

  function setDailyNotebookStatus(msg) {
    dailyNotebookStatus = String(msg || "");
    const el = document.getElementById("hw-notebook-daily-status");
    if (el) el.textContent = dailyNotebookStatus;
  }

  async function flushDailyNotebookSave() {
    if (!dailyNotebookDirty) return;
    const session = getActiveSession();
    const username = String(session?.username || "").trim().toLowerCase();
    const date = dailyNotebookDateKey;
    if (!username || !date) return;

    dailyNotebookDirty = false;
    setDailyNotebookStatus("Saving…");
    try {
      const res = await fetch("/api/daily-notebook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          date,
          text: dailyNotebookText,
        }),
      });
      if (!res.ok) {
        dailyNotebookDirty = true;
        setDailyNotebookStatus("Couldn’t save — try again");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data && Array.isArray(data.dates)) syncDailyNotebookDates(data.dates);
      if (data && data.texts) syncDailyNotebookTextCache(data.texts);
      dailyNotebookTextCache[date] = dailyNotebookText;
      if (data && data.today) dailyNotebookTodayKey = String(data.today);
      updateDailyNotebookPagerUi();
      setDailyNotebookStatus("Saved");
    } catch {
      dailyNotebookDirty = true;
      setDailyNotebookStatus("Couldn’t save — try again");
    }
  }

  function queueDailyNotebookSave() {
    dailyNotebookDirty = true;
    setDailyNotebookStatus("Saving…");
    window.clearTimeout(dailyNotebookSaveTimer);
    dailyNotebookSaveTimer = window.setTimeout(() => {
      void flushDailyNotebookSave();
    }, 650);
  }

  function bindDailyNotebookWriter(textarea) {
    if (!textarea || textarea.dataset.bound === "1") return;
    textarea.dataset.bound = "1";
    textarea.addEventListener("input", () => {
      dailyNotebookText = textarea.value;
      dailyNotebookTextCache[dailyNotebookDateKey] = dailyNotebookText;
      queueDailyNotebookSave();
    });
    textarea.addEventListener("blur", () => {
      window.clearTimeout(dailyNotebookSaveTimer);
      void flushDailyNotebookSave();
    });
  }

  async function loadDailyNotebookDay(dateKey) {
    const session = getActiveSession();
    const username = String(session?.username || "").trim().toLowerCase();
    if (!username) {
      dailyNotebookText = "";
      return { text: "", today: tokyoDateKeyFromDate(), date: dateKey };
    }

    const gen = ++dailyNotebookLoadGen;
    const url =
      "/api/daily-notebook?username=" +
      encodeURIComponent(username) +
      "&date=" +
      encodeURIComponent(dateKey);
    const res = await fetch(url, { cache: "no-store" });
    if (gen !== dailyNotebookLoadGen) return null;
    if (!res.ok) throw new Error("load-failed");
    const data = await res.json().catch(() => ({}));
    if (gen !== dailyNotebookLoadGen) return null;
    dailyNotebookTodayKey = String(data.today || tokyoDateKeyFromDate());
    dailyNotebookDateKey = String(data.date || dateKey);
    dailyNotebookText = String(data.text || "");
    syncDailyNotebookDates(data.dates);
    syncDailyNotebookTextCache(data.texts);
    dailyNotebookTextCache[dailyNotebookDateKey] = dailyNotebookText;
    const first = dailyNotebookFirstKey();
    if (dailyNotebookDateKey < first) dailyNotebookDateKey = first;
    if (dailyNotebookDateKey > dailyNotebookTodayKey) {
      dailyNotebookDateKey = dailyNotebookTodayKey;
    }
    return data;
  }

  async function renderDailyNotebookPage() {
    const diary = ensureNotebookDiary();
    const page = document.getElementById("hw-notebook-diary-page");
    const dateEl = document.getElementById("hw-notebook-diary-date");
    const lessonEl = document.getElementById("hw-notebook-diary-lesson");
    const counter = document.getElementById("hw-notebook-counter");
    const prevBtn = document.getElementById("hw-notebook-prev");
    const nextBtn = document.getElementById("hw-notebook-next");
    const pagerRow = document.getElementById("hw-notebook-pager-row");
    const searchWrap = document.getElementById("hw-notebook-search-wrap");
    if (!page || !dateEl) return;

    applyNotebookPaperStyle();
    if (searchWrap) searchWrap.hidden = false;
    updateNotebookSearchPlaceholder();
    if (pagerRow) pagerRow.hidden = false;

    const query = getNotebookSearchQuery();
    const matches = filterDailyNotebookDayKeys();
    if (query && !matches.length) {
      dateEl.textContent = "No matches";
      if (lessonEl) {
        lessonEl.hidden = false;
        lessonEl.textContent = "Try another word or date";
      }
      page.replaceChildren();
      const empty = document.createElement("p");
      empty.className = "hw-hub-v5-notebook__empty";
      empty.textContent = "No daily notes matched “" + query + "”.";
      page.appendChild(empty);
      document.getElementById("hw-notebook-daily-status")?.remove();
      if (counter) counter.textContent = "0 of 0";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }
    if (query && matches.length && !matches.includes(dailyNotebookDateKey)) {
      dailyNotebookDateKey = matches[0];
    }

    if (!dailyNotebookTodayKey) dailyNotebookTodayKey = tokyoDateKeyFromDate();
    if (!dailyNotebookDateKey || dailyNotebookDateKey > dailyNotebookTodayKey) {
      dailyNotebookDateKey = dailyNotebookTodayKey;
    }

    dateEl.textContent =
      formatNotebookDateKey(dailyNotebookDateKey) || "日常日記";
    if (lessonEl) {
      lessonEl.hidden = false;
      lessonEl.textContent = "日常日記";
    }
    document.getElementById("hw-notebook-diary")?.classList.add(
      "hw-hub-v5-notebook-diary--daily"
    );

    page.replaceChildren();

    const chrome = diary.querySelector(".hw-hub-v5-notebook-diary__chrome");
    let status = document.getElementById("hw-notebook-daily-status");
    if (!status) {
      status = document.createElement("p");
      status.className = "hw-hub-v5-notebook-diary__write-status";
      status.id = "hw-notebook-daily-status";
    } else {
      status.className = "hw-hub-v5-notebook-diary__write-status";
    }
    status.textContent = dailyNotebookStatus || "Loading…";
    if (chrome && status.parentElement !== chrome) {
      chrome.appendChild(status);
    }

    const textarea = document.createElement("textarea");
    textarea.className = "hw-hub-v5-notebook-diary__write";
    textarea.id = "hw-notebook-daily-write";
    textarea.setAttribute("aria-label", "Daily notebook page");
    textarea.placeholder = "なんでも書いてください";
    textarea.spellcheck = true;
    textarea.value = dailyNotebookText;
    textarea.disabled = true;

    page.appendChild(textarea);
    bindDailyNotebookWriter(textarea);

    if (counter) {
      counter.textContent = "…";
    }
    if (prevBtn) {
      prevBtn.disabled = true;
      prevBtn.setAttribute("aria-label", "Previous day");
    }
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.setAttribute("aria-label", "Next day");
    }

    try {
      await loadDailyNotebookDay(dailyNotebookDateKey);
      if (getActiveNotebookBook()?.id !== "daily") return;
      dateEl.textContent =
        formatNotebookDateKey(dailyNotebookDateKey) || "日常日記";
      textarea.value = dailyNotebookText;
      textarea.disabled = false;
      setDailyNotebookStatus(dailyNotebookDirty ? "Saving…" : "Saved");
      updateDailyNotebookPagerUi();
      textarea.focus({ preventScroll: true });
    } catch {
      if (getActiveNotebookBook()?.id !== "daily") return;
      textarea.disabled = false;
      setDailyNotebookStatus("Couldn’t load — try again");
      updateDailyNotebookPagerUi();
    }

    void diary;
  }

  async function stepDailyNotebookDay(delta) {
    window.clearTimeout(dailyNotebookSaveTimer);
    await flushDailyNotebookSave();

    if (!dailyNotebookTodayKey) dailyNotebookTodayKey = tokyoDateKeyFromDate();
    if (!dailyNotebookDateKey) dailyNotebookDateKey = dailyNotebookTodayKey;

    const keys = filterDailyNotebookDayKeys();
    let idx = keys.indexOf(dailyNotebookDateKey);
    if (idx < 0) idx = keys.length - 1;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= keys.length) return;

    dailyNotebookDateKey = keys[nextIdx];
    dailyNotebookText = "";
    dailyNotebookDirty = false;
    setDailyNotebookStatus("Loading…");
    await renderDailyNotebookPage();
  }

  function renderNotebookBlankPage(book) {
    if (book.id === "daily") {
      void renderDailyNotebookPage();
      return;
    }
    if (book.id === "kanji") {
      void renderKanjiNotebookPage();
      return;
    }

    const page = document.getElementById("hw-notebook-diary-page");
    const dateEl = document.getElementById("hw-notebook-diary-date");
    const lessonEl = document.getElementById("hw-notebook-diary-lesson");
    const pagerRow = document.getElementById("hw-notebook-pager-row");
    const searchWrap = document.getElementById("hw-notebook-search-wrap");
    if (!page || !dateEl) return;

    if (searchWrap) searchWrap.hidden = false;
    updateNotebookSearchPlaceholder();

    dateEl.textContent = book.label;
    if (lessonEl) {
      lessonEl.textContent = "Your custom notebook";
      lessonEl.hidden = false;
    }

    page.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "hw-hub-v5-notebook__empty";
    const query = getNotebookSearchQuery();
    empty.textContent = query
      ? "Search isn’t available in this notebook yet."
      : "Empty notebook page — writing coming soon.";
    page.appendChild(empty);
    if (pagerRow) pagerRow.hidden = true;
    document.getElementById("hw-notebook-daily-status")?.remove();
  }

  function syncKanjiNotebookPages(rawPages) {
    const list = (Array.isArray(rawPages) ? rawPages : [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .map((n) => Math.floor(n));
    const uniq = Array.from(new Set(list)).sort((a, b) => a - b);
    if (!uniq.includes(0)) uniq.unshift(0);
    kanjiNotebookPages = uniq;
  }

  function syncKanjiNotebookTextCache(rawTexts) {
    if (!rawTexts || typeof rawTexts !== "object") return;
    Object.keys(rawTexts).forEach((k) => {
      const idx = Number(k);
      if (!Number.isFinite(idx) || idx < 0) return;
      kanjiNotebookTextCache[Math.floor(idx)] = String(rawTexts[k] || "");
    });
  }

  function kanjiNotebookMaxPage() {
    const maxSaved = kanjiNotebookPages.length
      ? Math.max.apply(null, kanjiNotebookPages)
      : 0;
    let max = Math.max(maxSaved, kanjiNotebookPageIndex, 0);
    if (String(kanjiNotebookText || "").replace(/\s/g, "").length) {
      max = Math.max(max, kanjiNotebookPageIndex + 1);
    }
    return max;
  }

  function kanjiNotebookPageSearchText(pageIndex) {
    const idx = Number(pageIndex) || 0;
    const text =
      idx === kanjiNotebookPageIndex
        ? kanjiNotebookText
        : String(kanjiNotebookTextCache[idx] || "");
    return [String(idx + 1), "page " + (idx + 1), text]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
  }

  function filterKanjiNotebookPages() {
    const max = kanjiNotebookMaxPage();
    const all = [];
    for (let i = 0; i <= max; i += 1) all.push(i);
    const q = getNotebookSearchQuery().toLowerCase();
    if (!q) return all;
    return all.filter((idx) => kanjiNotebookPageSearchText(idx).includes(q));
  }

  function updateKanjiNotebookPagerUi() {
    const counter = document.getElementById("hw-notebook-counter");
    const prevBtn = document.getElementById("hw-notebook-prev");
    const nextBtn = document.getElementById("hw-notebook-next");
    const q = getNotebookSearchQuery();
    const pages = filterKanjiNotebookPages();
    let idx = pages.indexOf(kanjiNotebookPageIndex);
    if (idx < 0 && !q) {
      const max = kanjiNotebookMaxPage();
      kanjiNotebookPageIndex = Math.min(Math.max(0, kanjiNotebookPageIndex), max);
      const all = filterKanjiNotebookPages();
      idx = all.indexOf(kanjiNotebookPageIndex);
    }
    if (counter) {
      if (q && !pages.length) {
        counter.textContent = "0 of 0";
      } else if (idx < 0) {
        counter.textContent = pages.length ? "— of " + pages.length : "0 of 0";
      } else {
        counter.textContent = pages.length
          ? idx + 1 + " of " + pages.length
          : "1 of 1";
      }
    }
    if (prevBtn) {
      prevBtn.disabled = idx <= 0;
      prevBtn.setAttribute("aria-label", "Previous kanji page");
    }
    if (nextBtn) {
      nextBtn.disabled = idx < 0 || idx >= pages.length - 1;
      nextBtn.setAttribute("aria-label", "Next kanji page");
    }
  }

  function readKanjiGridText(grid) {
    if (!grid) return "";
    const cells = grid.querySelectorAll(".hw-hub-v5-notebook-kanji-cell");
    let out = "";
    cells.forEach((cell) => {
      out += String(cell.value || "").slice(0, 1) || " ";
    });
    return out.replace(/\s+$/u, "");
  }

  function writeKanjiGridText(grid, text) {
    if (!grid) return;
    const chars = Array.from(String(text || ""));
    const cells = grid.querySelectorAll(".hw-hub-v5-notebook-kanji-cell");
    cells.forEach((cell, i) => {
      const ch = chars[i];
      cell.value = ch && !/\s/u.test(ch) ? ch : "";
    });
    applyKanjiSearchCellFilter(grid);
  }

  /** Dim cells that don’t match the current search (when query is set). */
  function applyKanjiSearchCellFilter(grid) {
    if (!grid) grid = document.getElementById("hw-notebook-kanji-grid");
    if (!grid) return;
    const q = getNotebookSearchQuery().toLowerCase();
    grid.querySelectorAll(".hw-hub-v5-notebook-kanji-cell").forEach((cell) => {
      const v = String(cell.value || "").toLowerCase();
      const hit = !q || !v || v.includes(q) || q.includes(v);
      cell.classList.toggle("hw-hub-v5-notebook-kanji-cell--search-miss", Boolean(q) && !hit);
      cell.classList.toggle("hw-hub-v5-notebook-kanji-cell--search-hit", Boolean(q) && Boolean(v) && hit);
    });
  }

  async function flushKanjiNotebookSave() {
    if (!kanjiNotebookDirty) return;
    const session = getActiveSession();
    const username = String(session?.username || "").trim().toLowerCase();
    if (!username) return;

    kanjiNotebookDirty = false;
    try {
      const res = await fetch("/api/kanji-notebook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          page: kanjiNotebookPageIndex,
          text: kanjiNotebookText,
        }),
      });
      if (!res.ok) {
        kanjiNotebookDirty = true;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data && Array.isArray(data.pages)) syncKanjiNotebookPages(data.pages);
      if (data && data.pageTexts) syncKanjiNotebookTextCache(data.pageTexts);
      kanjiNotebookTextCache[kanjiNotebookPageIndex] = kanjiNotebookText;
      updateKanjiNotebookPagerUi();
    } catch {
      kanjiNotebookDirty = true;
    }
  }

  function queueKanjiNotebookSave() {
    kanjiNotebookDirty = true;
    window.clearTimeout(kanjiNotebookSaveTimer);
    kanjiNotebookSaveTimer = window.setTimeout(() => {
      void flushKanjiNotebookSave();
    }, 650);
  }

  function segmentKanjiGraphemes(raw) {
    const s = String(raw || "").replace(/\s/gu, "");
    if (!s) return [];
    try {
      return Array.from(
        new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(s),
        (part) => part.segment
      );
    } catch {
      return Array.from(s);
    }
  }

  function bindKanjiNotebookGrid(grid) {
    if (!grid || grid.dataset.bound === "1") return;
    grid.dataset.bound = "1";
    const cells = () =>
      Array.from(grid.querySelectorAll(".hw-hub-v5-notebook-kanji-cell"));

    const focusAt = (i) => {
      const list = cells();
      const cell = list[Math.max(0, Math.min(list.length - 1, i))];
      if (!cell || cell.disabled) return;
      cell.focus();
      cell.select();
    };

    const syncFromGrid = () => {
      kanjiNotebookText = readKanjiGridText(grid);
      kanjiNotebookTextCache[kanjiNotebookPageIndex] = kanjiNotebookText;
      queueKanjiNotebookSave();
      updateKanjiNotebookPagerUi();
      applyKanjiSearchCellFilter(grid);
    };

    /** 朝 → 1 square; 朝練 → 2; 練習中 → 3 — one grapheme per square. */
    const placeGraphemesAt = (startIndex, raw) => {
      const chars = segmentKanjiGraphemes(raw);
      if (!chars.length) return;
      const list = cells();
      let i = Math.max(0, startIndex);
      chars.forEach((ch) => {
        if (i >= list.length) return;
        list[i].value = ch;
        i += 1;
      });
      syncFromGrid();
      focusAt(i < list.length ? i : list.length - 1);
    };

    grid.addEventListener("beforeinput", (e) => {
      const cell = e.target.closest?.(".hw-hub-v5-notebook-kanji-cell");
      if (!cell || cell.disabled) return;
      if (e.inputType === "insertFromPaste") return;
      if (e.isComposing) return;
      if (e.inputType && e.inputType.startsWith("insert") && e.data) {
        e.preventDefault();
        placeGraphemesAt(cells().indexOf(cell), e.data);
      }
    });

    grid.addEventListener("compositionend", (e) => {
      const cell = e.target.closest?.(".hw-hub-v5-notebook-kanji-cell");
      if (!cell || cell.disabled) return;
      const raw = cell.value || e.data || "";
      cell.value = "";
      placeGraphemesAt(cells().indexOf(cell), raw);
    });

    grid.addEventListener("input", (e) => {
      const cell = e.target.closest?.(".hw-hub-v5-notebook-kanji-cell");
      if (!cell || cell.disabled) return;
      if (e.isComposing) return;
      const chars = segmentKanjiGraphemes(cell.value);
      if (chars.length <= 1) {
        if (cell.value !== (chars[0] || "")) cell.value = chars[0] || "";
        syncFromGrid();
        if (chars[0]) focusAt(cells().indexOf(cell) + 1);
        return;
      }
      cell.value = "";
      placeGraphemesAt(cells().indexOf(cell), chars.join(""));
    });

    grid.addEventListener("keydown", (e) => {
      const cell = e.target.closest?.(".hw-hub-v5-notebook-kanji-cell");
      if (!cell || cell.disabled) return;
      const list = cells();
      const i = list.indexOf(cell);
      const cols = KANJI_NOTEBOOK_COLS;
      if (e.key === "Backspace") {
        if (cell.value) {
          cell.value = "";
          syncFromGrid();
          e.preventDefault();
          return;
        }
        if (i > 0) {
          e.preventDefault();
          list[i - 1].value = "";
          syncFromGrid();
          focusAt(i - 1);
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        focusAt(i - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        focusAt(i + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusAt(i - cols);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        focusAt(i + cols);
      }
    });

    grid.addEventListener("paste", (e) => {
      const cell = e.target.closest?.(".hw-hub-v5-notebook-kanji-cell");
      if (!cell || cell.disabled) return;
      e.preventDefault();
      placeGraphemesAt(
        cells().indexOf(cell),
        String(e.clipboardData?.getData("text") || "")
      );
    });
  }

  async function loadKanjiNotebookPage(pageIndex) {
    const session = getActiveSession();
    const username = String(session?.username || "").trim().toLowerCase();
    if (!username) {
      kanjiNotebookText = "";
      return { text: "", page: pageIndex, pages: [0] };
    }

    const gen = ++kanjiNotebookLoadGen;
    const url =
      "/api/kanji-notebook?username=" +
      encodeURIComponent(username) +
      "&page=" +
      encodeURIComponent(String(pageIndex));
    const res = await fetch(url, { cache: "no-store" });
    if (gen !== kanjiNotebookLoadGen) return null;
    if (!res.ok) throw new Error("load-failed");
    const data = await res.json().catch(() => ({}));
    if (gen !== kanjiNotebookLoadGen) return null;
    kanjiNotebookPageIndex = Number(data.page) || 0;
    kanjiNotebookText = String(data.text || "");
    syncKanjiNotebookPages(data.pages);
    syncKanjiNotebookTextCache(data.pageTexts);
    kanjiNotebookTextCache[kanjiNotebookPageIndex] = kanjiNotebookText;
    return data;
  }

  async function renderKanjiNotebookPage() {
    const page = document.getElementById("hw-notebook-diary-page");
    const dateEl = document.getElementById("hw-notebook-diary-date");
    const lessonEl = document.getElementById("hw-notebook-diary-lesson");
    const pagerRow = document.getElementById("hw-notebook-pager-row");
    const searchWrap = document.getElementById("hw-notebook-search-wrap");
    const counter = document.getElementById("hw-notebook-counter");
    const prevBtn = document.getElementById("hw-notebook-prev");
    const nextBtn = document.getElementById("hw-notebook-next");
    if (!page || !dateEl) return;

    applyNotebookPaperStyle();
    if (searchWrap) searchWrap.hidden = false;
    updateNotebookSearchPlaceholder();
    if (pagerRow) pagerRow.hidden = false;
    document.getElementById("hw-notebook-daily-status")?.remove();

    const query = getNotebookSearchQuery();
    /* Prefer cached texts so search can filter before/without a full reload loop. */
    const matches = filterKanjiNotebookPages();
    if (query && !matches.length) {
      dateEl.textContent = "No matches";
      if (lessonEl) {
        lessonEl.hidden = false;
        lessonEl.textContent = "Try another character or page number";
      }
      page.replaceChildren();
      const empty = document.createElement("p");
      empty.className = "hw-hub-v5-notebook__empty";
      empty.textContent = "No kanji pages matched “" + query + "”.";
      page.appendChild(empty);
      if (counter) counter.textContent = "0 of 0";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }
    if (query && matches.length && !matches.includes(kanjiNotebookPageIndex)) {
      kanjiNotebookPageIndex = matches[0];
    }

    dateEl.textContent = "Kanji Notebook";
    if (lessonEl) {
      lessonEl.hidden = true;
      lessonEl.textContent = "";
    }

    page.replaceChildren();
    const grid = document.createElement("div");
    grid.className = "hw-hub-v5-notebook-kanji-grid";
    grid.id = "hw-notebook-kanji-grid";
    grid.style.setProperty("--hw-kanji-cols", String(KANJI_NOTEBOOK_COLS));
    grid.style.setProperty("--hw-kanji-rows", String(KANJI_NOTEBOOK_ROWS));
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Kanji practice squares");

    for (let i = 0; i < KANJI_NOTEBOOK_CELLS; i += 1) {
      const col = i % KANJI_NOTEBOOK_COLS;
      const row = Math.floor(i / KANJI_NOTEBOOK_COLS);
      const input = document.createElement("input");
      input.type = "text";
      input.className = "hw-hub-v5-notebook-kanji-cell";
      input.setAttribute("role", "gridcell");
      input.setAttribute("aria-label", "Kanji square " + (i + 1));
      input.setAttribute("autocomplete", "off");
      input.setAttribute("autocapitalize", "off");
      input.setAttribute("spellcheck", "false");
      input.setAttribute("inputmode", "text");
      input.setAttribute("lang", "ja");
      input.maxLength = 24;
      input.disabled = true;
      if (col === KANJI_NOTEBOOK_COLS - 1) {
        input.setAttribute("data-kanji-edge-right", "1");
      }
      if (row === KANJI_NOTEBOOK_ROWS - 1) {
        input.setAttribute("data-kanji-edge-bottom", "1");
      }
      grid.appendChild(input);
    }

    page.appendChild(grid);
    bindKanjiNotebookGrid(grid);
    updateKanjiNotebookPagerUi();

    try {
      await loadKanjiNotebookPage(kanjiNotebookPageIndex);
      if (getActiveNotebookBook()?.id !== "kanji") return;
      writeKanjiGridText(grid, kanjiNotebookText);
      grid.querySelectorAll(".hw-hub-v5-notebook-kanji-cell").forEach((cell) => {
        cell.disabled = false;
      });
      updateKanjiNotebookPagerUi();
      const firstEmpty = Array.from(
        grid.querySelectorAll(".hw-hub-v5-notebook-kanji-cell")
      ).find((cell) => !cell.value);
      (firstEmpty || grid.querySelector(".hw-hub-v5-notebook-kanji-cell"))?.focus({
        preventScroll: true,
      });
    } catch {
      if (getActiveNotebookBook()?.id !== "kanji") return;
      grid.querySelectorAll(".hw-hub-v5-notebook-kanji-cell").forEach((cell) => {
        cell.disabled = false;
      });
      updateKanjiNotebookPagerUi();
    }
  }

  async function stepKanjiNotebookPage(delta) {
    window.clearTimeout(kanjiNotebookSaveTimer);
    await flushKanjiNotebookSave();

    const pages = filterKanjiNotebookPages();
    let idx = pages.indexOf(kanjiNotebookPageIndex);
    if (idx < 0) idx = 0;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= pages.length) return;

    kanjiNotebookPageIndex = pages[nextIdx];
    kanjiNotebookText = "";
    kanjiNotebookDirty = false;
    await renderKanjiNotebookPage();
  }

  function renderNotebookDiaryPage(packs) {
    const diary = ensureNotebookDiary();
    const page = document.getElementById("hw-notebook-diary-page");
    const dateEl = document.getElementById("hw-notebook-diary-date");
    const lessonEl = document.getElementById("hw-notebook-diary-lesson");
    const counter = document.getElementById("hw-notebook-counter");
    const prevBtn = document.getElementById("hw-notebook-prev");
    const nextBtn = document.getElementById("hw-notebook-next");
    const pagerRow = document.getElementById("hw-notebook-pager-row");
    const searchWrap = document.getElementById("hw-notebook-search-wrap");
    if (!page || !dateEl) return;

    applyNotebookPaperStyle();
    const book = getActiveNotebookBook();
    if (book.id !== "hw") {
      renderNotebookBlankPage(book);
      return;
    }

    if (searchWrap) searchWrap.hidden = false;
    updateNotebookSearchPlaceholder();
    document.getElementById("hw-notebook-daily-status")?.remove();

    const query = getNotebookSearchQuery();
    const usable = filterNotebookPacks(packs);
    clampNotebookPageIndex(usable);
    updateNotebookEntryHint(usable);

    page.replaceChildren();
    if (pagerRow) pagerRow.hidden = false;

    if (!usable.length) {
      if (query) {
        dateEl.textContent = "No matches";
        if (lessonEl) {
          lessonEl.hidden = false;
          lessonEl.textContent = "Try another word, homework title, or date";
        }
        const empty = document.createElement("p");
        empty.className = "hw-hub-v5-notebook__empty";
        empty.textContent = "No comments or homework matched “" + query + "”.";
        page.appendChild(empty);
      } else {
        dateEl.textContent = "HW Notebook";
        if (lessonEl) {
          lessonEl.hidden = false;
          lessonEl.textContent = "Notes from reviewed homework";
        }
        const empty = document.createElement("p");
        empty.className = "hw-hub-v5-notebook__empty";
        empty.textContent =
          "No notebook pages yet. Notes from JD will appear here after he reviews your homework.";
        page.appendChild(empty);
      }
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
    /* Diary lives in the Notebook tab panel — keep it visible whenever mounted. */
    diary.hidden = false;
    if (notebookOpen) {
      renderNotebookDiaryPage(notebookCachePacks || []);
    }
    /* Status ping remount is owned by setActiveTab / renderHomeworkZone. */
  }

  function openNotebook() {
    setActiveTab("notebook", { scrollTop: true });
    renderHomeworkZone(getHubStatus());
  }

  function closeNotebook() {
    if (!notebookOpen) return;
    setActiveTab("homework");
    /* Full paint restores complete card + Past HW entry (not just zone flags). */
    renderAll();
  }

  /**
   * Leave Notebook tab / empty archive chrome, then open the Past HW list.
   * Opening Past HW while the diary owned the status slot left archive hash +
   * empty mount with Past HW permanently hidden.
   */
  function openPastHomeworkFromHub() {
    if (notebookOpen) {
      setActiveTab("homework", { skipFocus: true });
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
      if (gamesAndCoursesEnabled()) {
        setActiveTab("games", { scrollTop: true });
      }
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
    const book = getActiveNotebookBook();
    if (book?.id === "daily") {
      void stepDailyNotebookDay(delta);
      return;
    }
    if (book?.id === "kanji") {
      void stepKanjiNotebookPage(delta);
      return;
    }
    if (book?.id !== "hw") return;
    const usable = filterNotebookPacks(notebookCachePacks || []);
    if (!usable.length) return;
    const next = notebookPageIndex + delta;
    if (next < 0 || next >= usable.length) return;
    notebookPageIndex = next;
    renderNotebookDiaryPage(notebookCachePacks || []);
  }

  function bindNotebookUi() {
    if (notebookUiBound) return;
    notebookUiBound = true;

    document.addEventListener("click", (e) => {
      const addBtn = e.target.closest("[data-nb-book-add]");
      if (addBtn) {
        e.preventDefault();
        promptAddNotebook();
        return;
      }
      const bookBtn = e.target.closest("[data-nb-book]");
      if (bookBtn) {
        e.preventDefault();
        setNotebookBook(bookBtn.getAttribute("data-nb-book") || "daily");
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

    document.addEventListener("input", (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.id !== "hw-notebook-search") return;
      notebookSearchQuery = String(input.value || "");
      applyNotebookSearchFromInput(input);
    });
  }

  function applyNotebookSearchFromInput(input) {
    const book = getActiveNotebookBook();
    const id = book?.id || "hw";

    if (id === "hw") {
      notebookPageIndex = 0;
      renderNotebookDiaryPage(notebookCachePacks || []);
    } else if (id === "daily") {
      void applyDailyNotebookSearch();
    } else if (id === "kanji") {
      void applyKanjiNotebookSearch();
    } else {
      renderNotebookBlankPage(book);
    }

    /* Keep typing focus — render rebuilds page content, not the input. */
    if (document.activeElement !== input) {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    }
  }

  async function applyDailyNotebookSearch() {
    const query = getNotebookSearchQuery();
    const matches = filterDailyNotebookDayKeys();
    const write = document.getElementById("hw-notebook-daily-write");

    if (query && !matches.length) {
      await renderDailyNotebookPage();
      return;
    }

    if (query && matches.length && !matches.includes(dailyNotebookDateKey)) {
      window.clearTimeout(dailyNotebookSaveTimer);
      await flushDailyNotebookSave();
      dailyNotebookDateKey = matches[0];
      dailyNotebookText = String(dailyNotebookTextCache[dailyNotebookDateKey] || "");
      dailyNotebookDirty = false;
      await renderDailyNotebookPage();
      return;
    }

    /* Stay on the same day — only refresh pager / chrome, keep the writer focused. */
    if (write && (!query || matches.includes(dailyNotebookDateKey))) {
      const dateEl = document.getElementById("hw-notebook-diary-date");
      const lessonEl = document.getElementById("hw-notebook-diary-lesson");
      if (dateEl) {
        dateEl.textContent =
          formatNotebookDateKey(dailyNotebookDateKey) || "日常日記";
      }
      if (lessonEl) {
        lessonEl.hidden = false;
        lessonEl.textContent = "日常日記";
      }
      updateDailyNotebookPagerUi();
      return;
    }

    await renderDailyNotebookPage();
  }

  async function applyKanjiNotebookSearch() {
    const query = getNotebookSearchQuery();
    const grid = document.getElementById("hw-notebook-kanji-grid");
    const matches = filterKanjiNotebookPages();

    if (!query) {
      if (grid) {
        applyKanjiSearchCellFilter(grid);
        updateKanjiNotebookPagerUi();
        return;
      }
      await renderKanjiNotebookPage();
      return;
    }

    if (!matches.length) {
      await renderKanjiNotebookPage();
      return;
    }

    if (!matches.includes(kanjiNotebookPageIndex)) {
      window.clearTimeout(kanjiNotebookSaveTimer);
      await flushKanjiNotebookSave();
      kanjiNotebookPageIndex = matches[0];
      kanjiNotebookText = String(kanjiNotebookTextCache[kanjiNotebookPageIndex] || "");
      kanjiNotebookDirty = false;
      await renderKanjiNotebookPage();
      return;
    }

    if (!grid) {
      await renderKanjiNotebookPage();
      return;
    }
    applyKanjiSearchCellFilter(grid);
    updateKanjiNotebookPagerUi();
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
      if (!document.getElementById("hw-notebook-diary")) return;
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

  function clearHubBootGate() {
    document.documentElement.classList.remove("hw-boot-pending");
    const boot = document.getElementById("hw-hub-boot");
    if (boot) {
      boot.hidden = true;
      boot.remove();
    }
    document.getElementById("hw-boot-gate-css")?.remove();
  }

  function bindHubBootDismiss() {
    const boot = document.getElementById("hw-hub-boot");
    if (!boot || boot.dataset.dismissBound === "1") return;
    boot.dataset.dismissBound = "1";
    boot.style.pointerEvents = "auto";
    boot.addEventListener(
      "click",
      () => {
        clearHubBootGate();
      },
      { once: true }
    );
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
    /* While hub is still booting, never keep a leftover worksheet from a prior paint. */
    if (!hubReady && mount.querySelector(".hw-worksheet, form.hw-worksheet, [data-assignment-id]")) {
      mount.replaceChildren();
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

  function platformSaysNoLinkedAssignment() {
    if (document.body.classList.contains("hw-hub-no-linked-assignment")) return true;
    const intro = document.getElementById("hw-v4-worksheet-intro");
    const introText = String(intro?.textContent || "");
    return Boolean(intro && /no assignment/i.test(introText));
  }

  function studentHasActiveAssignment() {
    /* Platform already settled: no HW linked — don't trust stale catalog ids. */
    if (platformSaysNoLinkedAssignment()) return false;

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

    return Boolean(readCatalogAssignmentId());
  }

  /** Strip leftover Loading… / toolbar / floating Glass·Cloud when empty status pages own HW. */
  function clearLegacyEmptyHwChrome() {
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    if (mount) {
      mount.querySelector(".hw-hub-v5-loading-list")?.remove();
      mount.querySelectorAll(".hw-list-wait").forEach((node) => node.remove());
      if (!mount.querySelector(".hw-worksheet, form.hw-worksheet, #hw-worksheet-form")) {
        mount.replaceChildren();
      }
    }

    const v4Intro = document.getElementById("hw-v4-worksheet-intro");
    if (v4Intro) {
      v4Intro.textContent = "";
      v4Intro.hidden = true;
    }
    const legacyIntro = document.getElementById("hw-worksheet-intro");
    if (legacyIntro) {
      legacyIntro.textContent = "";
      legacyIntro.hidden = true;
    }
    const v2Title = document.getElementById("hw-v2-title");
    if (v2Title && /loading/i.test(String(v2Title.textContent || ""))) {
      v2Title.textContent = "";
    }

    global.HwStudentToolbar?.unmount?.();
    const toolbar = document.getElementById("hw-toolbar-bar");
    if (toolbar) toolbar.hidden = true;

    document.querySelectorAll(".hw-mg-widget, .hw-hc-launcher").forEach((el) => {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      el.style.display = "none";
    });
    document.documentElement.classList.remove("hw-tb-glass-out", "hw-tb-cloud-out");
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
      bindHubBootDismiss();
      if (worksheetSection) worksheetSection.hidden = false;
      if (completeCard) completeCard.hidden = true;
      if (pastFold) pastFold.hidden = true;
      const entryBoot = document.getElementById("hw-hub-v5-entry-row");
      if (entryBoot) entryBoot.hidden = true;
      renderNoPlanWelcome(false);
      renderNoHwEmpty(false);
      renderPlanWaiting(false);
      ensureWorksheetLoadingPlaceholder();
      return;
    }

    clearHubBootGate();

    /* No linked homework → always use the no-plan / plan-waiting / no-HW status pages.
       Never leave the old Loading… worksheet card + floating tools. */
    const archive = isArchiveMode();
    const emptyStatus =
      !hasAssignment && !isCompleteView(status) && !archive;
    const stuspecFocus = wantsStuspecFocus();
    const showNoPlan = emptyStatus && isNoPlanAccount() && !stuspecFocus;
    const showPlanWaiting =
      emptyStatus && !showNoPlan && isPlanWaitingAccount() && !stuspecFocus;
    const showNoHw =
      emptyStatus &&
      !showNoPlan &&
      !showPlanWaiting &&
      (isStudentNoHwAccount() || (stuspecFocus && !isPlanWaitingAccount()));
    const showComplete =
      !archive &&
      isCompleteView(status) &&
      (hasAssignment || status === "reviewed" || status === "acknowledged") &&
      !showNoPlan &&
      !showNoHw &&
      !showPlanWaiting;
    const ultraPractice = isUltraTier();

    document.body.classList.toggle("hw-hub-v5-archive-mode", archive);
    document.body.classList.toggle("hw-hub-v5-complete-view", showComplete);

    if (worksheetSection) {
      worksheetSection.hidden = archive
        ? false
        : ((!ultraPractice && showComplete) ||
            showNoHw ||
            showNoPlan ||
            showPlanWaiting);
    }
    if (completeCard) completeCard.hidden = !showComplete;
    if (pastFold) {
      pastFold.hidden =
        archive || !showComplete || showNoHw || showNoPlan || showPlanWaiting;
    }
    queueNotebookRefresh();
    const entryRow = document.getElementById("hw-hub-v5-entry-row");
    if (entryRow) {
      const pastVisible = pastFold && !pastFold.hidden;
      entryRow.hidden = !pastVisible;
    }
    applyNotebookOpenUi();
    if (offlineCard) {
      /* Print moved to footer menu — photo shell only when capturing. */
      offlineCard.hidden = !offlineCard.classList.contains("is-capturing");
    }
    const printMenu = document.getElementById("hw-print-menu");
    if (printMenu) {
      printMenu.hidden =
        notebookOpen ||
        archive ||
        showComplete ||
        showNoHw ||
        showNoPlan ||
        showPlanWaiting ||
        !hasAssignment;
    }

    renderStatusBubble(status);

    renderNoPlanWelcome(showNoPlan);
    renderPlanWaiting(showPlanWaiting);
    renderNoHwEmpty(showNoHw);
    if (showNoPlan || showNoHw || showPlanWaiting) {
      clearLegacyEmptyHwChrome();
    }

    const worksheetMounted = isWorksheetMounted();
    document.body.classList.toggle("hw-hub-v5-worksheet-ready", worksheetMounted);
    const showLanding =
      ready &&
      hasAssignment &&
      !showComplete &&
      !showNoPlan &&
      !showNoHw &&
      !showPlanWaiting &&
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
        (showComplete ||
          showNoHw ||
          showNoPlan ||
          showPlanWaiting ||
          !hasAssignment ||
          worksheetMounted)
      ) {
        mount.querySelector(".hw-hub-v5-loading-list")?.remove();
        mount.querySelectorAll(".hw-list-wait").forEach((node) => node.remove());
        if (!mount.querySelector(".hw-worksheet, form.hw-worksheet, #hw-worksheet-form")) {
          mount.replaceChildren();
        }
      }
    }
    bindHubPanelsHeightLock();
    lockHubPanelsMinHeight();
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
    if (accountMode) {
      setActiveTab(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab || "profile");
      renderAccountSellup();
    } else {
      setActiveTab(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab || "homework");
    }
    /* Re-assert diary after every paint so async hub refreshes can't flash status. */
    applyNotebookOpenUi();
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
        setActiveTab("homework", { scrollTop: true });
        openPastHomeworkFromHub();
      }
    });

    document.getElementById("hw-v5-tabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-v5-tab]");
      if (!btn) return;
      setActiveTab(btn.getAttribute("data-v5-tab") || (accountMode ? "profile" : "homework"));
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
      if (global.HwAccount?.isAccountHash?.()) return;
      if (accountMode) return;
      /* Entering a past sheet while Notebook is open = intentional row/open-past. */
      if (notebookOpen && isArchiveMode()) {
        setActiveTab("homework", { skipFocus: true });
      }
      renderAll();
    });
    document.addEventListener("hw-platform-submission-view", () => {
      hubReady = true;
      /* Archive sheet owns the top slot — Notebook tab yields for explicit past views. */
      if (notebookOpen) {
        setActiveTab("homework", { skipFocus: true });
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
    bindHubTabSliderLayout();
    initHubTabs();
    renderAll();
    if (wantsStuspecFocus()) {
      clearStuspecFocusParam();
      window.setTimeout(function () {
        var card =
          document.querySelector(".hw-hub-v5-sellup-card--weekly") ||
          document.getElementById("hw-v5-no-hw-empty") ||
          document.getElementById("hw-v5-noplan-welcome");
        if (card && card.scrollIntoView) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 350);
    }
    bindHubBootDismiss();
    /* Safety: never leave the boot veil forever if ready events stall. */
    window.setTimeout(clearHubBootGate, 4500);
    global.HwAccount?.onHubReady?.();
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
    enterAccountMode,
    exitAccountMode,
    isAccountMode() {
      return accountMode;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
