/**
 * Lantern Word Hunt — full Japanese words in the dark; match the English prompt.
 */
(function () {
  const WORDS = [
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

  const WORD_SECONDS = 30;
  const MAX_HEARTS = 3;
  const CHOICES = 5;
  const STAGE_CENTER = { x: 50, y: 40 };
  const REVEAL_THRESHOLD = 0.72;
  const POINTS_BASE = 100;
  const POINTS_PER_SECOND = 3;
  const MIN_DIST = 92;

  const stage = document.getElementById("lhn-stage");
  const wordsEl = document.getElementById("lhn-words");
  const floatsEl = document.getElementById("lhn-floats");
  const veil = document.getElementById("lhn-veil");
  const glow = document.getElementById("lhn-glow");
  const scoreEl = document.getElementById("lhn-score");
  const readingEl = document.getElementById("lhn-target-reading");
  const meaningEl = document.getElementById("lhn-target-meaning");
  const findSubEl = document.getElementById("lhn-find-sub");
  const timerEl = document.getElementById("lhn-timer");
  const toastEl = document.getElementById("lhn-toast");
  const actionBtn = document.getElementById("lhn-action");
  const heartsEl = document.getElementById("lhn-hearts");
  const stageHint = document.getElementById("lhn-stage-hint");
  const findPanel = document.getElementById("lhn-find-panel");

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
  let timeLeft = WORD_SECONDS;
  let rafId = 0;
  let usedAnswersSession = new Set();
  let advanceTimer = null;

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

  function pickRoundSet() {
    let targetPool = WORDS.filter((item) => !usedAnswersSession.has(wordKey(item)));
    if (targetPool.length === 0) {
      usedAnswersSession.clear();
      targetPool = [...WORDS];
    }
    const target = targetPool[Math.floor(Math.random() * targetPool.length)];
    usedAnswersSession.add(wordKey(target));

    const choices = [];
    const usedEn = new Set();
    const pool = shuffled(WORDS);

    for (const item of pool) {
      if (choices.length >= CHOICES) break;
      if (usedEn.has(item.en)) continue;
      usedEn.add(item.en);
      choices.push(item);
    }
    while (choices.length < CHOICES) {
      const item = pool.find((w) => !choices.includes(w)) || WORDS[choices.length % WORDS.length];
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

  function showToast(msg, kind) {
    if (!toastEl) return;
    toastEl.hidden = false;
    toastEl.textContent = msg;
    toastEl.className = "lhn-toast lhn-toast--" + (kind || "info");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toastEl.hidden = true;
    }, 2400);
  }

  function renderHearts(damageIndex) {
    if (!heartsEl) return;
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
    if (hearts <= 0) return 0;
    const damageIndex = hearts - 1;
    hearts -= 1;
    renderHearts(damageIndex);
    setTimeout(() => renderHearts(-1), 540);
    return hearts;
  }

  function updateActionButton() {
    if (!actionBtn) return;
    actionBtn.disabled = playing || Boolean(advanceTimer);
    if (playing || advanceTimer) return;
    if (gameOver) {
      actionBtn.textContent = "New game";
      return;
    }
    actionBtn.textContent =
      score > 0 || hearts < MAX_HEARTS ? "Continue" : "New game";
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = String(score);
    if (timerEl) timerEl.textContent = String(timeLeft);
  }

  function endGameOver() {
    gameOver = true;
    playing = false;
    stopTimers();
    fadeAllWords();
    stage.classList.remove("lhn-stage--playing", "lhn-stage--lit");
    setFindPrompt(null, false);
    showFloatText(STAGE_CENTER, "ゲームオーバー", "over");
    showFloatText({ x: 50, y: 54 }, "Score " + score, "over-sub");
    if (stageHint) stageHint.textContent = "Out of lives — press New game";
    updateHud();
    updateActionButton();
  }

  function scheduleAfterMistake(fromTimeout) {
    if (hearts <= 0) {
      clearTimeout(advanceTimer);
      advanceTimer = setTimeout(() => {
        advanceTimer = null;
        endGameOver();
      }, 500);
      return;
    }
    if (!fromTimeout) return;
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      beginRound(false);
    }, 1400);
  }

  function startWordTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    timerId = setInterval(() => {
      timeLeft -= 1;
      updateHud();
      if (timeLeft <= 0) {
        clearInterval(timerId);
        timerId = null;
        onWordTimeout();
      }
    }, 1000);
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

  function placeChoices(choices) {
    const rect = stage.getBoundingClientRect();
    const placed = [];

    choices.forEach((item) => {
      const padX = item.word.length >= 4 ? 16 : 12;
      const padY = 14;
      let x = 50;
      let y = 50;
      let ok = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        x = padX + Math.random() * (100 - padX * 2);
        y = padY + Math.random() * (100 - padY * 2);
        ok = placed.every((p) => distPct(x, y, p.x, p.y, rect) >= MIN_DIST);
        if (ok) break;
      }
      placed.push({ x, y, item });
    });
    return placed;
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
      btn.title = p.item.reading + " — " + p.item.en;
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

  function onWordClick(btn, item) {
    if (!playing || btn.classList.contains("lhn-word--fading")) return;
    if (!btn.classList.contains("lhn-word--ready")) return;

    const isTarget = targetEntry && item.word === targetEntry.item.word;

    if (!isTarget) {
      const wrongEntry = roundChoices.find((w) => w.el === btn);
      if (wrongEntry) showFloatText(wrongEntry, "ちがう！", "miss");
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
      scheduleAfterMistake(false);
      return;
    }

    stopTimers();
    const bonus = timeLeft * POINTS_PER_SECOND;
    const gained = POINTS_BASE + bonus;
    score += gained;
    streak += 1;

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

  function stopTimers(keepAdvance) {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (!keepAdvance && advanceTimer) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }
  }

  function onWordTimeout() {
    if (!playing) return;
    playing = false;
    stopTimers();
    fadeAllWords();
    streak = 0;
    stage.classList.remove("lhn-stage--playing", "lhn-stage--lit");
    setFindPrompt(targetEntry ? targetEntry.item : null, false);
    showFloatText(STAGE_CENTER, "時間切れ！", "timeout");
    if (stageHint && targetEntry) {
      stageHint.textContent =
        "Answer: " + targetEntry.item.word + " · " + targetEntry.item.reading;
    }
    loseHeart();
    updateHud();
    updateActionButton();
    scheduleAfterMistake(true);
  }

  function beginRound(showStart) {
    if (!stage || !wordsEl || gameOver) return;

    stopTimers();
    playing = true;
    timeLeft = WORD_SECONDS;
    lightRadius = measureLightRadius();
    setLantern(50, 50);
    pointerInside = false;

    const { choices, target } = pickRoundSet();
    spawnBoard(choices, target);
    setFindPrompt(target, true);
    updateActionButton();

    stage.classList.add("lhn-stage--playing");
    if (stageHint) stageHint.textContent = "Find: " + target.word;

    updateHud();
    if (showStart) {
      showFloatText(STAGE_CENTER, "スタート！", "start");
    }

    startWordTimer();
    rafId = requestAnimationFrame(tick);
  }

  function resetGame() {
    stopTimers();
    playing = false;
    gameOver = false;
    score = 0;
    streak = 0;
    hearts = MAX_HEARTS;
    timeLeft = WORD_SECONDS;
    usedAnswersSession.clear();
    clearBoard();
    stage.classList.remove("lhn-stage--playing", "lhn-stage--lit");
    pointerInside = false;
    setLantern(50, 50);
    setFindPrompt(null, false);
    renderHearts(-1);
    updateHud();
    updateActionButton();
    if (stageHint) stageHint.textContent = "Move mouse or finger to light the dark";
    if (toastEl) toastEl.hidden = true;
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

  actionBtn?.addEventListener("click", () => {
    if (playing || advanceTimer) return;
    if (gameOver) resetGame();
    beginRound(score === 0 && streak === 0 && hearts === MAX_HEARTS);
  });

  resetGame();
})();
