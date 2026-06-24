/**
 * Homework Hub v4 — live platform layout with v3 worksheet on top (mock preview).
 */
(function (global) {
  "use strict";

  const STORAGE = {
    status: "jlm-hw-v4-demo-status",
    onboarding: "jlm-hw-v4-onboarding-done",
    answers: "jlm-hw-v4-demo-answers",
  };

  const DEMO_ASSIGNMENT_URL = "/homework/assignments/sheet-uxrsqyd.json";

  let demoAssignment = null;

  const MOCK = {
    studentName: "Alex",
    lessonUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessonMeta: "2026-06-17 ・ よく ・ あまり",
    assignmentLabel: "2026-06-17 ・ よく ・ あまり",
    games: [
      { label: "Village prototype", href: "/game/" },
      { label: "Tic Tac Toe", href: "/game/tictactoe-past/" },
      { label: "Lantern Word Hunt", href: "/game/lantern-hunt/" },
      { label: "Yūgen Gatherer", locked: true },
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
      title: "Everything else is below",
      text: "Lesson links, games, and your mistake list sit under the homework — same hub, homework first.",
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

  function renderAssignmentCard() {
    /* Title/status live in worksheet card header on v4 */
  }

  function renderLessons() {
    const meta = document.getElementById("hw-lesson-meta");
    const lessonBtn = document.getElementById("hw-latest-lesson");
    const playlist = document.getElementById("hw-lesson-playlist");

    if (meta) meta.textContent = MOCK.lessonMeta;
    if (lessonBtn) {
      lessonBtn.href = MOCK.lessonUrl;
      lessonBtn.textContent = "Watch lesson (YouTube link coming soon)";
    }
    if (playlist) {
      playlist.href = MOCK.lessonUrl;
      playlist.hidden = false;
    }
  }

  function renderMistakes() {
    const empty = document.getElementById("hw-student-mistakes-empty");
    const main = document.getElementById("hw-student-mistakes-main");
    if (empty) empty.hidden = false;
    if (main) {
      main.querySelectorAll(".hw-mistake-feed-fold, .hw-mistake-feed-single").forEach((el) => {
        el.hidden = true;
      });
    }
  }

  function renderGames() {
    const footer = document.getElementById("hw-games-hub-footer");
    const card = document.getElementById("hw-games-hub-card");
    if (!footer) return;
    if (card) card.hidden = false;
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
    renderAssignmentCard();
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

  function requestPrint() {
    const form = worksheetForm || document.getElementById("hw-worksheet-form");
    if (!form || typeof global.HwWorksheet?.printBlank !== "function") return;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    global.HwWorksheet.printBlank(form);
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
    if (titleEl && assignment.title) titleEl.textContent = assignment.title;

    mount.replaceChildren();
    worksheetForm = global.HwWorksheet.render(mount, assignment, {
      omitMetaTitle: true,
      omitMetaHint: true,
      studentMeta: {
        username: "demo_v4",
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

  function renderHubTitle() {
    const titleEl = document.getElementById("hw-hub-title");
    if (!titleEl) return;
    const session = global.HwAuth?.getSession?.();
    const name = session?.displayName || session?.username || MOCK.studentName;
    titleEl.textContent = global.HwAuth?.possessiveHubTitle
      ? global.HwAuth.possessiveHubTitle(name)
      : name + "'s hub";
  }

  function bindActions() {
    document.getElementById("hw-pill-print")?.addEventListener("click", requestPrint);
    document.getElementById("hw-v2-onboard-next")?.addEventListener("click", nextOnboard);
    document.getElementById("hw-v2-onboard-skip")?.addEventListener("click", skipOnboard);

    const greet = document.getElementById("hw-platform-greet");
    if (greet) greet.textContent = MOCK.studentName;
    renderHubTitle();
  }

  async function init() {
    demoStatus = getDemoStatus();
    initDemoBar();
    bindActions();
    initOnboarding();
    await mountWorksheet();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init().catch(() => {});
    });
  } else {
    init().catch(() => {});
  }

  global.HwHubV4 = {
    init,
    setDemoStatus,
    MOCK,
    loadDemoAssignment,
    getDemoAssignment: () => demoAssignment,
  };
})(window);
