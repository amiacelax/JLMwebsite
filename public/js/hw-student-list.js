/**
 * Student accounts for teacher UI — live list from KV (signups + published homework).
 * Keeps a localStorage copy so Student/ID dropdowns paint instantly on reopen.
 */
(function (global) {
  const LS_KEY = "jlm-hw-student-list-v1";
  let cachedStudents = null;
  let fetchPromise = null;

  function normalizeStudent(entry) {
    const username = String(entry?.username || "")
      .trim()
      .toLowerCase();
    if (!username) return null;
    const displayName = String(entry?.displayName || username).trim() || username;
    return { username, displayName };
  }

  function mergeStudentLists(...lists) {
    const byUser = new Map();
    lists.flat().forEach((a) => {
      const row = normalizeStudent(a);
      if (row) byUser.set(row.username, row);
    });
    return [...byUser.values()].sort((a, b) => a.username.localeCompare(b.username));
  }

  function readLocalStudents() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.students)
          ? parsed.students
          : null;
      if (!list?.length) return null;
      return mergeStudentLists(list);
    } catch {
      return null;
    }
  }

  function writeLocalStudents(students) {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          students: Array.isArray(students) ? students : [],
        })
      );
    } catch {
      /* quota / private mode */
    }
  }

  function getTeacherUsername() {
    return global.HwAuth?.getTeacherSession?.()?.username || "";
  }

  function resetCache() {
    cachedStudents = null;
    fetchPromise = null;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }

  function setStudents(students) {
    if (!Array.isArray(students)) return;
    cachedStudents = mergeStudentLists(students);
    fetchPromise = Promise.resolve(cachedStudents);
    writeLocalStudents(cachedStudents);
  }

  function getStudentsSync() {
    if (cachedStudents) return cachedStudents.slice();
    const local = readLocalStudents();
    if (local) {
      cachedStudents = local;
      return local.slice();
    }
    return [];
  }

  function isKnownStudent(username) {
    const key = String(username || "")
      .trim()
      .toLowerCase();
    if (!key) return false;
    return getStudentsSync().some((s) => s.username === key);
  }

  /**
   * @param {{ force?: boolean, teacherUsername?: string }} [opts]
   */
  async function fetchStudents(opts) {
    opts = opts || {};

    if (!cachedStudents) {
      const local = readLocalStudents();
      if (local) cachedStudents = local;
    }

    if (!opts.force && cachedStudents) return cachedStudents;
    if (!opts.force && fetchPromise) return fetchPromise;

    fetchPromise = (async () => {
      const teacherUsername = String(opts.teacherUsername || getTeacherUsername() || "").trim();
      const attempts = [];

      if (teacherUsername) {
        attempts.push(async () => {
          const res = await fetch(
            "/api/homework-students?teacherUsername=" + encodeURIComponent(teacherUsername),
            { cache: "no-store" }
          );
          if (!res.ok) return null;
          const data = await res.json();
          return Array.isArray(data.students) ? data.students : null;
        });
      }

      attempts.push(async () => {
        const res = await fetch("/api/homework-catalog", { cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data.students) ? data.students : null;
      });

      for (const load of attempts) {
        try {
          const students = await load();
          if (students?.length) {
            cachedStudents = mergeStudentLists(students);
            writeLocalStudents(cachedStudents);
            return cachedStudents;
          }
        } catch {
          /* try next source */
        }
      }

      if (cachedStudents?.length) return cachedStudents;
      cachedStudents = [];
      return cachedStudents;
    })();

    return fetchPromise;
  }

  function studentOptionLabel(account) {
    const name = account.displayName || account.username;
    if (!name || name === account.username) return account.username;
    return name + " (" + account.username + ")";
  }

  /**
   * @param {HTMLSelectElement|null} selectEl
   * @param {{ keepValue?: string, includeAllOption?: boolean, allLabel?: string, emptyLabel?: string, required?: boolean, placeholder?: string }} opts
   */
  function fillStudentSelect(selectEl, opts) {
    if (!selectEl) return;
    opts = opts || {};
    const keep = opts.keepValue !== undefined ? opts.keepValue : selectEl.value;
    const students = getStudentsSync();

    selectEl.innerHTML = "";

    if (opts.includeAllOption) {
      const all = document.createElement("option");
      all.value = "";
      all.textContent = opts.allLabel || "All students";
      selectEl.appendChild(all);
    } else if (opts.placeholder !== false) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = opts.emptyLabel || opts.placeholder || "— Choose student —";
      if (opts.required !== false && selectEl.required) empty.disabled = true;
      selectEl.appendChild(empty);
    }

    students.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.username;
      opt.textContent = studentOptionLabel(a);
      selectEl.appendChild(opt);
    });

    if (keep && selectEl.querySelector('option[value="' + keep + '"]')) {
      selectEl.value = keep;
    }
  }

  async function refreshSelect(selectEl, opts) {
    await fetchStudents({ force: true, teacherUsername: getTeacherUsername() });
    fillStudentSelect(selectEl, opts);
  }

  const TEACHER_FILTER_SELECTS = [
    { selector: "#hw-mistakes-feed-student", opts: { includeAllOption: true, allLabel: "All students" } },
    { selector: "#hw-submissions-student", opts: { includeAllOption: true, allLabel: "All students" } },
    { selector: "#hw-teacher-viewas-select", opts: { placeholder: "— Teacher hub —", required: false } },
  ];

  async function refreshTeacherFilterSelects() {
    await fetchStudents({ force: true, teacherUsername: getTeacherUsername() });
    TEACHER_FILTER_SELECTS.forEach(({ selector, opts }) => {
      const el = document.querySelector(selector);
      if (el) fillStudentSelect(el, { ...opts, keepValue: el.value });
    });
  }

  global.HwStudentList = {
    fetchStudents,
    getStudentsSync,
    setStudents,
    resetCache,
    isKnownStudent,
    fillStudentSelect,
    refreshSelect,
    refreshTeacherFilterSelects,
    studentOptionLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
