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

  const DEFAULT_DEMO_ASSIGNMENT_URL = "/homework/assignments/sheet-u1vevjge.json";
  let demoAssignmentUrl = DEFAULT_DEMO_ASSIGNMENT_URL;

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

  function applyPreviewQuery() {
    let q;
    try {
      q = new URLSearchParams(location.search);
    } catch {
      q = new URLSearchParams();
    }
    const status = q.get("status");
    const account = q.get("account");
    const assignment = String(q.get("assignment") || "").trim();
    const toolbar = q.get("toolbar") === "1";

    if (status === "in_progress" || status === "submitted" || status === "reviewed") {
      writeStorage(STORAGE.status, status);
    }
    if (account && DEMO_ACCOUNTS[account]) {
      writeStorage(STORAGE.account, account);
    }
    if (assignment) {
      /* Prefer API so KV-only library sheets (e.g. 〜時、〜の時) load in preview. */
      demoAssignmentUrl =
        "/api/homework-assignment?id=" + encodeURIComponent(assignment);
      demoAssignment = null;
      worksheetForm = null;
    }
    if (toolbar) {
      document.documentElement.classList.add("hw-hub-v5-toolbar-embed");
      document.body.classList.add("hw-hub-v5-toolbar-embed");
      const bar = document.getElementById("hw-toolbar-bar");
      if (bar) {
        bar.hidden = false;
        global.HwToolbarQIcons?.applyToToolbar?.(bar);
      }
    }
  }

  /**
   * Local toolbar playtest: pretend the sheet is fully filled + submitted so Send
   * and See Answers appear (orange ?, soar) without completing blanks.
   * Default ON for localhost/127.0.0.1 toolbar embeds; opt out with ?playtestReady=0.
   * Never active on production hosts.
   */
  function isToolbarPlaytestReady() {
    if (!document.documentElement.classList.contains("hw-hub-v5-toolbar-embed")) {
      return false;
    }
    if (global.HwFeatureFlags?.isLocalDev?.() !== true) return false;
    try {
      const q = new URLSearchParams(location.search);
      if (q.get("playtestReady") === "0") return false;
      /* Default on for local toolbar; ?playtestReady=1 is explicit/redundant. */
      return true;
    } catch {
      return true;
    }
  }

  /** Fill blanks / media / star so HwWorksheet treats every line as answered. */
  function fillPlaytestAnswers(form) {
    if (!form) return;

    form.querySelectorAll("input.hw-blank, textarea.hw-blank").forEach((el) => {
      if (String(el.value || "").trim()) return;
      const wrap = el.closest("[data-teacher-answer]");
      const teacher = String(wrap?.getAttribute("data-teacher-answer") || "").trim();
      el.value = teacher || "playtest";
    });

    form.querySelectorAll(".hw-video-inline, .hw-audio-inline").forEach((inline) => {
      if (!String(inline.dataset.mediaId || "").trim()) {
        inline.dataset.mediaId = "playtest-media";
      }
      const card = inline.querySelector(".hw-video-inline__card");
      if (card) card.dataset.state = "saved";
      inline.dataset.hwAnswerSaved = "true";
    });

    form.querySelectorAll(".hw-worksheet__line--star").forEach((line) => {
      const hidden = line.querySelector(".hw-star-block__answer");
      const need = Number(line.dataset.pieceCount) || 0;
      if (!hidden || need <= 0) return;
      try {
        const existing = JSON.parse(hidden.value || "null");
        if (Array.isArray(existing) && existing.length === need && existing.every(Boolean)) {
          return;
        }
      } catch {
        /* fill below */
      }
      hidden.value = JSON.stringify(
        Array.from({ length: need }, (_, i) => "playtest-" + (i + 1))
      );
    });
  }

  /**
   * Force filled + submitted UI gates for local toolbar playtest.
   * Keeps the worksheet visible (does not call setDemoStatus → complete card).
   */
  function applyToolbarPlaytestReady(form) {
    if (!isToolbarPlaytestReady() || !form) return;
    fillPlaytestAnswers(form);
    global.HwWorksheet?.updateSubmitButtonState?.(form);
    const submitBtn = form.querySelector(
      '.hw-worksheet__actions-submit button[type="submit"]'
    );
    /* Belt-and-suspenders if a line type still fails the answered check. */
    if (submitBtn) submitBtn.disabled = false;
    global.HwWorksheet?.enableSeeAnswers?.(form);
    writeStorage(STORAGE.status, "submitted");
    const statusEl = document.getElementById("hw-save-status");
    if (statusEl) {
      statusEl.textContent = "Playtest: answers filled + submitted (local only).";
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

  const TAB_IDS = ["homework", "notebook", "lessons", "games"];

  const TAB_ALIASES = {
    lesson: "lessons",
    study: "lessons",
    mistakes: "lessons",
    more: "notebook",
    notifications: "notebook",
    notifs: "notebook",
  };

  function normalizeTabId(tabId) {
    const key = String(tabId || "").trim().toLowerCase();
    const mapped = TAB_ALIASES[key] || key;
    return TAB_IDS.includes(mapped) ? mapped : "homework";
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

  function setActiveTab(tabId, options) {
    const app = document.getElementById("hw-v5-app");
    if (!app) return;
    const keepViewport = !options?.scrollTop;
    const prevY = keepViewport ? window.scrollY : 0;

    const tab = normalizeTabId(tabId);
    app.dataset.v5ActiveTab = tab;
    if (!options?.skipPersist) writeStorage(STORAGE.tab, tab);

    document.querySelectorAll("[data-v5-tab]").forEach((btn) => {
      const active = btn.getAttribute("data-v5-tab") === tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    applyTabPanels(tab);
    syncHubTabSlider();
    if (keepViewport) {
      requestAnimationFrame(() => {
        if (window.scrollY !== prevY) window.scrollTo({ top: prevY, left: window.scrollX });
      });
    }

    if (options?.scrollTop) {
      app.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
    setActiveTab(normalizeTabId(readStorage(STORAGE.tab, "homework")));
  }

  function bindHubTabs() {
    document.querySelectorAll("[data-v5-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setActiveTab(btn.getAttribute("data-v5-tab") || "homework");
      });
    });

    document.addEventListener("click", (e) => {
      const lessonTab = e.target.closest("[data-lesson-pane]");
      if (!lessonTab) return;
      const pane = lessonTab.getAttribute("data-lesson-pane") === "playlist" ? "playlist" : "latest";
      document.querySelectorAll("[data-lesson-pane]").forEach((btn) => {
        const active = btn.getAttribute("data-lesson-pane") === pane;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });
      document.querySelectorAll("[data-lesson-panel]").forEach((panel) => {
        panel.hidden = panel.getAttribute("data-lesson-panel") !== pane;
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
    const tryUrls = [demoAssignmentUrl];
    if (demoAssignmentUrl !== DEFAULT_DEMO_ASSIGNMENT_URL) {
      tryUrls.push(DEFAULT_DEMO_ASSIGNMENT_URL);
    }
    let lastErr = null;
    for (const url of tryUrls) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Could not load demo worksheet.");
        const ct = (res.headers.get("Content-Type") || "").toLowerCase();
        if (ct.includes("text/html")) throw new Error("Assignment API returned HTML.");
        let data = await res.json();
        if (!data || typeof data !== "object" || !data.sections) {
          throw new Error("Assignment JSON missing sections.");
        }
        if (global.HwWorksheet?.enrichAssignmentMedia) {
          data = global.HwWorksheet.enrichAssignmentMedia(JSON.parse(JSON.stringify(data)));
        }
        demoAssignment = data;
        demoAssignmentUrl = url;
        return demoAssignment;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Could not load demo worksheet.");
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
    const lessonBtn = document.getElementById("hw-latest-lesson");
    const playlist = document.getElementById("hw-lesson-playlist");
    document.querySelectorAll(".hw-grid-lesson, .hw-hub-v5-lesson-pane, .hw-lesson-actions").forEach((el) => {
      el.remove();
    });
    document.getElementById("hw-lesson-meta")?.remove();
    if (lessonBtn) {
      lessonBtn.href = MOCK.lessonUrl;
      lessonBtn.textContent = "Latest lesson";
      lessonBtn.className = "hw-hub-v5-lesson-tabs__btn";
      lessonBtn.removeAttribute("aria-disabled");
    }
    if (playlist) {
      playlist.href = MOCK.lessonUrl;
      playlist.textContent = "Lesson playlist";
      playlist.className = "hw-hub-v5-lesson-tabs__btn hw-lesson-playlist";
      playlist.removeAttribute("aria-disabled");
      playlist.hidden = false;
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
    /* Toolbar iframe stays on the sheet (send / see-answers playtest). */
    const toolbarEmbed = document.documentElement.classList.contains(
      "hw-hub-v5-toolbar-embed"
    );
    const showComplete = isCompleteView(status) && !toolbarEmbed;

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
    setActiveTab(document.getElementById("hw-v5-app")?.dataset.v5ActiveTab || "homework");
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

      /* After restoring saved drafts — local toolbar playtest overrides to filled+submitted. */
      applyToolbarPlaytestReady(worksheetForm);

      worksheetForm.addEventListener("input", () => {
        const data = {};
        worksheetForm.querySelectorAll(".hw-blank").forEach((el) => {
          if (el.name) data[el.name] = el.value;
        });
        writeStorage(STORAGE.answers, JSON.stringify(data));
        const statusEl = document.getElementById("hw-save-status");
        if (statusEl) statusEl.textContent = "Saved in your browser.";
        syncToolbarActionState();
      });
      worksheetForm.addEventListener("change", () => syncToolbarActionState());
      worksheetForm.addEventListener("hw-worksheet-answer", () => syncToolbarActionState());

      worksheetForm.addEventListener("submit", (ev) => {
        ev.preventDefault();
        if (worksheetForm.querySelector('.hw-worksheet__actions-submit button[type="submit"]')?.disabled) {
          return;
        }
        global.HwWorksheet?.enableSeeAnswers?.(worksheetForm);
        /* Toolbar playtest: stay on the sheet after submit (answers unlock). */
        if (document.documentElement.classList.contains("hw-hub-v5-toolbar-embed")) {
          writeStorage(STORAGE.status, "submitted");
          syncToolbarActionState();
          return;
        }
        setDemoStatus("submitted");
      });

      bindToolbarActions();
      placeToolbarUnderHwBox();
      attachWorksheetTools();
      worksheetForm.addEventListener("hw-worksheet-slide", () => {
        placeToolbarUnderHwBox();
        syncToolbarActionState();
      });
      syncToolbarActionState();
    } catch {
      mount.innerHTML =
        '<p class="hw-maker-status">Could not load the worksheet. Refresh and try again.</p>';
    }
  }

  /** Mount glass + cloud on the worksheet host (same tools as live hub). Start tucked away. */
  function attachWorksheetTools() {
    const form = worksheetFormEl();
    if (!form) return;
    const host =
      form.closest(".hw-hub-v2-worksheet") ||
      document.getElementById("hw-v5-worksheet-card") ||
      form.parentElement;

    global.HwWorksheetToolLayout?.beginWorksheetToolBoot?.();

    if (global.HwFeatureFlags?.homeworkComments?.() && global.HwHomeworkComments?.attachTo) {
      global.HwHomeworkComments.attachTo(form, {
        username: "demo",
        assignmentId: form.getAttribute("data-assignment-id") || "hub-v5-demo",
        readOnly: false,
        skipOnboarding: true,
        useModeNeutrals: true,
        /* v5: normal listen-mid stack; bump clears stale high/spread normals. */
        launcherStorageKey: "hw-hc-toolbar-playtest-v5",
        /* Fallback — Focus left-edge stack; live mode neutrals override. */
        defaultLauncher: { x: 0, y: 579 },
      });
    }

    if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.attachTo && host) {
      global.HwMagnifyingGlass.attachTo(host, {
        skipOnboarding: true,
        useModeNeutrals: true,
        /* v6: normal listen-mid stack; bump clears stale high/spread normals. */
        storageKey: "hw-mg-toolbar-playtest-v6",
        defaultLens: { x: 0, y: 497 },
      });
      global.HwWorksheetToolLayout?.ensureFocusNeutralWatch?.();
    } else if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.refresh) {
      global.HwMagnifyingGlass.refresh();
    }

    /* Toolbar pops these out — keep the floating tools hidden until then. */
    setGlassPopped(false);
    setCloudPopped(false);

    /*
     * Match live hub: beginWorksheetToolBoot leaves tools with
     * pointer-events:none / opacity:0 until revealWorksheetTools.
     * Tuck CSS (display:none) still hides them until the toolbar pops out.
     */
    global.HwWorksheetToolLayout?.revealWorksheetTools?.(host || form);
  }

  function isGlassPopped() {
    return document.documentElement.classList.contains("hw-tb-glass-out");
  }

  function isCloudPopped() {
    return document.documentElement.classList.contains("hw-tb-cloud-out");
  }

  /** Phone widths — same as live student toolbar mobile arm. */
  function usesToolbarDirectArm() {
    try {
      return global.matchMedia("(max-width: 767px)").matches;
    } catch {
      return false;
    }
  }

  function isGlassArmed() {
    return !!document.querySelector(".hw-mg-host.hw-mg-armed");
  }

  function isCloudArmed() {
    return !!document.querySelector(".hw-hc-host.hw-hc-armed");
  }

  function worksheetToolHostEl() {
    const form = worksheetFormEl();
    return (
      form?.closest(".hw-hub-v2-worksheet") ||
      document.getElementById("hw-v5-worksheet-card") ||
      form?.parentElement ||
      null
    );
  }

  function setGlassPopped(on) {
    document.documentElement.classList.toggle("hw-tb-glass-out", !!on);
    if (!on) {
      global.HwMagnifyingGlass?.setArmed?.(false);
      return;
    }
    global.HwMagnifyingGlass?.refresh?.();
  }

  function setCloudPopped(on) {
    document.documentElement.classList.toggle("hw-tb-cloud-out", !!on);
    if (!on) {
      global.HwHomeworkComments?.disarm?.();
      return;
    }
    global.HwHomeworkComments?.applyLauncherPosition?.();
  }

  function toggleGlassArmFromToolbar() {
    const next = !isGlassArmed();
    document.documentElement.classList.remove("hw-tb-glass-out", "hw-tb-cloud-out");
    global.HwHomeworkComments?.disarm?.();
    global.HwMagnifyingGlass?.setArmed?.(next);
    syncToolbarActionState();
  }

  function toggleCloudArmFromToolbar() {
    const next = !isCloudArmed();
    document.documentElement.classList.remove("hw-tb-glass-out", "hw-tb-cloud-out");
    global.HwMagnifyingGlass?.setArmed?.(false);
    if (next) global.HwHomeworkComments?.setArmed?.(true);
    else global.HwHomeworkComments?.disarm?.();
    syncToolbarActionState();
  }

  function toggleGlassFromToolbar(glassBtn) {
    if (usesToolbarDirectArm()) {
      toggleGlassArmFromToolbar();
      return;
    }
    const host = worksheetToolHostEl();
    const layout = global.HwWorksheetToolLayout;
    if (isGlassPopped()) {
      if (host && layout?.flingToolsToToolbar) {
        layout.flingToolsToToolbar({
          hostEl: host,
          glassBtn,
          cloudBtn: null,
          glassOut: true,
          cloudOut: false,
          onTuck: () => {
            setGlassPopped(false);
            syncToolbarActionState();
          },
        });
        return;
      }
      setGlassPopped(false);
      syncToolbarActionState();
      return;
    }
    if (host && layout?.flingToolsFromToolbar) {
      layout.flingToolsFromToolbar({
        hostEl: host,
        glassBtn,
        glass: true,
        onReveal: () => {
          setGlassPopped(true);
          syncToolbarActionState();
        },
      });
      return;
    }
    setGlassPopped(true);
    syncToolbarActionState();
  }

  function toggleCloudFromToolbar(cloudBtn) {
    if (usesToolbarDirectArm()) {
      toggleCloudArmFromToolbar();
      return;
    }
    const host = worksheetToolHostEl();
    const layout = global.HwWorksheetToolLayout;
    if (isCloudPopped()) {
      if (host && layout?.flingToolsToToolbar) {
        layout.flingToolsToToolbar({
          hostEl: host,
          glassBtn: null,
          cloudBtn,
          glassOut: false,
          cloudOut: true,
          onTuck: () => {
            setCloudPopped(false);
            syncToolbarActionState();
          },
        });
        return;
      }
      setCloudPopped(false);
      syncToolbarActionState();
      return;
    }
    if (host && layout?.flingToolsFromToolbar) {
      layout.flingToolsFromToolbar({
        hostEl: host,
        cloudBtn,
        cloud: true,
        onReveal: () => {
          setCloudPopped(true);
          syncToolbarActionState();
        },
      });
      return;
    }
    setCloudPopped(true);
    syncToolbarActionState();
  }

  /** Sit the toolbar under the HW content, inside the blue grammar box (after the mount). */
  function placeToolbarUnderHwBox() {
    if (!document.documentElement.classList.contains("hw-hub-v5-toolbar-embed")) return;
    const bar = document.getElementById("hw-toolbar-bar");
    const card =
      document.getElementById("hw-v5-worksheet-card") ||
      document.querySelector(".hw-hub-v2-worksheet.hw-hub-worksheet-card") ||
      document.querySelector(".hw-hub-v2-worksheet");
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    if (!bar || !card) return;
    if (mount && card.contains(mount)) {
      if (bar.previousElementSibling !== mount || bar.parentElement !== card) mount.after(bar);
    } else if (bar.parentElement !== card) {
      card.appendChild(bar);
    }
    global.HwWorksheetToolLayout?.clearMobileToolbarHome?.(bar);
  }

  function worksheetFormEl() {
    return (
      worksheetForm ||
      document.querySelector("#hw-v2-worksheet-mount form.hw-worksheet") ||
      document.getElementById("hw-worksheet-form")
    );
  }

  function syncToolbarActionState() {
    const form = worksheetFormEl();
    const bar = document.getElementById("hw-toolbar-bar");
    if (!bar) return;
    const sendBtn = bar.querySelector('[data-tb-tool="send"]');
    const answersBtn = bar.querySelector('[data-tb-tool="answers"]');
    const focusBtn = bar.querySelector('[data-tb-tool="focus"]');
    const glassBtn = bar.querySelector('[data-tb-tool="glass"]');
    const cloudBtn = bar.querySelector('[data-tb-tool="cloud"]');
    const formSend = form?.querySelector('.hw-worksheet__actions-submit button[type="submit"]');
    const formAnswers = form?.querySelector("[data-hw-see-answers]");
    /* Same completion gate: all blanks filled → Send + See Answers appear together. */
    const playtestReady = isToolbarPlaytestReady();
    const sendReady = Boolean(formSend && !formSend.disabled) || playtestReady;
    const answersReady = sendReady;
    if (sendBtn) {
      sendBtn.disabled = playtestReady ? false : !formSend || formSend.disabled;
      sendBtn.setAttribute("data-tb-tone", sendReady ? "ready" : "muted");
      sendBtn.classList.toggle("is-ready", sendReady);
      sendBtn.setAttribute("aria-hidden", sendReady ? "false" : "true");
      if (sendReady) sendBtn.removeAttribute("tabindex");
      else sendBtn.setAttribute("tabindex", "-1");
    }
    if (answersBtn) {
      const locked = playtestReady
        ? !formAnswers
        : !formAnswers || formAnswers.hidden || formAnswers.disabled;
      answersBtn.disabled = locked;
      answersBtn.classList.toggle("is-ready", answersReady);
      answersBtn.classList.toggle("answers-ready", answersReady);
      answersBtn.setAttribute("data-tb-tone", answersReady ? "gold" : "muted");
      answersBtn.setAttribute("aria-hidden", answersReady ? "false" : "true");
      if (answersReady) answersBtn.removeAttribute("tabindex");
      else answersBtn.setAttribute("tabindex", "-1");
      answersBtn.setAttribute(
        "aria-pressed",
        formAnswers?.getAttribute("aria-pressed") === "true" ? "true" : "false"
      );

      const label = answersBtn.querySelector(".hw-toolbar-bar__label");
      if (label && formAnswers) {
        label.textContent =
          formAnswers.getAttribute("aria-pressed") === "true" ? "Hide Answers" : "See Answers";
      }
    }
    if (focusBtn) {
      focusBtn.setAttribute(
        "aria-pressed",
        document.body.classList.contains("hw-hw-focus-mode") ? "true" : "false"
      );
    }
    if (glassBtn) {
      glassBtn.disabled = !(
        global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.attachTo
      );
      const glassOn = usesToolbarDirectArm() ? isGlassArmed() : isGlassPopped();
      glassBtn.setAttribute("aria-pressed", glassOn ? "true" : "false");
    }
    if (cloudBtn) {
      cloudBtn.disabled = !(
        global.HwFeatureFlags?.homeworkComments?.() && global.HwHomeworkComments?.attachTo
      );
      const cloudOn = usesToolbarDirectArm() ? isCloudArmed() : isCloudPopped();
      cloudBtn.setAttribute("aria-pressed", cloudOn ? "true" : "false");
    }
    global.HwToolbarQIcons?.applyToToolbar?.(bar);
  }

  function bindToolbarActions() {
    const bar = document.getElementById("hw-toolbar-bar");
    if (!bar || bar.dataset.bound === "1") return;
    bar.dataset.bound = "1";
    bar.addEventListener("click", (ev) => {
      const btn = ev.target.closest?.("[data-tb-tool]");
      if (!btn || btn.disabled || btn.getAttribute("aria-disabled") === "true" || !bar.contains(btn)) return;
      const tool = btn.getAttribute("data-tb-tool");
      const form = worksheetFormEl();
      if (tool === "focus") {
        if (document.body.classList.contains("hw-hw-focus-mode")) {
          global.HwWorksheet?.exitFocusMode?.();
        } else {
          form?.querySelector("[data-hw-focus]")?.click();
        }
        syncToolbarActionState();
        return;
      }
      if (tool === "send") {
        form?.querySelector('.hw-worksheet__actions-submit button[type="submit"]')?.click();
        syncToolbarActionState();
        return;
      }
      if (tool === "answers") {
        const answers = form?.querySelector("[data-hw-see-answers]");
        if (answers && !answers.disabled && !answers.hidden) answers.click();
        else if (form) global.HwWorksheet?.toggleTeacherAnswers?.(form);
        syncToolbarActionState();
        return;
      }
      if (tool === "glass") {
        toggleGlassFromToolbar(btn);
        return;
      }
      if (tool === "cloud") {
        toggleCloudFromToolbar(btn);
        return;
      }
    });
    document.addEventListener("fullscreenchange", () => syncToolbarActionState());
    document.addEventListener("hw-tool-arm-change", () => syncToolbarActionState());
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
      setActiveTab("homework", { scrollTop: true });
      const fold = document.getElementById("hw-v5-past-fold");
      if (fold && !fold.open) fold.open = true;
    });

    bindHubTabs();
    bindHubTabSliderLayout();
    initHubTabs();
  }

  function init() {
    applyPreviewQuery();
    bindUi();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
