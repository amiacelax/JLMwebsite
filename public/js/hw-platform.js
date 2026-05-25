/**
 * Homework platform — student hub (assignments + submit) or teacher hub (worksheet library).
 */
(function () {
  const session = HwAuth.getSession();
  if (!session) return;

  const isTeacher = session.role === "teacher";

  const VIDEO_RESPONSE_DESC =
    "Receive detailed, enriching video feedback from JD on each homework assignment.";

  const greet = document.getElementById("hw-platform-greet");
  if (greet) {
    greet.textContent = session.displayName + (isTeacher ? " · Teacher" : "");
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
    tierPill.textContent = session.tierDisplay || HwAuth.getTierMeta(session)?.name || "—";

    badges.append(labelPill, tierPill);
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

  function renderVideoResponseCard(catalog) {
    const card = document.getElementById("hw-video-response-card");
    const desc = document.getElementById("hw-video-response-desc");
    const footer = document.getElementById("hw-video-response-footer");
    if (!footer) return;
    footer.replaceChildren();

    const media = getStudentMedia(catalog);
    const price = document.createElement("span");
    price.className = "course-card__price";
    price.setAttribute("aria-label", "Price: " + HwAuth.VIDEO_RESPONSE_ADDON_PRICE + " dollars per month");

    if (HwAuth.hasVideoResponseAccess(session)) {
      card?.classList.add("hw-addon-card--active");
      if (desc) desc.textContent = VIDEO_RESPONSE_DESC + " Open your review playlist below.";
      price.textContent = "✓";
      price.setAttribute("aria-label", "Video responses included");

      const playlistUrl = media.reviewPlaylistUrl;
      if (isYoutubeReady(playlistUrl)) {
        footer.append(
          courseStatusLink("Playlist", "Open", playlistUrl, "Open HW Review Playlist on YouTube"),
          price
        );
      } else {
        footer.append(
          courseStatusButton("Soon", "Soon", null, "HW Review Playlist coming soon"),
          price
        );
        footer.querySelector("button")?.setAttribute("disabled", "true");
      }
      return;
    }

    card?.classList.remove("hw-addon-card--active");
    price.textContent = "$" + HwAuth.VIDEO_RESPONSE_ADDON_PRICE;

    if (HwAuth.canOfferVideoUnlock(session)) {
      if (desc) desc.textContent = VIDEO_RESPONSE_DESC;
      const videoPaypal = HwAuth.PAYPAL?.videoFeedback;
      footer.append(
        videoPaypal
          ? courseStatusLink(
              "Locked",
              "Subscribe",
              videoPaypal,
              "Subscribe to Video Feedback HW — fifteen dollars per four weeks"
            )
          : courseStatusButton("Locked", "Soon", null, "Video feedback subscription link coming soon"),
        price
      );
      return;
    }

    if (desc) desc.textContent = VIDEO_RESPONSE_DESC + " Included on Unlimited (Tier 3).";
    footer.append(
      courseStatusButton("Tier 3", "Tier 3", null, "Video responses require Unlimited tier"),
      price
    );
    footer.querySelector("button")?.setAttribute("disabled", "true");
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
      entry.level,
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

  async function fetchCatalog() {
    const res = await fetch("/homework/catalog.json", { cache: "no-store" });
    if (!res.ok) throw new Error("catalog");
    return res.json();
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
    const inputs = form.querySelectorAll(".hw-blank");
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      inputs.forEach((inp) => {
        if (inp.name && saved[inp.name] != null) inp.value = saved[inp.name];
      });
    } catch (_) {}

    const saveStatus = document.getElementById("hw-save-status");
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
      const report = HwWorksheet.checkHomework(form);
      HwWorksheet.renderCheckResults(form, report);
      const { correct, total } = report.score;

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const payload = HwWorksheet.buildSubmitPayload(
        form,
        {
          username: session.username,
          displayName: session.displayName,
          assignmentId,
          lessonName: submitMeta.lessonName,
          title: submitMeta.title || assignmentMeta.title,
          register: assignmentMeta.register,
        },
        report
      );

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
          saveStatus.textContent =
            data.message ||
            (total > 0
              ? "Submitted! Section 1: " + correct + "/" + total + ". JD received your answers."
              : "Submitted! JD received your answers.");
        }
        showToast("Sent to JD");
      } catch (err) {
        if (saveStatus) {
          saveStatus.textContent =
            (err && err.message) ||
            "Could not submit. Answers are still saved in this browser.";
        }
        showToast("Submit failed");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  async function loadWorksheetPreview(catalogEntry) {
    const mount = document.getElementById("hw-worksheet-mount");
    const heading = document.getElementById("hw-worksheet-heading");
    const intro = document.getElementById("hw-worksheet-intro");
    if (!mount || !catalogEntry) return;

    let assignment;
    try {
      const res = await fetch("/homework/assignments/" + catalogEntry.id + ".json", { cache: "no-store" });
      if (!res.ok) throw new Error("assignment");
      assignment = await res.json();
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
    const pillsWrap = pillOnline?.closest(".hw-current-assignment__pills");

    if (!active) {
      if (pillsWrap) pillsWrap.hidden = true;
      return;
    }

    if (pillsWrap) pillsWrap.hidden = false;
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
      sub.textContent = [entry.date, entry.level, entry.lessonName || entry.studentLabel]
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

      actions.append(previewBtn, dl, copyJson, copyStudent);
      li.append(main, actions);
      list.appendChild(li);
    });
  }

  function bindPhotoUpload(activeAssignment) {
    const form = document.getElementById("hw-photo-upload-form");
    const fileInput = document.getElementById("hw-photo-file");
    const status = document.getElementById("hw-photo-upload-status");
    if (!form) return;
    form.dataset.assignmentId = activeAssignment?.id || "printed-homework";
    const photoMeta = activeAssignment
      ? studentViewMeta(null, activeAssignment)
      : { lessonName: "Printed homework" };
    form.dataset.lessonName = photoMeta.lessonName;
    if (form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = fileInput?.files?.[0];
      if (!file) {
        if (status) status.textContent = "Choose or take a photo first.";
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      if (status) status.textContent = "Uploading photo…";

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
        if (status) status.textContent = data.message || "Photo uploaded.";
        showToast("Photo uploaded");
        form.reset();
      } catch (err) {
        if (status) status.textContent = (err && err.message) || "Upload failed.";
        showToast("Photo upload failed");
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

  async function loadTeacherHub() {
    document.body.classList.add("hw-role-teacher");

    const hubTitle = document.getElementById("hw-hub-title");
    const hubDesc = document.getElementById("hw-hub-desc");
    const teacherLib = document.getElementById("hw-teacher-library");
    const teacherSubmissions = document.getElementById("hw-teacher-submissions");
    const studentGrid = document.getElementById("hw-student-grid");

    if (hubTitle) hubTitle.textContent = "Teacher's hub";
    if (hubDesc) {
      hubDesc.textContent =
        "Search and manage fillable homework templates. Preview blanks, download JSON, or copy links for students (benm demo = student test site).";
    }
    if (teacherLib) teacherLib.hidden = false;
    if (teacherSubmissions) teacherSubmissions.hidden = false;
    if (studentGrid) studentGrid.hidden = true;

    const searchInput = document.getElementById("hw-library-search");
    if (!catalogCache) {
      try {
        catalogCache = await fetchCatalog();
      } catch {
        const meta = document.getElementById("hw-library-meta");
        if (meta) meta.textContent = "Could not load worksheet catalog.";
        return;
      }
    }

    const entries = catalogCache.assignments || [];
    const hashId = window.location.hash.replace(/^#hw-/, "");
    const active = entries.find((e) => e.id === hashId) || entries[0] || null;

    if (searchInput && !librarySearchBound) {
      librarySearchBound = true;
      searchInput.addEventListener("input", () => {
        const id = window.location.hash.replace(/^#hw-/, "");
        renderLibraryList(entries, searchInput.value, id);
      });
    }

    renderLibraryList(entries, searchInput ? searchInput.value : "", active?.id);
    await loadWorksheetPreview(active);
  }

  async function loadStudentHub() {
    document.body.classList.add("hw-role-student");

    const mount = document.getElementById("hw-worksheet-mount");
    const heading = document.getElementById("hw-worksheet-heading");
    const intro = document.getElementById("hw-worksheet-intro");

    let catalog;
    try {
      catalog = await fetchCatalog();
    } catch {
      if (intro) intro.textContent = "Could not load homework catalog.";
      return;
    }

    const user = session.username;
    const mine = (catalog.assignments || []).filter((a) => (a.students || []).includes(user));
    mine.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const hashId = window.location.hash.replace(/^#hw-/, "");
    const active = mine.find((a) => a.id === hashId) || mine[0] || null;

    renderCurrentAssignmentCard(mine, active?.id);
    setLessonLinks(active, catalog);
    renderVideoResponseCard(catalog);
    bindPhotoUpload(active);

    if (!active || !mount) {
      if (heading) heading.textContent = "Current homework";
      if (intro) intro.textContent = "No assignment is linked to your account yet.";
      mount.innerHTML = "";
      return;
    }

    let assignment;
    try {
      const res = await fetch("/homework/assignments/" + active.id + ".json", { cache: "no-store" });
      if (!res.ok) throw new Error("assignment");
      assignment = await res.json();
    } catch {
      if (intro) intro.textContent = "Could not load this worksheet.";
      return;
    }

    const view = studentViewMeta(active, assignment);

    if (heading) heading.textContent = view.heading;
    if (intro) {
      intro.textContent =
        "Fill in the blanks, then Submit homework. Section 1 is auto-checked; Section 2 is sent to JD on Discord.";
    }

    const form = HwWorksheet.render(mount, assignment);
    bindWorksheetSave(form, assignment);
  }

  function init() {
    if (isTeacher) {
      loadTeacherHub();
      window.addEventListener("hashchange", loadTeacherHub);
    } else {
      renderAccountBar();
      bindWeeklyUpgradeCard();
      loadStudentHub();
      window.addEventListener("hashchange", loadStudentHub);
    }
  }

  init();
})();
