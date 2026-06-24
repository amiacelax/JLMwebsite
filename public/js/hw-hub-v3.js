/**
 * Homework Hub v3 — isolated prototype (mock data only).
 * Worksheet-first, one primary action, minimal status chrome.
 */
(function (global) {
  "use strict";

  const STORAGE = {
    status: "jlm-hw-v3-demo-status",
    onboarding: "jlm-hw-v3-onboarding-done",
    answers: "jlm-hw-v3-demo-answers",
  };

  const DEMO_ASSIGNMENT_URL = "/homework/assignments/sheet-uxrsqyd.json";

  let demoAssignment = null;

  const MOCK = {
    studentName: "Alex",
    lessonUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessonMeta: "2026-06-17 ・ よく ・ あまり",
    games: [
      { label: "Village prototype", href: "/game/" },
      { label: "Tic Tac Toe", href: "/game/tictactoe-past/" },
      { label: "Lantern Word Hunt", href: "/game/lantern-hunt/" },
      { label: "Yūgen Gatherer", locked: true },
    ],
    mistakes: [
      {
        wrong: "あまり食べます",
        right: "あまり食べません",
        note: "あまり always pairs with a negative verb",
      },
      {
        wrong: "よく寝ません",
        right: "あまり寝ません",
        note: "For \"not much\" use あまり, not よく",
      },
      {
        wrong: "あまり行きます",
        right: "あまり行きません",
        note: "Same pattern — あまり + ません",
      },
    ],
    feedbackNote:
      "Nice work on よく! Watch あまり — it always pairs with a negative (ません / ない). You had one blank where よく crept into a negative sentence.",
    history: [
      { title: "May 28 — たい form", date: "May 30" },
      { title: "May 14 — は vs が", date: "May 16" },
      { title: "Apr 30 — Counters", date: "May 2" },
    ],
  };

  const ONBOARD_STEPS = [
    {
      title: "Take your time",
      text: "This isn't an instant right-or-wrong app. Work through the sheet at your pace — JD will look over your answers and get back to you.",
    },
    {
      title: "Stuck? Ask Sachiko",
      text: "Sachiko can explain grammar or nudge you with hints. She won't fill in the blanks for you.",
    },
  ];

  let demoStatus = "in_progress";
  let worksheetForm = null;

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
    return readStorage(STORAGE.status, demoStatus);
  }

  function setDemoStatus(status) {
    demoStatus = status;
    writeStorage(STORAGE.status, status);
    renderAll();
  }

  function countAnsweredBlanks(form) {
    if (global.HwWorksheet?.countAnsweredQuestions) {
      return global.HwWorksheet.countAnsweredQuestions(form);
    }
    if (!form) return 0;
    let n = 0;
    form.querySelectorAll(".hw-blank").forEach((el) => {
      if (String(el.value || "").trim()) n += 1;
    });
    return n;
  }

  function totalBlanks(form) {
    if (global.HwWorksheet?.totalQuestions) {
      return global.HwWorksheet.totalQuestions(form);
    }
    return form ? form.querySelectorAll(".hw-blank").length : 0;
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

  function saveAnswersFromForm(form) {
    if (!form) return;
    const data = {};
    form.querySelectorAll(".hw-blank").forEach((el) => {
      if (el.name) data[el.name] = el.value;
    });
    writeStorage(STORAGE.answers, JSON.stringify(data));
  }

  function restoreAnswersToForm(form) {
    if (!form) return;
    try {
      const raw = readStorage(STORAGE.answers, "{}");
      const data = JSON.parse(raw);
      form.querySelectorAll(".hw-blank").forEach((el) => {
        if (el.name && data[el.name] != null) el.value = data[el.name];
      });
    } catch {
      /* ignore */
    }
  }

  function heroCopy(status, answered, total) {
    const remaining = Math.max(0, total - answered);

    if (status === "not_started") {
      return {
        tagline: "From your lesson this week. No timer — JD will listen and fix things after you send.",
        statusLine: "",
      };
    }
    if (status === "submitted") {
      return {
        tagline: "Sent to JD. Usually a day or two — no pileup, no instant grading.",
        statusLine: "With JD for review",
      };
    }
    if (status === "reviewed") {
      return {
        tagline: "JD left a note on this sheet.",
        statusLine: "Feedback ready",
      };
    }
    if (remaining === 0) {
      return {
        tagline: "Every blank filled. Send when you're happy — JD reviews by hand.",
        statusLine: answered + " of " + total,
      };
    }
    return {
      tagline: "",
      statusLine: answered + " of " + total,
    };
  }

  function placeHubProgress() {
    const statusLine = document.getElementById("hw-v2-status-line");
    const nav = worksheetForm?.querySelector(".hw-worksheet__slide-nav");
    if (!statusLine || !nav) return;
    if (statusLine.previousElementSibling !== nav) {
      nav.after(statusLine);
      statusLine.classList.add("hw-hub-v2-top__status--below-nav");
    }
  }

  function renderTop() {
    const status = getDemoStatus();
    const answered = countAnsweredBlanks(worksheetForm);
    const total = totalBlanks(worksheetForm);
    const copy = heroCopy(status, answered, total);

    const tagline = document.getElementById("hw-v2-tagline");
    const statusLine = document.getElementById("hw-v2-status-line");
    const feedback = document.getElementById("hw-v2-feedback");
    const feedbackBody = document.getElementById("hw-v2-feedback-body");

    if (tagline) {
      tagline.textContent = copy.tagline;
      tagline.hidden = !copy.tagline;
    }
    if (statusLine) {
      statusLine.textContent = copy.statusLine;
      statusLine.hidden = !copy.statusLine;
    }
    placeHubProgress();
    if (feedback) feedback.hidden = status !== "reviewed";
    if (feedbackBody) feedbackBody.textContent = MOCK.feedbackNote;
  }

  function renderHistory() {
    const list = document.getElementById("hw-v2-history");
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
    const meta = document.getElementById("hw-v3-lesson-meta");
    const playlist = document.getElementById("hw-v3-lesson-playlist");
    if (meta) meta.textContent = MOCK.lessonMeta;
    if (playlist) playlist.href = MOCK.lessonUrl;
  }

  function renderMistakes() {
    const list = document.getElementById("hw-v3-mistake-list");
    const empty = document.getElementById("hw-v3-mistakes-empty");
    if (!list) return;

    list.replaceChildren();
    if (!MOCK.mistakes.length) {
      list.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }

    list.hidden = false;
    if (empty) empty.hidden = true;

    MOCK.mistakes.forEach((m) => {
      const li = document.createElement("li");
      li.className = "hw-mistake-feed__item";
      li.innerHTML =
        '<div class="hw-mistake-feed__row">' +
        '<div class="hw-mistake-feed__body">' +
        '<span class="hw-mistake-feed__pair">' +
        '<span class="hw-mistake-feed__wrong">' +
        escapeHtml(m.wrong) +
        "</span>" +
        '<span class="hw-mistake-feed__right">' +
        escapeHtml(m.right) +
        "</span>" +
        "</span>" +
        (m.note
          ? '<span class="hw-mistake-feed__meta">' + escapeHtml(m.note) + "</span>"
          : "") +
        "</div></div>";
      list.appendChild(li);
    });
  }

  function renderGames() {
    const footer = document.getElementById("hw-v3-games-hub-footer");
    if (!footer) return;
    footer.replaceChildren();
    MOCK.games.forEach((game) => {
      if (game.locked) {
        const lock = document.createElement("span");
        lock.className = "hw-games-hub-btn hw-games-hub-btn--locked";
        lock.textContent = game.label;
        lock.setAttribute("aria-disabled", "true");
        lock.title = "Coming soon";
        footer.appendChild(lock);
        return;
      }
      const link = document.createElement("a");
      link.className = "hw-games-hub-btn";
      link.href = game.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = game.label;
      footer.appendChild(link);
    });
  }

  function renderAll() {
    renderTop();
    renderHistory();
    renderLessons();
    renderMistakes();
    renderGames();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function mockSubmit() {
    const answered = countAnsweredBlanks(worksheetForm);
    const total = totalBlanks(worksheetForm);
    if (total && answered < total) {
      alert("Fill every blank first — same as the live hub.");
      return;
    }
    if (!window.confirm("Send to JD? (Demo — no real submission.)")) return;
    setDemoStatus("submitted");
  }

  async function mountWorksheet() {
    const mount = document.getElementById("hw-v2-worksheet-mount");
    if (!mount || !global.HwWorksheet) return;

    let assignment;
    try {
      assignment = await loadDemoAssignment();
    } catch {
      mount.innerHTML =
        '<p class="hw-maker-status">Could not load the よく・あまり worksheet. Refresh and try again.</p>';
      return;
    }

    const titleEl = document.getElementById("hw-v2-title");
    const hiddenTitle = document.getElementById("hw-current-assignment-title");
    if (titleEl && assignment.title) titleEl.textContent = assignment.title;
    if (hiddenTitle && assignment.title) hiddenTitle.textContent = assignment.title;

    mount.replaceChildren();
    worksheetForm = global.HwWorksheet.render(mount, assignment, {
      omitMetaTitle: true,
      omitMetaHint: true,
      studentMeta: {
        username: "demo_v3",
        displayName: MOCK.studentName,
        assignmentId: assignment.id || "sheet-uxrsqyd",
        lessonName: assignment.title || "よく・あまり",
      },
    });

    restoreAnswersToForm(worksheetForm);

    worksheetForm.addEventListener("input", () => {
      if (getDemoStatus() === "not_started") setDemoStatus("in_progress");
      saveAnswersFromForm(worksheetForm);
      renderTop();
    });

    worksheetForm.addEventListener("hw-worksheet-answer", () => {
      if (getDemoStatus() === "not_started") setDemoStatus("in_progress");
      renderTop();
    });

    worksheetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      mockSubmit();
    });

    const submitBtn = worksheetForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "Send to JD";

    renderAll();
  }

  let onboardStep = 0;

  function initOnboarding() {
    const overlay = document.getElementById("hw-v2-onboard");
    if (readStorage(STORAGE.onboarding, "") === "1") {
      if (overlay) overlay.hidden = true;
      return;
    }
    if (overlay) overlay.hidden = false;
    renderOnboardStep();
  }

  function renderOnboardStep() {
    const step = ONBOARD_STEPS[onboardStep];
    const title = document.getElementById("hw-v2-onboard-title");
    const text = document.getElementById("hw-v2-onboard-text");
    const stepEl = document.getElementById("hw-v2-onboard-step");
    if (title) title.textContent = step.title;
    if (text) text.textContent = step.text;
    if (stepEl) stepEl.textContent = onboardStep + 1 + " of " + ONBOARD_STEPS.length;
  }

  function nextOnboard() {
    onboardStep += 1;
    if (onboardStep >= ONBOARD_STEPS.length) {
      writeStorage(STORAGE.onboarding, "1");
      const overlay = document.getElementById("hw-v2-onboard");
      if (overlay) overlay.hidden = true;
      return;
    }
    renderOnboardStep();
  }

  function skipOnboard() {
    writeStorage(STORAGE.onboarding, "1");
    const overlay = document.getElementById("hw-v2-onboard");
    if (overlay) overlay.hidden = true;
  }

  function initDemoBar() {
    document.querySelectorAll("[data-v2-demo-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const status = btn.getAttribute("data-v2-demo-status");
        if (status) setDemoStatus(status);
        document.querySelectorAll("[data-v2-demo-status]").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
        });
      });
    });
    document.querySelectorAll("[data-v2-demo-status]").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-v2-demo-status") === getDemoStatus());
    });
  }

  function bindActions() {
    document.getElementById("hw-v2-lesson-link")?.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(MOCK.lessonUrl, "_blank", "noopener,noreferrer");
    });

    document.getElementById("hw-v2-onboard-next")?.addEventListener("click", nextOnboard);
    document.getElementById("hw-v2-onboard-skip")?.addEventListener("click", skipOnboard);
  }

  async function init() {
    demoStatus = getDemoStatus();
    initDemoBar();
    bindActions();
    initOnboarding();
    await mountWorksheet();

    if (global.HwSachiko?.initHubPreview) {
      global.HwSachiko.initHubPreview();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init().catch(() => {});
    });
  } else {
    init().catch(() => {});
  }

  global.HwHubV3 = {
    init,
    setDemoStatus,
    MOCK,
    loadDemoAssignment,
    getDemoAssignment: () => demoAssignment,
  };
})(window);
