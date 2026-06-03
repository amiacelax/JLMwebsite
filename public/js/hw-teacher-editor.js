/**
 * Teacher homework editor — load, edit, publish or update on student hub.
 */
(function (global) {
  const DEFAULT_STUDENTS = [
    { username: "joshs", displayName: "Josh S" },
    { username: "benm", displayName: "Ben M" },
    { username: "deme", displayName: "Deme" },
    { username: "ivan", displayName: "Ivan" },
  ];

  let catalogAssignments = [];
  let catalogStudentProfiles = {};
  let editingAssignmentId = null;
  let editorOptions = null;

  /** Shown if catalog API fails — matches public/homework/catalog.json */
  const FALLBACK_ASSIGNMENTS = {
    joshs: [{ id: "joshs-naitoikenai", title: "～ないといけない", students: ["joshs"] }],
    benm: [{ id: "2026-05-22-ben-m", title: "～がほしい vs ～に～たい・～がたい", students: ["benm"] }],
    deme: [{ id: "2026-05-22-deme", title: "～がほしい vs ～に～たい・～がたい", students: ["deme"] }],
  };

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function makeAssignmentId(studentUsername, grammarPoint) {
    const student = slugify(studentUsername) || "student";
    const grammar = slugify(grammarPoint) || "homework";
    return student + "-" + grammar;
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
          hint: { dictionary: "", conjugation: "plain" },
        },
        { type: "text", value: "。" },
      ],
    };
  }

  function openItem(n) {
    const id = "s2-" + n;
    return {
      id,
      parts: [
        { type: "text", value: "" },
        { type: "blank", name: id, wide: true },
        { type: "text", value: "" },
      ],
    };
  }

  function buildEmptyAssignment(meta) {
    const grammarPoint = meta.grammarPoint || "Homework";
    return {
      id: makeAssignmentId(meta.studentUsername, grammarPoint),
      title: grammarPoint,
      youtubeUrl: meta.youtubeUrl || "",
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
          tenseBubbles: ["Now-Later", "Past"],
          activeTense: "Now-Later",
          items: [1, 2, 3, 4, 5].map(grammarItem),
        },
        {
          id: "context",
          title: "Section 2 — Your words",
          instructions:
            "Fill in the blank with your own Japanese. Any correct answer is fine — be creative.",
          mode: "context-blank",
          items: [1, 2, 3, 4, 5].map(openItem),
        },
      ],
    };
  }

  function readMeta(form) {
    const studentUsername = String(
      form.querySelector('[name="studentUsername"]')?.value || ""
    )
      .trim()
      .toLowerCase();
    const grammarPoint = String(
      form.querySelector('[name="grammarPoint"]')?.value || ""
    ).trim();
    return {
      studentUsername,
      grammarPoint,
      youtubeUrl: String(form.querySelector('[name="youtubeUrl"]')?.value || "").trim(),
      lessonPlaylistUrl: String(
        form.querySelector('[name="lessonPlaylistUrl"]')?.value || ""
      ).trim(),
    };
  }

  function applyStudentProfileFields(form, studentUsername) {
    if (!form) return;
    const student = String(studentUsername || "").toLowerCase();
    const profile = catalogStudentProfiles[student] || {};
    const playlistInput = form.querySelector('[name="lessonPlaylistUrl"]');
    if (playlistInput) {
      playlistInput.value = profile.lessonPlaylistUrl || profile.reviewPlaylistUrl || "";
    }
  }

  function getCatalogEntry(id) {
    return catalogAssignments.find((e) => e.id === id) || null;
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

  function assignmentsForStudent(studentUsername) {
    const student = String(studentUsername || "").toLowerCase();
    const fromCatalog = catalogAssignments.filter((e) =>
      (e.students || []).some((s) => String(s).toLowerCase() === student)
    );
    if (fromCatalog.length) return fromCatalog;
    return FALLBACK_ASSIGNMENTS[student] || [];
  }

  function populateEditSelect(studentUsername, selectId) {
    const editSelect = document.getElementById("hw-teacher-edit-select");
    const statusEl = document.getElementById("hw-teacher-status");
    if (!editSelect) return;
    const student = String(studentUsername || "").toLowerCase();
    const mine = assignmentsForStudent(student).sort((a, b) =>
      String(b.date || b.id).localeCompare(String(a.date || a.id))
    );

    const keep = selectId || editSelect.value;
    editSelect.innerHTML =
      '<option value="">— New blank sheet —</option>' +
      mine
        .map((e) => {
          const label = (e.title || e.id) + " (" + e.id + ")";
          return (
            '<option value="' +
            e.id +
            '"' +
            (e.id === keep ? " selected" : "") +
            ">" +
            label +
            "</option>"
          );
        })
        .join("");

    if (statusEl && !editingAssignmentId) {
      const suffix =
        mine.length === 0
          ? " No saved homework for this student yet."
          : " " + mine.length + " worksheet(s) available to edit.";
      if (!statusEl.classList.contains("hw-maker-status--error")) {
        const base = statusEl.textContent.split("—")[0].trim() || "Ready.";
        statusEl.textContent = base + " —" + suffix;
      }
    }
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
    const metaForm = document.getElementById("hw-teacher-meta-form");
    const mount = document.getElementById("hw-teacher-worksheet-mount");
    const statusEl = document.getElementById("hw-teacher-status");
    const publishBtn = document.getElementById("hw-teacher-publish-btn");
    const updateBtn = document.getElementById("hw-teacher-update-btn");
    const resetBtn = document.getElementById("hw-teacher-reset-btn");
    const studentSelect = document.getElementById("hw-teacher-student");
    const editSelect = document.getElementById("hw-teacher-edit-select");
    const loadBtn = document.getElementById("hw-teacher-load-btn");
    const saveBar = document.getElementById("hw-teacher-save-bar");
    const editingNote = document.getElementById("hw-teacher-editing-note");

    const showToast = options.showToast || function () {};
    const getTeacherSession = options.getTeacherSession || function () {
      return null;
    };
    const fetchAssignmentJson = options.fetchAssignmentJson || async function () {
      throw new Error("no fetch");
    };
    const fetchCatalog = options.fetchCatalog || null;
    const getStudentAccounts = options.getStudentAccounts || function () {
      return [];
    };
    const isStudentAccount = options.isStudentAccount || function () {
      return true;
    };

    if (!metaForm || !mount) return;

    if (!global.HwWorksheet?.render) {
      mount.innerHTML =
        '<p class="hw-maker-preview-empty">Worksheet editor failed to load. Hard refresh the page (Ctrl+Shift+R).</p>';
      return;
    }

    const isFirstBind = metaForm.dataset.bound !== "true";

    function setStatus(msg, isError) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.classList.toggle("hw-maker-status--error", !!isError);
    }

    function updateEditModeUI() {
      const isEdit = Boolean(editingAssignmentId);
      if (publishBtn) publishBtn.hidden = isEdit;
      if (saveBar) saveBar.hidden = !isEdit;
      if (editingNote && isEdit) {
        editingNote.textContent =
          "Editing “" +
          editingAssignmentId +
          "” — change the worksheet below, then click Update with edits.";
      }
    }

    function clearEditMode() {
      editingAssignmentId = null;
      if (editSelect) editSelect.value = "";
      updateEditModeUI();
    }

    function renderSheet() {
      const meta = readMeta(metaForm);
      if (!meta.grammarPoint) meta.grammarPoint = "Homework";
      if (!global.HwWorksheet?.render) {
        mount.innerHTML =
          '<p class="hw-maker-preview-empty">Worksheet failed to load — hard refresh (Ctrl+Shift+R).</p>';
        return;
      }
      const assignment = buildEmptyAssignment(meta);
      mount.innerHTML = "";
      const form = global.HwWorksheet.render(mount, assignment, { authoring: true });
      if (form) {
        form.dataset.assignmentId = assignment.id;
        form.dataset.title = assignment.title;
        form.dataset.youtubeUrl = assignment.youtubeUrl || "";
      }
    }

    function loadIntoEditor(assignment, catalogEntry) {
      if (!assignment || !global.HwWorksheet?.render) return;
      editingAssignmentId = assignment.id || catalogEntry?.id || null;

      if (metaForm) {
        const studentInput = metaForm.querySelector('[name="studentUsername"]');
        const grammarInput = metaForm.querySelector('[name="grammarPoint"]');
        const youtubeInput = metaForm.querySelector('[name="youtubeUrl"]');
        if (studentInput && catalogEntry?.students?.[0]) {
          studentInput.value = catalogEntry.students[0];
        }
        if (grammarInput) {
          grammarInput.value = assignment.title || catalogEntry?.title || "";
        }
        if (youtubeInput) {
          youtubeInput.value = assignment.youtubeUrl || catalogEntry?.youtubeUrl || "";
        }
      }

      mount.innerHTML = "";
      const form = global.HwWorksheet.render(mount, assignment, { authoring: true });
      if (form) {
        form.dataset.assignmentId = editingAssignmentId || "";
        form.dataset.title = assignment.title || "";
        form.dataset.youtubeUrl = assignment.youtubeUrl || "";
      }

      if (editSelect && editingAssignmentId) {
        editSelect.value = editingAssignmentId;
      }
      updateEditModeUI();
      setStatus(
        "Loaded " +
          (editingAssignmentId || "worksheet") +
          " — edit the blanks below, then click Update with edits."
      );
      mount.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function loadAssignmentById(id) {
      if (!id) {
        clearEditMode();
        renderSheet();
        setStatus("New blank sheet — fill in and click Publish new homework.");
        return;
      }
      if (loadBtn) loadBtn.disabled = true;
      setStatus("Loading " + id + "…");
      try {
        const assignment = await fetchAssignmentWithFallback(id);
        const entryFn = options.getCatalogEntry || getCatalogEntry;
        loadIntoEditor(assignment, entryFn(id));
        showToast("Loaded " + id);
      } catch {
        setStatus("Could not load " + id + ". Check you are logged in as teacher (jlm).", true);
        showToast("Load failed");
      } finally {
        if (loadBtn) loadBtn.disabled = false;
      }
    }

    async function saveToStudentHub(isUpdate) {
      const meta = readMeta(metaForm);
      if (!meta.studentUsername || !meta.grammarPoint) {
        setStatus("Pick a student and enter a grammar point.", true);
        return;
      }
      if (!isStudentAccount(meta.studentUsername)) {
        setStatus('Unknown student id "' + meta.studentUsername + '".', true);
        return;
      }

      const session = getTeacherSession();
      if (!session || session.role !== "teacher") {
        setStatus("Teacher login required.", true);
        return;
      }

      const worksheetForm = mount.querySelector("#hw-worksheet-form");
      if (!worksheetForm || !global.HwWorksheet?.assignmentFromAuthoringForm) {
        setStatus("Worksheet not ready.", true);
        return;
      }

      const assignment = global.HwWorksheet.assignmentFromAuthoringForm(worksheetForm);
      assignment.id = isUpdate && editingAssignmentId
        ? editingAssignmentId
        : makeAssignmentId(meta.studentUsername, meta.grammarPoint);
      assignment.title = meta.grammarPoint;
      assignment.youtubeUrl = meta.youtubeUrl;
      assignment.status = "published";

      const answered =
        assignment.sections?.[0]?.items?.filter((item) =>
          (item.parts || []).some((p) => p.type === "blank" && p.answer)
        ).length || 0;
      if (!answered) {
        setStatus("Section 1 needs at least one answer filled in.", true);
        return;
      }

      const catalogEntry = {
        id: assignment.id,
        title: meta.grammarPoint,
        studentLabel: meta.studentUsername,
        lessonName: meta.grammarPoint,
        students: [meta.studentUsername],
        youtubeUrl: meta.youtubeUrl,
        forSale: false,
        salePrice: 0.99,
        summary: "Homework: " + meta.grammarPoint,
      };

      const activeBtn = isUpdate ? updateBtn : publishBtn;
      if (activeBtn) activeBtn.disabled = true;
      setStatus(
        (isUpdate ? "Updating " : "Publishing to ") + meta.studentUsername + "'s hub…"
      );

      try {
        const res = await fetch("/api/homework-publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherUsername: session.username,
            studentUsername: meta.studentUsername,
            assignment,
            catalogEntry,
            youtubeUrl: meta.youtubeUrl,
            lessonPlaylistUrl: meta.lessonPlaylistUrl,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Save failed.");

        editingAssignmentId = assignment.id;
        if (editSelect) editSelect.value = assignment.id;
        updateEditModeUI();

        if (meta.lessonPlaylistUrl) {
          catalogStudentProfiles[meta.studentUsername] = {
            ...(catalogStudentProfiles[meta.studentUsername] || {}),
            lessonPlaylistUrl: meta.lessonPlaylistUrl,
          };
        } else if (catalogStudentProfiles[meta.studentUsername]) {
          const next = { ...catalogStudentProfiles[meta.studentUsername] };
          delete next.lessonPlaylistUrl;
          catalogStudentProfiles[meta.studentUsername] = next;
        }

        setStatus(data.message || (isUpdate ? "Updated!" : "Published!"));
        showToast(isUpdate ? "Homework updated" : "Homework published");
        if (options.onPublished) options.onPublished(assignment.id);
      } catch (err) {
        setStatus((err && err.message) || "Could not save.", true);
        showToast("Save failed");
      } finally {
        if (activeBtn) activeBtn.disabled = false;
      }
    }

    if (metaForm.dataset.bound !== "true") {
      metaForm.dataset.bound = "true";
      metaForm.addEventListener("submit", (e) => e.preventDefault());

      const accounts = getStudentAccounts();
      const students = accounts.length ? accounts : DEFAULT_STUDENTS;
      if (studentSelect) {
        students.forEach((a) => {
          if (studentSelect.querySelector('option[value="' + a.username + '"]')) return;
          const opt = document.createElement("option");
          opt.value = a.username;
          opt.textContent = a.username + (a.displayName ? " — " + a.displayName : "");
          studentSelect.appendChild(opt);
        });
      }

      studentSelect?.addEventListener("change", async () => {
        await ensureCatalogLoaded();
        applyStudentProfileFields(metaForm, studentSelect.value);
        populateEditSelect(studentSelect.value);
        clearEditMode();
        renderSheet();
        setStatus("Student changed — pick homework to edit or use a new sheet.");
      });

      editSelect?.addEventListener("mousedown", async () => {
        await ensureCatalogLoaded();
        populateEditSelect(studentSelect?.value, editSelect.value);
      });

      editSelect?.addEventListener("change", () => {
        if (editSelect.value) loadAssignmentById(editSelect.value);
        else {
          clearEditMode();
          renderSheet();
        }
      });

      loadBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        const id = editSelect?.value;
        if (!id) {
          setStatus("Choose homework under Edit existing, then click Load.", true);
          return;
        }
        loadAssignmentById(id);
      });

      metaForm.querySelector('[name="grammarPoint"]')?.addEventListener("input", () => {
        const form = mount.querySelector("#hw-worksheet-form");
        const gp = readMeta(metaForm).grammarPoint;
        if (form) {
          form.dataset.title = gp;
          const titleEl = form.querySelector(".hw-worksheet__meta-title");
          if (titleEl) titleEl.textContent = gp || "Homework";
        }
      });

      resetBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        clearEditMode();
        renderSheet();
        setStatus("New blank sheet.");
        showToast("New sheet");
      });

      publishBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        saveToStudentHub(false);
      });

      updateBtn?.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = editingAssignmentId || editSelect?.value;
        if (!id) {
          setStatus("Choose homework under Edit existing and click Load.", true);
          return;
        }
        if (!editingAssignmentId || !mount.querySelector("#hw-worksheet-form")) {
          await loadAssignmentById(id);
        }
        if (!editingAssignmentId) return;
        saveToStudentHub(true);
      });
    }

    updateEditModeUI();

    if (!mount.querySelector("#hw-worksheet-form")) {
      renderSheet();
    }

    setStatus(
      "Choose homework → Load, or edit the blank sheet below → Publish new homework."
    );

    ensureCatalogLoaded().then(() => {
      applyStudentProfileFields(metaForm, studentSelect?.value);
      populateEditSelect(studentSelect?.value);
    });
  }

  function refreshCatalog(assignments, studentProfiles) {
    catalogAssignments = assignments || [];
    if (studentProfiles) catalogStudentProfiles = studentProfiles;
    const metaForm = document.getElementById("hw-teacher-meta-form");
    const studentSelect = document.getElementById("hw-teacher-student");
    applyStudentProfileFields(metaForm, studentSelect?.value);
    populateEditSelect(studentSelect?.value);
  }

  function bootstrap() {
    return ensureCatalogLoaded().then(() => {
      const metaForm = document.getElementById("hw-teacher-meta-form");
      const studentSelect = document.getElementById("hw-teacher-student");
      applyStudentProfileFields(metaForm, studentSelect?.value);
      populateEditSelect(studentSelect?.value);
    });
  }

  function loadAssignment(assignment, catalogEntry) {
    const metaForm = document.getElementById("hw-teacher-meta-form");
    if (!metaForm || metaForm.dataset.bound !== "true") {
      init(editorOptions || {});
    }
    const mount = document.getElementById("hw-teacher-worksheet-mount");
    if (!mount || !assignment || !global.HwWorksheet?.render) return;

    editingAssignmentId = assignment.id || catalogEntry?.id || null;
    if (metaForm) {
      const studentInput = metaForm.querySelector('[name="studentUsername"]');
      const grammarInput = metaForm.querySelector('[name="grammarPoint"]');
      const youtubeInput = metaForm.querySelector('[name="youtubeUrl"]');
      if (studentInput && catalogEntry?.students?.[0]) {
        studentInput.value = catalogEntry.students[0];
      }
      if (grammarInput) grammarInput.value = assignment.title || catalogEntry?.title || "";
      if (youtubeInput) {
        youtubeInput.value = assignment.youtubeUrl || catalogEntry?.youtubeUrl || "";
      }
    }

    mount.innerHTML = "";
    const form = global.HwWorksheet.render(mount, assignment, { authoring: true });
    if (form) {
      form.dataset.assignmentId = editingAssignmentId || "";
      form.dataset.title = assignment.title || "";
      form.dataset.youtubeUrl = assignment.youtubeUrl || "";
    }

    const editSelect = document.getElementById("hw-teacher-edit-select");
    const saveBar = document.getElementById("hw-teacher-save-bar");
    const updateBtn = document.getElementById("hw-teacher-update-btn");
    const publishBtn = document.getElementById("hw-teacher-publish-btn");
    const editingNote = document.getElementById("hw-teacher-editing-note");
    if (editSelect && editingAssignmentId) editSelect.value = editingAssignmentId;
    if (publishBtn) publishBtn.hidden = Boolean(editingAssignmentId);
    if (saveBar) saveBar.hidden = !editingAssignmentId;
    if (editingNote && editingAssignmentId) {
      editingNote.textContent =
        "Editing “" + editingAssignmentId + "” — change the worksheet below, then click Update with edits.";
    }

    populateEditSelect(
      metaForm?.querySelector('[name="studentUsername"]')?.value,
      editingAssignmentId
    );
  }

  global.HwTeacherEditor = {
    init,
    refreshCatalog,
    bootstrap,
    loadAssignment,
    buildEmptyAssignment,
  };
})(window);
