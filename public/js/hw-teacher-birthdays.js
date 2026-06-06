/**
 * Teacher view — student birthday list.
 */
(function (global) {
  let birthdaysCache = [];
  let bound = false;
  let options = null;

  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  function formatLabel(entry) {
    if (entry.month == null || entry.day == null) return "—";
    const base = MONTHS[entry.month - 1] + " " + entry.day;
    return entry.uncertain ? base + "?" : base;
  }

  function countdownLabel(entry) {
    if (entry.daysUntil == null) return "Date unknown";
    if (entry.daysUntil === 0) return "Today";
    if (entry.daysUntil === 1) return "Tomorrow";
    return "In " + entry.daysUntil + " days";
  }

  async function fetchBirthdays(session) {
    const url =
      "/api/student-birthdays?teacherUsername=" + encodeURIComponent(session.username);
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not load birthdays.");
    }
    const data = await res.json();
    return Array.isArray(data.birthdays) ? data.birthdays : [];
  }

  function renderList() {
    const list = document.getElementById("hw-birthdays-list");
    const meta = document.getElementById("hw-birthdays-meta");
    if (!list) return;

    const query = (document.getElementById("hw-birthdays-search")?.value || "")
      .trim()
      .toLowerCase();
    const filtered = birthdaysCache.filter((entry) => {
      if (!query) return true;
      return [entry.name, formatLabel(entry), entry.note || ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    list.replaceChildren();

    const todayCount = birthdaysCache.filter((entry) => entry.daysUntil === 0).length;
    if (meta) {
      meta.textContent =
        birthdaysCache.length === 0
          ? "No birthdays loaded."
          : filtered.length +
            " of " +
            birthdaysCache.length +
            " student" +
            (birthdaysCache.length === 1 ? "" : "s") +
            (todayCount ? " · " + todayCount + " today (Japan time)" : "");
    }

    if (!filtered.length) {
      const li = document.createElement("li");
      li.className = "hw-submissions-item hw-submissions-item--empty";
      const p = document.createElement("p");
      p.textContent = birthdaysCache.length
        ? "No students match that search."
        : "No birthdays on file yet.";
      li.appendChild(p);
      list.appendChild(li);
      return;
    }

    filtered.forEach((entry) => {
      const li = document.createElement("li");
      li.className =
        "hw-submissions-item" + (entry.daysUntil === 0 ? " hw-birthdays-item--today" : "");

      const main = document.createElement("div");
      main.className = "hw-submissions-item__main";

      const top = document.createElement("div");
      top.className = "hw-submissions-item__top";

      const date = document.createElement("p");
      date.className = "hw-submissions-item__date";
      date.textContent = formatLabel(entry);

      const when = document.createElement("span");
      when.className = "hw-submissions-item__type hw-submissions-item__type--online";
      when.textContent = countdownLabel(entry);

      top.append(date, when);

      const title = document.createElement("h3");
      title.className = "hw-submissions-item__title";
      title.textContent = entry.name;

      main.append(top, title);

      if (entry.note) {
        const sub = document.createElement("p");
        sub.className = "hw-submissions-item__sub";
        sub.textContent = entry.note;
        main.appendChild(sub);
      }

      li.appendChild(main);
      list.appendChild(li);
    });
  }

  async function reloadBirthdays() {
    const session = options?.getTeacherSession?.();
    if (!session || session.role !== "teacher") return;

    try {
      birthdaysCache = await fetchBirthdays(session);
      renderList();
    } catch (err) {
      const meta = document.getElementById("hw-birthdays-meta");
      if (meta) meta.textContent = err.message || "Could not load birthdays.";
    }
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    document.getElementById("hw-birthdays-search")?.addEventListener("input", renderList);
    document.getElementById("hw-birthdays-refresh")?.addEventListener("click", () => {
      void reloadBirthdays();
      options?.showToast?.("Birthdays refreshed.");
    });
  }

  function init(opts) {
    options = opts || {};
    bindOnce();
    void reloadBirthdays();
  }

  global.HwTeacherBirthdays = { init, reload: reloadBirthdays };
})(window);
