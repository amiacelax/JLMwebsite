/**
 * Homework Hub v5 — post-submission completion zone (mock preview).
 */
(function (global) {
  "use strict";

  const STORAGE = {
    status: "jlm-hw-v5-demo-status",
    answers: "jlm-hw-v5-demo-answers",
  };

  const DEMO_ASSIGNMENT_URL = "/homework/assignments/sheet-uxrsqyd.json";

  let demoAssignment = null;
  let worksheetForm = null;

  const MOCK = {
    lessonUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessonMeta: "2026-06-17 ・ よく ・ あまり",
    history: [
      { title: "May 28 — たい form", date: "May 30" },
      { title: "May 14 — は vs が", date: "May 16" },
      { title: "Apr 30 — Counters", date: "May 2" },
    ],
    feedbackNote:
      "Nice work on よく! Watch あまり — it always pairs with a negative (ません / ない).",
  };

  function readStorage(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }

  function getDemoStatus() {
    return readStorage(STORAGE.status, "submitted");
  }

  function setDemoStatus(status) {
    writeStorage(STORAGE.status, status);
    renderAll();
  }

  function isCompleteView(status) {
    return status === "submitted" || status === "reviewed";
  }

  async function loadDemoAssignment() {
    if (demoAssignment) return demoAssignment;
    const res = await fetch(DEMO_ASSIGNMENT_URL);
    if (!res.ok) throw new Error("Could not load demo worksheet.");
    let data = await res.json();
    if (global.HwWorksheet?.enrichAssignmentMedia) {
      data = global.HwWorksheet.enrichAssignmentMedia(JSON.parse(JSON.stringify(data)));
    }
    demoAssignment = data;
    return demoAssignment;
  }

  function renderHistory() {
    const list = document.getElementById("hw-v5-history");
    if (!list) return;
    list.replaceChildren();
    MOCK.history.forEach((h) => {
      const li = document.createElement("li");
      li.className = "hw-hub-v2-past-list__item";
      li.innerHTML =
        "<span>" + escapeHtml(h.title) + "</span><time>" + escapeHtml(h.date) + "</time>";
      list.appendChild(li);
    });
  }

  function renderLessons() {
    const meta = document.getElementById("hw-lesson-meta");
    const lessonBtn = document.getElementById("hw-latest-lesson");
    if (meta) meta.textContent = MOCK.lessonMeta;
    if (lessonBtn) {
      lessonBtn.href = MOCK.lessonUrl;
      lessonBtn.textContent = "Watch your latest lesson";
      lessonBtn.classList.add("btn--primary");
      lessonBtn.classList.remove("btn--ghost");
    }
  }

  function renderGames() {
    const footer = document.getElementById("hw-games-hub-footer");
    if (!footer) return;
    footer.replaceChildren();
    const link = document.createElement("a");
    link.className = "btn btn--ghost btn--full btn--sm";
    link.href = "/games.html";
    link.textContent = "Open games";
    footer.appendChild(link);
  }

  function renderFeedback(status) {
    const feedback = document.getElementById("hw-v2-feedback");
    const body = document.getElementById("hw-v2-feedback-body");
    if (!feedback) return;
    const show = status === "reviewed";
    feedback.hidden = !show;
    if (body && show) body.textContent = MOCK.feedbackNote;
  }

  function renderWorksheetZone(status) {
    const worksheetCard = document.getElementById("hw-v5-worksheet-card");
    const completeCard = document.getElementById("hw-v5-complete-card");
    const pastFold = document.getElementById("hw-v5-past-fold");
    const showComplete = isCompleteView(status);

    if (worksheetCard) worksheetCard.hidden = showComplete;
    if (completeCard) completeCard.hidden = !showComplete;
    if (pastFold) pastFold.hidden = !showComplete;

    if (!showComplete && !worksheetForm) {
      void mountWorksheet();
    }
  }

  function renderDemoBar(status) {
    document.querySelectorAll("[data-v5-demo-status]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-v5-demo-status") === status);
    });
  }

  function renderAll() {
    const status = getDemoStatus();
    renderDemoBar(status);
    renderWorksheetZone(status);
    renderFeedback(status);
    renderLessons();
    renderGames();
    renderHistory();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function mountWorksheet() {
    const mount = document.getElementById("hw-v2-worksheet-mount");
    const titleEl = document.getElementById("hw-v2-title");
    if (!mount || !global.HwWorksheet?.render) return;

    try {
      const assignment = await loadDemoAssignment();
      if (titleEl) titleEl.textContent = assignment.title || "Homework";
      mount.innerHTML = "";
      worksheetForm = global.HwWorksheet.render(mount, assignment, {
        omitMetaTitle: true,
        omitMetaHint: true,
        studentMeta: {
          username: "demo",
          displayName: "Alex",
          assignmentId: assignment.id || "hub-v5-demo",
          lessonName: assignment.title || "Homework",
        },
      });

      try {
        const saved = JSON.parse(readStorage(STORAGE.answers, "{}"));
        worksheetForm.querySelectorAll(".hw-blank").forEach((el) => {
          if (el.name && saved[el.name] != null) el.value = saved[el.name];
        });
        global.HwWorksheet?.updateSubmitButtonState?.(worksheetForm);
      } catch {
        /* ignore */
      }

      worksheetForm.addEventListener("input", () => {
        const data = {};
        worksheetForm.querySelectorAll(".hw-blank").forEach((el) => {
          if (el.name) data[el.name] = el.value;
        });
        writeStorage(STORAGE.answers, JSON.stringify(data));
        const statusEl = document.getElementById("hw-save-status");
        if (statusEl) statusEl.textContent = "Saved in your browser.";
      });
    } catch {
      mount.innerHTML =
        '<p class="hw-maker-status">Could not load the よく・あまり worksheet. Refresh and try again.</p>';
    }
  }

  function bindUi() {
    document.querySelectorAll("[data-v5-demo-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setDemoStatus(btn.getAttribute("data-v5-demo-status") || "submitted");
      });
    });

    document.getElementById("hw-v5-past-btn")?.addEventListener("click", () => {
      document.getElementById("hw-v5-past-fold")?.scrollIntoView({ behavior: "smooth", block: "start" });
      const fold = document.getElementById("hw-v5-past-fold");
      if (fold && !fold.open) fold.open = true;
    });

    document.getElementById("hw-v5-mistakes-btn")?.addEventListener("click", () => {
      document.getElementById("hw-student-mistakes-card")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    document.getElementById("hw-v5-upgrade-btn")?.addEventListener("click", () => {
      alert("Demo only — upgrade opens plan details on the live hub.");
    });
  }

  function init() {
    bindUi();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
