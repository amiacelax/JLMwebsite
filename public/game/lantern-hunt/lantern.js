/**
 * Lantern Word Hunt — full Japanese words in the dark; match the reading prompt.
 * Learning: no timer, 3 lives.
 * Time attack: 14 rounds, 5 finds per round, scaling board size and timer bonuses.
 */
(function (global) {
  const DEMO_WORDS = [
    { word: "来る", reading: "くる", en: "to come" },
    { word: "来ます", reading: "きます", en: "to come (polite)" },
    { word: "行く", reading: "いく", en: "to go" },
    { word: "行きます", reading: "いきます", en: "to go (polite)" },
    { word: "食べる", reading: "たべる", en: "to eat" },
    { word: "食べます", reading: "たべます", en: "to eat (polite)" },
    { word: "飲む", reading: "のむ", en: "to drink" },
    { word: "飲みます", reading: "のみます", en: "to drink (polite)" },
    { word: "見る", reading: "みる", en: "to see" },
    { word: "見ます", reading: "みます", en: "to see (polite)" },
    { word: "聞く", reading: "きく", en: "to hear / ask" },
    { word: "話す", reading: "はなす", en: "to speak" },
    { word: "読む", reading: "よむ", en: "to read" },
    { word: "書く", reading: "かく", en: "to write" },
    { word: "買う", reading: "かう", en: "to buy" },
    { word: "売る", reading: "うる", en: "to sell" },
    { word: "休む", reading: "やすむ", en: "to rest" },
    { word: "する", reading: "する", en: "to do" },
    { word: "します", reading: "します", en: "to do (polite)" },
    { word: "雨", reading: "あめ", en: "rain" },
    { word: "雪", reading: "ゆき", en: "snow" },
    { word: "犬", reading: "いぬ", en: "dog" },
    { word: "猫", reading: "ねこ", en: "cat" },
    { word: "鳥", reading: "とり", en: "bird" },
    { word: "魚", reading: "さかな", en: "fish" },
    { word: "花", reading: "はな", en: "flower" },
    { word: "山", reading: "やま", en: "mountain" },
    { word: "海", reading: "うみ", en: "sea" },
    { word: "川", reading: "かわ", en: "river" },
    { word: "水", reading: "みず", en: "water" },
    { word: "火", reading: "ひ", en: "fire" },
    { word: "木", reading: "き", en: "tree" },
    { word: "本", reading: "ほん", en: "book" },
    { word: "紙", reading: "かみ", en: "paper" },
    { word: "車", reading: "くるま", en: "car" },
    { word: "電車", reading: "でんしゃ", en: "train" },
    { word: "駅", reading: "えき", en: "station" },
    { word: "道", reading: "みち", en: "road" },
    { word: "店", reading: "みせ", en: "shop" },
    { word: "学校", reading: "がっこう", en: "school" },
    { word: "勉強", reading: "べんきょう", en: "study" },
    { word: "友達", reading: "ともだち", en: "friend" },
    { word: "人", reading: "ひと", en: "person" },
    { word: "手", reading: "て", en: "hand" },
    { word: "目", reading: "め", en: "eye" },
    { word: "口", reading: "くち", en: "mouth" },
    { word: "今日", reading: "きょう", en: "today" },
    { word: "明日", reading: "あした", en: "tomorrow" },
    { word: "昨日", reading: "きのう", en: "yesterday" },
    { word: "日本", reading: "にほん", en: "Japan" },
    { word: "日本語", reading: "にほんご", en: "Japanese language" },
    { word: "天気", reading: "てんき", en: "weather" },
    { word: "料理", reading: "りょうり", en: "cooking / dish" },
    { word: "新しい", reading: "あたらしい", en: "new" },
    { word: "古い", reading: "ふるい", en: "old" },
    { word: "大きい", reading: "おおきい", en: "big" },
    { word: "小さい", reading: "ちいさい", en: "small" },
    { word: "高い", reading: "たかい", en: "tall / expensive" },
    { word: "安い", reading: "やすい", en: "cheap" },
    { word: "白い", reading: "しろい", en: "white" },
    { word: "赤い", reading: "あかい", en: "red" },
    { word: "青い", reading: "あおい", en: "blue" },
    { word: "黒い", reading: "くろい", en: "black" },
    { word: "楽しい", reading: "たのしい", en: "fun" },
    { word: "美味しい", reading: "おいしい", en: "delicious" },
    { word: "静か", reading: "しずか", en: "quiet" },
    { word: "元気", reading: "げんき", en: "healthy / energetic" },
    { word: "便利", reading: "べんり", en: "convenient" },
    { word: "好き", reading: "すき", en: "to like" },
    { word: "嫌い", reading: "きらい", en: "to dislike" },
  ];

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
  const studySetButtons = [...document.querySelectorAll("[data-lhn-studyset]")];
  const hintsToggle = document.getElementById("lhn-hints-toggle");
  const clearEl = document.getElementById("lhn-clear");
  const fireworksEl = document.getElementById("lhn-fireworks");
  const clearScoreEl = document.getElementById("lhn-clear-score");

  let gameMode = "learning";
  let studySet = "demo";
  let hintsEnabled = false;
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

  function isLearning() {
    return gameMode === "learning";
  }

  function isTimeAttack() {
    return gameMode === "timeAttack";
  }

  const HINTS_STORAGE_KEY = "lhn-hints-enabled";
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
    return studySet === "n5" ? "JLPT N5 words" : "Demo words";
  }

  function getWords() {
    if (studySet === "n5") {
      const list = global.LanternWordsN5;
      if (!Array.isArray(list) || !list.length) return sanitizeWordList(DEMO_WORDS);
      return sanitizeWordList(list);
    }
    return sanitizeWordList(DEMO_WORDS);
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
      const stored = localStorage.getItem(STUDY_SET_STORAGE_KEY);
      if (stored === "demo" || stored === "n5") studySet = stored;
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
    studySetButtons.forEach((btn) => {
      const pressed = btn.getAttribute("data-lhn-studyset") === studySet;
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
      btn.disabled = settingsLocked();
    });
    const note = document.getElementById("lhn-studyset-note");
    if (note) {
      note.textContent = studySetLabel() + " · " + getWords().length + " entries";
    }
    warnIfN5Missing();
    updateFindLabel();
  }

  function setStudySet(set) {
    if (set !== "demo" && set !== "n5") return;
    if (set === studySet) return;
    studySet = set;
    saveStudySetPreference();
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
      findSubEl.textContent = active
        ? "Shine the dark and tap the matching word"
        : "Press New game when you are ready";
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
  }

  function pointerToPercent(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
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
    if (stageHint) stageHint.textContent = "Move mouse or finger to light the dark";
  }

  function onPointerMove(e) {
    if (!stage) return;
    const p = pointerToPercent(e.clientX, e.clientY);
    setLantern(p.x, p.y);
    pointerInside = true;
    stage.classList.add("lhn-stage--lit");
  }

  function onPointerLeave() {
    pointerInside = false;
    if (!playing) stage.classList.remove("lhn-stage--lit");
  }

  stage?.addEventListener("pointerenter", onPointerMove);
  stage?.addEventListener("pointermove", onPointerMove);
  stage?.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") stage.setPointerCapture(e.pointerId);
    onPointerMove(e);
  });
  stage?.addEventListener("pointerup", onPointerMove);
  stage?.addEventListener("pointerleave", onPointerLeave);
  stage?.addEventListener("pointercancel", onPointerLeave);

  window.addEventListener("resize", () => {
    lightRadius = measureLightRadius();
    setLantern(lx, ly);
    if (playing) updateReveal();
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.getAttribute("data-lhn-mode") || "learning"));
  });

  studySetButtons.forEach((btn) => {
    btn.addEventListener("click", () => setStudySet(btn.getAttribute("data-lhn-studyset") || "demo"));
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

  loadStudySetPreference();
  updateModeUi();
  loadHintsPreference();
  resetGame();
})(typeof window !== "undefined" ? window : globalThis);
