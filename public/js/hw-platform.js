/**
 * Homework platform — student hub (assignments + submit) or teacher hub (worksheet library).
 */
(function () {
  const global = window;
  const session = HwAuth.getSession();
  if (!session) return;

  const teacherSession = HwAuth.getTeacherSession();
  const isViewingAsStudent = HwAuth.isViewingAsStudent();
  const isTeacher = Boolean(teacherSession) && !isViewingAsStudent;

  function getTeacherSessionForApi() {
    return teacherSession || HwAuth.getTeacherSession();
  }

  const greet = document.getElementById("hw-platform-greet");
  if (greet) {
    if (isViewingAsStudent) {
      greet.textContent =
        (teacherSession?.displayName || "Teacher") +
        " · viewing as " +
        (session.displayName || session.username);
    } else if (isTeacher) {
      greet.textContent = session.displayName + " · Teacher";
    }
  }

  function studentHubHeading(name) {
    if (typeof HwAuth.possessiveHubTitle === "function") {
      return HwAuth.possessiveHubTitle(name);
    }
    const label = String(name || "").trim();
    if (!label) return "Your hub";
    return label + "'s hub";
  }

  if (!isTeacher) {
    document.body.classList.add("hw-role-student");
    const hubTitle = document.getElementById("hw-hub-title");
    const eyebrow = document.getElementById("hw-hub-eyebrow");
    if (hubTitle) {
      hubTitle.textContent = studentHubHeading(session.displayName || session.username);
    }
    if (eyebrow) eyebrow.hidden = true;

    const footerInfo = document.getElementById("hw-platform-footer-info");
    const footerLogout = document.getElementById("hw-platform-logout-footer");
    if (footerInfo) footerInfo.hidden = true;
    if (footerLogout) {
      footerLogout.hidden = false;
      footerLogout.addEventListener("click", () => HwAuth.logout());
    }
  }

  /** Hub v4: worksheet on top, cards below. Legacy bottom worksheet for noplan only. */
  function usesHubV4Layout() {
    if (isTeacher) return false;
    if (global.__JLM_HUB_V5) return true;
    return session.username !== "noplan";
  }

  let hubV4WorksheetForm = null;

  function applyHubLayout() {
    if (isTeacher) return;
    const v4 = usesHubV4Layout();
    document.body.classList.toggle("hw-hub-v4-page", v4);
    document.body.classList.toggle("hw-hub-v3-page", v4);

    const v4Homework = document.getElementById("hw-hub-v4-homework");
    const legacySection = document.getElementById("hw-worksheet-section");
    const grid = document.getElementById("hw-student-grid");
    const assignCard = document.getElementById("hw-current-assignment-card");

    if (v4Homework) v4Homework.hidden = !v4;
    if (legacySection) legacySection.hidden = v4;
    if (grid) grid.classList.toggle("hw-hub-v4-below", v4);

    if (assignCard) {
      assignCard.classList.toggle("hw-hub-v4-actions-card", v4);
    }
    placeOfflineToolsShell();
    placePhotoUploadShell();
    if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.refresh) {
      global.HwMagnifyingGlass.refresh();
    }
  }

  function placeOfflineToolsShell() {
    const card = document.getElementById("hw-offline-tools-card");
    if (!card) return;
    const v4Target = document.getElementById("hw-grid-stack");
    const legacyTarget =
      document.querySelector("#hw-worksheet-section .hw-hub-v2-worksheet") ||
      document.getElementById("hw-worksheet-section");
    const target = usesHubV4Layout() ? v4Target : legacyTarget;
    if (!target) return;
    if (usesHubV4Layout()) {
      if (card.parentElement !== target) target.insertBefore(card, target.firstChild);
      else if (card !== target.firstElementChild) target.insertBefore(card, target.firstChild);
      card.classList.remove("hw-grid-offline--legacy");
    } else if (card.parentElement !== target) {
      target.appendChild(card);
      card.classList.add("hw-grid-offline--legacy");
    }
  }

  function placePhotoUploadShell() {
    placeOfflineToolsShell();
  }

  function getWorksheetMount() {
    if (usesHubV4Layout()) {
      return document.getElementById("hw-v2-worksheet-mount");
    }
    return document.getElementById("hw-worksheet-mount");
  }

  function placeHubV4Progress() {
    const statusLine = document.getElementById("hw-v2-status-line");
    const nav = hubV4WorksheetForm?.querySelector(".hw-worksheet__slide-nav");
    if (!statusLine || !nav) return;
    if (statusLine.previousElementSibling !== nav) {
      nav.after(statusLine);
      statusLine.classList.add("hw-hub-v2-top__status--below-nav");
    }
  }

  function renderHubV4Top(assignment, form) {
    if (!usesHubV4Layout()) return;
    hubV4WorksheetForm = form || hubV4WorksheetForm;

    const titleEl = document.getElementById("hw-v2-title");
    const tagline = document.getElementById("hw-v2-tagline");
    const statusLine = document.getElementById("hw-v2-status-line");
    const v4Intro = document.getElementById("hw-v4-worksheet-intro");

    if (titleEl) {
      const meta = studentViewMeta(
        {
          date: assignment?.date,
          title: assignment?.title,
          id: assignment?.id,
          lessonName: assignment?.lessonName,
        },
        assignment
      );
      titleEl.textContent = meta.listLabel || assignment?.title || "Homework";
    }

    const answered =
      hubV4WorksheetForm && global.HwWorksheet?.countAnsweredQuestions
        ? global.HwWorksheet.countAnsweredQuestions(hubV4WorksheetForm)
        : 0;
    const total =
      hubV4WorksheetForm && global.HwWorksheet?.totalQuestions
        ? global.HwWorksheet.totalQuestions(hubV4WorksheetForm)
        : 0;

    if (tagline) {
      tagline.hidden = true;
      tagline.textContent = "";
    }
    if (statusLine) {
      statusLine.hidden = true;
    }
    if (v4Intro) v4Intro.hidden = true;
    placeHubV4Progress();
  }

  function bindHubV4WorksheetChrome(form, assignment) {
    if (!usesHubV4Layout() || !form) return;
    hubV4WorksheetForm = form;
    renderHubV4Top(assignment, form);

    if (form.dataset.hubV4Bound === "true") return;
    form.dataset.hubV4Bound = "true";

    const refresh = () => renderHubV4Top(assignment, form);
    form.addEventListener("input", refresh);
    form.addEventListener("hw-worksheet-answer", refresh);
  }

  function renderAccountBar() {
    /* Student hub: identity pills removed for a cleaner fullscreen header. */
    const badges = document.getElementById("hw-platform-badges");
    if (!badges || isTeacher) return;
    badges.hidden = true;
    badges.replaceChildren();
  }

  const TIER_DETAIL_TITLES = {
    basic: "Basic — what’s included",
    premium: "Premium — what’s included",
    ultra: "Ultra — what’s included",
  };

  const HUB_PLAN_TIERS = {
    basic: "tier1",
    premium: "tier2",
    ultra: "tier3",
  };

  /** Stub until teacher-assigned plans ship — every student hub shows Basic as current. */
  const HUB_CURRENT_PLAN_TIER = "tier1";

  const HUB_PLAN_STATUS_LOCKED =
    '<span class="course-card__status-text course-card__status-text--locked">Locked</span>' +
    '<span class="course-card__status-text course-card__status-text--unlock">Details</span>';

  let tierDetailBound = false;
  /** @type {((tierId: string) => void) | null} */
  let openHubTierDetail = null;

  function bindTierDetailModal() {
    if (tierDetailBound) return;
    const modal = document.getElementById("hw-tier-detail-modal");
    const pick = document.getElementById("hw-hub-tier-pick");
    if (!modal) return;
    tierDetailBound = true;

    const title = document.getElementById("hw-tier-detail-title");
    const panels = modal.querySelectorAll("[data-tier-detail-panel]");
    const closeEls = modal.querySelectorAll("[data-hw-tier-detail-close]");
    let lastFocus = null;

    function closeModal() {
      if (modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove("is-modal-open");
      panels.forEach((panel) => {
        panel.hidden = true;
      });
      if (lastFocus instanceof HTMLElement) lastFocus.focus();
      lastFocus = null;
    }

    function openModal(tierId) {
      const panel = document.getElementById("hw-tier-detail-" + tierId);
      if (!panel) return;
      lastFocus = document.activeElement;
      panels.forEach((el) => {
        el.hidden = el !== panel;
      });
      if (title) title.textContent = TIER_DETAIL_TITLES[tierId] || "Plan details";
      modal.hidden = false;
      document.body.classList.add("is-modal-open");
      global.HwCheckout?.bindCheckoutControls?.(modal);
      modal.querySelector("[data-hw-tier-detail-close]")?.focus();
    }

    openHubTierDetail = openModal;

    pick?.querySelectorAll("[data-hw-tier-detail]").forEach((el) => {
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        const tierId = el.getAttribute("data-hw-tier-detail") || "";
        const card = el.closest("[data-hw-tier-plan]");
        if (card?.classList.contains("hw-hub-tier-plan--current")) return;
        openModal(tierId);
      });
    });

    pick?.querySelectorAll("[data-hw-tier-plan][data-hw-tier-detail]").forEach((card) => {
      card.addEventListener("click", () => {
        if (card.classList.contains("hw-hub-tier-plan--current")) return;
        if (card.id === "hw-hub-ultra-card") return;
        openModal(card.getAttribute("data-hw-tier-detail") || "");
      });
    });

    closeEls.forEach((el) => el.addEventListener("click", closeModal));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function renderHubTierPlans() {
    const pick = document.getElementById("hw-hub-tier-pick");
    if (!pick || pick.hidden) return;

    const currentTier = HUB_CURRENT_PLAN_TIER;
    pick.querySelectorAll("[data-hw-tier-plan]").forEach((card) => {
      if (card.id === "hw-hub-ultra-card") return;

      const planId = card.getAttribute("data-hw-tier-plan");
      const planTier = planId ? HUB_PLAN_TIERS[planId] : null;
      const isCurrent = Boolean(planTier && currentTier === planTier);
      const statusBtn = card.querySelector("[data-hw-tier-plan-status]");

      card.classList.toggle("course-card--locked", !isCurrent);
      card.classList.toggle("hw-hub-tier-plan--current", isCurrent);

      if (statusBtn) {
        if (isCurrent) {
          statusBtn.disabled = true;
          statusBtn.innerHTML =
            '<span class="course-card__status-text hw-hub-tier-plan__current">Current plan</span>';
        } else {
          statusBtn.disabled = false;
          statusBtn.innerHTML = HUB_PLAN_STATUS_LOCKED;
        }
      }
    });
  }

  function renderStudentHubHeader() {
    if (isTeacher) return;
    const pick = document.getElementById("hw-hub-tier-pick");
    const desc = document.getElementById("hw-hub-desc");

    if (pick && !global.__JLM_HUB_V5) {
      pick.hidden = false;
      bindTierDetailModal();
      renderHubTierPlans();
      global.HwCheckout?.bindCheckoutControls?.(pick);
    } else if (pick && global.__JLM_HUB_V5) {
      pick.hidden = true;
    }

    if (desc) desc.hidden = true;
  }

  const HUB_GAMES = [
    { label: "Village prototype", href: "/game/" },
    { label: "Tic Tac Toe", href: "/game/tictactoe-past/" },
    { label: "Lantern Word Hunt", href: "/game/lantern-hunt/" },
    { label: "Yūgen Gatherer", locked: true },
  ];

  function renderGamesHubCard() {
    const card = document.getElementById("hw-games-hub-card");
    const footer = document.getElementById("hw-games-hub-footer");
    if (!card || !footer) return;

    footer.replaceChildren();

    if (!HwAuth.hasGameHubAccess(session)) {
      card.hidden = true;
      return;
    }

    card.hidden = false;
    card.classList.remove("course-card--locked");

    HUB_GAMES.forEach((game) => {
      if (game.locked) {
        const lock = document.createElement("span");
        lock.className = "hw-games-hub-btn hw-games-hub-btn--locked";
        lock.textContent = game.label;
        lock.setAttribute("aria-disabled", "true");
        lock.title = "Coming soon";
        footer.append(lock);
        return;
      }
      const link = document.createElement("a");
      link.className = "hw-games-hub-btn";
      link.href = game.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = game.label;
      footer.append(link);
    });
  }

  function bindWeeklyUpgradeCard() {
    const card = document.getElementById("hw-weekly-upgrade-card");
    const btn = document.getElementById("hw-weekly-upgrade-btn");
    if (!card || !btn || btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";
    card.hidden = !HwAuth.canShowWeeklyHomeworkUpgrade(session);
    const price = HwAuth.WEEKLY_HOMEWORK_UPGRADE_PRICE;
    const priceEl = card.querySelector(".course-card__price");
    if (priceEl) {
      priceEl.textContent = "$" + price;
      priceEl.setAttribute("aria-label", "Price: " + price + " dollars per month");
    }
    btn.addEventListener("click", () => {
      showToast(
        "Weekly homework add-on ($" +
          price +
          "/mo) — PayPal coming soon. Message JD to sign up."
      );
    });
  }

  /** Student-safe labels — never show another learner's name from catalog/JSON. */
  function studentViewMeta(catalogEntry, assignment) {
    const date = assignment?.date || catalogEntry?.date || "";
    const title =
      assignment?.title || catalogEntry?.title || catalogEntry?.id || "Homework";
    return {
      listLabel: title,
      lessonMeta: title,
      heading: "Your homework",
      lessonName: title,
      title,
      date,
    };
  }

  function getStudentMedia(catalog) {
    const profile = catalog?.studentProfiles?.[session.username] || {};
    return {
      latestLessonUrl: profile.latestLessonUrl || profile.youtubeUrl || null,
      lessonPlaylistUrl:
        profile.lessonPlaylistUrl ||
        profile.reviewPlaylistUrl ||
        catalog?.playlistUrl ||
        null,
      reviewPlaylistUrl:
        profile.reviewPlaylistUrl || catalog?.reviewPlaylistUrl || catalog?.playlistUrl || null,
    };
  }

  function courseStatusButton(labelLocked, labelUnlock, onClick, ariaLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "course-card__status";
    if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
    btn.innerHTML =
      '<span class="course-card__status-text course-card__status-text--locked">' +
      labelLocked +
      '</span><span class="course-card__status-text course-card__status-text--unlock">' +
      labelUnlock +
      "</span>";
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
  }

  function courseStatusLink(labelLocked, labelUnlock, href, ariaLabel) {
    const link = document.createElement("a");
    link.className = "course-card__status course-card__status-link";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (ariaLabel) link.setAttribute("aria-label", ariaLabel);
    link.innerHTML =
      '<span class="course-card__status-text course-card__status-text--locked">' +
      labelLocked +
      '</span><span class="course-card__status-text course-card__status-text--unlock">' +
      labelUnlock +
      "</span>";
    return link;
  }

  function renderUltraReviewPlaylist(catalog) {
    if (isTeacher || !HwAuth.hasVideoResponseAccess(session)) return;

    const media = getStudentMedia(catalog);
    const playlistUrl = media.reviewPlaylistUrl;
    if (!isYoutubeReady(playlistUrl)) return;

    const lessonPlaylist = document.getElementById("hw-lesson-playlist");
    if (lessonPlaylist && lessonPlaylist.hidden) {
      lessonPlaylist.href = playlistUrl;
      lessonPlaylist.textContent = "HW review playlist (video feedback)";
      lessonPlaylist.hidden = false;
    }
  }

  document.getElementById("hw-platform-logout")?.addEventListener("click", () => {
    HwAuth.logout();
    window.location.href = HwAuth.LOGIN_PATH;
  });

  document.querySelectorAll("[data-placeholder]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const msg = btn.getAttribute("data-placeholder-msg") || "Coming soon.";
      showToast(msg);
    });
  });

  const toastEl = document.getElementById("hw-platform-toast");
  let toastTimer = 0;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  function confirmHomeworkSubmit() {
    return new Promise((resolve) => {
      const previousFocus = document.activeElement;
      const modal = document.createElement("div");
      modal.className = "hw-submit-confirm";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "hw-submit-confirm-title");
      modal.setAttribute("aria-describedby", "hw-submit-confirm-desc");
      modal.innerHTML =
        '<div class="hw-submit-confirm__backdrop" data-hw-submit-no></div>' +
        '<div class="hw-submit-confirm__dialog">' +
        '<p class="hw-submit-confirm__eyebrow">ちょっと待って！</p>' +
        '<h2 class="hw-submit-confirm__title" id="hw-submit-confirm-title">Are you sure?</h2>' +
        '<p class="hw-submit-confirm__desc" id="hw-submit-confirm-desc">This will send all of your answers to JD.</p>' +
        '<div class="hw-submit-confirm__actions">' +
        '<button type="button" class="btn btn--primary" data-hw-submit-yes>はい</button>' +
        '<button type="button" class="btn btn--ghost" data-hw-submit-no>いいえ</button>' +
        "</div>" +
        "</div>";

      let resolved = false;

      function close(confirmed) {
        if (resolved) return;
        resolved = true;
        document.removeEventListener("keydown", onKeydown);
        modal.remove();
        document.body.classList.remove("is-modal-open");
        if (previousFocus instanceof HTMLElement) previousFocus.focus();
        resolve(confirmed);
      }

      function onKeydown(event) {
        if (event.key === "Escape") close(false);
      }

      modal.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("[data-hw-submit-yes]")) close(true);
        if (target.closest("[data-hw-submit-no]")) close(false);
      });

      document.body.appendChild(modal);
      document.body.classList.add("is-modal-open");
      document.addEventListener("keydown", onKeydown);
      modal.querySelector("[data-hw-submit-no]")?.focus();
    });
  }

  function isYoutubeReady(url) {
    return url && !String(url).startsWith("REPLACE_");
  }

  function assignmentFileUrl(id) {
    return new URL("/homework/assignments/" + id + ".json", window.location.origin).href;
  }

  function studentWorksheetUrl(id) {
    return window.location.origin + "/homework/platform.html#hw-" + id;
  }

  function librarySearchText(entry) {
    return [
      entry.id,
      entry.title,
      entry.date,
      entry.lessonName,
      entry.studentLabel,
      entry.summary,
      (entry.tags || []).join(" "),
      (entry.students || []).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  const CATALOG_SESSION_KEY = "jlm-hw-catalog-v1";
  const CATALOG_TTL_MS = 90_000;
  const assignmentMemoryCache = new Map();
  /** Dedupe concurrent assignment fetches (early prefetch + loadStudentHub). */
  const assignmentFetchInFlight = new Map();
  let catalogFetchInFlight = null;
  let studentHubLoadGen = 0;
  let studentHubHiddenAt = 0;
  let studentMountedAssignmentId = null;

  function readSessionJson(key) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeSessionJson(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota */
    }
  }

  function catalogFetchScope() {
    if (isTeacher) return "teacher:full";
    const username = session?.username;
    if (username) return "student:" + username;
    return "student:";
  }

  function invalidateCatalogCaches() {
    catalogCache = null;
    catalogCacheScope = null;
    catalogFetchInFlight = null;
    try {
      sessionStorage.removeItem(CATALOG_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  const ASSIGNMENT_SESSION_PREFIX = "jlm-hw-assignment-v2-";

  function assignmentSessionKey(id) {
    return ASSIGNMENT_SESSION_PREFIX + id;
  }

  function purgeLegacyAssignmentSessionKeys(id) {
    try {
      if (id) {
        sessionStorage.removeItem("jlm-hw-assignment-" + id);
        return;
      }
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith("jlm-hw-assignment-") && !k.startsWith(ASSIGNMENT_SESSION_PREFIX)) {
          sessionStorage.removeItem(k);
        }
      });
    } catch {
      /* ignore */
    }
  }

  function invalidateAssignmentCache(id) {
    if (id) {
      assignmentMemoryCache.delete(id);
      try {
        sessionStorage.removeItem(assignmentSessionKey(id));
        purgeLegacyAssignmentSessionKeys(id);
      } catch {
        /* ignore */
      }
      return;
    }
    assignmentMemoryCache.clear();
    try {
      Object.keys(sessionStorage).forEach((k) => {
        if (k.startsWith("jlm-hw-assignment-")) sessionStorage.removeItem(k);
      });
    } catch {
      /* ignore */
    }
  }

  function studentAssignmentFetchOptions(options) {
    if (isTeacher && !isViewingAsStudent) {
      return options?.bypassCache ? { bypassCache: true } : undefined;
    }
    return { bypassCache: true };
  }

  async function fetchCatalog(options) {
    options = options || {};
    const scope = catalogFetchScope();
    if (!options.bypassCache && catalogCache && catalogCacheScope === scope) return catalogCache;

    if (!options.bypassCache) {
      const cached = readSessionJson(CATALOG_SESSION_KEY);
      if (
        cached?.savedAt &&
        cached.scope === scope &&
        Date.now() - cached.savedAt < CATALOG_TTL_MS &&
        cached.data?.assignments
      ) {
        catalogCache = cached.data;
        catalogCacheScope = scope;
        return cached.data;
      }
    }

    if (!options.bypassCache && catalogFetchInFlight) return catalogFetchInFlight;

    const work = (async () => {
      const studentParam =
        scope.startsWith("student:") && session?.username
          ? "?student=" + encodeURIComponent(session.username)
          : "";
      const res = await fetch("/api/homework-catalog" + studentParam, {
        cache: options.bypassCache ? "no-store" : "default",
      });
      if (!res.ok) throw new Error("catalog");
      const data = await res.json();
      catalogCache = data;
      catalogCacheScope = scope;
      writeSessionJson(CATALOG_SESSION_KEY, { scope, savedAt: Date.now(), data });
      return data;
    })();

    if (!options.bypassCache) catalogFetchInFlight = work;
    try {
      return await work;
    } finally {
      if (catalogFetchInFlight === work) catalogFetchInFlight = null;
    }
  }

  function normalizeAssignmentPayload(data) {
    if (!data) return null;
    if (data.sections && Array.isArray(data.sections)) return data;
    if (data.assignment && data.assignment.sections) return data.assignment;
    return data;
  }

  function finalizeAssignment(assignment) {
    if (global.HwEncoding?.repairAssignment) {
      assignment = global.HwEncoding.repairAssignment(assignment);
    }
    if (!assignment?.sections?.length) return assignment;
    if (global.HwWorksheet?.enrichAssignmentMedia) {
      global.HwWorksheet.enrichAssignmentMedia(assignment);
    }
    return assignment;
  }

  async function fetchAssignmentJson(id, options) {
    options = options || {};
    if (!id) throw new Error("assignment");

    if (!options.bypassCache && assignmentMemoryCache.has(id)) {
      return finalizeAssignment(assignmentMemoryCache.get(id));
    }

    if (assignmentFetchInFlight.has(id)) {
      return assignmentFetchInFlight.get(id);
    }

    const work = (async () => {
      purgeLegacyAssignmentSessionKeys(id);
      const sessionKey = assignmentSessionKey(id);
      if (!options.bypassCache) {
        const cached = readSessionJson(sessionKey);
        if (cached?.data?.sections?.length) {
          const assignment = finalizeAssignment(cached.data);
          assignmentMemoryCache.set(id, assignment);
          return assignment;
        }
      }

      const fetchOpts = { cache: options.bypassCache ? "no-store" : "default" };
      const apiUrl = "/api/homework-assignment?id=" + encodeURIComponent(id);

      try {
        const res = await fetch(apiUrl, fetchOpts);
        if (res.ok) {
          const assignment = finalizeAssignment(normalizeAssignmentPayload(await res.json()));
          if (assignment?.sections?.length) {
            assignmentMemoryCache.set(id, assignment);
            writeSessionJson(sessionKey, { savedAt: Date.now(), data: assignment });
            return assignment;
          }
        }
      } catch {
        /* fall through to static file */
      }

      const staticRes = await fetch(
        "/homework/assignments/" + encodeURIComponent(id) + ".json",
        fetchOpts
      );
      if (!staticRes.ok) throw new Error("assignment");
      const assignment = finalizeAssignment(normalizeAssignmentPayload(await staticRes.json()));
      if (!assignment?.sections?.length) throw new Error("assignment");
      assignmentMemoryCache.set(id, assignment);
      writeSessionJson(sessionKey, { savedAt: Date.now(), data: assignment });
      return assignment;
    })();

    assignmentFetchInFlight.set(id, work);
    try {
      return await work;
    } finally {
      if (assignmentFetchInFlight.get(id) === work) {
        assignmentFetchInFlight.delete(id);
      }
    }
  }

  let studentSubmissionsCache = null;
  let studentSubmissionsFetchInFlight = null;

  function formatSubmissionWhen(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function submissionListTitle(entry) {
    return (
      entry.title?.trim() ||
      entry.lessonName?.trim() ||
      entry.assignmentId ||
      "Homework"
    );
  }

  function isLinkablePastSubmission(entry) {
    if (!entry) return false;
    if (entry.type === "online") return true;
    if (entry.type === "video" && entry.video?.id) return true;
    return false;
  }

  function pastSubmissionListTitle(entry) {
    const title = submissionListTitle(entry);
    if (entry.type === "video") return "Video upload — " + title;
    return title;
  }

  function renderSubmissionMediaView(mount, submission) {
    if (!mount) return false;
    mount.replaceChildren();

    const wrap = document.createElement("section");
    wrap.className = "hw-submission-media-view hw-hub-worksheet-card";
    wrap.setAttribute("aria-label", "Submitted recording");

    const heading = document.createElement("h2");
    heading.className = "hw-submission-media-view__title";
    heading.textContent = pastSubmissionListTitle(submission);
    wrap.appendChild(heading);

    const when = document.createElement("p");
    when.className = "hw-submission-media-view__when";
    when.textContent = "Submitted " + formatSubmissionWhen(submission.submittedAt);
    wrap.appendChild(when);

    const mediaId = submission.video?.id;
    if (!mediaId) return false;

    const url =
      (global.HwVideoInline?.mediaUrl && global.HwVideoInline.mediaUrl(mediaId)) ||
      "/api/hw-m/" + encodeURIComponent(mediaId);

    const playerMount = document.createElement("div");
    playerMount.className = "hw-submission-media-view__player";
    if (global.HwVideoInline?.mountPlayback) {
      global.HwVideoInline.mountPlayback(playerMount, { mediaId, mediaKind: "video" });
    } else {
      const video = document.createElement("video");
      video.setAttribute("aria-label", "Your recorded answer");
      const player =
        global.HwCompat?.enhanceVideoElement?.(video, url, { compact: true }) ||
        (function () {
          video.className = "hw-video-inline__playback hw-video-inline__playback--submitted";
          video.controls = true;
          video.playsInline = true;
          video.preload = "metadata";
          video.src = url;
          return video;
        })();
      if (player !== video) {
        player.classList.add("hw-video-inline__playback", "hw-video-inline__playback--submitted");
      }
      playerMount.appendChild(player);
    }
    wrap.appendChild(playerMount);
    mount.appendChild(wrap);
    return true;
  }

  async function fetchStudentSubmissions(options) {
    options = options || {};
    if (!options.bypassCache && studentSubmissionsCache) return studentSubmissionsCache;
    if (!options.bypassCache && studentSubmissionsFetchInFlight) {
      return studentSubmissionsFetchInFlight;
    }

    const work = (async () => {
      const url =
        "/api/homework-submissions?username=" + encodeURIComponent(session.username);
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load submissions.");
      const list = Array.isArray(data.submissions) ? data.submissions : [];
      list.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
      studentSubmissionsCache = list;
      return list;
    })();

    if (!options.bypassCache) studentSubmissionsFetchInFlight = work;
    try {
      return await work;
    } finally {
      studentSubmissionsFetchInFlight = null;
    }
  }

  function invalidateStudentSubmissionsCache() {
    studentSubmissionsCache = null;
    studentSubmissionsFetchInFlight = null;
  }

  async function acknowledgeStudentReviewNotes(submission) {
    if (!submission?.id || !session.username) return;
    const res = await fetch("/api/homework-review-ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: session.username,
        submissionId: submission.id,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not finish reviewing.");

    markLocalSubmissionFlags(submission.assignmentId, "acknowledged");
    try {
      localStorage.setItem(
        "jlm-hw-reviewed-acked-" + session.username + "-" + submission.assignmentId,
        "1"
      );
    } catch {
      /* ignore */
    }

    invalidateStudentSubmissionsCache();
    notifyStudentReviewGate({
      status: "acknowledged",
      submissionId: submission.id,
      assignmentId: submission.assignmentId,
    });

    showToast("Got it — JD will assign new homework when ready.");

    /* Leave the reviewed sheet and suggest upgrade / games (not past HW). */
    try {
      const url = window.location.pathname + window.location.search;
      history.replaceState(null, "", url);
    } catch {
      /* ignore */
    }
    document.dispatchEvent(new HashChangeEvent("hashchange"));

    if (global.HwHubV5Live?.openPostSubmitNext) {
      global.HwHubV5Live.openPostSubmitNext({ reason: "acknowledged" });
    }

    scheduleStudentSubmissionsLoad({ bypassCache: true });
    void loadStudentHub({ bypassCache: true });
  }

  function setSubmissionViewChrome(submission, viewing) {
    const banner = document.getElementById("hw-submission-view-banner");
    const pastFold = document.getElementById("hw-student-past-fold");
    const offlineCard = document.getElementById("hw-offline-tools-card");

    if (banner) {
      if (viewing && submission) {
        banner.hidden = false;
        const status = submission.reviewStatus;
        if (status === "reviewed") {
          banner.textContent =
            "Reviewed " +
            formatSubmissionWhen(submission.reviewedAt || submission.submittedAt) +
            " — your notes + JD’s notes (view only).";
        } else if (status === "acknowledged") {
          banner.textContent =
            "Finished reviewing " +
            formatSubmissionWhen(submission.studentNotesAckedAt || submission.reviewedAt) +
            " — past homework (view only).";
        } else {
          banner.textContent =
            "Submitted " +
            formatSubmissionWhen(submission.submittedAt) +
            " — view only (answers cannot be edited).";
        }
      } else {
        banner.hidden = true;
        banner.textContent = "";
      }
    }
    if (offlineCard) offlineCard.hidden = Boolean(viewing);
    if (pastFold && viewing && !global.__JLM_HUB_V5) {
      pastFold.hidden = false;
    }
  }

  function bindOfflineTools() {
    const printBtn = document.getElementById("hw-offline-print");
    if (!printBtn || printBtn.dataset.bound === "true") return;
    printBtn.dataset.bound = "true";
    printBtn.addEventListener("click", () => {
      const form = document.getElementById("hw-worksheet-form");
      if (form && global.HwWorksheet?.printBlank) {
        global.HwWorksheet.printBlank(form);
      }
    });
  }

  function setOfflineToolsVisible(show) {
    const offlineCard = document.getElementById("hw-offline-tools-card");
    if (!offlineCard) return;
    offlineCard.hidden = !show;
  }

  function openPastAssignment(entry) {
    /* Leave diary first so loadStudentHub doesn't skip the archive sheet and
       leave a stuck #hw-submission- hash with an empty mount. */
    global.HwHubV5Live?.closeNotebook?.();
    if (global.__JLM_HUB_V5) {
      const parts = parseStudentHash();
      let returnHash = "";
      if (parts.kind === "assignment" && parts.id) {
        returnHash = "#hw-" + parts.id;
      } else {
        const id = guessedAssignmentId();
        if (id) returnHash = "#hw-" + id;
      }
      try {
        if (returnHash) {
          sessionStorage.setItem("hw-v5-archive-return-hash", returnHash);
        } else {
          sessionStorage.removeItem("hw-v5-archive-return-hash");
        }
      } catch {
        /* ignore */
      }
    }
    window.location.hash = "hw-submission-" + entry.id;
  }

  function renderStudentPastListInto(list, metaEl, submissions, activeSubmissionId, options) {
    options = options || {};
    if (!list) return;

    const linkable = (submissions || []).filter(isLinkablePastSubmission);
    list.replaceChildren();

    if (metaEl) {
      metaEl.textContent = linkable.length
        ? linkable.length + " submission" + (linkable.length === 1 ? "" : "s")
        : "No submitted worksheets yet.";
    }

    if (!linkable.length) {
      const empty = document.createElement("li");
      empty.className = "hw-hub-v2-past-list__item hw-hub-v2-past-list__item--empty";
      empty.textContent = "When you submit homework online, it will appear here.";
      list.appendChild(empty);
      return;
    }

    linkable.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "hw-hub-v2-past-list__item";
      if (entry.id === activeSubmissionId) {
        li.classList.add("hw-hub-v2-past-list__item--active");
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v2-past-list__btn";
      btn.innerHTML =
        "<span>" +
        escapeHtml(pastSubmissionListTitle(entry)) +
        '</span><time datetime="' +
        escapeHtml(entry.submittedAt || "") +
        '">' +
        escapeHtml(formatSubmissionWhen(entry.submittedAt)) +
        "</time>";
      btn.addEventListener("click", () => {
        if (options.closeModal) closePastAssignmentsModal();
        openPastAssignment(entry);
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function renderStudentPastList(submissions, activeSubmissionId) {
    renderStudentPastListInto(
      document.getElementById("hw-student-past-list"),
      document.getElementById("hw-student-past-meta"),
      submissions,
      activeSubmissionId
    );
    renderStudentPastListInto(
      document.getElementById("hw-past-assignments-modal-list"),
      document.getElementById("hw-past-assignments-modal-meta"),
      submissions,
      activeSubmissionId,
      { closeModal: true }
    );
  }

  let pastAssignmentsModalBound = false;

  function closePastAssignmentsModal() {
    const modal = document.getElementById("hw-past-assignments-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("is-modal-open");
  }

  function bindPastAssignmentsModal() {
    if (pastAssignmentsModalBound) return;
    pastAssignmentsModalBound = true;

    const modal = document.getElementById("hw-past-assignments-modal");
    if (!modal) return;

    modal.querySelectorAll("[data-hw-past-modal-close]").forEach((el) => {
      el.addEventListener("click", () => closePastAssignmentsModal());
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (modal.hidden) return;
      ev.preventDefault();
      closePastAssignmentsModal();
    });
  }

  async function openPastAssignmentsModal() {
    global.HwHubV5Live?.closeNotebook?.();
    const modal = document.getElementById("hw-past-assignments-modal");
    if (!modal) return;

    bindPastAssignmentsModal();
    modal.hidden = false;
    document.body.classList.add("is-modal-open");

    try {
      await loadStudentPastHomework({ bypassCache: true });
    } catch {
      /* loadStudentPastHomework clears loading + surfaces errors */
    }

    modal.querySelector(".hw-breakdown-modal__close")?.focus();
  }

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scheduleStudentSubmissionsLoad(options) {
    const run = () => {
      void loadStudentPastHomework(options || {});
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 200);
    }
  }

  document.addEventListener("hw-platform-reload-past", () => {
    void loadStudentPastHomework({ bypassCache: true });
  });

  let pastHomeworkLoadGen = 0;

  function pastHomeworkTargets() {
    return {
      fold: document.getElementById("hw-student-past-fold"),
      foldList: document.getElementById("hw-student-past-list"),
      foldMeta: document.getElementById("hw-student-past-meta"),
      modal: document.getElementById("hw-past-assignments-modal"),
      modalList: document.getElementById("hw-past-assignments-modal-list"),
      modalMeta: document.getElementById("hw-past-assignments-modal-meta"),
    };
  }

  function pastHomeworkListsVisible(targets) {
    const foldOpen =
      targets.fold && !targets.fold.hidden && Boolean(targets.fold.open);
    const modalOpen = targets.modal && !targets.modal.hidden;
    return { foldOpen, modalOpen, any: foldOpen || modalOpen };
  }

  function setPastHomeworkError(message, targets) {
    const msg = message || "Could not load past homework.";
    if (targets.foldMeta) targets.foldMeta.textContent = msg;
    if (targets.modalMeta) targets.modalMeta.textContent = msg;
    [targets.foldList, targets.modalList].forEach((list) => {
      if (!list) return;
      list.replaceChildren();
      const empty = document.createElement("li");
      empty.className = "hw-hub-v2-past-list__item hw-hub-v2-past-list__item--empty";
      empty.textContent = msg;
      list.appendChild(empty);
    });
  }

  function showPastHomeworkWait(targets, visible) {
    const message = "Loading past homework…";
    if (targets.foldMeta) targets.foldMeta.textContent = message;
    if (targets.modalMeta) targets.modalMeta.textContent = message;
    const lists = [];
    if (visible.foldOpen && targets.foldList) lists.push(targets.foldList);
    if (visible.modalOpen && targets.modalList) lists.push(targets.modalList);
    /* Idle preload: don't flash hourglass into a closed fold. */
    if (!lists.length) return;
    lists.forEach((list) => {
      if (global.HwLoading?.showListWait) {
        global.HwLoading.showListWait(list, {
          message,
          extraClass: "hw-hub-v2-past-list__item",
        });
      }
    });
  }

  async function loadStudentPastHomework(options) {
    options = options || {};
    const gen = ++pastHomeworkLoadGen;
    const targets = pastHomeworkTargets();
    const lists = [targets.foldList, targets.modalList].filter(Boolean);
    if (!lists.length) return;

    const username = String(session?.username || "").trim();
    if (!username) {
      setPastHomeworkError("Sign in to view past homework.", targets);
      return;
    }

    const visible = pastHomeworkListsVisible(targets);
    if (visible.any) showPastHomeworkWait(targets, visible);

    const hash = window.location.hash.replace(/^#/, "");
    const activeSubmissionId = hash.match(/^hw-submission-(.+)$/)?.[1] || "";

    try {
      const submissions = await fetchStudentSubmissions(options);
      if (gen !== pastHomeworkLoadGen) return;
      renderStudentPastList(submissions, activeSubmissionId);
    } catch (err) {
      if (gen !== pastHomeworkLoadGen) return;
      setPastHomeworkError(
        (err && err.message) || "Could not load past homework.",
        targets
      );
    }
  }

  /** Hub diary owns the top status/HW slot — don't steal it with archive chrome. */
  function isHubNotebookOpen() {
    return (
      global.HwHubV5Live?.isNotebookOpen?.() === true ||
      document.body.classList.contains("hw-hub-v5-notebook-open")
    );
  }

  function notifySubmissionArchiveView(submission) {
    if (!submission?.id) return;
    /* Opening View notebook clears archive, then a racing load would re-enter
       submission view and wipe the diary — refuse while notebook is open. */
    if (isHubNotebookOpen()) return;
    const wantHash = "hw-submission-" + submission.id;
    const currentHash = String(window.location.hash || "").replace(/^#/, "");
    if (currentHash !== wantHash) {
      try {
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + "#" + wantHash
        );
      } catch {
        /* ignore */
      }
    }
    document.dispatchEvent(
      new CustomEvent("hw-platform-submission-view", {
        detail: {
          submissionId: submission.id,
          assignmentId: submission.assignmentId || "",
        },
      })
    );
  }

  /** Deep-link from Notebook rows: slide + memo focus after opening a reviewed sheet. */
  function applyNotebookOpenFocus(form, submissionId) {
    if (!form || !submissionId) return;
    let focus = null;
    try {
      const raw = sessionStorage.getItem("hw-notebook-focus");
      if (!raw) return;
      focus = JSON.parse(raw);
      sessionStorage.removeItem("hw-notebook-focus");
    } catch {
      return;
    }
    if (!focus || String(focus.submissionId) !== String(submissionId)) return;

    if (typeof focus.slideIndex === "number") {
      HwWorksheet.setSlideIndex?.(form, focus.slideIndex);
    }
    const commentId = String(focus.commentId || "").trim();
    if (commentId && global.HwHomeworkComments?.focusComment) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          global.HwHomeworkComments.focusComment(commentId);
        });
      });
    }
  }

  function abortSubmissionViewForNotebook(mount) {
    if (!isHubNotebookOpen()) return false;
    setSubmissionViewChrome(null, false);
    if (mount) mount.innerHTML = "";
    /* Drop archive hash so diary isn't fighting archive-mode chrome. */
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (/^hw-submission-/i.test(hash)) {
      try {
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  async function loadSubmissionView(submissionId, loadGen, isStale) {
    const mount = getWorksheetMount();
    const intro = document.getElementById("hw-worksheet-intro");
    const v4Intro = document.getElementById("hw-v4-worksheet-intro");
    const v2Title = document.getElementById("hw-v2-title");

    if (abortSubmissionViewForNotebook(mount)) return false;

    let submission;
    try {
      const res = await fetch(
        "/api/homework-submissions?id=" +
          encodeURIComponent(submissionId) +
          "&username=" +
          encodeURIComponent(session.username),
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load submission.");
      submission = data.submission;
    } catch (err) {
      setSubmissionViewChrome(null, false);
      if (mount) mount.innerHTML = "";
      return false;
    }
    if (isStale()) return false;
    if (abortSubmissionViewForNotebook(mount)) return false;

    if (submission.type === "video" && submission.video?.id) {
      if (v2Title) {
        v2Title.textContent = pastSubmissionListTitle(submission);
      }
      if (intro) intro.hidden = true;
      if (v4Intro) v4Intro.hidden = true;
      if (mount) {
        renderSubmissionMediaView(mount, submission);
      }
      setSubmissionViewChrome(submission, true);
      scheduleStudentSubmissionsLoad({ bypassCache: true });
      notifySubmissionArchiveView(submission);
      return true;
    }

    if (submission.type !== "online") {
      if (v4Intro) {
        v4Intro.textContent = "This submission was a " + submission.type + " upload — no online worksheet to review.";
        v4Intro.hidden = false;
      }
      if (mount) mount.innerHTML = "";
      setSubmissionViewChrome(submission, true);
      scheduleStudentSubmissionsLoad({ bypassCache: true });
      notifySubmissionArchiveView(submission);
      return true;
    }

    let assignment;
    try {
      assignment = await fetchAssignmentJson(
        submission.assignmentId,
        studentAssignmentFetchOptions({ bypassCache: true })
      );
    } catch {
      if (v4Intro) {
        v4Intro.textContent = "Could not load the worksheet for this submission.";
        v4Intro.hidden = false;
      }
      return true;
    }
    if (isStale()) return false;
    if (abortSubmissionViewForNotebook(mount)) return false;

    const view = studentViewMeta(
      { id: submission.assignmentId, title: submission.title, lessonName: submission.lessonName },
      assignment
    );

    if (v2Title) v2Title.textContent = view.listLabel;
    if (intro) intro.hidden = true;
    if (v4Intro) v4Intro.hidden = true;

    if (!mount) return true;

    global.HwStudentToolbar?.park?.();
    const form = HwWorksheet.render(mount, assignment, {
      omitMetaTitle: usesHubV4Layout(),
      omitMetaHint: usesHubV4Layout(),
      readOnly: true,
    });
    HwWorksheet.applySubmissionAnswers(form, submission);
    if (HwWorksheet.hasListenTeacherAnswers?.(form)) {
      HwWorksheet.revealTeacherAnswers(form);
    }
    HwWorksheet.setFormReadOnly(form);
    bindHubV4WorksheetChrome(form, assignment);
    studentMountedAssignmentId = submission.assignmentId;
    setSubmissionViewChrome(submission, true);
    scheduleStudentSubmissionsLoad({ bypassCache: true });

    if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.refresh) {
      global.HwMagnifyingGlass.refresh();
    }
    if (global.HwFeatureFlags?.homeworkComments?.() && global.HwHomeworkComments?.attachTo) {
      const canAck = submission.reviewStatus === "reviewed";
      global.HwHomeworkComments.attachTo(form, {
        username: session.username,
        assignmentId: submission.assignmentId,
        submissionId: submission.id,
        readOnly: true,
        studentReviewed:
          submission.reviewStatus === "reviewed" ||
          submission.reviewStatus === "acknowledged",
        initialComments: submission.comments,
        onStudentAckNotes: canAck
          ? async () => {
              try {
                await acknowledgeStudentReviewNotes(submission);
              } catch (err) {
                showToast((err && err.message) || "Could not finish reviewing.");
                throw err;
              }
            }
          : null,
      });
    }

    if (global.HwStudentToolbar?.mount) {
      global.HwStudentToolbar.mount(form, {
        username: session.username,
        assignmentId: submission.assignmentId,
        readOnly: true,
        skipAttach: true,
      });
      if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.attachTo) {
        const host =
          form.closest(".hw-hub-v2-worksheet") || form.parentElement;
        if (host) {
          global.HwMagnifyingGlass.attachTo(host, {
            skipOnboarding: true,
            useModeNeutrals: true,
            storageKey: "hw-mg-student-toolbar-v4",
            defaultLens: { x: 0, y: 497 },
          });
          global.HwWorksheetToolLayout?.ensureFocusNeutralWatch?.();
        }
      }
    }

    applyNotebookOpenFocus(form, submission.id);

    /* Keep hub archive ping + collapse in sync (replaceState alone does not fire hashchange). */
    notifySubmissionArchiveView(submission);

    return true;
  }

  function bindWorksheetSave(form, assignmentMeta, options) {
    options = options || {};
    if (!form || !session.username || options.preview) return;

    const submitMeta = isTeacher
      ? assignmentMeta
      : {
          ...assignmentMeta,
          ...studentViewMeta(null, assignmentMeta),
        };

    const assignmentId = assignmentMeta.id || form.getAttribute("data-assignment-id");
    const storageKey = `jlm-hw-answers-${session.username}-${assignmentId}`;
    const storageTsKey = storageKey + ":ts";
    const submittedKey = `jlm-hw-submitted-${session.username}-${assignmentId}`;
    const ultraUnlimited = session.tier === "tier3";
    const inputs = form.querySelectorAll("input.hw-blank, textarea.hw-blank");
    const saveStatus = form.querySelector("#hw-save-status");
    const SUBMIT_COOLDOWN_MS = 2000;
    const DRAFT_SAVE_MS = 700;
    let submitCooldownTimer = null;
    let draftSaveTimer = null;
    let draftSaveInFlight = null;

    function scheduleSubmitCooldown(submitBtn) {
      if (!submitBtn) return;
      submitBtn.disabled = true;
      clearTimeout(submitCooldownTimer);
      submitCooldownTimer = setTimeout(() => {
        if (global.HwWorksheet?.updateSubmitButtonState) {
          global.HwWorksheet.updateSubmitButtonState(form);
        } else {
          submitBtn.disabled = false;
        }
      }, SUBMIT_COOLDOWN_MS);
    }

    function showSavedStatus(synced) {
      if (!saveStatus) return;
      saveStatus.textContent = synced
        ? "Saved to your account."
        : "Saved locally — will sync when you're back online.";
    }

    function hasStoredAnswers(saved) {
      return Object.keys(saved || {}).some((key) => String(saved[key] ?? "").length > 0);
    }

    function collectBlankAnswers() {
      const data = {};
      inputs.forEach((inp) => {
        if (inp.name) data[inp.name] = inp.value;
      });
      return data;
    }

    function applyAnswersToForm(saved) {
      inputs.forEach((inp) => {
        if (inp.name && saved[inp.name] != null) inp.value = saved[inp.name];
      });
      if (global.HwWorksheet?.updateSubmitButtonState) {
        global.HwWorksheet.updateSubmitButtonState(form);
      }
      if (usesHubV4Layout()) renderHubV4Top(assignmentMeta, form);
    }

    async function saveDraftToServer(answers) {
      const payload = {
        username: session.username,
        assignmentId,
        answers,
      };
      const res = await fetch(
        "/api/homework-draft?username=" +
          encodeURIComponent(session.username) +
          "&assignmentId=" +
          encodeURIComponent(assignmentId),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Draft save failed.");
      }
    }

    function queueDraftSave(answers) {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(() => {
        void flushDraftSave(answers);
      }, DRAFT_SAVE_MS);
    }

    async function flushDraftSave(answers) {
      const data = answers || collectBlankAnswers();
      if (!hasStoredAnswers(data)) return;
      const work = saveDraftToServer(data)
        .then(() => {
          showSavedStatus(true);
        })
        .catch(() => {
          showSavedStatus(false);
        })
        .finally(() => {
          if (draftSaveInFlight === work) draftSaveInFlight = null;
        });
      draftSaveInFlight = work;
      return work;
    }

    async function clearDraftEverywhere() {
      clearTimeout(draftSaveTimer);
      if (draftSaveInFlight) {
        try {
          await draftSaveInFlight;
        } catch {
          /* ignore */
        }
      }
      try {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(storageTsKey);
      } catch (_) {}
      try {
        await fetch(
          "/api/homework-draft?username=" +
            encodeURIComponent(session.username) +
            "&assignmentId=" +
            encodeURIComponent(assignmentId),
          { method: "DELETE" }
        );
      } catch {
        /* ignore */
      }
    }

    async function hydrateDraftFromAccount() {
      let localSaved = {};
      let localTs = 0;
      try {
        localSaved = JSON.parse(localStorage.getItem(storageKey) || "{}");
        localTs = parseInt(localStorage.getItem(storageTsKey) || "0", 10) || 0;
      } catch (_) {}

      let serverAnswers = null;
      let serverTs = 0;
      try {
        const res = await fetch(
          "/api/homework-draft?username=" +
            encodeURIComponent(session.username) +
            "&assignmentId=" +
            encodeURIComponent(assignmentId),
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.draft?.answers) {
            serverAnswers = data.draft.answers;
            serverTs = data.draft.updatedAt ? Date.parse(data.draft.updatedAt) : 0;
          }
        }
      } catch {
        /* offline */
      }

      let merged = {};
      if (serverAnswers && hasStoredAnswers(serverAnswers)) {
        if (localTs > serverTs && hasStoredAnswers(localSaved)) {
          merged = localSaved;
          applyAnswersToForm(merged);
          queueDraftSave(merged);
          showSavedStatus(false);
        } else {
          merged = serverAnswers;
          applyAnswersToForm(merged);
          try {
            localStorage.setItem(storageKey, JSON.stringify(merged));
            if (serverTs) localStorage.setItem(storageTsKey, String(serverTs));
          } catch (_) {}
          showSavedStatus(true);
        }
      } else if (hasStoredAnswers(localSaved)) {
        merged = localSaved;
        applyAnswersToForm(merged);
        queueDraftSave(merged);
        showSavedStatus(false);
      }
    }

    void hydrateDraftFromAccount();

    form.addEventListener("input", () => {
      const data = collectBlankAnswers();
      const now = Date.now();
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
        localStorage.setItem(storageTsKey, String(now));
      } catch (_) {}
      queueDraftSave(data);
      showSavedStatus(false);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(draftSaveTimer);
        void flushDraftSave();
      }
    });

    window.addEventListener("pagehide", () => {
      clearTimeout(draftSaveTimer);
      const data = collectBlankAnswers();
      if (!hasStoredAnswers(data)) return;
      const payload = JSON.stringify({ username: session.username, assignmentId, answers: data });
      const url =
        "/api/homework-draft?username=" +
        encodeURIComponent(session.username) +
        "&assignmentId=" +
        encodeURIComponent(assignmentId);
      try {
        fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      } catch {
        void flushDraftSave(data);
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn?.disabled) return;

      if (global.HwWorksheet?.isWorksheetComplete && !global.HwWorksheet.isWorksheetComplete(form)) {
        if (saveStatus) {
          saveStatus.textContent = "Answer every question before submitting.";
        }
        showToast("Complete all questions first");
        return;
      }

      if (global.HwVideoInline?.prepareForSubmit) {
        if (saveStatus) saveStatus.textContent = "Checking video answers…";
        const videoReady = await global.HwVideoInline.prepareForSubmit(form);
        if (!videoReady.ok) {
          if (saveStatus) saveStatus.textContent = videoReady.message || "Save your video answers first.";
          showToast("Video required");
          return;
        }
      }

      const report = HwWorksheet.collectHomeworkAnswers(form);
      HwWorksheet.renderCheckResults(form);

      const payload = HwWorksheet.buildSubmitPayload(
        form,
        {
          username: session.username,
          displayName: session.displayName,
          assignmentId: assignmentId || assignmentMeta.id || form.getAttribute("data-assignment-id"),
          lessonName:
            submitMeta.lessonName ||
            assignmentMeta.lessonName ||
            assignmentMeta.title ||
            assignmentId,
          title: submitMeta.title || assignmentMeta.title,
          register: assignmentMeta.register,
        },
        report
      );

      if (global.HwFeatureFlags?.homeworkComments?.() && global.HwHomeworkComments?.getCommentsForSubmit) {
        const commentRows = global.HwHomeworkComments.getCommentsForSubmit();
        if (commentRows.length) payload.comments = commentRows;
      }

      if (!payload.assignmentId) {
        if (saveStatus) {
          saveStatus.textContent = "Worksheet id missing — refresh the page and try again.";
        }
        showToast("Submit failed");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const hasText =
        payload.section1?.length || payload.section2?.length || payload.listening?.length;
      const hasAnswers = payload.answers?.length;
      if (!hasText && !hasAnswers) {
        if (saveStatus) {
          saveStatus.textContent = "Fill in at least one answer before submitting.";
        }
        showToast("Nothing to submit");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      const confirmed = await confirmHomeworkSubmit();
      if (!confirmed) return;

      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch("/api/homework-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Submit failed.");
        }
        if (saveStatus) {
          saveStatus.textContent = data.message || "Homework sent! Please await JD's review.";
        }
        showToast("Sent to JD");
        try {
          localStorage.setItem(submittedKey, new Date().toISOString());
        } catch (_) {}
        await clearDraftEverywhere();
        if (global.HwFeatureFlags?.homeworkComments?.() && global.HwHomeworkComments?.clearDraftStorage) {
          await global.HwHomeworkComments.clearDraftStorage();
        }
        if (
          !ultraUnlimited &&
          global.HwFeatureFlags?.homeworkComments?.() &&
          global.HwHomeworkComments?.freezeAfterSubmit
        ) {
          global.HwHomeworkComments.freezeAfterSubmit();
        }
        invalidateStudentSubmissionsCache();
        scheduleStudentSubmissionsLoad({ bypassCache: true });
        if (global.HwWorksheet?.enableSeeAnswers) {
          HwWorksheet.enableSeeAnswers(form);
        }
        document.dispatchEvent(
          new CustomEvent("hw-platform-homework-submitted", {
            detail: { assignmentId, username: session.username },
          })
        );
        scheduleSubmitCooldown(submitBtn);
      } catch (err) {
        if (saveStatus) {
          saveStatus.textContent =
            (err && err.message) ||
            "Could not submit. Answers are still saved to your account.";
        }
        showToast("Submit failed");
        if (global.HwWorksheet?.updateSubmitButtonState) {
          global.HwWorksheet.updateSubmitButtonState(form);
        } else if (submitBtn) {
          submitBtn.disabled = false;
        }
      }
    });

    try {
      if (localStorage.getItem(submittedKey) && global.HwWorksheet?.enableSeeAnswers) {
        HwWorksheet.enableSeeAnswers(form);
      } else if (global.HwWorksheet?.disableSeeAnswers) {
        HwWorksheet.disableSeeAnswers(form);
      }
    } catch (_) {}
  }

  async function loadWorksheetPreview(catalogEntry) {
    const mount = document.getElementById("hw-worksheet-mount");
    const heading = document.getElementById("hw-worksheet-heading");
    const intro = document.getElementById("hw-worksheet-intro");
    if (!mount || !catalogEntry) return;

    let assignment;
    try {
      assignment = await fetchAssignmentJson(catalogEntry.id);
    } catch {
      if (intro) intro.textContent = "Could not load this worksheet.";
      mount.innerHTML = "";
      return;
    }

    if (heading) heading.textContent = "Preview — " + (catalogEntry.title || catalogEntry.id);
    if (intro) {
      intro.textContent =
        "Teacher preview (blank template). Download JSON or copy the student link — add the student username to catalog “students” so they can open it.";
    }

    const form = HwWorksheet.render(mount, assignment, { preview: true });
    bindWorksheetSave(form, assignment, { preview: true });
  }

  function syncV5HomeworkTitle(listLabel) {
    if (!global.__JLM_HUB_V5 || !listLabel) return;
    const mount = document.getElementById("hw-v2-worksheet-mount");
    if (mount?.querySelector("#hw-worksheet-form")) return;
    const titleEl = document.getElementById("hw-v2-title");
    if (titleEl) titleEl.textContent = listLabel;
  }

  function bindCurrentAssignmentPills(active) {
    const pillOnline = document.getElementById("hw-pill-online");
    const pillsWrap = document.getElementById("hw-current-assignment-pills");

    if (!active) {
      if (pillsWrap) pillsWrap.hidden = true;
      return;
    }

    if (usesHubV4Layout() && !global.__JLM_HUB_V5) {
      if (pillsWrap) pillsWrap.hidden = true;
      return;
    }

    if (pillsWrap) pillsWrap.hidden = false;
    if (pillOnline) {
      pillOnline.hidden = false;
      pillOnline.href = "#hw-v2-worksheet-mount";
      pillOnline.textContent = "Start Homework";
      pillOnline.onclick = (e) => {
        e.preventDefault();
        const targetHash = "hw-" + active.id;
        if (window.location.hash !== "#" + targetHash) {
          window.location.hash = targetHash;
        }
        document
          .getElementById("hw-v2-worksheet-mount")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    }
  }

  function renderCurrentAssignmentCard(assignments, currentId) {
    const titleEl = document.getElementById("hw-current-assignment-title");
    const pillOnline = document.getElementById("hw-pill-online");
    if (!titleEl) return;

    const active = assignments.find((a) => a.id === currentId) || assignments[0] || null;
    if (!active) {
      titleEl.textContent = "No assignment linked to your account yet.";
      if (pillOnline) pillOnline.hidden = true;
      bindCurrentAssignmentPills(null);
      return;
    }

    const label = studentViewMeta(active, null).listLabel;
    titleEl.textContent = label;
    syncV5HomeworkTitle(label);
    bindCurrentAssignmentPills(active);
  }

  function setLessonLinks(assignment, catalog) {
    const lessonBtn = document.getElementById("hw-latest-lesson");
    const lessonPlaylist = document.getElementById("hw-lesson-playlist");
    const lessonMeta = document.getElementById("hw-lesson-meta");
    const media = getStudentMedia(catalog);
    const lessonUrl = media.latestLessonUrl || assignment?.youtubeUrl;

    if (lessonBtn) {
      if (isYoutubeReady(lessonUrl)) {
        lessonBtn.href = lessonUrl;
        lessonBtn.textContent = "Watch your latest lesson";
        lessonBtn.removeAttribute("data-placeholder");
        lessonBtn.classList.remove("btn--ghost");
        lessonBtn.classList.add("btn--primary");
      } else {
        lessonBtn.removeAttribute("href");
        lessonBtn.textContent = "Watch lesson (YouTube link coming soon)";
        lessonBtn.classList.add("btn--ghost");
        lessonBtn.classList.remove("btn--primary");
      }
    }

    if (lessonPlaylist) {
      const playlistUrl = media.lessonPlaylistUrl;
      if (isYoutubeReady(playlistUrl)) {
        lessonPlaylist.href = playlistUrl;
        lessonPlaylist.hidden = false;
      } else {
        lessonPlaylist.hidden = true;
      }
    }

    if (lessonMeta) {
      const catalogEntry = assignment || {};
      lessonMeta.textContent = studentViewMeta(catalogEntry, assignment).lessonMeta;
    }
  }

  function renderLibraryList(entries, query, activeId) {
    const list = document.getElementById("hw-library-list");
    const meta = document.getElementById("hw-library-meta");
    if (!list) return;

    const q = String(query || "")
      .trim()
      .toLowerCase();
    const filtered = entries.filter((e) => !q || librarySearchText(e).includes(q));
    filtered.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    list.innerHTML = "";
    if (meta) {
      meta.textContent =
        filtered.length +
        " worksheet" +
        (filtered.length === 1 ? "" : "s") +
        (q ? ' matching “' + query.trim() + "”" : "") +
        (entries.length !== filtered.length ? " of " + entries.length : "");
    }

    if (!filtered.length) {
      list.innerHTML =
        '<li class="hw-library-item hw-library-item--empty"><p>No worksheets match. Try tags like <em>たい</em>, <em>negative</em>, or a lesson title.</p></li>';
      return;
    }

    filtered.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "hw-library-item" + (entry.id === activeId ? " hw-library-item--active" : "");

      const main = document.createElement("div");
      main.className = "hw-library-item__main";

      const title = document.createElement("h3");
      title.className = "hw-library-item__title";
      title.textContent = entry.title || entry.id;

      const sub = document.createElement("p");
      sub.className = "hw-library-item__sub";
      sub.textContent = [entry.lessonName || entry.title, (entry.students || []).join(", ")]
        .filter(Boolean)
        .join(" · ");

      if (entry.summary) {
        const sum = document.createElement("p");
        sum.className = "hw-library-item__summary";
        sum.textContent = entry.summary;
        main.append(title, sub, sum);
      } else {
        main.append(title, sub);
      }

      if (entry.tags && entry.tags.length) {
        const tags = document.createElement("div");
        tags.className = "hw-library-tags";
        entry.tags.forEach((tag) => {
          const pill = document.createElement("span");
          pill.className = "hw-library-tag";
          pill.textContent = tag;
          tags.appendChild(pill);
        });
        main.appendChild(tags);
      }

      const actions = document.createElement("div");
      actions.className = "hw-library-item__actions";

      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.className = "btn btn--primary btn--sm";
      previewBtn.textContent = entry.id === activeId ? "Previewing" : "Preview";
      if (entry.id === activeId) previewBtn.disabled = true;
      previewBtn.addEventListener("click", () => {
        window.location.hash = "hw-" + entry.id;
        loadTeacherHub();
      });

      const dl = document.createElement("a");
      dl.className = "btn btn--ghost btn--sm";
      dl.href = assignmentFileUrl(entry.id);
      dl.download = entry.id + ".json";
      dl.textContent = "Download";

      const copyJson = document.createElement("button");
      copyJson.type = "button";
      copyJson.className = "btn btn--ghost btn--sm";
      copyJson.textContent = "Copy JSON URL";
      copyJson.addEventListener("click", () => {
        copyText(assignmentFileUrl(entry.id), "JSON file URL copied");
      });

      const copyStudent = document.createElement("button");
      copyStudent.type = "button";
      copyStudent.className = "btn btn--ghost btn--sm";
      copyStudent.textContent = "Copy student link";
      copyStudent.addEventListener("click", () => {
        const students = (entry.students || []).join(", ") || "(add students in catalog)";
        copyText(
          studentWorksheetUrl(entry.id),
          "Student link copied — allowed: " + students
        );
      });

      const editMaker = document.createElement("button");
      editMaker.type = "button";
      editMaker.className = "btn btn--ghost btn--sm";
      editMaker.textContent = "Open in editor";
      editMaker.addEventListener("click", () => {
        openInTeacherEditor(entry.id);
      });

      actions.append(previewBtn, dl, copyJson, copyStudent, editMaker);
      li.append(main, actions);
      list.appendChild(li);
    });
  }

  function bindPhotoUpload(activeAssignment) {
    const form = document.getElementById("hw-photo-upload-form");
    const fileInput = document.getElementById("hw-photo-file");
    const status = document.getElementById("hw-photo-upload-status");
    const captureWrap = document.getElementById("hw-photo-capture");
    const captureBtn = document.getElementById("hw-photo-capture-btn");
    const cancelBtn = document.getElementById("hw-photo-cancel-camera");
    const livePanel = document.getElementById("hw-photo-capture-live");
    const previewPanel = document.getElementById("hw-photo-capture-preview");
    const videoEl = document.getElementById("hw-photo-capture-video");
    const previewImg = document.getElementById("hw-photo-capture-img");
    if (!form) return;

    placePhotoUploadShell();
    form.hidden = !activeAssignment;
    setOfflineToolsVisible(Boolean(activeAssignment));
    form.dataset.assignmentId = activeAssignment?.id || "printed-homework";
    const photoMeta = activeAssignment
      ? studentViewMeta(null, activeAssignment)
      : { lessonName: "Printed homework" };
    form.dataset.lessonName = photoMeta.lessonName;
    if (form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    let cameraStream = null;
    let capturedBlob = null;
    let previewObjectUrl = "";
    let uploading = false;

    function worksheetPhotoButtons() {
      return {
        take: document.querySelector("[data-hw-photo-take]"),
        choose: document.querySelector("[data-hw-photo-choose]"),
      };
    }

    function setStatus(message) {
      if (status) status.textContent = message || "";
    }

    function setPhotoButtonsDisabled(disabled) {
      const { take, choose } = worksheetPhotoButtons();
      if (take) take.disabled = disabled;
      if (choose) choose.disabled = disabled;
    }

    function stopCamera() {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
      }
      if (videoEl) videoEl.srcObject = null;
    }

    function clearCapture() {
      capturedBlob = null;
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
      }
      if (previewImg) previewImg.removeAttribute("src");
    }

    function hideCaptureUi() {
      stopCamera();
      captureWrap?.setAttribute("hidden", "");
      livePanel?.setAttribute("hidden", "");
      previewPanel?.setAttribute("hidden", "");
    }

    function showCaptureLive() {
      captureWrap?.removeAttribute("hidden");
      livePanel?.removeAttribute("hidden");
      previewPanel?.setAttribute("hidden", "");
    }

    function showCapturePreview() {
      stopCamera();
      captureWrap?.removeAttribute("hidden");
      livePanel?.setAttribute("hidden", "");
      previewPanel?.removeAttribute("hidden");
    }

    function resetCaptureUi() {
      clearCapture();
      hideCaptureUi();
    }

    function resolvePhotoFile() {
      const picked = fileInput?.files?.[0];
      if (picked) return picked;
      if (!capturedBlob) return null;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return new File([capturedBlob], `homework-camera-${stamp}.jpg`, {
        type: capturedBlob.type || "image/jpeg",
      });
    }

    async function uploadPhoto(file) {
      if (!file || uploading) return;
      uploading = true;
      setPhotoButtonsDisabled(true);
      stopCamera();
      setStatus("Uploading photo…");

      const body = new FormData();
      body.append("photo", file);
      body.append("username", session.username || "");
      body.append("displayName", session.displayName || session.username || "");
      body.append("assignmentId", form.dataset.assignmentId || "printed-homework");
      body.append("lessonName", form.dataset.lessonName || "Printed homework");

      try {
        const res = await fetch("/api/homework-photo-upload", {
          method: "POST",
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        setStatus(data.message || "Photo uploaded.");
        showToast("Photo uploaded");
        form.reset();
        resetCaptureUi();
      } catch (err) {
        setStatus((err && err.message) || "Upload failed.");
        showToast("Photo upload failed");
      } finally {
        uploading = false;
        setPhotoButtonsDisabled(false);
      }
    }

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Camera is not supported here — use Choose file instead.");
        return;
      }
      clearCapture();
      if (fileInput) fileInput.value = "";
      setStatus("");

      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (videoEl) {
          videoEl.srcObject = cameraStream;
          await videoEl.play();
        }
        showCaptureLive();
      } catch (err) {
        stopCamera();
        hideCaptureUi();
        const name = err && err.name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setStatus("Camera access was blocked. Allow camera permission or use Choose file.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setStatus("No camera found — use Choose file instead.");
        } else {
          setStatus("Could not start camera. Use Choose file instead.");
        }
      }
    }

    function capturePhoto() {
      if (!videoEl || !cameraStream) return;
      const width = videoEl.videoWidth;
      const height = videoEl.videoHeight;
      if (!width || !height) {
        setStatus("Camera is still loading — wait a moment and try again.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setStatus("Could not capture photo. Use Choose file instead.");
        return;
      }
      ctx.drawImage(videoEl, 0, 0, width, height);
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setStatus("Could not capture photo. Try again.");
            return;
          }
          clearCapture();
          capturedBlob = blob;
          previewObjectUrl = URL.createObjectURL(blob);
          if (previewImg) previewImg.src = previewObjectUrl;
          showCapturePreview();
          await uploadPhoto(resolvePhotoFile());
        },
        "image/jpeg",
        0.9
      );
    }

    document.addEventListener("click", (e) => {
      if (e.target.closest("[data-hw-photo-take]")) {
        e.preventDefault();
        openCamera();
      }
      if (e.target.closest("[data-hw-photo-choose]")) {
        e.preventDefault();
        fileInput?.click();
      }
    });

    captureBtn?.addEventListener("click", () => {
      capturePhoto();
    });

    cancelBtn?.addEventListener("click", () => {
      resetCaptureUi();
      setStatus("");
    });

    fileInput?.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      resetCaptureUi();
      setStatus("");
      await uploadPhoto(file);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopCamera();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
    });
  }

  function bindVideoUpload(activeAssignment) {
    const form = document.getElementById("hw-video-upload-form");
    const fileInput = document.getElementById("hw-video-file");
    const status = document.getElementById("hw-video-upload-status");
    const startBtn = document.getElementById("hw-video-start-recording");
    const stopBtn = document.getElementById("hw-video-stop-recording");
    const cancelBtn = document.getElementById("hw-video-cancel-recording");
    const retakeBtn = document.getElementById("hw-video-retake");
    const idlePanel = document.getElementById("hw-video-capture-idle");
    const livePanel = document.getElementById("hw-video-capture-live");
    const previewPanel = document.getElementById("hw-video-capture-preview");
    const liveVideo = document.getElementById("hw-video-capture-preview-live");
    const playbackVideo = document.getElementById("hw-video-capture-playback");
    const timerEl = document.getElementById("hw-video-recording-timer");
    if (!form) return;

    const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
    const MAX_VIDEO_MS = 3 * 60 * 1000;

    form.dataset.assignmentId = activeAssignment?.id || "video-homework";
    const videoMeta = activeAssignment
      ? studentViewMeta(null, activeAssignment)
      : { lessonName: "Video homework" };
    form.dataset.lessonName = videoMeta.lessonName;
    if (form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    let mediaStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordedBlob = null;
    let recordedMimeType = "video/webm";
    let previewObjectUrl = "";
    let recordStartedAt = 0;
    let recordTimerId = null;

    function setStatus(message) {
      if (status) status.textContent = message || "";
    }

    function pickRecorderMimeType() {
      if (global.HwCompat?.pickRecorderMimeType) {
        return global.HwCompat.pickRecorderMimeType();
      }
      if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
      const types = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    }

    function extensionForMime(mimeType) {
      if (mimeType.includes("mp4")) return "mp4";
      return "webm";
    }

    function formatTimer(ms) {
      const totalSec = Math.floor(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return min + ":" + String(sec).padStart(2, "0");
    }

    function stopTimer() {
      if (recordTimerId) {
        clearInterval(recordTimerId);
        recordTimerId = null;
      }
    }

    function stopStream() {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
      if (liveVideo) liveVideo.srcObject = null;
    }

    function clearRecording() {
      recordedBlob = null;
      recordedChunks = [];
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
      }
      if (playbackVideo) {
        playbackVideo.removeAttribute("src");
        playbackVideo.load();
      }
    }

    function showIdle() {
      stopStream();
      stopTimer();
      mediaRecorder = null;
      idlePanel?.removeAttribute("hidden");
      livePanel?.setAttribute("hidden", "");
      previewPanel?.setAttribute("hidden", "");
      if (timerEl) timerEl.textContent = "0:00";
    }

    function showLive() {
      idlePanel?.setAttribute("hidden", "");
      livePanel?.removeAttribute("hidden");
      previewPanel?.setAttribute("hidden", "");
    }

    function showPreview() {
      stopStream();
      stopTimer();
      idlePanel?.setAttribute("hidden", "");
      livePanel?.setAttribute("hidden", "");
      previewPanel?.removeAttribute("hidden");
    }

    function resetUi() {
      clearRecording();
      showIdle();
    }

    function resolveVideoFile() {
      const picked = fileInput?.files?.[0];
      if (picked) return picked;
      if (!recordedBlob) return null;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = extensionForMime(recordedMimeType);
      return new File([recordedBlob], `homework-video-${stamp}.${ext}`, {
        type: recordedMimeType,
      });
    }

    function finishRecording() {
      if (!recordedChunks.length) {
        setStatus("No video was recorded. Try again.");
        resetUi();
        return;
      }
      recordedBlob = new Blob(recordedChunks, { type: recordedMimeType });
      if (recordedBlob.size > MAX_VIDEO_BYTES) {
        setStatus("Recording is too large (max 24 MB). Record a shorter clip.");
        resetUi();
        return;
      }
      previewObjectUrl = URL.createObjectURL(recordedBlob);
      if (playbackVideo) playbackVideo.src = previewObjectUrl;
      showPreview();
      setStatus("Video ready — tap Upload video when you're happy with it.");
    }

    async function startRecording() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Video recording is not supported in this browser.");
        return;
      }
      if (typeof MediaRecorder === "undefined") {
        setStatus("Video recording is not supported in this browser. Upload a file instead.");
        return;
      }

      clearRecording();
      if (fileInput) fileInput.value = "";
      setStatus("");

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        });
        if (liveVideo) {
          liveVideo.srcObject = mediaStream;
          await liveVideo.play();
        }

        recordedMimeType = pickRecorderMimeType() || "video/webm";
        try {
          mediaRecorder = new MediaRecorder(mediaStream, {
            mimeType: recordedMimeType,
            videoBitsPerSecond: 900000,
            audioBitsPerSecond: 96000,
          });
        } catch {
          try {
            mediaRecorder = new MediaRecorder(mediaStream, { mimeType: recordedMimeType });
          } catch {
            mediaRecorder = new MediaRecorder(mediaStream);
          }
        }
        recordedMimeType = mediaRecorder.mimeType || recordedMimeType;
        recordedChunks = [];
        mediaRecorder.addEventListener("dataavailable", (event) => {
          if (event.data && event.data.size > 0) recordedChunks.push(event.data);
        });
        mediaRecorder.addEventListener("stop", finishRecording);
        mediaRecorder.start(1000);
        recordStartedAt = Date.now();
        if (timerEl) timerEl.textContent = "0:00";
        recordTimerId = setInterval(() => {
          const elapsed = Date.now() - recordStartedAt;
          if (timerEl) timerEl.textContent = formatTimer(elapsed);
          if (elapsed >= MAX_VIDEO_MS) stopRecording();
        }, 500);
        showLive();
      } catch (err) {
        resetUi();
        const name = err && err.name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setStatus("Camera/mic access was blocked. Allow permission and try again.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setStatus("No camera or microphone found on this device.");
        } else {
          setStatus("Could not start recording. Try uploading a video file instead.");
        }
      }
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      } else {
        finishRecording();
      }
      stopStream();
      stopTimer();
    }

    startBtn?.addEventListener("click", () => {
      startRecording();
    });

    stopBtn?.addEventListener("click", () => {
      stopRecording();
    });

    cancelBtn?.addEventListener("click", () => {
      recordedChunks = [];
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.onstop = null;
        try {
          mediaRecorder.stop();
        } catch {
          /* ignore */
        }
      }
      resetUi();
      setStatus("");
    });

    retakeBtn?.addEventListener("click", () => {
      clearRecording();
      startRecording();
    });

    fileInput?.addEventListener("change", () => {
      if (fileInput.files?.[0]) {
        resetUi();
        setStatus("");
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && mediaRecorder && mediaRecorder.state === "recording") {
        stopRecording();
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = resolveVideoFile();
      if (!file) {
        setStatus("Choose a video file or record one first.");
        return;
      }
      if (file.size > MAX_VIDEO_BYTES) {
        setStatus("Video must be under 24 MB.");
        return;
      }

      const submitBtn = document.getElementById("hw-video-upload-submit");
      if (submitBtn) submitBtn.disabled = true;
      stopRecording();
      setStatus("Uploading video…");

      const body = new FormData();
      body.append("video", file);
      body.append("username", session.username || "");
      body.append("displayName", session.displayName || session.username || "");
      body.append("assignmentId", form.dataset.assignmentId || "video-homework");
      body.append("lessonName", form.dataset.lessonName || "Video homework");

      try {
        const res = await fetch("/api/homework-video-upload", {
          method: "POST",
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        setStatus(data.message || "Video uploaded.");
        showToast("Video uploaded");
        form.reset();
        resetUi();
      } catch (err) {
        setStatus((err && err.message) || "Upload failed.");
        showToast("Video upload failed");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function copyText(text, toastMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast(toastMsg),
        () => fallbackCopy(text, toastMsg)
      );
    } else {
      fallbackCopy(text, toastMsg);
    }
  }

  function fallbackCopy(text, toastMsg) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast(toastMsg);
    } catch {
      showToast("Could not copy — select and copy manually.");
    }
    document.body.removeChild(ta);
  }

  let catalogCache = null;
  let catalogCacheScope = null;
  let librarySearchBound = false;

  function getCatalogEntry(id) {
    return (catalogCache?.assignments || []).find((e) => e.id === id) || null;
  }

  function initTeacherEditor() {
    if (!global.HwTeacherEditor) return;
    const mount = document.getElementById("hw-teacher-maker-mount");
    if (!mount) return;
    if (mount.querySelector(".hw-builder") || mount.dataset.builderReady === "true") return;
    HwTeacherEditor.init({
      showToast,
      fetchAssignmentJson: (id) => fetchAssignmentJson(id, { bypassCache: true }),
      fetchCatalog,
      getCatalogEntry,
      getTeacherSession: () => getTeacherSessionForApi(),
      getStudentAccounts: function () {
        if (global.HwStudentList?.getStudentsSync) {
          return global.HwStudentList.getStudentsSync();
        }
        if (global.HwAuth && typeof global.HwAuth.listStudentAccounts === "function") {
          return global.HwAuth.listStudentAccounts();
        }
        return [];
      },
      isStudentAccount: function (username) {
        const key = String(username || "").trim().toLowerCase();
        if (global.HwStudentList?.isKnownStudent?.(key)) return true;
        if (global.HwAuth && typeof global.HwAuth.isStudentAccount === "function") {
          return global.HwAuth.isStudentAccount(username);
        }
        return ["joshs", "benm", "deme", "ivan", "benc", "noplan"].includes(key);
      },
      onWorksheetSaved: async function () {
        invalidateCatalogCaches();
        try {
          catalogCache = await fetchCatalog({ bypassCache: true });
          HwTeacherEditor.refreshCatalog(
            catalogCache.assignments || [],
            catalogCache.studentProfiles || {},
            catalogCache.students || []
          );
        } catch {
          /* ignore */
        }
      },
      onWorksheetDeleted: async function () {
        invalidateCatalogCaches();
        try {
          catalogCache = await fetchCatalog({ bypassCache: true });
          HwTeacherEditor.refreshCatalog(
            catalogCache.assignments || [],
            catalogCache.studentProfiles || {},
            catalogCache.students || []
          );
        } catch {
          /* ignore */
        }
      },
      onPublished: async function (id, studentUsername) {
        invalidateCatalogCaches();
        invalidateAssignmentCache(id);
        try {
          catalogCache = await fetchCatalog({ bypassCache: true });
          HwTeacherEditor.refreshCatalog(
            catalogCache.assignments || [],
            catalogCache.studentProfiles || {},
            catalogCache.students || []
          );
          if (id) {
            const publishSelect = document.getElementById("hw-teacher-publish-worksheet");
            if (publishSelect) publishSelect.value = id;
          }
          if (studentUsername && id) {
            const entry = (catalogCache.assignments || []).find((e) => e.id === id);
            const assigned = (entry?.students || []).includes(studentUsername);
            if (!assigned) {
              showToast("Publish may not have linked — try sending again");
            }
          }
        } catch {
          /* ignore */
        }
        showToast("Student can refresh their hub to see changes");
      },
    });
  }

  async function openInTeacherEditor(id) {
    if (
      document.body.classList.contains("hw-hub-v6-primary") &&
      global.HwHubV6?.activateTab
    ) {
      global.HwHubV6.activateTab("maker");
    } else {
      document.getElementById("hw-teacher-tab-maker")?.click();
    }
    const makerPanel = document.getElementById("hw-teacher-maker");
    if (makerPanel) makerPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const assignment = await fetchAssignmentJson(id);
      HwTeacherEditor.loadAssignment(assignment, getCatalogEntry(id));
      showToast("Loaded " + id);
    } catch {
      showToast("Could not load worksheet");
    }
  }

  function initHubVersionPicker() {
    const buttons = document.querySelectorAll("[data-hub-version]");
    const iframe = document.getElementById("hw-hub-version-iframe");
    const openLink = document.getElementById("hw-hub-version-open");
    const studentActions = document.getElementById("hw-hub-version-student-actions");
    const embed = document.getElementById("hw-teacher-hubv2-embed");
    const toolbarPanel = document.getElementById("hw-toolbar-playtest-panel");
    const v1Note = document.getElementById("hw-hub-v1-classic-note");
    const titleEl = document.getElementById("hw-hub-preview-title");
    const descEl = document.getElementById("hw-hub-preview-desc");
    if (!buttons.length || !iframe) return;

    const hubV6On = global.HwFeatureFlags?.hubV6?.() === true;
    if (hubV6On) document.body.classList.add("hw-hub-v6-enabled");
    document.getElementById("hw-hub-version-tab-v6")?.setAttribute("hidden", "");

    const paths = {
      "2": "/homework/hub-v2-preview.html",
      "3": "/homework/hub-v3-preview.html",
      "4": "/homework/hub-v4-preview.html",
      "5": "/homework/hub-v5-preview.html",
    };

    const resetBtn = document.getElementById("hw-hubv2-reset-onboard");

    function setVersion(version) {
      const isV1 = version === "1";
      const isToolbar = version === "toolbar";
      const toolbarFullPath =
        document.getElementById("hw-toolbar-playtest-iframe")?.dataset?.src ||
        "/homework/hub-v5-preview.html?toolbar=1&status=in_progress&account=hw_basic&assignment=sheet-u1vevjge&av=20260773";
      const path = isToolbar
        ? toolbarFullPath
        : paths[version] || (isV1 ? "" : paths["3"]);

      try {
        localStorage.setItem("jlm-hw-teacher-hub-version", version);
      } catch {
        /* ignore */
      }

      document.body.classList.toggle("hw-hub-v1-classic", isV1);

      if (embed) embed.hidden = isV1 || isToolbar;
      if (toolbarPanel) toolbarPanel.hidden = !isToolbar;
      if (v1Note) v1Note.hidden = !isV1;
      if (resetBtn) resetBtn.hidden = isV1 || isToolbar || version === "4" || version === "5";
      /* Full-page link for student mocks + toolbar; classic v1 lives in this page. */
      if (studentActions) studentActions.hidden = isV1;

      if (titleEl) {
        titleEl.textContent = isToolbar
          ? "Toolbar playtest"
          : isV1
            ? "Hub v1 · Classic teacher layout"
            : "Hub prototypes";
      }
      if (descEl) {
        descEl.textContent = isToolbar
          ? "Visual tool chrome over student hub (〜時、〜の時 current HW). Buttons not wired yet."
          : isV1
            ? "Classic teacher tab strip and panels (jic fallback). Switch to Hub v2–v5 or Toolbar for student mocks."
            : "Hub v1 is the classic teacher layout. v2–v5 are student hub mocks. Toolbar is a tool-chrome sandbox.";
      }

      if (openLink) {
        if (isV1) {
          openLink.removeAttribute("href");
          openLink.setAttribute("aria-disabled", "true");
        } else {
          openLink.href = path;
          openLink.textContent = "Open full page";
          openLink.target = "_blank";
          openLink.rel = "noopener noreferrer";
          openLink.removeAttribute("aria-disabled");
        }
      }

      if (isV1) {
        if (document.body.classList.contains("hw-hub-v6-primary") && global.HwHubV6) {
          global.HwHubV6.releaseMounts?.();
          global.HwHubV6.activateTab?.("hubpreview");
        }
        if (teacherTabApi?.activate) teacherTabApi.activate("maker");
        else document.getElementById("hw-teacher-tab-maker")?.click();
      } else {
        document
          .querySelectorAll(
            "#hw-teacher-classic > .hw-teacher-panel:not(.hw-hub-v6-mounted-panel)"
          )
          .forEach((p) => {
            p.hidden = true;
          });
        if (isToolbar) {
          const tbIframe = document.getElementById("hw-toolbar-playtest-iframe");
          if (tbIframe?.dataset?.src) {
            /* Always sync src so assignment/query changes apply on revisit. */
            tbIframe.src = tbIframe.dataset.src;
          }
        } else {
          iframe.title = "Homework Hub v" + version + " prototype";
          iframe.dataset.pendingSrc = path;
          const hubv2Panel = document.getElementById("hw-teacher-hubv2");
          const hubv2Visible =
            hubv2Panel &&
            (!hubv2Panel.hidden ||
              hubv2Panel.classList.contains("hw-hub-v6-mounted-panel"));
          if (hubv2Visible) {
            iframe.src = path;
            delete iframe.dataset.pendingSrc;
          } else if (iframe.getAttribute("src")) {
            iframe.removeAttribute("src");
          }
        }
      }

      buttons.forEach((btn) => {
        const on = btn.getAttribute("data-hub-version") === version;
        btn.classList.toggle("btn--primary", on);
        btn.classList.toggle("btn--ghost", !on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    let saved = "3";
    try {
      saved = localStorage.getItem("jlm-hw-teacher-hub-version") || "3";
    } catch {
      /* ignore */
    }
    /* Hub v6 moved to primary Teacher Hub — migrate old preview chip. */
    if (saved === "6") saved = "3";
    if (saved !== "1" && saved !== "toolbar" && !paths[saved]) saved = "3";
    setVersion(saved);

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const version = btn.getAttribute("data-hub-version");
        if (version) setVersion(version);
      });
    });
  }

  let teacherTabApi = null;

  function initTeacherTabs() {
    const tablist = document.querySelector(".hw-teacher-tabs");
    if (!tablist) return teacherTabApi;
    if (tablist.dataset.bound === "true") return teacherTabApi;
    tablist.dataset.bound = "true";

    const tabs = tablist.querySelectorAll("[data-teacher-tab]");
    const panels = {
      account: document.getElementById("hw-teacher-account"),
      maker: document.getElementById("hw-teacher-maker"),
      library: document.getElementById("hw-teacher-library"),
      ideas: document.getElementById("hw-teacher-ideas"),
      submissions: document.getElementById("hw-teacher-submissions"),
      mistakes: document.getElementById("hw-teacher-mistakes"),
      promo: document.getElementById("hw-teacher-promo"),
      birthdays: document.getElementById("hw-teacher-birthdays"),
      harris: document.getElementById("hw-teacher-harris"),
      jem: document.getElementById("hw-teacher-jem"),
      gamelab: document.getElementById("hw-teacher-gamelab"),
      "lookup-lexicon": document.getElementById("hw-teacher-lookup-lexicon"),
      hubv2: document.getElementById("hw-teacher-hubv2"),
    };

    function activate(name) {
      tabs.forEach((tab) => {
        const on = tab.getAttribute("data-teacher-tab") === name;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
      });
      Object.keys(panels).forEach((key) => {
        const panel = panels[key];
        if (!panel) return;
        /* Keep panels mounted into Hub v6 visible regardless of classic tab. */
        if (panel.classList.contains("hw-hub-v6-mounted-panel")) {
          panel.hidden = false;
          return;
        }
        panel.hidden = key !== name;
      });
      try {
        localStorage.setItem("jlm-hw-teacher-tab", name);
      } catch {
        /* ignore */
      }
      if (name === "ideas" && global.HwTeacherIdeas?.reloadIfNeeded) {
        HwTeacherIdeas.reloadIfNeeded();
      }
      if (name === "mistakes" && global.HwTeacherMistakes?.reloadIfNeeded) {
        HwTeacherMistakes.reloadIfNeeded();
      }
      if (name === "gamelab" && global.HwTeacherLanternWords?.reloadIfNeeded) {
        HwTeacherLanternWords.reloadIfNeeded();
      }
      if (name === "lookup-lexicon" && global.HwTeacherLookupLexicon?.reloadIfNeeded) {
        HwTeacherLookupLexicon.reloadIfNeeded();
      } else if (global.HwTeacherLookupLexicon?.unmountMagnifier) {
        HwTeacherLookupLexicon.unmountMagnifier();
      }
      if (name === "account" && global.HwTeacherEditor?.syncPublishPicker) {
        global.HwTeacherEditor.syncPublishPicker();
      }
      if (name === "hubv2") {
        const iframe = document.getElementById("hw-hub-version-iframe");
        if (iframe?.dataset?.pendingSrc) {
          iframe.src = iframe.dataset.pendingSrc;
          delete iframe.dataset.pendingSrc;
        }
      }
      try {
        document.dispatchEvent(
          new CustomEvent("hw-teacher-tab-change", { detail: { tab: name } })
        );
      } catch {
        /* ignore */
      }
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        activate(tab.getAttribute("data-teacher-tab") || "account");
      });
    });

    let initial = "maker";
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      const v6Full =
        params.get("v6full") === "1" || params.get("v6full") === "true";
      if (v6Full && global.HwFeatureFlags?.hubV6?.() === true) {
        document.body.classList.add("hw-hub-v6-fullpage", "hw-hub-v6-enabled");
      }
      if (tabParam === "mistakes" || tabParam === "maker" || tabParam === "account" || tabParam === "library" || tabParam === "ideas" || tabParam === "submissions" || tabParam === "promo" || tabParam === "birthdays" || tabParam === "harris" || tabParam === "jem" || tabParam === "gamelab" || tabParam === "lookup-lexicon" || tabParam === "hubv2" || tabParam === "hubv6" || tabParam === "hubpreview") {
        initial = tabParam === "hubv6" || tabParam === "hubpreview" ? "hubv2" : tabParam;
      } else {
      const saved = localStorage.getItem("jlm-hw-teacher-tab");
      if (saved === "homework") {
        initial = "account";
      } else if (saved === "hubv6") {
        initial = "hubv2";
      } else if (
        saved === "maker" ||
        saved === "account" ||
        saved === "library" ||
        saved === "ideas" ||
        saved === "submissions" ||
        saved === "mistakes" ||
        saved === "promo" ||
        saved === "birthdays" ||
        saved === "harris" ||
        saved === "jem" ||
        saved === "gamelab" ||
        saved === "lookup-lexicon" ||
        saved === "hubv2"
      ) {
        initial = saved;
      }
      }
    } catch {
      /* ignore */
    }
    document.getElementById("hw-harris-copy-link")?.addEventListener("click", async () => {
      const url = new URL("/preview/harris-notarization/", window.location.origin).href;
      try {
        await navigator.clipboard.writeText(url);
        showToast("Preview link copied.");
      } catch {
        showToast("Could not copy link.");
      }
    });

    document.getElementById("hw-jem-copy-link")?.addEventListener("click", async () => {
      const url = new URL("/preview/jem-appraisals/", window.location.origin).href;
      try {
        await navigator.clipboard.writeText(url);
        showToast("Preview link copied.");
      } catch {
        showToast("Could not copy link.");
      }
    });

    document.getElementById("hw-hubv2-reset-onboard")?.addEventListener("click", () => {
      let version = "3";
      try {
        version = localStorage.getItem("jlm-hw-teacher-hub-version") || "3";
      } catch {
        /* ignore */
      }
      const keys = {
        "2": "jlm-hw-v2-onboarding-done",
        "3": "jlm-hw-v3-onboarding-done",
      };
      const key = keys[version] || keys["3"];
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      const iframe = document.getElementById("hw-hub-version-iframe");
      if (iframe?.src) iframe.src = iframe.src;
      showToast("Onboarding reset — preview reloaded.");
    });

    initHubVersionPicker();

    teacherTabApi = { activate, initial };
    return teacherTabApi;
  }

  let teacherReviewSubmission = null;
  let teacherReviewBusy = false;
  let teacherReviewDraftBusy = false;
  let teacherReviewDraftTimer = null;
  let teacherReviewHasUnsaved = false;
  const TEACHER_REVIEW_DRAFT_MS = 1500;

  function setTeacherReviewStatus(msg, isError, state) {
    const el = document.getElementById("hw-teacher-review-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("is-error", Boolean(isError));
    el.classList.toggle("is-saving", state === "is-saving");
    el.classList.toggle("is-saved", state === "is-saved");
    el.classList.toggle("is-dirty", state === "is-dirty");
  }

  function clearTeacherReviewDraftTimer() {
    if (teacherReviewDraftTimer) {
      clearTimeout(teacherReviewDraftTimer);
      teacherReviewDraftTimer = null;
    }
  }

  function scheduleTeacherReviewDraftSave() {
    if (!teacherReviewSubmission || teacherReviewBusy) return;
    teacherReviewHasUnsaved = true;
    setTeacherReviewStatus("Unsaved changes — saving draft…", false, "is-dirty");
    clearTeacherReviewDraftTimer();
    teacherReviewDraftTimer = setTimeout(() => {
      void saveTeacherReviewDraft();
    }, TEACHER_REVIEW_DRAFT_MS);
  }

  async function saveTeacherReviewDraft() {
    if (teacherReviewDraftBusy || teacherReviewBusy || !teacherReviewSubmission) return;
    const session = getTeacherSessionForApi();
    if (!session) return;

    const comments =
      global.HwHomeworkComments?.getCommentsForReview?.() ||
      global.HwHomeworkComments?.getCommentsForSubmit?.() ||
      [];

    teacherReviewDraftBusy = true;
    setTeacherReviewStatus("Saving draft…", false, "is-saving");

    try {
      const res = await fetch("/api/homework-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: session.username,
          submissionId: teacherReviewSubmission.id,
          comments,
          markReviewed: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save draft.");

      teacherReviewHasUnsaved = false;
      setTeacherReviewStatus(
        "Draft saved — click “Submit notes” when you are ready to mark reviewed.",
        false,
        "is-saved"
      );
    } catch (err) {
      setTeacherReviewStatus(
        (err && err.message) || "Could not save draft — try again or send to student.",
        true
      );
    } finally {
      teacherReviewDraftBusy = false;
    }
  }

  async function closeTeacherWorksheetReview() {
    clearTeacherReviewDraftTimer();
    if (teacherReviewHasUnsaved && teacherReviewSubmission && !teacherReviewBusy) {
      await saveTeacherReviewDraft();
    }
    const overlay = document.getElementById("hw-teacher-review-overlay");
    const mount = document.getElementById("hw-teacher-review-mount");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("hw-teacher-review-open");
    if (global.HwHomeworkComments?.destroy) global.HwHomeworkComments.destroy();
    if (global.HwMagnifyingGlass?.releaseOverride) global.HwMagnifyingGlass.releaseOverride();
    if (mount) mount.replaceChildren();
    teacherReviewSubmission = null;
    teacherReviewHasUnsaved = false;
    setTeacherReviewStatus("");
    const submitBtn = document.getElementById("hw-teacher-review-submit");
    if (submitBtn) submitBtn.disabled = false;
  }

  async function openTeacherWorksheetReview(entry, reviewOptions) {
    if (!entry?.id || entry.type !== "online") {
      showToast("Open the answers checklist for photo/video submissions.");
      return;
    }
    const session = getTeacherSessionForApi();
    if (!session) return;

    const overlay = document.getElementById("hw-teacher-review-overlay");
    const mount = document.getElementById("hw-teacher-review-mount");
    const titleEl = document.getElementById("hw-teacher-review-title");
    const subEl = document.getElementById("hw-teacher-review-sub");
    if (!overlay || !mount) {
      showToast("Review sheet UI is missing.");
      return;
    }

    /* Escape nested layout so fixed overlay covers the viewport (not under site nav). */
    if (overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }

    teacherReviewSubmission = entry;
    teacherReviewHasUnsaved = false;
    clearTeacherReviewDraftTimer();
    if (titleEl) {
      titleEl.textContent =
        (entry.displayName || entry.username || "Student") +
        " — " +
        (entry.lessonName || entry.title || entry.assignmentId || "Homework");
    }
    if (subEl) {
      subEl.textContent = [
        entry.reviewStatus === "reviewed" ? "Already reviewed" : "Awaiting your notes",
        entry.assignmentId,
        formatSubmissionWhen?.(entry.submittedAt) || entry.submittedAt || "",
      ]
        .filter(Boolean)
        .join(" · ");
    }

    mount.replaceChildren();
    setTeacherReviewStatus("Loading worksheet…");
    overlay.hidden = false;
    document.body.classList.add("hw-teacher-review-open");

    let assignment;
    try {
      assignment = await fetchAssignmentJson(entry.assignmentId, { bypassCache: true });
    } catch (err) {
      setTeacherReviewStatus(
        (err && err.message) || "Could not load the worksheet for this submission.",
        true
      );
      return;
    }

    const form = HwWorksheet.render(mount, assignment, {
      readOnly: true,
      omitMetaHint: true,
    });
    HwWorksheet.applySubmissionAnswers(form, entry);
    if (HwWorksheet.hasListenTeacherAnswers?.(form)) {
      HwWorksheet.revealTeacherAnswers(form);
    }
    HwWorksheet.setFormReadOnly(form);

    const initialComments =
      reviewOptions?.initialComments || entry.comments || [];

    if (global.HwFeatureFlags?.homeworkComments?.() && global.HwHomeworkComments?.attachTo) {
      global.HwHomeworkComments.attachTo(form, {
        username: entry.username,
        assignmentId: entry.assignmentId,
        submissionId: entry.id,
        teacherReview: true,
        teacherUsername: session.username,
        readOnly: true,
        skipOnboarding: true,
        initialComments,
      });
    }

    if (typeof reviewOptions?.focusSlideIndex === "number") {
      HwWorksheet.setSlideIndex?.(form, reviewOptions.focusSlideIndex);
    }

    if (reviewOptions?.focusCommentId && global.HwHomeworkComments?.focusComment) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          global.HwHomeworkComments.focusComment(reviewOptions.focusCommentId);
        });
      });
    }

    if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.attachTo) {
      global.HwMagnifyingGlass.attachTo(mount, {
        skipOnboarding: true,
        storageKey: "hw-mg-teacher-review-v1",
        defaultSnap: "tl",
      });
    } else if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.refresh) {
      global.HwMagnifyingGlass.refresh();
    }

    setTeacherReviewStatus(
      entry.reviewStatus === "reviewed"
        ? "Loaded — edits auto-save as drafts. Submit notes when ready to update their view."
        : "Loaded — reply to open memos or add a question note. Edits auto-save as drafts.",
      false,
      "is-saved"
    );
  }

  async function openTeacherFlashcardReview(entry) {
    if (global.HwReviewFlashcards?.open) {
      await global.HwReviewFlashcards.open(entry);
      return;
    }
    await openTeacherWorksheetReview(entry);
  }

  async function submitTeacherReviewNotes() {
    if (teacherReviewBusy || !teacherReviewSubmission) return;
    const session = getTeacherSessionForApi();
    if (!session) return;

    clearTeacherReviewDraftTimer();
    teacherReviewHasUnsaved = false;

    const comments =
      global.HwHomeworkComments?.getCommentsForReview?.() ||
      global.HwHomeworkComments?.getCommentsForSubmit?.() ||
      [];

    teacherReviewBusy = true;
    const submitBtn = document.getElementById("hw-teacher-review-submit");
    if (submitBtn) submitBtn.disabled = true;
    setTeacherReviewStatus("Sending to student…", false, "is-saving");

    try {
      const res = await fetch("/api/homework-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: session.username,
          submissionId: teacherReviewSubmission.id,
          comments,
          markReviewed: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not submit notes.");

      const student = teacherReviewSubmission.username;
      const assignmentId = teacherReviewSubmission.assignmentId;
      try {
        if (student && assignmentId) {
          localStorage.setItem(
            "jlm-hw-reviewed-" + String(student).toLowerCase() + "-" + assignmentId,
            "1"
          );
        }
      } catch {
        /* ignore */
      }

      showToast("Notes sent — student can see your feedback.");
      await closeTeacherWorksheetReview();
      if (global.HwTeacherSubmissions?.reload) {
        await global.HwTeacherSubmissions.reload();
      }
    } catch (err) {
      setTeacherReviewStatus((err && err.message) || "Could not submit notes.", true);
      if (submitBtn) submitBtn.disabled = false;
    } finally {
      teacherReviewBusy = false;
    }
  }

  function bindTeacherReviewChrome() {
    const back = document.getElementById("hw-teacher-review-back");
    const submit = document.getElementById("hw-teacher-review-submit");
    const overlay = document.getElementById("hw-teacher-review-overlay");
    if (back && !back.dataset.bound) {
      back.dataset.bound = "true";
      back.addEventListener("click", () => {
        void closeTeacherWorksheetReview();
      });
    }
    if (submit && !submit.dataset.bound) {
      submit.dataset.bound = "true";
      submit.addEventListener("click", () => {
        void submitTeacherReviewNotes();
      });
    }
    if (!document.body.dataset.teacherReviewChangeBound) {
      document.body.dataset.teacherReviewChangeBound = "true";
      document.addEventListener("hw-teacher-review-change", () => {
        scheduleTeacherReviewDraftSave();
      });
    }
    if (overlay && !overlay.dataset.escapeBound) {
      overlay.dataset.escapeBound = "true";
      document.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape") return;
        if (overlay.hidden) return;
        ev.preventDefault();
        void closeTeacherWorksheetReview();
      });
    }
  }

  function mapClassicTabToV6(tab) {
    const t = String(tab || "");
    if (t === "maker" || t === "library") return "maker";
    if (
      t === "account" ||
      t === "promo" ||
      t === "birthdays" ||
      t === "submissions" ||
      t === "mistakes"
    ) {
      return "students";
    }
    if (t === "harris" || t === "jem") return "websites";
    if (t === "gamelab") return "gamelab";
    if (t === "ideas" || t === "lookup-lexicon") return "ideas";
    if (t === "hubv2" || t === "hubpreview") return "hubpreview";
    if (t === "hubv6") return "preview";
    return "preview";
  }

  function activatePrimaryV6FromClassic(tab) {
    const v6Tab = mapClassicTabToV6(tab);
    global.HwHubV6?.activateTab?.(v6Tab);
    if (tab === "library") {
      const fold = document.getElementById("hw-hub-v6-fold-library");
      if (fold) fold.open = true;
    }
    if (tab === "lookup-lexicon") {
      const fold = document.getElementById("hw-hub-v6-fold-lookup");
      if (fold) fold.open = true;
    }
    if (tab === "submissions") {
      const fold = document.getElementById("hw-hub-v6-fold-submissions");
      if (fold) fold.open = true;
    }
    if (tab === "mistakes") {
      const fold = document.getElementById("hw-hub-v6-fold-mistakes");
      if (fold) fold.open = true;
    }
  }

  function showTeacherHubAndBindTabs() {
    document.body.classList.add("hw-role-teacher");
    document.documentElement.classList.add("hw-is-teacher");

    const hubTitle = document.getElementById("hw-hub-title");
    const hubDesc = document.getElementById("hw-hub-desc");
    const teacherHub = document.getElementById("hw-teacher-hub");
    const studentOnly = document.getElementById("hw-platform-student-only");

    if (hubTitle) hubTitle.textContent = "Teacher's hub";
    if (hubDesc) hubDesc.hidden = true;
    if (teacherHub) teacherHub.hidden = false;
    if (studentOnly) studentOnly.hidden = true;

    const hubV6Primary = global.HwFeatureFlags?.hubV6?.() === true;
    const teacherTabs = initTeacherTabs();

    if (hubV6Primary) {
      document.body.classList.add("hw-hub-v6-primary", "hw-hub-v6-enabled");
      const v6Panel = document.getElementById("hw-hub-v6-panel");
      if (v6Panel) v6Panel.hidden = false;
      if (global.HwHubV6?.init) {
        global.HwHubV6.init({ session: getTeacherSessionForApi() });
      }
      let tabParam = "";
      try {
        tabParam = new URLSearchParams(window.location.search).get("tab") || "";
      } catch {
        /* ignore */
      }
      if (tabParam) {
        activatePrimaryV6FromClassic(tabParam);
      } else {
        global.HwHubV6?.onTabActivated?.();
      }
    } else {
      document.body.classList.remove("hw-hub-v6-primary");
      const v6Panel = document.getElementById("hw-hub-v6-panel");
      if (v6Panel) v6Panel.hidden = true;
      if (teacherTabs?.activate && teacherTabs.initial) {
        teacherTabs.activate(teacherTabs.initial);
      }
    }
    return teacherTabs;
  }

  async function loadTeacherHub() {
    bindTeacherReviewChrome();

    if (global.HwTeacherLookupLexicon?.init) {
      HwTeacherLookupLexicon.init({
        getTeacherSession: () => teacherSession || HwAuth.getTeacherSession(),
        showToast,
      });
    }

    if (global.HwTeacherIdeas?.init) {
      HwTeacherIdeas.init({
        getTeacherSession: () => getTeacherSessionForApi(),
        showToast,
      });
    }
    if (global.HwReviewFlashcards?.init) {
      global.HwReviewFlashcards.init({
        getTeacherSession: () => getTeacherSessionForApi(),
        showToast,
        fetchAssignment: (id) => fetchAssignmentJson(id, { bypassCache: true }),
        openWorksheetReview: openTeacherWorksheetReview,
      });
    }
    if (global.HwTeacherSubmissions?.init) {
      HwTeacherSubmissions.init({
        getTeacherSession: () => getTeacherSessionForApi(),
        showToast,
        openWorksheetReview: openTeacherWorksheetReview,
        openFlashcardReview: openTeacherFlashcardReview,
      });
    }
    if (global.HwTeacherMistakes?.init) {
      HwTeacherMistakes.init({
        getTeacherSession: () => getTeacherSessionForApi(),
        showToast,
      });
    }
    if (global.HwTeacherPromo?.init) {
      HwTeacherPromo.init({
        getTeacherSession: () => getTeacherSessionForApi(),
        showToast,
      });
    }
    if (global.HwTeacherBirthdays?.init) {
      HwTeacherBirthdays.init({
        getTeacherSession: () => getTeacherSessionForApi(),
        showToast,
      });
    }
    if (global.HwTeacherLanternWords?.init) {
      HwTeacherLanternWords.init({
        getTeacherSession: () => getTeacherSessionForApi(),
        showToast,
      });
    }

    const studentsTask = global.HwStudentList?.fetchStudents
      ? global.HwStudentList.fetchStudents({
          force: true,
          teacherUsername: teacherSession?.username,
        }).then(() => global.HwStudentList.refreshTeacherFilterSelects?.())
      : Promise.resolve();

    let catalogTask = Promise.resolve(catalogCache);
    if (!catalogCache) {
      catalogTask = fetchCatalog()
        .then((catalog) => {
          catalogCache = catalog;
          return catalog;
        })
        .catch(() => null);
    }

    await Promise.all([studentsTask, catalogTask]);

    const teacherTabs = teacherTabApi;

    if (!catalogCache) {
      const meta = document.getElementById("hw-library-meta");
      if (meta) meta.textContent = "Could not load worksheet library.";
      if (global.HwTeacherEditor?.bootstrap) await HwTeacherEditor.bootstrap();
      return;
    }

    if (global.HwStudentList?.setStudents) {
      global.HwStudentList.setStudents(catalogCache.students || []);
      void global.HwStudentList.refreshTeacherFilterSelects();
    }

    const entries = catalogCache.assignments || [];
    const hashId = window.location.hash.replace(/^#hw-/, "");
    if (global.HwTeacherEditor?.refreshCatalog) {
      HwTeacherEditor.refreshCatalog(
        entries,
        catalogCache.studentProfiles || {},
        catalogCache.students || []
      );
    }
    if (global.HwTeacherEditor?.bootstrap) {
      HwTeacherEditor.bootstrap();
    }

    const searchInput = document.getElementById("hw-library-search");
    if (searchInput && !librarySearchBound) {
      librarySearchBound = true;
      searchInput.addEventListener("input", () => {
        const id = window.location.hash.replace(/^#hw-/, "");
        renderLibraryList(entries, searchInput.value, id);
      });
    }

    renderLibraryList(entries, searchInput ? searchInput.value : "", hashId);

    if (hashId) {
      if (teacherTabs?.activate) teacherTabs.activate("maker");
      await openInTeacherEditor(hashId);
    }
  }

  function assignmentRecencyKey(entry) {
    return String(entry?.publishedAt || entry?.date || entry?.id || "");
  }

  function parseStudentHash() {
    const raw = window.location.hash.replace(/^#/, "");
    const submissionMatch = raw.match(/^hw-submission-(.+)$/);
    if (submissionMatch) {
      return { kind: "submission", id: submissionMatch[1] };
    }
    if (raw.startsWith("hw-")) {
      return { kind: "assignment", id: raw.replace(/^hw-/, "") };
    }
    return { kind: "none", id: "" };
  }

  function clearStaleSubmissionHash() {
    const raw = window.location.hash.replace(/^#/, "");
    if (!/^hw-submission-/.test(raw)) return false;
    const path = window.location.pathname + window.location.search;
    if (window.history.replaceState) {
      window.history.replaceState(null, "", path);
    } else {
      window.location.hash = "";
    }
    return true;
  }

  function guessedAssignmentId() {
    const hashParts = parseStudentHash();
    if (hashParts.kind === "assignment") return String(hashParts.id || "").trim() || null;
    if (hashParts.kind === "submission") return null;
    const cached = readSessionJson(CATALOG_SESSION_KEY);
    const user = session?.username;
    if (user && cached?.data?.studentProfiles?.[user]?.currentHomeworkId) {
      return String(cached.data.studentProfiles[user].currentHomeworkId).trim() || null;
    }
    const mem = catalogCache?.studentProfiles?.[user]?.currentHomeworkId;
    return String(mem || "").trim() || null;
  }

  function scheduleStudentMistakesLoad(options) {
    if (!global.HwStudentMistakes?.load) return;
    const run = () => {
      void HwStudentMistakes.load(session, options || {});
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 2500 });
    } else {
      setTimeout(run, 200);
    }
  }

  function notifyStudentHubReady() {
    if (isTeacher) return;
    document.dispatchEvent(new CustomEvent("hw-platform-student-ready"));
  }

  function notifyStudentReviewGate(detail) {
    document.dispatchEvent(
      new CustomEvent("hw-platform-student-review-gate", { detail: detail || {} })
    );
  }

  function markLocalSubmissionFlags(assignmentId, reviewStatus) {
    if (!session.username || !assignmentId) return;
    try {
      localStorage.setItem(
        "jlm-hw-submitted-" + session.username + "-" + assignmentId,
        new Date().toISOString()
      );
      if (reviewStatus === "reviewed" || reviewStatus === "acknowledged") {
        localStorage.setItem(
          "jlm-hw-reviewed-" + session.username + "-" + assignmentId,
          "1"
        );
      }
      if (reviewStatus === "acknowledged") {
        localStorage.setItem(
          "jlm-hw-reviewed-acked-" + session.username + "-" + assignmentId,
          "1"
        );
      }
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

  async function fetchLatestOnlineSubmission(assignmentId) {
    if (!session.username || !assignmentId) return null;
    const wantId = String(assignmentId || "").trim();
    if (!wantId) return null;
    try {
      const res = await fetch(
        "/api/homework-submissions?username=" + encodeURIComponent(session.username),
        { cache: "no-store" }
      );
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      const subs = (Array.isArray(data.submissions) ? data.submissions : [])
        .filter(
          (entry) =>
            entry.type === "online" &&
            String(entry.assignmentId || "").trim() === wantId
        )
        .sort(
          (a, b) =>
            new Date(b.submittedAt || 0).getTime() -
            new Date(a.submittedAt || 0).getTime()
        );
      const latest = subs[0] || null;
      if (!latest) return null;
      return {
        ...latest,
        reviewStatus: normalizeSubmissionReviewStatus(latest),
      };
    } catch {
      return null;
    }
  }

  function finishStudentWorksheetMount(form) {
    if (global.HwWorksheetToolLayout?.revealWorksheetTools) {
      global.HwWorksheetToolLayout.revealWorksheetTools(form, notifyStudentHubReady);
      return;
    }
    notifyStudentHubReady();
  }

  function abortStudentWorksheetBoot() {
    global.HwWorksheetToolLayout?.cancelWorksheetToolBoot?.();
    notifyStudentHubReady();
  }

  async function loadStudentHub(options) {
    options = options || {};
    const loadGen = ++studentHubLoadGen;
    const isStale = () => loadGen !== studentHubLoadGen;
    let settled = false;
    const settleHub = (fn) => {
      if (settled || isStale()) return;
      settled = true;
      fn();
    };

    try {
    document.body.classList.add("hw-role-student");

    const teacherHub = document.getElementById("hw-teacher-hub");
    const studentOnly = document.getElementById("hw-platform-student-only");
    if (teacherHub) teacherHub.hidden = true;
    if (studentOnly) studentOnly.hidden = false;

    const mount = getWorksheetMount();
    const heading = document.getElementById("hw-worksheet-heading");
    const intro = document.getElementById("hw-worksheet-intro");
    const v4Intro = document.getElementById("hw-v4-worksheet-intro");

    if (v4Intro) {
      const staleIntro = String(v4Intro.textContent || "");
      if (/not allowed|could not load submission/i.test(staleIntro)) {
        v4Intro.textContent = "";
        v4Intro.hidden = true;
      }
    }

    const hashParts = parseStudentHash();
    const hashId = hashParts.kind === "assignment" ? String(hashParts.id || "").trim() : "";
    const guessId = options.skipWorksheet ? null : guessedAssignmentId();
    const catalogPromise = fetchCatalog(
      options.bypassCache ? { bypassCache: true } : undefined
    );
    const speculativeId = hashId || guessId;
    const assignmentFetchOpts = studentAssignmentFetchOptions(options);
    const speculativeAssignmentPromise =
      speculativeId && !options.skipWorksheet && hashParts.kind !== "submission"
        ? fetchAssignmentJson(speculativeId, assignmentFetchOpts).catch(() => null)
        : null;

    let catalog;
    try {
      catalog = await catalogPromise;
    } catch {
      if (intro) intro.textContent = "Could not load homework catalog.";
      settleHub(abortStudentWorksheetBoot);
      return;
    }
    if (isStale()) return;

    const user = String(session.username || "").trim().toLowerCase();
    const mine = (catalog.assignments || []).filter((a) =>
      (a.students || []).map((s) => String(s || "").toLowerCase()).includes(user)
    );
    mine.sort((a, b) => assignmentRecencyKey(b).localeCompare(assignmentRecencyKey(a)));

    const currentId = String(
      catalog.studentProfiles?.[user]?.currentHomeworkId ||
        catalog.studentProfiles?.[session.username]?.currentHomeworkId ||
        ""
    ).trim();
    const active =
      (hashParts.kind === "assignment" && hashId && mine.find((a) => a.id === hashId)) ||
      (currentId && mine.find((a) => a.id === currentId)) ||
      mine[0] ||
      (currentId ? { id: currentId, title: currentId, students: [user] } : null);

    renderCurrentAssignmentCard(mine, active?.id);
    setLessonLinks(active, catalog);
    renderUltraReviewPlaylist(catalog);
    scheduleStudentSubmissionsLoad(options);

    if (hashParts.kind === "submission") {
      /* Intentional past sheet — leave diary, then load. Never return early while
         keeping #hw-submission- (that leaves empty ～title + Past HW gone). */
      if (isHubNotebookOpen()) {
        global.HwHubV5Live?.closeNotebook?.();
      }
      bindPhotoUpload(null);
      bindVideoUpload(null);
      global.HwWorksheetToolLayout?.beginWorksheetToolBoot?.();
      const submissionOk = await loadSubmissionView(hashParts.id, loadGen, isStale);
      if (submissionOk) {
        settleHub(() =>
          finishStudentWorksheetMount(document.getElementById("hw-worksheet-form"))
        );
        return;
      }
      clearStaleSubmissionHash();
      if (intro) {
        intro.textContent = "";
        intro.hidden = false;
      }
      if (v4Intro) {
        v4Intro.textContent = "";
        v4Intro.hidden = true;
      }
      if (isStale()) return;
    } else {
      setSubmissionViewChrome(null, false);
    }
    bindPhotoUpload(active);
    bindVideoUpload(active);

    if (!active || !mount) {
      if (heading) heading.textContent = "Current homework";
      if (intro) intro.textContent = "No assignment is linked to your account yet.";
      if (v4Intro) {
        v4Intro.textContent = "No assignment is linked to your account yet.";
        v4Intro.hidden = false;
      }
      global.HwStudentToolbar?.unmount?.();
      if (mount) mount.innerHTML = "";
      studentMountedAssignmentId = null;
      hubV4WorksheetForm = null;
      setOfflineToolsVisible(false);
      scheduleStudentMistakesLoad({
        background: Boolean(options.background),
        bypassCache: Boolean(options.bypassCache),
      });
      settleHub(abortStudentWorksheetBoot);
      return;
    }

    /*
     * If this homework was already submitted/reviewed, do not remount a fresh
     * editable “Send to JD” sheet. Open the reviewed archive, or show waiting UI.
     * Overlap the submission-status check with assignment JSON fetch — review
     * gates may discard the assignment result; that is cheaper than waiting serially.
     */
    let parallelAssignmentPromise = null;
    if (hashParts.kind !== "submission" && !options.skipWorksheet) {
      if (speculativeAssignmentPromise && active.id === speculativeId) {
        parallelAssignmentPromise = speculativeAssignmentPromise;
      } else {
        parallelAssignmentPromise = fetchAssignmentJson(
          active.id,
          assignmentFetchOpts
        ).catch(() => null);
      }
    }

    if (hashParts.kind !== "submission" && !options.skipWorksheet) {
      const latestSub = await fetchLatestOnlineSubmission(active.id);
      if (isStale()) return;
      if (latestSub?.reviewStatus === "reviewed") {
        markLocalSubmissionFlags(active.id, "reviewed");
        notifyStudentReviewGate({
          status: "reviewed",
          submissionId: latestSub.id,
          assignmentId: active.id,
        });
        /*
         * View notebook exits archive then triggers loadStudentHub. Don't auto
         * re-open the reviewed sheet while the diary owns the status slot.
         */
        if (isHubNotebookOpen()) {
          if (mount) mount.innerHTML = "";
          studentMountedAssignmentId = null;
          hubV4WorksheetForm = null;
          setOfflineToolsVisible(false);
          setSubmissionViewChrome(null, false);
          scheduleStudentMistakesLoad({
            background: Boolean(options.background),
            bypassCache: Boolean(options.bypassCache),
          });
          settleHub(abortStudentWorksheetBoot);
          return;
        }
        /* Same surface as teacher review: full HW slides + blue/green notes. */
        const subHash = "hw-submission-" + latestSub.id;
        if ((window.location.hash || "").replace(/^#/, "") !== subHash) {
          history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search + "#" + subHash
          );
        }
        const submissionOk = await loadSubmissionView(latestSub.id, loadGen, isStale);
        if (submissionOk) {
          settleHub(() =>
            finishStudentWorksheetMount(document.getElementById("hw-worksheet-form"))
          );
          return;
        }
        mount.innerHTML = "";
        studentMountedAssignmentId = null;
        hubV4WorksheetForm = null;
        setOfflineToolsVisible(false);
        scheduleStudentMistakesLoad({
          background: Boolean(options.background),
          bypassCache: Boolean(options.bypassCache),
        });
        settleHub(abortStudentWorksheetBoot);
        return;
      } else if (latestSub?.reviewStatus === "acknowledged") {
        markLocalSubmissionFlags(active.id, "acknowledged");
        notifyStudentReviewGate({
          status: "acknowledged",
          submissionId: latestSub.id,
          assignmentId: active.id,
        });
        if (session.tier !== "tier3") {
          mount.innerHTML = "";
          studentMountedAssignmentId = null;
          hubV4WorksheetForm = null;
          setOfflineToolsVisible(false);
          scheduleStudentMistakesLoad({
            background: Boolean(options.background),
            bypassCache: Boolean(options.bypassCache),
          });
          settleHub(abortStudentWorksheetBoot);
          return;
        }
      } else if (latestSub) {
        markLocalSubmissionFlags(active.id, "submitted");
        notifyStudentReviewGate({
          status: "submitted",
          submissionId: latestSub.id,
          assignmentId: active.id,
        });
        /* Non-Ultra: hide live worksheet — hub shows “JD is reviewing…”. */
        if (session.tier !== "tier3") {
          mount.innerHTML = "";
          studentMountedAssignmentId = null;
          hubV4WorksheetForm = null;
          setOfflineToolsVisible(false);
          scheduleStudentMistakesLoad({
            background: Boolean(options.background),
            bypassCache: Boolean(options.bypassCache),
          });
          settleHub(abortStudentWorksheetBoot);
          return;
        }
      }
    }

    if (
      options.metadataOnly &&
      active.id === studentMountedAssignmentId &&
      mount.querySelector("#hw-worksheet-form")
    ) {
      scheduleStudentMistakesLoad({
        background: true,
        bypassCache: Boolean(options.bypassCache),
      });
      settleHub(() =>
        finishStudentWorksheetMount(mount.querySelector("#hw-worksheet-form"))
      );
      return;
    }

    let assignment = null;
    if (parallelAssignmentPromise) {
      assignment = await parallelAssignmentPromise;
      if (isStale()) return;
    }
    if (!assignment) {
      try {
        assignment = await fetchAssignmentJson(active.id, assignmentFetchOpts);
      } catch {
        if (intro) intro.textContent = "Could not load this worksheet.";
        if (v4Intro) {
          v4Intro.textContent = "Could not load this worksheet.";
          v4Intro.hidden = false;
        }
        if (mount) mount.innerHTML = "";
        scheduleStudentMistakesLoad({
          background: Boolean(options.background),
          bypassCache: Boolean(options.bypassCache),
        });
        settleHub(abortStudentWorksheetBoot);
        return;
      }
      if (isStale()) return;
    }

    const view = studentViewMeta(active, assignment);

    if (heading) heading.textContent = view.heading;
    if (intro) {
      intro.textContent =
        "One question at a time — fill in each blank, then submit when you're done.";
    }
    if (v4Intro) v4Intro.hidden = true;

    const renderOptions = {
      omitMetaTitle: usesHubV4Layout(),
      omitMetaHint: usesHubV4Layout(),
      studentMeta: {
        username: session.username || "",
        displayName: session.displayName || session.username || "",
        assignmentId: assignment.id || active.id,
        lessonName:
          assignment.lessonName || assignment.title || active.lessonName || active.title || active.id,
      },
    };

    function mountWorksheet(data) {
      global.HwStudentToolbar?.park?.();
      const form = HwWorksheet.render(mount, data, renderOptions);
      const saveMeta = {
        ...data,
        id: data.id || active.id,
        title: data.title || active.title,
        lessonName:
          data.lessonName || active.lessonName || active.title || active.id,
        date: data.date || active.date,
        register: data.register || "casual",
      };
      if (!form.getAttribute("data-assignment-id") && saveMeta.id) {
        form.setAttribute("data-assignment-id", saveMeta.id);
      }
      bindWorksheetSave(form, saveMeta);
      bindHubV4WorksheetChrome(form, saveMeta);
      /* Floating toolbar replaces native Focus · Send · See Answers; Glass/Cloud tuck until popped. */
      if (global.HwStudentToolbar?.mount) {
        global.HwStudentToolbar.mount(form, {
          username: session.username,
          assignmentId: saveMeta.id || active.id,
          readOnly: false,
        });
      } else if (global.HwFeatureFlags?.homeworkComments?.() && global.HwHomeworkComments?.attachTo) {
        global.HwHomeworkComments.attachTo(form, {
          username: session.username,
          assignmentId: saveMeta.id || active.id,
          readOnly: false,
        });
      }
      return form;
    }

    global.HwWorksheetToolLayout?.beginWorksheetToolBoot?.();
    let form;
    try {
      form = mountWorksheet(assignment);
    } catch (err) {
      console.error("[hw-platform] worksheet mount failed", err);
      if (intro) intro.textContent = "Could not load this worksheet.";
      if (v4Intro) {
        v4Intro.textContent = "Could not load this worksheet.";
        v4Intro.hidden = false;
      }
      if (mount) mount.innerHTML = "";
      scheduleStudentMistakesLoad({
        background: Boolean(options.background),
        bypassCache: Boolean(options.bypassCache),
      });
      settleHub(abortStudentWorksheetBoot);
      return;
    }
    if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.refresh) {
      global.HwMagnifyingGlass.refresh();
    }
    studentMountedAssignmentId = active.id;

    scheduleStudentMistakesLoad({
      background: Boolean(options.background),
      bypassCache: Boolean(options.bypassCache),
    });
    settleHub(() => finishStudentWorksheetMount(form));
    } catch (err) {
      console.error("[hw-platform] loadStudentHub failed", err);
      settleHub(abortStudentWorksheetBoot);
    }
  }

  function ensureTeacherEditorMounted() {
    if (!isTeacher) return;
    initTeacherEditor();
  }

  function returnToTeacherHub() {
    invalidateCatalogCaches();
    clearStaleSubmissionHash();
    HwAuth.clearViewAsStudent();
    window.location.reload();
  }

  function syncTeacherAdminChrome() {
    const showAdmin = Boolean(teacherSession);
    const banner = document.getElementById("hw-viewas-banner");
    const bannerExit = document.getElementById("hw-viewas-banner-exit");

    if (banner) banner.hidden = !showAdmin;
    if (bannerExit) bannerExit.hidden = !showAdmin || !isViewingAsStudent;
  }

  syncTeacherAdminChrome();

  function initTeacherViewAsControls() {
    if (!teacherSession) {
      syncTeacherAdminChrome();
      return;
    }

    const select = document.getElementById("hw-teacher-viewas-select");
    const bannerExit = document.getElementById("hw-viewas-banner-exit");

    syncTeacherAdminChrome();

    if (bannerExit && !bannerExit.dataset.bound) {
      bannerExit.dataset.bound = "true";
      bannerExit.addEventListener("click", returnToTeacherHub);
    }

    if (!select || select.dataset.bound) return;
    select.dataset.bound = "true";

    select.addEventListener("change", () => {
      const next = select.value;
      if (!next) {
        if (isViewingAsStudent) returnToTeacherHub();
        return;
      }
      if (next === session.username && isViewingAsStudent) return;
      void (async () => {
        const apply = HwAuth.setViewAsStudentAsync || HwAuth.setViewAsStudent;
        const result = await apply(next);
        if (!result.ok) {
          select.value = isViewingAsStudent ? session.username : "";
          return;
        }
        clearStaleSubmissionHash();
        window.location.reload();
      })();
    });

    void (async () => {
      if (global.HwStudentList?.fetchStudents) {
        await global.HwStudentList.fetchStudents({
          force: true,
          teacherUsername: teacherSession.username,
        });
        global.HwStudentList.fillStudentSelect(select, {
          placeholder: "— Teacher hub —",
          required: false,
          keepValue: isViewingAsStudent ? session.username : "",
        });
      }
    })();
  }

  async function enrichStudentSessionFromProfile(targetSession) {
    const s = targetSession || session;
    if (!s || s.role !== "student" || !s.username) return s;

    const teacherUsername =
      teacherSession?.username ||
      (HwAuth.getTeacherSession?.() || {}).username ||
      "jlm";

    try {
      const url =
        "/api/homework-student-profile?teacherUsername=" +
        encodeURIComponent(teacherUsername) +
        "&studentUsername=" +
        encodeURIComponent(s.username) +
        "&_=" +
        Date.now();
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const profile = data?.profile;
      if (!profile) return s;

      if (profile.accountLabel) {
        s.accountLabel = profile.accountLabel;
        s.accountLabelDisplay =
          HwAuth.ACCOUNT_LABELS[profile.accountLabel] || profile.accountLabel;
      }
      if (profile.tier) {
        s.tier = profile.tier;
        s.tierDisplay = HwAuth.TIERS[profile.tier]?.name || profile.tier;
        s.videoResponseUnlock = profile.tier === "tier3" || Boolean(s.videoResponseUnlock);
      }

      HwAuth.setAccountOverride?.(s.username, {
        accountLabel: s.accountLabel,
        tier: s.tier,
      });

      if (!isViewingAsStudent && !s.viewAs) {
        try {
          const remember = Boolean(localStorage.getItem(HwAuth.SESSION_KEY));
          HwAuth.persistSession?.(s, remember);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* profile optional */
    }
    return s;
  }

  async function enrichViewAsSessionFromProfile() {
    if (!isViewingAsStudent || !teacherSession?.username || !session?.username) return;
    await enrichStudentSessionFromProfile(session);
  }

  function init() {
    if (!global.HwWorksheet?.render) {
      const mount = getWorksheetMount() || document.getElementById("hw-worksheet-mount");
      const intro = document.getElementById("hw-worksheet-intro");
      if (intro) {
        intro.textContent =
          "Homework could not load in this browser. Hard refresh (Ctrl+Shift+R) or try Firefox/Safari.";
      }
      if (mount) {
        mount.innerHTML =
          '<p class="hw-worksheet__status">If this keeps happening, clear site data for this page and sign in again.</p>';
      }
      console.error("HwWorksheet failed to load — check hw-worksheet.js and hw-compat.js.");
      return;
    }

    if (isTeacher) {
      initTeacherViewAsControls();
      showTeacherHubAndBindTabs();
      bindTeacherReviewChrome();
      void loadTeacherHub();
      requestAnimationFrame(() => {
        initTeacherEditor();
        ensureTeacherEditorMounted();
      });
    } else if (isViewingAsStudent) {
      initTeacherViewAsControls();
      applyHubLayout();
      global.HwWorksheetToolLayout?.beginWorksheetToolBoot?.();
      document.addEventListener("hw-v5-retry-student-hub", () => {
        void loadStudentHub({ bypassCache: true, metadataOnly: false });
      });
      /* Paint chrome from session immediately; overlap catalog/assignment with profile. */
      renderAccountBar();
      renderStudentHubHeader();
      renderGamesHubCard();
      bindWeeklyUpgradeCard();
      bindOfflineTools();
      void fetchCatalog().catch(() => null);
      const earlyGuess = guessedAssignmentId();
      if (earlyGuess) {
        void fetchAssignmentJson(earlyGuess, studentAssignmentFetchOptions({})).catch(
          () => null
        );
      }
      void enrichViewAsSessionFromProfile().then(() => {
        renderAccountBar();
        renderStudentHubHeader();
        loadStudentHub();
      });
      window.addEventListener("hashchange", () => {
        loadStudentHub();
      });
      if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.init) {
        global.HwMagnifyingGlass.init();
      }
    } else {
      applyHubLayout();
      global.HwWorksheetToolLayout?.beginWorksheetToolBoot?.();
      document.addEventListener("hw-v5-retry-student-hub", () => {
        void loadStudentHub({ bypassCache: true, metadataOnly: false });
      });
      /* Paint chrome from session immediately; overlap catalog/assignment with profile. */
      renderAccountBar();
      renderStudentHubHeader();
      renderGamesHubCard();
      bindWeeklyUpgradeCard();
      bindOfflineTools();
      void fetchCatalog().catch(() => null);
      const earlyGuess = guessedAssignmentId();
      if (earlyGuess) {
        void fetchAssignmentJson(earlyGuess, studentAssignmentFetchOptions({})).catch(
          () => null
        );
      }
      void enrichStudentSessionFromProfile(session).then(() => {
        renderAccountBar();
        renderStudentHubHeader();
        loadStudentHub();
      });
      window.addEventListener("hashchange", () => {
        loadStudentHub();
      });
      window.addEventListener("pageshow", (e) => {
        if (e.persisted) {
          loadStudentHub({ bypassCache: true, metadataOnly: false });
        }
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          studentHubHiddenAt = Date.now();
          return;
        }
        if (document.visibilityState !== "visible") return;
        const hiddenMs = studentHubHiddenAt ? Date.now() - studentHubHiddenAt : 0;
        if (hiddenMs < 90_000) return;
        void loadStudentHub({
          background: true,
          bypassCache: true,
          metadataOnly: true,
        });
      });
      if (global.HwFuriganaAuto?.preload) {
        const preload = () => void global.HwFuriganaAuto.preload();
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(preload, { timeout: 4000 });
        } else {
          setTimeout(preload, 1500);
        }
      }
      if (global.HwFeatureFlags?.magnifyingGlass?.() && global.HwMagnifyingGlass?.init) {
        global.HwMagnifyingGlass.init();
      }
    }
  }

  init();

  global.HwStudentPast = {
    openPicker: openPastAssignmentsModal,
    closePicker: closePastAssignmentsModal,
    reload: loadStudentPastHomework,
  };

  global.HwTeacherReview = {
    openOnlineSubmission: openTeacherWorksheetReview,
  };
})();
