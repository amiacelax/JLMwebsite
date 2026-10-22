/**
 * Student Hub — Immersion Quest tab (365 daily look-fors).
 * One advance per local week. The week starts Monday at 5:00 a.m. in the browser's timezone.
 * The quest also moves on by itself every Monday, even if last week's was skipped.
 * The working quest (examples, seen flag, today's completion) belongs to the current week,
 * which starts Monday at 5:00 a.m. A new week starts a fresh working instance.
 * The look-for list is not wiped. Place in the 365-day sequence is kept.
 * Auto: Complete advances. Manual: Complete logs examples; Next quest advances.
 * Puzzle pieces + JD explainer video are scaffolded as Coming soon.
 */
(function (global) {
  "use strict";

  const TOTAL = 365;
  const EXAMPLES = 5;
  const LS_PREFIX = "jlm-hw-immersion-quests:";

  const IMPORTANT_TEXT =
    "Podcasts, songs, and other audio-only media are okay, but using more senses will lead to better memorization — writing, seeing, touching, scent, even the feel of your hand on paper!";

  /** 59 look-fors from JD — cycle to fill 365 days. */
  const CORE = [
    { id: "to", title: "と", look: "と" },
    { id: "toiu", title: "という", look: "という" },
    { id: "toiukoto", title: "ということ", look: "ということ" },
    { id: "ttekoto", title: "ってこと", look: "ってこと" },
    { id: "koto", title: "こと", look: "こと" },
    { id: "kore-sore-are", title: "これ・それ・あれ", look: "これ、それ、あれ" },
    { id: "kono-sono-ano", title: "この・その・あの", look: "この、その、あの" },
    { id: "donna", title: "どんな", look: "どんな" },
    { id: "demo", title: "でも", look: "でも" },
    { id: "te", title: "て", look: "て" },
    { id: "temo", title: "ても", look: "ても" },
    { id: "teii", title: "ていい", look: "ていい" },
    { id: "ii", title: "いい", look: "いい" },
    { id: "sent-begin", title: "Beginning of sentences", look: "how sentences begin" },
    { id: "sent-continue", title: "How sentences continue", look: "how sentences keep going" },
    { id: "sent-end", title: "End of sentences", look: "how sentences end" },
    { id: "ikatta", title: "い・かった", look: "い / かった" },
    { id: "kunai", title: "くない・くなかった", look: "くない / くなかった" },
    { id: "q-end", title: "How do questions end?", look: "how questions end" },
    { id: "q-words", title: "All question words", look: "question words (なに、いつ、どこ, etc.)" },
    { id: "nani-nan", title: "なに vs なん", look: "なに vs なん" },
    {
      id: "kanji-week",
      title: "Kanji search week",
      look: "kanji words — mark ones you know and ones you don’t",
    },
    { id: "katakana", title: "Words with カタカナ", look: "words with カタカナ in them" },
    { id: "kanji-1", title: "1-kanji words", look: "1-kanji words (食べる・見てない・心・皆さん, etc.)" },
    { id: "kanji-2", title: "2-kanji words", look: "2-kanji words (完売・知恵・社内, etc.)" },
    { id: "kanji-3", title: "3-kanji words", look: "3-kanji words (勉強中・取引先・保護者, etc.)" },
    { id: "kanji-4", title: "4+ kanji words", look: "4 or more kanji (学級崩壊・取引関係・一石二鳥, etc.)" },
    { id: "mashou", title: "ましょう", look: "ましょう" },
    { id: "you-lets", title: "〜よう (let’s)", look: "〜よう “let’s” (you’ll find 2–3 major usages)" },
    { id: "ru-verbs", title: "る verbs", look: "る verbs" },
    {
      id: "verb-types",
      title: "One of each verb type",
      look: "one example of each verb type (う / る / する・くる)",
    },
    { id: "na-adj", title: "な adjectives", look: "な adjectives (how can we know?)" },
    {
      id: "hiragana-words",
      title: "Hiragana words",
      look: "hiragana words — go listen to a Japanese song (or anything you like) and catch them",
    },
    { id: "san", title: "さん", look: "usage of さん" },
    { id: "chan", title: "ちゃん", look: "ちゃん" },
    { id: "sama", title: "様", look: "様" },
    { id: "kun", title: "くん", look: "くん" },
    { id: "before-comma", title: "Before 、", look: "words / structure before 、" },
    { id: "after-comma", title: "After 、", look: "words / structure after 、" },
    { id: "double-verbs", title: "Double verbs", look: "double verbs" },
    { id: "yaru-suru", title: "やる vs する", look: "やる vs する" },
    { id: "kara-dakara", title: "から vs だから", look: "から vs だから" },
    { id: "kedo", title: "けど・だけど", look: "けど / だけど" },
    { id: "demo-kedo", title: "でも vs だけど・けど", look: "でも vs だけど、けど" },
    { id: "tame", title: "ため vs ために vs ための", look: "ため vs ために vs ための" },
    { id: "passive", title: "られる・される", look: "られる / される (passive)" },
    { id: "te-endings", title: "て endings", look: "て endings and their meaning" },
    { id: "nda-1", title: "んだ", look: "んだ usage" },
    { id: "nda-2", title: "んだ (again)", look: "んだ usage (keep hunting — second day)" },
    { id: "yone", title: "よね・だよね", look: "よね / だよね" },
    { id: "datta", title: "だった", look: "だった" },
    { id: "teiru", title: "ている", look: "ている" },
    { id: "teita", title: "ていた", look: "ていた" },
    { id: "teru", title: "てる (not ている)", look: "てる — not ている" },
    { id: "teta", title: "てた (not ていた)", look: "てた — not ていた" },
    { id: "nanode", title: "なので・ので", look: "なので / ので" },
    { id: "particles", title: "All the particles", look: "particles (が・は・で・も・を, etc.)" },
    { id: "double-particles", title: "Double particles", look: "double particles (でも・のに・には・への, etc.)" },
    { id: "wa-ga", title: "は vs が", look: "は vs が — when?" },
  ];

  const CORE_COUNT = CORE.length; // 59
  /** Full Quest UI — Demo2 (demoprem) and students moved onto the Demo2 hub (nekobi). */
  const QUEST_PREVIEW_USERNAMES = new Set(["demoprem", "premdemo", "nekobi"]);

  function questAtDay(day) {
    const n = Math.max(1, Math.min(TOTAL, Number(day) || 1));
    const core = CORE[(n - 1) % CORE_COUNT];
    const round = Math.floor((n - 1) / CORE_COUNT) + 1;
    return {
      day: n,
      id: core.id,
      key: n + ":" + core.id,
      title: core.title,
      look: core.look,
      round: round,
    };
  }

  /** Local day key (YYYY-MM-DD). Before 5:00 a.m. it is still the previous day. */
  function localYmd() {
    return global.HwLocalPeriod.dayKey();
  }

  /** Monday 5:00 a.m. local week key (YYYY-MM-DD of that Monday). */
  function localWeekKey() {
    return global.HwLocalPeriod.weekKey();
  }

  function normalizeAdvanceMode(raw) {
    return String(raw || "").trim().toLowerCase() === "manual" ? "manual" : "auto";
  }

  function emptyProgress() {
    return {
      currentIndex: 0,
      lastCompletedYmd: "",
      periodKey: "",
      advanceMode: "auto",
      seenKey: "",
      examples: ["", "", "", "", ""],
      completed: [],
      puzzlePieces: [],
      updatedAt: "",
    };
  }

  let progress = emptyProgress();
  let loaded = false;
  let loadPromise = null;
  let newQuest = false;
  let visibleExampleCount = 1;
  let importantOpen = false;
  /* 4-tab hub: true while the date is showing in the big box instead of the target. Resets on tab entry/refresh. */
  let showDateInBox = false;
  /** Manual mode only: offset from current quest day (−7 … +1). */
  let manualBrowseOffset = 0;

  function username() {
    const session = global.HwAuth?.getSession?.();
    return String(session?.username || "")
      .trim()
      .toLowerCase();
  }

  function questLayoutEnabled() {
    /* Every signed-in student gets the Quest tab (Basic 4-tab view included). */
    if (username()) return true;
    if (QUEST_PREVIEW_USERNAMES.has(username())) return true;
    const session = global.HwAuth?.getSession?.();
    if (session?.tier === "quest_only" || session?.accountLabel === "quest_only") return true;
    if (global.HwHubV5Live?.isQuestOnlyAccount?.()) return true;
    if (global.HwHubV5Live?.isCurriculumAccount?.()) return true;
    return false;
  }

  function questIntroHtml() {
    if (!questLayoutEnabled()) return "";
    const questOnly =
      global.HwAuth?.hasQuestOnlyAccess?.() || global.HwHubV5Live?.isQuestOnlyAccount?.();
    if (!questOnly) return "";
    return (
      '<section class="hw-quest-intro" aria-labelledby="hw-quest-intro-title">' +
      '<h3 class="hw-quest-intro__title" id="hw-quest-intro-title">What I do?</h3>' +
      '<p class="hw-quest-intro__desc">JD\u2019s intro video for Quest Only is on the way. ' +
      "For now: do this week\u2019s quest, your weekly workout, and jot examples in Notes.</p>" +
      '<div class="hw-quest-intro__video" aria-hidden="true">' +
      '<span class="hw-quest-intro__video-label">Intro video placeholder</span></div></section>'
    );
  }

  function isDemo() {
    return document.body?.classList?.contains("hw-hub-v5-demo") === true;
  }

  function lsKey() {
    return LS_PREFIX + (username() || "anon");
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(lsKey());
      if (!raw) return emptyProgress();
      const parsed = JSON.parse(raw);
      return normalizeProgress(parsed);
    } catch {
      return emptyProgress();
    }
  }

  function writeLocal(next) {
    try {
      localStorage.setItem(lsKey(), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function normalizeProgress(raw) {
    const base = emptyProgress();
    if (!raw || typeof raw !== "object") return base;
    const idx = Math.max(0, Math.min(TOTAL, Number(raw.currentIndex) || 0));
    const examples = Array.isArray(raw.examples)
      ? raw.examples.map((s) => String(s || "")).slice(0, EXAMPLES)
      : base.examples.slice();
    while (examples.length < EXAMPLES) examples.push("");
    return {
      currentIndex: idx >= TOTAL ? TOTAL : idx,
      lastCompletedYmd: String(raw.lastCompletedYmd || ""),
      periodKey: String(raw.periodKey || ""),
      advanceMode: normalizeAdvanceMode(raw.advanceMode),
      seenKey: String(raw.seenKey || ""),
      examples: examples,
      completed: Array.isArray(raw.completed) ? raw.completed : [],
      puzzlePieces: Array.isArray(raw.puzzlePieces) ? raw.puzzlePieces : [],
      updatedAt: String(raw.updatedAt || ""),
    };
  }

  /** Whole weeks between two Monday date keys (YYYY-MM-DD). At least 1. */
  function weeksBetween(fromKey, toKey) {
    const a = Date.parse(fromKey + "T00:00:00Z");
    const b = Date.parse(toKey + "T00:00:00Z");
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
    return Math.max(1, Math.round((b - a) / (7 * 86400000)));
  }

  /**
   * New week: fresh examples and completion gate, and the quest moves on.
   * A week that was completed already moved on when it was completed. Every other week
   * that went by moves the quest one step, so the quest follows the calendar.
   */
  function applyWeekPeriod(next) {
    const week = localWeekKey();
    if (!next.periodKey) {
      next.periodKey = week;
      return false;
    }
    if (next.periodKey === week) return false;
    const weeks = weeksBetween(next.periodKey, week);
    const skipped = Math.max(0, weeks - (next.lastCompletedYmd ? 1 : 0));
    next.currentIndex = Math.min(TOTAL, (Number(next.currentIndex) || 0) + skipped);
    next.periodKey = week;
    next.examples = ["", "", "", "", ""];
    next.lastCompletedYmd = "";
    next.seenKey = "";
    return true;
  }

  function ensureCurrentWeek() {
    const rotated = applyWeekPeriod(progress);
    if (rotated) {
      visibleExampleCount = 1;
      writeLocal(progress);
      const user = username();
      if (user && !isDemo()) {
        void saveDraft({
          examples: progress.examples,
          seenKey: "",
          period: progress.periodKey,
        }).catch(() => {});
      }
    }
    return rotated;
  }

  function isAutoMode() {
    return normalizeAdvanceMode(progress.advanceMode) === "auto";
  }

  function currentQuestDay() {
    if (progress.currentIndex >= TOTAL) return TOTAL;
    return progress.currentIndex + 1;
  }

  function currentQuest() {
    return questAtDay(currentQuestDay());
  }

  function clampBrowseOffset(offset) {
    return Math.max(-7, Math.min(1, Number(offset) || 0));
  }

  function displayedQuest() {
    /* After this week's quest is done the counter has moved on; keep showing the finished one. */
    const doneBack = advancedToday() && !allDone() ? 1 : 0;
    if (isAutoMode()) return questAtDay(Math.max(1, currentQuestDay() - doneBack));
    const day = Math.max(1, Math.min(TOTAL, currentQuestDay() - doneBack + manualBrowseOffset));
    return questAtDay(day);
  }

  function isPreviewingQuest() {
    return !isAutoMode() && manualBrowseOffset !== 0;
  }

  function allDone() {
    return progress.currentIndex >= TOTAL;
  }

  /** True after this week's advance (Complete in auto, Next in manual). */
  function advancedToday() {
    return (
      !!progress.lastCompletedYmd &&
      (!progress.periodKey || progress.periodKey === localWeekKey())
    );
  }

  function syncStarFlag() {
    if (allDone() || advancedToday()) {
      newQuest = false;
      return;
    }
    const q = currentQuest();
    newQuest = progress.seenKey !== q.key;
  }

  function hasNewQuest() {
    if (!questLayoutEnabled()) return false;
    return newQuest && !allDone();
  }

  function paintStar() {
    const star = document.getElementById("hw-v5-quest-star");
    if (!star) return;
    const on = hasNewQuest();
    star.hidden = !on;
    star.setAttribute("aria-hidden", on ? "false" : "true");
    const btn = document.getElementById("hw-v5-tab-quest");
    if (btn) {
      if (on) btn.setAttribute("aria-label", "Quest, new quest");
      else btn.removeAttribute("aria-label");
    }
  }

  async function loadProgress() {
    if (!questLayoutEnabled()) {
      loaded = true;
      return;
    }
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      const user = username();
      if (!user || isDemo()) {
        progress = readLocal();
        loaded = true;
        syncStarFlag();
        paintStar();
        return;
      }
      try {
        const res = await fetch(
          "/api/immersion-quests?username=" +
            encodeURIComponent(user) +
            "&period=" +
            encodeURIComponent(localWeekKey()),
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("load");
        const data = await res.json();
        progress = normalizeProgress(data.progress || data);
        writeLocal(progress);
      } catch {
        progress = readLocal();
      }
      loaded = true;
      syncStarFlag();
      paintStar();
    })();
    return loadPromise;
  }

  async function saveDraft(extra) {
    const next = Object.assign({}, progress, extra || {}, { updatedAt: new Date().toISOString() });
    progress = normalizeProgress(next);
    writeLocal(progress);
    const user = username();
    if (!user || isDemo()) {
      notifyQuestExamplesChanged();
      return progress;
    }
    const res = await fetch("/api/immersion-quests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user,
        examples: progress.examples,
        seenKey: progress.seenKey,
        advanceMode: progress.advanceMode,
        ymd: localYmd(),
        period: localWeekKey(),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const err = new Error(data.error || "Could not save quest.");
      err.code = data.code;
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (data.progress) progress = normalizeProgress(data.progress);
    writeLocal(progress);
    notifyQuestExamplesChanged();
    return progress;
  }

  function bindImportant(root) {
    const tip = root.querySelector(".hw-quest__important");
    const btn = tip?.querySelector(".hw-recording-tip__trigger");
    const msg = tip?.querySelector(".hw-recording-tip__message");
    if (!btn || !msg) return;

    if (!msg.id) {
      msg.id = "hw-quest-important-msg";
    }
    btn.setAttribute("aria-controls", msg.id);

    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const open = msg.hasAttribute("hidden");
      if (open) {
        msg.removeAttribute("hidden");
      } else {
        msg.setAttribute("hidden", "");
      }
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.classList.toggle("is-open", open);
      importantOpen = open;
    });
  }

  function readExamplesFromForm(root) {
    return Array.from(root.querySelectorAll("[data-quest-ex]")).map((el) =>
      String(el.value || "").trim()
    );
  }

  function refreshVisibleExampleCount() {
    let countFromData = 1;
    for (let i = 0; i < progress.examples.length; i++) {
      if (String(progress.examples[i] || "").trim()) countFromData = i + 1;
    }
    countFromData = Math.max(1, Math.min(EXAMPLES, countFromData));
    /* Keep extra empty rows the student opened via + Add example. */
    visibleExampleCount = Math.max(visibleExampleCount, countFromData);
  }

  function renderExampleRows(disabled) {
    let html = "";
    for (let i = 0; i < visibleExampleCount; i++) {
      const val = escapeHtml(progress.examples[i] || "");
      const n = i + 1;
      /* Brave/Chrome treat bare text boxes as login fields. one-time-code +
         non-credential name/id keeps the password manager away. */
      html +=
        "<li class=\"hw-quest__ex-row\"><input data-quest-ex type=\"text\" inputmode=\"text\" " +
        'name="immersion-quest-ex-' +
        n +
        '" id="hw-quest-ex-' +
        n +
        '" autocomplete="one-time-code" autocapitalize="sentences" ' +
        'spellcheck="true" data-1p-ignore="true" data-lpignore="true" ' +
        'data-form-type="other" data-bwignore="true" maxlength="200" value="' +
        val +
        '" ' +
        (disabled ? "readonly " : "") +
        'placeholder="Example ' +
        n +
        '" aria-label="Example ' +
        n +
        '">' +
        (disabled
          ? ""
          : '<button type="button" class="hw-ex-del" data-quest-ex-del aria-label="Remove example ' +
            n +
            '" title="Remove example">×</button>') +
        "</li>";
    }
    return html;
  }

  /** Take example #index out; the ones below move up one. */
  function removeExample(mount, index) {
    const list = Array.from({ length: EXAMPLES }, (_, i) => String(progress.examples[i] || ""));
    readExamplesFromForm(mount).forEach((v, i) => {
      list[i] = v;
    });
    list.splice(index, 1);
    list.push("");
    progress.examples = list;
    if (visibleExampleCount > 1) visibleExampleCount -= 1;
    void saveDraft({ examples: list, seenKey: progress.seenKey }).catch(() => {});
    renderPanel();
  }

  function bindExampleRemove(mount) {
    const list = mount.querySelector(".hw-quest__examples");
    if (!list) return;
    list.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-quest-ex-del]");
      if (!btn) return;
      const rows = Array.from(list.querySelectorAll(".hw-quest__ex-row"));
      const idx = rows.indexOf(btn.closest(".hw-quest__ex-row"));
      if (idx >= 0) removeExample(mount, idx);
    });
    global.HwSwipeDelete?.bind(list, {
      item: ".hw-quest__ex-row",
      hasContent: (li) => !!String(li.querySelector("input")?.value || "").trim() && !li.querySelector("input")?.readOnly,
      onDelete: (li) => {
        const rows = Array.from(list.querySelectorAll(".hw-quest__ex-row"));
        const idx = rows.indexOf(li);
        if (idx >= 0) removeExample(mount, idx);
      },
    });
  }

  function renderComingSoonPanel(mount) {
    mount.innerHTML =
      '<article class="hw-quest hw-quest--soon-only">' +
      '<p class="hw-quest__video-soon">Video coming soon</p>' +
      '<p class="hw-quest__soon-only">Coming soon!</p>' +
      "</article>";
  }

  function renderPanel() {
    const panel = document.getElementById("hw-v5-panel-quest");
    const mount = document.getElementById("hw-v5-quest-root");
    if (!panel || !mount) return;

    if (!questLayoutEnabled()) {
      renderComingSoonPanel(mount);
      return;
    }

    ensureCurrentWeek();

    const q = displayedQuest();
    const currentDay = currentQuestDay();
    const doneAll = allDone();
    const auto = isAutoMode();
    const preview = isPreviewingQuest();
    const doneToday = advancedToday();
    const waitingTomorrow = doneToday && !doneAll;
    const inputsLocked = doneAll || waitingTomorrow || preview;
    refreshVisibleExampleCount();
    const roundNote =
      q.round > 1 && !doneAll
        ? '<p class="hw-quest__round">Round ' + q.round + " — same hunt, new media.</p>"
        : "";

    let statusLine;
    let listenLine = false;
    if (preview) {
      statusLine =
        "Preview — day " +
        q.day +
        " of 365. Go back to day " +
        currentDay +
        " to complete this week’s quest.";
    } else if (doneAll) {
      statusLine = "You finished all 365 immersion quests. Puzzle pieces come next.";
    } else if (waitingTomorrow) {
      statusLine = auto
        ? "Nice — that's this week's quest. A new one comes Monday."
        : "Nice — you moved on for this week. The next advance comes Monday.";
    } else if (auto) {
      statusLine = 'Look and listen for "' + (q.look || q.title) + '" Think and wonder about it.';
      listenLine = true;
    } else {
      statusLine =
        'Look and listen for "' +
        (q.look || q.title) +
        '" Think and wonder about it. Complete saves examples; Next quest moves you forward when ready.';
      listenLine = true;
    }

    const completeLabel = doneAll
      ? "All done"
      : waitingTomorrow
        ? "Done for this week"
        : auto
          ? "Complete this week’s quest"
          : "Complete";

    const nextBtnHtml =
      !auto && !doneAll && !waitingTomorrow && !preview
        ? '<button type="button" class="btn btn--ghost" id="hw-quest-next">' +
          "I’m done — next quest</button>"
        : "";

    const navHtml = !auto && !doneAll
      ? '<div class="hw-quest__nav">' +
        '<button type="button" class="hw-quest__nav-btn" id="hw-quest-prev" aria-label="Previous quest day"' +
        (manualBrowseOffset <= -7 ? " disabled" : "") +
        '><span aria-hidden="true">←</span></button>' +
        '<span class="hw-quest__nav-day">Day ' +
        q.day +
        "</span>" +
        '<button type="button" class="hw-quest__nav-btn" id="hw-quest-next-day" aria-label="Next quest day"' +
        (manualBrowseOffset >= 1 ? " disabled" : "") +
        '><span aria-hidden="true">→</span></button>' +
        "</div>"
      : "";

    const dateBtnOn = !!global.HwTodayDate?.enabled?.();
    if (!dateBtnOn) showDateInBox = false;

    mount.innerHTML =
      questIntroHtml() +
      '<article class="hw-quest">' +
      "<h2 class=\"hw-quest__title\">This Week's Immersion Quest</h2>" +
      '<p class="hw-quest__status">' +
      escapeHtml(statusLine) +
      "</p>" +
      (listenLine ? '<p class="hw-quest__video-soon">Video coming soon</p>' : "") +
      roundNote +
      navHtml +
      (dateBtnOn
        ? '<button type="button" class="hw-quest__date-btn' +
          (showDateInBox ? " is-on" : "") +
          '" id="hw-quest-date-btn" title="Show today\'s date" aria-label="Show today\'s date" aria-pressed="' +
          (showDateInBox ? "true" : "false") +
          '"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg></button>'
        : "") +
      '<div class="hw-quest__target-box">' +
      '<p class="hw-quest__target' +
      (dateBtnOn && showDateInBox ? " hw-quest__target--date" : "") +
      '"' +
      (dateBtnOn && showDateInBox ? ' lang="ja"' : "") +
      ">" +
      (dateBtnOn && showDateInBox
        ? global.HwTodayDate.inner()
        : escapeHtml(doneAll ? "—" : q.title)) +
      "</p></div>" +
      '<div class="hw-quest__important-wrap">' +
      '<div class="hw-recording-tip hw-recording-tip--important hw-quest__important">' +
      '<button type="button" class="hw-recording-tip__trigger' +
      (importantOpen ? " is-open" : "") +
      '" aria-expanded="' +
      (importantOpen ? "true" : "false") +
      '" aria-label="Show important immersion guidance">' +
      '<span class="hw-recording-tip__icon" aria-hidden="true">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 18h6"/><path d="M10 22h4"/>' +
      '<path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>' +
      "</svg></span>" +
      '<span class="hw-recording-tip__label">Important</span></button>' +
      '<p class="hw-recording-tip__message"' +
      (!importantOpen ? " hidden" : "") +
      ">" +
      IMPORTANT_TEXT +
      "</p></div></div>" +
      '<p class="hw-quest__prompt">Write down up to 5 examples that you have seen in your media of choice:</p>' +
      '<form class="hw-quest__examples-form" autocomplete="off" onsubmit="return false;">' +
      '<ol class="hw-quest__examples">' +
      renderExampleRows(inputsLocked) +
      "</ol>" +
      '<div class="hw-quest__more">' +
      '<button type="button" class="btn btn--ghost btn--sm hw-quest__plus" id="hw-quest-add-example" aria-label="Add example" title="Add example"' +
      (inputsLocked || visibleExampleCount >= EXAMPLES ? " hidden" : "") +
      '><svg class="hw-plus-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>' +
      "</form>" +
      '<div class="hw-quest__actions">' +
      '<button type="button" class="btn btn--primary" id="hw-quest-complete"' +
      (doneAll || waitingTomorrow || preview ? " disabled" : "") +
      ">" +
      escapeHtml(completeLabel) +
      "</button>" +
      nextBtnHtml +
      '<p class="hw-quest__save-msg" id="hw-quest-save-msg"></p>' +
      "</div>" +
      "</article>" +
      (global.HwFeatureFlags?.questSnake?.() === true
        ? '<nav class="hw-toolbar-bar hw-quest-toolbar" id="hw-quest-toolbar" aria-label="Quest tools">' +
          '<button type="button" class="hw-toolbar-bar__btn" data-quest-tool="puzzle" title="View puzzle" aria-label="View puzzle">' +
          '<span class="hw-toolbar-bar__icon hw-toolbar-bar__icon--puzzle" aria-hidden="true">' +
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M14.5 4.5a2.5 2.5 0 0 1 0 5 2.5 2.5 0 0 1-3.5 0 2.5 2.5 0 0 1 0-5Z"/>' +
          '<path d="M6.5 13.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>' +
          '<path d="M17 14.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/>' +
          '<path d="M9.5 6.5 4 12v6.5a1.5 1.5 0 0 0 1.5 1.5H12l5.5-5.5"/>' +
          '<path d="M14.5 9.5 20 4"/>' +
          "</svg></span></button>" +
          "</nav>"
        : "");

    bindImportant(mount);
    bindExampleRemove(mount);
    document.getElementById("hw-quest-date-btn")?.addEventListener("click", () => {
      showDateInBox = !showDateInBox;
      renderPanel();
    });
    const completeBtn = document.getElementById("hw-quest-complete");
    completeBtn?.addEventListener("click", () => {
      void completeQuest(mount);
    });

    document.getElementById("hw-quest-next")?.addEventListener("click", () => {
      void nextQuest(mount);
    });

    const addBtn = document.getElementById("hw-quest-add-example");
    addBtn?.addEventListener("click", () => {
      visibleExampleCount = Math.min(EXAMPLES, visibleExampleCount + 1);
      renderPanel();
    });

    document.getElementById("hw-quest-prev")?.addEventListener("click", () => {
      manualBrowseOffset = clampBrowseOffset(manualBrowseOffset - 1);
      renderPanel();
    });

    document.getElementById("hw-quest-next-day")?.addEventListener("click", () => {
      manualBrowseOffset = clampBrowseOffset(manualBrowseOffset + 1);
      renderPanel();
    });

    mount.querySelector('[data-quest-tool="puzzle"]')?.addEventListener("click", () => {
      global.HwQuestPuzzle?.open?.(progress);
    });

    let draftTimer = 0;
    mount.querySelectorAll("[data-quest-ex]").forEach((input) => {
      input.addEventListener("input", () => {
        window.clearTimeout(draftTimer);
        draftTimer = window.setTimeout(() => {
          const examples = readExamplesFromForm(mount);
          void saveDraft({ examples: examples, seenKey: progress.seenKey });
        }, 600);
      });
    });

    const questToolbar = document.getElementById("hw-quest-toolbar");
    if (questToolbar) {
      const questPanel = document.getElementById("hw-v5-panel-quest");
      questToolbar.hidden =
        !questLayoutEnabled() || !questPanel || questPanel.hasAttribute("hidden");
    }
  }

  async function setAdvanceMode(mode) {
    const nextMode = normalizeAdvanceMode(mode) === "manual" ? "manual" : "auto";
    if (normalizeAdvanceMode(progress.advanceMode) === nextMode) {
      paintFeaturesSwitch();
      return nextMode;
    }
    manualBrowseOffset = 0;
    try {
      await saveDraft({ advanceMode: nextMode });
    } catch {
      progress.advanceMode = nextMode;
      writeLocal(progress);
    }
    paintFeaturesSwitch();
    renderPanel();
    return nextMode;
  }

  async function toggleAdvanceMode() {
    const nextMode = isAutoMode() ? "manual" : "auto";
    await setAdvanceMode(nextMode);
    global.HwToast?.show?.(
      nextMode === "auto"
        ? "Auto advance is on — Complete moves you forward once per week."
        : "Manual advance — use Next quest when you feel ready (once per week)."
    );
  }

  function paintFeaturesSwitch() {
    const btn = document.getElementById("hw-account-quest-auto-advance");
    const note = document.getElementById("hw-account-quest-auto-advance-note");
    if (!btn) return;
    const auto = isAutoMode();
    btn.setAttribute("aria-checked", auto ? "true" : "false");
    btn.classList.toggle("is-on", auto);
    if (note) {
      note.textContent = auto
        ? "Automatic — completing moves you to the next quest (once per week)."
        : "Manual — you move to the next quest when ready (once per week). Use ← → on the Quest tab to preview.";
    }
  }

  function setSaveMsg(text, isError) {
    const el = document.getElementById("hw-quest-save-msg");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }

  /** Same ダメ / いいよ popover pattern as cloud-memo delete. */
  function openQuestConfirmPopover(anchorBtn, question, onConfirm) {
    if (typeof global._hwQuestConfirmClose === "function") {
      global._hwQuestConfirmClose();
    }

    const pop = document.createElement("div");
    pop.className = "hw-delete-confirm-popover hw-quest-confirm-popover";
    pop.setAttribute("role", "alertdialog");
    pop.setAttribute("aria-modal", "true");
    pop.innerHTML =
      '<p class="hw-delete-confirm-popover__q" lang="ja"></p>' +
      '<div class="hw-delete-confirm-popover__actions">' +
      '<button type="button" class="hw-delete-confirm-popover__yes" lang="ja">いいよ</button>' +
      '<button type="button" class="hw-delete-confirm-popover__no" lang="ja">ダメ</button>' +
      "</div>";
    const qEl = pop.querySelector(".hw-delete-confirm-popover__q");
    if (qEl) qEl.textContent = question;

    document.body.appendChild(pop);
    const anchorRect = anchorBtn.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let top = anchorRect.top - popRect.height - 8;
    let left = anchorRect.left + anchorRect.width / 2 - popRect.width / 2;
    if (top < 8) top = anchorRect.bottom + 8;
    left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
    pop.style.top = top + "px";
    pop.style.left = left + "px";

    const close = () => {
      document.removeEventListener("pointerdown", onOutside, true);
      pop.remove();
      global._hwQuestConfirmClose = null;
    };
    global._hwQuestConfirmClose = close;

    const onOutside = (ev) => {
      if (pop.contains(ev.target) || (anchorBtn && anchorBtn.contains(ev.target))) {
        return;
      }
      close();
    };
    setTimeout(() => document.addEventListener("pointerdown", onOutside, true), 0);

    pop.querySelector(".hw-delete-confirm-popover__yes")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      close();
      onConfirm();
    });
    pop.querySelector(".hw-delete-confirm-popover__no")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    });
  }

  async function completeQuest(root) {
    if (allDone() || advancedToday()) return;
    const examples = readExamplesFromForm(root);
    const filled = examples.filter(Boolean);
    const btn = document.getElementById("hw-quest-complete");
    if (!btn) return;

    const auto = isAutoMode();
    const question = filled.length
      ? "いいの？"
      : auto
        ? "You haven't given any examples yet. Complete this week's quest?"
        : "You haven't given any examples yet. Save practice on this quest?";

    openQuestConfirmPopover(btn, question, () => {
      void finishCompleteQuest(root, examples, { advance: auto });
    });
  }

  async function nextQuest(root) {
    if (allDone() || advancedToday() || isAutoMode()) return;
    const examples = readExamplesFromForm(root);
    const btn = document.getElementById("hw-quest-next");
    if (!btn) return;

    openQuestConfirmPopover(btn, "Move to the next quest? (once per week)", () => {
      void finishCompleteQuest(root, examples, { advance: true });
    });
  }

  async function finishCompleteQuest(root, examples, opts) {
    const wantAdvance = !!(opts && opts.advance);
    if (allDone()) return;
    if (wantAdvance && advancedToday()) return;

    const completeBtn = document.getElementById("hw-quest-complete");
    const nextBtn = document.getElementById("hw-quest-next");
    if (completeBtn) completeBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    setSaveMsg(wantAdvance ? "Saving…" : "Saving examples…");

    const q = currentQuest();
    const today = localYmd();
    const user = username();
    try {
      if (!user || isDemo()) {
        if (wantAdvance) {
          const completed = progress.completed.slice();
          completed.push({
            day: q.day,
            id: q.id,
            key: q.key,
            ymd: today,
            examples: examples,
          });
          const pieces = progress.puzzlePieces.slice();
          if (!pieces.includes(q.day)) pieces.push(q.day);
          progress = normalizeProgress({
            currentIndex: progress.currentIndex + 1,
            lastCompletedYmd: today,
            periodKey: progress.periodKey || localWeekKey(),
            advanceMode: progress.advanceMode,
            seenKey: q.key,
            examples: ["", "", "", "", ""],
            completed: completed,
            puzzlePieces: pieces,
          });
        } else {
          progress = normalizeProgress({
            ...progress,
            examples: examples,
            updatedAt: new Date().toISOString(),
          });
        }
        writeLocal(progress);
      } else {
        const res = await fetch("/api/immersion-quests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: user,
            examples: examples,
            day: q.day,
            key: q.key,
            ymd: today,
            period: localWeekKey(),
            advanceMode: progress.advanceMode,
            advance: wantAdvance,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(data.error || "Could not save quest.");
          err.code = data.code;
          throw err;
        }
        if (data.progress) progress = normalizeProgress(data.progress);
        writeLocal(progress);
      }
      syncStarFlag();
      paintStar();
      renderPanel();
      notifyQuestExamplesChanged();
      const curr = global.HwHubV5Live?.usesCurriculumHub?.() === true;
      if (wantAdvance) {
        setSaveMsg("Saved. The next quest unlocks Monday.");
        if (curr && global.HwHubV5Live?.completeTask) global.HwHubV5Live.completeTask("quest", "Quest complete");
        else global.HwToast?.show?.("Quest complete");
      } else {
        setSaveMsg("Examples saved. Hit Next quest when you feel ready (once per week).");
        global.HwToast?.show?.("Examples saved");
      }
    } catch (err) {
      if (completeBtn) completeBtn.disabled = false;
      if (nextBtn) nextBtn.disabled = false;
      const code = err && err.code;
      if (code === "ALREADY_DONE_TODAY") {
        setSaveMsg("You already finished this week's quest. The next one unlocks Monday.", true);
        return;
      }
      if (code === "QUEST_STALE") {
        setSaveMsg("This quest already moved — refresh and try again.", true);
        void refresh();
        return;
      }
      setSaveMsg("Couldn’t save — try again.", true);
    }
  }

  async function markSeen() {
    if (!questLayoutEnabled()) return;
    await loadProgress();
    if (allDone()) {
      syncStarFlag();
      paintStar();
      return;
    }
    const q = currentQuest();
    if (progress.seenKey === q.key) {
      syncStarFlag();
      paintStar();
      return;
    }
    try {
      await saveDraft({ seenKey: q.key, examples: progress.examples });
    } catch {
      progress.seenKey = q.key;
    }
    syncStarFlag();
    paintStar();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function notifyQuestExamplesChanged() {
    try {
      document.dispatchEvent(new CustomEvent("hw-quest-examples-changed"));
    } catch {
      /* ignore */
    }
  }

  function getNotebookSnapshot() {
    if (!questLayoutEnabled()) return null;
    const q = questAtDay(Math.max(1, currentQuestDay() - (advancedToday() && !allDone() ? 1 : 0)));
    const examples = Array.isArray(progress.examples)
      ? progress.examples.map((s) => String(s || ""))
      : ["", "", "", "", ""];
    while (examples.length < EXAMPLES) examples.push("");
    return {
      day: q.day,
      round: q.round,
      title: q.title,
      look: q.look || q.title,
      examples: examples.slice(0, EXAMPLES),
    };
  }

  function ensurePanel() {
    const below = document.getElementById("hw-v5-below");
    if (!below || document.getElementById("hw-v5-panel-quest")) return;
    const root = document.createElement("div");
    root.id = "hw-v5-quest-root";
    root.className = "hw-quest-root";
    const wrap = document.createElement("div");
    wrap.className = "hw-hub-v5-panel";
    wrap.id = "hw-v5-panel-quest";
    wrap.dataset.v5Panel = "quest";
    wrap.setAttribute("role", "tabpanel");
    wrap.setAttribute("aria-labelledby", "hw-v5-tab-quest");
    wrap.hidden = true;
    wrap.appendChild(root);
    const notebook = document.getElementById("hw-v5-panel-notebook");
    if (notebook && notebook.parentElement === below) {
      below.insertBefore(wrap, notebook);
    } else {
      below.appendChild(wrap);
    }
  }

  async function refresh() {
    ensurePanel();
    if (questLayoutEnabled()) {
      importantOpen = false; // start collapsed when entering Quest / on refresh
      showDateInBox = false; // date goes back to the target letter
      manualBrowseOffset = 0;
      await loadProgress();
    }
    renderPanel();
    paintFeaturesSwitch();
    paintStar();
  }

  global.HwHubQuests = {
    CORE_COUNT: CORE_COUNT,
    TOTAL: TOTAL,
    questLayoutEnabled: questLayoutEnabled,
    ensurePanel: ensurePanel,
    refresh: refresh,
    markSeen: markSeen,
    hasNewQuest: hasNewQuest,
    /** True once this week's quest is done (the next one unlocks Monday 5:00 a.m.). */
    completedToday: () => advancedToday() && !allDone(),
    completedThisWeek: () => advancedToday() && !allDone(),
    paintStar: paintStar,
    paintFeaturesSwitch: paintFeaturesSwitch,
    loadProgress: loadProgress,
    questAtDay: questAtDay,
    isAutoMode: isAutoMode,
    toggleAdvanceMode: toggleAdvanceMode,
    setAdvanceMode: setAdvanceMode,
    getProgress: () => progress,
    getNotebookSnapshot: getNotebookSnapshot,
  };
})(window);
