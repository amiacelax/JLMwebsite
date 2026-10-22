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
      price: 9,
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
    basic: "Basic — $9/mo",
    premium: "Premium — $20/mo",
    ultra: "Ultra — $49/mo",
    "student-special": "Student Special — $10/mo",
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
    quest_only: {
      username: "questonly",
      displayName: "Alex",
      role: "student",
      accountLabel: "quest_only",
      tier: "quest_only",
    },
    curriculum: {
      username: "demo2",
      displayName: "Demo3",
      role: "student",
      accountLabel: "curriculum",
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

  const TAB_IDS = ["homework", "quest", "lessons", "games"];
  const QUEST_ONLY_TAB_IDS = ["quest", "workouts"];
  const ACCOUNT_TAB_IDS = ["profile", "subscription", "notifications", "features"];
  const HUB_TAB_LABELS = {
    homework: "HW",
    quest: "Quest",
    workouts: "Workout",
    notebook: "Notes",
    lessons: "Lessons",
    situations: "Situation Cards",
    today: "To-do list",
    prayer: "Prayer",
    core: "Core Japanese",
    chapters: "Chapters",
    week: "Whole week",
    allcards: "All cards",
    games: "Games",
  };
  const ACCOUNT_TAB_LABELS = {
    profile: "Profile",
    subscription: "Subscription",
    notifications: "Notifications",
    features: "Features",
  };
  let accountMode = false;
  let hubTabBeforeAccount = "homework";

  function gamesAndCoursesEnabled() {
    return !!global.HwFeatureFlags?.gamesAndCourses?.();
  }

  function isQuestOnlyAccount() {
    const session = getActiveSession();
    if (!session || session.role !== "student") return false;
    return session.tier === "quest_only" || session.accountLabel === "quest_only";
  }

  function isCurriculumAccount() {
    const session = getActiveSession();
    if (!session || session.role !== "student") return false;
    if (global.HwAuth?.isCurriculumTrialActive?.(session)) return true;
    if (global.HwAuth?.isNoahCurriculumOpen?.(session)) return true;
    if (global.HwAuth?.isChristianCurriculumUser?.(session)) return true;
    /* Fallback if an older hw-auth.js is cached without the helper. */
    const user = String(session.username || "")
      .trim()
      .toLowerCase();
    const CHRISTIAN_CURRICULUM_USERS = {
      christian: 1,
      demo2: 1,
      curriculum: 1,
      alex: 1,
      sykohpath: 1,
      secretsister5: 1,
      kaetherjk: 1,
      benm: 1,
      noahjorton: 1,
      baranymatthewjr: 1,
    };
    if (CHRISTIAN_CURRICULUM_USERS[user]) return true;
    return session.accountLabel === "curriculum";
  }

  /**
   * Demo2 QuestTest (demoprem): same hub as Christian's current page,
   * minus Prayer and Chapters. Other students only get it when listed here
   * (Jen / nekobi moved over). Keep hw-hub-quests.js QUEST_PREVIEW_USERNAMES in step.
   */
  const STANDARD_HUB_USERS = new Set(["demoprem", "premdemo", "nekobi"]);

  function isDemo1StandardPreview() {
    if (isCurriculumAccount()) return false;
    const user = String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
    return STANDARD_HUB_USERS.has(user);
  }

  function isHubDemoUser() {
    const user = String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
    return (
      user === "demo" ||
      user === "demo1" ||
      user === "demo2" ||
      user === "demoprem" ||
      user === "premdemo" ||
      user === "curriculum" ||
      user === "noplan" ||
      user === "questonly"
    );
  }

  /** Christian's current hub layout (To-do / Daily Exercise / Core / Situation). */
  function usesCurriculumHub() {
    return isCurriculumAccount() || isDemo1StandardPreview();
  }

  function seesPrayerTab() {
    const user = String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
    if (STANDARD_HUB_USERS.has(user)) return false;
    return isCurriculumAccount();
  }

  function seesChaptersTab() {
    const user = String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
    if (STANDARD_HUB_USERS.has(user)) return false;
    return isCurriculumAccount();
  }

  function seesSituationCards() {
    return usesCurriculumHub();
  }

  function defaultHubTab() {
    if (isQuestOnlyAccount()) return "quest";
    if (usesCurriculumHub()) return "today";
    return "homework";
  }

  /** Test accounts that get the Weekly Workouts tab next to Quest (demo1 = the 4-tab hub). */
  const WORKOUT_TAB_USERS = new Set(["demo1", "demoprem"]);

  function seesWorkoutsTab() {
    const user = String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
    return WORKOUT_TAB_USERS.has(user);
  }

  function hubTabIds() {
    if (accountMode) return ACCOUNT_TAB_IDS.slice();
    if (isQuestOnlyAccount()) return QUEST_ONLY_TAB_IDS.slice();
    if (usesCurriculumHub()) {
      const ids = ["today", "homework", "quest"];
      ids.push("notebook", "situations");
      if (seesPrayerTab()) ids.push("prayer");
      ids.push("core");
      if (seesChaptersTab()) ids.push("chapters");
      ids.push("lessons");
      if (gamesAndCoursesEnabled()) ids.push("games");
      ids.push("week", "allcards");
      return ids;
    }
    const base = gamesAndCoursesEnabled()
      ? TAB_IDS.slice()
      : TAB_IDS.filter((id) => id !== "games");
    if (seesWorkoutsTab()) base.splice(base.indexOf("quest") + 1, 0, "workouts");
    return base;
  }
  function visibleHubTabIds() {
    return hubTabIds().filter((id) => id !== "week" && id !== "allcards");
  }

  function hubTabLabel(id) {
    const labels = accountMode ? ACCOUNT_TAB_LABELS : HUB_TAB_LABELS;
    let label = !accountMode && id === "notebook" && usesCurriculumHub() ? "Daily Exercise" : labels[id] || id;
    if (!accountMode && id === "prayer") label = "Build-a-prayer";
    return label;
  }

  function goToTab(id) {
    if (id === "notebook") sessionStorage.removeItem("jlm-ct-focus");
    setActiveTab(id);
    if (id === "notebook") global.HwCurriculumTextbook?.sync?.();
  }

  /** Leave arrow keys alone only while typing in a text box. */
  function arrowKeysTyping(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const tag = (el.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      const type = String(el.getAttribute?.("type") || "text").toLowerCase();
      if (tag === "INPUT" && (type === "button" || type === "submit" || type === "checkbox" || type === "radio" || type === "range" || type === "file")) {
        return false;
      }
      return true;
    }
    return !!(el.isContentEditable || el.closest?.("[contenteditable='true'], .hw-hub-v5-notebook-kanji-cell"));
  }

  function moveHubTab(delta) {
    const ids = visibleHubTabIds();
    if (ids.length < 2) return;
    const active = normalizeTabId(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab);
    let i = ids.indexOf(active);
    if (i < 0) i = 0;
    const id = ids[(i + delta + ids.length) % ids.length];
    const keepFocus = document.activeElement?.closest?.("#hw-v5-tabs");
    goToTab(id);
    if (keepFocus) document.querySelector('#hw-v5-tabs [data-v5-tab="' + id + '"]')?.focus();
  }

  function moveHubTabSlide(dir) {
    const buttons = [...document.querySelectorAll("#hw-v5-tabs [data-v5-tab]")].filter((b) => b.offsetParent);
    if (buttons.length < 2) return;
    const rows = [];
    buttons.forEach((b) => {
      const top = b.offsetTop;
      let row = rows.find((r) => Math.abs(r.top - top) < 6);
      if (!row) {
        row = { top, buttons: [] };
        rows.push(row);
      }
      row.buttons.push(b);
    });
    if (rows.length < 2) return;
    rows.sort((a, b) => a.top - b.top);
    const active = normalizeTabId(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab);
    let r = 0;
    let c = 0;
    rows.forEach((row, ri) => {
      const ci = row.buttons.findIndex((b) => b.getAttribute("data-v5-tab") === active);
      if (ci >= 0) {
        r = ri;
        c = ci;
      }
    });
    const nr = r + dir;
    if (nr < 0 || nr >= rows.length) return;
    const target = rows[nr].buttons[Math.min(c, rows[nr].buttons.length - 1)];
    const id = target?.getAttribute("data-v5-tab");
    if (!id) return;
    const keepFocus = document.activeElement?.closest?.("#hw-v5-tabs");
    goToTab(id);
    if (keepFocus) target.focus();
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

  function curriculumUserKey(base) {
    const user = String(getActiveSession()?.username || "").toLowerCase();
    if (!user || user === "demo2" || user === "curriculum") return base;
    return base + ":" + user;
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
    if (isQuestOnlyAccount()) return false;
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
      if (hash.startsWith("hw-browse-")) return "";
      if (hash && hash.startsWith("hw-") && !hash.startsWith("hw-submission-")) {
        return hash.replace(/^hw-/, "").trim();
      }
    } catch {
      /* ignore */
    }

    const trialHw = global.HwAuth?.curriculumTrialHomeworkId?.(session);
    if (trialHw) return trialHw;
    if (global.HwAuth?.isNoahCurriculumOpen?.(session)) return "sheet-secret-hiragana";
    if (user === "christian") return "sheet-secret-hiragana";
    if (user === "demo2" || user === "curriculum") return "trial-advanced-notoki";
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
      if (getDemoAccountKey() === "curriculum") return "in_progress";
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
        "account-features": "features",
        features: "features",
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
    if (usesCurriculumHub() && mapped === "workouts") return "notebook";
    return hubTabIds().includes(mapped) ? mapped : defaultHubTab();
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
    if (slider && !active) {
      slider.style.width = "0px";
      slider.style.height = "0px";
    }
    if (!slider || !active) return;

    // offset* values are in the tab bar's own units, so the pill stays lined up
    // even when the page is scaled (fullscreen CSS zoom) — getBoundingClientRect is not.
    const useOffsets = active.offsetParent === tablist;
    const btnRect = active.getBoundingClientRect();
    const listRect = tablist.getBoundingClientRect();
    const x = useOffsets ? active.offsetLeft : btnRect.left - listRect.left + tablist.scrollLeft;
    const y = useOffsets ? active.offsetTop : btnRect.top - listRect.top + tablist.scrollTop;
    const bw = useOffsets ? active.offsetWidth : btnRect.width;
    const bh = useOffsets ? active.offsetHeight : btnRect.height;
    slider.style.width = Math.max(0, bw) + "px";
    slider.style.height = Math.max(0, bh) + "px";
    slider.style.transform = "translate(" + x + "px, " + y + "px)";

    if (!tablist.classList.contains("is-slider-ready")) {
      requestAnimationFrame(() => {
        tablist.classList.add("is-slider-ready");
      });
    }
    const viewLeft = tablist.scrollLeft;
    const viewRight = viewLeft + tablist.clientWidth;
    const btnLeft = active.offsetLeft;
    const btnRight = btnLeft + active.offsetWidth;
    if (btnLeft < viewLeft || btnRight > viewRight) {
      tablist.scrollTo({ left: Math.max(0, btnLeft - 8), behavior: "smooth" });
    }
    syncTabArrows();
  }

  function syncTabArrows() {
    const tabs = document.getElementById("hw-v5-tabs");
    const wrap = tabs?.closest(".hw-hub-v5-tabs-wrap");
    if (!tabs || !wrap) return;
    const prev = wrap.querySelector("[data-v5-tab-prev]");
    const next = wrap.querySelector("[data-v5-tab-next]");
    const overflow = tabs.scrollWidth > tabs.clientWidth + 8;
    const atStart = tabs.scrollLeft <= 6;
    const atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 6;
    if (prev) prev.hidden = !overflow || atStart;
    if (next) next.hidden = !overflow || atEnd;
  }

  function ensureTabPager() {
    const wrap = document.querySelector(".hw-hub-v5-tabs-wrap");
    const tabs = document.getElementById("hw-v5-tabs");
    if (!wrap || !tabs || accountMode) return;
    let prev = wrap.querySelector("[data-v5-tab-prev]");
    let next = wrap.querySelector("[data-v5-tab-next]");
    if (!prev) {
      prev = document.createElement("button");
      prev.type = "button";
      prev.className = "hw-hub-v5-tabs__arrow";
      prev.setAttribute("data-v5-tab-prev", "");
      prev.setAttribute("aria-label", "Earlier tabs");
      prev.textContent = "‹";
      prev.hidden = true;
      wrap.insertBefore(prev, tabs);
    }
    if (!next) {
      next = document.createElement("button");
      next.type = "button";
      next.className = "hw-hub-v5-tabs__arrow";
      next.setAttribute("data-v5-tab-next", "");
      next.setAttribute("aria-label", "Later tabs");
      next.textContent = "›";
      next.hidden = true;
      wrap.appendChild(next);
    }
    if (!ensureTabPager.bound) {
      ensureTabPager.bound = true;
      wrap.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-v5-tab-prev], [data-v5-tab-next]");
        if (!btn || !wrap.contains(btn)) return;
        const list = document.getElementById("hw-v5-tabs");
        if (!list) return;
        const dir = btn.hasAttribute("data-v5-tab-next") ? 1 : -1;
        const step = list.querySelector(".hw-hub-v5-tabs__btn")?.offsetWidth || 140;
        list.scrollBy({ left: dir * (step + 8), behavior: "smooth" });
      });
      tabs.addEventListener("scroll", syncTabArrows, { passive: true });
      window.addEventListener("resize", syncTabArrows);
    }
    requestAnimationFrame(syncTabArrows);
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
    /* Curriculum cards hug their content. Don't stretch them to the homework sheet. */
    if (usesCurriculumHub()) {
      panels.style.removeProperty("--hw-hub-panels-min-h");
      return;
    }

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
    return username
      ? STORAGE.tab +
          ":" +
          username +
          (isCurriculumAccount() ? ":c2" : isDemo1StandardPreview() ? ":std1" : "")
      : STORAGE.tab;
  }

  function readSavedHubTab() {
    return normalizeTabId(readStorage(hubTabStorageKey(), defaultHubTab()));
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
        "account-features": "features",
        features: "features",
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
    syncMobileTabSlides({ followActive: true });
    if (!accountMode && tab === "quest") {
      void global.HwHubQuests?.markSeen?.();
      void global.HwHubQuests?.refresh?.();
    }
    if (!accountMode && tabStarIds().has(tab)) {
      markTabStarSeen(tab);
      paintTabStar(tab);
    }
    if (!accountMode && tab === "workouts") {
      void global.HwHubWorkouts?.refresh?.();
    }

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
    const questOnly = isQuestOnlyAccount();

    document.body.classList.toggle("hw-hub-v5-quest-only", questOnly);

    const onHomework = !questOnly && activeTab === "homework";
    homeworkPanel?.classList.toggle("is-active", onHomework);
    if (questOnly || !onHomework) homeworkPanel?.setAttribute("hidden", "");
    else homeworkPanel?.removeAttribute("hidden");

    belowPanels.forEach((panel) => {
      const active = panel.getAttribute("data-v5-panel") === activeTab;
      panel.classList.toggle("is-active", active);
      if (active) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });

    const onQuest = !accountMode && activeTab === "quest";
    document.body.classList.toggle("hw-quest-tab-active", onQuest);
    const hwToolbar = document.getElementById("hw-toolbar-bar");
    if (hwToolbar) {
      if (onQuest) {
        hwToolbar.hidden = true;
      } else {
        const wsForm = document.querySelector(
          "#hw-v2-worksheet-mount form.hw-worksheet, #hw-v2-worksheet-mount .hw-worksheet, #hw-worksheet-form"
        );
        const wsSection = document.querySelector("#hw-hub-v4-homework .hw-hub-v2-worksheet");
        hwToolbar.hidden = !wsForm || (wsSection && wsSection.hidden);
      }
    }
    const questToolbar = document.getElementById("hw-quest-toolbar");
    if (questToolbar) {
      questToolbar.hidden = !onQuest || !global.HwHubQuests?.questLayoutEnabled?.();
    }
    syncPrayerToolbar(activeTab);
    syncSitToolbar(activeTab);
    syncCurriculumContentToolbar(activeTab);
  }

  function prayerToolHost() {
    return (
      document.querySelector("#hw-v5-panel-prayer .hw-prayer") ||
      document.getElementById("hw-v5-panel-prayer")
    );
  }

  function parkToolbarOnWorksheet(bar) {
    const card =
      document.getElementById("hw-v5-worksheet-card") ||
      document.querySelector(".hw-hub-v2-worksheet.hw-hub-worksheet-card") ||
      document.querySelector(".hw-hub-v2-worksheet");
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    if (!bar || !card) return;
    if (mount && card.contains(mount)) mount.after(bar);
    else if (bar.parentElement !== card) card.appendChild(bar);
  }

  function curriculumToolbarSession() {
    const session = global.HwAuth?.getSession?.();
    return {
      username: session?.username || "",
    };
  }

  /** Same Glass·Cloud pill Christian gets on HW — never the old floating corner tools. */
  function mountCurriculumToolbar(host, assignmentId) {
    if (!host || !global.HwStudentToolbar?.mountOnHost) return null;
    const { username } = curriculumToolbarSession();
    global.HwStudentToolbar.mountOnHost(host, {
      username,
      assignmentId,
      skipOnboarding: true,
    });
    const bar = document.getElementById("hw-toolbar-bar");
    if (bar) {
      host.appendChild(bar);
      bar.hidden = false;
    }
    return bar;
  }

  function isReviewedSheetOpen() {
    return /^#hw-submission-/i.test(String(window.location.hash || ""));
  }

  function remountWorksheetToolbar() {
    const bar = document.getElementById("hw-toolbar-bar");
    const form =
      document.querySelector("#hw-v2-worksheet-mount form.hw-worksheet") ||
      document.getElementById("hw-worksheet-form");
    if (!form || document.body.classList.contains("hw-hub-no-linked-assignment")) return false;
    if (bar) parkToolbarOnWorksheet(bar);
    /* A reviewed sheet (JD's memos + ✓/✗) is already mounted by the platform —
       re-attaching a blank Cloud here wiped the memos and marks. */
    if (isReviewedSheetOpen()) return true;
    const { username } = curriculumToolbarSession();
    return global.HwStudentToolbar?.mount?.(form, {
      username,
      assignmentId: form.getAttribute("data-assignment-id") || "",
      skipOnboarding: true,
    });
  }

  /**
   * CJ remounts Glass on HW when leaving Prayer/Situation (those hosts are
   * visible). Demo1 has no Prayer, and both hubs open on To-do first — so the
   * first attach hits a hidden HW panel and Glass never hooks the sheet.
   * Re-attach to whichever tab is showing, same mountOnHost path CJ uses.
   */
  function syncCurriculumContentToolbar(tab) {
    if (accountMode || !usesCurriculumHub()) {
      document.body.classList.remove("hw-hub-content-toolbar", "hw-hub-content-toolbar--sheet");
      return;
    }
    if (tab === "prayer" || tab === "situations") {
      document.body.classList.remove("hw-hub-content-toolbar", "hw-hub-content-toolbar--sheet");
      return;
    }

    /* Demo Daily Exercise keeps the page itself. The glass / cloud / focus bar stays off it. */
    if (tab === "notebook" && isHubDemoUser()) {
      document.body.classList.remove("hw-hub-content-toolbar", "hw-hub-content-toolbar--sheet");
      const bar = document.getElementById("hw-toolbar-bar");
      if (bar) bar.hidden = true;
      return;
    }

    /* Reviewing a marked sheet: other tabs must not re-attach a blank Cloud over JD's memos/marks. */
    if (tab !== "homework" && isReviewedSheetOpen()) {
      document.body.classList.remove("hw-hub-content-toolbar", "hw-hub-content-toolbar--sheet");
      return;
    }

    if (tab === "homework") {
      document.body.classList.add("hw-hub-content-toolbar");
      document.body.classList.add("hw-hub-content-toolbar--sheet");
      remountWorksheetToolbar();
      return;
    }
    document.body.classList.remove("hw-hub-content-toolbar--sheet");

    const host =
      (tab === "today" &&
        (document.querySelector("#hw-v5-panel-today .hw-today") ||
          document.getElementById("hw-v5-panel-today"))) ||
      (tab === "notebook" &&
        (document.getElementById("hw-curriculum-textbook") ||
          document.getElementById("hw-v5-panel-notebook"))) ||
      (tab === "core" &&
        (document.querySelector("#hw-v5-panel-core .hw-core-page") ||
          document.getElementById("hw-v5-panel-core"))) ||
      (tab === "chapters" &&
        seesChaptersTab() &&
        (document.querySelector("#hw-v5-panel-chapters .hw-chapters") ||
          document.getElementById("hw-v5-panel-chapters")));

    if (!host) {
      document.body.classList.remove("hw-hub-content-toolbar", "hw-hub-content-toolbar--sheet");
      return;
    }
    document.body.classList.add("hw-hub-content-toolbar");
    mountCurriculumToolbar(host, "curriculum-" + tab);
  }

  function releaseCurriculumToolbar(bar) {
    global.HwMagnifyingGlass?.setArmed?.(false);
    global.HwMagnifyingGlass?.releaseOverride?.();
    global.HwHomeworkComments?.setArmed?.(false);
    global.HwHomeworkComments?.disarm?.();
    const form =
      document.querySelector("#hw-v2-worksheet-mount form.hw-worksheet") ||
      document.getElementById("hw-worksheet-form");
    if (form && !document.body.classList.contains("hw-hub-no-linked-assignment")) {
      if (bar) parkToolbarOnWorksheet(bar);
      if (isReviewedSheetOpen()) return;
      const { username } = curriculumToolbarSession();
      global.HwStudentToolbar?.mount?.(form, {
        username,
        assignmentId: form.getAttribute("data-assignment-id") || "",
        skipOnboarding: true,
      });
      return;
    }
    global.HwStudentToolbar?.unmount?.();
  }

  let prayerFocusFs = false;
  let prayerFocusBound = false;

  function isPrayerFocus() {
    return document.body.classList.contains("hw-prayer-focus");
  }

  function exitPrayerFocus() {
    if (!isPrayerFocus()) return;
    document.body.classList.remove("hw-prayer-focus");
    if (prayerFocusFs) {
      prayerFocusFs = false;
      if (document.fullscreenElement) Promise.resolve(document.exitFullscreen?.()).catch(() => {});
    }
    global.HwStudentToolbar?.sync?.();
  }

  function enterPrayerFocus() {
    if (isPrayerFocus() || !document.body.classList.contains("hw-prayer-toolbar")) return;
    if (!prayerFocusBound) {
      prayerFocusBound = true;
      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && isPrayerFocus()) exitPrayerFocus();
      });
      document.addEventListener("fullscreenchange", () => {
        if (prayerFocusFs && !document.fullscreenElement) {
          prayerFocusFs = false;
          exitPrayerFocus();
        }
      });
    }
    document.body.classList.add("hw-prayer-focus");
    try {
      Promise.resolve(document.documentElement.requestFullscreen?.())
        .then(() => {
          prayerFocusFs = !!document.fullscreenElement;
        })
        .catch(() => {});
    } catch (_) {
      /* black-background focus still works without fullscreen */
    }
    global.HwStudentToolbar?.sync?.();
  }

  function togglePrayerFocus() {
    if (isPrayerFocus()) exitPrayerFocus();
    else enterPrayerFocus();
  }

  function syncPrayerToolbar(tab) {
    const bar = document.getElementById("hw-toolbar-bar");
    const onPrayer = isCurriculumAccount() && tab === "prayer";
    document.body.classList.toggle("hw-prayer-toolbar", onPrayer);
    if (!onPrayer) {
      exitPrayerFocus();
      if (document.body.dataset.hwPrayerTools === "1") {
        document.body.dataset.hwPrayerTools = "";
        releaseCurriculumToolbar(bar);
      }
      return;
    }
    const host = prayerToolHost();
    if (!host) return;
    mountCurriculumToolbar(host, "curriculum-prayer");
    document.body.dataset.hwPrayerTools = "1";
  }

  function sitToolHost() {
    if (document.body.classList.contains("hw-sit-focus")) {
      return document.querySelector(".hw-sit-focus__phone") || document.querySelector(".hw-sit-focus");
    }
    return (
      document.querySelector("#hw-v5-panel-situations .hw-sit-cards") ||
      document.getElementById("hw-v5-panel-situations")
    );
  }

  let sitDeckCards = null;
  let sitDeckOrder = [];
  let sitDeckIndex = 0;
  let sitDeckEn = false;

  function ensureSitFocusDeck() {
    let root = document.getElementById("hw-sit-focus");
    if (root) return root;
    root = document.createElement("div");
    root.id = "hw-sit-focus";
    root.className = "hw-sit-focus";
    root.hidden = true;
    root.innerHTML =
      '<div class="hw-sit-focus__phone">' +
      '<header class="hw-sit-focus__top">' +
      "<h2>状況カード</h2>" +
      '<div class="hw-sit-focus__top-right">' +
      '<button type="button" class="hw-sit-focus__shuffle" data-sit-act="shuffle">Shuffle</button>' +
      '<span class="hw-sit-focus__count" data-sit-count>— / —</span></div></header>' +
      '<article class="hw-sit-focus__card">' +
      '<header class="hw-sit-focus__head">' +
      '<h3 data-sit-title lang="ja"></h3><p data-sit-label></p></header>' +
      '<div class="hw-sit-focus__image"><img alt="" data-sit-img></div>' +
      '<div class="hw-sit-focus__body">' +
      '<p class="hw-sit-focus__ask">What do you say / do?</p>' +
      '<p class="hw-sit-focus__text" data-sit-text lang="ja"></p>' +
      '<p class="hw-sit-focus__en" data-sit-en hidden></p></div></article>' +
      '<p class="hw-sit-focus__hint">Swipe · Shuffle · tap English</p>' +
      '<nav class="hw-sit-focus__controls">' +
      '<button type="button" data-sit-act="prev">← Prev</button>' +
      '<button type="button" class="is-english" data-sit-act="en">English</button>' +
      '<button type="button" data-sit-act="next">Next →</button></nav>' +
      '<div class="hw-sit-focus__tools" data-sit-tools></div></div>';
    document.body.appendChild(root);
    root.addEventListener("click", (ev) => {
      const act = ev.target.closest("[data-sit-act]");
      if (!act || !root.contains(act)) return;
      const kind = act.getAttribute("data-sit-act");
      if (kind === "prev") sitDeckGo(-1);
      else if (kind === "next") sitDeckGo(1);
      else if (kind === "shuffle") sitDeckShuffle();
      else if (kind === "en") {
        sitDeckEn = !sitDeckEn;
        paintSitDeck();
      }
    });
    let startX = 0;
    let startY = 0;
    root.addEventListener(
      "touchstart",
      (e) => {
        const t = e.changedTouches[0];
        startX = t.clientX;
        startY = t.clientY;
      },
      { passive: true }
    );
    root.addEventListener(
      "touchend",
      (e) => {
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
        sitDeckGo(dx < 0 ? 1 : -1);
      },
      { passive: true }
    );
    return root;
  }

  function paintSitDeck() {
    const root = document.getElementById("hw-sit-focus");
    const cards = sitDeckCards || [];
    if (!root || !cards.length) return;
    const card = cards[sitDeckOrder[sitDeckIndex]];
    if (!card) return;
    const title = root.querySelector("[data-sit-title]");
    const label = root.querySelector("[data-sit-label]");
    const text = root.querySelector("[data-sit-text]");
    const en = root.querySelector("[data-sit-en]");
    const img = root.querySelector("[data-sit-img]");
    const count = root.querySelector("[data-sit-count]");
    const enBtn = root.querySelector('[data-sit-act="en"]');
    if (title) title.textContent = card.titleJp || "";
    if (label) label.textContent = card.label || "";
    if (text) text.textContent = card.text || "";
    if (en) {
      en.textContent = card.english || "";
      en.hidden = !(sitDeckEn && card.english);
    }
    if (img) img.src = "/homework/media/situation-cards-1/" + (card.image || "");
    if (count) count.textContent = sitDeckIndex + 1 + " / " + sitDeckOrder.length;
    if (enBtn) enBtn.textContent = sitDeckEn ? "Hide EN" : "English";
  }

  function sitDeckGo(delta) {
    if (!sitDeckOrder.length) return;
    sitDeckEn = false;
    sitDeckIndex = (sitDeckIndex + delta + sitDeckOrder.length) % sitDeckOrder.length;
    paintSitDeck();
  }

  function sitDeckShuffle() {
    const next = sitDeckOrder.slice();
    for (let n = next.length - 1; n > 0; n--) {
      const j = Math.floor(Math.random() * (n + 1));
      const tmp = next[n];
      next[n] = next[j];
      next[j] = tmp;
    }
    sitDeckOrder = next;
    sitDeckIndex = 0;
    sitDeckEn = false;
    paintSitDeck();
  }

  function openSitFocus() {
    const root = ensureSitFocusDeck();
    const show = (cards) => {
      sitDeckCards = cards;
      if (!sitDeckOrder.length) sitDeckOrder = cards.map((_, idx) => idx);
      const todayImg = SITUATION_CARDS[dailySituationIndex()]?.[0];
      const todayAt = cards.findIndex((card) => card.image === todayImg);
      if (todayAt >= 0) {
        sitDeckIndex = sitDeckOrder.indexOf(todayAt);
        if (sitDeckIndex < 0) sitDeckIndex = 0;
      }
      paintSitDeck();
      root.hidden = false;
      document.body.classList.add("hw-sit-focus");
      syncSitToolbar("situations");
    };
    if (sitDeckCards) {
      show(sitDeckCards);
      return;
    }
    fetch("/homework/media/situation-cards-1/cards.json")
      .then((res) => res.json())
      .then((data) => show(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  function closeSitFocus() {
    document.getElementById("hw-sit-focus")?.setAttribute("hidden", "");
    document.body.classList.remove("hw-sit-focus");
  }

  function syncSitToolbar(tab) {
    const onSit = seesSituationCards() && tab === "situations";
    document.body.classList.toggle("hw-sit-toolbar", onSit);
    if (!onSit) {
      if (document.body.dataset.hwSitTools === "1") {
        document.body.dataset.hwSitTools = "";
        closeSitFocus();
        document.body.dataset.hwSitCloudHost = "";
        releaseCurriculumToolbar(document.getElementById("hw-toolbar-bar"));
      }
      return;
    }
    const host = sitToolHost();
    if (!host) return;
    const cloudKey = document.body.classList.contains("hw-sit-focus") ? "focus" : "cards";
    const assignmentId =
      cloudKey === "focus" ? "curriculum-situation-focus" : "curriculum-situation";
    const bar = mountCurriculumToolbar(host, assignmentId);
    const slot = host.querySelector("[data-sit-tools]");
    if (bar && slot && bar.parentElement !== slot) slot.appendChild(bar);
    document.body.dataset.hwSitCloudHost = cloudKey;
    document.body.dataset.hwSitTools = "1";
    if (!document.body.dataset.hwSitFocusBound) {
      document.body.dataset.hwSitFocusBound = "1";
      document.addEventListener(
        "click",
        (ev) => {
          const btn = ev.target.closest?.('[data-tb-tool="focus"]');
          const liveBar = document.getElementById("hw-toolbar-bar");
          if (!btn || !liveBar || !liveBar.contains(btn)) return;
          if (!document.body.classList.contains("hw-sit-toolbar")) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (document.body.classList.contains("hw-sit-focus")) closeSitFocus();
          else openSitFocus();
          syncSitToolbar("situations");
        },
        true
      );
      document.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape" || !document.body.classList.contains("hw-sit-focus")) return;
        closeSitFocus();
        syncSitToolbar("situations");
      });
    }
  }

  const TAB_STAR_LS = "jlm-hw-tab-star-seen-v1";

  function tabStarIds() {
    const ids = new Set();
    /* "New today" stars on tabs are switched off (no explanation for them; JD killed it in onboarding review).
       Delete this line to bring them back. The separate new-quest star on the Quest tab is untouched. */
    return ids;
    // eslint-disable-next-line no-unreachable
    if (accountMode) return ids;
    if (usesCurriculumHub()) {
      ids.add("notebook");
      ids.add("core");
      if (seesPrayerTab()) ids.add("prayer");
    }
    if (seesSituationCards()) ids.add("situations");
    return ids;
  }

  function tabStarDay() {
    return String(global.HwLocalPeriod?.dayKey?.() || "");
  }

  function tabStarUser() {
    return String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
  }

  function readTabStarSeen() {
    const user = tabStarUser();
    const day = tabStarDay();
    if (!user || !day) return {};
    try {
      const all = JSON.parse(localStorage.getItem(TAB_STAR_LS) || "{}");
      const today = all?.[user]?.[day];
      return today && typeof today === "object" ? today : {};
    } catch {
      return {};
    }
  }

  function markTabStarSeen(id) {
    const user = tabStarUser();
    const day = tabStarDay();
    if (!user || !day || !id) return;
    let all = {};
    try {
      all = JSON.parse(localStorage.getItem(TAB_STAR_LS) || "{}");
    } catch {
      all = {};
    }
    const today =
      all[user] && all[user][day] && typeof all[user][day] === "object" ? all[user][day] : {};
    today[id] = 1;
    all[user] = { [day]: today };
    try {
      localStorage.setItem(TAB_STAR_LS, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }

  function paintTabStar(id) {
    const star = document.getElementById("hw-v5-tab-star-" + id);
    if (!star) return;
    const show = !readTabStarSeen()[id];
    star.hidden = !show;
    star.setAttribute("aria-hidden", show ? "false" : "true");
    const btn = document.getElementById("hw-v5-tab-" + id);
    if (!btn) return;
    if (show) {
      const name = btn.querySelector(".hw-hub-v5-tabs__label")?.textContent || id;
      btn.setAttribute("aria-label", name + ", new");
    } else {
      btn.removeAttribute("aria-label");
    }
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
    const ids = visibleHubTabIds();
    document.body.classList.remove("hw-tab-slides");
    document.querySelector("[data-v5-slide-switch]")?.remove();
    document.getElementById("hw-v5-slide-dots")?.remove();
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
      const label = document.createElement("span");
      label.className = "hw-hub-v5-tabs__label";
      label.textContent = hubTabLabel(id);
      btn.appendChild(label);
      if (!accountMode && id === "quest") {
        const star = document.createElement("span");
        star.id = "hw-v5-quest-star";
        star.className = "hw-hub-v5-tabs__star";
        const show = !!global.HwHubQuests?.hasNewQuest?.();
        star.hidden = !show;
        star.setAttribute("aria-hidden", show ? "false" : "true");
        star.textContent = "★";
        btn.appendChild(star);
      }
      if (!accountMode && tabStarIds().has(id)) {
        const star = document.createElement("span");
        star.id = "hw-v5-tab-star-" + id;
        star.className = "hw-hub-v5-tabs__star";
        const show = !readTabStarSeen()[id];
        star.hidden = !show;
        star.setAttribute("aria-hidden", show ? "false" : "true");
        star.textContent = "★";
        btn.appendChild(star);
        if (show) btn.setAttribute("aria-label", (label.textContent || id) + ", new");
      }
      tabs.appendChild(btn);
    });
    tabs.classList.remove("is-slider-ready");
    tabs.setAttribute("aria-label", accountMode ? "Account Settings" : "Hub sections");
    document.querySelectorAll(".hw-hub-v5-tabs__arrow").forEach((arrow) => {
      arrow.hidden = true;
    });
    syncMobileTabSlides({ followActive: true });
  }

  /** Phones: 4 tabs at a time. Swipe left for the next set. PC keeps every tab on screen. */
  const TAB_SLIDE_SIZE = 4;
  let tabSlide = 0;

  function phoneTabSlides() {
    return window.matchMedia("(max-width: 820px)").matches;
  }

  function syncMobileTabSlides(opts) {
    bindTabBarSwipe();
    const tabs = document.getElementById("hw-v5-tabs");
    if (!tabs) return;
    const buttons = [...tabs.querySelectorAll("[data-v5-tab]")];
    const pages = Math.max(1, Math.ceil(buttons.length / TAB_SLIDE_SIZE));
    const on = phoneTabSlides() && pages > 1 && !accountMode;
    document.body.classList.toggle("hw-tab-slides", on);
    if (!on) {
      buttons.forEach((btn) => {
        btn.hidden = false;
      });
      document.getElementById("hw-v5-slide-dots")?.remove();
      return;
    }
    if (opts && opts.followActive) {
      const active = buttons.findIndex((btn) => btn.classList.contains("is-active"));
      if (active >= 0) tabSlide = Math.floor(active / TAB_SLIDE_SIZE);
    }
    tabSlide = Math.max(0, Math.min(pages - 1, tabSlide));
    buttons.forEach((btn, i) => {
      btn.hidden = Math.floor(i / TAB_SLIDE_SIZE) !== tabSlide;
    });
    paintTabSlideDots(pages);
    if (!syncMobileTabSlides.nudged && !sessionStorage.getItem("hw-tab-swipe-nudge")) {
      syncMobileTabSlides.nudged = true;
      sessionStorage.setItem("hw-tab-swipe-nudge", "1");
      tabs.classList.add("is-nudge");
      window.setTimeout(() => tabs.classList.remove("is-nudge"), 800);
    }
    syncHubTabSlider();
  }

  function paintTabSlideDots(pages) {
    const wrap = document.querySelector(".hw-hub-v5-tabs-wrap");
    if (!wrap) return;
    let dots = document.getElementById("hw-v5-slide-dots");
    if (!dots) {
      dots = document.createElement("div");
      dots.id = "hw-v5-slide-dots";
      dots.className = "hw-slide-dots";
      dots.setAttribute("role", "tablist");
      dots.setAttribute("aria-label", "More tabs");
      wrap.appendChild(dots);
    }
    dots.replaceChildren();
    for (let i = 0; i < pages; i += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "hw-slide-dots__dot" + (i === tabSlide ? " is-on" : "");
      dot.setAttribute("aria-label", "Tab group " + (i + 1));
      dot.setAttribute("aria-selected", i === tabSlide ? "true" : "false");
      dot.addEventListener("click", () => {
        tabSlide = i;
        syncMobileTabSlides();
      });
      dots.appendChild(dot);
    }
  }

  function goMobileTabSlide(dir) {
    if (!document.body.classList.contains("hw-tab-slides")) return;
    const count = document.querySelectorAll("#hw-v5-tabs [data-v5-tab]").length;
    const pages = Math.ceil(count / TAB_SLIDE_SIZE);
    const next = Math.max(0, Math.min(pages - 1, tabSlide + dir));
    if (next === tabSlide) return;
    tabSlide = next;
    syncMobileTabSlides();
  }

  function bindTabBarSwipe() {
    if (bindTabBarSwipe.done) return;
    bindTabBarSwipe.done = true;
    let x0 = 0;
    let y0 = 0;
    let watch = false;
    document.addEventListener(
      "touchstart",
      (ev) => {
        watch = false;
        if (!document.body.classList.contains("hw-tab-slides")) return;
        const t = ev.changedTouches && ev.changedTouches[0];
        if (!t || t.clientX < 28) return;
        const el = ev.target;
        if (el && el.closest && el.closest("input, textarea, select, [contenteditable='true'], [data-no-swipe], .hw-worksheet, .hw-sit-flip, .hw-ex-line")) {
          return;
        }
        x0 = t.clientX;
        y0 = t.clientY;
        watch = true;
      },
      { passive: true }
    );
    document.addEventListener(
      "touchend",
      (ev) => {
        if (!watch) return;
        watch = false;
        const t = ev.changedTouches && ev.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - x0;
        const dy = t.clientY - y0;
        if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        goMobileTabSlide(dx < 0 ? 1 : -1);
      },
      { passive: true }
    );
    window.addEventListener("resize", () => syncMobileTabSlides({ followActive: true }));
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
      [
        "hw-v5-panel-features",
        "features",
        "hw-v5-tab-features",
        global.HwAccount.featuresMarkup,
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
      hubTabBeforeAccount = hubTabIds().includes(current) ? current : "homework";
    }
    accountMode = true;
    document.body.classList.add("hw-account-mode");
    app.dataset.v5Mode = "account";
    ensureAccountPanels();
    paintHubTabButtons();
    global.HwAccount?.fillSession?.();
    global.HwAccount?.fillPlanCopy?.();
    void global.HwHubQuests?.loadProgress?.().then(() => {
      global.HwHubQuests?.paintFeaturesSwitch?.();
    });
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
    /* Account Subscription uses HwAccount plan cards — never the post-submit sellup. */
    global.HwAccount?.fillPlanCopy?.();
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
      const noHwSellup = document.getElementById("hw-v5-no-hw-sellup");
      const accountSellup = document.getElementById("hw-v5-account-sellup");
      if (
        !trigger ||
        (!sellup?.contains(trigger) &&
          !noplanSellup?.contains(trigger) &&
          !noHwSellup?.contains(trigger) &&
          !accountSellup?.contains(trigger))
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
    article.setAttribute("data-hw-tier-detail", "student-special");
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

    /* Opens Student Special tier detail (Subscribe → PayPal). */
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

  function ensureCompleteCard() {
    let card = document.getElementById("hw-v5-complete-card");
    if (card) {
      ensureReviewZoneSlideChrome(card);
      card.querySelector("#hw-v5-reviewed-banner")?.remove();
      card.querySelector("#hw-v2-feedback")?.remove();
      return card;
    }

    card = document.createElement("section");
    card.className = "hw-hub-v5-complete hw-hub-worksheet-card";
    card.id = "hw-v5-complete-card";
    card.hidden = true;
    card.setAttribute("aria-labelledby", "hw-v5-complete-title");
    card.innerHTML =
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
      '<button type="button" class="btn btn--ghost btn--full" id="hw-v5-past-btn">Past submissions</button>' +
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
      trialBlockHtml() +
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

  function isHomeScreenApp() {
    return (
      global.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      global.navigator.standalone === true
    );
  }

  const STUDY_REMINDER_KEY = "jlm-hw-study-reminder-v1";
  const STUDY_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let studyVapidKey = "";

  function loadStudyReminder() {
    try {
      const raw = localStorage.getItem(STUDY_REMINDER_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (!data || !/^\d{2}:\d{2}$/.test(String(data.time || ""))) return null;
      return data;
    } catch {
      return null;
    }
  }

  function saveStudyReminderLocal(data) {
    localStorage.setItem(STUDY_REMINDER_KEY, JSON.stringify(data));
  }

  function reminderStudent() {
    const session = global.HwAuth?.getSession?.();
    if (!session || session.role === "teacher") return null;
    const username = String(session.username || "").trim().toLowerCase();
    if (!username) return null;
    return { username };
  }

  function reminderClock(time) {
    const parts = String(time || "20:00").split(":").map(Number);
    const sample = new Date();
    sample.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(sample);
  }

  function reminderSummary(data) {
    const when = reminderClock(data.time);
    const message = String(data.message || "Time to relax with Japanese");
    if (data.repeat === "weekdays") return "Weekdays at " + when + ". " + message;
    if (data.repeat === "weekly") {
      const day = STUDY_DAYS[Number(data.weekday)] || "Monday";
      return "Every " + day + " at " + when + ". " + message;
    }
    if (data.repeat === "once") return "Once, at " + when + ". " + message;
    return "Every day at " + when + ". " + message;
  }

  function urlBase64ToBytes(value) {
    const pad = "=".repeat((4 - (value.length % 4)) % 4);
    const b64 = (value + pad).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function loadStudyVapid() {
    if (studyVapidKey) return studyVapidKey;
    const res = await fetch("/api/study-reminder");
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.publicKey) throw new Error(data.error || "Phone pings are not set up yet.");
    studyVapidKey = String(data.publicKey);
    return studyVapidKey;
  }

  async function subscribeStudyPhone() {
    if (!("Notification" in global) || !("serviceWorker" in global.navigator) || !("PushManager" in global)) {
      throw new Error("On iPhone, open the hub from the home-screen icon, then save the reminder.");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Allow notifications, then save again.");
    const publicKey = await loadStudyVapid();
    const reg = await global.navigator.serviceWorker.ready;
    const appKey = urlBase64ToBytes(publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
      } catch (err) {
        if (/iPad|iPhone|iPod/.test(global.navigator.userAgent || "") && !isHomeScreenApp()) {
          throw new Error("On iPhone, open the hub from the home-screen icon, then save the reminder.");
        }
        throw err;
      }
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys) throw new Error("This phone did not accept the reminder.");
    return json;
  }

  function studyReminderModal() {
    let modal = document.getElementById("hw-study-reminder");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "hw-breakdown-modal";
    modal.id = "hw-study-reminder";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="hw-breakdown-modal__backdrop" data-reminder-close aria-hidden="true"></div>' +
      '<div class="hw-breakdown-modal__dialog hw-study-reminder__dialog" role="dialog" aria-modal="true" aria-labelledby="hw-study-reminder-title">' +
      '<button class="hw-breakdown-modal__close" type="button" data-reminder-close aria-label="Close">×</button>' +
      '<p class="section__eyebrow">Add to phone</p>' +
      '<h2 class="hw-breakdown-modal__title" id="hw-study-reminder-title">Reminder</h2>' +
      '<div data-reminder-ask>' +
      '<p class="hw-study-reminder__lead">Want a daily reminder too? It pings this phone at the time you pick.</p>' +
      '<div class="hw-study-reminder__actions">' +
      '<button type="button" class="btn btn--primary" data-reminder-yes>Yes</button>' +
      '<button type="button" class="btn btn--ghost" data-reminder-close>Not now</button>' +
      "</div></div>" +
      '<form class="hw-study-reminder__form" data-reminder-form hidden>' +
      "<label>Message<input name=\"message\" maxlength=\"180\" value=\"Time to relax with Japanese\"></label>" +
      '<label>Time<input name="time" type="time" value="20:00" required></label>' +
      "<label>How often<select name=\"repeat\">" +
      '<option value="daily">Every day</option>' +
      '<option value="weekdays">Weekdays</option>' +
      '<option value="weekly">Once a week</option>' +
      "</select></label>" +
      '<label data-reminder-day hidden>Which day<select name="weekday">' +
      STUDY_DAYS.map((name, index) => '<option value="' + index + '">' + name + "</option>").join("") +
      "</select></label>" +
      '<p class="hw-study-reminder__note" data-reminder-note></p>' +
      '<div class="hw-study-reminder__actions">' +
      '<button type="submit" class="btn btn--primary">Save reminder</button>' +
      '<button type="button" class="btn btn--ghost" data-reminder-close>Not now</button>' +
      "</div></form>" +
      "</div>";
    document.body.appendChild(modal);

    const ask = modal.querySelector("[data-reminder-ask]");
    const form = modal.querySelector("[data-reminder-form]");
    const dayField = modal.querySelector("[data-reminder-day]");
    const note = modal.querySelector("[data-reminder-note]");
    const repeat = form.querySelector('[name="repeat"]');

    function showStep(step) {
      ask.hidden = step !== "ask";
      form.hidden = step !== "form";
    }

    modal.querySelectorAll("[data-reminder-close]").forEach((el) => {
      el.addEventListener("click", () => {
        modal.hidden = true;
        document.body.classList.remove("is-modal-open");
      });
    });
    modal.querySelector("[data-reminder-yes]").addEventListener("click", () => {
      const saved = loadStudyReminder();
      if (saved) {
        form.elements.message.value = !saved.message || saved.message === "Time to study Japanese" ? "Time to relax with Japanese" : saved.message;
        form.elements.time.value = saved.time;
        form.elements.repeat.value = saved.repeat && saved.repeat !== "once" ? saved.repeat : "daily";
        form.elements.weekday.value = String(saved.weekday == null ? 1 : saved.weekday);
      }
      dayField.hidden = repeat.value !== "weekly";
      if (note) {
        note.classList.remove("is-error");
        note.textContent = "";
      }
      void loadStudyVapid().catch(() => {});
      showStep("form");
    });
    repeat.addEventListener("change", () => {
      dayField.hidden = repeat.value !== "weekly";
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const message = String(form.elements.message.value || "").trim() || "Time to relax with Japanese";
      const time = String(form.elements.time.value || "");
      const submitBtn = form.querySelector('[type="submit"]');
      if (!/^\d{2}:\d{2}$/.test(time)) {
        note.classList.add("is-error");
        note.textContent = "Pick a time.";
        return;
      }
      const student = reminderStudent();
      if (!student) {
        note.classList.add("is-error");
        note.textContent = "Log in, then save the reminder.";
        return;
      }
      const data = {
        message,
        time,
        repeat: form.elements.repeat.value || "daily",
        weekday: Number(form.elements.weekday.value),
      };
      note.classList.remove("is-error");
      note.textContent = "Saving…";
      if (submitBtn) submitBtn.disabled = true;
      void (async () => {
        try {
          const subscription = await subscribeStudyPhone();
          const res = await fetch("/api/study-reminder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: student.username,
              message: data.message,
              time: data.time,
              repeat: data.repeat,
              weekday: data.weekday,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo",
              subscription,
            }),
          });
          const saved = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(saved.error || "Could not save that reminder.");
          saveStudyReminderLocal(data);
          modal.querySelector("[data-reminder-summary]").textContent = "Saved. " + reminderSummary(data);
          showStep("done");
        } catch (err) {
          note.classList.add("is-error");
          note.textContent = err && err.message ? err.message : "Could not save that reminder.";
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      })();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove("is-modal-open");
    });
    modal.showStep = showStep;
    return modal;
  }

  function openStudyReminderAsk() {
    const modal = studyReminderModal();
    modal.showStep("ask");
    modal.hidden = false;
    document.body.classList.add("is-modal-open");
  }

  function ensurePhoneHomeButton() {
    const row = document.querySelector("#hw-platform-footer-nav .hw-platform-footer-nav__row");
    if (!row || document.getElementById("hw-add-phone") || isHomeScreenApp()) return;

    const wrap = document.createElement("div");
    wrap.className = "hw-add-phone";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--ghost";
    btn.id = "hw-add-phone";
    btn.textContent = "Add to phone";

    const note = document.createElement("p");
    note.id = "hw-add-phone-note";
    note.className = "hw-add-phone-note";
    note.hidden = true;

    let deferred = null;
    global.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferred = event;
    });

    btn.addEventListener("click", async () => {
      if (deferred) {
        deferred.prompt();
        try {
          await deferred.userChoice;
        } catch {
          /* ignore */
        }
        deferred = null;
        note.hidden = true;
      } else {
        const ios = /iPad|iPhone|iPod/.test(global.navigator.userAgent || "");
        note.hidden = false;
        note.textContent = ios
          ? "On iPhone, tap Share, then Add to Home Screen."
          : "In the browser menu, choose Add to Home screen or Install app.";
      }
      openStudyReminderAsk();
    });

    wrap.append(btn, note);
    row.insertBefore(wrap, row.firstChild);

    if ("serviceWorker" in global.navigator) {
      global.navigator.serviceWorker.register("/homework/hw-sw.js?v=3").catch(() => {});
    }
  }

  /* Tutorial button next to "Add to phone": plays every onboarding tip again.
     New tips only need to be added to STEPS in hw-onboard.js. */
  function ensureTutorialButton() {
    const row = document.querySelector("#hw-platform-footer-nav .hw-platform-footer-nav__row");
    if (!row || document.getElementById("hw-tutorial-btn")) return;
    const wrap = document.createElement("div");
    wrap.className = "hw-tutorial";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--ghost";
    btn.id = "hw-tutorial-btn";
    btn.textContent = "Tutorial";
    const note = document.createElement("p");
    note.className = "hw-add-phone-note";
    note.hidden = true;
    btn.addEventListener("click", () => {
      note.hidden = true;
      setActiveTab("homework", { scrollTop: true });
      setTimeout(() => {
        const sheet = document.querySelector("form.hw-worksheet");
        if (!sheet || sheet.getClientRects().length === 0) {
          note.hidden = false;
          note.textContent = "Open a homework sheet first, then tap Tutorial.";
          return;
        }
        global.HwOnboard?.replay?.();
      }, 350);
    });
    wrap.append(btn, note);
    const phone = row.querySelector(".hw-add-phone");
    if (phone) phone.after(wrap);
    else row.insertBefore(wrap, row.firstChild);
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
      '<p class="hw-hub-v5-noplan__desc">' +
        (global.HwCheckout?.isHubPaused?.()
          ? "Homework Hub is full for new students right now. Your account is saved \u2014 tap a plan to leave your email and I\u2019ll tell you when spots open."
          : "You\u2019ve created your Homework Hub account \u2014 pick a plan below to subscribe and get your first assignment from JD.") +
        "</p>" +
      trialBlockHtml() +
      '<p class="hw-hub-v5-sellup-caption" id="hw-v5-noplan-sellup-caption" hidden></p>' +
      '<div class="hw-hub-v5-sellup-frame" id="hw-v5-noplan-sellup-frame" hidden>' +
      '<div class="hw-hub-v5-sellup" id="hw-v5-noplan-sellup" aria-label="Homework Hub plans"></div>' +
      "</div>" +
      '<aside class="hw-tier-student-bar" aria-label="Student Special">' +
      '<div class="hw-tier-student-bar__main">' +
      '<p class="hw-tier-student-bar__eyebrow">Student Special</p>' +
      '<p class="hw-tier-student-bar__price"><span class="hw-tier-student-bar__price-main">$10</span><span class="hw-tier-student-bar__price-suffix">/mo</span></p>' +
      '<p class="hw-tier-student-bar__text">Currently a student? Enjoy the premium subscription at $10/mo.</p>' +
      "</div>" +
      '<button class="btn btn--primary hw-tier-student-bar__cta" type="button" data-hw-checkout="student-special">Join Student Special</button>' +
      "</aside>";
    global.HwCheckout?.bindCheckoutControls?.(welcome);
    return welcome;
  }

  function trialBlockHtml() {
    /* New students are paused, so no free-trial request either. */
    if (global.HwCheckout?.isHubPaused?.()) return "";
    return (
      '<div class="hw-hub-v5-trial" data-hw-trial>' +
      '<p class="hw-hub-v5-trial__pitch">Interested in a free trial of HomeworkHub?</p>' +
      '<button type="button" class="hw-hub-v5-trial__link" data-hw-trial-request>Request a free trial assignment?</button>' +
      '<div class="hw-hub-v5-trial__levels" hidden data-hw-trial-levels>' +
      '<p class="hw-hub-v5-trial__ask">What level do you want?</p>' +
      '<div class="hw-hub-v5-trial__row">' +
      '<button type="button" class="hw-hub-v5-trial__level" data-hw-trial-level="beginner">Beginner</button>' +
      '<button type="button" class="hw-hub-v5-trial__level" data-hw-trial-level="intermediate">Intermediate</button>' +
      '<button type="button" class="hw-hub-v5-trial__level" data-hw-trial-level="advanced">Advanced</button>' +
      "</div>" +
      '<p class="hw-hub-v5-trial__status" hidden data-hw-trial-status></p>' +
      "</div></div>"
    );
  }

  function ensureTrialBlock(host) {
    if (!host || host.querySelector("[data-hw-trial]")) return;
    const desc = host.querySelector(".hw-hub-v5-no-hw__desc, .hw-hub-v5-noplan__desc");
    const wrap = document.createElement("div");
    wrap.innerHTML = trialBlockHtml();
    const node = wrap.firstElementChild;
    if (!node) return;
    if (desc) desc.insertAdjacentElement("afterend", node);
    else host.prepend(node);
  }

  function setTrialStatus(box, message, isError) {
    const status = box?.querySelector("[data-hw-trial-status]");
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || "";
    status.classList.toggle("hw-hub-v5-trial__status--error", Boolean(isError));
  }

  async function requestFreeTrial(level, box) {
    const picked = String(level || "").trim().toLowerCase();
    if (!picked || !box) return;

    const buttons = box.querySelectorAll("[data-hw-trial-level]");
    buttons.forEach((btn) => {
      btn.disabled = true;
    });
    setTrialStatus(box, "Sending your request\u2026", false);

    if (demoModeEnabled()) {
      setTrialStatus(
        box,
        "This is a preview. Log in on your Homework Hub account to request a free trial assignment.",
        true
      );
      buttons.forEach((btn) => {
        btn.disabled = false;
      });
      return;
    }

    const session = getActiveSession();
    const username = String(session?.username || "").trim().toLowerCase();
    if (!username) {
      setTrialStatus(box, "Log in first, then request a free trial assignment.", true);
      buttons.forEach((btn) => {
        btn.disabled = false;
      });
      return;
    }

    try {
      const res = await fetch("/api/homework-trial-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, level: picked }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not request a free trial assignment.");
      }
      setTrialStatus(box, "Your free trial assignment is on your Homework Hub\u2026", false);
      try {
        sessionStorage.removeItem("jlm-hw-catalog-v1");
      } catch {
        /* ignore */
      }
      window.location.hash = "";
      window.location.reload();
    } catch (err) {
      setTrialStatus(
        box,
        (err && err.message) || "Could not request a free trial assignment.",
        true
      );
      buttons.forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  /* Full Quizlet core list. The word changes with the local 5:00 a.m. day. */
  const CORE_LIST_URL = "/preview/you-need-this-japanese/core-list.json?v=20261021-1pun";
  const CORE_SAYS_URL = "/preview/you-need-this-japanese/core-says.json";
  let coreCards = [];
  let coreSays = [];

  function loadCoreCards() {
    if (loadCoreCards.promise) return loadCoreCards.promise;
    loadCoreCards.promise = fetch(CORE_LIST_URL)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        coreCards = Array.isArray(list) ? list : [];
        return coreCards;
      })
      .catch(() => {
        coreCards = [];
        return coreCards;
      });
    return loadCoreCards.promise;
  }

  function loadCoreSays() {
    if (loadCoreSays.promise) return loadCoreSays.promise;
    loadCoreSays.promise = fetch(CORE_SAYS_URL)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        coreSays = Array.isArray(list) ? list : [];
        return coreSays;
      })
      .catch(() => {
        coreSays = [];
        return coreSays;
      });
    return loadCoreSays.promise;
  }

  function localDayKey() {
    return global.HwLocalPeriod.dayKey();
  }

  function localWeekKey() {
    return global.HwLocalPeriod.weekKey();
  }

  function localDayOfYear() {
    return global.HwLocalPeriod.dayOfYear();
  }

  function coreDaySerial() {
    const parts = localDayKey().split("-").map(Number);
    if (parts.length !== 3 || !parts[0]) return 0;
    return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000);
  }

  function todaysCoreCard() {
    if (!coreCards.length) return null;
    const n = coreCards.length;
    const idx = ((coreDaySerial() % n) + n) % n;
    return coreCards[idx];
  }

  /* Card accents follow the student presentation. Chapter 1 uses site gold (--color-gold). */
  const CH_TONE = [
    "#a78bfa",
    "#d4a853",
    "#e07a5f",
    "#f0b429",
    "#3dbaa8",
    "#67c4eb",
    "#4a8fd4",
    "#94a3b8",
    "#f472b6",
    "#38bdf8",
    "#a3e635",
    "#fb923c",
  ];

  const CHAPTERS = [
    {
      n: 0,
      title: "Ground Rules for Beginner Conversation",
      rules: [
        ["The Repeat Rule", "No need to think. Just repeat the question and make a minor change."],
        ["The Katakana Rule", "Don't know it in Japanese? Say it in English in your best Japanese accent."],
        ["Talk now, worry later", "Mistakes are good and help you learn faster."],
        ["One way to say", "Sounding smart is nice, but being humble takes"],
      ],
    },
    {
      n: 1,
      titleHtml: '1 <ruby>自己紹介<rt>じこしょうかい</rt></ruby>',
      en: "Introducing yourself",
      linesHtml: [
        "お<ruby>名前<rt>なまえ</rt></ruby>は？",
        "<ruby>何才<rt>なんさい</rt></ruby>ですか？",
        "どこに<ruby>住<rt>す</rt></ruby>んでますか？",
        "お<ruby>仕事<rt>しごと</rt></ruby>は？",
        "<ruby>趣味<rt>しゅみ</rt></ruby>はありますか？",
      ],
    },
    { n: 2, title: "した — past", en: "Simple た・だ" },
    { n: 3, title: "する — future / invite", en: "る・ます · also “wanna…?”" },
    { n: 4, title: "してる", en: "What are you doing right now?" },
    { n: 5, title: "Negative plain past", en: "しなかった · 食べなかった…" },
    { n: 6, title: "Negative future", en: "しない · 食べない…" },
    { n: 7, title: "Four Types of Japanese", en: "The map — so forms stop feeling random" },
    { n: 8, title: "ましょう", en: "Let’s…" },
    { n: 9, title: "い-adjectives", en: "Conjugation explanation" },
    { n: 10, title: "Nouns & な-adjectives", en: "Conjugation explanation" },
    { n: 11, title: "Verb conjugation", en: "Fuller explanation — once the talk is already down" },
  ];

  function todayCoreStripHtml() {
    const item = todaysWordItem();
    const gloss = item.en ? "<span>" + escapeHtml(item.en) + "</span>" : "";
    return (
      '<aside class="hw-core-strip">' +
      "<p>Today's Core Japanese — use these in the grammar line and on today's situation card.</p>" +
      '<p class="hw-core-today-word">Today\'s Word = ' +
      escapeHtml(item.word) +
      "</p>" +
      '<ul class="hw-core-row">' +
      '<li class="hw-core-chip hw-core-chip--green"><b>' +
      escapeHtml(item.word) +
      "</b> " +
      gloss +
      "</li></ul></aside>"
    );
  }

  function paintCoreStrips() {
    document.querySelectorAll(".hw-core-strip").forEach((el) => {
      const holder = document.createElement("div");
      holder.innerHTML = todayCoreStripHtml();
      el.replaceWith(holder.firstElementChild);
    });
  }

  function curriculumChapterIndex() {
    const saved = Number(readStorage(curriculumUserKey("jlm-hw-curriculum-chapter"), "0"));
    if (!Number.isFinite(saved) || saved < 0 || saved > 11) return 0;
    return saved;
  }

  function curriculumChapterBody(n) {
    const chapter = CHAPTERS[n] || CHAPTERS[0];
    const tone = CH_TONE[chapter.n] || CH_TONE[0];
    const title = chapter.titleHtml
      ? chapter.titleHtml
      : escapeHtml(chapter.n + " " + chapter.title);
    let inner = "";
    if (chapter.en) {
      inner += '<p class="hw-ch-card__en">' + escapeHtml(chapter.en) + "</p>";
    }
    if (chapter.rules) {
      inner +=
        '<ul class="hw-ch-rules">' +
        chapter.rules
          .map((pair) => "<li><b>" + escapeHtml(pair[0]) + "</b><span>" + escapeHtml(pair[1]) + "</span></li>")
          .join("") +
        "</ul>";
    } else if (chapter.linesHtml) {
      inner +=
        '<ul class="hw-ch-lines" lang="ja">' +
        chapter.linesHtml.map((line) => "<li>" + line + "</li>").join("") +
        "</ul>";
    } else {
      inner += '<p class="hw-ch-later">Links for this chapter come later.</p>';
    }
    return (
      '<article class="hw-ch-card" style="--ch:' +
      tone +
      '">' +
      '<span class="hw-ch-card__badge" aria-hidden="true">' +
      chapter.n +
      "</span>" +
      '<h3 class="hw-ch-card__title">' +
      title +
      "</h3>" +
      inner +
      "</article>"
    );
  }

  function paintCurriculumChapter(root) {
    if (!root) return;
    const n = curriculumChapterIndex();
    root.querySelectorAll("[data-chapter]").forEach((btn) => {
      const on = Number(btn.getAttribute("data-chapter")) === n;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const body = root.querySelector("[data-chapter-body]");
    if (body) body.innerHTML = curriculumChapterBody(n);
  }

  function todayChecks() {
    const today = localDayKey();
    const week = localWeekKey();
    let bag = {};
    try {
      bag = JSON.parse(readStorage(curriculumUserKey("jlm-hw-curriculum-today-checks"), "{}")) || {};
    } catch {
      bag = {};
    }
    if (!bag.done || typeof bag.done !== "object") bag.done = {};
    const questStillThisWeek = bag.week === week && !!bag.done.quest;
    if (bag.date !== today) {
      bag = { date: today, week: week, done: {} };
      if (questStillThisWeek) bag.done.quest = true;
      saveTodayChecks(bag);
    } else if (bag.week !== week) {
      bag.week = week;
      delete bag.done.quest;
      saveTodayChecks(bag);
    }
    return bag;
  }

  function saveTodayChecks(bag) {
    writeStorage(curriculumUserKey("jlm-hw-curriculum-today-checks"), JSON.stringify(bag));
  }

  function completeTodayTask(taskId, opts) {
    const id = String(taskId || "").trim();
    if (!id) return;
    const bag = todayChecks();
    bag.done[id] = true;
    saveTodayChecks(bag);
    const row = document.querySelector('#hw-v5-panel-today [data-task="' + id + '"]');
    if (row) {
      row.classList.add("is-done");
      const box = row.querySelector('input[type="checkbox"]');
      if (box) box.checked = true;
    }
    if (opts && opts.stay) {
      if (opts.toast) global.HwToast?.show?.(opts.toast);
      return;
    }
    setActiveTab("today", { scrollTop: true });
  }

  function completeTaskButton(taskId) {
    return "";
  }

  /* The card reading is the whole word (乗る = のる). Kana already in the word is okurigana, so it is not furigana. 乗る / のる → 乗 + の, then る. Never のる on top of 乗る. */
  function furiganaPieces(word, reading) {
    const value = String(word || "");
    const yomi = String(reading || "").replace(/\s+/g, "");
    if (!yomi || !/[\u4E00-\u9FFF]/.test(value) || /^[\u30A0-\u30FF\u30FC]+$/.test(yomi)) {
      return [{ text: value, rt: "" }];
    }
    const groups = value.match(/[\u4E00-\u9FFF]+|[^\u4E00-\u9FFF]+/g) || [value];
    let rest = yomi;
    return groups.map((group, index) => {
      if (!/[\u4E00-\u9FFF]/.test(group)) {
        if (rest.startsWith(group)) rest = rest.slice(group.length);
        return { text: group, rt: "" };
      }
      let rt = rest;
      const nextKana = groups
        .slice(index + 1)
        .find((part) => /^[\u3040-\u309F\u30A0-\u30FF]+$/.test(part));
      if (!nextKana) {
        rest = "";
      } else {
        const at = rest.indexOf(nextKana);
        if (at > 0) {
          rt = rest.slice(0, at);
          rest = rest.slice(at);
        } else if (at === 0) {
          rt = "";
        } else {
          rest = "";
        }
      }
      return { text: group, rt: rt };
    });
  }

  function furiMarkup(word, reading) {
    const pieces = furiganaPieces(word, reading);
    if (!pieces.some((piece) => piece.rt)) return "<b class=\"hw-word-write\">" + escapeHtml(word) + "</b>";
    return (
      '<b class="hw-word-write">' +
      pieces
        .map((piece) => {
        if (!piece.rt) return escapeHtml(piece.text);
        return (
          '<span class="hw-furi">' +
          escapeHtml(piece.text) +
          "<i>" +
          escapeHtml(piece.rt) +
          "</i></span>"
        );
      })
      .join("") +
    "</b>"
    );
  }

  function kanjiRuby(text, reading) {
    const inner = furiganaPieces(text, reading)
      .map((piece) => {
        if (!piece.rt) return escapeHtml(piece.text);
        return "<ruby>" + escapeHtml(piece.text) + "<rt>" + escapeHtml(piece.rt) + "</rt></ruby>";
      })
      .join("");
    return '<b class="hw-word-write">' + inner + "</b>";
  }

  /* ---- 今日は2026年10月9日、金曜日です (furigana on, numbers stay numbers) ---- */
  const DATE_DAYS = [
    "", "ついたち", "ふつか", "みっか", "よっか", "いつか", "むいか", "なのか", "ようか", "ここのか", "とおか",
    "じゅういちにち", "じゅうににち", "じゅうさんにち", "じゅうよっか", "じゅうごにち", "じゅうろくにち", "じゅうしちにち",
    "じゅうはちにち", "じゅうくにち", "はつか", "にじゅういちにち", "にじゅうににち", "にじゅうさんにち", "にじゅうよっか",
    "にじゅうごにち", "にじゅうろくにち", "にじゅうしちにち", "にじゅうはちにち", "にじゅうくにち", "さんじゅうにち", "さんじゅういちにち",
  ];
  const DATE_WEEKDAYS = [
    ["日曜日", "にちようび"], ["月曜日", "げつようび"], ["火曜日", "かようび"], ["水曜日", "すいようび"],
    ["木曜日", "もくようび"], ["金曜日", "きんようび"], ["土曜日", "どようび"],
  ];

  /** The real calendar date where the student is. Changes at midnight (not 5 a.m.). */
  function todayDateParts() {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), weekday: d.getDay() };
  }

  function todayDateKey() {
    const t = todayDateParts();
    return t.year + "-" + t.month + "-" + t.day;
  }

  /* Furigana only where it helps: 年 (ねん), 月 (がつ), 10-12 month numbers, 11+ day numbers, the odd day names (ついたち...), and the weekday. */
  const DATE_ODD_DAYS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 20, 24]);

  /** The date line itself (with the few furigana), no wrapper. */
  function todayDateInner() {
    const t = todayDateParts();
    const wd = DATE_WEEKDAYS[t.weekday];
    const ruby = (text, rt) => "<ruby>" + text + "<rt>" + rt + "</rt></ruby>";
    // One ruby per unit (10月 = じゅうがつ, 11日 = じゅういちにち) so the furigana stays tight.
    const dayHtml = ruby(t.day + "日", DATE_DAYS[t.day]);
    const monthReadings = { 10: "じゅうがつ", 11: "じゅういちがつ", 12: "じゅうにがつ" };
    const monthHtml = monthReadings[t.month]
      ? ruby(t.month + "月", monthReadings[t.month])
      : t.month + ruby("月", "がつ");
    return (
      t.year + ruby("年", "ねん") +
      monthHtml +
      dayHtml +
      "、" + ruby(wd[0], wd[1])
    );
  }

  function todayDateHtml() {
    return '<p class="hw-datebar" lang="ja" data-date="' + todayDateKey() + '">' + todayDateInner() + "</p>";
  }

  /** The Quest tab (4-tab hub) shows the date inside its big box on request. */
  global.HwTodayDate = {
    inner: todayDateInner,
    enabled: () => !usesCurriculumHub() && !isQuestOnlyAccount(),
  };

  /** Keep every date line on the real date. Runs when the page changes and as midnight passes. */
  function refreshDateBars() {
    const key = todayDateKey();
    const html = todayDateHtml();
    document.querySelectorAll(".hw-datebar").forEach((el) => {
      if (el.getAttribute("data-date") === key) return;
      el.outerHTML = html;
    });
  }

  /** Shrink the date text a little when a narrow phone can't fit it on one line. */
  function fitDateBar(el) {
    if (!el || !el.isConnected) return;
    el.style.fontSize = "";
    const avail = el.clientWidth;
    if (!avail) return;
    const need = el.scrollWidth;
    if (need > avail + 1) {
      const base = parseFloat(getComputedStyle(el).fontSize) || 23;
      el.style.fontSize = Math.max(10, Math.floor(base * (avail / need) * 0.97 * 10) / 10) + "px";
    }
  }

  let dateFitQueued = false;
  function queueDateFit() {
    if (dateFitQueued) return;
    dateFitQueued = true;
    window.requestAnimationFrame(() => {
      dateFitQueued = false;
      document.querySelectorAll(".hw-datebar").forEach(fitDateBar);
    });
  }

  let dateFitStarted = false;
  function startDateFit() {
    if (dateFitStarted || !document.body) return;
    dateFitStarted = true;
    window.addEventListener("resize", queueDateFit);
    new MutationObserver(queueDateFit).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "class"],
    });
    queueDateFit();
  }

  let dateBarTimer = 0;
  function startDateBarClock() {
    if (dateBarTimer) return;
    dateBarTimer = window.setInterval(refreshDateBars, 30000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshDateBars();
    });
  }

  /** 4-tab hub: the date sits at the top of the HW tab. Curriculum hubs show it in the To-do list. */
  function ensureDateStrip() {
    startDateBarClock();
    startDateFit();
    /* 4-tab hub: no strip on the HW tab any more (date lives behind a button on the Quest tab). */
    document.getElementById("hw-datebar-hw")?.remove();
    refreshDateBars();
  }

  function curriculumTodayMarkup() {    const bag = todayChecks();
    const word = todaysWordItem();
    const wordLabel = "Word of the Day: " + (word.word || "");
    /* Cafe hour: short order. Start at the top. The map is last, not the work. */
    const exercise =
      global.HwCurriculumTextbook?.dailyPrompt?.() || "今日は何をしましたか";
    const exerciseLabel =
      "Daily Exercise: " + exercise + (/[？?。]$/.test(exercise) || !/[\u3000-\u9FFF]$/.test(exercise) ? "" : "。");
    const steps = [];
    const hwStep = ["hw", "homework", "", "Homework"];
    if (seesPrayerTab()) {
      steps.push(["pray", "prayer", "", "Pray in Japanese"]);
      steps.push(hwStep);
    } else {
      steps.push(hwStep);
    }
    steps.push(
      ["core", "core", "", "Word of the Day: " + kanjiRuby(word.word, word.reading), "html"],
      ["grammar", "notebook", "shita", exerciseLabel],
      ["card", "situations", "", "Situation of the Day"],
      ["quest", "quest", "", "Weekly Quest"]
    );
    const rows = steps
      .map((task) => {
        const done = !!bag.done[task[0]];
        return (
          '<li class="hw-today__row' +
          (done ? " is-done" : "") +
          '" data-task="' +
          task[0] +
          '">' +
          '<label class="hw-today__box"><input type="checkbox"' +
          (done ? " checked" : "") +
          ' aria-label="Done: ' +
          escapeHtml(task[4] === "html" ? wordLabel : task[3]) +
          '"></label>' +
          '<button type="button" class="hw-today__go" data-go="' +
          task[1] +
          '"' +
          (task[2] ? ' data-focus="' + task[2] + '"' : "") +
          ">" +
          (task[4] === "html" ? task[3] : escapeHtml(task[3])) +
          "</button></li>"
        );
      })
      .join("");
    return (
      '<section class="hw-today">' +
      todayDateHtml() +
      "<ol>" +
      rows +
      "</ol></section>"
    );
  }

  function openCurriculumPlace(tab, focus) {
    if (tab === "notebook" && focus) sessionStorage.setItem("jlm-ct-focus", focus);
    setActiveTab(tab, { scrollTop: true });
    global.HwCurriculumTextbook?.sync?.();
    if (!focus) return;
    window.setTimeout(() => {
      document.querySelector('#hw-v5-panel-notebook [data-page="' + focus + '"]')?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 60);
  }

  function bindCurriculumToday(section) {
    if (section.dataset.bound === "1") return;
    section.dataset.bound = "1";
    section.addEventListener("change", (ev) => {
      const box = ev.target;
      if (!box || box.type !== "checkbox") return;
      const row = box.closest("[data-task]");
      if (!row) return;
      const id = row.getAttribute("data-task");
      const bag = todayChecks();
      bag.done[id] = box.checked;
      saveTodayChecks(bag);
      row.classList.toggle("is-done", box.checked);
    });
    section.addEventListener("click", (ev) => {
      const go = ev.target.closest("[data-go]");
      if (!go || !section.contains(go)) return;
      openCurriculumPlace(go.getAttribute("data-go"), go.getAttribute("data-focus") || "");
    });
  }

  function scriptureToday() {
    /* Public-domain 口語訳 (1954–55). Kanji only get furigana. */
    const verses = [
      [
        "ヨハネ 3:16",
        "<ruby>神<rt>かみ</rt></ruby>はそのひとり<ruby>子<rt>こ</rt></ruby>を<ruby>賜<rt>たま</rt></ruby>わったほどに、この<ruby>世<rt>よ</rt></ruby>を<ruby>愛<rt>あい</rt></ruby>して<ruby>下<rt>くだ</rt></ruby>さった。それは<ruby>御子<rt>みこ</rt></ruby>を<ruby>信<rt>しん</rt></ruby>じる<ruby>者<rt>もの</rt></ruby>がひとりも<ruby>滅<rt>ほろ</rt></ruby>びないで、<ruby>永遠<rt>えいえん</rt></ruby>の<ruby>命<rt>いのち</rt></ruby>を<ruby>得<rt>え</rt></ruby>るためである。",
      ],
      [
        "<ruby>詩篇<rt>しへん</rt></ruby> 23:1",
        "<ruby>主<rt>しゅ</rt></ruby>はわたしの<ruby>牧者<rt>ぼくしゃ</rt></ruby>であって、わたしには<ruby>乏<rt>とぼ</rt></ruby>しいことがない。",
      ],
      [
        "<ruby>詩篇<rt>しへん</rt></ruby> 119:105",
        "あなたのみ<ruby>言葉<rt>ことば</rt></ruby>はわが<ruby>足<rt>あし</rt></ruby>のともしび、わが<ruby>道<rt>みち</rt></ruby>の<ruby>光<rt>ひかり</rt></ruby>です。",
      ],
      [
        "マタイ 11:28",
        "すべて<ruby>重荷<rt>おもに</rt></ruby>を<ruby>負<rt>お</rt></ruby>うて<ruby>苦労<rt>くろう</rt></ruby>している<ruby>者<rt>もの</rt></ruby>は、わたしのもとにきなさい。あなたがたを<ruby>休<rt>やす</rt></ruby>ませてあげよう。",
      ],
    ];
    const day = localDayOfYear();
    return verses[((day % verses.length) + verses.length) % verses.length];
  }

  function isPrayerBuilderAccount() {
    const session = global.HwAuth?.getSession?.();
    if (global.HwAuth?.isChristianCurriculumUser?.(session)) return true;
    const user = String(session?.username || "").trim().toLowerCase();
    return user === "demo2" || user === "christian" || user === "alex";
  }

  function prayerPartHtml(part) {
    const slot = part.giftPieces
      ? '<span class="hw-star-block__slot" data-slot-index="0" data-accept="gift" aria-label="What did God give?" hidden></span>' +
        '<span class="hw-prayer-part__fixed" data-prayer-wo hidden>を</span>' +
        '<span class="hw-star-block__slot" data-slot-index="1" data-accept="verb" aria-label="' +
        escapeHtml(part.label) +
        '"></span>'
      : '<span class="hw-star-block__slot" data-slot-index="0" aria-label="' +
        escapeHtml(part.label) +
        '"></span>';
    const chipHtml = (marked, index, poolName, startHidden) => {
      const piece = String(marked).replace(/\{[^{}]+\}/g, "");
      const color = (index % 4) + 1;
      return (
        '<div class="hw-star-block__chip hw-star-block__chip--' +
        color +
        '" data-piece="' +
        escapeHtml(piece) +
        '" data-color="' +
        color +
        (poolName ? '" data-pool="' + poolName : "") +
        '" draggable="true" role="button" tabindex="0"' +
        (startHidden ? " hidden" : "") +
        ">" +
        sitRubyHtml(marked) +
        "</div>"
      );
    };
    const chips = part.pieces
      .map((marked, index) => chipHtml(marked, index, part.giftPieces ? "verb" : "", false))
      .concat((part.giftPieces || []).map((marked, index) => chipHtml(marked, index, "gift", true)))
      .join("");
    const before = part.before
      ? '<span class="hw-prayer-part__fixed">' + escapeHtml(part.before) + "</span>"
      : "";
    const after = part.after
      ? '<span class="hw-prayer-part__fixed">' + escapeHtml(part.after) + "</span>"
      : "";
    const beforeAttr = part.before ? ' data-before="' + escapeHtml(part.before) + '"' : "";
    const afterAttr = part.after ? ' data-after="' + escapeHtml(part.after) + '"' : "";
    return (
      '<section class="hw-prayer-part"' +
      beforeAttr +
      afterAttr +
      (part.role ? ' data-prayer-role="' + escapeHtml(part.role) + '"' : "") +
      (part.hidden ? " hidden" : "") +
      ">" +
      '<p class="hw-prayer-part__label">' +
      escapeHtml(part.label) +
      "</p>" +
      '<div class="hw-worksheet__line hw-worksheet__line--star" data-prayer-star>' +
      '<div class="hw-worksheet__content">' +
      '<div class="hw-star-block__sentence hw-prayer-part__spoken" lang="ja">' +
      before +
      slot +
      after +
      "</div>" +
      '<div class="hw-star-block__pool" role="list" aria-label="' +
      escapeHtml(part.label) +
      '">' +
      chips +
      "</div>" +
      '<button type="button" class="btn btn--ghost btn--sm hw-star-block__reset">Reset</button>' +
      '<input type="hidden" class="hw-star-block__answer" value="">' +
      "</div></div></section>"
    );
  }

  function prayerBuilderHtml() {
    const parts = [
      {
        label: "Opening",
        pieces: [
          "天{てん}におられる神{かみ}様{さま}",
          "天{てん}なる父{ちち}よ",
          "神{かみ}様{さま}",
          "天{てん}のお父{とう}様{さま}",
          "父{ちち}なる神{かみ}様{さま}",
          "主{しゅ}よ",
        ],
        after: "、",
      },
      {
        label: "Saying Thanks",
        role: "thankful",
        pieces: ["与{あた}えて", "守{まも}って", "導{みちび}いて", "教{おし}えて", "癒{いや}して"],
        giftPieces: ["知{ち}恵{え}", "平{へい}和{わ}", "お金{かね}", "友{とも}達{だち}", "この日{ひ}", "命{いのち}"],
        after: "くれてありがとうございます。",
      },
      {
        label: "Saying sorry",
        pieces: [
          "怒{おこ}って",
          "嘘{うそ}をついて",
          "罪{つみ}を犯{おか}して",
          "忘{わす}れて",
          "人{ひと}を傷{きず}つけて",
          "文{もん}句{く}を言{い}って",
        ],
        after: "ごめんなさい。",
      },
      {
        label: "Asking for help",
        pieces: [
          "友{とも}達{だち}",
          "今日{きょう}出{で}会{あ}った人{ひと}",
          "お母{かあ}さん",
          "お父{とう}さん",
          "家{か}族{ぞく}",
          "病{びょう}気{き}の人{ひと}",
        ],
        after: "を助けてください。",
      },
      {
        label: "Closing the prayer",
        pieces: [
          "主{しゅ}イエス・キリストの御名{みな}によってお祈{いの}ります。",
          "イエスの名{な}前{まえ}によって祈{いの}ります。",
          "イエス様{さま}の御名{みな}によって祈{いの}ります。",
          "主{しゅ}の御名{みな}によってお祈{いの}ります。",
        ],
      },
    ];
    return (
      '<div class="hw-prayer-build" data-prayer-build>' +
      '<div class="hw-worksheet__slide-nav-row">' +
      '<div class="hw-worksheet__slide-nav hw-prayer-nav" role="navigation" data-keep-clear>' +
      '<button type="button" class="hw-worksheet__slide-btn" data-prayer-prev aria-label="Previous question" disabled>←</button>' +
      '<p class="hw-worksheet__slide-counter" data-prayer-count aria-live="polite">1 of ' +
      parts.length +
      "</p>" +
      '<button type="button" class="hw-worksheet__slide-btn" data-prayer-next aria-label="Next question">→</button>' +
      "</div></div>" +
      parts
        .map((part, index) => prayerPartHtml(Object.assign({ hidden: index !== 0 }, part)))
        .join("") +
      '<button type="button" class="btn hw-prayer-create" data-prayer-create hidden>Create Prayer</button>' +
      "</div>" +
      '<div class="hw-prayer-result" data-prayer-result hidden>' +
      '<div class="hw-today__row hw-prayer__sheet" lang="ja" data-prayer-lines></div>' +
      '<button type="button" class="btn btn--ghost hw-prayer-change" data-prayer-change>Change</button>' +
      "</div>"
    );
  }

  function prayerMarkup() {
    const verse = scriptureToday();
    return (
      '<section class="hw-prayer">' +
      "<h2>Pray to God in Japanese</h2>" +
      prayerBuilderHtml() +
      '<div class="hw-prayer__scripture">' +
      '<p class="hw-prayer__verse-label">Verse of the Day</p>' +
      '<button type="button" class="hw-today__row hw-prayer__verse" data-verse aria-expanded="false">' +
      verse[0] +
      " · 口語訳</button>" +
      '<p class="hw-prayer__scripture-text" lang="ja" hidden>' +
      verse[1] +
      "</p></div>" +
      completeTaskButton("pray") +
      "</section>"
    );
  }

  function bindPrayer(section) {
    if (!section || section.dataset.bound === "1") return;
    section.dataset.bound = "1";
    section.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-verse]");
      if (!btn || !section.contains(btn)) return;
      const text = btn.parentElement?.querySelector(".hw-prayer__scripture-text");
      if (!text) return;
      const open = text.hasAttribute("hidden");
      text.toggleAttribute("hidden", !open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    section.querySelectorAll("[data-prayer-star]").forEach((line) => {
      if (global.HwStarBlock?.initLine) global.HwStarBlock.initLine(line);
    });
    const build = section.querySelector("[data-prayer-build]");
    const result = section.querySelector("[data-prayer-result]");
    const linesHost = section.querySelector("[data-prayer-lines]");
    const createBtn = section.querySelector("[data-prayer-create]");
    const countEl = section.querySelector("[data-prayer-count]");
    const prevBtn = section.querySelector("[data-prayer-prev]");
    const nextBtn = section.querySelector("[data-prayer-next]");
    if (!build || !result || !linesHost || !createBtn || !countEl || !prevBtn || !nextBtn) return;
    const parts = () => Array.from(build.querySelectorAll(".hw-prayer-part"));
    const thankPart = () => build.querySelector('[data-prayer-role="thankful"]');
    let page = 0;
    function slotValue(slot) {
      return slot ? String(slot.dataset.value || "").trim() : "";
    }
    function chosen(part) {
      if (!part) return "";
      const verb = part.querySelector('[data-accept="verb"]');
      const slot = verb || part.querySelector(".hw-star-block__slot");
      return slotValue(slot);
    }
    function giftValue(part) {
      return slotValue(part && part.querySelector('[data-accept="gift"]'));
    }
    function shownPiece(part, piece) {
      const chip = Array.from(part.querySelectorAll(".hw-star-block__chip")).find(
        (el) => el.getAttribute("data-piece") === piece
      );
      return chip && chip.querySelector("ruby") ? chip.innerHTML : escapeHtml(piece);
    }
    function giving() {
      const thank = thankPart();
      return Boolean(thank && chosen(thank) === "与えて");
    }
    function releaseSlot(slot) {
      const piece = slotValue(slot);
      if (!slot || !piece) return;
      const pool = slot.closest("[data-prayer-star]")?.querySelector(".hw-star-block__pool");
      slot.dataset.value = "";
      delete slot.dataset.color;
      slot.className = "hw-star-block__slot";
      slot.draggable = false;
      slot.replaceChildren();
      slot.setAttribute("aria-label", "Blank");
      const chip = pool && pool.querySelector('.hw-star-block__chip[data-piece="' + piece + '"]');
      if (chip) {
        chip.classList.remove("hw-star-block__chip--placed");
        chip.removeAttribute("aria-hidden");
      }
    }
    function syncGift() {
      const thank = thankPart();
      if (!thank) return;
      const giftSlot = thank.querySelector('[data-accept="gift"]');
      const wo = thank.querySelector("[data-prayer-wo]");
      const pool = thank.querySelector(".hw-star-block__pool");
      if (!giftSlot || !wo || !pool) return;
      const on = chosen(thank) === "与えて";
      if (!on) releaseSlot(giftSlot);
      giftSlot.hidden = !on;
      wo.hidden = !on;
      pool.querySelectorAll(".hw-star-block__chip").forEach((chip) => {
        const isGift = chip.getAttribute("data-pool") === "gift";
        chip.hidden = on ? !isGift : isGift;
      });
    }
    function showPage(next) {
      const list = parts();
      if (!list.length) return;
      page = Math.max(0, Math.min(next, list.length - 1));
      list.forEach((part, index) => {
        part.hidden = index !== page;
      });
      countEl.textContent = page + 1 + " of " + list.length;
      prevBtn.disabled = page <= 0;
      nextBtn.disabled = page >= list.length - 1;
      syncGift();
    }
    function refreshCreate() {
      const ready = parts().every((part) => chosen(part));
      const thank = thankPart();
      const giftOk = !giving() || Boolean(thank && giftValue(thank));
      createBtn.hidden = !(ready && giftOk);
    }
    const thankReset = thankPart()?.querySelector(".hw-star-block__reset");
    if (thankReset) {
      thankReset.addEventListener(
        "click",
        () => {
          thankPart()
            ?.querySelectorAll('.hw-star-block__chip[data-pool="verb"]')
            .forEach((chip) => {
              chip.hidden = false;
            });
        },
        true
      );
    }
    prevBtn.addEventListener("click", () => showPage(page - 1));
    nextBtn.addEventListener("click", () => showPage(page + 1));
    build.addEventListener("input", (ev) => {
      if (!ev.target.classList || !ev.target.classList.contains("hw-star-block__answer")) return;
      syncGift();
      refreshCreate();
    });
    createBtn.addEventListener("click", () => {
      const list = parts();
      const thank = thankPart();
      if (!list.every((part) => chosen(part))) return;
      if (giving() && !(thank && giftValue(thank))) return;
      const lines = list.map((part) => {
        const piece = chosen(part);
        let shown = shownPiece(part, piece);
        if (part.getAttribute("data-prayer-role") === "thankful" && giving()) {
          shown = shownPiece(part, giftValue(part)) + "を" + shown;
        }
        return escapeHtml(part.dataset.before || "") + shown + escapeHtml(part.dataset.after || "");
      });
      lines.push("アーメン");
      linesHost.innerHTML = lines.map((line) => "<p>" + line + "</p>").join("");
      build.hidden = true;
      result.hidden = false;
    });
    const changeBtn = section.querySelector("[data-prayer-change]");
    if (changeBtn) {
      changeBtn.addEventListener("click", () => {
        result.hidden = true;
        build.hidden = false;
      });
    }
    showPage(0);
  }

  function coreKindListHtml(kind) {
    const kinds = [
      ["i", "い-ending"],
      ["na", "な-adjective"],
      ["noun", "noun"],
      ["verb", "verb"],
    ];
    return (
      '<p class="hw-core-kind-list">' +
      kinds
        .map((pair) => "<span" + (pair[0] === kind ? ' class="is-on"' : "") + ">" + pair[1] + "</span>")
        .join("") +
      "</p>"
    );
  }

const GODAN_RU = ["帰る", "切る", "走る", "入る", "知る", "要る", "喋る", "滑る", "減る", "焦る", "限る", "握る", "蹴る"];
const EI = "いきしちにひびみりえけせてねへべめれぎじぢびぴげぜでべぺ";

function endsWord(s, word) {
  return s.endsWith(word);
}

function godanRu(s) {
  return GODAN_RU.some((word) => endsWord(s, word));
}

function pastToMasu(s) {
  if (s.endsWith("行った")) return s.slice(0, -3) + "行きました";
  if (s.endsWith("あった") && !s.endsWith("なかった")) return s.slice(0, -3) + "ありました";
  if (s.endsWith("った")) return s.slice(0, -2) + "いました";
  if (s.endsWith("いだ")) return s.slice(0, -2) + "ぎました";
  if (s.endsWith("した") && !s.endsWith("でした") && !s.endsWith("ました")) return s.slice(0, -2) + "しました";
  if (s.endsWith("いた") && !s.endsWith("ていた")) return s.slice(0, -2) + "きました";
  const nda = [
    [/死んだ$/, "死にました"],
    [/読んだ$/, "読みました"],
    [/飲んだ$/, "飲みました"],
    [/呼んだ$/, "呼びました"],
    [/飛んだ$/, "飛びました"],
    [/遊んだ$/, "遊びました"],
    [/選んだ$/, "選びました"],
    [/学んだ$/, "学びました"],
    [/休んだ$/, "休みました"],
    [/頼んだ$/, "頼みました"],
    [/住んだ$/, "住みました"],
    [/運んだ$/, "運びました"],
  ];
  for (const [re, rep] of nda) {
    if (re.test(s)) return s.replace(re, rep);
  }
  if (s.endsWith("んだ")) return s.slice(0, -2) + "みました";
  if (s.endsWith("来た")) return s.slice(0, -1) + "ました";
  if (s.endsWith("見た")) return s.slice(0, -1) + "ました";
  if (s.endsWith("着た")) return s.slice(0, -1) + "ました";
  if (s.endsWith("出た")) return s.slice(0, -1) + "ました";
  if (s.endsWith("寝た")) return s.slice(0, -1) + "ました";
  if (s.endsWith("できた")) return s.slice(0, -1) + "ました";
  if (new RegExp("[" + EI + "]た$").test(s) && !s.endsWith("った")) return s.slice(0, -1) + "ました";
  return "";
}

function dictToMasu(s) {
  if (s.endsWith("来る")) return s.slice(0, -1) + "ます";
  if (s.endsWith("くる") && !s.endsWith("つくる")) return s.slice(0, -2) + "きます";
  if (s.endsWith("する")) return s.slice(0, -2) + "します";
  if (s.endsWith("行く")) return s.slice(0, -1) + "きます";
  if (s.endsWith("ある") && !s.endsWith("である")) return s.slice(0, -2) + "あります";
  if (godanRu(s)) return s.slice(0, -1) + "ります";
  if (new RegExp("[" + EI + "]る$").test(s)) return s.slice(0, -1) + "ます";
  const map = { う: "います", く: "きます", ぐ: "ぎます", す: "します", つ: "ちます", ぬ: "にます", ぶ: "びます", む: "みます", る: "ります" };
  const last = s.slice(-1);
  if (map[last]) return s.slice(0, -1) + map[last];
  return "";
}

function volitional(s) {
  const map = {
    こう: "きます",
    ごう: "ぎます",
    そう: "します",
    とう: "ちます",
    のう: "にます",
    ぼう: "びます",
    もう: "みます",
    ろう: "ります",
    おう: "います",
  };
  const key = s.slice(-2);
  if (!map[key]) return "";
  return s.slice(0, -2) + map[key];
}

function conjugateEnd(s) {
  if (!s) return s;
  if (/(です|ます|でした|ました)$/.test(s)) return s;
  if (s.endsWith("なかった")) return s + "です";
  if (s.endsWith("くない") || s.endsWith("てない") || s.endsWith("でない") || s.endsWith("ない")) return s + "です";
  if (s.endsWith("だった")) return s.slice(0, -3) + "でした";
  if (s.endsWith("だ") && !s.endsWith("まだ")) return s.slice(0, -1) + "です";
  if (s.endsWith("かった")) return s + "です";
  if (s.endsWith("ちゃった")) return s.slice(0, -4) + "ちゃいました";
  if (s.endsWith("じゃった")) return s.slice(0, -4) + "じゃいました";
  if (s.endsWith("ちゃう")) return s.slice(0, -3) + "ちゃいます";
  if (s.endsWith("じゃう")) return s.slice(0, -3) + "じゃいます";
  if (s.endsWith("てた")) return s.slice(0, -2) + "ていました";
  if (s.endsWith("でた")) return s.slice(0, -2) + "でいました";
  if (s.endsWith("ていた")) return s.slice(0, -3) + "ていました";
  if (s.endsWith("でいた")) return s.slice(0, -3) + "でいました";
  if (s.endsWith("てる")) return s.slice(0, -2) + "ています";
  if (s.endsWith("でる") && s.length > 2 && "てで".includes(s.slice(-3, -2))) return s.slice(0, -2) + "でいます";
  if (s.endsWith("ている")) return s.slice(0, -3) + "ています";
  if (s.endsWith("でいる")) return s.slice(0, -3) + "でいます";
  if (s.endsWith("とく")) return s.slice(0, -2) + "ときます";
  if (s.endsWith("どく")) return s.slice(0, -2) + "どきます";
  if (s.endsWith("といた")) return s.slice(0, -3) + "ときました";
  if (s.endsWith("どいた")) return s.slice(0, -3) + "どきました";
  if (s.endsWith("よう")) return s.slice(0, -2) + "ます";
  if (/(こう|ごう|そう|とう|のう|ぼう|もう|ろう|おう)$/.test(s)) {
    const next = volitional(s);
    if (next) return next;
  }
  const past = pastToMasu(s);
  if (past) return past;
  const dict = dictToMasu(s);
  if (dict) return dict;
  if (s.endsWith("って")) return conjugateEnd(s.slice(0, -2));
  if (s.endsWith("て") || s.endsWith("で") || s.endsWith("ないで")) return s;
  if (s.endsWith("い")) return s + "です";
  if (s.endsWith("だけ")) return s + "です";
  if (s.endsWith("とこ")) return s.slice(0, -2) + "ところです";
  return s + "です";
}

function politeFromPlain(raw) {
  const chunks = String(raw || "")
    .split("。")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!chunks.length) return "";
  return chunks.map((part) => politeClause(part)).join("");
}

