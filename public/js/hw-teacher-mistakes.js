/**
 * Teacher mistakes tab — recent feed (same ❌/✅ view as students).
 */
(function (global) {
  let cache = [];
  let loading = false;
  let loadedOnce = false;
  let bound = false;
  let options = null;

  function getSession() {
    return options?.getTeacherSession?.() || null;
  }

  async function fetchMistakes(session, student) {
    let url =
      "/api/student-mistakes?teacherUsername=" + encodeURIComponent(session.username) +
      "&status=active";
    if (student) url += "&student=" + encodeURIComponent(student);
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not load mistakes.");
    }
    const data = await res.json();
    return Array.isArray(data.mistakes) ? data.mistakes : [];
  }

  function populateStudents(selectEl) {
    if (!selectEl) return;
    if (global.HwStudentList?.fillStudentSelect) {
      global.HwStudentList.fillStudentSelect(selectEl, {
        includeAllOption: true,
        allLabel: "All students",
        keepValue: selectEl.value,
      });
      return;
    }
    const accounts = global.HwAuth?.listStudentAccounts?.() || [];
    const existing = new Set(
      Array.from(selectEl.options).map((o) => o.value).filter(Boolean)
    );
    accounts.forEach((a) => {
      if (existing.has(a.username)) return;
      const opt = document.createElement("option");
      opt.value = a.username;
      opt.textContent = a.username + (a.displayName ? " — " + a.displayName : "");
      selectEl.appendChild(opt);
    });
  }

  async function ensureStudentsLoaded() {
    if (global.HwStudentList?.fetchStudents) {
      await global.HwStudentList.fetchStudents();
      populateStudents(document.getElementById("hw-mistakes-feed-student"));
    }
  }

  function renderFeed() {
    const list = document.getElementById("hw-mistakes-feed-list");
    const meta = document.getElementById("hw-mistakes-feed-meta");
    const student = document.getElementById("hw-mistakes-feed-student")?.value || "";

    let rows = cache.slice();
    if (student) rows = rows.filter((e) => e.username === student);

    global.HwMistakeFeed?.renderFeed(list, rows, {
      showStudent: !student,
      showWhen: true,
      emptyText: loading
        ? "Loading…"
        : student
          ? "No active mistakes for " + student + "."
          : "No active mistakes yet — log from your lesson bookmark.",
    });

    if (meta) {
      meta.textContent = rows.length
        ? rows.length + " active — newest first"
        : "";
    }
  }

  async function reload() {
    const session = getSession();
    if (!session) return;

    loading = true;
    renderFeed();
    try {
      cache = await fetchMistakes(session);
      loadedOnce = true;
    } catch {
      cache = [];
    } finally {
      loading = false;
      renderFeed();
    }
  }

  function bind() {
    if (bound) return;
    bound = true;

    populateStudents(document.getElementById("hw-mistakes-feed-student"));
    void ensureStudentsLoaded();
    document.getElementById("hw-mistakes-feed-student")?.addEventListener("change", renderFeed);
    document.getElementById("hw-mistakes-feed-refresh")?.addEventListener("click", () => reload());
  }

  function init(opts) {
    options = opts || {};
    bind();
  }

  function reloadIfNeeded() {
    bind();
    void ensureStudentsLoaded();
    if (!loadedOnce) void reload();
    else renderFeed();
  }

  global.HwTeacherMistakes = { init, reload, reloadIfNeeded };
})(typeof window !== "undefined" ? window : globalThis);
