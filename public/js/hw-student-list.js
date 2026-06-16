/**
 * Student accounts for teacher UI — merges KV signups with legacy hw-auth list.
 */
(function (global) {
  const DEFAULT_STUDENTS = [
    { username: "benm", displayName: "Ben M" },
    { username: "benc", displayName: "benc" },
    { username: "deme", displayName: "Deme" },
    { username: "ivan", displayName: "Ivan" },
    { username: "joshs", displayName: "Josh S" },
    { username: "noplan", displayName: "No Plan" },
  ];

  let cachedStudents = null;
  let fetchPromise = null;

  function mergeStudentLists(...lists) {
    const byUser = new Map();
    lists.flat().forEach((a) => {
      const username = String(a?.username || "")
        .trim()
        .toLowerCase();
      if (!username) return;
      byUser.set(username, {
        username,
        displayName: String(a.displayName || username).trim() || username,
      });
    });
    return [...byUser.values()].sort((a, b) => a.username.localeCompare(b.username));
  }

  function localStudents() {
    const auth = global.HwAuth?.listStudentAccounts?.();
    if (auth?.length) return mergeStudentLists(auth, DEFAULT_STUDENTS);
    return DEFAULT_STUDENTS.slice();
  }

  function setStudents(students) {
    if (!Array.isArray(students)) return;
    cachedStudents = mergeStudentLists(students, localStudents());
    fetchPromise = Promise.resolve(cachedStudents);
  }

  function getStudentsSync() {
    return cachedStudents || localStudents();
  }

  function isKnownStudent(username) {
    const key = String(username || "")
      .trim()
      .toLowerCase();
    if (!key) return false;
    return getStudentsSync().some((s) => s.username === key);
  }

  async function fetchStudents() {
    if (cachedStudents) return cachedStudents;
    if (fetchPromise) return fetchPromise;
    fetchPromise = (async () => {
      try {
        const res = await fetch("/api/homework-catalog", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.students)) {
            cachedStudents = mergeStudentLists(data.students, localStudents());
            return cachedStudents;
          }
        }
      } catch {
        /* fall back to local list */
      }
      cachedStudents = localStudents();
      return cachedStudents;
    })();
    return fetchPromise;
  }

  function studentOptionLabel(account) {
    const name = account.displayName || account.username;
    if (!name || name === account.username) return account.username;
    return account.username + " — " + name;
  }

  /**
   * @param {HTMLSelectElement|null} selectEl
   * @param {{ keepValue?: string, includeAllOption?: boolean, allLabel?: string, emptyLabel?: string, required?: boolean }} opts
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
    } else {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = opts.emptyLabel || "— Choose student —";
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
    await fetchStudents();
    fillStudentSelect(selectEl, opts);
  }

  const TEACHER_FILTER_SELECTS = [
    { selector: "#hw-mistakes-feed-student", opts: { includeAllOption: true, allLabel: "All students" } },
    { selector: "#hw-submissions-student", opts: { includeAllOption: true, allLabel: "All students" } },
  ];

  async function refreshTeacherFilterSelects() {
    await fetchStudents();
    TEACHER_FILTER_SELECTS.forEach(({ selector, opts }) => {
      const el = document.querySelector(selector);
      if (el) fillStudentSelect(el, { ...opts, keepValue: el.value });
    });
  }

  global.HwStudentList = {
    DEFAULT_STUDENTS,
    fetchStudents,
    getStudentsSync,
    setStudents,
    isKnownStudent,
    fillStudentSelect,
    refreshSelect,
    refreshTeacherFilterSelects,
    studentOptionLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
