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
  let catalogStudents = [];
  let editingAssignmentId = null;
  let editorOptions = null;
  let worksheetBuilder = null;
  let loadedCurrentHomeworkId = "";
  let profileLoadGen = 0;

  const WORKSHEET_MRU_KEY = "jlm-hw-worksheet-mru";
  const WORKSHEET_MRU_MAX = 50;

  function loadWorksheetMru() {
    try {
      const raw = localStorage.getItem(WORKSHEET_MRU_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter((id) => typeof id === "string" && id) : [];
    } catch {
      return [];
    }
  }

  function writeWorksheetMru(list) {
    try {
      localStorage.setItem(WORKSHEET_MRU_KEY, JSON.stringify(list || []));
    } catch {
      /* quota or private mode */
    }
  }

  function touchWorksheetMru(id) {
    const sheetId = String(id || "").trim();
    if (!sheetId) return;
    const list = loadWorksheetMru().filter((x) => x !== sheetId);
    list.unshift(sheetId);
    writeWorksheetMru(list.slice(0, WORKSHEET_MRU_MAX));
  }

  function removeWorksheetMru(id) {
    const sheetId = String(id || "").trim();
    if (!sheetId) return;
    writeWorksheetMru(loadWorksheetMru().filter((x) => x !== sheetId));
  }

  function sortAssignmentsForLoadSelect(list) {
    const mru = loadWorksheetMru();
    const rank = new Map(mru.map((sheetId, i) => [sheetId, i]));
    return list.slice().sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : Infinity;
      const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
      if (ra !== rb) return ra - rb;
      return String(b.publishedAt || b.date || b.id).localeCompare(
        String(a.publishedAt || a.date || a.id)
      );
    });
  }

  function seedWorksheetMruFromCatalog() {
    if (loadWorksheetMru().length) return;
    const seeded = allAssignments()
      .sort((a, b) =>
        String(b.publishedAt || b.date || b.id).localeCompare(
          String(a.publishedAt || a.date || a.id)
        )
      )
      .map((e) => e.id)
      .filter(Boolean);
    if (seeded.length) writeWorksheetMru(seeded.slice(0, WORKSHEET_MRU_MAX));
  }

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

  /** Stable id suffix when title has no Latin slug (e.g. Japanese-only). */
  function hashTitleId(text) {
    const title = String(text || "").trim();
    if (!title) return "homework";
    let h = 2166136261;
    for (let i = 0; i < title.length; i++) {
      h ^= title.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return "u" + (h >>> 0).toString(36);
  }

  function makeWorksheetId(grammarPoint) {
    const grammar = slugify(grammarPoint);
    if (grammar) return "sheet-" + grammar;
    return "sheet-" + hashTitleId(grammarPoint);
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
      document.getElementById("hw-teacher-maker-grammar")?.value ||
        form?.querySelector('[name="grammarPoint"]')?.value ||
        ""
    ).trim();
    return { grammarPoint };
  }

  function readAccountMedia(form) {
    if (!form) {
      return {
        studentUsername: "",
        youtubeUrl: "",
        lessonPlaylistUrl: "",
        accountLabel: "",
        tier: "",
      };
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
      accountLabel: String(form.querySelector('[name="accountLabel"]')?.value || "").trim(),
      tier: String(form.querySelector('[name="accountTier"]')?.value || "").trim(),
    };
  }

  function legacyAccountDefaults(studentUsername) {
    const key = String(studentUsername || "").trim().toLowerCase();
    const account = global.HwAuth?.ACCOUNTS?.[key];
    if (!account || account.role !== "student") return null;
    return {
      accountLabel: account.accountLabel || "homework_only",
      tier: account.tier || "pending",
    };
  }

  function applyAccountSettingsFields(form, profile) {
    if (!form || !profile) return;
    const labelInput = form.querySelector('[name="accountLabel"]');
    const tierInput = form.querySelector('[name="accountTier"]');
    if (labelInput && profile.accountLabel) {
      labelInput.value = profile.accountLabel;
    }
    if (tierInput && profile.tier) {
      tierInput.value = profile.tier;
    }
  }

  function populateCurrentHomeworkSelect(studentUsername, profile) {
    const selectEl = document.getElementById("hw-teacher-current-hw");
    if (!selectEl) return;

    const student = String(studentUsername || "").trim().toLowerCase();
    let currentId = "";
    if (student) {
      currentId =
        String(profile?.currentHomeworkId || "").trim() ||
        String(catalogStudentProfiles[student]?.currentHomeworkId || "").trim();
    }
    loadedCurrentHomeworkId = currentId;

    const list = allAssignments().sort((a, b) =>
      String(b.date || b.id).localeCompare(String(a.date || a.id))
    );

    selectEl.innerHTML =
      '<option value="">No homework assigned yet.</option>' +
      list
        .map((e) => {
          return (
            '<option value="' +
            e.id +
            '"' +
            (e.id === currentId ? " selected" : "") +
            ">" +
            worksheetOptionLabel(e) +
            "</option>"
          );
        })
        .join("");

    selectEl.disabled = !student;
    selectEl.classList.toggle("hw-teacher-current-hw__select--set", !!currentId);
  }

  function catalogProfileForStudent(studentUsername) {
    const student = String(studentUsername || "").trim().toLowerCase();
    return catalogStudentProfiles[student] || {};
  }

  function resolveProfilePlaylist(studentUsername, profile) {
    const student = String(studentUsername || "").trim().toLowerCase();
    const fromProfile = String(profile?.lessonPlaylistUrl || "").trim();
    if (fromProfile) return fromProfile;
    const catalog = catalogProfileForStudent(student);
    return String(catalog.lessonPlaylistUrl || catalog.reviewPlaylistUrl || "").trim();
  }

  function resolveProfileYoutube(studentUsername, profile) {
    const student = String(studentUsername || "").trim().toLowerCase();
    const fromProfile = String(profile?.youtubeUrl || "").trim();
    if (fromProfile) return fromProfile;
    const catalog = catalogProfileForStudent(student);
    return String(catalog.latestLessonUrl || catalog.youtubeUrl || "").trim();
  }

  function studentProfilePayloadFromForm(media) {
    const payload = {
      studentUsername: media.studentUsername,
      accountLabel: media.accountLabel,
      tier: media.tier,
      youtubeUrl: media.youtubeUrl,
    };
    if (media.lessonPlaylistUrl) {
      payload.lessonPlaylistUrl = media.lessonPlaylistUrl;
    }
    return payload;
  }

  async function loadStudentProfileFields(form, studentUsername) {
    const loadGen = ++profileLoadGen;
    const isStale = () => loadGen !== profileLoadGen;

    if (!form) return;
    const student = String(studentUsername || "").trim().toLowerCase();

    await ensureCatalogLoaded();
    if (isStale()) return;

    populateCurrentHomeworkSelect(student, null);

    if (!student) {
      applyStudentProfileFields(form, "");
      return;
    }

    applyStudentProfileFields(form, student);

    const legacy = legacyAccountDefaults(student);
    applyAccountSettingsFields(form, legacy);

    const session =
      editorOptions?.getTeacherSession?.() || global.HwAuth?.getSession?.() || null;
    if (!session || session.role !== "teacher") return;

    try {
      const url =
        "/api/homework-student-profile?teacherUsername=" +
        encodeURIComponent(session.username) +
        "&studentUsername=" +
        encodeURIComponent(student) +
        "&_=" +
        Date.now();
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || isStale()) return;
      const profile = data.profile || {};
      const playlist = resolveProfilePlaylist(student, profile);
      const youtube = resolveProfileYoutube(student, profile);
      const youtubeInput = form.querySelector('[name="youtubeUrl"]');
      const playlistInput = form.querySelector('[name="lessonPlaylistUrl"]');
      if (youtubeInput) youtubeInput.value = youtube;
      if (playlistInput) playlistInput.value = playlist;
      applyAccountSettingsFields(form, profile);
      catalogStudentProfiles[student] = {
        ...(catalogStudentProfiles[student] || {}),
        ...(playlist ? { lessonPlaylistUrl: playlist } : {}),
        ...(youtube ? { latestLessonUrl: youtube, youtubeUrl: youtube } : {}),
        ...(profile.currentHomeworkId ? { currentHomeworkId: profile.currentHomeworkId } : {}),
      };
      populateCurrentHomeworkSelect(student, profile);
    } catch {
      /* keep catalog / legacy defaults */
    }
  }

  function getAccountForm() {
    return document.getElementById("hw-teacher-account-form");
  }

  function applyStudentProfileFields(form, studentUsername) {
    if (!form) return;
    const student = String(studentUsername || "").toLowerCase();
    const youtubeInput = form.querySelector('[name="youtubeUrl"]');
    const playlistInput = form.querySelector('[name="lessonPlaylistUrl"]');
    if (youtubeInput) {
      youtubeInput.value = resolveProfileYoutube(student, {});
    }
    if (playlistInput) {
      playlistInput.value = resolveProfilePlaylist(student, {});
    }
  }

  async function applyAutoReadings(assignment) {
    if (!assignment || !global.HwFuriganaAuto?.annotateAssignment) return assignment;
    try {
      const job = global.HwFuriganaAuto.annotateAssignment(assignment);
      const timed = global.HwFuriganaAuto.withTimeout
        ? global.HwFuriganaAuto.withTimeout(job, 15000, "reading-timeout")
        : job;
      return await timed;
    } catch (err) {
      console.warn("Auto readings skipped:", err);
      return assignment;
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
    const all = allAssignments();
    const mruIds = loadWorksheetMru();
    const byId = new Map(all.map((e) => [e.id, e]));
    const mru = mruIds.map((id) => byId.get(id)).filter(Boolean);
    const mruSet = new Set(mru.map((e) => e.id));
    const rest = sortAssignmentsForLoadSelect(all.filter((e) => !mruSet.has(e.id)));
    const keep = keepId || selectEl.value;

    function optionHtml(e) {
      return (
        '<option value="' +
        e.id +
        '"' +
        (e.id === keep ? " selected" : "") +
        ">" +
        worksheetOptionLabel(e) +
        "</option>"
      );
    }

    let html = '<option value="">— New blank sheet —</option>';
    if (mru.length) {
      html +=
        '<optgroup label="Most recently used">' + mru.map(optionHtml).join("") + "</optgroup>";
    }
    if (rest.length) {
      html += '<optgroup label="All worksheets">' + rest.map(optionHtml).join("") + "</optgroup>";
    }
    selectEl.innerHTML = html;
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

  function getMergedStudentList() {
    const byUser = new Map();
    const accounts = editorOptions?.getStudentAccounts?.() || [];
    const authList = accounts.length ? accounts : DEFAULT_STUDENTS;
    authList.forEach((a) => {
      if (a?.username) byUser.set(a.username, a);
    });
    (catalogStudents || []).forEach((a) => {
      if (a?.username) byUser.set(a.username, a);
    });
    return [...byUser.values()].sort((a, b) =>
      String(a.username).localeCompare(String(b.username))
    );
  }

  function fillStudentSelect(selectEl, keepValue) {
    if (!selectEl) return;
    const keep = keepValue || selectEl.value;
    const students = getMergedStudentList();
    selectEl.innerHTML =
      '<option value="">— Choose student —</option>' +
      students
        .map((a) => {
          const label =
            a.username + (a.displayName ? " — " + a.displayName : "");
          return (
            '<option value="' +
            a.username +
            '"' +
            (a.username === keep ? " selected" : "") +
            ">" +
            label +
            "</option>"
          );
        })
        .join("");
    if (keep) selectEl.value = keep;
  }

  function populateAllStudentSelects() {
    fillStudentSelect(document.getElementById("hw-teacher-maker-send-student"));
    fillStudentSelect(document.getElementById("hw-teacher-account-student"));
  }

  async function ensureCatalogLoaded() {
    if (catalogAssignments.length) return catalogAssignments;
    if (!editorOptions?.fetchCatalog) return catalogAssignments;
    try {
      const data = await editorOptions.fetchCatalog();
      catalogAssignments = data.assignments || [];
      catalogStudentProfiles = data.studentProfiles || {};
      catalogStudents = data.students || [];
      populateAllStudentSelects();
      seedWorksheetMruFromCatalog();
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
    let makerEditSelect = null;
    let makerUpdateBtn = null;
    let makerSaveTemplateBtn = null;
    let makerDeleteBtn = null;
    let makerEditingNote = null;
    let makerSendStudent = null;
    let makerSendBtn = null;
    let makerPreviewBtn = null;
    let makerDockStatusEl = null;
    let makerDockHintEl = null;
    let makerDockReady = false;

    const publishWorksheet = document.getElementById("hw-teacher-publish-worksheet");
    const publishSendBtn = document.getElementById("hw-teacher-send-btn");
    const publishStatusEl = document.getElementById("hw-teacher-publish-status");
    const publishHint = document.getElementById("hw-teacher-publish-hint");
    const publishStudent = document.getElementById("hw-teacher-publish-student");

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
    const isStudentAccount = function (username) {
      const key = String(username || "").trim().toLowerCase();
      if (!key) return false;
      if (options.isStudentAccount && options.isStudentAccount(key)) return true;
      return getMergedStudentList().some((s) => s.username === key);
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

    function setMakerDockStatus(msg, isError) {
      if (!makerDockStatusEl) return;
      makerDockStatusEl.textContent = msg;
      makerDockStatusEl.classList.toggle("hw-maker-status--error", !!isError);
    }

    function getMakerWorksheetId() {
      const builder = worksheetBuilder;
      const explicit = String(
        editingAssignmentId ||
          makerEditSelect?.value ||
          builder?.getCanvasAssignmentId?.() ||
          ""
      ).trim();
      if (explicit) return explicit;

      const meta = readMakerMeta(makerForm);
      const hasBlocks = (builder?.getState?.().blocks?.length || 0) > 0;
      if (hasBlocks && meta.grammarPoint) {
        return makeWorksheetId(meta.grammarPoint);
      }
      return "";
    }

    function afterWorksheetSavedLocally(assignmentId) {
      touchWorksheetMru(assignmentId);
      editingAssignmentId = assignmentId;
      if (makerEditSelect) makerEditSelect.value = assignmentId;
      updateMakerEditUI();
      updateMakerDockHint();
      updatePublishHint();
      populateWorksheetSelect(makerEditSelect, assignmentId);
      populatePublishWorksheetSelect(publishWorksheet, assignmentId);
      populateCurrentHomeworkSelect(
        document.getElementById("hw-teacher-account-student")?.value,
        null
      );
    }

    function updateMakerDockHint() {
      if (!makerDockHintEl || !makerSendStudent) return;
      const student = String(makerSendStudent.value || "").toLowerCase();
      const id = getMakerWorksheetId();
      if (!student) {
        makerDockHintEl.textContent = "Pick a student, then send this sheet.";
        return;
      }
      if (!id) {
        makerDockHintEl.textContent = "Add a title and at least one block, then send.";
        return;
      }
      const entry = getCatalogEntry(id);
      const assigned = (entry?.students || []).some(
        (s) => String(s).toLowerCase() === student
      );
      makerDockHintEl.textContent = assigned
        ? "Already on " + student + "'s hub — send again to refresh."
        : "Will send “" + id + "” to " + student + ".";
    }

    function updateMakerTemplateButton() {
      const hasBlocks = (worksheetBuilder?.getBlockCount?.() || 0) > 0;
      if (makerSaveTemplateBtn) makerSaveTemplateBtn.hidden = !hasBlocks;
    }

    function updateMakerEditUI() {
      const isEdit = Boolean(editingAssignmentId);
      if (makerUpdateBtn) {
        makerUpdateBtn.hidden = false;
        makerUpdateBtn.textContent = isEdit ? "Update saved" : "Save as new";
      }
      if (makerDeleteBtn) makerDeleteBtn.hidden = !isEdit;
      if (makerEditingNote) {
        makerEditingNote.textContent = isEdit
          ? "Editing “" + editingAssignmentId + "”"
          : "New sheet — save or send when ready.";
      }
      updateMakerTemplateButton();
      updateMakerDockHint();
    }

    function populateMakerDockStudents() {
      fillStudentSelect(makerSendStudent, makerSendStudent?.value);
    }

    function updateMakerPreviewBtn(isOpen) {
      if (!makerPreviewBtn) return;
      makerPreviewBtn.textContent = isOpen ? "Back to editor" : "Student preview";
      makerPreviewBtn.setAttribute("aria-pressed", isOpen ? "true" : "false");
    }

    function setupMakerDock() {
      const slot = document.getElementById("hw-teacher-maker-dock");
      if (!slot || makerDockReady) return;
      makerDockReady = true;

      slot.innerHTML =
        '<div class="hw-builder__dock-section hw-builder__dock-section--library">' +
        '<h5 class="hw-builder__dock-heading">Library</h5>' +
        '<p class="hw-builder__dock-note" id="hw-teacher-maker-editing-note">New sheet — save or send when ready.</p>' +
        '<div class="hw-builder__dock-actions">' +
        '<button type="button" class="btn hw-btn--save" id="hw-teacher-maker-update-btn">Save as new</button>' +
        '<button type="button" class="btn btn--ghost btn--sm hw-builder__dock-template" id="hw-teacher-maker-save-template-btn" hidden>Save as new template</button>' +
        '<button type="button" class="btn btn--ghost btn--sm hw-btn--danger" id="hw-teacher-maker-delete-btn" hidden>Delete worksheet</button>' +
        "</div></div>" +
        '<div class="hw-builder__dock-section hw-builder__dock-section--send">' +
        '<h5 class="hw-builder__dock-heading">Send to student</h5>' +
        '<label class="hw-builder__dock-field">Student' +
        '<select id="hw-teacher-maker-send-student" aria-label="Student to send homework to">' +
        '<option value="">— Choose student —</option>' +
        "</select></label>" +
        '<button type="button" class="btn btn--ghost btn--sm hw-builder__dock-preview" id="hw-teacher-maker-preview-btn">Student preview</button>' +
        '<button type="button" class="btn btn--primary btn--sm hw-builder__dock-send" id="hw-teacher-maker-send-btn">Send to hub</button>' +
        '<p class="hw-builder__dock-hint" id="hw-teacher-maker-dock-hint">Sends the open worksheet — also saves it to your library.</p>' +
        '<p class="hw-builder__dock-status" id="hw-teacher-maker-dock-status" role="status" aria-live="polite"></p>' +
        "</div>";

      makerUpdateBtn = document.getElementById("hw-teacher-maker-update-btn");
      makerSaveTemplateBtn = document.getElementById("hw-teacher-maker-save-template-btn");
      makerDeleteBtn = document.getElementById("hw-teacher-maker-delete-btn");
      makerEditingNote = document.getElementById("hw-teacher-maker-editing-note");
      makerSendStudent = document.getElementById("hw-teacher-maker-send-student");
      makerPreviewBtn = document.getElementById("hw-teacher-maker-preview-btn");
      makerSendBtn = document.getElementById("hw-teacher-maker-send-btn");
      makerDockStatusEl = document.getElementById("hw-teacher-maker-dock-status");
      makerDockHintEl = document.getElementById("hw-teacher-maker-dock-hint");

      populateMakerDockStudents();
      updateMakerEditUI();
      setMakerDockStatus("");

      makerSendStudent?.addEventListener("change", updateMakerDockHint);

      makerUpdateBtn?.addEventListener("click", async (e) => {
        e.preventDefault();
        await saveWorksheetToLibrary();
      });

      makerSaveTemplateBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        saveWorksheetAsTemplate();
      });

      makerDeleteBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        deleteWorksheetFromLibrary();
      });

      makerSendBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        publishWorksheetToStudent({
          student: makerSendStudent?.value,
          worksheetId: getMakerWorksheetId(),
          setStatus: setMakerDockStatus,
          sendBtn: makerSendBtn,
        });
      });

      makerPreviewBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        const builder = worksheetBuilder;
        if (!builder) return;
        if (builder.isPreviewOpen?.()) {
          builder.hidePreview();
          return;
        }
        builder.showPreview(readMakerMeta(makerForm).grammarPoint || "Homework");
      });

      updateMakerPreviewBtn(false);
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

    function bindMakerEditSelect() {
      makerEditSelect = document.getElementById("hw-teacher-maker-edit-select");
      if (!makerEditSelect || makerEditSelect.dataset.bound === "true") return;
      makerEditSelect.dataset.bound = "true";

      makerEditSelect.addEventListener("focus", async () => {
        await ensureCatalogLoaded();
        populateWorksheetSelect(makerEditSelect, makerEditSelect.value);
      });

      makerEditSelect.addEventListener("change", () => {
        if (makerEditSelect.value) loadAssignmentById(makerEditSelect.value);
        else {
          clearEditMode();
          const grammarInput = document.getElementById("hw-teacher-maker-grammar");
          if (grammarInput) grammarInput.value = "";
          renderSheet("blank");
          setMakerStatus("New blank sheet — add a title and blocks, then send to save.");
        }
        updateMakerDockHint();
      });
    }

    function ensureBuilder() {
      if (worksheetBuilder || !global.HwWorksheetBuilder?.mount || !makerMount) return worksheetBuilder;
      makerDockReady = false;
      makerMount.innerHTML = "";
      worksheetBuilder = global.HwWorksheetBuilder.mount(makerMount, {
        getTitle: () => readMakerMeta(makerForm).grammarPoint || "Homework",
        onChange: () => {
          if (worksheetBuilder?.isPreviewOpen?.()) {
            worksheetBuilder.showPreview(readMakerMeta(makerForm).grammarPoint || "Homework");
          }
          updateMakerTemplateButton();
          updatePublishHint();
          updateMakerDockHint();
        },
        onPreviewChange: updateMakerPreviewBtn,
      });
      makerMount.dataset.builderReady = "true";
      bindMakerEditSelect();
      if (makerEditSelect && editingAssignmentId) {
        makerEditSelect.value = editingAssignmentId;
      }
      setupMakerDock();
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

      const grammarInput = document.getElementById("hw-teacher-maker-grammar");
      if (grammarInput) {
        grammarInput.value = assignment.title || catalogEntry?.title || "";
      }

      builder.loadAssignment(assignment);

      if (makerEditSelect && editingAssignmentId) {
        makerEditSelect.value = editingAssignmentId;
      }
      if (editingAssignmentId) touchWorksheetMru(editingAssignmentId);
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
        setMakerStatus("New blank sheet — add a title and blocks, then send to save.");
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

      const translation = assignment.sections.find((s) => s.mode === "translation");
      if (translation?.items?.length) return true;

      const star = assignment.sections.find((s) => s.mode === "star-order");
      if (star?.items?.length) return true;

      const audio = assignment.sections.find((s) => s.mode === "audio-prompt");
      if (audio?.items?.length) return true;

      return false;
    }

    async function saveWorksheetToLibrary() {
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

      const isNew = !editingAssignmentId;
      const assignmentId = editingAssignmentId || makeWorksheetId(meta.grammarPoint);
      if (isNew && getCatalogEntry(assignmentId)) {
        setMakerStatus(
          "A sheet with this title already exists (“" +
            assignmentId +
            "”) — load it from Load worksheet, or change the title.",
          true
        );
        return;
      }

      const assignment = builder.toAssignment({
        id: assignmentId,
        title: meta.grammarPoint,
      });
      assignment.id = assignmentId;
      assignment.title = meta.grammarPoint;
      assignment.status = "draft";

      setMakerStatus("Adding hover readings…");
      await applyAutoReadings(assignment);

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

      if (makerUpdateBtn) makerUpdateBtn.disabled = true;
      setMakerStatus((isNew ? "Saving “" : "Updating “") + assignment.id + "”…");

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

        afterWorksheetSavedLocally(assignment.id);

        setMakerStatus(data.message || (isNew ? "Worksheet saved." : "Worksheet updated."));
        showToast(isNew ? "Worksheet saved" : "Worksheet updated");
        if (options.onWorksheetSaved) await options.onWorksheetSaved(assignment.id);
      } catch (err) {
        setMakerStatus((err && err.message) || "Could not save.", true);
        showToast(isNew ? "Save failed" : "Update failed");
      } finally {
        if (makerUpdateBtn) makerUpdateBtn.disabled = false;
      }
    }

    function saveWorksheetAsTemplate() {
      const builder = ensureBuilder();
      if (!builder?.saveCustomTemplate) {
        setMakerStatus("Worksheet builder not ready.", true);
        return;
      }
      if (!builder.getBlockCount?.()) {
        setMakerStatus("Add at least one block before saving a template.", true);
        return;
      }

      const meta = readMakerMeta(makerForm);
      const defaultName = meta.grammarPoint || "Untitled template";
      const name = window.prompt("Template name", defaultName);
      if (name === null) return;
      const label = String(name).trim();
      if (!label) {
        setMakerStatus("Template name is required.", true);
        return;
      }

      if (makerSaveTemplateBtn) makerSaveTemplateBtn.disabled = true;
      try {
        const entry = builder.saveCustomTemplate(label);
        if (!entry) {
          setMakerStatus("Could not save template.", true);
          return;
        }
        setMakerStatus('Template saved — choose "' + entry.label + '" under Start from a template.');
        showToast("Template saved");
      } finally {
        if (makerSaveTemplateBtn) makerSaveTemplateBtn.disabled = false;
      }
    }

    async function deleteWorksheetFromLibrary() {
      const id = editingAssignmentId || makerEditSelect?.value;
      if (!id) {
        setMakerStatus("Load a saved worksheet to delete.", true);
        return;
      }

      const session = getTeacherSession();
      if (!session || session.role !== "teacher") {
        setMakerStatus("Teacher login required.", true);
        return;
      }

      const title =
        (getCatalogEntry(id)?.title || makerForm.querySelector('[name="grammarPoint"]')?.value || id).trim();
      const ok = window.confirm(
        'Delete “' +
          id +
          '”' +
          (title && title !== id ? " (" + title + ")" : "") +
          " from the library?\n\nStudents will no longer see this saved copy on their hub. This can't be undone."
      );
      if (!ok) return;

      if (makerDeleteBtn) makerDeleteBtn.disabled = true;
      setMakerStatus("Deleting “" + id + "”…");

      try {
        const res = await fetch("/api/homework-delete-worksheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherUsername: session.username,
            worksheetId: id,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Delete failed.");

        removeWorksheetMru(id);
        clearEditMode();
        renderSheet("blank");
        setMakerStatus(data.message || "Deleted “" + id + "”.");
        showToast("Worksheet deleted");
        populateWorksheetSelect(makerEditSelect, "");
        populatePublishWorksheetSelect(publishWorksheet, "");
        if (options.onWorksheetDeleted) await options.onWorksheetDeleted(id);
        else if (options.onWorksheetSaved) await options.onWorksheetSaved();
      } catch (err) {
        setMakerStatus((err && err.message) || "Could not delete.", true);
        showToast("Delete failed");
      } finally {
        if (makerDeleteBtn) makerDeleteBtn.disabled = false;
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
      const derivedId = meta.grammarPoint ? makeWorksheetId(meta.grammarPoint) : "";
      const isNewUnsavedCanvas =
        hasBlocks && !editingAssignmentId && !makerSelectId && !canvasId;
      const useLiveBuilder =
        builder?.toAssignment &&
        hasBlocks &&
        (isNewUnsavedCanvas ||
          editingAssignmentId === worksheetId ||
          makerSelectId === worksheetId ||
          canvasId === worksheetId ||
          (derivedId && worksheetId === derivedId));

      if (useLiveBuilder) {
        const assignment = builder.toAssignment({
          id: worksheetId,
          title: meta.grammarPoint || entry.title || worksheetId,
        });
        assignment.id = worksheetId;
        await applyAutoReadings(assignment);
        return { assignment, usedLiveBuilder: true, entry };
      }

      const assignment = await fetchAssignmentWithFallback(worksheetId);
      return { assignment, usedLiveBuilder: false, entry };
    }

    async function publishWorksheetToStudent(publishOpts) {
      publishOpts = publishOpts || {};
      const setStatus =
        publishOpts.setStatus ||
        function (msg, isError) {
          setPublishStatus(msg, isError);
        };
      const activeSendBtn = publishOpts.sendBtn || publishSendBtn;

      const student = String(
        publishOpts.student !== undefined ? publishOpts.student : publishStudent?.value || ""
      )
        .trim()
        .toLowerCase();
      let worksheetId = String(
        publishOpts.worksheetId !== undefined
          ? publishOpts.worksheetId
          : publishWorksheet?.value || ""
      ).trim();
      if (!worksheetId) {
        worksheetId = getMakerWorksheetId();
      }

      if (!student) {
        setStatus("Choose a student to publish to.", true);
        return;
      }
      if (!worksheetId) {
        setStatus("Add a grammar point / title and at least one block, then send.", true);
        return;
      }
      if (!isStudentAccount(student)) {
        setStatus('Unknown student id "' + student + '".', true);
        return;
      }

      const session = getTeacherSession();
      if (!session || session.role !== "teacher") {
        setStatus("Teacher login required.", true);
        return;
      }

      const media = readAccountMedia(accountForm);
      if (activeSendBtn) activeSendBtn.disabled = true;
      setStatus("Sending “" + worksheetId + "” to " + student + "…");

      try {
        const resolved = await resolveAssignmentForPublish(worksheetId);
        const assignment = resolved.assignment;
        const entry = resolved.entry || (options.getCatalogEntry || getCatalogEntry)(worksheetId) || {};
        assignment.status = "published";
        assignment.id = worksheetId;

        if (!validateWorksheet(assignment)) {
          setStatus(
            "This worksheet needs content — add blocks in Worksheet maker first.",
            true
          );
          return;
        }

        if (resolved.usedLiveBuilder) {
          setStatus("Saving to library, then sending to " + student + "…");
          assignment.status = "draft";
          await persistAssignmentDraft(session, assignment, entry);
          afterWorksheetSavedLocally(worksheetId);
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
            ...(media.youtubeUrl ? { youtubeUrl: media.youtubeUrl } : {}),
            ...(media.lessonPlaylistUrl ? { lessonPlaylistUrl: media.lessonPlaylistUrl } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Publish failed.");

        if (global.HwMgLexiconSuggest?.queueFromPublish) {
          global.HwMgLexiconSuggest.queueFromPublish({
            assignment,
            worksheetId,
            worksheetTitle: assignment.title || worksheetId,
            teacherUsername: session.username,
          })
            .then((result) => {
              if (result?.added > 0) {
                showToast(result.added + " lookup lexicon card(s) queued for review");
              }
            })
            .catch(() => {});
        }

        touchWorksheetMru(worksheetId);
        setStatus(
          (data.message || "Sent to " + student + "!") +
            " This is now their current homework on the hub."
        );
        showToast("Current homework set for " + student);
        populateWorksheetSelect(makerEditSelect, worksheetId);
        updatePublishHint();
        updateMakerDockHint();
        if (options.onPublished) await options.onPublished(worksheetId, student);
        const accountStudent = document.getElementById("hw-teacher-account-student")?.value;
        if (accountStudent && accountStudent.toLowerCase() === student) {
          await loadStudentProfileFields(getAccountForm(), student);
        }
      } catch (err) {
        setStatus((err && err.message) || "Could not publish.", true);
        showToast("Send failed");
      } finally {
        if (activeSendBtn) activeSendBtn.disabled = false;
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

      const selectedHomeworkId = String(
        accountForm.querySelector('[name="currentHomeworkId"]')?.value || ""
      ).trim();
      const homeworkChanged =
        selectedHomeworkId && selectedHomeworkId !== loadedCurrentHomeworkId;

      if (accountSaveBtn) accountSaveBtn.disabled = true;
      setAccountStatus("Saving " + media.studentUsername + "'s info…");

      try {
        const res = await fetch("/api/homework-student-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...studentProfilePayloadFromForm(media),
            teacherUsername: session.username,
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

        if (homeworkChanged) {
          setAccountStatus("Saved links — assigning “" + selectedHomeworkId + "”…");
          await publishWorksheetToStudent({
            student: media.studentUsername,
            worksheetId: selectedHomeworkId,
            setStatus: setAccountStatus,
            sendBtn: accountSaveBtn,
          });
          return;
        }

        setAccountStatus(data.message || "Saved!");
        showToast("Student info saved");
        await loadStudentProfileFields(accountForm, media.studentUsername);
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

      makerMount?.addEventListener("input", (e) => {
        if (e.target?.id !== "hw-teacher-maker-grammar") return;
        const gp = readMakerMeta(makerForm).grammarPoint;
        if (worksheetBuilder?.isPreviewOpen?.()) {
          worksheetBuilder.showPreview(gp || "Homework");
        }
        updateMakerDockHint();
      });

    }

    if (accountForm && accountForm.dataset.bound !== "true") {
      accountForm.dataset.bound = "true";
      accountForm.addEventListener("submit", (e) => e.preventDefault());

      fillStudentSelect(accountStudentSelect, accountStudentSelect?.value);

      accountStudentSelect?.addEventListener("change", async () => {
        await ensureCatalogLoaded();
        await loadStudentProfileFields(accountForm, accountStudentSelect.value);
        if (accountStudentSelect.value) {
          setAccountStatus("Loaded " + accountStudentSelect.value + "'s info.");
        } else {
          populateCurrentHomeworkSelect("", null);
        }
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

    ensureCatalogLoaded().then(() => {
      populateWorksheetSelect(makerEditSelect);
      populatePublishWorksheetSelect(publishWorksheet);
    });
  }

  function refreshCatalog(assignments, studentProfiles, students) {
    catalogAssignments = assignments || [];
    if (studentProfiles) catalogStudentProfiles = studentProfiles;
    if (students) catalogStudents = students;
    populateAllStudentSelects();
    populateWorksheetSelect(document.getElementById("hw-teacher-maker-edit-select"));
    const accountStudent = document.getElementById("hw-teacher-account-student")?.value;
    if (accountStudent) {
      void loadStudentProfileFields(getAccountForm(), accountStudent);
    }
  }

  function bootstrap() {
    return ensureCatalogLoaded().then(async () => {
      populateWorksheetSelect(document.getElementById("hw-teacher-maker-edit-select"));
      await loadStudentProfileFields(
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
    const grammarInput = document.getElementById("hw-teacher-maker-grammar");
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

    if (editingAssignmentId) touchWorksheetMru(editingAssignmentId);

    const editSelect = document.getElementById("hw-teacher-maker-edit-select");
    const updateBtn = document.getElementById("hw-teacher-maker-update-btn");
    const deleteBtn = document.getElementById("hw-teacher-maker-delete-btn");
    const editingNote = document.getElementById("hw-teacher-maker-editing-note");
    if (editSelect && editingAssignmentId) editSelect.value = editingAssignmentId;
    if (updateBtn) {
      updateBtn.hidden = false;
      updateBtn.textContent = editingAssignmentId ? "Update saved" : "Save as new";
    }
    if (deleteBtn) deleteBtn.hidden = !editingAssignmentId;
    const saveTemplateBtn = document.getElementById("hw-teacher-maker-save-template-btn");
    if (saveTemplateBtn) {
      saveTemplateBtn.hidden = !(worksheetBuilder?.getBlockCount?.() > 0);
    }
    if (editingNote) {
      editingNote.textContent = editingAssignmentId
        ? "Editing “" + editingAssignmentId + "”"
        : "New sheet — save or send when ready.";
    }
    populateWorksheetSelect(editSelect, editingAssignmentId);
  }

  function syncPublishPicker() {
    populateCurrentHomeworkSelect(
      document.getElementById("hw-teacher-account-student")?.value,
      null
    );
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
