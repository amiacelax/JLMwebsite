/**
 * Homework Hub v2 — isolated prototype (mock data only).
 * Does not read or write live student accounts, catalog, or plans.
 */
(function (global) {
  "use strict";

  const STORAGE = {
    status: "jlm-hw-v2-demo-status",
    onboarding: "jlm-hw-v2-onboarding-done",
    answers: "jlm-hw-v2-demo-answers",
    showUpsell: "jlm-hw-v2-demo-show-upsell",
  };

  const DEMO_ASSIGNMENT = {
    id: "hub-v2-demo",
    title: "たい form & giving reasons",
    date: "2026-06-14",
    lessonName: "June 14 — Wants & reasons",
    register: "casual",
    sections: [
      {
        id: "sec-v2-grammar",
        mode: "grammar-blank",
        title: "Grammar blanks",
        instructions: "Fill each blank with the casual form. Use たい where you express a want.",
        items: [
          {
            id: "v2-q1",
            parts: [
              { type: "text", value: "コーヒーが" },
              { type: "blank", name: "v2_b1", variants: ["のみたい", "のむ"] },
              { type: "text", value: "。" },
            ],
          },
          {
            id: "v2-q2",
            parts: [
              { type: "text", value: "日本に" },
              { type: "blank", name: "v2_b2", variants: ["いきたい"] },
              { type: "text", value: "です。" },
            ],
          },
          {
            id: "v2-q3",
            parts: [
              { type: "text", value: "何も" },
              { type: "blank", name: "v2_b3", variants: ["たべたくない"] },
              { type: "text", value: "。" },
            ],
          },
          {
            id: "v2-q4",
            parts: [
              { type: "text", value: "友だちと映画を" },
              { type: "blank", name: "v2_b4", variants: ["みたい"] },
              { type: "text", value: "。" },
            ],
          },
          {
            id: "v2-q5",
            negative: true,
            parts: [
              { type: "text", value: "今日はあまり" },
              { type: "blank", name: "v2_b5", variants: ["べんきょうしたくない"] },
              { type: "text", value: "。" },
            ],
          },
          {
            id: "v2-q6",
            parts: [
              { type: "text", value: "週末はゆっくり" },
              { type: "blank", name: "v2_b6", variants: ["休みたい", "やすみたい"] },
              { type: "text", value: "。" },
            ],
          },
        ],
      },
    ],
  };

  const MOCK = {
    studentName: "Alex",
    lessonUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    lessonTags: ["たい form", "reasons", "casual"],
    timeline: {
      not_started: { label: "Not started", date: "" },
      in_progress: { label: "In progress", date: "Started Tue" },
      submitted: { label: "Submitted", date: "Sent Wed 8:42 PM" },
      reviewed: { label: "JD reviewed", date: "Thu 10:15 AM" },
    },
    notifications: [
      { id: "n1", text: "Homework ready — たい form practice", time: "Wed 9:00 AM", unread: true },
      { id: "n2", text: "JD left feedback on your last assignment", time: "Mon 2:30 PM", unread: true },
      { id: "n3", text: "New lesson recording posted", time: "Sun 6:00 PM", unread: false },
    ],
    history: [
      { title: "May 28 — Te-form chain", status: "Reviewed", date: "May 30" },
      { title: "May 14 — Particle は vs が", status: "Reviewed", date: "May 16" },
      { title: "Apr 30 — Counters", status: "Submitted", date: "May 2" },
    ],
    mistakes: [
      { id: "m1", wrong: "たべたいない", right: "たべたくない", note: "Negative of たい uses たくない" },
      { id: "m2", wrong: "のみたいです", right: "のみたい", note: "Casual register — drop です" },
      { id: "m3", wrong: "いきたいです", right: "いきたい", note: "Same — casual for this worksheet" },
    ],
    chatSuggestions: [
      "Explain たい form simply",
      "Why is my answer wrong?",
      "Give me a hint (not the answer)",
      "Practice my recent mistakes",
      "How do I say \"I don't want to\"?",
      "I'm stuck — message JD",
    ],
  };

  const ONBOARD_STEPS = [
    {
      title: "One step at a time",
      text: "Homework shows one question at a time. Use the arrows to move — your answers save automatically in this demo.",
    },
    {
      title: "Ask the tutor anytime",
      text: "Tap Ask tutor for hints and grammar help. It won't fill in blanks for you — that's for learning!",
    },
    {
      title: "Submit when ready",
      text: "When every blank is filled, send your work to JD. You'll see progress up here the whole way.",
    },
  ];

  const DRILL_TEMPLATES = {
    m1: [
      { q: "Negative of 食べたい →", a: "たべたくない" },
      { q: "Negative of 行きたい →", a: "いきたくない" },
      { q: "Negative of したい →", a: "したくない" },
    ],
    m2: [
      { q: "I want to drink (casual) →", a: "のみたい" },
      { q: "I want to sleep (casual) →", a: "ねたい" },
      { q: "I want to go (casual) →", a: "いきたい" },
    ],
    m3: [
      { q: "行きたい (casual, no です) →", a: "いきたい" },
      { q: "見たい (casual) →", a: "みたい" },
      { q: "会いたい (casual) →", a: "あいたい" },
    ],
  };

  let demoStatus = "in_progress";
  let worksheetForm = null;
  let chatOpen = false;
  let activeDrillId = "m1";

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
    const title = DEMO_ASSIGNMENT.title;
    const date = DEMO_ASSIGNMENT.date;
    if (status === "not_started") {
      return {
        eyebrow: "Ready when you are",
        title: title,
        sub: `From your ${date} lesson — ${total} questions. Take your time; there's no timer.`,
        ctaPrimary: "Start homework",
        ctaPrimaryAction: "start",
        ctaSecondary: "Watch lesson first",
        showProgress: false,
      };
    }
    if (status === "submitted") {
      return {
        eyebrow: "Waiting for JD",
        title: "Submitted — nice work!",
        sub: "JD usually reviews within a day or two. You'll get a notification when feedback is ready.",
        ctaPrimary: "View submission",
        ctaPrimaryAction: "scroll-worksheet",
        ctaSecondary: "Ask tutor",
        showProgress: true,
      };
    }
    if (status === "reviewed") {
      return {
        eyebrow: "Feedback ready",
        title: "JD reviewed your homework",
        sub: "Check the timeline below, then review any notes. Your next assignment arrives when JD publishes it.",
        ctaPrimary: "See feedback",
        ctaPrimaryAction: "scroll-worksheet",
        ctaSecondary: "Practice mistakes",
        showProgress: true,
      };
    }
    const remaining = Math.max(0, total - answered);
    return {
      eyebrow: remaining ? "Pick up where you left off" : "Almost there",
      title: remaining ? `${title}` : "Ready to submit?",
      sub: remaining
        ? `${answered} of ${total} answered — ${remaining} left. Your progress saves as you type.`
        : "Every blank is filled. Send it to JD when you're happy with your answers.",
      ctaPrimary: remaining ? "Continue homework" : "Send to JD",
      ctaPrimaryAction: remaining ? "scroll-worksheet" : "submit",
      ctaSecondary: "Watch lesson",
      showProgress: true,
    };
  }

  function railStepClass(stepKey, status) {
    const order = ["not_started", "in_progress", "submitted", "reviewed"];
    const cur = order.indexOf(status);
    const step = order.indexOf(stepKey);
    if (step < cur) return "is-done";
    if (step === cur) return "is-active";
    return "";
  }

  function renderHero() {
    const answered = countAnsweredBlanks(worksheetForm);
    const total = totalBlanks(worksheetForm);
    const status = getDemoStatus();
    const copy = heroCopy(status, answered, total);
    const pct = total ? Math.round((answered / total) * 100) : 0;

    const eyebrow = document.getElementById("hw-v2-hero-eyebrow");
    const title = document.getElementById("hw-v2-hero-title");
    const sub = document.getElementById("hw-v2-hero-sub");
    const progressWrap = document.getElementById("hw-v2-progress");
    const progressLabel = document.getElementById("hw-v2-progress-label");
    const progressFill = document.getElementById("hw-v2-progress-fill");
    const ctaPrimary = document.getElementById("hw-v2-cta-primary");
    const ctaSecondary = document.getElementById("hw-v2-cta-secondary");

    if (eyebrow) eyebrow.textContent = copy.eyebrow;
    if (title) title.textContent = copy.title;
    if (sub) sub.textContent = copy.sub;
    if (progressWrap) progressWrap.hidden = !copy.showProgress;
    if (progressLabel) progressLabel.textContent = `${answered} of ${total} answered`;
    if (progressFill) progressFill.style.width = pct + "%";
    if (ctaPrimary) {
      ctaPrimary.textContent = copy.ctaPrimary;
      ctaPrimary.dataset.action = copy.ctaPrimaryAction;
      ctaPrimary.disabled = status === "submitted" && copy.ctaPrimaryAction === "submit";
    }
    if (ctaSecondary) ctaSecondary.textContent = copy.ctaSecondary;
  }

  function renderRail() {
    const status = getDemoStatus();
    const steps = ["not_started", "in_progress", "submitted", "reviewed"];
    steps.forEach((key) => {
      const el = document.querySelector(`[data-v2-rail="${key}"]`);
      if (!el) return;
      el.className = "hw-hub-v2-rail__step " + railStepClass(key, status);
      const meta = MOCK.timeline[key];
      const timeEl = el.querySelector("time");
      if (timeEl) timeEl.textContent = meta.date || "";
    });
  }

  function renderNotifications() {
    const list = document.getElementById("hw-v2-notif-list");
    const badge = document.getElementById("hw-v2-notif-badge");
    if (!list) return;
    list.replaceChildren();
    let unread = 0;
    MOCK.notifications.forEach((n) => {
      if (n.unread) unread += 1;
      const li = document.createElement("li");
      li.className = "hw-hub-v2-notif" + (n.unread ? " is-unread" : "");
      li.innerHTML =
        `<span>${escapeHtml(n.text)}</span><span class="hw-hub-v2-notif__time">${escapeHtml(n.time)}</span>`;
      list.appendChild(li);
    });
    if (badge) {
      badge.hidden = unread === 0;
      badge.textContent = String(unread);
    }
  }

  function renderHistory() {
    const list = document.getElementById("hw-v2-history");
    if (!list) return;
    list.replaceChildren();
    MOCK.history.forEach((h) => {
      const li = document.createElement("li");
      li.className = "hw-hub-v2-history__item";
      const statusCls =
        h.status === "Submitted"
          ? "hw-hub-v2-history__status hw-hub-v2-history__status--pending"
          : "hw-hub-v2-history__status";
      li.innerHTML = `<span><strong>${escapeHtml(h.title)}</strong><br><small>${escapeHtml(h.date)}</small></span><span class="${statusCls}">${escapeHtml(h.status)}</span>`;
      list.appendChild(li);
    });
  }

  function renderMistakes() {
    const list = document.getElementById("hw-v2-mistake-list");
    if (!list) return;
    list.replaceChildren();
    MOCK.mistakes.forEach((m) => {
      const li = document.createElement("li");
      li.className = "hw-hub-v2-mistake";
      li.innerHTML = `<span class="hw-hub-v2-mistake__text"><s>${escapeHtml(m.wrong)}</s> → ${escapeHtml(m.right)}</span>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v2-mistake__btn";
      btn.textContent = "Practice";
      btn.addEventListener("click", () => openDrill(m));
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function renderUpsell() {
    const el = document.getElementById("hw-v2-upsell");
    if (!el) return;
    const show = readStorage(STORAGE.showUpsell, "1") === "1";
    el.hidden = !show;
  }

  function renderChatContext() {
    const el = document.getElementById("hw-v2-chat-context");
    if (!el) return;
    const answered = countAnsweredBlanks(worksheetForm);
    const total = totalBlanks(worksheetForm);
    el.textContent = `Context: ${DEMO_ASSIGNMENT.title} · Q ${Math.min(answered + 1, total)}/${total}`;
  }

  function renderAll() {
    renderHero();
    renderRail();
    renderNotifications();
    renderHistory();
    renderMistakes();
    renderUpsell();
    renderChatContext();
    syncMobileBar();
  }

  function syncMobileBar() {
    const status = getDemoStatus();
    const answered = countAnsweredBlanks(worksheetForm);
    const total = totalBlanks(worksheetForm);
    const cont = document.getElementById("hw-v2-mobile-continue");
    const chat = document.getElementById("hw-v2-mobile-chat");
    const sub = document.getElementById("hw-v2-mobile-submit");
    if (cont) {
      cont.textContent = status === "submitted" ? "View HW" : answered >= total ? "Review" : "Continue";
    }
    if (sub) sub.hidden = status === "submitted" || status === "reviewed" || answered < total;
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

  function mockSubmit() {
    const answered = countAnsweredBlanks(worksheetForm);
    const total = totalBlanks(worksheetForm);
    if (answered < total) {
      alert("Fill in every blank first — this is a demo, but the real hub will work the same way.");
      return;
    }
    if (!window.confirm("Send homework to JD? (Demo — no real submission.)")) return;
    setDemoStatus("submitted");
    addChatBotMessage(
      "Submitted! 🎉 In the real hub, JD gets a Discord ping. You'll see \"Reviewed\" here when feedback is ready.",
      "bot"
    );
  }

  function mountWorksheet() {
    const mount = document.getElementById("hw-v2-worksheet-mount");
    if (!mount || !global.HwWorksheet) return;

    mount.replaceChildren();
    worksheetForm = global.HwWorksheet.render(mount, DEMO_ASSIGNMENT, {
      omitMetaTitle: true,
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
      renderHero();
      renderChatContext();
      syncMobileBar();
    });

    worksheetForm.addEventListener("submit", (e) => {
      e.preventDefault();
      mockSubmit();
    });

    const submitBtn = worksheetForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = "Send Homework to JD";

    renderAll();
  }

  /* ——— Chatbot (mock AI) ——— */
  function addChatBotMessage(text, role) {
    const box = document.getElementById("hw-v2-chat-msgs");
    if (!box) return;
    const div = document.createElement("div");
    div.className = "hw-hub-v2-chat-msg hw-hub-v2-chat-msg--" + (role === "user" ? "user" : "bot");
    div.innerHTML = formatChatText(text);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function formatChatText(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  }

  function botReply(userText) {
    const t = userText.toLowerCase();
    const status = getDemoStatus();

    if (/answer|fill in|what goes|solution/.test(t) && !/hint/.test(t)) {
      return (
        "I can explain the **pattern**, but I won't fill in blanks while you're working — that's how you build real recall.\n\n" +
        "Try: \"Explain たい form\" or \"Give me a hint (not the answer)\"."
      );
    }
    if (/explain.*たい|たい form|たいform/.test(t)) {
      return (
        "**たい form** = want to do something.\n\n" +
        "Verb masu-stem + たい → <span class=\"ja\">食べたい</span> (want to eat)\n" +
        "Negative: stem + <span class=\"ja\">たくない</span> → <span class=\"ja\">食べたくない</span>\n\n" +
        "This worksheet uses **casual** register — no です on the blank."
      );
    }
    if (/don't want|たくない|negative/.test(t)) {
      return "For \"don't want to,\" drop たい and add **たくない** to the masu stem: <span class=\"ja\">行きたい</span> → <span class=\"ja\">行きたくない</span>.";
    }
    if (/hint/.test(t)) {
      return "Hint for Q" + (countAnsweredBlanks(worksheetForm) + 1) + ": think **masu stem + たい**. If the sentence is negative, use **たくない** instead.";
    }
    if (/wrong|mistake|why/.test(t)) {
      return (
        "Common slips on this sheet:\n" +
        "• <span class=\"ja\">たべたいない</span> → should be <span class=\"ja\">たべたくない</span>\n" +
        "• Adding <span class=\"ja\">です</span> when the sheet asks for casual\n\n" +
        "Tap **Practice** on a mistake in the sidebar for a mini drill."
      );
    }
    if (/practice|mistake|drill/.test(t)) {
      openDrill(MOCK.mistakes[0]);
      return "Opened a quick drill based on your **たくない** mistake — give it a try!";
    }
    if (/jd|discord|stuck|help me|human/.test(t)) {
      return 'When you\'re really stuck, message JD on Discord — same place you got your lesson link. In the live hub this button will deep-link to your thread.';
    }
    if (/feedback|review/.test(t) && status === "reviewed") {
      return "JD's note (demo): \"Nice work on たい! Watch たくない on longer verbs — break them at the stem.\"";
    }
    return (
      "I'm your study tutor for this assignment. Ask about **grammar**, **hints**, or **mistakes** — or say \"message JD\" if you need a human."
    );
  }

  function initChat() {
    const toggle = document.getElementById("hw-v2-chat-toggle");
    const panel = document.getElementById("hw-v2-chat-panel");
    const close = document.getElementById("hw-v2-chat-close");
    const form = document.getElementById("hw-v2-chat-form");
    const input = document.getElementById("hw-v2-chat-input");
    const suggestions = document.getElementById("hw-v2-chat-suggestions");

    function setChatOpen(open) {
      chatOpen = open;
      document.body.classList.toggle("hw-hub-v2-chat-open", open);
      if (panel) panel.hidden = !open;
      if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && input) input.focus();
    }

    toggle?.addEventListener("click", () => setChatOpen(true));
    close?.addEventListener("click", () => setChatOpen(false));

    MOCK.chatSuggestions.forEach((text) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v2-chat-suggest";
      btn.textContent = text;
      btn.addEventListener("click", () => {
        addChatBotMessage(text, "user");
        setTimeout(() => addChatBotMessage(botReply(text), "bot"), 400);
      });
      suggestions?.appendChild(btn);
    });

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input?.value?.trim();
      if (!text) return;
      addChatBotMessage(text, "user");
      input.value = "";
      setTimeout(() => addChatBotMessage(botReply(text), "bot"), 450);
    });

    addChatBotMessage(
      `Hi ${MOCK.studentName}! I'm here for **${DEMO_ASSIGNMENT.title}**. Ask for hints or grammar help — I won't spoil the blanks unless you're in review mode.`,
      "bot"
    );

    if (panel) panel.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  /* ——— Drill modal ——— */
  function openDrill(mistake) {
    const modal = document.getElementById("hw-v2-drill");
    const title = document.getElementById("hw-v2-drill-title");
    const prompt = document.getElementById("hw-v2-drill-prompt");
    const items = document.getElementById("hw-v2-drill-items");
    if (!modal || !items) return;

    const drills = DRILL_TEMPLATES[mistake.id] || DRILL_TEMPLATES.m1;
    activeDrillId = mistake.id;
    if (title) title.textContent = "Quick practice";
    if (prompt) prompt.textContent = mistake.note + " — " + mistake.wrong + " → " + mistake.right;

    items.replaceChildren();
    drills.forEach((d, i) => {
      const wrap = document.createElement("div");
      wrap.className = "hw-hub-v2-drill__item";
      const id = "drill-" + i;
      wrap.innerHTML = `<label for="${id}">${escapeHtml(d.q)}</label><input id="${id}" type="text" autocomplete="off" lang="ja">`;
      items.appendChild(wrap);
    });

    modal.hidden = false;
  }

  function closeDrill() {
    const modal = document.getElementById("hw-v2-drill");
    if (modal) modal.hidden = true;
  }

  function checkDrill() {
    const items = document.querySelectorAll("#hw-v2-drill-items input");
    const templates = DRILL_TEMPLATES[activeDrillId] || DRILL_TEMPLATES.m1;
    let ok = 0;
    items.forEach((inp, i) => {
      const expected = templates[i]?.a || "";
      if (normalize(inp.value) === normalize(expected)) ok += 1;
    });
    alert(ok === items.length ? "All correct — nice!" : ok + " of " + items.length + " correct. Try again!");
  }

  function normalize(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  /* ——— Onboarding ——— */
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
    const dots = document.querySelectorAll(".hw-hub-v2-onboard__dot");
    if (title) title.textContent = step.title;
    if (text) text.textContent = step.text;
    if (stepEl) stepEl.textContent = "Step " + (onboardStep + 1) + " of " + ONBOARD_STEPS.length;
    dots.forEach((d, i) => d.classList.toggle("is-active", i === onboardStep));
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

  /* ——— Demo controls ——— */
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

    const upsellToggle = document.getElementById("hw-v2-demo-upsell");
    upsellToggle?.addEventListener("click", () => {
      const cur = readStorage(STORAGE.showUpsell, "1");
      const next = cur === "1" ? "0" : "1";
      writeStorage(STORAGE.showUpsell, next);
      upsellToggle.classList.toggle("is-active", next === "1");
      renderUpsell();
    });

    document.querySelectorAll("[data-v2-demo-status]").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-v2-demo-status") === getDemoStatus());
    });
    upsellToggle?.classList.toggle("is-active", readStorage(STORAGE.showUpsell, "1") === "1");
  }

  function bindActions() {
    document.getElementById("hw-v2-cta-primary")?.addEventListener("click", () => {
      const action = document.getElementById("hw-v2-cta-primary")?.dataset.action;
      if (action === "start") {
        if (getDemoStatus() === "not_started") setDemoStatus("in_progress");
        scrollToWorksheet();
      } else if (action === "scroll-worksheet") scrollToWorksheet();
      else if (action === "submit") mockSubmit();
    });

    document.getElementById("hw-v2-cta-secondary")?.addEventListener("click", () => {
      const label = document.getElementById("hw-v2-cta-secondary")?.textContent || "";
      if (/tutor|Ask/.test(label)) {
        document.body.classList.add("hw-hub-v2-chat-open");
        document.getElementById("hw-v2-chat-input")?.focus();
      } else if (/mistake|Practice/.test(label)) openDrill(MOCK.mistakes[0]);
      else window.open(MOCK.lessonUrl, "_blank", "noopener,noreferrer");
    });

    document.getElementById("hw-v2-lesson-link")?.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(MOCK.lessonUrl, "_blank", "noopener,noreferrer");
    });

    document.getElementById("hw-v2-mobile-continue")?.addEventListener("click", scrollToWorksheet);
    document.getElementById("hw-v2-mobile-chat")?.addEventListener("click", () => {
      document.body.classList.add("hw-hub-v2-chat-open");
    });
    document.getElementById("hw-v2-mobile-submit")?.addEventListener("click", mockSubmit);

    document.getElementById("hw-v2-onboard-next")?.addEventListener("click", nextOnboard);
    document.getElementById("hw-v2-onboard-skip")?.addEventListener("click", skipOnboard);
    document.getElementById("hw-v2-drill-close")?.addEventListener("click", closeDrill);
    document.getElementById("hw-v2-drill-check")?.addEventListener("click", checkDrill);
    document.getElementById("hw-v2-upsell-dismiss")?.addEventListener("click", () => {
      writeStorage(STORAGE.showUpsell, "0");
      renderUpsell();
    });
  }

  function init() {
    demoStatus = getDemoStatus();
    initDemoBar();
    bindActions();
    initChat();
    initOnboarding();
    mountWorksheet();

    const lessonLabel = document.getElementById("hw-v2-lesson-label");
    if (lessonLabel) {
      lessonLabel.textContent =
        "This worksheet is from your June 14 lesson — expressing wants with たい and giving simple reasons.";
    }

    const tags = document.getElementById("hw-v2-lesson-tags");
    if (tags) {
      tags.replaceChildren();
      MOCK.lessonTags.forEach((t) => {
        const span = document.createElement("span");
        span.className = "hw-hub-v2-tag";
        span.textContent = t;
        tags.appendChild(span);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.HwHubV2 = { init, setDemoStatus, MOCK, DEMO_ASSIGNMENT };
})(window);
