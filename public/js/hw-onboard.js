/**
 * First-time tips for the Homework Hub (replaces the old black-screen intros).
 *
 * Each tip points at a real toolbar button, shows readable text next to it,
 * and only appears once the homework sheet + toolbar are actually on screen
 * (never on the To-do list). "Got it" (or Esc) marks it seen for that student.
 *
 * Old intros in hw-magnifying-glass.js / hw-homework-comments.js stay in the
 * code but stand down whenever HwOnboard.owns is true.
 */
(function (global) {
  const STORE_KEY = "jlm-hw-onboard-v2";
  const LEGACY_KEYS = {
    glass: "hw-mg-onboarding-v1",
    cloud: "hw-hc-onboarding-v1",
  };

  const STEPS = [
    {
      id: "glass",
      tool: "glass",
      title: "Look up any word",
      text:
        "Tap the magnifying glass, then tap any Japanese word on your homework to see how to read it and what it means.",
    },
    {
      id: "cloud",
      tool: "cloud",
      title: "Leave a note for JD",
      text:
        "Tap the cloud, then press and hold on homework text to highlight it. Pick Cloud Memo to write a note or question.",
    },
  ];

  let rootEl = null;
  let ringEl = null;
  let cardEl = null;
  let arrowEl = null;
  let activeStep = null;
  let tickTimer = null;
  let readyStreak = 0;
  let forcedQueue = null;
  let layoutTimer = null;

  function session() {
    try {
      return global.HwAuth?.getSession?.() || null;
    } catch {
      return null;
    }
  }

  function userKey() {
    return String(session()?.username || "").trim().toLowerCase();
  }

  function readStore() {
    try {
      const raw = JSON.parse(global.localStorage.getItem(STORE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }

  function isSeen(id) {
    const user = userKey();
    if (!user) return true;
    if (readStore()[user]?.[id]) return true;
    /* Anyone who already clicked Got it on the old intro should not see it again. */
    try {
      if (global.localStorage.getItem(LEGACY_KEYS[id]) === "1") return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function markSeen(id) {
    const user = userKey();
    if (!user) return;
    const all = readStore();
    all[user] = { ...(all[user] || {}), [id]: 1 };
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  }

  function visible(el) {
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const style = global.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  /**
   * The Grammar description box, while it is open for its first look
   * (hw-worksheet.js sets data-ob-first-look). Same dim + window + green Got it as the others.
   */
  const BRIEF_STEP = {
    id: "brief",
    title: "Read this first",
    text:
      "This is the grammar description. It explains what this homework is about. You can open it again any time from the Grammar description bar.",
    getTarget() {
      const brief = document.querySelector('.hw-worksheet__topic-brief[data-ob-first-look="1"]');
      return brief && brief.open && visible(brief) ? brief : null;
    },
    /* The open text hangs below the bar, so the window must cover bar + text. */
    getRect(el) {
      const r = el.getBoundingClientRect();
      const body = el.querySelector(".hw-worksheet__topic-brief-body");
      const b = body ? body.getBoundingClientRect() : null;
      if (!b || b.height < 4) return r;
      return {
        left: Math.min(r.left, b.left),
        top: Math.min(r.top, b.top),
        right: Math.max(r.right, b.right),
        bottom: Math.max(r.bottom, b.bottom),
        width: Math.max(r.right, b.right) - Math.min(r.left, b.left),
        height: Math.max(r.bottom, b.bottom) - Math.min(r.top, b.top),
      };
    },
    onDone() {
      const brief = document.querySelector('.hw-worksheet__topic-brief[data-ob-first-look="1"]');
      if (!brief) return;
      brief.querySelectorAll("audio").forEach((a) => {
        try {
          a.pause();
        } catch {
          /* ignore */
        }
      });
      brief.open = false;
      brief.removeAttribute("data-ob-first-look");
    },
  };

  function targetFor(step) {
    if (step.getTarget) return step.getTarget();
    const bar = document.getElementById("hw-toolbar-bar");
    if (!visible(bar)) return null;
    const btn = bar.querySelector('[data-tb-tool="' + step.tool + '"]');
    return visible(btn) ? btn : null;
  }

  /** Homework sheet is really on screen (not hidden behind another tab). */
  function sheetOnScreen() {
    const form = document.querySelector("form.hw-worksheet");
    if (!form) return false;
    return visible(form);
  }

  function studentCanSeeTips() {
    const s = session();
    if (!s) return false;
    if (s.role === "teacher" || s.viewAs) return false;
    return true;
  }

  function nothingElseOpen() {
    if (document.hidden) return false;
    if (document.querySelector(".hw-mg-popup, .hw-mg-onboard, .hw-hc-onboard")) return false;
    if (document.body.classList.contains("hw-focus-mode")) return false;
    return true;
  }

  function pendingStep() {
    /* First-look Grammar description always comes first. */
    if (BRIEF_STEP.getTarget()) {
      return BRIEF_STEP;
    }
    if (forcedQueue && forcedQueue.length) {
      return STEPS.find((s) => s.id === forcedQueue[0]) || null;
    }
    return STEPS.find((s) => !isSeen(s.id)) || null;
  }

  function build() {
    rootEl = document.createElement("div");
    rootEl.className = "hw-ob";
    ringEl = document.createElement("div");
    ringEl.className = "hw-ob__ring";
    ringEl.setAttribute("aria-hidden", "true");
    cardEl = document.createElement("div");
    cardEl.className = "hw-ob__card";
    cardEl.setAttribute("role", "dialog");
    cardEl.setAttribute("aria-modal", "true");
    arrowEl = document.createElement("span");
    arrowEl.className = "hw-ob__arrow";
    arrowEl.setAttribute("aria-hidden", "true");
    rootEl.append(ringEl, cardEl);
    cardEl.appendChild(arrowEl);
    document.body.appendChild(rootEl);
  }

  function fillCard(step) {
    cardEl.querySelectorAll(".hw-ob__body").forEach((n) => n.remove());
    const body = document.createElement("div");
    body.className = "hw-ob__body";
    const eyebrow = document.createElement("p");
    eyebrow.className = "hw-ob__eyebrow";
    eyebrow.textContent = "Quick tip";
    const title = document.createElement("h2");
    title.className = "hw-ob__title";
    title.id = "hw-ob-title";
    title.textContent = step.title;
    const text = document.createElement("p");
    text.className = "hw-ob__text";
    text.textContent = step.text;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hw-ob__btn";
    btn.textContent = "Got it";
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      dismiss();
    });
    body.append(eyebrow, title, text, btn);
    cardEl.appendChild(body);
    cardEl.setAttribute("aria-labelledby", "hw-ob-title");
    return btn;
  }

  function layout() {
    if (!activeStep || !rootEl) return;
    const target = targetFor(activeStep);
    if (!target) {
      /* Sheet/toolbar went away (tab switch etc.) — close without marking seen. */
      close(false);
      return;
    }
    const vw = global.innerWidth;
    const vh = global.innerHeight;
    const t = activeStep.getRect ? activeStep.getRect(target) : target.getBoundingClientRect();
    const pad = 8;
    ringEl.style.left = t.left - pad + "px";
    ringEl.style.top = t.top - pad + "px";
    ringEl.style.width = t.width + pad * 2 + "px";
    ringEl.style.height = t.height + pad * 2 + "px";

    const cardW = Math.min(300, vw - 24);
    cardEl.style.width = cardW + "px";
    const cardH = cardEl.offsetHeight || 150;
    const gap = 16;
    const above = t.top - pad - gap - cardH >= 12;
    const below = t.bottom + pad + gap + cardH <= vh - 12;
    let top;
    let place;
    if (above) {
      top = t.top - pad - gap - cardH;
      place = "above";
    } else if (below) {
      top = t.bottom + pad + gap;
      place = "below";
    } else {
      /* Tall target with no room on either side: pin the card to the bottom of the screen. */
      top = vh - cardH - 12;
      place = "pinned";
    }
    let left = t.left + t.width / 2 - cardW / 2;
    left = Math.max(12, Math.min(left, vw - cardW - 12));
    cardEl.style.left = left + "px";
    cardEl.style.top = Math.max(12, top) + "px";

    const arrowX = Math.max(18, Math.min(cardW - 18, t.left + t.width / 2 - left));
    arrowEl.style.left = arrowX + "px";
    arrowEl.className =
      "hw-ob__arrow " +
      (place === "above"
        ? "hw-ob__arrow--down"
        : place === "below"
          ? "hw-ob__arrow--up"
          : "hw-ob__arrow--none");
  }

  function onKey(ev) {
    if (!activeStep) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      dismiss();
    }
  }

  function show(step) {
    if (activeStep || !step) return;
    const target = targetFor(step);
    if (!target) return;
    /* Short screens (phones): bring the button on screen before pointing at it. */
    const tr = step.getRect ? step.getRect(target) : target.getBoundingClientRect();
    if (tr.bottom > global.innerHeight - 8 || tr.top < 8) {
      try {
        target.scrollIntoView({ block: "center", behavior: "auto" });
      } catch {
        /* ignore */
      }
    }
    activeStep = step;
    build();
    const btn = fillCard(step);
    layout();
    requestAnimationFrame(() => {
      rootEl?.classList.add("is-visible");
      try {
        btn.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
      layout();
    });
    global.addEventListener("resize", layout);
    global.addEventListener("scroll", layout, true);
    document.addEventListener("keydown", onKey, true);
    layoutTimer = setInterval(layout, 400);
  }

  function close(markDone) {
    const step = activeStep;
    activeStep = null;
    global.removeEventListener("resize", layout);
    global.removeEventListener("scroll", layout, true);
    document.removeEventListener("keydown", onKey, true);
    clearInterval(layoutTimer);
    layoutTimer = null;
    if (rootEl) {
      rootEl.remove();
      rootEl = ringEl = cardEl = arrowEl = null;
    }
    readyStreak = 0;
    if (step && markDone) {
      if (step.onDone) step.onDone();
      else if (forcedQueue && forcedQueue[0] === step.id) forcedQueue.shift();
      else markSeen(step.id);
    }
    ensureTick();
  }

  function dismiss() {
    close(true);
  }

  function tick() {
    if (activeStep) return;
    if (!studentCanSeeTips()) {
      readyStreak = 0;
      return;
    }
    /* Keeps running (cheap): a later homework can still have a first-look Grammar description. */
    const step = pendingStep();
    if (!step) {
      readyStreak = 0;
      return;
    }
    if (!sheetOnScreen() || !targetFor(step) || !nothingElseOpen()) {
      readyStreak = 0;
      return;
    }
    /* Wait until things have held still for ~1.2s (toolbar finishes sliding in). */
    readyStreak += 1;
    if (readyStreak >= 2) show(step);
  }

  function ensureTick() {
    if (tickTimer) return;
    tickTimer = setInterval(tick, 600);
  }

  /**
   * Tutorial button: play every tip again, in the real order (Grammar description first, if
   * this homework has one on screen). New tips added to STEPS are picked up automatically.
   */
  function replay() {
    if (activeStep) close(false);
    forcedQueue = STEPS.map((s) => s.id);
    const brief = document.querySelector(".hw-worksheet__topic-brief");
    if (brief && visible(brief)) {
      brief.open = true;
      brief.setAttribute("data-ob-first-look", "1");
    }
    readyStreak = 0;
    ensureTick();
  }

  function resetAll() {
    try {
      global.localStorage.removeItem(STORE_KEY);
      Object.values(LEGACY_KEYS).forEach((k) => global.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    readyStreak = 0;
    ensureTick();
  }

  global.HwOnboard = { owns: true, replay, resetAll, steps: STEPS.map((s) => s.id) };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureTick, { once: true });
  } else {
    ensureTick();
  }
})(window);
