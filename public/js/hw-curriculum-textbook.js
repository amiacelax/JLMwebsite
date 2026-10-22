/**
 * Curriculum account — weekly textbook in place of the notebook.
 * Eight pages: core talk, core words, kanji that are not numbers.
 */
(function (global) {
  "use strict";

  const LS = "jlm-hw-curriculum-textbook-v1";

  const PAGES = [
    {
      id: "intro",
      day: "Monday",
      kicker: "Core talk",
      title: "自己紹介",
      passage: "お名前は？　どこに住んでますか？　趣味は何？",
      prompt: "Answer the way you would say it out loud.",
      fields: [
        { name: "name", label: "お名前は？" },
        { name: "live", label: "どこに住んでますか？" },
        { name: "hobby", label: "趣味は何？" },
      ],
    },
    {
      id: "shita",
      day: "Today",
      kicker: "Use 大変",
      title: "今日は何をしましたか",
      prompt: "Five answers. Use 大変.",
      blanks: ["line1", "line2", "line3", "line4", "line5", "line6", "line7", "line8", "line9", "line10"],
    },
    {
      id: "tsumari",
      day: "Wednesday",
      kicker: "Core Japanese",
      title: "つまり",
      passage: "昨日、日本語を勉強した。宿題もした。",
      prompt: "Say that in one line with つまり.",
      area: { name: "sum", label: "つまり、…" },
    },
    {
      id: "tatoeba",
      day: "Thursday",
      kicker: "Core Japanese",
      title: "例えば",
      passage: "趣味は何？　音楽、映画、サッカー…",
      prompt: "Give one example of your hobby.",
      area: { name: "ex", label: "例えば、…" },
    },
    {
      id: "toriaezu",
      day: "Friday",
      kicker: "Core Japanese",
      title: "とりあえず",
      passage: "今日は忙しい。",
      prompt: "What will you do for now?",
      area: { name: "now", label: "とりあえず、…" },
    },
    {
      id: "wazato",
      day: "Saturday",
      kicker: "Core Japanese",
      title: "わざと",
      passage: "落とす can be an accident. わざと means you meant to.",
      prompt: "Which one was on purpose?",
      choices: {
        name: "onpurpose",
        answer: "b",
        options: [
          { id: "a", text: "猫がボールを落とした。" },
          { id: "b", text: "私はわざとボールを落とした。" },
        ],
      },
    },
    {
      id: "toki",
      day: "Sunday",
      kicker: "Core grammar · とき",
      title: "〜とき",
      passage: "雨のとき、うちにいます。日本に行くとき、飛行機です。いつ is the question word. とき is not.",
      prompt: "子供のとき、何をするのが好きでしたか。",
      area: { name: "toki", label: "子供のとき、…" },
    },
    {
      id: "kanji-days",
      day: "Also this week",
      kicker: "Kanji · not numbers",
      title: "日 月 火 水 木 金 土",
      passage: "These are the day kanji. Not 一 二 三.",
      prompt: "Reading for 火?",
      choices: {
        name: "hi",
        answer: "ka",
        options: [
          { id: "nichi", text: "にち" },
          { id: "getsu", text: "げつ" },
          { id: "ka", text: "か" },
          { id: "sui", text: "すい" },
        ],
      },
    },
    {
      id: "kanji-words",
      day: "Also this week",
      kicker: "Kanji · not numbers",
      title: "人 山 川 木 本 田",
      passage: "人 hito · 山 yama · 川 kawa · 木 ki · 本 hon · 田 ta",
      prompt: "Which kanji is やま?",
      choices: {
        name: "yama",
        answer: "yama",
        options: [
          { id: "hito", text: "人" },
          { id: "yama", text: "山" },
          { id: "kawa", text: "川" },
          { id: "ki", text: "木" },
        ],
      },
    },
  ];

  function textbookStoreKey() {
    let user = "";
    try {
      const raw = sessionStorage.getItem("jlm-hw-session") || localStorage.getItem("jlm-hw-session");
      const data = raw ? JSON.parse(raw) : null;
      user = String(data?.username || "").toLowerCase();
    } catch {
      user = "";
    }
    if (!user || user === "demo2" || user === "curriculum") return LS;
    return LS + ":" + user;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(textbookStoreKey());
      const parsed = raw ? JSON.parse(raw) : {};
      const state = parsed && typeof parsed === "object" ? parsed : {};
      const day = global.HwLocalPeriod?.dayKey?.() || "";
      const changed = Boolean(day) && state.dayKey !== day;
      if (changed && state.dayKey) delete state.shita;
      if (day) state.dayKey = day;
      if (changed) {
        try {
          localStorage.setItem(textbookStoreKey(), JSON.stringify(state));
        } catch {
          /* ignore */
        }
      }
      return state;
    } catch {
      return {};
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(textbookStoreKey(), JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }

  function todayIndex() {
    const key = global.HwLocalPeriod?.dayKey?.() || "";
    let day;
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      const parts = key.split("-").map(Number);
      day = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
    } else {
      day = new Date().getDay();
    }
    return (day + 6) % 7;
  }

  function fieldValue(state, pageId, name) {
    const page = state[pageId];
    if (!page || page[name] == null) return "";
    return String(page[name]);
  }

  function renderPage(page, index, state) {
    const today = index === todayIndex();
    const bits = [];
    bits.push('<li class="page' + (today ? " is-today" : "") + '" data-page="' + page.id + '">');
    bits.push(
      '<p class="page__kicker">' +
        (today ? "Today · " : "") +
        escapeHtml(page.day) +
        " · " +
        escapeHtml(page.kicker) +
        "</p>"
    );
    bits.push(
      "<h3" +
        (page.blanks ? ' class="hw-hour-prompt"' : "") +
        ">" +
        escapeHtml(page.id === "shita" ? dailyPrompt() : page.title) +
        "</h3>"
    );
    if (page.passage) bits.push('<p class="passage">' + escapeHtml(page.passage) + "</p>");
    if (page.jp) bits.push('<p class="jp">' + escapeHtml(page.jp) + "</p>");
    if (page.prompt) bits.push('<p class="prompt">' + escapeHtml(page.prompt) + "</p>");
    if (page.blanks) {
      bits.push('<ol class="hw-quest__examples hw-grammar-blanks">');
      page.blanks.forEach((name, index) => {
        const n = index + 1;
        const val = fieldValue(state, page.id, name);
        bits.push(
          "<li><input data-name=\"" +
            name +
            '" type="text" inputmode="text" name="hour-line-' +
            n +
            '" autocomplete="one-time-code" autocapitalize="sentences" spellcheck="true" ' +
            'data-1p-ignore="true" data-lpignore="true" data-form-type="other" maxlength="200" ' +
            'placeholder="' +
            n +
            '" aria-label="Answer ' +
            n +
            '" value="' +
            escapeAttr(val) +
            '"></li>'
        );
      });
      bits.push("</ol>");
    }
    (page.fields || []).forEach((field) => {
      const val = fieldValue(state, page.id, field.name);
      bits.push("<label>" + escapeHtml(field.label) + "</label>");
      bits.push(
        '<input type="text" data-name="' +
          field.name +
          '" value="' +
          escapeAttr(val) +
          '" autocomplete="off">'
      );
    });
    if (page.area) {
      bits.push("<label>" + escapeHtml(page.area.label) + "</label>");
      bits.push(
        '<textarea data-name="' +
          page.area.name +
          '">' +
          escapeHtml(fieldValue(state, page.id, page.area.name)) +
          "</textarea>"
      );
    }
    if (page.choices) {
      const chosen = fieldValue(state, page.id, page.choices.name);
      bits.push('<div class="choices">');
      page.choices.options.forEach((opt) => {
        bits.push(
          '<label><input type="radio" name="ct-' +
            page.id +
            '" data-name="' +
            page.choices.name +
            '" value="' +
            escapeAttr(opt.id) +
            '"' +
            (chosen === opt.id ? " checked" : "") +
            "> <span>" +
            escapeHtml(opt.text) +
            "</span></label>"
        );
      });
      bits.push("</div>");
    }
    bits.push('<div class="row"><button type="button" data-check="1">Check</button><p class="note" data-note></p></div>');
    bits.push("</li>");
    return bits.join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

  function ensureCss() {
    if (document.getElementById("hw-curriculum-textbook-css")) return;
    const link = document.createElement("link");
    link.id = "hw-curriculum-textbook-css";
    link.rel = "stylesheet";
    link.href = "/css/hw-curriculum-textbook.css?v=4";
    document.head.appendChild(link);
  }

  function sessionUser() {
    try {
      const raw = sessionStorage.getItem("jlm-hw-session") || localStorage.getItem("jlm-hw-session");
      const data = raw ? JSON.parse(raw) : null;
      return String(data?.username || "").trim().toLowerCase();
    } catch {
      return "";
    }
  }

  /** Monday of week 1. Hub weeks already start Monday at 5:00 a.m. local. */
  const WEEK1_MONDAY = {
    christian: "2026-09-14",
    alex: "2026-09-28",
    sykohpath: "2026-10-05",
    secretsister5: "2026-10-05",
    kaetherjk: "2026-10-05",
    benm: "2026-10-05",
    noahjorton: "2026-10-05",
    baranymatthewjr: "2026-10-05",
  };

  function curriculumWeekNumber() {
    const start = WEEK1_MONDAY[sessionUser()];
    if (!start) return 0;
    const nowKey = global.HwLocalPeriod?.weekKey?.() || "";
    const startMs = Date.parse(start + "T00:00:00");
    const nowMs = Date.parse(nowKey + "T00:00:00");
    if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return 1;
    return Math.max(1, Math.floor((nowMs - startMs) / (7 * 86400000)) + 1);
  }

  /* One-off Daily Exercise wording for a single student (English, shown as written). */
  const DAILY_PROMPT_OVERRIDE = {
    christian: "Write 10 different \u3044 ending words or sentences",
    baranymatthewjr: "Write 10 different \u3044 ending words or sentences",
  };

  function dailyPrompt() {
    const override = DAILY_PROMPT_OVERRIDE[sessionUser()];
    if (override) return override;
    const week = curriculumWeekNumber();
    if (week >= 3 && week <= 4) return "何をしましたか？";
    if (week >= 5 && week <= 6) return "今日は何をしますか？";
    if (week >= 7) return "何をしますか？";
    if (week >= 1) return "今日は何をしましたか？";
    return "今日は何をしましたか";
  }

  function dailyExerciseId() {
    return sessionStorage.getItem("jlm-ct-focus") || "shita";
  }

  function viewKey(mode) {
    const day = global.HwLocalPeriod?.dayKey?.() || "";
    if (mode === "all") return "all:" + day;
    return "exercise:" + dailyExerciseId() + ":" + day + ":" + dailyPrompt();
  }

  function pagesFor(mode) {
    if (mode === "all") return PAGES.map((page, index) => ({ page, index }));
    let index = PAGES.findIndex((page) => page.id === dailyExerciseId());
    if (index < 0) index = 0;
    return [{ page: PAGES[index], index }];
  }

  const WORD = { text: "大変", reading: "たいへん" };
  function kanjiRuby(text, reading) {
    const value = String(text || "");
    const hasKanji = /[\u4E00-\u9FFF]/.test(value);
    const hasKata = /[\u30A0-\u30FF]/.test(value);
    if (!hasKanji || (hasKata && !hasKanji) || !reading) return escapeHtml(value);
    const parts = value.match(/[\u4E00-\u9FFF]+|[^\u4E00-\u9FFF]+/g) || [value];
    const kanjiParts = parts.filter((part) => /[\u4E00-\u9FFF]/.test(part));
    if (kanjiParts.length !== 1) return escapeHtml(value);
    return parts
      .map((part) => {
        if (!/[\u4E00-\u9FFF]/.test(part)) return escapeHtml(part);
        return "<ruby>" + escapeHtml(part) + "<rt>" + escapeHtml(reading) + "</rt></ruby>";
      })
      .join("");
  }

  const ICON_MIC =
    '<svg class="hw-ex-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>';
  const ICON_PLAY =
    '<svg class="hw-ex-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72L19 12 8 5.14z"/></svg>';
  const ICON_PAUSE =
    '<svg class="hw-ex-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>';
  const ICON_STOP =
    '<svg class="hw-ex-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="1.8"/></svg>';
  const ICON_EXPAND =
    '<svg class="hw-ex-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';

  function recButtonHtml(n, hasClip) {
    return (
      '<button type="button" class="hw-ex-rec' +
      (hasClip ? " has-clip" : "") +
      '" data-ex-rec aria-pressed="false" aria-label="' +
      (hasClip ? "Recording " + n + ": play or delete" : "Record example " + n) +
      '">' +
      (hasClip ? ICON_PLAY : ICON_MIC) +
      "</button>"
    );
  }

  function questExerciseHtml(state) {
    const names = ["line1", "line2", "line3", "line4", "line5", "line6", "line7", "line8", "line9", "line10"];
    const DEFAULT_VISIBLE = DAILY_PROMPT_OVERRIDE[sessionUser()] ? 10 : 1;
    let visible = DEFAULT_VISIBLE;
    names.forEach((name, index) => {
      if (fieldValue(state, "shita", name).trim() || fieldValue(state, "shita", name + "Audio").trim()) {
        visible = Math.max(visible, index + 1);
      }
    });
    const rows = names
      .map((name, index) => {
        const n = index + 1;
        const val = fieldValue(state, "shita", name);
        const audioId = fieldValue(state, "shita", name + "Audio");
        return (
          '<li class="hw-ex-line"' +
          (n > visible ? " hidden" : "") +
          (audioId ? ' data-audio-id="' + escapeAttr(audioId) + '"' : "") +
          '><input data-name="' +
          name +
          '" type="text" inputmode="text" name="hour-line-' +
          n +
          '" autocomplete="one-time-code" autocapitalize="sentences" spellcheck="true" ' +
          'data-1p-ignore="true" data-lpignore="true" data-form-type="other" maxlength="200" ' +
          'placeholder="' +
          (n === 1 ? "トイレに行きました" : "Example " + n) +
          '" aria-label="' +
          (n === 1 ? "トイレに行きました" : "Example " + n) +
          '" value="' +
          escapeAttr(val) +
          '">' +
          '<button type="button" class="hw-ex-view" data-ex-view hidden aria-label="See the whole sentence" title="See the whole sentence">' +
          ICON_EXPAND +
          "</button>" +
          recButtonHtml(n, !!audioId) +
          '<button type="button" class="hw-ex-del" data-ex-del aria-label="Remove example ' +
          n +
          '" title="Remove example">×</button>' +
          "</li>"
        );
      })
      .join("");
    const ghost =
      '<li class="hw-ex-line hw-ex-line--add" data-ex-add-row' +
      (visible >= names.length ? " hidden" : "") +
      '><button type="button" class="hw-ex-add-field" data-ex-add aria-label="Add example" title="Add example">' +
      '<svg class="hw-plus-ico" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>' +
      '<span class="hw-ex-rec hw-ex-rec--ghost" aria-hidden="true">' +
      ICON_MIC +
      "</span></li>";
    const arm =
      global.HwHubWorkouts?.workoutsEnabled?.()
        ? '<button type="button" class="hw-ex-arm" data-ex-arm aria-pressed="false" aria-label="Show this week\'s workout" title="Workout">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>' +
          "</button>"
        : "";
    return (
      '<article class="hw-quest hw-hour-quest" data-page="shita">' +
      '<div class="hw-quest__target-box">' +
      arm +
      '<p class="hw-quest__target hw-quest__target--ask" data-ex-prompt>' +
      escapeHtml(dailyPrompt()) +
      "</p></div>" +
      '<div data-ex-daily>' +
      '<div class="hw-quest__important-wrap"><span class="hw-word-pill" data-word-play>' +
      '<span class="hw-word-play__row">' +
      '<button type="button" class="hw-word-play__arrow" data-word-dir="-1" hidden aria-label="Previous word">←</button>' +
      '<span class="hw-core-chip hw-core-chip--green" data-word-chip role="button" tabindex="0"><span class="hw-furi"><b>' +
      escapeHtml(WORD.text) +
      "</b><i>" +
      escapeHtml(WORD.reading) +
      '</i></span> <span>Hard, tough, rough, (emotionally)</span></span>' +
      '<button type="button" class="hw-word-play__arrow" data-word-dir="1" hidden aria-label="Next word">→</button>' +
      '</span><span class="hw-word-pill__note">Try using today\'s word so you\'ll remember it better!</span>' +
      '<span class="hw-word-pill__more">Click the green button for more words!</span></span></div>' +
      '<form class="hw-quest__examples-form" autocomplete="off" onsubmit="return false;">' +
      '<ol class="hw-quest__examples">' +
      rows +
      ghost +
      "</ol></form></div>" +
      '<div class="hw-ex-workout" data-ex-workout hidden></div></article>'
    );
  }

  function fill(root, mode) {
    if (!root) return;
    ensureCss();
    const key = viewKey(mode) + (mode === "all" ? "" : ":wordnote");
    root.classList.add("hw-curriculum-textbook");
    root.setAttribute("data-mode", mode);
    if (root.getAttribute("data-key") === key && root.childElementCount) return;
    root.setAttribute("data-key", key);
    const state = loadState();
    if (mode !== "all") {
      root.innerHTML = questExerciseHtml(state);
    } else {
      const pages = pagesFor(mode);
      root.innerHTML =
        "<h2>Whole week</h2>" +
        '<p class="lede"><button type="button" class="hw-today__go" data-ct-back="notebook">Back to today</button></p>' +
        '<ol class="pages">' +
        pages.map((item) => renderPage(item.page, item.index, state)).join("") +
        "</ol>";
    }
    global.HwHubV5Live?.paintWordPlay?.();
    if (mode !== "all") bindExampleSwipe(root);
    if (root.dataset.bound === "1") return;
    root.dataset.bound = "1";
    root.addEventListener("input", onInput);
    root.addEventListener("change", onInput);
    root.addEventListener("click", onClick);
    root.addEventListener("focusin", (ev) => {
      const li = ev.target.matches && ev.target.matches("input[data-name]") ? ev.target.closest(".hw-ex-line") : null;
      if (li) {
        const v = li.querySelector("[data-ex-view]");
        if (v) v.hidden = true;
        li.classList.remove("has-view");
      }
    });
    root.addEventListener("focusout", () => window.setTimeout(() => updateExampleOverflow(root), 0));
    window.addEventListener("resize", () => updateExampleOverflow(root));
  }

  function mount(root, mode) {
    fill(root, mode || "today");
  }

  function pageState(state, pageId) {
    if (!state[pageId]) state[pageId] = {};
    return state[pageId];
  }

  function onInput(ev) {
    const input = ev.target;
    if (!input || !input.getAttribute) return;
    const name = input.getAttribute("data-name");
    const pageEl = input.closest("[data-page]");
    if (!name || !pageEl) return;
    const state = loadState();
    const bag = pageState(state, pageEl.getAttribute("data-page"));
    bag[name] = input.value;
    saveState(state);
  }

  function studentSession() {
    const session = global.HwAuth?.getSession?.();
    if (!session || session.role === "teacher") return null;
    const username = String(session.username || "").trim().toLowerCase();
    if (!username) return null;
    return session;
  }

  function exerciseRows(article) {
    return Array.from(article.querySelectorAll(".hw-ex-line"))
      .map((li) => ({
        text: String(li.querySelector("input")?.value || "").trim(),
        audioId: String(li.getAttribute("data-audio-id") || "").trim(),
      }))
      .filter((row) => row.text);
  }

  function formatExerciseWhen(row) {
    const date = String(row?.date || "");
    const parts = date.split("-").map(Number);
    let label = date;
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      label = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
    }
    const at = row?.submittedAt ? new Date(row.submittedAt) : null;
    if (!at || Number.isNaN(at.getTime())) return label;
    const time = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    }).format(at);
    return label + " · " + time;
  }

  function paintPastList(rows) {
    const list = document.getElementById("hw-daily-past-modal-list");
    const meta = document.getElementById("hw-daily-past-modal-meta");
    const intro = document.getElementById("hw-daily-past-modal-intro");
    const detail = document.getElementById("hw-daily-past-modal-detail");
    if (!list) return;
    if (detail) {
      detail.hidden = true;
      detail.replaceChildren();
    }
    if (intro) intro.hidden = false;
    list.hidden = false;
    if (meta) {
      meta.hidden = false;
      meta.textContent = rows.length
        ? rows.length + (rows.length === 1 ? " day" : " days")
        : "No submissions yet.";
    }
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.className = "hw-hub-v2-past-list__item hw-hub-v2-past-list__item--empty";
      empty.textContent = "Nothing sent yet.";
      list.appendChild(empty);
      return;
    }
    rows.forEach((row) => {
      const lines = Array.isArray(row.lines) ? row.lines.filter(Boolean) : [];
      const li = document.createElement("li");
      li.className = "hw-hub-v2-past-list__item";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v2-past-list__btn";
      btn.innerHTML =
        "<span>" +
        escapeHtml(formatExerciseWhen(row)) +
        "</span><time>" +
        escapeHtml(lines.length + (lines.length === 1 ? " sentence" : " sentences")) +
        "</time>";
      btn.addEventListener("click", () => showPastDetail(row));
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function showPastDetail(row) {
    const list = document.getElementById("hw-daily-past-modal-list");
    const meta = document.getElementById("hw-daily-past-modal-meta");
    const intro = document.getElementById("hw-daily-past-modal-intro");
    const detail = document.getElementById("hw-daily-past-modal-detail");
    if (!detail) return;
    const lines = (Array.isArray(row.lines) ? row.lines : []).filter(Boolean);
    detail.replaceChildren();
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn btn--ghost btn--sm";
    back.textContent = "All days";
    back.addEventListener("click", () => {
      detail.hidden = true;
      if (list) list.hidden = false;
      if (meta) meta.hidden = false;
      if (intro) intro.hidden = false;
    });
    const heading = document.createElement("p");
    heading.className = "hw-past-assignments-modal__intro";
    heading.textContent = formatExerciseWhen(row);
    const ol = document.createElement("ol");
    ol.className = "hw-daily-past-lines";
    const audios = Array.isArray(row.audioIds) ? row.audioIds : [];
    lines.forEach((line, index) => {
      const li = document.createElement("li");
      li.textContent = line;
      const id = String(audios[index] || "").trim();
      if (id && /^[A-Za-z0-9_-]{1,80}$/.test(id)) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.className = "hw-ex-clip";
        audio.src = "/api/hw-m/" + encodeURIComponent(id);
        li.appendChild(audio);
      }
      ol.appendChild(li);
    });
    detail.append(back, heading, ol);
    detail.hidden = false;
    if (list) list.hidden = true;
    if (meta) meta.hidden = true;
    if (intro) intro.hidden = true;
  }

  function closePastModal() {
    const modal = document.getElementById("hw-daily-past-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("is-modal-open");
  }

  function bindPastModal() {
    const modal = document.getElementById("hw-daily-past-modal");
    if (!modal || modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";
    modal.querySelectorAll("[data-hw-daily-past-close]").forEach((el) => {
      el.addEventListener("click", closePastModal);
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape" || modal.hidden) return;
      ev.preventDefault();
      closePastModal();
    });
  }

  async function loadPastSubmissions() {
    const meta = document.getElementById("hw-daily-past-modal-meta");
    const session = studentSession();
    if (!session) {
      paintPastList([]);
      if (meta) meta.textContent = "Log in to see past submissions.";
      return;
    }
    if (meta) meta.textContent = "Loading…";
    try {
      const res = await fetch(
        "/api/daily-exercise?username=" + encodeURIComponent(session.username)
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load submissions.");
      paintPastList(Array.isArray(data.submissions) ? data.submissions : []);
    } catch (err) {
      paintPastList([]);
      if (meta) meta.textContent = err && err.message ? err.message : "Could not load submissions.";
    }
  }

  async function togglePastSubmissions() {
    bindPastModal();
    const modal = document.getElementById("hw-daily-past-modal");
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("is-modal-open");
    await loadPastSubmissions();
  }

  async function submitExercise(btn) {
    const article = document.querySelector('#hw-curriculum-textbook [data-page="shita"]');
    const note = document.querySelector("#hw-ex-actions [data-ex-note]");
    const lines = article ? exerciseRows(article) : [];
    if (note) {
      note.classList.remove("is-error");
      note.textContent = "";
    }
    if (!lines.length) {
      if (note) {
        note.classList.add("is-error");
        note.textContent = "Write a sentence first.";
      }
      return;
    }
    const session = studentSession();
    if (!session) {
      if (note) {
        note.classList.add("is-error");
        note.textContent = "Log in, then submit again.";
      }
      return;
    }
    if (btn.disabled) return;
    btn.disabled = true;
    if (note) note.textContent = "Saving…";
    try {
      const res = await fetch("/api/daily-exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: session.username,
          prompt: dailyPrompt(),
          lines: lines.map((row) => row.text),
          audioIds: lines.map((row) => row.audioId),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save that exercise.");
      if (note) note.textContent = "";
      global.HwHubV5Live?.completeTask?.("grammar", "Daily Exercise submitted");
    } catch (err) {
      if (note) {
        note.classList.add("is-error");
        note.textContent = err && err.message ? err.message : "Could not save that exercise.";
      }
    } finally {
      btn.disabled = false;
    }
  }

  let exampleTake = null;

  function pickExampleMime() {
    if (global.HwCompat?.pickRecorderMimeType) {
      return global.HwCompat.pickRecorderMimeType([
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ]);
    }
    return "audio/webm";
  }

  function rememberExampleAudio(li, id) {
    li.setAttribute("data-audio-id", id);
    const input = li.querySelector("input");
    const name = input && input.getAttribute("data-name");
    if (!name) return;
    const state = loadState();
    const bag = pageState(state, "shita");
    bag[name + "Audio"] = id;
    saveState(state);
  }

  function rowHasClip(li) {
    return !!(li && (li.getAttribute("data-audio-id") || li._clipUrl));
  }

  /** Mic when empty, triangle when there is a recording, pause while it plays. */
  function paintRecBtn(li, playing) {
    const btn = li && li.querySelector(".hw-ex-rec");
    if (!btn) return;
    const live = !!(exampleTake && exampleTake.li === li && exampleTake.recorder.state === "recording");
    const has = rowHasClip(li);
    btn.classList.toggle("has-clip", has && !live);
    btn.classList.toggle("is-playing", !!playing);
    btn.classList.toggle("is-live", live);
    const n = (li.querySelector("input")?.getAttribute("aria-label") || "").replace("Example ", "");
    if (live) {
      btn.innerHTML = ICON_STOP;
      btn.setAttribute("aria-label", "Stop recording");
    } else if (playing) {
      btn.innerHTML = ICON_PAUSE;
      btn.setAttribute("aria-label", "Stop playing");
    } else if (has) {
      btn.innerHTML = ICON_PLAY;
      btn.setAttribute("aria-label", "Recording " + n + ": play or delete");
    } else {
      btn.innerHTML = ICON_MIC;
      btn.setAttribute("aria-label", "Record example " + n);
    }
  }

  let clipAudio = null;
  let clipLi = null;

  function stopClip() {
    const li = clipLi;
    if (clipAudio) {
      try {
        clipAudio.pause();
      } catch (_) {
        /* ignore */
      }
    }
    clipAudio = null;
    clipLi = null;
    if (li) paintRecBtn(li, false);
  }

  function playClip(li) {
    stopClip();
    const id = li.getAttribute("data-audio-id") || "";
    const src = li._clipUrl || (id ? "/api/hw-m/" + encodeURIComponent(id) : "");
    if (!src) return;
    const audio = new Audio(src);
    clipAudio = audio;
    clipLi = li;
    audio.addEventListener("ended", stopClip);
    audio.addEventListener("error", stopClip);
    paintRecBtn(li, true);
    audio.play().catch(stopClip);
  }

  function deleteClip(li) {
    stopClip();
    li.removeAttribute("data-audio-id");
    if (li._clipUrl) {
      try {
        URL.revokeObjectURL(li._clipUrl);
      } catch (_) {
        /* ignore */
      }
      li._clipUrl = null;
    }
    const name = li.querySelector("input")?.getAttribute("data-name");
    if (name) {
      const state = loadState();
      pageState(state, "shita")[name + "Audio"] = "";
      saveState(state);
    }
    paintRecBtn(li, false);
    global.HwToast?.show?.("Recording deleted");
  }

  let clipMenu = null;
  function closeClipMenu() {
    if (!clipMenu) return;
    document.removeEventListener("pointerdown", clipMenu.onOutside, true);
    clipMenu.el.remove();
    clipMenu = null;
  }

  function placeClipMenu(el, anchor) {
    const a = anchor.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    let top = a.top - r.height - 8;
    if (top < 8) top = a.bottom + 8;
    const left = Math.max(8, Math.min(a.right - r.width, window.innerWidth - r.width - 8));
    el.style.top = top + "px";
    el.style.left = left + "px";
  }

  /** Tap a finished recording: small Play / Delete prompt, then an "are you sure" for Delete. */
  function openClipMenu(anchor, li) {
    closeClipMenu();
    const el = document.createElement("div");
    el.className = "hw-ex-pop";
    el.setAttribute("role", "dialog");
    function showChoices() {
      el.innerHTML =
        '<button type="button" class="btn btn--primary btn--sm" data-pop-play>Play</button>' +
        '<button type="button" class="btn btn--ghost btn--sm hw-ex-pop__danger" data-pop-delete>Delete</button>';
    }
    function showSure() {
      el.innerHTML =
        '<p class="hw-ex-pop__q">Delete this recording?</p>' +
        '<div class="hw-ex-pop__row">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-pop-keep>Keep</button>' +
        '<button type="button" class="btn btn--primary btn--sm" data-pop-yes>Delete</button></div>';
    }
    showChoices();
    el.addEventListener("click", (ev) => {
      const t = ev.target.closest("button");
      if (!t) return;
      if (t.hasAttribute("data-pop-play")) {
        closeClipMenu();
        playClip(li);
      } else if (t.hasAttribute("data-pop-delete")) {
        showSure();
        placeClipMenu(el, anchor);
      } else if (t.hasAttribute("data-pop-keep")) {
        closeClipMenu();
      } else if (t.hasAttribute("data-pop-yes")) {
        closeClipMenu();
        deleteClip(li);
      }
    });
    document.body.appendChild(el);
    placeClipMenu(el, anchor);
    const onOutside = (ev) => {
      if (el.contains(ev.target) || anchor.contains(ev.target)) return;
      closeClipMenu();
    };
    clipMenu = { el, onOutside };
    window.setTimeout(() => document.addEventListener("pointerdown", onOutside, true), 0);
  }

  function showExampleClip(li, id, blob) {
    if (id) rememberExampleAudio(li, id);
    if (blob) li._clipUrl = URL.createObjectURL(blob);
    paintRecBtn(li, clipLi === li && !!clipAudio);
  }

  /* ---- long sentences: short on the line, whole thing (with furigana) on request ---- */
  function updateExampleOverflow(root) {
    (root || document).querySelectorAll(".hw-ex-line:not([hidden]) input[data-name]").forEach((input) => {
      const li = input.closest(".hw-ex-line");
      const btn = li && li.querySelector("[data-ex-view]");
      if (!btn) return;
      const long =
        document.activeElement !== input &&
        String(input.value || "").trim() &&
        input.scrollWidth > input.clientWidth + 1;
      btn.hidden = !long;
      li.classList.toggle("has-view", !!long);
    });
  }

  function ensureSentenceModal() {
    let modal = document.getElementById("hw-ex-sentence");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "hw-breakdown-modal";
    modal.id = "hw-ex-sentence";
    modal.hidden = true;
    modal.innerHTML =
      '<div class="hw-breakdown-modal__backdrop" data-ex-sentence-close aria-hidden="true"></div>' +
      '<div class="hw-breakdown-modal__dialog hw-ex-sentence__dialog" role="dialog" aria-modal="true">' +
      '<button class="hw-breakdown-modal__close" type="button" data-ex-sentence-close aria-label="Close">×</button>' +
      '<p class="section__eyebrow" data-ex-sentence-n></p>' +
      '<p class="hw-ex-sentence__text" lang="ja" data-ex-sentence-text></p>' +
      "</div>";
    document.body.appendChild(modal);
    const close = () => {
      modal.hidden = true;
      document.body.classList.remove("is-modal-open");
    };
    modal.querySelectorAll("[data-ex-sentence-close]").forEach((el) => el.addEventListener("click", close));
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && !modal.hidden) close();
    });
    return modal;
  }

  function showFullSentence(text, label) {
    const modal = ensureSentenceModal();
    const out = modal.querySelector("[data-ex-sentence-text]");
    modal.querySelector("[data-ex-sentence-n]").textContent = label || "";
    out.textContent = text;
    modal.hidden = false;
    document.body.classList.add("is-modal-open");
    const auto = global.HwFuriganaAuto;
    if (!auto || !auto.textToRubySegments) return;
    Promise.resolve(auto.textToRubySegments(text))
      .then((segments) => {
        if (modal.hidden || !Array.isArray(segments) || !segments.some((seg) => seg && seg.rt)) return;
        out.textContent = "";
        segments.forEach((seg) => {
          if (seg && seg.rt) {
            const ruby = document.createElement("ruby");
            ruby.appendChild(document.createTextNode(seg.text));
            const rt = document.createElement("rt");
            rt.textContent = seg.rt;
            ruby.appendChild(rt);
            out.appendChild(ruby);
          } else {
            out.appendChild(document.createTextNode((seg && seg.text) || ""));
          }
        });
      })
      .catch(() => {});
  }

  async function uploadExampleClip(blob, mime) {
    const session = studentSession();
    if (!session || !blob || !blob.size) return "";
    const file = new File([blob], "daily-example.webm", { type: mime || "audio/webm" });
    const body = new FormData();
    body.append("audio", file);
    body.append("username", session.username);
    body.append("displayName", session.displayName || session.username || "");
    body.append("assignmentId", "daily-exercise");
    body.append("lessonName", "Daily Exercise");
    body.append("promptId", "daily-line");
    body.append("inlineSave", "1");
    const res = await fetch("/api/homework-audio-upload", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not save that recording.");
    return String(data.mediaId || "");
  }

  function finishExampleTake() {
    const take = exampleTake;
    exampleTake = null;
    if (!take) return;
    take.btn.classList.remove("is-live");
    take.btn.setAttribute("aria-pressed", "false");
    try {
      take.stream.getTracks().forEach((track) => track.stop());
    } catch (_) {
      /* ignore */
    }
    if (!take.chunks.length) {
      paintRecBtn(take.li);
      return;
    }
    const blob = new Blob(take.chunks, { type: take.mime || "audio/webm" });
    if (!blob.size) {
      paintRecBtn(take.li);
      return;
    }
    showExampleClip(take.li, "", blob);
    void uploadExampleClip(blob, take.mime).then((id) => {
      if (id) showExampleClip(take.li, id, null);
    }).catch(() => {
      /* The clip stays on the line even if sending it failed. */
    });
  }

  function stopExampleRecording() {
    const take = exampleTake;
    if (!take || !take.recorder || take.recorder.state === "inactive") return;
    try {
      if (take.recorder.state === "recording" && typeof take.recorder.requestData === "function") {
        take.recorder.requestData();
      }
    } catch (_) {
      /* ignore */
    }
    try {
      take.recorder.stop();
    } catch (_) {
      finishExampleTake();
    }
  }

  async function startExampleRecording(btn) {
    const li = btn.closest(".hw-ex-line");
    if (!li || typeof MediaRecorder === "undefined") return;
    if (exampleTake && exampleTake.btn === btn && exampleTake.recorder.state === "recording") {
      stopExampleRecording();
      return;
    }
    stopExampleRecording();
    let stream;
    try {
      stream = global.HwCompat?.getStereoUserMedia
        ? await global.HwCompat.getStereoUserMedia({ audio: true })
        : await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (_) {
      return;
    }
    const mime = pickExampleMime() || "audio/webm";
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch (_) {
      recorder = new MediaRecorder(stream);
    }
    const take = {
      btn,
      li,
      stream,
      recorder,
      mime: recorder.mimeType || mime,
      chunks: [],
    };
    exampleTake = take;
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size) take.chunks.push(ev.data);
    };
    recorder.onstop = finishExampleTake;
    recorder.onerror = () => stopExampleRecording();
    recorder.start(250);
    btn.classList.add("is-live");
    btn.innerHTML = ICON_STOP;
    btn.setAttribute("aria-label", "Stop recording");
    btn.setAttribute("aria-pressed", "true");
    global.HwCompat?.bindRecordingSurvive?.(li, {
      isLive: () => exampleTake && exampleTake.li === li && exampleTake.recorder.state === "recording",
      flush: () => stopExampleRecording(),
    });
  }

  function exampleDefaultVisible() {
    return DAILY_PROMPT_OVERRIDE[sessionUser()] ? 10 : 1;
  }

  function exampleHasContent(li) {
    return !!(String(li.querySelector("input")?.value || "").trim() || rowHasClip(li));
  }

  /** Take one example out (text + recording); the ones below move up one line. */
  function removeExampleRow(li) {
    if (!li) return;
    stopClip();
    closeClipMenu();
    const list = li.closest(".hw-quest__examples");
    if (!list) return;
    const rows = Array.from(list.querySelectorAll(".hw-ex-line:not(.hw-ex-line--add)"));
    const shown = rows.filter((r) => !r.hidden);
    const at = shown.indexOf(li);
    if (at < 0) return;
    const state = loadState();
    const bag = pageState(state, "shita");
    for (let i = at; i < shown.length; i++) {
      const cur = shown[i];
      const next = shown[i + 1];
      const curIn = cur.querySelector("input");
      const nextIn = next && next.querySelector("input");
      curIn.value = nextIn ? nextIn.value : "";
      const audioId = next ? next.getAttribute("data-audio-id") || "" : "";
      if (audioId) cur.setAttribute("data-audio-id", audioId);
      else cur.removeAttribute("data-audio-id");
      cur._clipUrl = next ? next._clipUrl || null : null;
      const name = curIn.getAttribute("data-name");
      bag[name] = curIn.value;
      bag[name + "Audio"] = audioId;
      paintRecBtn(cur, false);
    }
    saveState(state);
    const last = shown[shown.length - 1];
    if (shown.length > exampleDefaultVisible()) {
      last.hidden = true;
      const ghost = list.querySelector("[data-ex-add-row]");
      if (ghost) ghost.hidden = false;
    }
    updateExampleOverflow(list);
  }

  function bindExampleSwipe(root) {
    const list = root.querySelector(".hw-quest__examples");
    if (!list) return;
    global.HwSwipeDelete?.bind(list, {
      item: ".hw-ex-line:not(.hw-ex-line--add)",
      hasContent: exampleHasContent,
      onDelete: removeExampleRow,
    });
  }

  /* The recording keeps playing if you leave Daily Exercise — stop it when this row is no longer on screen. */
  window.setInterval(() => {
    if (!clipAudio) return;
    if (!clipLi || !clipLi.isConnected || !clipLi.offsetParent) stopClip();
  }, 300);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopClip();
  });
  document.addEventListener("click", (ev) => {
    if (clipAudio && ev.target.closest && ev.target.closest("[data-v5-tab]")) stopClip();
  });

  function onClick(ev) {
    const arm = ev.target.closest("[data-ex-arm]");
    if (arm) {
      ev.preventDefault();
      const article = arm.closest(".hw-hour-quest");
      if (!article) return;
      const on = article.classList.toggle("is-workout");
      arm.setAttribute("aria-pressed", on ? "true" : "false");
      arm.setAttribute("aria-label", on ? "Back to daily exercise" : "Show this week's workout");
      const daily = article.querySelector("[data-ex-daily]");
      const face = article.querySelector("[data-ex-workout]");
      const prompt = article.querySelector("[data-ex-prompt]");
      if (daily) daily.hidden = on;
      if (face) face.hidden = !on;
      if (on) global.HwHubWorkouts?.renderInExercise?.(face, prompt, article);
      else {
        const hero = article.querySelector(".hw-workout-pic");
        if (hero) hero.hidden = true;
        if (prompt) prompt.textContent = dailyPrompt();
      }
      return;
    }
    const rec = ev.target.closest("[data-ex-rec]");
    if (rec) {
      const li = rec.closest(".hw-ex-line");
      const recording = exampleTake && exampleTake.btn === rec && exampleTake.recorder.state === "recording";
      if (!recording && li && clipLi === li && clipAudio) {
        stopClip();
        return;
      }
      if (!recording && rowHasClip(li)) {
        openClipMenu(rec, li);
        return;
      }
      closeClipMenu();
      void startExampleRecording(rec);
      return;
    }
    const view = ev.target.closest("[data-ex-view]");
    if (view) {
      const input = view.closest(".hw-ex-line")?.querySelector("input");
      if (input && input.value.trim()) showFullSentence(input.value.trim(), input.getAttribute("aria-label") || "");
      return;
    }
    const del = ev.target.closest("[data-ex-del]");
    if (del) {
      removeExampleRow(del.closest(".hw-ex-line"));
      return;
    }
    const add = ev.target.closest("[data-ex-add]");
    if (add) {
      const list = add.closest(".hw-quest__examples");
      const next = list && list.querySelector(".hw-ex-line:not(.hw-ex-line--add)[hidden]");
      if (next) {
        next.hidden = false;
        next.querySelector("input")?.focus();
      }
      const row = add.closest(".hw-ex-line--add");
      const more = list && list.querySelector(".hw-ex-line:not(.hw-ex-line--add)[hidden]");
      if (row && !more) row.hidden = true;
      return;
    }
    const done = ev.target.closest("[data-ex-done]");
    if (done) {
      void submitExercise(done);
      return;
    }
    const pastBtn = ev.target.closest("[data-ex-past-btn]");
    if (pastBtn) {
      void togglePastSubmissions(pastBtn);
      return;
    }
    const jump = ev.target.closest("[data-ct-all], [data-ct-back]");
    if (jump) {
      const dest = jump.getAttribute("data-ct-all") || jump.getAttribute("data-ct-back");
      if (dest === "notebook") sessionStorage.removeItem("jlm-ct-focus");
      global.HwHubV5Live?.openCurriculumPlace?.(dest || "notebook", "");
      return;
    }
    const btn = ev.target.closest("[data-check]");
    if (!btn) return;
    const pageEl = btn.closest(".page");
    const note = pageEl && pageEl.querySelector("[data-note]");
    if (!pageEl || !note) return;
    const page = PAGES.find((p) => p.id === pageEl.getAttribute("data-page"));
    if (!page) return;
    const state = loadState();
    const bag = state[page.id] || {};
    if (page.choices) {
      const picked = bag[page.choices.name] || "";
      note.textContent =
        picked === page.choices.answer
          ? "That’s the one."
          : picked
            ? "Not that one. Look again."
            : "Pick one first.";
      return;
    }
    const names = []
      .concat(page.blanks || [])
      .concat(page.fields || [])
      .concat(page.area ? [page.area] : [])
      .map((field) => (typeof field === "string" ? field : field.name));
    const filled = names.every((name) => String(bag[name] || "").trim());
    note.textContent = filled ? "Saved on this browser." : "Write the line, then check.";
  }

  function onActionsClick(ev) {
    const done = ev.target.closest("[data-ex-done]");
    if (done) {
      void submitExercise(done);
      return;
    }
    if (ev.target.closest("[data-ex-past-btn]")) void togglePastSubmissions();
  }

  /** Submit + Past submissions sit under the card, like Past homework under the HW tab. */
  function ensureActions(panel) {
    let el = document.getElementById("hw-ex-actions");
    if (!el) {
      el = document.createElement("div");
      el.id = "hw-ex-actions";
      el.className = "hw-ex-actions";
      el.innerHTML =
        '<button type="button" class="btn btn--primary hw-ex-actions__btn" data-ex-done>Submit</button>' +
        '<button type="button" class="btn btn--ghost hw-ex-actions__btn" data-ex-past-btn>Past submissions</button>' +
        '<p class="hw-quest__save-msg" data-ex-note role="status"></p>';
      el.addEventListener("click", onActionsClick);
    }
    if (panel && el.previousElementSibling !== panel) panel.insertAdjacentElement("afterend", el);
  }

  function sync() {
    const panel = document.getElementById("hw-v5-panel-notebook");
    const diary = document.getElementById("hw-notebook-diary");
    const on = global.HwHubV5Live?.usesCurriculumHub?.() === true;
    if (!on) {
      document.getElementById("hw-ex-actions")?.remove();
      const existing = document.getElementById("hw-curriculum-textbook");
      if (existing) existing.hidden = true;
      if (diary) diary.hidden = false;
      return;
    }
    if (!panel) return;
    let root = document.getElementById("hw-curriculum-textbook");
    if (root && root.getAttribute("data-rev") !== "14") {
      root.remove();
      root = null;
    }
    if (!root) {
      root = document.createElement("section");
      root.id = "hw-curriculum-textbook";
      root.setAttribute("data-rev", "14");
      panel.insertBefore(root, panel.firstChild);
    }
    fill(root, "today");
    ensureActions(panel);
    updateExampleOverflow(root);
    root.hidden = false;
    if (diary) diary.hidden = true;
    const week = document.getElementById("hw-curriculum-week");
    if (week) fill(week, "all");
  }

  global.HwCurriculumTextbook = { mount, sync, PAGES, dailyPrompt, curriculumWeekNumber };
})(window);
