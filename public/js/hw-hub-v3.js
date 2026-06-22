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

  const DEMO_ASSIGNMENT = {
    id: "hub-v3-demo",
    title: "よく・あまり",
    date: "2026-06-17",
    lessonName: "June 17 — よく & あまり",
    register: "polite",
    sections: [
      {
        id: "sec-yoku-amari",
        mode: "grammar-blank",
        title: "Fill in the blank",
        instructions:
          "Use よく (often) or あまり. Remember: あまり goes with a negative verb — あまり〜ません.",
        items: [
          {
            id: "v2-q1",
            parts: [
              { type: "text", value: "私は" },
              { type: "blank", name: "v2_b1", variants: ["よく"] },
              { type: "text", value: "コーヒーを飲みます。" },
            ],
          },
          {
            id: "v2-q2",
            negative: true,
            parts: [
              { type: "text", value: "彼は" },
              { type: "blank", name: "v2_b2", variants: ["あまり"] },
              { type: "text", value: "テレビを見ません。" },
            ],
          },
          {
            id: "v2-q3",
            parts: [
              { type: "text", value: "日本語を" },
              { type: "blank", name: "v2_b3", variants: ["よく"] },
              { type: "text", value: "勉強しています。" },
            ],
          },
          {
            id: "v2-q4",
            negative: true,
            parts: [
              { type: "text", value: "今日は" },
              { type: "blank", name: "v2_b4", variants: ["あまり"] },
              { type: "text", value: "寒くないです。" },
            ],
          },
          {
            id: "v2-q5",
            parts: [
              { type: "text", value: "週末は" },
              { type: "blank", name: "v2_b5", variants: ["よく"] },
              { type: "text", value: "友だちに会います。" },
            ],
          },
          {
            id: "v2-q6",
            negative: true,
            parts: [
              { type: "text", value: "このレストランは" },
              { type: "blank", name: "v2_b6", variants: ["あまり"] },
              { type: "text", value: "高くないです。" },
            ],
          },
        ],
      },
    ],
  };

  const MOCK = {
    studentName: "Alex",
    lessonUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
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
    if (!form) return 0;
    let n = 0;
    form.querySelectorAll(".hw-blank").forEach((el) => {
      if (String(el.value || "").trim()) n += 1;
    });
    return n;
  }

  function totalBlanks(form) {
    return form ? form.querySelectorAll(".hw-blank").length : 6;
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
        cta: "Open homework",
        action: "scroll-worksheet",
      };
    }
    if (status === "submitted") {
      return {
        tagline: "Sent to JD. Usually a day or two — no pileup, no instant grading.",
        statusLine: "With JD for review",
        cta: "Open homework",
        action: "scroll-worksheet",
      };
    }
    if (status === "reviewed") {
      return {
        tagline: "JD left a note on this sheet.",
        statusLine: "Feedback ready",
        cta: "See feedback",
        action: "feedback",
      };
    }
    if (remaining === 0) {
      return {
        tagline: "Every blank filled. Send when you're happy — JD reviews by hand.",
        statusLine: answered + " of " + total + " done",
        cta: "Send to JD",
        action: "submit",
      };
    }
    return {
      tagline: remaining + " left. Your answers save as you type.",
      statusLine: answered + " of " + total + " done",
      cta: "Continue homework",
      action: "scroll-worksheet",
    };
  }

  function renderTop() {
    const status = getDemoStatus();
    const answered = countAnsweredBlanks(worksheetForm);
    const total = totalBlanks(worksheetForm);
    const copy = heroCopy(status, answered, total);

    const hello = document.getElementById("hw-v2-hello");
    const tagline = document.getElementById("hw-v2-tagline");
    const statusLine = document.getElementById("hw-v2-status-line");
    const cta = document.getElementById("hw-v2-cta-primary");
    const feedback = document.getElementById("hw-v2-feedback");
    const feedbackBody = document.getElementById("hw-v2-feedback-body");

    if (hello) hello.textContent = MOCK.studentName;
    if (tagline) tagline.textContent = copy.tagline;
    if (statusLine) {
      statusLine.textContent = copy.statusLine;
      statusLine.hidden = !copy.statusLine;
    }
    if (cta) {
      cta.textContent = copy.cta;
      cta.dataset.action = copy.action;
    }
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

  function renderAll() {
    renderTop();
    renderHistory();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scrollToWorksheet() {
    document.getElementById("hw-v2-worksheet-zone")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToFeedback() {
    const el = document.getElementById("hw-v2-feedback");
    if (el && !el.hidden) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    scrollToWorksheet();
  }

  function mockSubmit() {
    const answered = countAnsweredBlanks(worksheetForm);
    const total = totalBlanks(worksheetForm);
    if (answered < total) {
      alert("Fill every blank first — same as the live hub.");
      return;
    }
    if (!window.confirm("Send to JD? (Demo — no real submission.)")) return;
    setDemoStatus("submitted");
  }

  function mountWorksheet() {
    const mount = document.getElementById("hw-v2-worksheet-mount");
    if (!mount || !global.HwWorksheet) return;

    mount.replaceChildren();
    worksheetForm = global.HwWorksheet.render(mount, DEMO_ASSIGNMENT, {
      studentMeta: {
        username: "demo_v2",
        displayName: MOCK.studentName,
        assignmentId: DEMO_ASSIGNMENT.id,
        lessonName: DEMO_ASSIGNMENT.lessonName,
      },
    });

    restoreAnswersToForm(worksheetForm);

    worksheetForm.addEventListener("input", () => {
      if (getDemoStatus() === "not_started") setDemoStatus("in_progress");
      saveAnswersFromForm(worksheetForm);
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
    document.getElementById("hw-v2-cta-primary")?.addEventListener("click", () => {
      const action = document.getElementById("hw-v2-cta-primary")?.dataset.action;
      if (action === "start" || action === "scroll-worksheet") {
        if (getDemoStatus() === "not_started") setDemoStatus("in_progress");
        scrollToWorksheet();
      } else if (action === "feedback") scrollToFeedback();
      else if (action === "submit") mockSubmit();
    });

    document.getElementById("hw-v2-lesson-link")?.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(MOCK.lessonUrl, "_blank", "noopener,noreferrer");
    });

    document.getElementById("hw-v2-onboard-next")?.addEventListener("click", nextOnboard);
    document.getElementById("hw-v2-onboard-skip")?.addEventListener("click", skipOnboard);
  }

  function requireTeacherPreview() {
    if (!global.HwAuth) return false;
    const session = global.HwAuth.getSession();
    if (!session || session.role !== "teacher") {
      document.body.innerHTML =
        '<main style="padding:2rem;font-family:Inter,sans-serif;text-align:center"><h1>Teacher preview only</h1><p>This prototype is linked from the teacher hub. <a href="/homework/platform.html">Back to platform</a></p></main>';
      return false;
    }
    return true;
  }

  function init() {
    if (!requireTeacherPreview()) return;

    demoStatus = getDemoStatus();
    initDemoBar();
    bindActions();
    initOnboarding();
    mountWorksheet();

    if (global.HwSachiko?.initHubPreview) {
      global.HwSachiko.initHubPreview();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.HwHubV3 = { init, setDemoStatus, MOCK, DEMO_ASSIGNMENT };
})(window);
