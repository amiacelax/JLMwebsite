/**
 * Teacher worksheet maker (neutral) + homework publish (per student).
 */
(function (global) {
  const DEFAULT_STUDENTS = [
    { username: "joshs", displayName: "Josh S" },
    { username: "benm", displayName: "Ben M" },
    { username: "deme", displayName: "Deme" },
    { username: "ivan", displayName: "Ivan" },
    { username: "benc", displayName: "benc" },
    { username: "noplan", displayName: "No Plan" },
  ];

  let catalogAssignments = [];
  let catalogStudentProfiles = {};
  let editingAssignmentId = null;
  let editorOptions = null;
  let worksheetBuilder = null;

  const FALLBACK_ASSIGNMENTS = {
    joshs: [{ id: "joshs-naitoikenai", title: "～ないといけない", students: ["joshs"] }],
    benm: [
      { id: "2026-06-05-ben-m", title: "形容詞の過去・否定 ＋ ほしい · どうだった？", students: ["benm"] },
      { id: "2026-05-22-ben-m", title: "～がほしい vs ～に～たい・～がたい", students: ["benm"] },
    ],
    deme: [{ id: "2026-05-22-deme", title: "～がほしい vs ～に～たい・～がたい", students: ["deme"] }],
  };

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function makeWorksheetId(grammarPoint) {
    const grammar = slugify(grammarPoint) || "homework";
    return "sheet-" + grammar;
  }

  function grammarItem(n) {
    const id = "s1-" + n;
    return {
      id,
      parts: [
        { type: "text", value: "" },
        {
          type: "blank",
          name: id,
          wide: true,
          answer: "",
          hint: { dictionary: "", conjugation: "Now-later" },
        },
      ],
    };
  }

  /** Section 2 — three open blanks (not auto-graded). */
  function section2Item(n) {
    const id = "s2-" + n;
    return {
      id,
      parts: [{ type: "blank", name: id, wide: true }],
    };
  }

  function buildEmptyAssignment(meta) {
    const grammarPoint = meta.grammarPoint || "Homework";
    return {
      id: makeWorksheetId(grammarPoint),
      title: grammarPoint,
      youtubeUrl: "",
      register: "casual",
      status: "draft",
      forSale: false,
      salePrice: 0.99,
      sections: [
        {
          id: "grammar",
          title: "Section 1 — Grammar point",
          instructions:
            "Fill in the blank with the correct grammar form. The hint under each blank shows the dictionary form (and conjugation when needed).",
          mode: "grammar-blank",
          items: [1, 2, 3, 4, 5].map(grammarItem),
        },
        {
          id: "context",
          title: "Section 2 — Your words",
          instructions:
            "Write your own sentences using this grammar in the boxes below.",
          mode: "context-blank",
          items: [1, 2, 3].map(section2Item),
        },
      ],
    };
  }

  function readMakerMeta(form) {
    const grammarPoint = String(
      form.querySelector('[name="grammarPoint"]')?.value || ""
    ).trim();
    return { grammarPoint };
  }

  function readAccountMedia(form) {
    if (!form) {
      return { studentUsername: "", youtubeUrl: "", lessonPlaylistUrl: "" };
    }
    return {
      studentUsername: String(
        form.querySelector('[name="studentUsername"]')?.value || ""
      )
        .trim()
        .toLowerCase(),
      youtubeUrl: String(form.querySelector('[name="youtubeUrl"]')?.value || "").trim(),
      lessonPlaylistUrl: String(
        form.querySelector('[name="lessonPlaylistUrl"]')?.value || ""
      ).trim(),
    };
  }

  function getAccountForm() {
    return document.getElementById("hw-teacher-account-form");
  }

  function applyStudentProfileFields(form, studentUsername) {
    if (!form) return;
    const student = String(studentUsername || "").toLowerCase();
    const profile = catalogStudentProfiles[student] || {};
    const youtubeInput = form.querySelector('[name="youtubeUrl"]');
    const playlistInput = form.querySelector('[name="lessonPlaylistUrl"]');
    if (youtubeInput) {
      youtubeInput.value = profile.latestLessonUrl || profile.youtubeUrl || "";
    }
    if (playlistInput) {
      playlistInput.value = profile.lessonPlaylistUrl || profile.reviewPlaylistUrl || "";
    }
  }

  function getCatalogEntry(id) {
    return catalogAssignments.find((e) => e.id === id) || null;
  }

  function allAssignments() {
    if (catalogAssignments.length) return catalogAssignments;
    const out = [];
    Object.keys(FALLBACK_ASSIGNMENTS).forEach((key) => {
      FALLBACK_ASSIGNMENTS[key].forEach((e) => out.push(e));
    });
    return out;
  }

  function normalizeAssignmentPayload(data) {
    if (!data) return null;
    if (data.sections && Array.isArray(data.sections)) return data;
    if (data.assignment && data.assignment.sections) return data.assignment;
    return data;
  }

  async function fetchAssignmentWithFallback(id) {
    if (editorOptions?.fetchAssignmentJson) {
      try {
        const raw = await editorOptions.fetchAssignmentJson(id);
        const assignment = normalizeAssignmentPayload(raw);
        if (assignment?.sections?.length) return assignment;
      } catch {
        /* try static file */
      }
    }
    const res = await fetch(
      "/homework/assignments/" + encodeURIComponent(id) + ".json",
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("not found");
    const assignment = normalizeAssignmentPayload(await res.json());
    if (!assignment?.sections?.length) throw new Error("empty");
    return assignment;
  }

  function worksheetOptionLabel(entry) {
    const students = (entry.students || []).filter(Boolean);
    const who = students.length ? students.join(", ") : "any student";
    return (entry.title || entry.id) + " (" + entry.id + ") — " + who;
  }

  function populateWorksheetSelect(selectEl, keepId) {
    if (!selectEl) return;
    const list = allAssignments().sort((a, b) =>
      String(b.date || b.id).localeCompare(String(a.date || a.id))
    );
    const keep = keepId || selectEl.value;
    selectEl.innerHTML =
      '<option value="">— New blank sheet —</option>' +
      list
        .map((e) => {
          return (
            '<option value="' +
            e.id +
            '"' +
            (e.id === keep ? " selected" : "") +
            ">" +
            worksheetOptionLabel(e) +
            "</option>"
          );
        })
        .join("");
  }

  function populatePublishWorksheetSelect(selectEl, keepId) {
    if (!selectEl) return;
    const list = allAssignments().sort((a, b) =>
      String(b.date || b.id).localeCompare(String(a.date || a.id))
    );
    const keep = keepId || selectEl.value;
    selectEl.innerHTML =
      '<option value="">— Choose worksheet —</option>' +
      list
        .map((e) => {
          return (
            '<option value="' +
            e.id +
            '"' +
            (e.id === keep ? " selected" : "") +
            ">" +
            worksheetOptionLabel(e) +
            "</option>"
          );
        })
        .join("");
  }

  async function ensureCatalogLoaded() {
    if (catalogAssignments.length) return catalogAssignments;
    if (!editorOptions?.fetchCatalog) return catalogAssignments;
    try {
      const data = await editorOptions.fetchCatalog();
      catalogAssignments = data.assignments || [];
      catalogStudentProfiles = data.studentProfiles || {};
    } catch {
      /* use FALLBACK_ASSIGNMENTS */
    }
    return catalogAssignments;
  }

  function init(options) {
    editorOptions = options;
    const makerForm = document.getElementById("hw-teacher-maker-form");
    const makerMount = document.getElementById("hw-teacher-maker-mount");
    const makerStatusEl = document.getElementById("hw-teacher-maker-status");
    const makerSaveBtn = document.getElementById("hw-teacher-maker-save-btn");
    const makerUpdateBtn = document.getElementById("hw-teacher-maker-update-btn");
    const makerResetBtn = document.getElementById("hw-teacher-maker-reset-btn");
    const makerEditSelect = document.getElementById("hw-teacher-maker-edit-select");
    const makerSaveBar = document.getElementById("hw-teacher-maker-save-bar");
    const makerEditingNote = document.getElementById("hw-teacher-maker-editing-note");

    const publishForm = document.getElementById("hw-teacher-publish-form");
    const publishStudent = document.getElementById("hw-teacher-publish-student");
    const publishWorksheet = document.getElementById("hw-teacher-publish-worksheet");
    const publishSendBtn = document.getElementById("hw-teacher-send-btn");
    const publishStatusEl = document.getElementById("hw-teacher-publish-status");
    const publishHint = document.getElementById("hw-teacher-publish-hint");

    const accountForm = getAccountForm();
    const accountStatusEl = document.getElementById("hw-teacher-account-status");
    const accountSaveBtn = document.getElementById("hw-teacher-account-save-btn");
    const accountStudentSelect = document.getElementById("hw-teacher-account-student");

    const showToast = options.showToast || function () {};
    const getTeacherSession = options.getTeacherSession || function () {
      return null;
    };
    const getStudentAccounts = options.getStudentAccounts || function () {
      return [];
    };
    const isStudentAccount = options.isStudentAccount || function () {
      return true;
    };

    if (!makerForm || !makerMount) return;

    if (!global.HwWorksheet?.render) {
      makerMount.innerHTML =
        '<p class="hw-maker-preview-empty">Worksheet editor failed to load. Hard refresh (Ctrl+Shift+R).</p>';
      return;
    }

    function setMakerStatus(msg, isError) {
      if (!makerStatusEl) return;
      makerStatusEl.textContent = msg;
      makerStatusEl.classList.toggle("hw-maker-status--error", !!isError);
    }

    function setPublishStatus(msg, isError) {
      if (!publishStatusEl) return;
      publishStatusEl.textContent = msg;
      publishStatusEl.classList.toggle("hw-maker-status--error", !!isError);
    }

    function setAccountStatus(msg, isError) {
      if (!accountStatusEl) return;
      accountStatusEl.textContent = msg;
      accountStatusEl.classList.toggle("hw-maker-status--error", !!isError);
    }

    function updateMakerEditUI() {
      const isEdit = Boolean(editingAssignmentId);
      if (makerSaveBtn) makerSaveBtn.hidden = isEdit;
      if (makerSaveBar) makerSaveBar.hidden = !isEdit;
      if (makerEditingNote && isEdit) {
        makerEditingNote.textContent =
          "Editing “" + editingAssignmentId + "” — change the worksheet below, then update.";
      }
    }

    function clearEditMode() {
      editingAssignmentId = null;
      if (makerEditSelect) makerEditSelect.value = "";
      updateMakerEditUI();
    }

    function updatePublishHint() {
      if (!publishHint || !publishStudent || !publishWorksheet) return;
      const student = String(publishStudent.value || "").toLowerCase();
      const id = publishWorksheet.value;
      if (!student || !id) {
        publishHint.textContent = "Choose a student and worksheet, then send.";
        return;
      }
      const entry = getCatalogEntry(id);
      const assigned = (entry?.students || []).some(
        (s) => String(s).toLowerCase() === student
      );
      const builder = ensureBuilder();
      const canvasId =
        editingAssignmentId ||
        makerEditSelect?.value ||
        builder?.getCanvasAssignmentId?.() ||
        null;
      const hasBlocks = (builder?.getState?.().blocks?.length || 0) > 0;
      let hint = assigned
        ? "On " + student + "'s hub."
        : "Will add to " + student + "'s hub.";
      const others = (entry?.students || [])
        .map((s) => String(s).toLowerCase())
        .filter((s) => s && s !== student);
      if (others.length) {
        hint += " Also shared with: " + others.join(", ") + ".";
      }
      hint += " Same sheet can go to multiple students.";
      if (hasBlocks && canvasId !== id) {
        hint += ' Open "' + id + '" in Worksheet maker first to include unsaved canvas edits.';
      } else if (hasBlocks && canvasId === id) {
        hint += " Send includes your open worksheet (saved automatically first).";
      }
      publishHint.textContent = hint;
    }

    function ensureBuilder() {
      if (worksheetBuilder || !global.HwWorksheetBuilder?.mount || !makerMount) return worksheetBuilder;
      makerMount.innerHTML = "";
      worksheetBuilder = global.HwWorksheetBuilder.mount(makerMount, {
        getTitle: () => readMakerMeta(makerForm).grammarPoint || "Homework",
        onChange: () => {
          if (worksheetBuilder?.isPreviewOpen?.()) {
            worksheetBuilder.showPreview(readMakerMeta(makerForm).grammarPoint || "Homework");
          }
          updatePublishHint();
        },
      });
      makerMount.dataset.builderReady = "true";
      return worksheetBuilder;
    }

    function renderSheet(templateKey) {
      const builder = ensureBuilder();
      if (!builder) return;
      if (templateKey && global.HwWorksheetBuilder?.TEMPLATES?.[templateKey]) {
        builder.applyTemplate(templateKey);
      } else if (!builder.getState?.().blocks?.length) {
        builder.applyTemplate("blank");
      }
      clearEditMode();
    }

    function loadIntoEditor(assignment, catalogEntry) {
      if (!assignment) return;
      const builder = ensureBuilder();
      if (!builder) return;

      editingAssignmentId = assignment.id || catalogEntry?.id || null;

      const grammarInput = makerForm.querySelector('[name="grammarPoint"]');
      if (grammarInput) {
        grammarInput.value = assignment.title || catalogEntry?.title || "";
      }

      builder.loadAssignment(assignment);

      if (makerEditSelect && editingAssignmentId) {
        makerEditSelect.value = editingAssignmentId;
      }
      updateMakerEditUI();
      setMakerStatus(
        "Loaded “" + editingAssignmentId + "” — edit below, then update saved worksheet."
      );
      makerMount.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function loadAssignmentById(id) {
      if (!id) {
        clearEditMode();
        renderSheet("blank");
        setMakerStatus("Blank canvas — add a section or pick a template, then save.");
        return;
      }
      setMakerStatus("Loading " + id + "…");
      try {
        const assignment = await fetchAssignmentWithFallback(id);
        const entryFn = options.getCatalogEntry || getCatalogEntry;
        loadIntoEditor(assignment, entryFn(id));
        showToast("Loaded " + id);
      } catch {
        setMakerStatus("Could not load " + id + ".", true);
        showToast("Load failed");
      }
    }

    function validateWorksheet(assignment) {
      if (!assignment?.sections?.length) return false;

      const grammar = assignment.sections.find((s) => s.mode === "grammar-blank");
      if (
        grammar?.items?.some((item) =>
          (item.parts || []).some((p) => p.type === "blank")
        )
      ) {
        return true;
      }

      const video = assignment.sections.find((s) => s.mode === "video-response");
      if (video?.items?.length) return true;

      const listening = assignment.sections.find((s) => s.mode === "audio-listening");
      if (listening?.items?.length) return true;

      const context = assignment.sections.find((s) => s.mode === "context-blank");
      if (context?.items?.length) return true;

      return false;
    }

    async function saveWorksheetToLibrary(isUpdate) {
      const meta = readMakerMeta(makerForm);
      if (!meta.grammarPoint) {
        setMakerStatus("Enter a grammar point / title.", true);
        return;
      }

      const session = getTeacherSession();
      if (!session || session.role !== "teacher") {
        setMakerStatus("Teacher login required.", true);
        return;
      }

      const builder = ensureBuilder();
      if (!builder?.toAssignment) {
        setMakerStatus("Worksheet builder not ready.", true);
        return;
      }

      const assignment = builder.toAssignment({
        id:
          isUpdate && editingAssignmentId
            ? editingAssignmentId
            : makeWorksheetId(meta.grammarPoint),
        title: meta.grammarPoint,
      });
      assignment.id =
        isUpdate && editingAssignmentId
          ? editingAssignmentId
          : makeWorksheetId(meta.grammarPoint);
      assignment.title = meta.grammarPoint;
      assignment.status = "draft";

      if (!validateWorksheet(assignment)) {
        setMakerStatus(
          "Add at least one block with content — blank sentence, video prompt, or listening line.",
          true
        );
        return;
      }

      const catalogEntry = {
        id: assignment.id,
        title: meta.grammarPoint,
        lessonName: meta.grammarPoint,
        students: (getCatalogEntry(assignment.id)?.students || []).slice(),
        forSale: false,
        salePrice: 0.99,
        summary: "Worksheet: " + meta.grammarPoint,
      };

      const activeBtn = isUpdate ? makerUpdateBtn : makerSaveBtn;
      if (activeBtn) activeBtn.disabled = true;
      setMakerStatus((isUpdate ? "Updating " : "Saving ") + assignment.id + "…");

      try {
        const res = await fetch("/api/homework-save-worksheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherUsername: session.username,
            assignment,
            catalogEntry,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Save failed.");

        editingAssignmentId = assignment.id;
        if (makerEditSelect) makerEditSelect.value = assignment.id;
        updateMakerEditUI();
        populateWorksheetSelect(makerEditSelect, assignment.id);
        populatePublishWorksheetSelect(publishWorksheet, assignment.id);

        setMakerStatus(data.message || "Saved to library.");
        showToast(isUpdate ? "Worksheet updated" : "Saved to library");
        if (options.onWorksheetSaved) options.onWorksheetSaved(assignment.id);
      } catch (err) {
        setMakerStatus((err && err.message) || "Could not save.", true);
        showToast("Save failed");
      } finally {
        if (activeBtn) activeBtn.disabled = false;
      }
    }

    async function persistAssignmentDraft(session, assignment, entry) {
      const catalogEntry = {
        id: assignment.id,
        title: assignment.title || entry.title || assignment.id,
        lessonName: assignment.title || entry.lessonName || entry.title,
        students: (entry.students || []).slice(),
        youtubeUrl: entry.youtubeUrl || assignment.youtubeUrl || "",
        forSale: entry.forSale === true,
        salePrice: entry.salePrice ?? 0.99,
        summary: entry.summary || "Worksheet: " + (assignment.title || assignment.id),
        date: entry.date,
        publishedAt: entry.publishedAt,
      };
      const res = await fetch("/api/homework-save-worksheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: session.username,
          assignment: { ...assignment, status: assignment.status || "draft" },
          catalogEntry,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save worksheet before send.");
    }

    async function resolveAssignmentForPublish(worksheetId) {
      const entry = (options.getCatalogEntry || getCatalogEntry)(worksheetId) || {};
      const builder = ensureBuilder();
      const makerSelectId = makerEditSelect?.value;
      const canvasId = builder?.getCanvasAssignmentId?.() || null;
      const meta = readMakerMeta(makerForm);
      const hasBlocks = (builder?.getState?.().blocks?.length || 0) > 0;
      const useLiveBuilder =
        builder?.toAssignment &&
        hasBlocks &&
        (editingAssignmentId === worksheetId ||
          makerSelectId === worksheetId ||
          canvasId === worksheetId);

      if (useLiveBuilder) {
        const assignment = builder.toAssignment({
          id: worksheetId,
          title: meta.grammarPoint || entry.title || worksheetId,
        });
        assignment.id = worksheetId;
        return { assignment, usedLiveBuilder: true, entry };
      }

      const assignment = await fetchAssignmentWithFallback(worksheetId);
      return { assignment, usedLiveBuilder: false, entry };
    }

    async function publishWorksheetToStudent() {
      const student = String(publishStudent?.value || "")
        .trim()
        .toLowerCase();
      const worksheetId = String(publishWorksheet?.value || "").trim();

      if (!student) {
        setPublishStatus("Choose a student to publish to.", true);
        return;
      }
      if (!worksheetId) {
        setPublishStatus("Choose a worksheet from the library.", true);
        return;
      }
      if (!isStudentAccount(student)) {
        setPublishStatus('Unknown student id "' + student + '".', true);
        return;
      }

      const session = getTeacherSession();
      if (!session || session.role !== "teacher") {
        setPublishStatus("Teacher login required.", true);
        return;
      }

      const media = readAccountMedia(accountForm);
      if (publishSendBtn) publishSendBtn.disabled = true;
      setPublishStatus("Sending “" + worksheetId + "” to " + student + "…");

      try {
        const resolved = await resolveAssignmentForPublish(worksheetId);
        const assignment = resolved.assignment;
        const entry = resolved.entry || (options.getCatalogEntry || getCatalogEntry)(worksheetId) || {};
        assignment.status = "published";
        assignment.id = worksheetId;

        if (!validateWorksheet(assignment)) {
          setPublishStatus(
            "This worksheet needs content — add blocks in Worksheet maker first.",
            true
          );
          return;
        }

        if (resolved.usedLiveBuilder) {
          setPublishStatus("Saving latest edits, then sending to " + student + "…");
          await persistAssignmentDraft(session, assignment, entry);
        }

        const catalogEntry = {
          id: worksheetId,
          title: assignment.title || entry.title || worksheetId,
          lessonName: assignment.title || entry.lessonName || entry.title,
          students: [student],
          youtubeUrl: media.youtubeUrl || entry.youtubeUrl || assignment.youtubeUrl || "",
          forSale: entry.forSale === true,
          salePrice: entry.salePrice ?? 0.99,
          summary: entry.summary || "Homework: " + (assignment.title || worksheetId),
          date: entry.date || new Date().toISOString().slice(0, 10),
        };

        const res = await fetch("/api/homework-publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherUsername: session.username,
            studentUsername: student,
            assignment,
            catalogEntry,
            youtubeUrl: media.youtubeUrl,
            lessonPlaylistUrl: media.lessonPlaylistUrl,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Publish failed.");

        setPublishStatus(
          (data.message || "Sent to " + student + "!") +
            " This is now their current homework on the hub."
        );
        showToast("Current homework set for " + student);
        updatePublishHint();
        if (options.onPublished) await options.onPublished(worksheetId, student);
      } catch (err) {
        setPublishStatus((err && err.message) || "Could not publish.", true);
        showToast("Send failed");
      } finally {
        if (publishSendBtn) publishSendBtn.disabled = false;
      }
    }

    async function saveAccountProfile() {
      const media = readAccountMedia(accountForm);
      if (!media.studentUsername) {
        setAccountStatus("Pick a student.", true);
        return;
      }
      if (!isStudentAccount(media.studentUsername)) {
        setAccountStatus('Unknown student id "' + media.studentUsername + '".', true);
        return;
      }

      const session = getTeacherSession();
      if (!session || session.role !== "teacher") {
        setAccountStatus("Teacher login required.", true);
        return;
      }

      if (accountSaveBtn) accountSaveBtn.disabled = true;
      setAccountStatus("Saving " + media.studentUsername + "'s links…");

      try {
        const res = await fetch("/api/homework-student-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherUsername: session.username,
            studentUsername: media.studentUsername,
            youtubeUrl: media.youtubeUrl,
            lessonPlaylistUrl: media.lessonPlaylistUrl,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Save failed.");

        catalogStudentProfiles[media.studentUsername] = {
          ...(catalogStudentProfiles[media.studentUsername] || {}),
          latestLessonUrl: media.youtubeUrl || undefined,
          youtubeUrl: media.youtubeUrl || undefined,
          lessonPlaylistUrl: media.lessonPlaylistUrl || undefined,
        };

        setAccountStatus(data.message || "Saved!");
        showToast("Student info saved");
      } catch (err) {
        setAccountStatus((err && err.message) || "Could not save.", true);
        showToast("Save failed");
      } finally {
        if (accountSaveBtn) accountSaveBtn.disabled = false;
      }
    }

    if (makerForm.dataset.bound !== "true") {
      makerForm.dataset.bound = "true";
      makerForm.addEventListener("submit", (e) => e.preventDefault());

      makerEditSelect?.addEventListener("focus", async () => {
        await ensureCatalogLoaded();
        populateWorksheetSelect(makerEditSelect, makerEditSelect.value);
      });

      makerEditSelect?.addEventListener("change", () => {
        if (makerEditSelect.value) loadAssignmentById(makerEditSelect.value);
        else {
          clearEditMode();
          renderSheet("blank");
        }
      });

      makerForm.querySelector('[name="grammarPoint"]')?.addEventListener("input", () => {
        const gp = readMakerMeta(makerForm).grammarPoint;
        if (worksheetBuilder?.isPreviewOpen?.()) {
          worksheetBuilder.showPreview(gp || "Homework");
        }
      });

      makerResetBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        clearEditMode();
        renderSheet("blank");
        setMakerStatus("Blank canvas — add a section or pick a template, then save.");
        showToast("New sheet");
      });

      makerSaveBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        saveWorksheetToLibrary(false);
      });

      makerUpdateBtn?.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = editingAssignmentId || makerEditSelect?.value;
        if (!id) {
          setMakerStatus("Load a worksheet first, or save a new one.", true);
          return;
        }
        if (!editingAssignmentId || !worksheetBuilder) {
          await loadAssignmentById(id);
        }
        if (!editingAssignmentId) return;
        saveWorksheetToLibrary(true);
      });
    }

    if (publishForm && publishForm.dataset.bound !== "true") {
      publishForm.dataset.bound = "true";
      publishForm.addEventListener("submit", (e) => e.preventDefault());

      const accounts = getStudentAccounts();
      const students = accounts.length ? accounts : DEFAULT_STUDENTS;
      if (publishStudent) {
        students.forEach((a) => {
          if (publishStudent.querySelector('option[value="' + a.username + '"]')) return;
          const opt = document.createElement("option");
          opt.value = a.username;
          opt.textContent = a.username + (a.displayName ? " — " + a.displayName : "");
          publishStudent.appendChild(opt);
        });
      }

      publishWorksheet?.addEventListener("focus", async () => {
        await ensureCatalogLoaded();
        populatePublishWorksheetSelect(publishWorksheet, publishWorksheet.value);
      });

      publishStudent?.addEventListener("change", updatePublishHint);
      publishWorksheet?.addEventListener("change", updatePublishHint);

      publishSendBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        publishWorksheetToStudent();
      });
    }

    if (accountForm && accountForm.dataset.bound !== "true") {
      accountForm.dataset.bound = "true";
      accountForm.addEventListener("submit", (e) => e.preventDefault());

      const accounts = getStudentAccounts();
      const students = accounts.length ? accounts : DEFAULT_STUDENTS;
      if (accountStudentSelect) {
        students.forEach((a) => {
          if (accountStudentSelect.querySelector('option[value="' + a.username + '"]')) return;
          const opt = document.createElement("option");
          opt.value = a.username;
          opt.textContent = a.username + (a.displayName ? " — " + a.displayName : "");
          accountStudentSelect.appendChild(opt);
        });
      }

      accountStudentSelect?.addEventListener("change", async () => {
        await ensureCatalogLoaded();
        applyStudentProfileFields(accountForm, accountStudentSelect.value);
        setAccountStatus("Loaded " + accountStudentSelect.value + "'s saved links.");
      });

      accountSaveBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        saveAccountProfile();
      });
    }

    updateMakerEditUI();
    ensureBuilder();
    if (!worksheetBuilder?.getState?.().blocks?.length) {
      renderSheet("blank");
    }
    setMakerStatus("Blank canvas — click or drag blocks to build your sheet.");

    ensureCatalogLoaded().then(() => {
      populateWorksheetSelect(makerEditSelect);
      populatePublishWorksheetSelect(publishWorksheet);
      applyStudentProfileFields(accountForm, accountStudentSelect?.value);
    });
  }

  function refreshCatalog(assignments, studentProfiles) {
    catalogAssignments = assignments || [];
    if (studentProfiles) catalogStudentProfiles = studentProfiles;
    populateWorksheetSelect(document.getElementById("hw-teacher-maker-edit-select"));
    populatePublishWorksheetSelect(document.getElementById("hw-teacher-publish-worksheet"));
    applyStudentProfileFields(
      getAccountForm(),
      document.getElementById("hw-teacher-account-student")?.value
    );
  }

  function bootstrap() {
    return ensureCatalogLoaded().then(() => {
      populateWorksheetSelect(document.getElementById("hw-teacher-maker-edit-select"));
      populatePublishWorksheetSelect(document.getElementById("hw-teacher-publish-worksheet"));
      applyStudentProfileFields(
        getAccountForm(),
        document.getElementById("hw-teacher-account-student")?.value
      );
    });
  }

  function loadAssignment(assignment, catalogEntry) {
    const makerForm = document.getElementById("hw-teacher-maker-form");
    if (!makerForm || makerForm.dataset.bound !== "true") {
      init(editorOptions || {});
    }
    const mount = document.getElementById("hw-teacher-maker-mount");
    if (!mount || !assignment) return;

    editingAssignmentId = assignment.id || catalogEntry?.id || null;
    const grammarInput = makerForm?.querySelector('[name="grammarPoint"]');
    if (grammarInput) {
      grammarInput.value = assignment.title || catalogEntry?.title || "";
    }

    if (global.HwWorksheetBuilder?.mount) {
      if (!worksheetBuilder) {
        worksheetBuilder = global.HwWorksheetBuilder.mount(mount, {
          getTitle: () => assignment.title || "",
        });
      }
      worksheetBuilder.loadAssignment(assignment);
    }

    const editSelect = document.getElementById("hw-teacher-maker-edit-select");
    const saveBar = document.getElementById("hw-teacher-maker-save-bar");
    const saveBtn = document.getElementById("hw-teacher-maker-save-btn");
    const editingNote = document.getElementById("hw-teacher-maker-editing-note");
    if (editSelect && editingAssignmentId) editSelect.value = editingAssignmentId;
    if (saveBtn) saveBtn.hidden = Boolean(editingAssignmentId);
    if (saveBar) saveBar.hidden = !editingAssignmentId;
    if (editingNote && editingAssignmentId) {
      editingNote.textContent =
        "Editing “" + editingAssignmentId + "” — change the worksheet below, then update.";
    }
    populateWorksheetSelect(editSelect, editingAssignmentId);
  }

  function syncPublishPicker() {
    const publishSelect = document.getElementById("hw-teacher-publish-worksheet");
    if (!publishSelect || !editingAssignmentId) return;
    if (publishSelect.querySelector('option[value="' + editingAssignmentId + '"]')) {
      publishSelect.value = editingAssignmentId;
    }
    const publishStudent = document.getElementById("hw-teacher-publish-student");
    const accountStudent = document.getElementById("hw-teacher-account-student");
    if (publishStudent && accountStudent?.value && !publishStudent.value) {
      publishStudent.value = accountStudent.value;
    }
  }

  global.HwTeacherEditor = {
    init,
    refreshCatalog,
    bootstrap,
    loadAssignment,
    syncPublishPicker,
    buildEmptyAssignment,
  };
})(window);
