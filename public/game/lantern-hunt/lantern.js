/**
 * Lantern Word Hunt — full Japanese words in the dark; match the reading prompt.
 * Learning: no timer, 3 lives.
 * Time attack: 14 rounds, 5 finds per round, scaling board size and timer bonuses.
 */
(function (global) {
  function ensureLanternToggleInSettings() {
    if (document.getElementById("lhn-lantern-toggle")) return;
    const settings =
      document.querySelector(".lhn-settings") ||
      document.querySelector("[aria-labelledby='lhn-settings-heading']");
    const hintsLabel = document.getElementById("lhn-hints-toggle")?.closest(".lhn-toggle");
    if (!settings) return;
    const label = document.createElement("label");
    label.className = "lhn-toggle";
    label.innerHTML =
      '<input type="checkbox" class="lhn-toggle__input" id="lhn-lantern-toggle">' +
      '<span class="lhn-toggle__track" aria-hidden="true"></span>' +
      '<span class="lhn-toggle__label">Turn off lantern (show all words)</span>';
    if (hintsLabel) settings.insertBefore(label, hintsLabel);
    else settings.appendChild(label);
  }

  ensureLanternToggleInSettings();

  const MAX_HEARTS = 3;
  const CHOICES = 5;
  const STAGE_CENTER = { x: 50, y: 40 };
  const REVEAL_THRESHOLD = 0.72;
  const POINTS_BASE = 100;
  const TA_START_SECONDS = 5;
  const TA_TOTAL_ROUNDS = 14;
  const TA_FINDS_PER_ROUND = 5;
  const TA_INTER_ROUND_SEC = 5;
  const MIN_DIST = 92;
  /** Lantern sits this many px above the fingertip on touch (thumb-length). */
  const MOBILE_LANTERN_OFFSET_PX = 72;

  /** words on board, seconds added on correct, seconds removed on wrong */
  const TA_ROUND_RULES = [
    { words: 5, correct: 5, wrong: 1 },
    { words: 6, correct: 5, wrong: 1 },
    { words: 7, correct: 5, wrong: 1 },
    { words: 8, correct: 5, wrong: 1 },
    { words: 9, correct: 5, wrong: 1 },
    { words: 10, correct: 5, wrong: 1 },
    { words: 10, correct: 4, wrong: 2 },
    { words: 10, correct: 3, wrong: 2 },
    { words: 10, correct: 3, wrong: 3 },
    { words: 10, correct: 2, wrong: 3 },
    { words: 10, correct: 2, wrong: 4 },
    { words: 10, correct: 1.5, wrong: 4 },
    { words: 10, correct: 1, wrong: 5 },
    { words: 10, correct: 0.5, wrong: 5 },
  ];

  const stage = document.getElementById("lhn-stage");
  const wordsEl = document.getElementById("lhn-words");
  const floatsEl = document.getElementById("lhn-floats");
  const veil = document.getElementById("lhn-veil");
  const glow = document.getElementById("lhn-glow");
  const scoreEl = document.getElementById("lhn-score");
  const streakEl = document.getElementById("lhn-streak");
  const readingEl = document.getElementById("lhn-target-reading");
  const meaningEl = document.getElementById("lhn-target-meaning");
  const findSubEl = document.getElementById("lhn-find-sub");
  const timerEl = document.getElementById("lhn-timer");
  const actionBtn = document.getElementById("lhn-action");
  const heartsEl = document.getElementById("lhn-hearts");
  const stageHint = document.getElementById("lhn-stage-hint");
  const findPanel = document.getElementById("lhn-find-panel");
  const headerSubEl = document.getElementById("lhn-header-sub");
  const modeButtons = [...document.querySelectorAll("[data-lhn-mode]")];
  const hintsToggle = document.getElementById("lhn-hints-toggle");
  const lanternToggle = document.getElementById("lhn-lantern-toggle");
  const clearEl = document.getElementById("lhn-clear");
  const fireworksEl = document.getElementById("lhn-fireworks");
  const clearScoreEl = document.getElementById("lhn-clear-score");

  let gameMode = "learning";
  let studySet = "demo";
  const wordsCache = {};
  const setMetaById = {
    demo: { label: "Demo words" },
    n5: { label: "JLPT N5 words" },
  };
  let availableSetIds = ["demo", "n5"];
  let hintsEnabled = false;
  let lanternOff = false;
  let gameClear = false;
  let taRound = 1;
  let taFindsInRound = 0;
  let taBetweenRounds = false;
  let score = 0;
  let streak = 0;
  let hearts = MAX_HEARTS;
  let gameOver = false;
  let playing = false;
  let pointerInside = false;
  let lx = 50;
  let ly = 50;
  let lightRadius = 110;
  let targetEntry = null;
  let roundChoices = [];
  let timerId = null;
  let timeLeft = TA_START_SECONDS;
  let rafId = 0;
  let usedAnswersSession = new Set();
  let advanceTimer = null;
  let touchGesture = null;

  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const TAP_MAX_MS = 280;
  const TAP_MAX_MOVE_PX = 14;
  const HOLD_LANTERN_MS = 180;

  function isLearning() {
    return gameMode === "learning";
  }

  function isTimeAttack() {
    return gameMode === "timeAttack";
  }

  const HINTS_STORAGE_KEY = "lhn-hints-enabled";
  const LANTERN_OFF_STORAGE_KEY = "lhn-lantern-off";
  const STUDY_SET_STORAGE_KEY = "lhn-study-set";

  /** Keep only the reading used in this word (never show kunyomi/on'yomi pairs). */
  function sanitizeReading(reading) {
    return String(reading || "")
      .split(/\s*[／/]\s*/)[0]
      .trim();
  }

  function sanitizeWordList(words) {
    return (words || []).map((item) => ({
      word: item.word,
      reading: sanitizeReading(item.reading),
      en: item.en,
    }));
  }

  function studySetLabel() {
    return setMetaById[studySet]?.label || studySet;
  }

  function builtinWords(setId) {
    if (setId === "n5") {
      const list = global.LanternWordsN5;
      if (Array.isArray(list) && list.length) return sanitizeWordList(list);
    }
    if (setId === "demo") {
      const list = global.LanternWordsDemo;
      if (Array.isArray(list) && list.length) return sanitizeWordList(list);
    }
    return [];
  }

  async function fetchWordsForSet(setId) {
    try {
      const res = await fetch("/api/lantern-words?set=" + encodeURIComponent(setId));
      if (res.ok) {
        const data = await res.json();
        if (data.label) setMetaById[setId] = { label: data.label };
        if (Array.isArray(data.words) && data.words.length) {
          wordsCache[setId] = sanitizeWordList(data.words);
          return wordsCache[setId];
        }
      }
    } catch (_) {}
    const built = builtinWords(setId);
    wordsCache[setId] = built;
    return built;
  }

  function getWords() {
    if (wordsCache[studySet]?.length) return wordsCache[studySet];
    return builtinWords(studySet);
  }

  function renderStudySetButtons() {
    const container = document.getElementById("lhn-studyset-options");
    if (!container) return;
    container.innerHTML = "";
    availableSetIds.forEach((id) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lhn-mode__btn";
      btn.setAttribute("data-lhn-studyset", id);
      btn.setAttribute("aria-pressed", id === studySet ? "true" : "false");
      btn.textContent = setMetaById[id]?.label || id;
      btn.disabled = settingsLocked();
      btn.addEventListener("click", () => setStudySet(id));
      container.appendChild(btn);
    });
  }

  async function refreshWordSets() {
    try {
      const res = await fetch("/api/lantern-words/sets");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sets) && data.sets.length) {
          availableSetIds = data.sets.map((s) => s.id).filter(Boolean);
          data.sets.forEach((s) => {
            if (s.id) setMetaById[s.id] = { label: s.label || s.id };
          });
        }
      }
    } catch (_) {}
    if (!availableSetIds.includes(studySet)) {
      studySet = availableSetIds.includes("demo") ? "demo" : availableSetIds[0] || "demo";
    }
    renderStudySetButtons();
    await fetchWordsForSet(studySet);
    updateStudySetUi();
  }

  function warnIfN5Missing() {
    const toast = document.getElementById("lhn-toast");
    if (!toast) return;
    const missing = studySet === "n5" && (!global.LanternWordsN5 || !global.LanternWordsN5.length);
    if (missing) {
      toast.hidden = false;
      toast.className = "lhn-toast lhn-toast--info";
      toast.textContent = "JLPT N5 list did not load — hard refresh the page.";
    } else if (toast.textContent.includes("JLPT N5 list")) {
      toast.hidden = true;
      toast.textContent = "";
    }
  }

  function loadStudySetPreference() {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlSet = params.get("set");
      if (urlSet) {
        studySet = urlSet.trim().toLowerCase();
        return;
      }
      const stored = localStorage.getItem(STUDY_SET_STORAGE_KEY);
      if (stored) studySet = stored;
    } catch (_) {}
  }

  function saveStudySetPreference() {
    try {
      localStorage.setItem(STUDY_SET_STORAGE_KEY, studySet);
    } catch (_) {}
  }

  function updateFindLabel() {
    const label = document.querySelector(".lhn-find__label");
    if (label) label.textContent = "Find this word";
  }

  function settingsLocked() {
    return (playing || Boolean(advanceTimer) || taBetweenRounds) && !gameOver;
  }

  function updateStudySetUi() {
    const container = document.getElementById("lhn-studyset-options");
    if (container) {
      container.querySelectorAll("[data-lhn-studyset]").forEach((btn) => {
        const pressed = btn.getAttribute("data-lhn-studyset") === studySet;
        btn.setAttribute("aria-pressed", pressed ? "true" : "false");
        btn.disabled = settingsLocked();
      });
    }
    const note = document.getElementById("lhn-studyset-note");
    if (note) {
      note.textContent = studySetLabel() + " · " + getWords().length + " entries";
    }
    warnIfN5Missing();
    updateFindLabel();
  }

  async function setStudySet(set) {
    if (!set || set === studySet) return;
    if (!availableSetIds.includes(set) && !setMetaById[set]) return;
    studySet = set;
    saveStudySetPreference();
    await fetchWordsForSet(studySet);
    updateStudySetUi();
    resetGame();
  }

  function loadHintsPreference() {
    try {
      const stored = localStorage.getItem(HINTS_STORAGE_KEY);
      if (stored === "1") hintsEnabled = true;
      else if (stored === "0") hintsEnabled = false;
    } catch (_) {}
    if (hintsToggle) hintsToggle.checked = hintsEnabled;
  }

  function saveHintsPreference() {
    try {
      localStorage.setItem(HINTS_STORAGE_KEY, hintsEnabled ? "1" : "0");
    } catch (_) {}
  }

  function wordHintText(item) {
    return sanitizeReading(item.reading) + " — " + item.en;
  }

  function applyWordHint(el, item) {
    if (hintsEnabled) el.title = wordHintText(item);
    else el.removeAttribute("title");
  }

  function updateWordHints() {
    roundChoices.forEach((entry) => applyWordHint(entry.el, entry.item));
  }

  function setHintsEnabled(enabled) {
    hintsEnabled = Boolean(enabled);
    if (hintsToggle) hintsToggle.checked = hintsEnabled;
    updateWordHints();
    saveHintsPreference();
  }

  function loadLanternPreference() {
    try {
      const stored = localStorage.getItem(LANTERN_OFF_STORAGE_KEY);
      if (stored === "1") lanternOff = true;
      else if (stored === "0") lanternOff = false;
    } catch (_) {}
    if (lanternToggle) lanternToggle.checked = lanternOff;
    applyLanternOffState(false);
  }

  function saveLanternPreference() {
    try {
      localStorage.setItem(LANTERN_OFF_STORAGE_KEY, lanternOff ? "1" : "0");
    } catch (_) {}
  }

  function revealAllWords() {
    roundChoices.forEach((entry) => {
      entry.el.style.setProperty("--reveal", "1");
      entry.el.classList.add("lhn-word--visible", "lhn-word--ready");
    });
  }

  function findSubText(active) {
    if (!active) return "Press New game when you are ready";
    return lanternOff
      ? "Tap the matching word"
      : "Shine the dark and tap the matching word";
  }

  function updateIdleStageHint() {
    if (!stageHint || playing) return;
    if (lanternOff) {
      stageHint.textContent = "All words visible — tap the matching word";
      return;
    }
    stageHint.textContent = isCoarsePointer
      ? "Hold to shine · tap a lit word"
      : "Move mouse or finger to light the dark";
  }

  function applyLanternOffState(updateWords) {
    if (stage) stage.classList.toggle("lhn-stage--no-lantern", lanternOff);
    updateIdleStageHint();
    if (findSubEl && playing && targetEntry) {
      findSubEl.textContent = findSubText(true);
    }
    if (updateWords !== false && playing) {
      if (lanternOff) revealAllWords();
      else updateReveal();
    }
  }

  function setLanternOff(off) {
    lanternOff = Boolean(off);
    if (lanternToggle) lanternToggle.checked = lanternOff;
    applyLanternOffState(true);
    saveLanternPreference();
  }

  function shuffled(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function wordKey(item) {
    return item.word;
  }

  function getTaRules() {
    return TA_ROUND_RULES[Math.min(taRound, TA_TOTAL_ROUNDS) - 1] || TA_ROUND_RULES[0];
  }

  function formatTimeDelta(sec) {
    const n = Number(sec);
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(1).replace(/\.0$/, "");
  }

  function pickRoundSet(choiceCount) {
    const words = getWords();
    const count = Math.max(2, choiceCount || CHOICES);
    let targetPool = words.filter((item) => !usedAnswersSession.has(wordKey(item)));
    if (targetPool.length === 0) {
      usedAnswersSession.clear();
      targetPool = [...words];
    }
    const target = targetPool[Math.floor(Math.random() * targetPool.length)];
    usedAnswersSession.add(wordKey(target));

    const choices = [];
    const usedEn = new Set();
    const pool = shuffled(words);

    for (const item of pool) {
      if (choices.length >= count) break;
      if (usedEn.has(item.en)) continue;
      usedEn.add(item.en);
      choices.push(item);
    }
    while (choices.length < count) {
      const item = pool.find((w) => !choices.includes(w)) || words[choices.length % words.length];
      if (!choices.includes(item)) choices.push(item);
      else break;
    }

    if (!choices.some((c) => c.word === target.word)) {
      choices[Math.floor(Math.random() * choices.length)] = target;
    }

    return { choices, target };
  }

  function showFloatText(entry, text, kind) {
    if (!floatsEl || !entry) return;
    const el = document.createElement("span");
    el.className = "lhn-float lhn-float--" + (kind || "ok");
    el.textContent = text;
    el.style.left = entry.x + "%";
    el.style.top = entry.y + "%";
    el.setAttribute("role", "status");
    floatsEl.appendChild(el);
    const remove = () => el.remove();
    el.addEventListener("animationend", remove, { once: true });
    setTimeout(remove, 2100);
  }

  function renderHearts(damageIndex) {
    if (!heartsEl || !isLearning()) return;
    heartsEl.innerHTML = "";
    for (let i = 0; i < MAX_HEARTS; i++) {
      const heart = document.createElement("span");
      heart.className = "lhn-heart";
      heart.textContent = "♥";
      if (i < hearts) heart.classList.add("lhn-heart--full");
      else heart.classList.add("lhn-heart--empty");
      if (damageIndex === i) heart.classList.add("lhn-heart--damage");
      heartsEl.appendChild(heart);
    }
    heartsEl.setAttribute("aria-label", hearts + " of " + MAX_HEARTS + " lives");
  }

  function loseHeart() {
    if (!isLearning() || hearts <= 0) return 0;
    const damageIndex = hearts - 1;
    hearts -= 1;
    renderHearts(damageIndex);
    setTimeout(() => renderHearts(-1), 540);
    return hearts;
  }

  function updateModeUi() {
    document.body.classList.toggle("lhn-body--learning", isLearning());
    document.body.classList.toggle("lhn-body--time-attack", isTimeAttack());
    modeButtons.forEach((btn) => {
      const pressed = btn.getAttribute("data-lhn-mode") === gameMode;
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
      btn.disabled = settingsLocked();
    });
    updateStudySetUi();
    if (headerSubEl) {
      const setName = studySetLabel();
      headerSubEl.textContent = isLearning()
        ? setName + " · find the word · 3 lives"
        : setName + " · time attack · 14 rounds";
    }
    updateTaHeaderSub();
    renderHearts(-1);
    updateHud();
  }

  function setMode(mode) {
    if (mode !== "learning" && mode !== "timeAttack") return;
    if (mode === gameMode) return;
    gameMode = mode;
    updateModeUi();
    resetGame();
  }

  function updateActionButton() {
    if (!actionBtn) return;
    actionBtn.disabled = playing || Boolean(advanceTimer) || taBetweenRounds;
    if (playing || advanceTimer) return;
    if (gameOver) {
      actionBtn.textContent = "New game";
      return;
    }
    const midRun = score > 0 || streak > 0 || (isLearning() && hearts < MAX_HEARTS);
    actionBtn.textContent = midRun ? "Continue" : "New game";
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(score);
    if (streakEl) streakEl.textContent = String(streak);
    if (timerEl && isTimeAttack()) {
      const display =
        Number.isInteger(timeLeft) ? String(timeLeft) : timeLeft.toFixed(1).replace(/\.0$/, "");
      timerEl.textContent = display;
      timerEl.classList.toggle("lhn-hud__value--low", timeLeft <= 3);
    }
  }

  function updateTaHeaderSub() {
    if (!headerSubEl || !isTimeAttack() || !playing) return;
    const rules = getTaRules();
    headerSubEl.textContent =
      "Round " +
      taRound +
      "/" +
      TA_TOTAL_ROUNDS +
      " · " +
      taFindsInRound +
      "/" +
      TA_FINDS_PER_ROUND +
      " found · +" +
      formatTimeDelta(rules.correct) +
      "s / −" +
      formatTimeDelta(rules.wrong) +
      "s";
  }

  function updateTaStageHint() {
    if (!stageHint || !isTimeAttack()) return;
    if (taBetweenRounds) return;
    const rules = getTaRules();
    stageHint.textContent =
      "Round " +
      taRound +
      " · " +
      rules.words +
      " words · find " +
      (taFindsInRound + 1) +
      "/" +
      TA_FINDS_PER_ROUND;
  }

  function hideClearOverlay() {
    if (clearEl) {
      clearEl.hidden = true;
      clearEl.setAttribute("aria-hidden", "true");
    }
    if (fireworksEl) fireworksEl.innerHTML = "";
  }

  function showClearOverlay() {
    if (clearScoreEl) clearScoreEl.textContent = "Score " + score;
    if (clearEl) {
      clearEl.hidden = false;
      clearEl.setAttribute("aria-hidden", "false");
    }
    spawnFireworks();
  }

  function spawnFireworks() {
    if (!fireworksEl) return;
    fireworksEl.innerHTML = "";
    const colors = ["#ffeb3b", "#ff9800", "#f44336", "#e91e63", "#9c27b0", "#03a9f4", "#4caf50"];
    for (let i = 0; i < 48; i++) {
      const p = document.createElement("span");
      p.className = "lhn-clear__particle";
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 120;
      p.style.left = 30 + Math.random() * 40 + "%";
      p.style.top = 35 + Math.random() * 30 + "%";
      p.style.setProperty("--fx", Math.cos(angle) * dist + "px");
      p.style.setProperty("--fy", Math.sin(angle) * dist - 40 + "px");
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.6 + "s";
      p.style.animationDuration = 0.9 + Math.random() * 0.8 + "s";
      fireworksEl.appendChild(p);
    }
    setTimeout(() => {
      if (gameClear && fireworksEl) spawnFireworks();
    }, 1600);
  }

  function endGameClear() {
    gameClear = true;
    gameOver = true;
    playing = false;
    taBetweenRounds = false;
    stopTimers();
    fadeAllWords();
    stage.classList.remove("lhn-stage--playing", "lhn-stage--lit");
    setFindPrompt(null, false);
    showFloatText(STAGE_CENTER, "ゲームクリア！", "clear");
    showClearOverlay();
    if (stageHint) stageHint.textContent = "Amazing — press New game to play again";
    if (findSubEl) findSubEl.textContent = "You cleared all 14 rounds!";
    updateHud();
    updateActionButton();
    updateModeUi();
  }

  function pulseTimer() {
    if (!timerEl) return;
    timerEl.classList.remove("lhn-hud__value--pulse");
    void timerEl.offsetWidth;
    timerEl.classList.add("lhn-hud__value--pulse");
  }

  function endGameOver(reason) {
    gameOver = true;
    gameClear = false;
    playing = false;
    taBetweenRounds = false;
    hideClearOverlay();
    stopTimers();
    fadeAllWords();
    stage.classList.remove("lhn-stage--playing", "lhn-stage--lit");
    setFindPrompt(null, false);
    if (reason === "time") {
      showFloatText(STAGE_CENTER, "時間切れ！", "timeout");
    } else {
      showFloatText(STAGE_CENTER, "ゲームオーバー", "over");
    }
    showFloatText({ x: 50, y: 54 }, "Score " + score, "over-sub");
    if (stageHint) {
      stageHint.textContent = isLearning()
        ? "Out of lives — press New game"
        : "Time's up — press New game";
    }
    updateHud();
    updateActionButton();
    updateModeUi();
  }

  function scheduleAfterHeartLoss() {
    if (hearts <= 0) {
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(() => {
        advanceTimer = null;
        endGameOver();
      }, 500);
    }
  }

  function stopCountdown() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startCountdown() {
    if (!isTimeAttack()) return;
    stopCountdown();
    timerId = setInterval(() => {
      timeLeft -= 1;
      updateHud();
      if (timeLeft <= 0) {
        timeLeft = 0;
        updateHud();
        stopCountdown();
        onTimeAttackEnd();
      }
    }, 1000);
  }

  function onTimeAttackEnd() {
    if (!playing) return;
    streak = 0;
    if (stageHint && targetEntry) {
      stageHint.textContent =
        "Answer: " + targetEntry.item.word + " · " + targetEntry.item.reading;
    }
    endGameOver("time");
  }

  function setFindPrompt(target, active) {
    if (readingEl) {
      readingEl.textContent = target ? target.reading : "—";
      readingEl.lang = "ja";
    }
    if (meaningEl) {
      meaningEl.textContent = target && target.en ? target.en : "";
      meaningEl.lang = "en";
    }
    if (findSubEl) {
      findSubEl.textContent = findSubText(active);
    }
    if (findPanel) {
      findPanel.classList.toggle("lhn-find--active", Boolean(active && target));
    }
  }

  function wordFontClass(word) {
    const len = [...String(word || "")].length;
    if (len >= 5) return "lhn-word--len5";
    if (len >= 4) return "lhn-word--len4";
    if (len >= 3) return "lhn-word--len3";
    return "";
  }

  function setLantern(xPct, yPct) {
    lx = xPct;
    ly = yPct;
    const r = lightRadius + "px";
    if (veil) {
      veil.style.setProperty("--lhn-x", lx + "%");
      veil.style.setProperty("--lhn-y", ly + "%");
      veil.style.setProperty("--lhn-radius", r);
    }
    if (glow) {
      glow.style.setProperty("--lhn-x", lx + "%");
      glow.style.setProperty("--lhn-y", ly + "%");
      glow.style.setProperty("--lhn-radius", r);
    }
    if (stage) {
      stage.style.setProperty("--lhn-x", lx + "%");
      stage.style.setProperty("--lhn-y", ly + "%");
    }
  }

  function pointerToPercent(clientX, clientY, options) {
    options = options || {};
    const rect = stage.getBoundingClientRect();
    let yPx = clientY - rect.top;
    if (options.aboveFinger) {
      yPx -= MOBILE_LANTERN_OFFSET_PX;
    }
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = (yPx / rect.height) * 100;
    return {
      x: Math.max(6, Math.min(94, x)),
      y: Math.max(10, Math.min(90, y)),
    };
  }

  function distPct(ax, ay, bx, by, rect) {
    const dx = ((ax - bx) / 100) * rect.width;
    const dy = ((ay - by) / 100) * rect.height;
    return Math.hypot(dx, dy);
  }

  function measureLightRadius() {
    if (!stage) return 110;
    const w = stage.clientWidth;
    return Math.max(90, Math.min(155, w * 0.24));
  }

  function minDistForCount(count) {
    if (count >= 10) return 72;
    if (count >= 8) return 80;
    if (count >= 7) return 84;
    return MIN_DIST;
  }

  function placeChoices(choices) {
    const rect = stage.getBoundingClientRect();
    const placed = [];
    const minDist = minDistForCount(choices.length);

    choices.forEach((item) => {
      const padX = item.word.length >= 4 ? 16 : 12;
      const padY = 14;
      let x = 50;
      let y = 50;
      let ok = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        x = padX + Math.random() * (100 - padX * 2);
        y = padY + Math.random() * (100 - padY * 2);
        ok = placed.every((p) => distPct(x, y, p.x, p.y, rect) >= minDist);
        if (ok) break;
      }
      placed.push({ x, y, item });
    });
    return placed;
  }

  function removeFoundWord(entry) {
    entry.el.classList.add("lhn-word--fading");
    entry.el.classList.remove("lhn-word--ready");
    entry.el.style.pointerEvents = "none";
    roundChoices = roundChoices.filter((e) => e !== entry);
    if (targetEntry === entry) targetEntry = null;
  }

  function pickNextTargetFromBoard() {
    const pool = roundChoices.filter((e) => !e.el.classList.contains("lhn-word--fading"));
    if (pool.length === 0) return false;
    const next = pool[Math.floor(Math.random() * pool.length)];
    targetEntry = next;
    setFindPrompt(next.item, true);
    updateTaStageHint();
    updateTaHeaderSub();
    return true;
  }

  function clearBoard() {
    if (wordsEl) wordsEl.innerHTML = "";
    if (floatsEl) floatsEl.innerHTML = "";
    roundChoices = [];
    targetEntry = null;
  }

  function spawnBoard(choices, target) {
    clearBoard();
    const placements = placeChoices(choices);
    placements.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lhn-word lhn-word--term " + wordFontClass(p.item.word);
      btn.textContent = p.item.word;
      btn.style.left = p.x + "%";
      btn.style.top = p.y + "%";
      btn.dataset.word = p.item.word;
      applyWordHint(btn, p.item);
      btn.setAttribute("aria-label", p.item.word);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isCoarsePointer) return;
        onWordClick(btn, p.item);
      });
      wordsEl.appendChild(btn);
      const entry = {
        el: btn,
        item: p.item,
        x: p.x,
        y: p.y,
      };
      roundChoices.push(entry);
      if (p.item.word === target.word) {
        targetEntry = entry;
      }
    });
    if (lanternOff) revealAllWords();
  }

  function fadeAllWords() {
    roundChoices.forEach((entry) => {
      entry.el.classList.add("lhn-word--fading");
      entry.el.classList.remove("lhn-word--ready");
      entry.el.style.pointerEvents = "none";
    });
  }

  function pauseRaf() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function onWordClick(btn, item) {
    if (!playing || btn.classList.contains("lhn-word--fading")) return;
    if (!btn.classList.contains("lhn-word--ready")) return;

    const isTarget = targetEntry && item.word === targetEntry.item.word;

    if (!isTarget) {
      const wrongEntry = roundChoices.find((w) => w.el === btn);
      if (wrongEntry) showFloatText(wrongEntry, "ちがう！", "miss");

      if (isTimeAttack()) {
        const rules = getTaRules();
        timeLeft = Math.max(0, timeLeft - rules.wrong);
        updateHud();
        pulseTimer();
        if (timeLeft <= 0) {
          onTimeAttackEnd();
          return;
        }
        streak = 0;
        return;
      }

      loseHeart();
      streak = 0;
      if (hearts <= 0) {
        playing = false;
        stopTimers();
        fadeAllWords();
        stage.classList.remove("lhn-stage--playing", "lhn-stage--lit");
        setFindPrompt(null, false);
        updateActionButton();
      }
      scheduleAfterHeartLoss();
      return;
    }

    const gained = POINTS_BASE;
    score += gained;
    streak += 1;

    if (isTimeAttack()) {
      const rules = getTaRules();
      timeLeft += rules.correct;
      updateHud();
      pulseTimer();
      showFloatText(targetEntry, "正解！ +" + formatTimeDelta(rules.correct) + "s", "ok");
      updateActionButton();

      const foundEntry = targetEntry;
      removeFoundWord(foundEntry);
      taFindsInRound += 1;
      updateTaHeaderSub();

      if (taFindsInRound >= TA_FINDS_PER_ROUND) {
        pauseRaf();
        clearTimeout(advanceTimer);
        advanceTimer = setTimeout(() => {
          advanceTimer = null;
          completeTaRound();
        }, 700);
        return;
      }

      if (!pickNextTargetFromBoard()) {
        onTimeAttackEnd();
        return;
      }

      pauseRaf();
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(() => {
        advanceTimer = null;
        rafId = requestAnimationFrame(tick);
      }, 450);
      return;
    }

    stopTimers();
    showFloatText(targetEntry, "正解！ +" + gained, "ok");
    updateHud();
    updateActionButton();

    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      beginRound(false);
    }, 850);
  }

  function updateReveal() {
    if (!playing || !stage) return;
    if (lanternOff) {
      revealAllWords();
      return;
    }
    const rect = stage.getBoundingClientRect();
    const px = (lx / 100) * rect.width;
    const py = (ly / 100) * rect.height;

    roundChoices.forEach((entry) => {
      const wx = (entry.x / 100) * rect.width;
      const wy = (entry.y / 100) * rect.height;
      const d = Math.hypot(px - wx, py - wy);
      const reveal = Math.max(0, 1 - d / lightRadius);
      entry.el.style.setProperty("--reveal", reveal.toFixed(2));
      entry.el.classList.toggle("lhn-word--visible", reveal > 0.08);
      entry.el.classList.toggle("lhn-word--ready", reveal >= REVEAL_THRESHOLD);
    });
  }

  function tick() {
    if (!playing) return;
    if (pointerInside) updateReveal();
    rafId = requestAnimationFrame(tick);
  }

  function stopRaf() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function stopTimers(keepAdvance) {
    stopCountdown();
    stopRaf();
    if (!keepAdvance && advanceTimer) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }
  }

  function completeTaRound() {
    if (taRound >= TA_TOTAL_ROUNDS) {
      endGameClear();
      return;
    }
    startTaInterRound(taRound + 1);
  }

  function startTaInterRound(nextRound) {
    playing = false;
    taBetweenRounds = true;
    stopCountdown();
    stopRaf();
    fadeAllWords();
    setFindPrompt(null, false);
    updateActionButton();
    updateModeUi();

    let left = TA_INTER_ROUND_SEC;
    const tickCountdown = () => {
      if (gameOver) {
        taBetweenRounds = false;
        return;
      }
      if (left > 0) {
        if (stageHint) {
          stageHint.textContent = "Round " + nextRound + " in " + left + "…";
        }
        showFloatText(STAGE_CENTER, String(left), "countdown");
        left -= 1;
        advanceTimer = setTimeout(tickCountdown, 1000);
        return;
      }
      advanceTimer = null;
      taBetweenRounds = false;
      taRound = nextRound;
      taFindsInRound = 0;
      showFloatText(STAGE_CENTER, "ラウンド " + taRound, "start");
      beginTaRound(false);
    };
    clearTimeout(advanceTimer);
    tickCountdown();
  }

  function beginTaRound(showStart) {
    if (!stage || !wordsEl || gameOver) return;

    const rules = getTaRules();
    const { choices, target } = pickRoundSet(rules.words);
    spawnBoard(choices, target);
    setFindPrompt(target, true);
    updateActionButton();
    updateModeUi();

    playing = true;
    lightRadius = measureLightRadius();
    setLantern(50, 50);
    pointerInside = false;

    stage.classList.add("lhn-stage--playing");
    updateTaStageHint();
    updateTaHeaderSub();
    updateHud();

    if (showStart) {
      showFloatText(STAGE_CENTER, "スタート！", "start");
    } else {
      showFloatText(STAGE_CENTER, "ラウンド " + taRound, "start");
    }

    startCountdown();
    rafId = requestAnimationFrame(tick);
  }

  function beginRound(showStart) {
    if (!stage || !wordsEl || gameOver) return;

    stopTimers();
    playing = true;
    lightRadius = measureLightRadius();
    setLantern(50, 50);
    pointerInside = false;
    taBetweenRounds = false;

    if (isTimeAttack()) {
      if (showStart) {
        taRound = 1;
        taFindsInRound = 0;
        timeLeft = TA_START_SECONDS;
        usedAnswersSession.clear();
      }
      beginTaRound(showStart);
      return;
    }

    const { choices, target } = pickRoundSet(CHOICES);
    spawnBoard(choices, target);
    setFindPrompt(target, true);
    updateActionButton();
    updateModeUi();

    stage.classList.add("lhn-stage--playing");
    if (stageHint) stageHint.textContent = "Find: " + target.word;

    updateHud();
    if (showStart) {
      showFloatText(STAGE_CENTER, "スタート！", "start");
    }

    rafId = requestAnimationFrame(tick);
  }

  function resetGame() {
    stopTimers();
    clearTouchGesture();
    playing = false;
    gameOver = false;
    gameClear = false;
    taBetweenRounds = false;
    taRound = 1;
    taFindsInRound = 0;
    score = 0;
    streak = 0;
    hearts = MAX_HEARTS;
    timeLeft = TA_START_SECONDS;
    usedAnswersSession.clear();
    hideClearOverlay();
    clearBoard();
    stage.classList.remove("lhn-stage--playing", "lhn-stage--lit");
    pointerInside = false;
    setLantern(50, 50);
    setFindPrompt(null, false);
    renderHearts(-1);
    updateHud();
    updateActionButton();
    updateModeUi();
    updateIdleStageHint();
  }

  function clearTouchGesture() {
    if (!touchGesture) return;
    if (touchGesture.holdTimer) clearTimeout(touchGesture.holdTimer);
    if (stage && touchGesture.captured) {
      try {
        stage.releasePointerCapture(touchGesture.pointerId);
      } catch (_) {}
    }
    touchGesture = null;
  }

  function applyLanternFromPointer(e, isTouch) {
    if (!stage) return;
    const finger = pointerToPercent(e.clientX, e.clientY);
    const lantern = isTouch
      ? pointerToPercent(e.clientX, e.clientY, { aboveFinger: true })
      : finger;
    setLantern(lantern.x, lantern.y);
    if (isTouch) {
      stage.classList.add("lhn-stage--touch");
      stage.style.setProperty("--lhn-fx", finger.x + "%");
      stage.style.setProperty("--lhn-fy", finger.y + "%");
    } else {
      stage.classList.remove("lhn-stage--touch");
    }
    pointerInside = true;
    stage.classList.add("lhn-stage--lit");
    if (playing) updateReveal();
  }

  function enterTouchLanternMode(e) {
    if (!touchGesture || touchGesture.mode === "lantern") return;
    touchGesture.mode = "lantern";
    if (touchGesture.holdTimer) {
      clearTimeout(touchGesture.holdTimer);
      touchGesture.holdTimer = null;
    }
    if (stage && !touchGesture.captured) {
      try {
        stage.setPointerCapture(e.pointerId);
        touchGesture.captured = true;
      } catch (_) {}
    }
    applyLanternFromPointer(e, true);
  }

  function trySelectWordAtPoint(clientX, clientY) {
    if (!playing) return;
    const hit = document.elementFromPoint(clientX, clientY);
    const btn = hit?.closest?.(".lhn-word");
    if (!btn || btn.classList.contains("lhn-word--fading")) return;
    if (!btn.classList.contains("lhn-word--ready")) return;
    const entry = roundChoices.find((w) => w.el === btn);
    if (entry) onWordClick(btn, entry.item);
  }

  function onPointerDown(e) {
    if (!stage || !playing) return;
    if (e.pointerType === "touch") {
      clearTouchGesture();
      touchGesture = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTime: Date.now(),
        mode: "pending",
        captured: false,
        holdTimer: setTimeout(() => enterTouchLanternMode(e), HOLD_LANTERN_MS),
      };
      return;
    }
    applyLanternFromPointer(e, false);
  }

  function onPointerMove(e) {
    if (!stage) return;
    if (e.pointerType === "touch") {
      if (!touchGesture || e.pointerId !== touchGesture.pointerId) return;
      const moved = Math.hypot(e.clientX - touchGesture.startX, e.clientY - touchGesture.startY);
      if (touchGesture.mode === "pending" && moved > TAP_MAX_MOVE_PX) {
        enterTouchLanternMode(e);
      }
      if (touchGesture.mode === "lantern") {
        applyLanternFromPointer(e, true);
      }
      return;
    }
    applyLanternFromPointer(e, false);
  }

  function onPointerUp(e) {
    if (!stage) return;
    if (e.pointerType === "touch" && touchGesture && e.pointerId === touchGesture.pointerId) {
      const elapsed = Date.now() - touchGesture.startTime;
      const moved = Math.hypot(e.clientX - touchGesture.startX, e.clientY - touchGesture.startY);
      const wasTap =
        touchGesture.mode === "pending" && elapsed < TAP_MAX_MS && moved < TAP_MAX_MOVE_PX;
      clearTouchGesture();
      if (wasTap) trySelectWordAtPoint(e.clientX, e.clientY);
      onPointerLeave();
      return;
    }
    if (e.pointerType !== "touch") applyLanternFromPointer(e, false);
  }

  function onPointerLeave() {
    pointerInside = false;
    stage?.classList.remove("lhn-stage--touch");
    if (!playing) stage?.classList.remove("lhn-stage--lit");
  }

  stage?.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "touch") return;
    applyLanternFromPointer(e, false);
  });
  stage?.addEventListener("pointermove", onPointerMove);
  stage?.addEventListener("pointerdown", onPointerDown);
  stage?.addEventListener("pointerup", onPointerUp);
  stage?.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return;
    onPointerLeave();
  });
  stage?.addEventListener("pointercancel", (e) => {
    if (e.pointerType === "touch") {
      clearTouchGesture();
      onPointerLeave();
      return;
    }
    onPointerLeave();
  });

  window.addEventListener("resize", () => {
    lightRadius = measureLightRadius();
    setLantern(lx, ly);
    if (playing) updateReveal();
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.getAttribute("data-lhn-mode") || "learning"));
  });

  actionBtn?.addEventListener("click", () => {
    if (playing || advanceTimer) return;
    if (gameOver) resetGame();
    const freshRun =
      score === 0 &&
      streak === 0 &&
      (isLearning() ? hearts === MAX_HEARTS : true);
    beginRound(freshRun);
  });

  hintsToggle?.addEventListener("change", () => setHintsEnabled(hintsToggle.checked));
  document.getElementById("lhn-lantern-toggle")?.addEventListener("change", (e) => {
    setLanternOff(e.target.checked);
  });

  loadStudySetPreference();
  updateModeUi();
  loadHintsPreference();
  loadLanternPreference();
  refreshWordSets().then(() => resetGame());
})(typeof window !== "undefined" ? window : globalThis);
