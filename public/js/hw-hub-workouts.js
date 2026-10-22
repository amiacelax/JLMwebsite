/**
 * Quest Only — weekly immersion workouts (52 weeks).
 * The week changes Monday at 5:00 a.m. in the browser's local time.
 */
(function (global) {
  "use strict";

  const LS_PREFIX = "jlm-hw-weekly-workouts:";
  const TOTAL = () => global.HwWeeklyWorkoutsData?.TOTAL_WEEKS || 52;

  function workoutsEnabled() {
    if (global.HwAuth?.hasQuestOnlyAccess?.()) return true;
    if (global.HwHubV5Live?.isQuestOnlyAccount?.()) return true;
    /* Test accounts that have the Workouts tab (see WORKOUT_TAB_USERS in hw-hub-v5-live.js). */
    const user = String(global.HwAuth?.getSession?.()?.username || "")
      .trim()
      .toLowerCase();
    return user === "demo1" || user === "demoprem";
  }

  function username() {
    return String(global.HwAuth?.getSession?.()?.username || "")
      .trim()
      .toLowerCase();
  }

  function lsKey() {
    return LS_PREFIX + (username() || "anon");
  }

  function isoWeekYear() {
    const key = global.HwLocalPeriod?.dayKey?.() || "";
    let y;
    let m;
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      const parts = key.split("-").map(Number);
      y = parts[0];
      m = parts[1];
      d = parts[2];
    } else {
      const now = new Date();
      y = now.getFullYear();
      m = now.getMonth() + 1;
      d = now.getDate();
    }
    const dt = new Date(Date.UTC(y, m - 1, d));
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return { week: Math.max(1, Math.min(TOTAL(), week)), year: dt.getUTCFullYear() };
  }

  function emptyProgress() {
    return { completed: {} };
  }

  function readProgress() {
    try {
      const raw = localStorage.getItem(lsKey());
      if (!raw) return emptyProgress();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return emptyProgress();
      return { completed: parsed.completed && typeof parsed.completed === "object" ? parsed.completed : {} };
    } catch {
      return emptyProgress();
    }
  }

  let progress = readProgress();
  let browseOffset = 0;

  function writeProgress() {
    try {
      localStorage.setItem(lsKey(), JSON.stringify(progress));
    } catch {
      /* ignore */
    }
  }

  function weekKey(week, year) {
    return String(year || isoWeekYear().year) + "-W" + String(week).padStart(2, "0");
  }

  function displayedWeek() {
    const base = isoWeekYear();
    const n = Math.max(1, Math.min(TOTAL(), base.week + browseOffset));
    return { week: n, year: base.year, data: global.HwWeeklyWorkoutsData?.weekAt?.(n) };
  }

  function isCompleted(week, year) {
    return Boolean(progress.completed[weekKey(week, year)]);
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPanel() {
    const mount = document.getElementById("hw-v5-workouts-root");
    if (!mount) return;
    renderInto(mount, false);
  }

  /* Accounts without the Workouts tab get the same card inside the Quest tab. */
  function renderEmbed() {
    const mount = document.getElementById("hw-quest-workout-embed");
    if (!mount) return;
    if (workoutsEnabled()) {
      mount.innerHTML = "";
      return;
    }
    renderInto(mount, true);
  }

  function renderInto(mount, embed) {
    const rerender = () => renderInto(mount, embed);
    if (!embed && !workoutsEnabled()) {
      mount.innerHTML =
        '<article class="hw-workout hw-workout--soon-only">' +
        '<p class="hw-workout__soon-only">Weekly workouts are part of Quest Only.</p></article>';
      return;
    }

    const view = displayedWeek();
    const w = view.data || { title: "Workout", task: "Check back soon." };

    /* demo1's Workout tab uses the same box as QuestTest: the sentence, the picture on top. */
    if (!embed && username() === "demo1") {
      const examples =
        Array.isArray(w.examples) && w.examples.length
          ? '<div class="hw-ex-workout"><ul class="hw-ex-workout__examples">' +
            w.examples.map((ex) => "<li>" + escapeHtml(ex) + "</li>").join("") +
            "</ul></div>"
          : "";
      mount.innerHTML =
        '<article class="hw-quest hw-hour-quest is-workout">' +
        '<div class="hw-quest__target-box">' +
        '<span class="hw-ex-arm" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></span>' +
        '<p class="hw-quest__target hw-quest__target--ask">' +
        escapeHtml(w.task || "") +
        "</p></div>" +
        examples +
        "</article>";
      return;
    }

    const current = isoWeekYear();
    const preview = browseOffset !== 0;
    const done = isCompleted(view.week, view.year);
    const isCurrentWeek = view.week === current.week && view.year === current.year;
    const rest = w.rest === true;

    let status;
    if (preview) {
      status = "Preview — week " + view.week + " of " + TOTAL() + ".";
    } else if (done) {
      status = rest
        ? "Rest week marked — enjoy the break."
        : "Nice — you logged this week's workout.";
    } else if (isCurrentWeek) {
      status = rest ? "This week is a rest week." : "This week's immersion workout";
    } else {
      status = "Week " + view.week + " workout";
    }

    mount.innerHTML =
      '<article class="hw-workout">' +
      '<h2 class="hw-workout__title">' +
      (embed ? "This Week\u2019s Workout" : "Weekly Workout") +
      "</h2>" +
      '<p class="hw-workout__status">' +
      escapeHtml(status) +
      "</p>" +
      '<div class="hw-workout__nav">' +
      '<button type="button" class="hw-workout__nav-btn" id="hw-workout-prev" aria-label="Previous week"' +
      (browseOffset <= -51 ? " disabled" : "") +
      '><span aria-hidden="true">←</span></button>' +
      '<span class="hw-workout__nav-label">Week ' +
      view.week +
      "</span>" +
      '<button type="button" class="hw-workout__nav-btn" id="hw-workout-next" aria-label="Next week"' +
      (browseOffset >= 51 ? " disabled" : "") +
      '><span aria-hidden="true">→</span></button>' +
      "</div>" +
      '<div class="hw-workout__card' +
      (rest ? " hw-workout__card--rest" : "") +
      '">' +
      '<h3 class="hw-workout__card-title">' +
      escapeHtml(w.title) +
      "</h3>" +
      '<p class="hw-workout__task">' +
      escapeHtml(w.task) +
      "</p>" +
      (Array.isArray(w.examples) && w.examples.length
        ? '<ul class="hw-workout__examples">' +
          w.examples
            .map((ex) => "<li>" + escapeHtml(ex) + "</li>")
            .join("") +
          "</ul>"
        : "") +
      (w.tip
        ? '<p class="hw-workout__tip">' + escapeHtml(w.tip) + "</p>"
        : "") +
      (w.bonus
        ? '<p class="hw-workout__bonus"><strong>Bonus:</strong> ' +
          escapeHtml(w.bonus) +
          "</p>"
        : "") +
      "</div>" +
      '<div class="hw-workout__actions">' +
      '<button type="button" class="btn btn--primary" id="hw-workout-done"' +
      (done ? " disabled" : "") +
      ">" +
      (rest ? "Mark rest week done" : done ? "Done this week" : "Mark week done") +
      "</button>" +
      (done && isCurrentWeek
        ? '<button type="button" class="btn btn--ghost" id="hw-workout-undo">Undo</button>'
        : "") +
      "</div>" +
      '<p class="hw-workout__foot">From JD\u2019s Japanese Daily Workout Calendar — one focus per week, all year.</p>' +
      "</article>";

    mount.querySelector("#hw-workout-prev")?.addEventListener("click", () => {
      browseOffset = Math.max(-51, browseOffset - 1);
      rerender();
    });
    mount.querySelector("#hw-workout-next")?.addEventListener("click", () => {
      browseOffset = Math.min(51, browseOffset + 1);
      rerender();
    });
    mount.querySelector("#hw-workout-done")?.addEventListener("click", () => {
      progress.completed[weekKey(view.week, view.year)] = new Date().toISOString();
      writeProgress();
      rerender();
    });
    mount.querySelector("#hw-workout-undo")?.addEventListener("click", () => {
      delete progress.completed[weekKey(view.week, view.year)];
      writeProgress();
      rerender();
    });
  }

  /** Short workout under Daily Exercise. The big box shows the title; this is just the task. */
  function renderInExercise(mount, titleEl, article) {
    if (!mount) return;
    const view = displayedWeek();
    const w = view.data || { title: "Workout", task: "" };
    if (titleEl) titleEl.textContent = w.task || "";
    const box = titleEl && titleEl.parentElement;
    if (box) box.querySelector(".hw-workout-pic")?.remove();
    mount.innerHTML =
      Array.isArray(w.examples) && w.examples.length
        ? '<ul class="hw-ex-workout__examples">' +
          w.examples.map((ex) => "<li>" + escapeHtml(ex) + "</li>").join("") +
          "</ul>"
        : "";
  }

  function shiftWeek(dir) {
    browseOffset = Math.max(-51, Math.min(51, browseOffset + Number(dir) || 0));
  }

  function ensurePanel() {
    const below = document.getElementById("hw-v5-below");
    if (!below || document.getElementById("hw-v5-panel-workouts")) return;
    const root = document.createElement("div");
    root.id = "hw-v5-workouts-root";
    root.className = "hw-workout-root";
    const wrap = document.createElement("div");
    wrap.className = "hw-hub-v5-panel";
    wrap.id = "hw-v5-panel-workouts";
    wrap.dataset.v5Panel = "workouts";
    wrap.setAttribute("role", "tabpanel");
    wrap.setAttribute("aria-labelledby", "hw-v5-tab-workouts");
    wrap.hidden = true;
    wrap.appendChild(root);
    const quest = document.getElementById("hw-v5-panel-quest");
    if (quest && quest.parentElement === below) {
      below.insertBefore(wrap, quest.nextSibling);
    } else {
      below.prepend(wrap);
    }
  }

  function refresh() {
    progress = readProgress();
    ensurePanel();
    renderPanel();
    renderEmbed();
  }

  global.HwHubWorkouts = {
    workoutsEnabled,
    ensurePanel,
    renderEmbed,
    renderInExercise,
    shiftWeek,
    refresh,
  };
})(window);
