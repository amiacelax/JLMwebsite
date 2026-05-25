/**
 * Homework platform — student hub (assignments + submit) or teacher hub (worksheet library).
 */
(function () {
  const session = HwAuth.getSession();
  if (!session) return;

  const isTeacher = session.role === "teacher";

  const greet = document.getElementById("hw-platform-greet");
  if (greet) greet.textContent = session.displayName + (isTeacher ? " · Teacher" : "");

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

  function formatSubmissionDate(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch (_) {
      return iso;
    }
  }

  function formatFileSize(bytes) {
    const n = Number(bytes || 0);
    if (!n) return "";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
    return (n / 1024 / 1024).toFixed(1) + " MB";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
          lessonName: assignmentMeta.lessonName,
          title: assignmentMeta.title,
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

  function renderAssignmentList(assignments, currentId) {
    const list = document.getElementById("hw-assignment-list");
    if (!list) return;
    list.innerHTML = "";
    if (!assignments.length) {
      list.innerHTML =
        '<li class="hw-platform-card__row hw-platform-card__row--empty"><span>No assignments yet</span><button type="button" class="btn btn--ghost btn--sm" disabled>Open</button></li>';
      return;
    }
    assignments.forEach((a) => {
      const li = document.createElement("li");
      li.className = "hw-platform-card__row";
      const label = document.createElement("span");
      label.textContent = a.lessonName || (a.date || "") + " — " + (a.title || a.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--ghost btn--sm";
      btn.textContent = a.id === currentId ? "Open" : "View";
      if (a.id === currentId) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => {
          window.location.hash = "hw-" + a.id;
          loadStudentHub();
        });
      }
      li.append(label, btn);
      list.appendChild(li);
    });
  }

  function setLessonLinks(assignment, playlistUrl) {
    const lessonBtn = document.getElementById("hw-latest-lesson");
    const playlistLink = document.getElementById("hw-playlist-link");
    const lessonMeta = document.getElementById("hw-lesson-meta");

    if (lessonBtn) {
      if (assignment && isYoutubeReady(assignment.youtubeUrl)) {
        lessonBtn.href = assignment.youtubeUrl;
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

    if (lessonMeta && assignment) {
      lessonMeta.textContent =
        assignment.lessonName ||
        (assignment.date ? assignment.date + " · " : "") + (assignment.title || "");
    }

    if (playlistLink) {
      if (isYoutubeReady(playlistUrl)) {
        playlistLink.href = playlistUrl;
        playlistLink.hidden = false;
      } else {
        playlistLink.hidden = true;
      }
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

  async function loadTeacherSubmissions() {
    const panel = document.getElementById("hw-teacher-submissions");
    const list = document.getElementById("hw-submission-list");
    const meta = document.getElementById("hw-submissions-meta");
    if (!panel || !list) return;

    panel.hidden = false;
    list.innerHTML =
      '<li class="hw-submission-item hw-submission-item--empty"><p>Loading submissions…</p></li>';
    if (meta) meta.textContent = "";

    try {
      const res = await fetch("/api/homework-submissions", {
        cache: "no-store",
        headers: {
          "X-HW-Role": session.role || "",
          "X-HW-Username": session.username || "",
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load submissions.");
      renderTeacherSubmissions(data.submissions || []);
    } catch (err) {
      list.innerHTML =
        '<li class="hw-submission-item hw-submission-item--empty"><p>' +
        escapeHtml((err && err.message) || "Could not load submissions.") +
        "</p></li>";
      if (meta) meta.textContent = "Check R2 binding and Worker logs if this persists.";
    }
  }

  function renderTeacherSubmissions(submissions) {
    const list = document.getElementById("hw-submission-list");
    const meta = document.getElementById("hw-submissions-meta");
    if (!list) return;
    list.innerHTML = "";
    if (meta) {
      meta.textContent =
        submissions.length +
        " submission" +
        (submissions.length === 1 ? "" : "s") +
        " stored in Homework Hub.";
    }
    if (!submissions.length) {
      list.innerHTML =
        '<li class="hw-submission-item hw-submission-item--empty"><p>No submissions yet.</p></li>';
      return;
    }

    submissions.forEach((sub) => {
      const li = document.createElement("li");
      li.className = "hw-submission-item";
      const title = document.createElement("h3");
      title.className = "hw-submission-item__title";
      title.textContent =
        (sub.type === "photo" ? "Photo upload" : "Typed homework") +
        " — " +
        (sub.displayName || sub.username || "Student");
      const metaLine = document.createElement("p");
      metaLine.className = "hw-submission-item__meta";
      metaLine.textContent = [
        formatSubmissionDate(sub.submittedAt),
        sub.lessonName || sub.assignmentId,
        sub.score,
      ]
        .filter(Boolean)
        .join(" · ");
      const summary = document.createElement("p");
      summary.className = "hw-submission-item__summary";
      summary.textContent =
        sub.type === "photo"
          ? [sub.fileName, formatFileSize(sub.fileSize), sub.fileKey].filter(Boolean).join(" · ")
          : sub.summary || "Typed worksheet submission";
      const key = document.createElement("p");
      key.className = "hw-submission-item__key";
      key.textContent = "Record: " + (sub.jsonKey || sub.id);
      li.append(title, metaLine, summary, key);
      list.appendChild(li);
    });
  }

  function bindPhotoUpload(activeAssignment) {
    const form = document.getElementById("hw-photo-upload-form");
    const fileInput = document.getElementById("hw-photo-file");
    const status = document.getElementById("hw-photo-upload-status");
    if (!form) return;
    form.dataset.assignmentId = activeAssignment?.id || "printed-homework";
    form.dataset.lessonName =
      activeAssignment?.lessonName || activeAssignment?.title || "Printed homework";
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
    const refreshSubmissions = document.getElementById("hw-refresh-submissions");
    if (refreshSubmissions && refreshSubmissions.dataset.bound !== "true") {
      refreshSubmissions.dataset.bound = "true";
      refreshSubmissions.addEventListener("click", loadTeacherSubmissions);
    }

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
    await loadTeacherSubmissions();
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

    renderAssignmentList(mine, active?.id);
    setLessonLinks(active, catalog.playlistUrl);
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

    if (heading) {
      heading.textContent = active.studentLabel
        ? "Homework — " + active.studentLabel
        : "Current homework";
    }
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
      loadStudentHub();
      window.addEventListener("hashchange", loadStudentHub);
    }
  }

  init();
})();
