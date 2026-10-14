/**
 * Student Hub — Immersion Quest tab (365 daily look-fors).
 * One complete per Tokyo day; unfinished quests do not advance.
 * Puzzle pieces + JD explainer video are scaffolded as Coming soon.
 */
(function (global) {
  "use strict";

  const TOTAL = 365;
  const EXAMPLES = 5;
  const LS_PREFIX = "jlm-hw-immersion-quests:";

  const IMPORTANT_LINES = [
    "Podcasts and other audio-only media are fine.",
    "But it has been scientifically proven that the more senses you use the better you memorize information. So, writing, seeing, touching, scent, and even weird ones like pain and scratching (like your hand on a piece of paper)!",
  ];

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
  /** Full Quest UI — test on demoprem only until launch. */
  const QUEST_PREVIEW_USERNAMES = new Set(["demoprem", "premdemo"]);

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

  function tokyoYmd() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function emptyProgress() {
    return {
      currentIndex: 0,
      lastCompletedYmd: "",
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

  function username() {
    const session = global.HwAuth?.getSession?.();
    return String(session?.username || "")
      .trim()
      .toLowerCase();
  }

  function questLayoutEnabled() {
    return QUEST_PREVIEW_USERNAMES.has(username());
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
      seenKey: String(raw.seenKey || ""),
      examples: examples,
      completed: Array.isArray(raw.completed) ? raw.completed : [],
      puzzlePieces: Array.isArray(raw.puzzlePieces) ? raw.puzzlePieces : [],
      updatedAt: String(raw.updatedAt || ""),
    };
  }

  function currentQuest() {
    if (progress.currentIndex >= TOTAL) {
      return questAtDay(TOTAL);
    }
    return questAtDay(progress.currentIndex + 1);
  }

  function allDone() {
    return progress.currentIndex >= TOTAL;
  }

  function completedToday() {
    return progress.lastCompletedYmd === tokyoYmd();
  }

  function syncStarFlag() {
    if (allDone()) {
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
          "/api/immersion-quests?username=" + encodeURIComponent(user),
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
    if (!user || isDemo()) return progress;
    const res = await fetch("/api/immersion-quests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: user,
        examples: progress.examples,
        seenKey: progress.seenKey,
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
    return progress;
  }

  function bindImportant(root) {
    const btn = root.querySelector(".hw-recording-tip__trigger");
    const msg = root.querySelector(".hw-recording-tip__message");
    if (!btn || !msg) return;
    btn.addEventListener("click", () => {
      // Follow the same toggle behavior as other HW recording tips:
      // - click when closed -> open
      // - click when open -> close
      const currentlyHidden = msg.hidden === true;
      msg.hidden = !currentlyHidden;
      btn.setAttribute("aria-expanded", currentlyHidden ? "true" : "false");
      btn.classList.toggle("is-open", currentlyHidden);
      importantOpen = currentlyHidden;
    });
  }

  function readExamplesFromForm(root) {
    return Array.from(root.querySelectorAll("[data-quest-ex]")).map((el) =>
      String(el.value || "").trim()
    );
  }

  function refreshVisibleExampleCount() {
    let count = 1;
    for (let i = 0; i < progress.examples.length; i++) {
      if (String(progress.examples[i] || "").trim()) count = i + 1;
    }
    visibleExampleCount = Math.max(1, Math.min(EXAMPLES, count));
  }

  function renderExampleRows(disabled) {
    let html = "";
    for (let i = 0; i < visibleExampleCount; i++) {
      const val = escapeHtml(progress.examples[i] || "");
      html +=
        "<li><input data-quest-ex type=\"text\" maxlength=\"200\" value=\"" +
        val +
        '" ' +
        (disabled ? "readonly " : "") +
        "placeholder=\"Example " +
        (i + 1) +
        "\" aria-label=\"Example " +
        (i + 1) +
        "\"></li>";
    }
    return html;
  }

  function renderComingSoonPanel(mount) {
    mount.innerHTML =
      '<article class="hw-quest hw-quest--soon-only">' +
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

    const q = currentQuest();
    const doneAll = allDone();
    const doneToday = completedToday();
    const waitingTomorrow = doneToday && !doneAll;
    refreshVisibleExampleCount();
    const roundNote =
      q.round > 1 && !doneAll
        ? '<p class="hw-quest__round">Round ' + q.round + " — same hunt, new media.</p>"
        : "";

    const statusLine = doneAll
      ? "You finished all 365 immersion quests. Puzzle pieces come next."
      : waitingTomorrow
        ? "Nice - that's today's quest. Come back tomorrow for the next one."
        : "Day " + q.day + " of " + TOTAL;

    mount.innerHTML =
      '<article class="hw-quest">' +
      "<h2 class=\"hw-quest__title\">Today's Immersion Quest</h2>" +
      '<p class="hw-quest__status">' +
      escapeHtml(statusLine) +
      "</p>" +
      roundNote +
      '<div class="hw-quest__target-box">' +
      '<p class="hw-quest__target">' +
      escapeHtml(doneAll ? "—" : q.title) +
      "</p></div>" +
      '<p class="hw-quest__lead">Look and listen for ' +
      escapeHtml(doneAll ? "this quest" : q.look) +
      ".</p>" +
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
      IMPORTANT_LINES.map((line) => "- " + line).join("\n") +
      "</p></div></div>" +
      '<p class="hw-quest__prompt">Write down up to 5 examples that you have seen in your media of choice:</p>' +
      '<ol class="hw-quest__examples">' +
      renderExampleRows(doneAll || waitingTomorrow) +
      "</ol>" +
      '<div class="hw-quest__more">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="hw-quest-add-example"' +
      (doneAll || waitingTomorrow || visibleExampleCount >= EXAMPLES ? " hidden" : "") +
      '>+ Add example</button></div>' +
      '<div class="hw-quest__actions">' +
      '<button type="button" class="btn btn--primary" id="hw-quest-complete"' +
      (doneAll || waitingTomorrow ? " disabled" : "") +
      ">" +
      (doneAll ? "All done" : waitingTomorrow ? "Done for today" : "Complete today’s quest") +
      "</button>" +
      '<p class="hw-quest__save-msg" id="hw-quest-save-msg"></p>' +
      "</div>" +
      '<div class="hw-quest__puzzle" aria-label="Quest puzzle">' +
      '<button type="button" class="hw-quest__puzzle-link" id="hw-quest-view-puzzle">' +
      '<span class="hw-quest__puzzle-icon" aria-hidden="true">🧩</span>' +
      "<span>View Puzzle</span></button>" +
      "</div>" +
      "</article>";

    bindImportant(mount);

    const completeBtn = document.getElementById("hw-quest-complete");
    completeBtn?.addEventListener("click", () => {
      void completeQuest(mount);
    });

    const addBtn = document.getElementById("hw-quest-add-example");
    addBtn?.addEventListener("click", () => {
      visibleExampleCount = Math.min(EXAMPLES, visibleExampleCount + 1);
      renderPanel();
    });

    document.getElementById("hw-quest-view-puzzle")?.addEventListener("click", () => {
      window.alert("Coming soon!");
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
  }

  function setSaveMsg(text, isError) {
    const el = document.getElementById("hw-quest-save-msg");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }

  async function completeQuest(root) {
    if (allDone() || completedToday()) return;
    const examples = readExamplesFromForm(root);
    const filled = examples.filter(Boolean);
    if (!filled.length) {
      setSaveMsg("Write at least one example from what you watched or heard.", true);
      return;
    }
    const btn = document.getElementById("hw-quest-complete");
    if (btn) btn.disabled = true;
    setSaveMsg("Saving…");
    const q = currentQuest();
    const today = tokyoYmd();
    const user = username();
    try {
      if (!user || isDemo()) {
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
          seenKey: q.key,
          examples: ["", "", "", "", ""],
          completed: completed,
          puzzlePieces: pieces,
        });
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
      setSaveMsg("Saved. Next quest unlocks tomorrow.");
    } catch (err) {
      if (btn) btn.disabled = false;
      const code = err && err.code;
      if (code === "ALREADY_DONE_TODAY") {
        setSaveMsg("You already completed a quest today. Next one unlocks tomorrow.", true);
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
      await loadProgress();
    }
    renderPanel();
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
    paintStar: paintStar,
    loadProgress: loadProgress,
    questAtDay: questAtDay,
  };
})(window);
