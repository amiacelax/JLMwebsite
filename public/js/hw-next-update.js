/**
 * "12 hours until next Quest" lines on the Homework Hub tabs that refresh on a schedule.
 *
 * Exercise, Situation and Core Japanese change at 5:00 a.m. in the student's local time (same
 * cutover as hw-local-period.js). Quest and Workout change Monday at 5:00 a.m.
 *
 * To add another timed tab: add a row to TIMED below (panel id, label, daily/weekly).
 */
(function (global) {
  "use strict";

  const CUTOVER_HOUR = 5;
  const CLASS = "hw-next-update";

  const TIMED = [
    {
      panel: "hw-v5-panel-quest",
      label: "Quest",
      /* The quest changes every Monday at 5:00 a.m. */
      every: "week",
      inBox: true,
      active: () => global.HwHubQuests?.questLayoutEnabled?.() !== false,
    },
    {
      panel: "hw-v5-panel-notebook",
      label: "Exercise",
      every: "day",
      inBox: true,
      active: () => global.HwHubV5Live?.usesCurriculumHub?.() === true,
    },
    { panel: "hw-v5-panel-situations", label: "Situation", every: "day", inBox: true },
    { panel: "hw-v5-panel-core", label: "Core Japanese", every: "day" },
    { panel: "hw-v5-panel-workouts", label: "Workout", every: "week" },
  ];

  function nextDayStart(now) {
    const t = new Date(now.getTime());
    t.setHours(CUTOVER_HOUR, 0, 0, 0);
    if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
    return t;
  }

  function nextWeekStart(now) {
    const t = new Date(now.getTime());
    t.setHours(CUTOVER_HOUR, 0, 0, 0);
    /* Days until the next Monday (0 = Sunday ... 1 = Monday). */
    let add = (8 - t.getDay()) % 7;
    if (add === 0 && t.getTime() <= now.getTime()) add = 7;
    t.setDate(t.getDate() + add);
    if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 7);
    return t;
  }

  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  function two(n) {
    return String(n).padStart(2, "0");
  }

  /** The time left as days:hours:minutes, e.g. 01:10:49 (the colons blink like a clock). */
  function parts(row, now) {
    const next = row.every === "week" ? nextWeekStart(now) : nextDayStart(now);
    const mins = Math.max(0, Math.floor((next.getTime() - now.getTime()) / 60000));
    return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
  }

  function textFor(row, now) {
    const p = parts(row, now);
    return two(p.d) + ":" + two(p.h) + ":" + two(p.m);
  }

  function fill(el, row, now) {
    const p = parts(row, now);
    const key = two(p.d) + ":" + two(p.h) + ":" + two(p.m);
    if (el.getAttribute("data-clock") === key) return;
    el.setAttribute("data-clock", key);
    el.innerHTML =
      "<span>" + two(p.d) + "</span><b>:</b><span>" + two(p.h) + "</span><b>:</b><span>" + two(p.m) + '</span><span class="hw-next-update__lbl"> until next</span>';
    const words = plural(p.d, "day") + ", " + plural(p.h, "hour") + ", " + plural(p.m, "minute");
    el.setAttribute("aria-label", words + " until next " + row.label);
    el.setAttribute("title", "Next " + row.label + " in " + words);
  }

  function paint(row, now) {
    const panel = document.getElementById(row.panel);
    let line = panel ? panel.querySelector(":scope > ." + CLASS) : null;
    const on = !!panel && (row.active ? row.active() : true);
    if (!on) {
      line?.remove();
      panel?.querySelectorAll("." + CLASS).forEach((el) => el.remove());
      return;
    }
    /* Quest / Exercise / Situation: a small timer in the corner of the green prompt box. */
    const box = row.inBox ? panel.querySelector(".hw-quest__target-box") : null;
    if (box) {
      line?.remove();
      let tag = box.querySelector(":scope > ." + CLASS);
      if (!tag) {
        tag = document.createElement("p");
        tag.className = CLASS + " " + CLASS + "--in-box";
        box.insertBefore(tag, box.firstChild);
        box.classList.add("has-next-update");
      }
      fill(tag, row, now);
      return;
    }
    if (!line) {
      line = document.createElement("p");
      line.className = CLASS;
    }
    if (panel.firstChild !== line) panel.insertBefore(line, panel.firstChild);
    fill(line, row, now);
  }

  function paintAll() {
    const now = new Date();
    TIMED.forEach((row) => {
      try {
        paint(row, now);
      } catch {
        /* ignore */
      }
    });
  }

  function start() {
    paintAll();
    setInterval(paintAll, 1000);
    /* Panels get rebuilt on tab switches and new days; repaint right after a tab tap. */
    document.addEventListener("click", (ev) => {
      if (ev.target.closest?.("[data-v5-tab]")) setTimeout(paintAll, 150);
    });
    /* Quest / Exercise boxes get redrawn after loading; put the timer back right away. */
    let watched = false;
    let queued = 0;
    const watch = () => {
      if (watched || !global.MutationObserver) return;
      const below = document.getElementById("hw-v5-below");
      if (!below) return;
      watched = true;
      new MutationObserver(() => {
        clearTimeout(queued);
        queued = setTimeout(paintAll, 120);
      }).observe(below, { childList: true, subtree: true });
    };
    watch();
    setInterval(watch, 1500);
  }

  global.HwNextUpdate = { paintAll, textFor, nextDayStart, nextWeekStart, TIMED };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(window);
