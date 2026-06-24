/**
 * Homework platform — student hub (assignments + submit) or teacher hub (worksheet library).
 */
(function () {
  const global = window;
  const session = HwAuth.getSession();
  if (!session) return;

  const isTeacher = session.role === "teacher";

  const greet = document.getElementById("hw-platform-greet");
  if (greet) {
    greet.textContent = session.displayName + (isTeacher ? " · Teacher" : "");
  }

  if (!isTeacher) {
    const hubTitle = document.getElementById("hw-hub-title");
    if (hubTitle) {
      hubTitle.textContent = HwAuth.possessiveHubTitle(session.displayName || session.username);
    }
  }

  function renderAccountBar() {
    const badges = document.getElementById("hw-platform-badges");
    if (!badges || isTeacher) return;
    badges.hidden = false;
    badges.replaceChildren();

    const labelPill = document.createElement("span");
    labelPill.className = "hw-account-badge hw-account-badge--label";
    labelPill.textContent = session.accountLabelDisplay || "Homework Only";

    const tierPill = document.createElement("span");
    tierPill.className = "hw-account-badge hw-account-badge--tier";
    tierPill.textContent =
      HwAuth.TIERS[HUB_CURRENT_PLAN_TIER]?.name ||
      session.tierDisplay ||
      HwAuth.getTierMeta(session)?.name ||
      "—";

    badges.append(labelPill, tierPill);
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

    if (pick) {
      pick.hidden = false;
      bindTierDetailModal();
      renderHubTierPlans();
      global.HwCheckout?.bindCheckoutControls?.(pick);
    }

    if (desc) {
      desc.textContent =
        "Assignments and lesson links from your recordings show up here. Upgrade your plan below when you are ready.";
    }
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
    btn.addEventListener("click", () => {
      showToast(
        "Weekly homework add-on ($" +
          HwAuth.WEEKLY_HOMEWORK_UPGRADE_PRICE +
          "/mo) — PayPal coming soon. Message JD to sign up."
      );
    });
  }

  /** Student-safe labels — never show another learner's name from catalog/JSON. */
  function studentViewMeta(catalogEntry, assignment) {
    const date = assignment?.date || catalogEntry?.date || "";
    const title =
      assignment?.title || catalogEntry?.title || catalogEntry?.id || "Homework";
    const line = date ? date + " · " + title : title;
    const lessonName = date ? date + " — " + title : title;
    return {
      listLabel: line,
      lessonMeta: line,
      heading: "Your homework",
      lessonName,
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

  function invalidateCatalogCaches() {
    catalogCache = null;
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
    if (isTeacher) {
      return options?.bypassCache ? { bypassCache: true } : undefined;
    }
    return { bypassCache: true };
  }

  async function fetchCatalog(options) {
    options = options || {};
    if (!options.bypassCache && catalogCache) return catalogCache;

    if (!options.bypassCache) {
      const cached = readSessionJson(CATALOG_SESSION_KEY);
      if (
        cached?.savedAt &&
        Date.now() - cached.savedAt < CATALOG_TTL_MS &&
        cached.data?.assignments
      ) {
        catalogCache = cached.data;
        return cached.data;
      }
    }

    if (!options.bypassCache && catalogFetchInFlight) return catalogFetchInFlight;

    const work = (async () => {
      const studentParam =
        !isTeacher && session?.username
          ? "?student=" + encodeURIComponent(session.username)
          : "";
      const res = await fetch("/api/homework-catalog" + studentParam, {
        cache: options.bypassCache ? "no-store" : "default",
      });
      if (!res.ok) throw new Error("catalog");
      const data = await res.json();
      catalogCache = data;
      writeSessionJson(CATALOG_SESSION_KEY, { savedAt: Date.now(), data });
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
    const submittedKey = `jlm-hw-submitted-${session.username}-${assignmentId}`;
    const inputs = form.querySelectorAll("input.hw-blank, textarea.hw-blank");
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      inputs.forEach((inp) => {
        if (inp.name && saved[inp.name] != null) inp.value = saved[inp.name];
      });
    } catch (_) {}

    const saveStatus = document.getElementById("hw-save-status");
    const SUBMIT_COOLDOWN_MS = 2000;
    let submitCooldownTimer = null;

    function scheduleSubmitCooldown(submitBtn) {
      if (!submitBtn) return;
      submitBtn.disabled = true;
      clearTimeout(submitCooldownTimer);
      submitCooldownTimer = setTimeout(() => {
        submitBtn.disabled = false;
      }, SUBMIT_COOLDOWN_MS);
    }

    form.addEventListener("input", () => {
      const data = {};
      inputs.forEach((inp) => {
        if (inp.name) data[inp.name] = inp.value;
      });
      localStorage.setItem(storageKey, JSON.stringify(data));
      if (saveStatus) saveStatus.textContent = "Saved in your browser.";
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn?.disabled) return;

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
          saveStatus.textContent = data.message || "Submitted! JD received your answers.";
        }
        showToast("Sent to JD");
        try {
          localStorage.setItem(submittedKey, new Date().toISOString());
        } catch (_) {}
        if (global.HwWorksheet?.enableSeeAnswers) {
          HwWorksheet.enableSeeAnswers(form);
        }
        scheduleSubmitCooldown(submitBtn);
      } catch (err) {
        if (saveStatus) {
          saveStatus.textContent =
            (err && err.message) ||
            "Could not submit. Answers are still saved in this browser.";
        }
        showToast("Submit failed");
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    try {
      if (localStorage.getItem(submittedKey) && global.HwWorksheet?.enableSeeAnswers) {
        HwWorksheet.enableSeeAnswers(form);
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

  function bindCurrentAssignmentPills(active) {
    const pillOnline = document.getElementById("hw-pill-online");
    const pillPrint = document.getElementById("hw-pill-print");
    const pillsWrap = document.getElementById("hw-current-assignment-pills");
    const takePictureBtn = document.getElementById("hw-photo-take-picture");
    const chooseFileBtn = document.getElementById("hw-photo-choose-file");
    const photoForm = document.getElementById("hw-photo-upload-form");

    if (!active) {
      if (pillsWrap) pillsWrap.hidden = true;
      if (takePictureBtn) takePictureBtn.hidden = true;
      if (chooseFileBtn) chooseFileBtn.hidden = true;
      if (photoForm) photoForm.hidden = true;
      return;
    }

    if (pillsWrap) pillsWrap.hidden = false;
    if (takePictureBtn) takePictureBtn.hidden = false;
    if (chooseFileBtn) chooseFileBtn.hidden = false;
    if (photoForm) photoForm.hidden = false;
    if (pillOnline) {
      pillOnline.hidden = false;
      pillOnline.href = "#hw-worksheet-section";
      pillOnline.onclick = () => {
        const targetHash = "hw-" + active.id;
        if (window.location.hash !== "#" + targetHash) {
          window.location.hash = targetHash;
        }
      };
    }
    if (pillPrint) {
      pillPrint.onclick = () => requestPrintHomework(active);
    }
  }

  function requestPrintHomework(active) {
    const tryPrint = () => {
      const form = document.getElementById("hw-worksheet-form");
      if (!form || typeof window.HwWorksheet?.printBlank !== "function") return false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      return window.HwWorksheet.printBlank(form);
    };

    if (tryPrint()) return;

    if (active?.id) {
      const targetHash = "hw-" + active.id;
      if (window.location.hash !== "#" + targetHash) {
        window.location.hash = targetHash;
      }
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      if (tryPrint() || ++attempts > 50) {
        window.clearInterval(timer);
        if (attempts > 50) {
          showToast("Homework is still loading — try again in a moment.");
        }
      }
    }, 150);
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

    titleEl.textContent = studentViewMeta(active, null).listLabel;
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
    const takePictureBtn = document.getElementById("hw-photo-take-picture");
    const chooseFileBtn = document.getElementById("hw-photo-choose-file");
    const captureWrap = document.getElementById("hw-photo-capture");
    const captureBtn = document.getElementById("hw-photo-capture-btn");
    const cancelBtn = document.getElementById("hw-photo-cancel-camera");
    const livePanel = document.getElementById("hw-photo-capture-live");
    const previewPanel = document.getElementById("hw-photo-capture-preview");
    const videoEl = document.getElementById("hw-photo-capture-video");
    const previewImg = document.getElementById("hw-photo-capture-img");
    if (!form) return;
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

    function setStatus(message) {
      if (status) status.textContent = message || "";
    }

    function setPhotoButtonsDisabled(disabled) {
      if (takePictureBtn) takePictureBtn.disabled = disabled;
      if (chooseFileBtn) chooseFileBtn.disabled = disabled;
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

    takePictureBtn?.addEventListener("click", () => {
      openCamera();
    });

    chooseFileBtn?.addEventListener("click", () => {
      fileInput?.click();
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
      getTeacherSession: () => session,
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
    document.getElementById("hw-teacher-tab-maker")?.click();
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
    if (!buttons.length || !iframe) return;

    const paths = {
      "2": "/homework/hub-v2-preview.html",
      "3": "/homework/hub-v3-preview.html",
      "4": "/homework/hub-v4-preview.html",
      "5": "/homework/hub-v5-preview.html",
    };

    function setVersion(version) {
      const path = paths[version] || paths["3"];
      iframe.src = path;
      iframe.title = "Homework Hub v" + version + " prototype";
      if (openLink) openLink.href = path;
      buttons.forEach((btn) => {
        const on = btn.getAttribute("data-hub-version") === version;
        btn.classList.toggle("btn--primary", on);
        btn.classList.toggle("btn--ghost", !on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      });
      try {
        localStorage.setItem("jlm-hw-teacher-hub-version", version);
      } catch {
        /* ignore */
      }
    }

    let saved = "3";
    try {
      saved = localStorage.getItem("jlm-hw-teacher-hub-version") || "3";
    } catch {
      /* ignore */
    }
    if (!paths[saved]) saved = "3";
    setVersion(saved);

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const version = btn.getAttribute("data-hub-version");
        if (version) setVersion(version);
      });
    });
  }

  function initTeacherTabs() {
    const tablist = document.querySelector(".hw-teacher-tabs");
    if (!tablist || tablist.dataset.bound === "true") return;
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
        if (panel) panel.hidden = key !== name;
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
      if (name === "account" && global.HwTeacherEditor?.syncPublishPicker) {
        global.HwTeacherEditor.syncPublishPicker();
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
      if (tabParam === "mistakes" || tabParam === "maker" || tabParam === "account" || tabParam === "library" || tabParam === "ideas" || tabParam === "submissions" || tabParam === "promo" || tabParam === "birthdays" || tabParam === "harris" || tabParam === "jem" || tabParam === "gamelab" || tabParam === "hubv2") {
        initial = tabParam;
      } else {
      const saved = localStorage.getItem("jlm-hw-teacher-tab");
      if (saved === "homework") {
        initial = "account";
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

    activate(initial);
    return activate;
  }

  async function loadTeacherHub() {
    document.body.classList.add("hw-role-teacher");
    document.documentElement.classList.add("hw-is-teacher");

    const hubTitle = document.getElementById("hw-hub-title");
    const hubDesc = document.getElementById("hw-hub-desc");
    const teacherHub = document.getElementById("hw-teacher-hub");
    const studentOnly = document.getElementById("hw-platform-student-only");

    if (hubTitle) hubTitle.textContent = "Teacher's hub";
    if (hubDesc) {
      hubDesc.textContent =
        "Worksheet maker → Student info → Library → Ideas → Submissions → Mistakes → Email list → Birthdays.";
    }
    if (teacherHub) teacherHub.hidden = false;
    if (studentOnly) studentOnly.hidden = true;

    if (global.HwStudentList?.fetchStudents) {
      await global.HwStudentList.fetchStudents();
    }

    const activateTeacherTab = initTeacherTabs();
    initTeacherEditor();
    if (global.HwTeacherIdeas?.init) {
      HwTeacherIdeas.init({
        getTeacherSession: () => session,
        showToast,
      });
    }
    if (global.HwTeacherSubmissions?.init) {
      HwTeacherSubmissions.init({
        getTeacherSession: () => session,
        showToast,
      });
    }
    if (global.HwTeacherMistakes?.init) {
      HwTeacherMistakes.init({
        getTeacherSession: () => session,
        showToast,
      });
    }
    if (global.HwTeacherPromo?.init) {
      HwTeacherPromo.init({
        getTeacherSession: () => session,
        showToast,
      });
    }
    if (global.HwTeacherBirthdays?.init) {
      HwTeacherBirthdays.init({
        getTeacherSession: () => session,
        showToast,
      });
    }
    if (global.HwTeacherLanternWords?.init) {
      HwTeacherLanternWords.init({
        getTeacherSession: () => session,
        showToast,
      });
    }

    const searchInput = document.getElementById("hw-library-search");
    if (!catalogCache) {
      try {
        catalogCache = await fetchCatalog();
      } catch {
        const meta = document.getElementById("hw-library-meta");
        if (meta) meta.textContent = "Could not load worksheet library.";
        if (global.HwTeacherEditor?.bootstrap) await HwTeacherEditor.bootstrap();
        return;
      }
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

    if (searchInput && !librarySearchBound) {
      librarySearchBound = true;
      searchInput.addEventListener("input", () => {
        const id = window.location.hash.replace(/^#hw-/, "");
        renderLibraryList(entries, searchInput.value, id);
      });
    }

    renderLibraryList(entries, searchInput ? searchInput.value : "", hashId);

    if (hashId) {
      if (activateTeacherTab) activateTeacherTab("maker");
      await openInTeacherEditor(hashId);
    }
  }

  function assignmentRecencyKey(entry) {
    return String(entry?.publishedAt || entry?.date || entry?.id || "");
  }

  function guessedAssignmentId() {
    const hashId = window.location.hash.replace(/^#hw-/, "");
    if (hashId) return hashId;
    const cached = readSessionJson(CATALOG_SESSION_KEY);
    const user = session?.username;
    if (user && cached?.data?.studentProfiles?.[user]?.currentHomeworkId) {
      return cached.data.studentProfiles[user].currentHomeworkId;
    }
    const mem = catalogCache?.studentProfiles?.[user]?.currentHomeworkId;
    return mem || null;
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

  async function loadStudentHub(options) {
    options = options || {};
    const loadGen = ++studentHubLoadGen;
    const isStale = () => loadGen !== studentHubLoadGen;

    document.body.classList.add("hw-role-student");

    const teacherHub = document.getElementById("hw-teacher-hub");
    const studentOnly = document.getElementById("hw-platform-student-only");
    if (teacherHub) teacherHub.hidden = true;
    if (studentOnly) studentOnly.hidden = false;

    const mount = document.getElementById("hw-worksheet-mount");
    const heading = document.getElementById("hw-worksheet-heading");
    const intro = document.getElementById("hw-worksheet-intro");

    const hashId = window.location.hash.replace(/^#hw-/, "");
    const guessId = options.skipWorksheet ? null : guessedAssignmentId();
    const catalogPromise = fetchCatalog(
      options.bypassCache ? { bypassCache: true } : undefined
    );
    const speculativeId = hashId || guessId;
    const assignmentFetchOpts = studentAssignmentFetchOptions(options);
    const speculativeAssignmentPromise =
      speculativeId && !options.skipWorksheet
        ? fetchAssignmentJson(speculativeId, assignmentFetchOpts).catch(() => null)
        : null;

    let catalog;
    try {
      catalog = await catalogPromise;
    } catch {
      if (intro) intro.textContent = "Could not load homework catalog.";
      return;
    }
    if (isStale()) return;

    const user = session.username;
    const mine = (catalog.assignments || []).filter((a) => (a.students || []).includes(user));
    mine.sort((a, b) => assignmentRecencyKey(b).localeCompare(assignmentRecencyKey(a)));

    const currentId = catalog.studentProfiles?.[user]?.currentHomeworkId;
    const active =
      (hashId && mine.find((a) => a.id === hashId)) ||
      (currentId && mine.find((a) => a.id === currentId)) ||
      mine[0] ||
      null;

    renderCurrentAssignmentCard(mine, active?.id);
    setLessonLinks(active, catalog);
    renderUltraReviewPlaylist(catalog);
    bindPhotoUpload(active);
    bindVideoUpload(active);

    if (!active || !mount) {
      if (heading) heading.textContent = "Current homework";
      if (intro) intro.textContent = "No assignment is linked to your account yet.";
      mount.innerHTML = "";
      studentMountedAssignmentId = null;
      scheduleStudentMistakesLoad({
        background: Boolean(options.background),
        bypassCache: Boolean(options.bypassCache),
      });
      return;
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
      return;
    }

    let assignment = null;
    if (speculativeAssignmentPromise && active.id === speculativeId) {
      assignment = await speculativeAssignmentPromise;
      if (isStale()) return;
    }
    if (!assignment) {
      try {
        assignment = await fetchAssignmentJson(active.id, assignmentFetchOpts);
      } catch {
        if (intro) intro.textContent = "Could not load this worksheet.";
        scheduleStudentMistakesLoad({
          background: Boolean(options.background),
          bypassCache: Boolean(options.bypassCache),
        });
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

    const renderOptions = {
      studentMeta: {
        username: session.username || "",
        displayName: session.displayName || session.username || "",
        assignmentId: assignment.id || active.id,
        lessonName:
          assignment.lessonName || assignment.title || active.lessonName || active.title || active.id,
      },
    };

    function mountWorksheet(data) {
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
      return form;
    }

    mountWorksheet(assignment);
    studentMountedAssignmentId = active.id;

    scheduleStudentMistakesLoad({
      background: Boolean(options.background),
      bypassCache: Boolean(options.bypassCache),
    });

    if (
      global.HwFuriganaAuto?.annotateAssignment &&
      global.HwFuriganaAuto.assignmentNeedsAnnotation?.(assignment)
    ) {
      void (async () => {
        try {
          const annotated = JSON.parse(JSON.stringify(assignment));
          const annotate = global.HwFuriganaAuto.annotateAssignment(annotated);
          const timed = global.HwFuriganaAuto.withTimeout
            ? global.HwFuriganaAuto.withTimeout(annotate, 8000, "reading-timeout")
            : annotate;
          await timed;
          mountWorksheet(annotated);
        } catch (err) {
          console.warn("Hover readings skipped:", err);
        }
      })();
    }
  }

  function ensureTeacherEditorMounted() {
    if (!isTeacher) return;
    initTeacherEditor();
  }

  function init() {
    if (!global.HwWorksheet?.render) {
      const mount = document.getElementById("hw-worksheet-mount");
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
      initTeacherEditor();
      void loadTeacherHub();
      requestAnimationFrame(ensureTeacherEditorMounted);
      setTimeout(ensureTeacherEditorMounted, 0);
    } else {
      renderAccountBar();
      renderStudentHubHeader();
      renderGamesHubCard();
      bindWeeklyUpgradeCard();
      loadStudentHub();
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
    }
  }

  init();
})();