function politeClause(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  let q = /[？?]$/.test(s);
  s = s.replace(/[。！？?]+$/g, "");
  let tail = "";
  if (s.endsWith("じゃん")) {
    s = s.slice(0, -3);
    tail = "ね";
  } else if (s.endsWith("よね")) {
    s = s.slice(0, -2);
    tail = "よね";
  } else if (s.endsWith("っけ")) {
    s = s.slice(0, -2);
    tail = "っけ";
  } else if (s.endsWith("かな")) {
    s = s.slice(0, -2);
    q = true;
  } else if (/[よね]$/.test(s)) {
    tail = s.slice(-1);
    s = s.slice(0, -1);
  }
  if (q && s.endsWith("の")) s = s.slice(0, -1);
  const bits = s.split("、");
  const tag = bits.length > 1 ? bits[bits.length - 1] : "";
  if (tag && tag.length <= 8 && !/(た|る|い|だ|て|で)$/.test(tag)) {
    bits.pop();
    let head = bits.join("、");
    let headTail = "";
    if (head.endsWith("よね")) {
      headTail = "よね";
      head = head.slice(0, -2);
    } else if (head.endsWith("じゃん")) {
      headTail = "ね";
      head = head.slice(0, -3);
    } else if (/[よね]$/.test(head)) {
      headTail = head.slice(-1);
      head = head.slice(0, -1);
    }
    s = conjugateEnd(head) + headTail + "、" + tag;
    tail = "";
  } else {
    s = conjugateEnd(s);
  }
  if (tail) s += tail;
  if (q && !s.endsWith("か")) s += "か";
  if (!/[。]$/.test(s)) s += "。";
  return s;
}


  function coreSaysFor(item) {
    const word = (item && item.word) || "";
    const raw = (item && item.jp) || "";
    const hit =
      coreSays.find((row) => row && (row.jp === raw || row.word === word)) ||
      (word
        ? coreSays.find((row) => row && String(row.word || row.jp || "").startsWith(word))
        : null);
    const plain = (hit && hit.plain) || (word === "大変" ? "今日、本当に大変だった。" : "");
    const kind = (hit && hit.kind) || (word === "大変" ? "na" : "");
    if (!plain) return { kind: "", plain: "", polite: "" };
    return { kind: kind, plain: plain, polite: politeFromPlain(plain) };
  }

  function coreWordTitleHtml(item) {
    const word = (item && item.word) || "";
    const reading = (item && item.reading) || "";
    if (!word) return "";
    if (reading && /[\u4e00-\u9fff]/.test(word)) return furiMarkup(word, reading);
    return word ? "<b>" + escapeHtml(word) + "</b>" : "";
  }

  function coreStaticPill() {
    return (
      '<span class="hw-word-pill">' +
      '<span class="hw-word-play__row">' +
      '<span class="hw-core-chip hw-core-chip--green" data-core-gloss>' +
      wordChipInner(todaysWordItem()) +
      "</span></span>" +
      '<span class="hw-word-pill__note">Try using today\'s word so you\'ll remember it better!</span></span>'
    );
  }

  function coreMarkup() {
    const says = coreSaysFor(todaysWordItem());
    return (
      '<section class="hw-core-page hw-quest">' +
      '<div class="hw-quest__target-box"><p class="hw-quest__target" data-core-word>' +
      coreWordTitleHtml(todaysWordItem()) +
      "</p></div>" +
      coreKindListHtml(says.kind) +
      '<div class="hw-quest__important-wrap">' +
      coreStaticPill() +
      "</div>" +
      '<div class="hw-core-says">' +
      '<p class="hw-say hw-say--plain"><b class="hw-say__label">Plain/Casual</b><span class="hw-say__line" data-say="plain">' +
      escapeHtml(says.plain) +
      "</span></p>" +
      '<p class="hw-say hw-say--polite"><b class="hw-say__label">Polite</b><span class="hw-say__line" data-say="polite">' +
      escapeHtml(says.polite) +
      "</span></p></div>" +
      completeTaskButton("core") +
      "</section>"
    );
  }

  function paintCorePage() {
    const section = document.querySelector("#hw-v5-panel-core .hw-core-page");
    if (!section) return;
    const item = todaysWordItem();
    const says = coreSaysFor(item);
    const gloss = section.querySelector("[data-core-gloss]");
    if (gloss) gloss.innerHTML = wordChipInner(item);
    const title = section.querySelector("[data-core-word]");
    if (title && item.word) title.innerHTML = coreWordTitleHtml(item);
    section.querySelector(".hw-quest__na")?.remove();
    const list = section.querySelector(".hw-core-kind-list");
    if (list) list.outerHTML = coreKindListHtml(says.kind || "");
    const plain = section.querySelector('[data-say="plain"]');
    const polite = section.querySelector('[data-say="polite"]');
    if (plain) plain.textContent = says.plain || "";
    if (polite) polite.textContent = says.polite || "";
  }

  function chaptersMarkup() {
    const nums = CHAPTERS.map((chapter) => {
      return (
        '<button type="button" data-chapter="' +
        chapter.n +
        '">' +
        chapter.n +
        "</button>"
      );
    }).join("");
    return (
      '<section class="hw-chapters">' +
      "<h2>Curriculum Overview</h2>" +
      '<p class="hw-ch-note">Click a number. Only that chapter is shown.</p>' +
      '<div class="hw-ch-nums">' +
      nums +
      '</div><div data-chapter-body></div></section>'
    );
  }

  function mountPanel(id, tabId, html, bind) {
    const below = document.getElementById("hw-v5-below");
    if (!below || document.getElementById(id)) return document.querySelector("#" + id + " > *");
    const host = document.createElement("div");
    host.innerHTML = html;
    const section = host.firstElementChild;
    if (bind) bind(section);
    below.appendChild(wrapBelowPanel(id, tabId, "hw-v5-tab-" + tabId, section));
    return section;
  }

  function mountCoreStrips() {
    /* Situation tab used to show the Core Japanese intro above the card. That text stays off this tab. */
  }

  /* Temporary extra words. Not saved. A refresh, or the next 5:00 a.m. local day, clears it. */
  let wordPlay = null;
  let wordPlayBusy = false;

  function coreWordParts(card) {
    const raw = String((card && card.jp) || "").trim();
    const matched = raw.match(/^([^（(]+)[（(]([^）)]+)[）)]/);
    let word = raw;
    let reading = "";
    if (matched) {
      word = matched[1].trim();
      reading = matched[2].trim();
    } else {
      word = raw.split(/\s+/)[0] || raw;
    }
    let en = String((card && card.en) || "").trim();
    const short = en.split(" · ")[0].trim();
    if (short) en = short;
    return { jp: raw || word, word: word, reading: reading, en: en };
  }

  function todaysWordItem() {
    const card = todaysCoreCard();
    if (!card) return { jp: "", word: "", reading: "", en: "" };
    const parts = coreWordParts(card);
    if (parts.word === "大変" && !parts.reading) parts.reading = "たいへん";
    if (parts.word === "大変" && !parts.en) parts.en = "Hard, tough, rough, (emotionally)";
    return parts;
  }

  function wordChipInner(item) {
    const word = item.word || "";
    const reading = item.reading || "";
    const label = word ? furiMarkup(word, reading) : "";
    return label + (item.en ? " <span>" + escapeHtml(item.en) + "</span>" : "");
  }

  function wordPlayShell(chipInnerHtml) {
    return (
      '<span class="hw-word-pill" data-word-play>' +
      '<span class="hw-word-play__row">' +
      '<button type="button" class="hw-word-play__arrow" data-word-dir="-1" hidden aria-label="Previous word">←</button>' +
      '<span class="hw-core-chip hw-core-chip--green" data-word-chip role="button" tabindex="0">' +
      chipInnerHtml +
      "</span>" +
      '<button type="button" class="hw-word-play__arrow" data-word-dir="1" hidden aria-label="Next word">→</button>' +
      "</span>" +
      '<span class="hw-word-pill__note">Try using today\'s word so you\'ll remember it better!</span>' +
      '<span class="hw-word-pill__more">Click the green button for more words!</span></span>'
    );
  }

  function ensureWordPlay() {
    const day = localDayKey();
    const item = todaysWordItem();
    const pin = item.jp || item.word || "";
    if (!wordPlay || wordPlay.day !== day) {
      wordPlay = { day: day, pin: pin, items: [item], index: 0 };
      return wordPlay;
    }
    if (pin && wordPlay.pin !== pin && wordPlay.items.length <= 1 && wordPlay.index === 0) {
      wordPlay.pin = pin;
      wordPlay.items = [item];
    }
    return wordPlay;
  }

  function paintTodayWordRow() {
    const item = todaysWordItem();
    if (!item.word) return;
    const row = document.querySelector('#hw-v5-panel-today [data-task="core"]');
    if (!row) return;
    const btn = row.querySelector(".hw-today__go");
    if (btn) btn.innerHTML = "Word of the Day: " + kanjiRuby(item.word, item.reading);
    const box = row.querySelector("input");
    if (box) box.setAttribute("aria-label", "Done: Word of the Day: " + item.word);
  }

  function paintWordPlay() {
    const play = ensureWordPlay();
    const item = play.items[play.index] || play.items[0];
    const many = play.items.length > 1;
    document.querySelectorAll("[data-word-chip]").forEach((chip) => {
      chip.innerHTML = wordChipInner(item);
    });
    document.querySelectorAll("[data-word-play]").forEach((host) => {
      host.querySelectorAll("[data-word-dir]").forEach((btn) => {
        const dir = Number(btn.getAttribute("data-word-dir"));
        const atEnd = dir < 0 ? play.index <= 0 : play.index >= play.items.length - 1;
        btn.hidden = !many;
        btn.disabled = !many || atEnd;
      });
    });
    paintTodayWordRow();
  }

  function shiftWordPlay(dir) {
    const play = ensureWordPlay();
    const next = play.index + dir;
    if (next < 0 || next >= play.items.length) return;
    play.index = next;
    paintWordPlay();
  }

  function addRandomWord() {
    if (wordPlayBusy) return;
    wordPlayBusy = true;
    loadCoreCards()
      .then(() => {
        const play = ensureWordPlay();
        if (play.items.length === 1) play.items[0] = todaysWordItem();
        const used = new Set(play.items.map((item) => item.jp));
        const pool = coreCards.filter((card) => card && card.jp && !used.has(String(card.jp)));
        if (!pool.length) return;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        play.items.push(coreWordParts(pick));
        play.index = play.items.length - 1;
        paintWordPlay();
      })
      .finally(() => {
        wordPlayBusy = false;
      });
  }

  function bindWordPills() {
    if (document.body.dataset.wordPill === "1") return;
    document.body.dataset.wordPill = "1";
    let wordChipPress = null;
    document.addEventListener(
      "pointerdown",
      (ev) => {
        const chip = ev.target.closest?.("[data-word-chip]");
        if (!chip || chip.closest(".hw-core-page")) {
          wordChipPress = null;
          return;
        }
        wordChipPress = { id: ev.pointerId, t: Date.now(), x: ev.clientX, y: ev.clientY, skip: false };
      },
      true
    );
    document.addEventListener(
      "pointerup",
      (ev) => {
        if (!wordChipPress || wordChipPress.id !== ev.pointerId) return;
        const held = Date.now() - wordChipPress.t;
        const dist = Math.hypot(ev.clientX - wordChipPress.x, ev.clientY - wordChipPress.y);
        wordChipPress.skip = held >= 420 || dist > 10;
      },
      true
    );
    document.addEventListener("click", (ev) => {
      const arrow = ev.target.closest("[data-word-dir]");
      if (arrow) {
        ev.preventDefault();
        ev.stopPropagation();
        if (arrow.disabled) return;
        shiftWordPlay(Number(arrow.getAttribute("data-word-dir")));
        return;
      }
      const chip = ev.target.closest("[data-word-chip]");
      if (chip) {
        ev.preventDefault();
        ev.stopPropagation();
        const press = wordChipPress;
        wordChipPress = null;
        if (chip.closest(".hw-core-page")) return;
        if (press?.skip) return;
        if (ev.target.closest(".hw-mg-armed, .hw-hc-armed")) return;
        if (document.querySelector(".hw-mg-armed, .hw-hc-armed")) return;
        const sel = document.getSelection?.();
        if (sel && !sel.isCollapsed && String(sel).trim()) return;
        addRandomWord();
        return;
      }
      if (ev.target.closest(".hw-word-pill__more")) return;
      const pill = ev.target.closest(".hw-word-pill");
      document.querySelectorAll(".hw-word-pill.is-open").forEach((el) => {
        if (el !== pill) el.classList.remove("is-open");
      });
      if (!pill) return;
      pill.classList.toggle("is-open");
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const chip = ev.target.closest("[data-word-chip]");
      if (!chip || chip.closest(".hw-core-page")) return;
      ev.preventDefault();
      addRandomWord();
    });
    loadCoreCards().then(() => {
      paintWordPlay();
      paintCorePage();
    });
    loadCoreSays().then(() => paintCorePage());
  }

  function ensureCurriculumHome() {
    bindWordPills();
    const below = document.getElementById("hw-v5-below");
    if (!usesCurriculumHub() || !below) return;
    let todayPanel = document.getElementById("hw-v5-panel-today");
    if (todayPanel && (todayPanel.getAttribute("data-rev") !== "cafe5" || todayPanel.getAttribute("data-day") !== localDayKey())) {
      todayPanel.remove();
      todayPanel = null;
    }
    if (!todayPanel) {
      mountPanel("hw-v5-panel-today", "today", curriculumTodayMarkup(), bindCurriculumToday);
      const todayEl = document.getElementById("hw-v5-panel-today");
      todayEl?.setAttribute("data-rev", "cafe5");
      todayEl?.setAttribute("data-day", localDayKey());
    }
    let prayerPanel = document.getElementById("hw-v5-panel-prayer");
    if (!seesPrayerTab()) {
      prayerPanel?.remove();
    } else {
      if (prayerPanel && (prayerPanel.getAttribute("data-rev") !== "pray17" || prayerPanel.getAttribute("data-day") !== localDayKey())) {
        prayerPanel.remove();
        prayerPanel = null;
      }
      if (!prayerPanel) {
        mountPanel("hw-v5-panel-prayer", "prayer", prayerMarkup(), bindPrayer);
        const prayerEl = document.getElementById("hw-v5-panel-prayer");
        prayerEl?.setAttribute("data-rev", "pray17");
        prayerEl?.setAttribute("data-day", localDayKey());
      }
    }
    let corePanel = document.getElementById("hw-v5-panel-core");
    if (corePanel && (corePanel.getAttribute("data-rev") !== "core8" || corePanel.getAttribute("data-day") !== localDayKey())) {
      corePanel.remove();
      corePanel = null;
    }
    if (!corePanel) {
      mountPanel("hw-v5-panel-core", "core", coreMarkup());
      const coreEl = document.getElementById("hw-v5-panel-core");
      coreEl?.setAttribute("data-rev", "core8");
      coreEl?.setAttribute("data-day", localDayKey());
      loadCoreSays().then(() => paintCorePage());
    }
    if (!document.getElementById("hw-v5-panel-week")) {
      const section = document.createElement("section");
      section.id = "hw-curriculum-week";
      below.appendChild(wrapBelowPanel("hw-v5-panel-week", "week", "hw-v5-tab-week", section));
    }
    let chapters = document.getElementById("hw-v5-panel-chapters");
    if (!seesChaptersTab()) {
      chapters?.remove();
    } else if (!chapters) {
      const section = mountPanel("hw-v5-panel-chapters", "chapters", chaptersMarkup(), (root) => {
        root.addEventListener("click", (ev) => {
          const btn = ev.target.closest("[data-chapter]");
          if (!btn || !root.contains(btn)) return;
          writeStorage(curriculumUserKey("jlm-hw-curriculum-chapter"), btn.getAttribute("data-chapter") || "0");
          paintCurriculumChapter(root);
        });
      });
      paintCurriculumChapter(section);
    }
    paintWordPlay();
  }

  const SITUATION_CARDS = [
    ["sit-1-fever.png", "熱", "あなたは今起きました。頭を触ってみるとやっぱりあつい。まず、どうしますか？", "Fever", "You just woke up. You touch your forehead — yeah, you’re hot. What do you do first?"],
    ["sit-2-doctor.png", "病院", "熱が40度を越えてしまいました。どうしますか？", "Doctor", "Your fever went over 40°C. What do you do?"],
    ["sit-3-seat.png", "席", "あなたの席がこの人に取られました。言ってやってください！", "Seat", "Someone took your seat! Say something!"],
    ["sit-4-konbini.png", "コンビニ", "お弁当を温めようとしたら、財布を家に忘れたことに気づきました。店員さんの岩崎さんに何と言いますか？", "Konbini", "You were about to heat your bento and realized you left your wallet at home. What do you say to Iwazaki-san?"],
    ["sit-5-train.png", "電車", "友達のりかちゃんとの大事な約束に間に合いません。次の電車まで８分。友達に何を伝えますか？", "Train", "You’ll miss an important meetup with Rika-chan. Next train is in 8 minutes. What do you tell her?"],
    ["sit-6-restaurant.png", "アレルギー", "色々な食べ物のアレルギーがあります。注文の前に、店員さんにちゃんと伝えてください。", "Allergy", "You have several food allergies. Tell the staff clearly before ordering."],
    ["sit-7-noise.png", "騒音", "夜中なのに隣がうるさいです。明日仕事があります。どうしますか？言ってみてください。", "Noise", "It’s the middle of the night and the neighbors are loud. You have work tomorrow. What do you do / say?"],
    ["sit-11-cafe.png", "カフェ", "頼んだものと違う飲み物が来ました。怒らずに、でもはっきり言ってください。", "Cafe", "The wrong drink arrived. Correct the order without sounding angry."],
    ["sit-h1-birthday.png", "誕生日", "今日は友達のセラの誕生日です。大事なプレゼントを考えて買ったんだけど、渡す前に何と言いますか？", "Birthday", "It’s your friend Sera’s birthday. You bought a thoughtful gift — what do you say before handing it over?"],
      ["sit-h3-thanks.png", "お礼", "店員さんの大和さんがドライヤーを買うのにとても親切でした。お礼を言ってください。", "Thanks", "Yamato-san at the store was really kind while you bought a hair dryer. Say thanks."],
    ["sit-h4-reunion.png", "再会", "久しぶりに会えた友達の家族とばったり会いました。最初に何と言いますか？", "Reunion", "You bump into a friend’s family you haven’t seen in a long time. What do you say first?"],
    ["sit-12-first-meet.png", "初対面", "初めて会う人です。自己紹介をしてください。", "First meeting", "You’re meeting someone for the first time. Introduce yourself."],
    ["sit-13-keychain.png", "落とし物", "向こうの人がキーホルダーを落としました。本人は気づかずに、とても急いで歩いて行きます。どうしますか？", "Dropped keys", "You just saw someone drop their keychain. They didn’t notice and they’re walking away very quickly. What do you do?"],
    ["sit-14-rain-child.png", "雨・子供", "雨が降っています。コンビニの前に、傘を持っていない悲しそうな子どもがいます。どうしますか？", "Rain · child", "It’s raining. You see a sad child by a konbini without an umbrella. What do you do?"],
    ["sit-15-rain-station.png", "雨・駅", "駅へ向かって歩いているけど、急に雨が降り始めました。家に傘があるけど、戻るのはめんどくさいです。どうしますか？", "Rain · station", "It’s raining, but you already started walking to the train station. You don’t feel like going back inside for your umbrella. What do you do?"],
    ["sit-16-priority-seat.png", "優先座席", "優先座席に、スマホを見ている若い人が座っています。妊婦さんが立っています。席をゆずってもらうように、その人に言ってください。", "Priority seat", "A young man is on his phone in the priority seats. A pregnant woman is standing. Ask him to give her his seat."],
    ["sit-17-lost-keys.png", "鍵", "鍵が見つかりません。自分に何と言いますか？", "Keys", "You can't find your keys. What do you say to yourself?"],
  ];

  function sitRubyHtml(marked) {
    const raw = String(marked || "");
    return escapeHtml(raw).replace(
      /([\u4E00-\u9FFF]+)\{([^{}]+)\}/g,
      "<ruby>$1<rt>$2</rt></ruby>"
    );
  }

  function sitReadingHtml(title, text) {
    const markedTitle = SIT_RUBY[title] ? SIT_RUBY[title].title : title;
    const markedText = SIT_RUBY[title] ? SIT_RUBY[title].text : text;
    return (
      '<span class="hw-sit-flip__title" lang="ja">' + sitRubyHtml(markedTitle) + "</span>" +
      '<span class="hw-sit-flip__text" lang="ja">' + sitMark(markedText) + "</span>"
    );
  }

  function sitMark(marked) {
    const raw = String(marked || "");
    const plain = escapeHtml(raw.replace(/\{[^{}]+\}/g, ""));
    const ruby = escapeHtml(raw).replace(
      /([\u4E00-\u9FFF]+)\{([^{}]+)\}/g,
      "<ruby>$1<rt>$2</rt></ruby>"
    );
    return '<span class="hw-sit-plain">' + plain + '</span><span class="hw-sit-ruby">' + ruby + "</span>";
  }

  const SIT_RUBY = {
    "熱": { title: "熱{ねつ}", text: "あなたは今{いま}起{お}きました。頭{あたま}を触{さわ}ってみるとやっぱりあつい。まず、どうしますか？" },
    "病院": { title: "病院{びょういん}", text: "熱{ねつ}が40度{ど}を越{こ}えてしまいました。どうしますか？" },
    "席": { title: "席{せき}", text: "あなたの席{せき}がこの人{ひと}に取{と}られました。言{い}ってやってください！" },
    "コンビニ": { title: "コンビニ", text: "お弁当{べんとう}を温{あたた}めようとしたら、財布{さいふ}を家{いえ}に忘{わす}れたことに気{き}づきました。店員{てんいん}さんの岩崎{いわさき}さんに何{なに}と言{い}いますか？" },
    "電車": { title: "電車{でんしゃ}", text: "友達{ともだち}のりかちゃんとの大事{だいじ}な約束{やくそく}に間{ま}に合{あ}いません。次{つぎ}の電車{でんしゃ}まで８分{ぷん}。友達{ともだち}に何{なに}を伝{つた}えますか？" },
    "アレルギー": { title: "アレルギー", text: "色々{いろいろ}な食{た}べ物{もの}のアレルギーがあります。注文{ちゅうもん}の前{まえ}に、店員{てんいん}さんにちゃんと伝{つた}えてください。" },
    "騒音": { title: "騒音{そうおん}", text: "夜中{よなか}なのに隣{となり}がうるさいです。明日{あした}仕事{しごと}があります。どうしますか？言{い}ってみてください。" },
    "カフェ": { title: "カフェ", text: "頼{たの}んだものと違{ちが}う飲{の}み物{もの}が来{き}ました。怒{おこ}らずに、でもはっきり言{い}ってください。" },
    "誕生日": { title: "誕生日{たんじょうび}", text: "今日{きょう}は友達{ともだち}のセラの誕生日{たんじょうび}です。大事{だいじ}なプレゼントを考{かんが}えて買{か}ったんだけど、渡{わた}す前{まえ}に何{なに}と言{い}いますか？" },
    "お礼": { title: "お礼{れい}", text: "店員{てんいん}さんの大和{やまと}さんがドライヤーを買{か}うのにとても親切{しんせつ}でした。お礼{れい}を言{い}ってください。" },
    "再会": { title: "再会{さいかい}", text: "久{ひさ}しぶりに会{あ}えた友達{ともだち}の家族{かぞく}とばったり会{あ}いました。最初{さいしょ}に何{なに}と言{い}いますか？" },
    "初対面": { title: "初対面{しょたいめん}", text: "初{はじ}めて会{あ}う人{ひと}です。自己紹介{じこしょうかい}をしてください。" },
    "落とし物": { title: "落{お}とし物{もの}", text: "向{む}こうの人{ひと}がキーホルダーを落{お}としました。本人{ほんにん}は気{き}づかずに、とても急{いそ}いで歩{ある}いて行{い}きます。どうしますか？" },
    "雨・子供": { title: "雨{あめ}・子供{こども}", text: "雨{あめ}が降{ふ}っています。コンビニの前{まえ}に、傘{かさ}を持{も}っていない悲{かな}しそうな子{こ}どもがいます。どうしますか？" },
    "雨・駅": { title: "雨{あめ}・駅{えき}", text: "駅{えき}へ向{む}かって歩{ある}いているけど、急{きゅう}に雨{あめ}が降{ふ}り始{はじ}めました。家{いえ}に傘{かさ}があるけど、戻{もど}るのはめんどくさいです。どうしますか？" },
    "優先座席": { title: "優先座席{ゆうせんざせき}", text: "優先座席{ゆうせんざせき}に、スマホを見{み}ている若{わか}い人{ひと}が座{すわ}っています。妊婦{にんぷ}さんが立{た}っています。席{せき}をゆずってもらうように、その人{ひと}に言{い}ってください。" },
    "鍵": { title: "鍵{かぎ}", text: "鍵{かぎ}が見つかりません。自分{じぶん}に何{なに}と言{い}いますか？" },
  };

  function situationFuriButton() {
    return '<p class="hw-sit-furi"><button type="button" class="btn btn--ghost btn--sm" data-sit-furi aria-pressed="false">Show furigana</button></p>';
  }

  function situationCardHtml(card) {
    const image = "/homework/media/situation-cards-1/" + card[0];
    return (
      '<div class="hw-sit-flip" role="button" tabindex="0" aria-pressed="false">' +
      '<span class="hw-sit-flip__inner">' +
      '<span class="hw-sit-flip__face hw-sit-flip__face--jp">' +
      '<img src="' + escapeHtml(image) + '" alt="">' +
      sitReadingHtml(card[1], card[2]) +
      "</span>" +
      '<span class="hw-sit-flip__face hw-sit-flip__face--en">' +
      '<img src="' + escapeHtml(image) + '" alt="">' +
      '<span class="hw-sit-flip__title">' + escapeHtml(card[3]) + "</span>" +
      '<span class="hw-sit-flip__text">' + escapeHtml(card[4]) + "</span>" +
      "</span></span></div>"
    );
  }

  function dailySituationIndex() {
    const day = localDayOfYear();
    return ((day % SITUATION_CARDS.length) + SITUATION_CARDS.length) % SITUATION_CARDS.length;
  }

  function bindFlip(section) {
    if (!section || section.dataset.flipBound === "1") return;
    section.dataset.flipBound = "1";
    section.addEventListener("click", (ev) => {
      const furi = ev.target.closest("[data-sit-furi]");
      if (furi && section.contains(furi)) {
        const on = section.classList.toggle("is-furi");
        furi.textContent = on ? "Hide furigana" : "Show furigana";
        furi.setAttribute("aria-pressed", on ? "true" : "false");
        return;
      }
      const go = ev.target.closest("[data-go]");
      if (go && section.contains(go)) {
        openCurriculumPlace(go.getAttribute("data-go") || "today", "");
        return;
      }
      const card = ev.target.closest(".hw-sit-flip");
      if (!card || !section.contains(card)) return;
      if (
        document.querySelector(".hw-hc-armed") &&
        ev.target.closest(".hw-sit-flip__face--jp")
      ) {
        return;
      }
      const on = card.classList.toggle("is-flipped");
      card.setAttribute("aria-pressed", on ? "true" : "false");
    });
    section.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const card = ev.target.closest(".hw-sit-flip");
      if (!card || !section.contains(card)) return;
      ev.preventDefault();
      card.click();
    });
  }

  function situationCardsMarkup() {
    const card = SITUATION_CARDS[dailySituationIndex()];
    const markedTitle = SIT_RUBY[card[1]] ? SIT_RUBY[card[1]].title : card[1];
    return (
      '<section class="hw-sit-cards hw-sit-cards--one">' +
      /* The title sits in the same green box as the Quest / Daily Exercise prompt (always with furigana). */
      '<div class="hw-quest__target-box hw-sit-titlebox">' +
      '<p class="hw-quest__target hw-quest__target--ask" lang="ja">' + sitRubyHtml(markedTitle) + "</p>" +
      "</div>" +
      '<p class="hw-sit-flip-hint">Click card for English</p>' +
      situationCardHtml(card) +
      '<form class="hw-sit-rec" onsubmit="return false;">' +
      '<p class="hw-sit-rec__label">Say it out loud</p>' +
      '<div class="hw-sit-rec__mount" data-sit-rec></div></form>' +
      completeTaskButton("card") +
      "</section>"
    );
  }

  /** One audio recorder under the card; the take is kept for today's card. */
  function mountSitRecorder(section) {
    const mountEl = section && section.querySelector("[data-sit-rec]");
    if (!mountEl || mountEl.dataset.bound === "true" || !global.HwAudioInline?.mount) return;
    const session = getActiveSession();
    const user = String(session?.username || "").trim().toLowerCase();
    const dayKey = localDayKey();
    const storeKey = "jlm-sit-audio:" + user + ":" + dayKey;
    try {
      const saved = localStorage.getItem(storeKey) || "";
      if (saved) mountEl.dataset.mediaId = saved;
    } catch (_) {
      /* ignore */
    }
    global.HwAudioInline.mount(mountEl, {
      username: user,
      displayName: session?.displayName || user,
      assignmentId: "situation-cards",
      lessonName: "Situation Card",
      promptId: "sit-" + dayKey,
      promptLabel: "Situation card",
      startLabel: "Record",
      mic: true,
    });
    mountEl.closest("form")?.addEventListener("hw-worksheet-answer", () => {
      try {
        const id = mountEl.dataset.mediaId || "";
        if (id) localStorage.setItem(storeKey, id);
        else localStorage.removeItem(storeKey);
      } catch (_) {
        /* ignore */
      }
    });
  }

  /** "See all cards" + "Show furigana" sit under the blue box, like Submit under Daily Exercise. */
  function ensureSitActions(panel) {
    let el = document.getElementById("hw-sit-actions");
    if (!panel) {
      el?.remove();
      return;
    }
    if (el && el.getAttribute("data-rev") !== "sit-act2") {
      el.remove();
      el = null;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "hw-sit-actions";
      el.className = "hw-ex-actions hw-sit-actions";
      el.setAttribute("data-rev", "sit-act2");
      el.innerHTML =
        '<button type="button" class="btn btn--primary hw-ex-actions__btn" data-sit-done>Submit</button>' +
        '<button type="button" class="btn btn--ghost hw-ex-actions__btn" data-sit-past>Past submissions</button>' +
        '<button type="button" class="btn btn--ghost hw-ex-actions__btn" data-go="allcards">See all cards</button>' +
        '<button type="button" class="btn btn--ghost hw-ex-actions__btn" data-sit-furi aria-pressed="false">Show furigana</button>' +
        '<p class="hw-quest__save-msg" data-sit-note role="status"></p>';
      el.addEventListener("click", (ev) => {
        if (ev.target.closest("[data-sit-done]")) {
          void submitSitCard(ev.target.closest("[data-sit-done]"));
          return;
        }
        if (ev.target.closest("[data-sit-past]")) {
          void toggleSitPast();
          return;
        }
        const furi = ev.target.closest("[data-sit-furi]");
        if (furi) {
          const sec = document.querySelector("#hw-v5-panel-situations .hw-sit-cards");
          if (!sec) return;
          const on = sec.classList.toggle("is-furi");
          furi.textContent = on ? "Hide furigana" : "Show furigana";
          furi.setAttribute("aria-pressed", on ? "true" : "false");
          return;
        }
        const go = ev.target.closest("[data-go]");
        if (go) openCurriculumPlace(go.getAttribute("data-go") || "today", "");
      });
    }
    if (el.previousElementSibling !== panel) panel.insertAdjacentElement("afterend", el);
  }

  function formatSitWhen(row) {
    const date = String(row?.date || "");
    const parts = date.split("-").map(Number);
    let label = date;
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      label = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
    }
    const title = String(row?.cardTitle || "").trim();
    return title ? label + " · " + title : label;
  }

  function paintSitPastList(rows) {
    const list = document.getElementById("hw-sit-past-modal-list");
    const meta = document.getElementById("hw-sit-past-modal-meta");
    const intro = document.getElementById("hw-sit-past-modal-intro");
    const detail = document.getElementById("hw-sit-past-modal-detail");
    if (!list) return;
    if (detail) {
      detail.hidden = true;
      detail.replaceChildren();
    }
    if (intro) intro.hidden = false;
    list.hidden = false;
    if (meta) {
      meta.hidden = false;
      meta.textContent = rows.length
        ? rows.length + (rows.length === 1 ? " day" : " days")
        : "No submissions yet.";
    }
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.className = "hw-hub-v2-past-list__item hw-hub-v2-past-list__item--empty";
      empty.textContent = "Nothing sent yet.";
      list.appendChild(empty);
      return;
    }
    rows.forEach((row) => {
      const li = document.createElement("li");
      li.className = "hw-hub-v2-past-list__item";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v2-past-list__btn";
      btn.innerHTML = "<span>" + escapeHtml(formatSitWhen(row)) + "</span><time>1 recording</time>";
      btn.addEventListener("click", () => showSitPastDetail(row));
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function showSitPastDetail(row) {
    const list = document.getElementById("hw-sit-past-modal-list");
    const meta = document.getElementById("hw-sit-past-modal-meta");
    const intro = document.getElementById("hw-sit-past-modal-intro");
    const detail = document.getElementById("hw-sit-past-modal-detail");
    if (!detail) return;
    detail.replaceChildren();
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn btn--ghost btn--sm";
    back.textContent = "All days";
    back.addEventListener("click", () => {
      detail.hidden = true;
      if (list) list.hidden = false;
      if (meta) meta.hidden = false;
      if (intro) intro.hidden = false;
    });
    const heading = document.createElement("p");
    heading.className = "hw-past-assignments-modal__intro";
    heading.textContent = formatSitWhen(row);
    const wrap = document.createElement("div");
    const id = String(row?.audioId || "").trim();
    if (id && /^[A-Za-z0-9_-]{1,80}$/.test(id)) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.className = "hw-ex-clip";
      audio.src = "/api/hw-m/" + encodeURIComponent(id);
      wrap.appendChild(audio);
    } else {
      wrap.textContent = "No recording on this one.";
    }
    detail.append(back, heading, wrap);
    detail.hidden = false;
    if (list) list.hidden = true;
    if (meta) meta.hidden = true;
    if (intro) intro.hidden = true;
  }

  function closeSitPast() {
    const modal = document.getElementById("hw-sit-past-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("is-modal-open");
  }

  function bindSitPastModal() {
    const modal = document.getElementById("hw-sit-past-modal");
    if (!modal || modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";
    modal.querySelectorAll("[data-hw-sit-past-close]").forEach((el) => {
      el.addEventListener("click", closeSitPast);
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape" || modal.hidden) return;
      ev.preventDefault();
      closeSitPast();
    });
  }

  async function loadSitPast() {
    const meta = document.getElementById("hw-sit-past-modal-meta");
    const session = getActiveSession();
    const user = String(session?.username || "").trim().toLowerCase();
    if (!user) {
      paintSitPastList([]);
      if (meta) meta.textContent = "Log in to see past submissions.";
      return;
    }
    if (meta) meta.textContent = "Loading…";
    try {
      const res = await fetch("/api/sit-card?username=" + encodeURIComponent(user));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load submissions.");
      paintSitPastList(Array.isArray(data.submissions) ? data.submissions : []);
    } catch (err) {
      paintSitPastList([]);
      if (meta) meta.textContent = err && err.message ? err.message : "Could not load submissions.";
    }
  }

  async function toggleSitPast() {
    bindSitPastModal();
    const modal = document.getElementById("hw-sit-past-modal");
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("is-modal-open");
    await loadSitPast();
  }

  async function submitSitCard(btn) {
    const note = document.querySelector("#hw-sit-actions [data-sit-note]");
    const mountEl = document.querySelector("[data-sit-rec]");
    const audioId = String(mountEl?.dataset.mediaId || "").trim();
    if (note) {
      note.classList.remove("is-error");
      note.textContent = "";
    }
    if (!audioId) {
      if (note) {
        note.classList.add("is-error");
        note.textContent = "Record first.";
      }
      return;
    }
    const session = getActiveSession();
    const user = String(session?.username || "").trim().toLowerCase();
    if (!user) {
      if (note) {
        note.classList.add("is-error");
        note.textContent = "Log in, then submit again.";
      }
      return;
    }
    if (btn?.disabled) return;
    if (btn) btn.disabled = true;
    if (note) note.textContent = "Saving…";
    const card = SITUATION_CARDS[dailySituationIndex()] || [];
    try {
      const res = await fetch("/api/sit-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user,
          displayName: session.displayName || user,
          cardTitle: card[1] || card[3] || "Situation Card",
          audioId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save that recording.");
      if (note) note.textContent = "";
      completeTodayTask("card", { stay: true, toast: "Situation Card submitted" });
    } catch (err) {
      if (note) {
        note.classList.add("is-error");
        note.textContent = err && err.message ? err.message : "Could not save that recording.";
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function consumeStudentGo() {
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const tab = String(params.get("tab") || "").trim();
    const memo = String(params.get("memo") || "").trim();
    const sitpast = params.get("sitpast") === "1";
    if (tab) setActiveTab(tab, { scrollTop: true });
    if (sitpast) {
      window.setTimeout(() => {
        void toggleSitPast();
      }, 400);
    }
    if (!memo) return;
    let tries = 0;
    const tick = () => {
      if (global.HwHomeworkComments?.focusComment?.(memo)) return;
      if (tries++ > 20) return;
      window.setTimeout(tick, 200);
    };
    window.setTimeout(tick, 500);
  }

  function situationAllMarkup() {
    return (
      '<section class="hw-sit-cards">' +
      "<h2>All situation cards</h2>" +
      situationFuriButton() +
      '<p class="hw-sit-cards__lede">Japanese side first. Click a card to flip it to English.</p>' +
      '<p class="hw-today__overview"><button type="button" class="hw-today__go" data-go="situations">Back to today</button></p>' +
      '<div class="hw-sit-cards__grid">' +
      SITUATION_CARDS.map(situationCardHtml).join("") +
      "</div></section>"
    );
  }

  function ensureSituationsPanel() {
    document.body.classList.toggle("hw-curriculum-hub", usesCurriculumHub());
    document.body.classList.toggle("hw-demo1-standard", isDemo1StandardPreview());
    const below = document.getElementById("hw-v5-below");
    if (!seesSituationCards()) {
      document.getElementById("hw-v5-panel-situations")?.remove();
      document.getElementById("hw-v5-panel-allcards")?.remove();
      document.getElementById("hw-sit-actions")?.remove();
      return;
    }
    if (!below) return;
    const stale = document.getElementById("hw-v5-panel-situations");
    if (stale && (stale.getAttribute("data-rev") !== "sit13" || stale.getAttribute("data-day") !== localDayKey())) stale.remove();
    if (!document.getElementById("hw-v5-panel-situations")) {
      const host = document.createElement("div");
      host.innerHTML = situationCardsMarkup();
      const section = host.firstElementChild;
      bindFlip(section);
      const panel = wrapBelowPanel(
        "hw-v5-panel-situations",
        "situations",
        "hw-v5-tab-situations",
        section
      );
      panel.setAttribute("data-rev", "sit13");
      panel.setAttribute("data-day", localDayKey());
      below.appendChild(panel);
      mountSitRecorder(section);
      paintWordPlay();
    }
    ensureSitActions(document.getElementById("hw-v5-panel-situations"));
    const allcards = document.getElementById("hw-v5-panel-allcards");
    if (allcards && allcards.getAttribute("data-rev") !== "sit11") allcards.remove();
    if (!document.getElementById("hw-v5-panel-allcards")) {
      const host = document.createElement("div");
      host.innerHTML = situationAllMarkup();
      const section = host.firstElementChild;
      bindFlip(section);
      const panel = wrapBelowPanel("hw-v5-panel-allcards", "allcards", "hw-v5-tab-allcards", section);
      panel.setAttribute("data-rev", "sit11");
      below.appendChild(panel);
    }
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
      let el = document.getElementById(id);
      if (el && el.tagName !== "BUTTON") {
        el.remove();
        el = null;
      }
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.id = id;
      }
      el.className = "hw-hub-v5-lesson-tabs__btn" + (extraClass ? " " + extraClass : "");
      el.classList.remove("btn", "btn--primary", "btn--ghost", "btn--full", "btn--sm");
      el.removeAttribute("role");
      el.removeAttribute("aria-selected");
      el.removeAttribute("aria-controls");
      el.removeAttribute("data-lesson-pane");
      el.removeAttribute("href");
      el.removeAttribute("target");
      el.textContent = label;
      return el;
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
    if (lessonsTab) {
      const name = lessonsTab.querySelector(".hw-hub-v5-tabs__label");
      if (name) name.textContent = "Lessons";
      else lessonsTab.textContent = "Lessons";
    }

    return tabs;
  }

  function ensureLessonsStack(gridStack, mistakesCard) {
    /* Mistakes stay in the code, off the hub, until JD asks for them again. */
    if (mistakesCard) {
      mistakesCard.hidden = true;
      mistakesCard.dataset.hwMistakesOff = "1";
    }
    const existing = document.getElementById("hw-v5-lessons-stack");
    if (existing) {
      ensureLessonLinkPills(existing);
      return existing;
    }

    const stack = document.createElement("div");
    stack.className = "hw-hub-v5-lessons-stack";
    stack.id = "hw-v5-lessons-stack";
    ensureLessonLinkPills(stack);

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
      if (orphanFeedback) {
        orphanFeedback.remove();
      }
      document.getElementById("hw-v5-reviewed-banner")?.remove();

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

      /* Keep Past HW + Feature/Bug pills visible under Homework (grid is hidden in v5). */
      const feedbackWrap = document.getElementById("hw-hub-feedback-pill-wrap");
      if (feedbackWrap) homeworkPanel.appendChild(feedbackWrap);

      app.appendChild(tabsWrap);
      app.appendChild(panels);

      studentOnly.insertBefore(app, studentOnly.firstChild);
      global.HwHubQuests?.ensurePanel?.();
      global.HwHubWorkouts?.ensurePanel?.();
      if (isQuestOnlyAccount()) {
        app.dataset.v5ActiveTab = "quest";
      }

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
      ensurePhoneHomeButton();
      ensureTutorialButton();
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
      const u = String(getActiveSession()?.username || "")
        .trim()
        .toLowerCase();
      pastBtn.textContent =
        u === "demoprem" || u === "premdemo"
          ? "Browse all worksheets"
          : "Past submissions";
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

  function applyMarkedNoteHtml(el, text) {
    const raw = String(text || "");
    const toHtml = global.HwHomeworkComments?.markedTextToHtml;
    if (typeof toHtml === "function") {
      el.innerHTML = toHtml(raw) || "";
      return;
    }
    el.textContent = raw;
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
    applyMarkedNoteHtml(text, comment?.text || "(No note text)");
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
      applyMarkedNoteHtml(remark, teacherRemark);
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
    const openReviewedBtn = document.getElementById("hw-v5-open-reviewed-btn");
    const reviewZone = document.getElementById("hw-v5-review-zone");
    /* Reviewed JD sticky note removed — open worksheet via button only. */
    document.getElementById("hw-v5-reviewed-banner")?.remove();
    document.getElementById("hw-v2-feedback")?.remove();

    const show = status === "reviewed" && !isArchiveMode();

    if (reviewZone) reviewZone.hidden = true;
    if (openReviewedBtn) {
      openReviewedBtn.hidden = !show;
      openReviewedBtn.textContent = "Open reviewed worksheet";
    }

    reviewCommentsGen += 1;
    reviewSlides = [];
    reviewSlideIndex = 0;
  }

  function renderNoPlanWelcome(show) {
    const welcome = document.getElementById("hw-v5-noplan-welcome");
    if (welcome) {
      if (show) ensureTrialBlock(welcome);
      welcome.hidden = !show;
    }
    document.body.classList.toggle("hw-hub-v5-noplan-view", show);
  }

  function renderNoHwEmpty(show) {
    const empty = document.getElementById("hw-v5-no-hw-empty");
    if (empty) {
      if (show) ensureTrialBlock(empty);
      empty.hidden = !show;
    }
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
  let notebookBookId = "hw";
  let notebookBookSessionReady = false;
  let notebookBooksEditUnlocked = false;
  let notebookBookDragId = "";
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
    { id: "hw", label: "HW Notes", paper: "lined" },
    { id: "daily", label: "Daily Notebook", paper: "lined" },
    { id: "quest", label: "Quest Notebook", paper: "lined" },
  ];

  function notebookCustomBooksKey() {
    const username = String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
    return username ? "hw-nb-custom-books:" + username : "hw-nb-custom-books";
  }

  function notebookBookOrderKey() {
    const username = String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
    return username ? "hw-nb-book-order:" + username : "hw-nb-book-order";
  }

  function notebookActiveBookSessionKey() {
    const username = String(getActiveSession()?.username || "")
      .trim()
      .toLowerCase();
    return username ? "hw-nb-active-book:" + username : "hw-nb-active-book";
  }

  function loadSessionNotebookBookId() {
    try {
      let id = String(
        sessionStorage.getItem(notebookActiveBookSessionKey()) || ""
      ).trim();
      if (!id) return "hw";
      if (id === "kanji") id = "quest";
      const known = getNotebookBooks().some((b) => b.id === id);
      return known ? id : "hw";
    } catch {
      return "hw";
    }
  }

  function saveSessionNotebookBookId(bookId) {
    const id = String(bookId || "").trim() || "hw";
    try {
      sessionStorage.setItem(notebookActiveBookSessionKey(), id);
    } catch {
      /* ignore */
    }
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

  function loadNotebookBookOrder() {
    try {
      const raw = localStorage.getItem(notebookBookOrderKey());
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return [];
      const ids = list.map((id) => String(id || "").trim()).filter(Boolean);
      /* Migrate older default order that put Daily first. */
      if (
        ids.length === 3 &&
        ids[0] === "daily" &&
        ids[1] === "hw" &&
        (ids[2] === "kanji" || ids[2] === "quest")
      ) {
        return ["hw", "daily", "quest"];
      }
      return ids.map((id) => (id === "kanji" ? "quest" : id));
    } catch {
      return [];
    }
  }

  function saveNotebookBookOrder(ids) {
    try {
      localStorage.setItem(
        notebookBookOrderKey(),
        JSON.stringify(Array.isArray(ids) ? ids : [])
      );
    } catch {
      /* ignore */
    }
  }

  function getNotebookBooks() {
    const custom = loadCustomNotebookBooks();
    const byId = new Map();
    NOTEBOOK_BOOK_DEFAULTS.forEach((book) => byId.set(book.id, book));
    custom.forEach((book) => byId.set(book.id, book));

    const order = loadNotebookBookOrder();
    const out = [];
    const seen = new Set();
    order.forEach((id) => {
      const book = byId.get(id);
      if (!book || seen.has(id)) return;
      out.push(book);
      seen.add(id);
    });
    NOTEBOOK_BOOK_DEFAULTS.concat(custom).forEach((book) => {
      if (seen.has(book.id)) return;
      out.push(book);
      seen.add(book.id);
    });
    return out;
  }

  function isCoreNotebookBook(bookId) {
    const id = String(bookId || "").trim();
    return id === "daily" || id === "hw" || id === "quest";
  }

  function deleteCustomNotebookBook(bookId) {
    const id = String(bookId || "").trim();
    if (!id || isCoreNotebookBook(id)) return;
    const custom = loadCustomNotebookBooks();
    const book = custom.find((b) => b.id === id);
    if (!book) return;
    const ok = window.confirm(
      'Delete notebook "' + book.label + '"? This can’t be undone.'
    );
    if (!ok) return;
    saveCustomNotebookBooks(custom.filter((b) => b.id !== id));
    saveNotebookBookOrder(loadNotebookBookOrder().filter((x) => x !== id));
    if (notebookBookId === id) notebookBookId = "hw";
    ensureNotebookBookTabs(ensureNotebookDiary());
    setNotebookBook(notebookBookId);
  }

  function reorderNotebookBook(fromId, toId) {
    const from = String(fromId || "").trim();
    const to = String(toId || "").trim();
    if (!from || !to || from === to) return;
    const ids = getNotebookBooks().map((b) => b.id);
    const fromIdx = ids.indexOf(from);
    const toIdx = ids.indexOf(to);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = ids.slice();
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    saveNotebookBookOrder(next);
    ensureNotebookBookTabs(ensureNotebookDiary());
  }

  function setNotebookBooksEditUnlocked(unlocked) {
    notebookBooksEditUnlocked = Boolean(unlocked);
    notebookBookDragId = "";
    ensureNotebookBookTabs(ensureNotebookDiary());
  }

  function getActiveNotebookBook() {
    const books = getNotebookBooks();
    return books.find((b) => b.id === notebookBookId) || books[0] || NOTEBOOK_BOOK_DEFAULTS[0];
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

  /** Empty-note placeholder — only when we truly have no student text/answer. */
  function notebookEmptyNotePlaceholder(displayName) {
    const first =
      String(displayName || "Student")
        .trim()
        .split(/\s+/)[0] || "Student";
    return first + " — no answer saved";
  }

  function notebookStudentSideText(row) {
    const answer = String(row?.studentAnswer || "").trim();
    if (answer) return answer;
    const memo = String(row?.studentText || "").trim();
    if (memo) return memo;
    return "";
  }

  function notebookQuestionLabel(row, fallbackIndex) {
    if (typeof row?.slideIndex === "number" && row.slideIndex >= 0) {
      return row.slideIndex + 1 + "\u554f";
    }
    return fallbackIndex + 1 + "\u554f";
  }

  function notebookRowMark(row, pack) {
    if (row?.questionMark === "correct" || row?.questionMark === "wrong") {
      return row.questionMark;
    }
    if (typeof row?.slideIndex !== "number") return "";
    const raw = pack?.questionMarks?.[String(row.slideIndex)];
    return raw === "correct" || raw === "wrong" ? raw : "";
  }

  /** One button per worksheet question — multiple JD notes on the same slide share a 問. */
  function groupNotebookRowsByQuestion(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const groups = [];
    const seen = new Map();
    list.forEach((row, index) => {
      const slide =
        typeof row?.slideIndex === "number" && row.slideIndex >= 0
          ? row.slideIndex
          : null;
      const key = slide != null ? "s" + slide : "r" + index;
      let group = seen.get(key);
      if (!group) {
        group = {
          slideIndex: slide,
          rows: [],
          label: slide != null ? slide + 1 + "\u554f" : index + 1 + "\u554f",
        };
        seen.set(key, group);
        groups.push(group);
      }
      group.rows.push(row);
    });
    groups.sort((a, b) => {
      const as = a.slideIndex == null ? 9999 : a.slideIndex;
      const bs = b.slideIndex == null ? 9999 : b.slideIndex;
      return as - bs;
    });
    groups.forEach((g, i) => {
      if (g.slideIndex == null) g.label = i + 1 + "\u554f";
    });
    return groups;
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

  function stripNotebookMarkTags(text) {
    return String(text || "")
      .replace(/\[\[\/?r\]\]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Skip leftover JD drafts that are just a plain copy of the student’s answer
   * (no red marks, no audio/video).
   */
  function isSubstantiveJdNote(row, studentAnswer) {
    if (notebookRowMedia(row)) return true;
    const jd = String(row?.jdText || "").trim();
    if (!jd) return false;
    if (/\[\[r\]\]/i.test(jd)) return true;
    const plain = stripNotebookMarkTags(jd);
    const ans = stripNotebookMarkTags(
      studentAnswer || notebookStudentSideText(row)
    );
    if (!ans) return true;
    return plain !== ans;
  }

  function appendJdNoteBlock(jdBlock, row) {
    const media = notebookRowMedia(row);
    if (row.jdText) {
      const rightText = document.createElement("p");
      rightText.className = "hw-hub-v5-notebook__text";
      applyMarkedNoteHtml(rightText, row.jdText);
      jdBlock.appendChild(rightText);
    } else if (!media) {
      const rightText = document.createElement("p");
      rightText.className = "hw-hub-v5-notebook__text";
      rightText.textContent = "(No written note)";
      jdBlock.appendChild(rightText);
    }

    if (media) {
      const links = document.createElement("div");
      links.className = "hw-hub-v5-notebook__media-links";
      const mediaBtn = document.createElement("button");
      mediaBtn.type = "button";
      mediaBtn.className = "hw-hub-v5-notebook__media-link";
      mediaBtn.textContent = media.kind === "video" ? "Video" : "Audio";
      mediaBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        openNotebookMediaOverlay(media);
      });
      links.appendChild(mediaBtn);
      jdBlock.appendChild(links);
    }
  }

  /** YOUR ANSWER + JD’S NOTES (red marks) for one worksheet question. */
  function renderNotebookQuestionDetail(pack, group) {
    const rows = Array.isArray(group?.rows) ? group.rows : [];
    const primary = rows[0] || {};
    const el = document.createElement("article");
    el.className = "hw-hub-v5-notebook__row hw-hub-v5-notebook__row--detail";
    el.dataset.commentId = primary.commentId || "";

    const studentName = notebookStudentName(pack);
    let studentSide = "";
    let studentAnchor = "";
    for (const row of rows) {
      if (!studentSide) studentSide = notebookStudentSideText(row);
      if (!studentAnchor) studentAnchor = String(row.studentAnchor || "").trim();
      if (studentSide && studentAnchor) break;
    }
    const mark = notebookRowMark(primary, pack);
    if (mark) {
      el.classList.add("hw-hub-v5-notebook__row--mark-" + mark);
      const badge = document.createElement("span");
      badge.className = "hw-hub-v5-notebook__mark-badge hw-hub-v5-notebook__mark-badge--" + mark;
      badge.setAttribute("aria-label", mark === "correct" ? "Looks good" : "Not quite");
      badge.textContent = mark === "correct" ? "\u2713" : "\u2717";
      el.appendChild(badge);
    }

    const studentBlock = document.createElement("div");
    studentBlock.className =
      "hw-hub-v5-notebook__detail-block hw-hub-v5-notebook__detail-block--student";
    const studentLabel = document.createElement("p");
    studentLabel.className = "hw-hub-v5-notebook__detail-label";
    studentLabel.textContent = "Your answer";
    studentBlock.appendChild(studentLabel);

    if (studentAnchor) {
      const anchor = document.createElement("p");
      anchor.className = "hw-hub-v5-notebook__anchor";
      anchor.textContent = "“" + studentAnchor + "”";
      studentBlock.appendChild(anchor);
    }

    const leftText = document.createElement("p");
    leftText.className = "hw-hub-v5-notebook__text";
    leftText.textContent =
      studentSide || notebookEmptyNotePlaceholder(studentName);
    studentBlock.appendChild(leftText);

    const openStudent = document.createElement("button");
    openStudent.type = "button";
    openStudent.className = "hw-hub-v5-notebook__open";
    openStudent.textContent =
      typeof primary.slideIndex === "number"
        ? "Open HW · Q" + (primary.slideIndex + 1)
        : "Open this homework page";
    openStudent.addEventListener("click", (ev) => {
      ev.preventDefault();
      openNotebookRow(pack, primary);
    });
    studentBlock.appendChild(openStudent);
    el.appendChild(studentBlock);

    const jdRows = rows.filter((row) => isSubstantiveJdNote(row, studentSide));
    jdRows.forEach((row, i) => {
      const jdBlock = document.createElement("div");
      jdBlock.className =
        "hw-hub-v5-notebook__detail-block hw-hub-v5-notebook__detail-block--jd";
      const jdLabel = document.createElement("p");
      jdLabel.className =
        "hw-hub-v5-notebook__detail-label hw-hub-v5-notebook__detail-label--jd";
      jdLabel.textContent =
        jdRows.length > 1 ? "JD’s notes (" + (i + 1) + ")" : "JD’s notes";
      jdBlock.appendChild(jdLabel);
      appendJdNoteBlock(jdBlock, row);
      el.appendChild(jdBlock);
    });

    return el;
  }

  /**
   * Date card (cream) → expands to solid green 1問 2問… → click shows answer + JD notes.
   */
  function renderHwNotesPackPanel(pack, rows) {
    const wrap = document.createElement("div");
    wrap.className = "hw-hub-v5-notebook__pack-panel";

    const groups = groupNotebookRowsByQuestion(rows);
    const when =
      formatNotebookWhen(pack.reviewedAt || pack.savedAt) || "Reviewed homework";
    const lesson = packDisplayTitle(pack);
    const qCount = groups.length;

    const dateBtn = document.createElement("button");
    dateBtn.type = "button";
    dateBtn.className = "hw-hub-v5-notebook__date-btn";
    dateBtn.setAttribute("aria-expanded", "false");

    const nameEl = document.createElement("span");
    nameEl.className = "hw-hub-v5-notebook__date-btn-name";
    nameEl.textContent = notebookStudentName(pack);

    const whenEl = document.createElement("span");
    whenEl.className = "hw-hub-v5-notebook__date-btn-when";
    whenEl.textContent = when;

    const lessonEl = document.createElement("span");
    lessonEl.className = "hw-hub-v5-notebook__date-btn-lesson";
    lessonEl.textContent = lesson || "Homework notes";

    const cue = document.createElement("span");
    cue.className = "hw-hub-v5-notebook__date-btn-cue";
    const cueLabel = document.createElement("span");
    cueLabel.className = "hw-hub-v5-notebook__date-btn-cue-label";
    cueLabel.textContent =
      qCount === 1 ? "1 question" : qCount + " questions";
    const cueChev = document.createElement("span");
    cueChev.className = "hw-hub-v5-notebook__date-btn-chevron";
    cueChev.setAttribute("aria-hidden", "true");
    cueChev.textContent = "\u25B8";
    cue.appendChild(cueLabel);
    cue.appendChild(cueChev);

    dateBtn.appendChild(nameEl);
    dateBtn.appendChild(whenEl);
    dateBtn.appendChild(lessonEl);
    dateBtn.appendChild(cue);

    const body = document.createElement("div");
    body.className = "hw-hub-v5-notebook__pack-body";
    body.hidden = true;

    const bar = document.createElement("div");
    bar.className = "hw-hub-v5-notebook__q-bar";
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Homework questions with notes");

    const detail = document.createElement("div");
    detail.className = "hw-hub-v5-notebook__q-detail";
    detail.hidden = true;

    let packOpen = false;
    let activeIdx = -1;

    function paintDetail(index) {
      activeIdx = index;
      bar.querySelectorAll(".hw-hub-v5-notebook__q-btn").forEach((btn, i) => {
        const on = i === index;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      /* Replace — never stack 1問 under 2問. */
      detail.replaceChildren();
      if (index < 0 || !groups[index]) {
        detail.hidden = true;
        return;
      }
      detail.hidden = false;
      detail.appendChild(renderNotebookQuestionDetail(pack, groups[index]));
    }

    function setPackOpen(open) {
      packOpen = open;
      dateBtn.setAttribute("aria-expanded", open ? "true" : "false");
      dateBtn.classList.toggle("is-open", open);
      body.hidden = !open;
      if (!open) paintDetail(-1);
    }

    dateBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      setPackOpen(!packOpen);
    });

    groups.forEach((group, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v5-notebook__q-btn";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      const groupMark = notebookRowMark(group.rows[0] || {}, pack);
      btn.textContent = group.label;
      if (groupMark) {
        btn.classList.add("hw-hub-v5-notebook__q-btn--" + groupMark);
        const glyph = document.createElement("span");
        glyph.className = "hw-hub-v5-notebook__q-mark";
        glyph.setAttribute("aria-hidden", "true");
        glyph.textContent = groupMark === "correct" ? "\u2713" : "\u2717";
        btn.appendChild(glyph);
        btn.setAttribute(
          "aria-label",
          group.label + (groupMark === "correct" ? " — looks good" : " — not quite")
        );
      }
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        paintDetail(activeIdx === index ? -1 : index);
      });
      bar.appendChild(btn);
    });

    body.appendChild(bar);
    body.appendChild(detail);
    wrap.appendChild(dateBtn);
    wrap.appendChild(body);
    return wrap;
  }

  const QUEST_NOTEBOOK_EXAMPLE_LABELS = [
    "1つ目",
    "2つ目",
    "3つ目",
    "4つ目",
    "5つ目",
  ];

  function renderQuestExampleDetail(exampleText, index) {
    const el = document.createElement("article");
    el.className =
      "hw-hub-v5-notebook__row hw-hub-v5-notebook__row--detail hw-hub-v5-notebook__row--quest-ex";
    const block = document.createElement("div");
    block.className =
      "hw-hub-v5-notebook__detail-block hw-hub-v5-notebook__detail-block--student";
    const label = document.createElement("p");
    label.className = "hw-hub-v5-notebook__detail-label";
    label.textContent = QUEST_NOTEBOOK_EXAMPLE_LABELS[index] || "Example";
    block.appendChild(label);
    const text = document.createElement("p");
    text.className = "hw-hub-v5-notebook__text";
    const trimmed = String(exampleText || "").trim();
    text.textContent = trimmed
      ? trimmed
      : "Nothing here yet — write this on the Quest tab.";
    block.appendChild(text);
    el.appendChild(block);
    return el;
  }

  /**
   * Quest notebook — cream target card → green 1つ目 2つ目… → example text.
   */
  function renderQuestNotebookPanel(snap) {
    const wrap = document.createElement("div");
    wrap.className = "hw-hub-v5-notebook__pack-panel hw-hub-v5-notebook__pack-panel--quest";

    const examples = Array.isArray(snap?.examples) ? snap.examples : [];
    const filled = examples.filter((s) => String(s || "").trim()).length;

    const dateBtn = document.createElement("button");
    dateBtn.type = "button";
    dateBtn.className = "hw-hub-v5-notebook__date-btn";
    dateBtn.setAttribute("aria-expanded", "false");

    const nameEl = document.createElement("span");
    nameEl.className = "hw-hub-v5-notebook__date-btn-name";
    nameEl.textContent = "Today's look-for";

    const whenEl = document.createElement("span");
    whenEl.className = "hw-hub-v5-notebook__date-btn-when hw-hub-v5-notebook__date-btn-when--quest";
    whenEl.textContent = String(snap?.title || "—");

    const lessonEl = document.createElement("span");
    lessonEl.className = "hw-hub-v5-notebook__date-btn-lesson";
    lessonEl.textContent =
      'Look and listen for "' + String(snap?.look || snap?.title || "") + '"';

    const cue = document.createElement("span");
    cue.className = "hw-hub-v5-notebook__date-btn-cue";
    const cueLabel = document.createElement("span");
    cueLabel.className = "hw-hub-v5-notebook__date-btn-cue-label";
    cueLabel.textContent =
      filled === 1 ? "1 example" : filled + " of 5 examples";
    const cueChev = document.createElement("span");
    cueChev.className = "hw-hub-v5-notebook__date-btn-chevron";
    cueChev.setAttribute("aria-hidden", "true");
    cueChev.textContent = "\u25B8";
    cue.appendChild(cueLabel);
    cue.appendChild(cueChev);

    dateBtn.appendChild(nameEl);
    dateBtn.appendChild(whenEl);
    dateBtn.appendChild(lessonEl);
    dateBtn.appendChild(cue);

    const body = document.createElement("div");
    body.className = "hw-hub-v5-notebook__pack-body";
    body.hidden = true;

    const bar = document.createElement("div");
    bar.className = "hw-hub-v5-notebook__q-bar";
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Quest examples");

    const detail = document.createElement("div");
    detail.className = "hw-hub-v5-notebook__q-detail";
    detail.hidden = true;

    let packOpen = false;
    let activeIdx = -1;

    function paintDetail(index) {
      activeIdx = index;
      bar.querySelectorAll(".hw-hub-v5-notebook__q-btn").forEach((btn, i) => {
        const on = i === index;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      detail.replaceChildren();
      if (index < 0) {
        detail.hidden = true;
        return;
      }
      detail.hidden = false;
      detail.appendChild(
        renderQuestExampleDetail(examples[index] || "", index)
      );
    }

    function setPackOpen(open) {
      packOpen = open;
      dateBtn.setAttribute("aria-expanded", open ? "true" : "false");
      dateBtn.classList.toggle("is-open", open);
      body.hidden = !open;
      if (!open) paintDetail(-1);
    }

    dateBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      setPackOpen(!packOpen);
    });

    QUEST_NOTEBOOK_EXAMPLE_LABELS.forEach((label, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v5-notebook__q-btn hw-hub-v5-notebook__q-btn--quest";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      btn.textContent = label;
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        paintDetail(activeIdx === index ? -1 : index);
      });
      bar.appendChild(btn);
    });

    body.appendChild(bar);
    body.appendChild(detail);
    wrap.appendChild(dateBtn);
    wrap.appendChild(body);
    return wrap;
  }

  async function renderQuestNotebookPage() {
    const page = document.getElementById("hw-notebook-diary-page");
    const dateEl = document.getElementById("hw-notebook-diary-date");
    const lessonEl = document.getElementById("hw-notebook-diary-lesson");
    const pagerRow = document.getElementById("hw-notebook-pager-row");
    const searchWrap = document.getElementById("hw-notebook-search-wrap");
    if (!page || !dateEl) return;

    if (searchWrap) searchWrap.hidden = true;
    if (pagerRow) pagerRow.hidden = true;
    document.getElementById("hw-notebook-daily-status")?.remove();

    try {
      await global.HwHubQuests?.loadProgress?.();
    } catch {
      /* local progress still ok */
    }

    const snap = global.HwHubQuests?.getNotebookSnapshot?.();
    if (!snap) {
      dateEl.textContent = "Quest Notebook";
      if (lessonEl) {
        lessonEl.hidden = false;
        lessonEl.textContent = "Immersion Quest";
      }
      page.replaceChildren();
      const empty = document.createElement("p");
      empty.className = "hw-hub-v5-notebook__empty";
      empty.textContent =
        "Quest notes will show here when Immersion Quest is available for your account.";
      page.appendChild(empty);
      return;
    }

    dateEl.textContent = "Quest Notebook";
    if (lessonEl) {
      lessonEl.hidden = false;
      lessonEl.textContent =
        "Day " +
        snap.day +
        (snap.round > 1 ? " · Round " + snap.round : "") +
        " — examples from your quest";
    }

    page.replaceChildren();
    page.appendChild(renderQuestNotebookPanel(snap));
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
    /* First/new session → HW Notes; refresh restores the last pick from this tab. */
    if (!notebookBookSessionReady) {
      notebookBookId = loadSessionNotebookBookId();
      notebookBookSessionReady = true;
    } else if (!books.some((b) => b.id === notebookBookId)) {
      notebookBookId = "hw";
    }
    const active = getActiveNotebookBook();
    notebookBookId = active.id;

    booksNav.classList.toggle("is-unlocked", notebookBooksEditUnlocked);
    booksNav.replaceChildren();
    books.forEach((book) => {
      const core = isCoreNotebookBook(book.id);
      const movable = notebookBooksEditUnlocked;
      const deletable = movable && !core;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v5-notebook-books__btn";
      if (book.id === notebookBookId) btn.classList.add("is-active");
      if (movable) btn.classList.add("is-editable");
      btn.setAttribute("data-nb-book", book.id);
      btn.setAttribute("aria-pressed", book.id === notebookBookId ? "true" : "false");
      btn.draggable = movable;

      const label = document.createElement("span");
      label.className = "hw-hub-v5-notebook-books__label";
      label.textContent = book.label;
      btn.appendChild(label);

      if (deletable) {
        const del = document.createElement("span");
        del.className = "hw-hub-v5-notebook-books__del";
        del.setAttribute("data-nb-book-del", book.id);
        del.setAttribute("role", "button");
        del.setAttribute("tabindex", "0");
        del.setAttribute("aria-label", "Delete " + book.label);
        del.title = "Delete notebook";
        del.textContent = "\u00D7";
        btn.appendChild(del);
      }

      if (movable) {
        btn.addEventListener("dragstart", (ev) => {
          if (!notebookBooksEditUnlocked) {
            ev.preventDefault();
            return;
          }
          notebookBookDragId = book.id;
          btn.classList.add("is-dragging");
          try {
            ev.dataTransfer.effectAllowed = "move";
            ev.dataTransfer.setData("text/plain", book.id);
          } catch {
            /* ignore */
          }
        });
        btn.addEventListener("dragend", () => {
          notebookBookDragId = "";
          btn.classList.remove("is-dragging");
          booksNav
            .querySelectorAll(".hw-hub-v5-notebook-books__btn.is-drop-target")
            .forEach((el) => el.classList.remove("is-drop-target"));
        });
        btn.addEventListener("dragover", (ev) => {
          if (!notebookBookDragId || notebookBookDragId === book.id) return;
          ev.preventDefault();
          btn.classList.add("is-drop-target");
        });
        btn.addEventListener("dragleave", () => {
          btn.classList.remove("is-drop-target");
        });
        btn.addEventListener("drop", (ev) => {
          ev.preventDefault();
          btn.classList.remove("is-drop-target");
          const from =
            notebookBookDragId ||
            (ev.dataTransfer && ev.dataTransfer.getData("text/plain")) ||
            "";
          reorderNotebookBook(from, book.id);
          notebookBookDragId = "";
        });
      }

      booksNav.appendChild(btn);
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className =
      "hw-hub-v5-notebook-books__btn hw-hub-v5-notebook-books__btn--add";
    addBtn.setAttribute("data-nb-book-add", "1");
    addBtn.textContent = "Add Notebook";
    booksNav.appendChild(addBtn);

    const lockBtn = document.createElement("button");
    lockBtn.type = "button";
    lockBtn.className =
      "hw-hub-v5-notebook-books__lock" +
      (notebookBooksEditUnlocked ? " is-unlocked" : "");
    lockBtn.setAttribute("data-nb-book-lock", "1");
    lockBtn.setAttribute(
      "aria-pressed",
      notebookBooksEditUnlocked ? "true" : "false"
    );
    lockBtn.setAttribute(
      "aria-label",
      notebookBooksEditUnlocked
        ? "Lock notebook bar"
        : "Unlock to rearrange notebooks (only added ones can be deleted)"
    );
    lockBtn.title = notebookBooksEditUnlocked
      ? "Lock bar"
      : "Unlock to rearrange — Daily / HW / Kanji can’t be deleted";
    lockBtn.innerHTML = LOCK_SVG;
    booksNav.appendChild(lockBtn);
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
    const pick = bookId === "kanji" ? "quest" : bookId;
    const next = books.find((b) => b.id === pick);
    if (!next) return;
    if (notebookBookId === "daily" && next.id !== "daily") {
      window.clearTimeout(dailyNotebookSaveTimer);
      void flushDailyNotebookSave();
    }
    if (notebookBookId === "kanji" && next.id !== "kanji") {
      window.clearTimeout(kanjiNotebookSaveTimer);
      void flushKanjiNotebookSave();
    }
    notebookBookId = next.id === "kanji" ? "quest" : next.id;
    saveSessionNotebookBookId(notebookBookId);
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
    const order = getNotebookBooks()
      .map((b) => b.id)
      .filter((x) => x !== id);
    order.push(id);
    saveNotebookBookOrder(order);
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
      aria = "Search HW notes";
    } else if (id === "daily") {
      placeholder = "Search days, notes, dates\u2026";
      aria = "Search daily notebook";
    } else if (id === "quest" || id === "kanji") {
      placeholder = "Search coming soon\u2026";
      aria = "Search quest notebook";
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
    if (book.id === "quest" || book.id === "kanji") {
      void renderQuestNotebookPage();
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
        dateEl.textContent = "HW Notes";
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
    dateEl.textContent = "HW Notes";
    if (lessonEl) {
      const lesson = packDisplayTitle(pack);
      lessonEl.textContent = lesson || when || "Reviewed homework";
      lessonEl.hidden = false;
    }

    const rows = Array.isArray(pack.rows) ? pack.rows : [];
    page.appendChild(renderHwNotesPackPanel(pack, rows));
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
    /* Curriculum swaps this diary for the daily textbook after every paint. */
    global.HwCurriculumTextbook?.sync?.();
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
   * Past HW entry from hub buttons — Past assignments popup.
   */
  function openPastHomeworkFromHub() {
    if (notebookOpen) {
      setActiveTab("homework", { skipFocus: true });
    }
    if (isArchiveMode()) {
      exitArchiveMode();
    }

    if (global.HwStudentPast?.openPicker) {
      void global.HwStudentPast.openPicker();
      return;
    }

    /* Fallback if modal markup is missing — keep hub usable. */
    renderAll();
    document.dispatchEvent(new CustomEvent("hw-platform-reload-past"));
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
    if (book?.id === "quest" || book?.id === "kanji") {
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

    document.addEventListener("hw-quest-examples-changed", () => {
      if (!notebookOpen || notebookBookId !== "quest") return;
      void renderQuestNotebookPage();
    });

    document.addEventListener("click", (e) => {
      const lockBtn = e.target.closest("[data-nb-book-lock]");
      if (lockBtn) {
        e.preventDefault();
        setNotebookBooksEditUnlocked(!notebookBooksEditUnlocked);
        return;
      }
      const delBtn = e.target.closest("[data-nb-book-del]");
      if (delBtn) {
        e.preventDefault();
        e.stopPropagation();
        deleteCustomNotebookBook(delBtn.getAttribute("data-nb-book-del") || "");
        return;
      }
      const addBtn = e.target.closest("[data-nb-book-add]");
      if (addBtn) {
        e.preventDefault();
        promptAddNotebook();
        return;
      }
      const bookBtn = e.target.closest("[data-nb-book]");
      if (bookBtn) {
        e.preventDefault();
        setNotebookBook(bookBtn.getAttribute("data-nb-book") || "hw");
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
    } else if (id === "quest" || id === "kanji") {
      void renderQuestNotebookPage();
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

    const curriculumToolsOn =
      document.body.classList.contains("hw-prayer-toolbar") ||
      document.body.classList.contains("hw-sit-toolbar") ||
      document.body.classList.contains("hw-hub-content-toolbar");
    if (!curriculumToolsOn) {
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
    const offlineCard = document.getElementById("hw-offline-tools-card");
    const hasAssignment = studentHasActiveAssignment();
    const ready = hubReady || demoModeEnabled();

    if (isQuestOnlyAccount()) {
      bindHubBootDismiss();
      clearHubBootGate();
      if (worksheetSection) worksheetSection.hidden = true;
      if (completeCard) completeCard.hidden = true;
      renderNoPlanWelcome(false);
      renderNoHwEmpty(false);
      renderPlanWaiting(false);
      document.body.classList.remove("hw-hub-v5-complete-view", "hw-hub-v5-noplan-view");
      return;
    }

    /* While the platform is still loading, keep the normal Loading… /
       hourglass worksheet chrome — never flash empty/upsell shells. */
    if (!ready) {
      bindHubBootDismiss();
      if (worksheetSection) worksheetSection.hidden = false;
      if (completeCard) completeCard.hidden = true;
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
    queueNotebookRefresh();
    applyNotebookOpenUi();
    if (offlineCard) {
      /* Photo shell only when capturing. */
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
    ensureSituationsPanel();
    ensureCurriculumHome();
    ensureDateStrip();
    syncCurriculumContentToolbar(
      normalizeTabId(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab)
    );
    global.HwHubQuests?.ensurePanel?.();
    global.HwHubWorkouts?.ensurePanel?.();
    paintHubTabButtons();
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
      const app = document.getElementById("hw-v5-app");
      let tab = app?.dataset.v5ActiveTab || defaultHubTab();
      if (!hubTabIds().includes(normalizeTabId(tab))) tab = defaultHubTab();
      setActiveTab(tab);
    }
    /* Re-assert diary after every paint so async hub refreshes can't flash status. */
    applyNotebookOpenUi();
    global.HwCurriculumTextbook?.sync?.();
    mountCoreStrips();
    loadCoreCards().then(() => paintCoreStrips());
    queueLiveReviewRefresh();
    ensureReviewPoll(status);
  }

  function bindUi() {
    if (uiBound) return;
    uiBound = true;
    bindNotebookUi();

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
      const trialRequest = e.target.closest("[data-hw-trial-request]");
      if (trialRequest) {
        e.preventDefault();
        const box = trialRequest.closest("[data-hw-trial]");
        const levels = box?.querySelector("[data-hw-trial-levels]");
        if (levels) levels.hidden = false;
        trialRequest.hidden = true;
        return;
      }
      const trialLevel = e.target.closest("[data-hw-trial-level]");
      if (trialLevel) {
        e.preventDefault();
        void requestFreeTrial(
          trialLevel.getAttribute("data-hw-trial-level") || "",
          trialLevel.closest("[data-hw-trial]")
        );
        return;
      }
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
      if (e.target.closest("#hw-hub-past-homework-pill")) {
        e.preventDefault();
        setActiveTab("homework", { scrollTop: true });
        openPastHomeworkFromHub();
      }
    });

    document.getElementById("hw-v5-tabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-v5-tab]");
      if (!btn) return;
      const id = btn.getAttribute("data-v5-tab") || (accountMode ? "profile" : "homework");
      if (id === "notebook") sessionStorage.removeItem("jlm-ct-focus");
      setActiveTab(id);
      if (id === "notebook") global.HwCurriculumTextbook?.sync?.();
    });

    if (!moveHubTab.bound) {
      moveHubTab.bound = true;
      document.addEventListener(
        "keydown",
        (ev) => {
          if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight" && ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
          if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
          if (!document.getElementById("hw-v5-app") || !document.getElementById("hw-v5-tabs")) return;
          if (arrowKeysTyping(ev.target) || arrowKeysTyping(document.activeElement)) return;
          ev.preventDefault();
          if (ev.key === "ArrowLeft") moveHubTab(-1);
          else if (ev.key === "ArrowRight") moveHubTab(1);
          else if (ev.key === "ArrowUp") moveHubTabSlide(-1);
          else moveHubTabSlide(1);
        },
        true
      );
    }

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
      void global.HwHubQuests?.refresh?.();
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

  function applyDemoLaunchQuery() {
    if (!demoModeEnabled()) return;
    try {
      const q = new URLSearchParams(location.search);
      const account = q.get("account");
      if (account && DEMO_ACCOUNTS[account]) writeStorage(STORAGE.account, account);
      if (q.get("tab") === "textbook") writeStorage(STORAGE.tab, "notebook");
    } catch {
      /* ignore */
    }
  }

  function init() {
    applyDemoLaunchQuery();
    activateChrome();
    buildV5Shell();
    bindUi();
    bindHubTabSliderLayout();
    initHubTabs();
    renderAll();
    consumeStudentGo();
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
    document.addEventListener("click", (ev) => {
      const done = ev.target && ev.target.closest && ev.target.closest("[data-complete-task]");
      if (!done) return;
      completeTodayTask(done.getAttribute("data-complete-task"));
    });
    scheduleLocalPeriodRollover();
  }

  let localPeriodTimer = 0;

  function refreshLocalPeriods() {
    ensureCurriculumHome();
    ensureSituationsPanel();
    syncCurriculumContentToolbar(
      normalizeTabId(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab)
    );
    paintWordPlay();
    paintCorePage();
    void global.HwHubQuests?.refresh?.();
    global.HwHubWorkouts?.refresh?.();
    global.HwCurriculumTextbook?.sync?.();
  }

  function scheduleLocalPeriodRollover() {
    window.clearTimeout(localPeriodTimer);
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 5, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    localPeriodTimer = window.setTimeout(() => {
      refreshLocalPeriods();
      scheduleLocalPeriodRollover();
    }, Math.max(1000, next.getTime() - now.getTime() + 250));
  }

  /** Durable notebook open state for platform refresh paths. */
  global.HwHubV5Live = {
    /** Tick a to-do item and show a toast, without leaving the current tab. */
    completeTask(id, toast) {
      completeTodayTask(id, { stay: true, toast: toast || "" });
    },
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
    isQuestOnlyAccount,
    isCurriculumAccount,
    togglePrayerFocus,
    isPrayerFocus,
    usesCurriculumHub,
    isDemo1StandardPreview,
    openCurriculumPlace,
    coreJapaneseList() {
      return coreCards.slice();
    },
    todaysCoreWord() {
      return todaysWordItem().word;
    },
    paintWordPlay,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
