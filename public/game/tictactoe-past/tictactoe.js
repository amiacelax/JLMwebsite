/**
 * Tic Tac Toe — conjugation to place each mark (past, て-form, い/な-adjectives).
 * Player: X · Computer: O
 */
(function () {
  function normalizeRuby(s) {
    return String(s || "")
      .trim()
      .normalize("NFKC")
      .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }

  function splitWordParts(label) {
    if (label.endsWith("る")) {
      const stem = label.slice(0, -1);
      if (stem && /[\u4e00-\u9fff々]/.test(stem)) {
        return { kanji: stem, surface: "る" };
      }
    }
    const m = label.match(/^([\u4e00-\u9fff々]+)([\u3041-\u309fー]*)$/);
    if (m) return { kanji: m[1], surface: m[2] };
    return { kanji: label, surface: "" };
  }

  /** @param {string|null} kanjiRt — furigana for the kanji (only), e.g. 美味しい → おい */
  function buildRuby(label, kanjiRt) {
    if (!kanjiRt) return [{ text: label }];
    if (!/[\u4e00-\u9fff々]/.test(label)) return [{ text: label }];

    const { kanji, surface } = splitWordParts(label);
    if (!kanji || /^[\u3041-\u309fー]+$/.test(kanji)) return [{ text: label }];

    const segs = [{ text: kanji, rt: kanjiRt }];
    if (surface) segs.push({ text: surface });
    return segs;
  }

  function jp(id, category, kind, label, kanjiRt, answers) {
    return {
      id,
      category,
      kind,
      label,
      kanjiRt,
      ruby: buildRuby(label, kanjiRt),
      answers,
    };
  }

  const PROMPTS = [
    // Verbs — plain past
    jp("v-nomu-p", "past", "verb", "飲む", "の", ["のんだ", "飲んだ"]),
    jp("v-iu-p", "past", "verb", "言う", "い", ["いった", "言った"]),
    jp("v-yaru-p", "past", "verb", "やる", null, ["やった"]),
    jp("v-taberu-p", "past", "verb", "食べる", "たべ", ["たべた", "食べた"]),
    jp("v-iku-p", "past", "verb", "行く", "い", ["いった", "行った"]),
    jp("v-kuru-p", "past", "verb", "来る", "き", ["きた", "来た"]),
    jp("v-suru-p", "past", "verb", "する", null, ["した"]),
    jp("v-kau-p", "past", "verb", "買う", "か", ["かった", "買った"]),
    jp("v-yomu-p", "past", "verb", "読む", "よ", ["よんだ", "読んだ"]),
    jp("v-kaku-p", "past", "verb", "書く", "か", ["かいた", "書いた"]),
    jp("v-hanasu-p", "past", "verb", "話す", "はな", ["はなした", "話した"]),
    jp("v-miru-p", "past", "verb", "見る", "み", ["みた", "見た"]),
    jp("v-kaeru-p", "past", "verb", "帰る", "かえ", ["かえった", "帰った"]),
    jp("v-au-p", "past", "verb", "会う", "あ", ["あった", "会った"]),
    jp("v-matsu-p", "past", "verb", "待つ", "ま", ["まった", "待った"]),
    jp("v-tsukuru-p", "past", "verb", "作る", "つく", ["つくった", "作った"]),
    jp("v-neru-p", "past", "verb", "寝る", "ね", ["ねた", "寝た"]),
    jp("v-oyogu-p", "past", "verb", "泳ぐ", "およ", ["およいだ", "泳いだ"]),
    // Verbs — て-form
    jp("v-nomu-t", "te", "verb", "飲む", "の", ["のんで", "飲んで"]),
    jp("v-iu-t", "te", "verb", "言う", "い", ["いって", "言って"]),
    jp("v-yaru-t", "te", "verb", "やる", null, ["やって"]),
    jp("v-taberu-t", "te", "verb", "食べる", "たべ", ["たべて", "食べて"]),
    jp("v-iku-t", "te", "verb", "行く", "い", ["いって", "行って"]),
    jp("v-kuru-t", "te", "verb", "来る", "き", ["きて", "来て"]),
    jp("v-suru-t", "te", "verb", "する", null, ["して"]),
    jp("v-kau-t", "te", "verb", "買う", "か", ["かって", "買って"]),
    jp("v-yomu-t", "te", "verb", "読む", "よ", ["よんで", "読んで"]),
    jp("v-kaku-t", "te", "verb", "書く", "か", ["かいて", "書いて"]),
    jp("v-hanasu-t", "te", "verb", "話す", "はな", ["はなして", "話して"]),
    jp("v-miru-t", "te", "verb", "見る", "み", ["みて", "見て"]),
    jp("v-kaeru-t", "te", "verb", "帰る", "かえ", ["かえって", "帰って"]),
    jp("v-au-t", "te", "verb", "会う", "あ", ["あって", "会って"]),
    jp("v-matsu-t", "te", "verb", "待つ", "ま", ["まって", "待って"]),
    jp("v-oyogu-t", "te", "verb", "泳ぐ", "およ", ["およいで", "泳いで"]),
    // い-adjectives — past
    jp("i-oishii-p", "past", "i-adj", "美味しい", "おい", ["おいしかった", "美味しかった"]),
    jp("i-takai-p", "past", "i-adj", "高い", "たか", ["たかかった", "高かった"]),
    jp("i-atui-p", "past", "i-adj", "暑い", "あつ", ["あつかった", "暑かった", "熱かった"]),
    jp("i-hiroi-p", "past", "i-adj", "広い", "ひろ", ["ひろかった", "広かった"]),
    jp("i-samui-p", "past", "i-adj", "寒い", "さむ", ["さむかった", "寒かった"]),
    jp("i-tanoshii-p", "past", "i-adj", "楽しい", "たの", ["たのしかった", "楽しかった"]),
    jp("i-isogashii-p", "past", "i-adj", "忙しい", "いそが", ["いそがしかった", "忙しかった"]),
    jp("i-yasui-p", "past", "i-adj", "安い", "やす", ["やすかった", "安かった"]),
    // い-adjectives — て-form
    jp("i-oishii-t", "te", "i-adj", "美味しい", "おい", ["おいしくて", "美味しくて"]),
    jp("i-takai-t", "te", "i-adj", "高い", "たか", ["たかくて", "高くて"]),
    jp("i-atui-t", "te", "i-adj", "暑い", "あつ", ["あつくて", "暑くて", "熱くて"]),
    jp("i-hiroi-t", "te", "i-adj", "広い", "ひろ", ["ひろくて", "広くて"]),
    jp("i-samui-t", "te", "i-adj", "寒い", "さむ", ["さむくて", "寒くて"]),
    jp("i-tanoshii-t", "te", "i-adj", "楽しい", "たの", ["たのしくて", "楽しくて"]),
    jp("i-yasui-t", "te", "i-adj", "安い", "やす", ["やすくて", "安くて"]),
    // な-adjectives — past (きれい stays hiragana)
    jp("na-shizuka-p", "past", "na-adj", "静か", "しず", ["しずかだった", "静かだった"]),
    jp("na-genki-p", "past", "na-adj", "元気", "げんき", ["げんきだった", "元気だった"]),
    jp("na-kirei-p", "past", "na-adj", "きれい", null, ["きれいだった"]),
    jp("na-benri-p", "past", "na-adj", "便利", "べんり", ["べんりだった", "便利だった"]),
    jp("na-daijobu-p", "past", "na-adj", "大丈夫", "だいじょうぶ", ["だいじょうぶだった", "大丈夫だった"]),
    jp("na-suki-p", "past", "na-adj", "好き", "す", ["すきだった", "好きだった"]),
    // な-adjectives — て-form
    jp("na-shizuka-t", "te", "na-adj", "静か", "しず", ["しずかで", "静かで"]),
    jp("na-genki-t", "te", "na-adj", "元気", "げんき", ["げんきで", "元気で"]),
    jp("na-kirei-t", "te", "na-adj", "きれい", null, ["きれいで"]),
    jp("na-benri-t", "te", "na-adj", "便利", "べんり", ["べんりで", "便利で"]),
    jp("na-daijobu-t", "te", "na-adj", "大丈夫", "だいじょうぶ", ["だいじょうぶで", "大丈夫で"]),
    jp("na-suki-t", "te", "na-adj", "好き", "す", ["すきで", "好きで"]),
  ];

  const CATEGORY_META = {
    past: {
      conjLabel: "Plain past (ta-form)",
      taskHint: "Type the plain past tense, then pick a square.",
      placeholder: "e.g. のんだ",
    },
    te: {
      conjLabel: "て-form",
      taskHint: "Type the て-form, then pick a square.",
      placeholder: "e.g. のんで",
    },
  };

  const KIND_LABEL = {
    verb: "Verb",
    "i-adj": "い-adjective",
    "na-adj": "な-adjective",
  };

  const MODE_META = {
    random: {
      label: "Random",
      toast: "Random mode — all conjugation prompts.",
      filter: () => true,
    },
    verb: {
      label: "Verb past",
      toast: "Verb past mode.",
      filter: (prompt) => prompt.kind === "verb" && prompt.category === "past",
    },
    adjective: {
      label: "Adjective past",
      toast: "Adjective past mode.",
      filter: (prompt) => prompt.kind !== "verb" && prompt.category === "past",
    },
    te: {
      label: "て-form",
      toast: "て-form mode.",
      filter: (prompt) => prompt.category === "te",
    },
  };

  const WINS = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  const boardEl = document.getElementById("ttt-board");
  const cells = boardEl ? [...boardEl.querySelectorAll(".ttt-cell")] : [];
  const formPillEl = document.getElementById("ttt-form-pill");
  const boardWrapEl = document.getElementById("ttt-board-wrap");
  const kindBadgeEl = document.getElementById("ttt-kind-badge");
  const verbEl = document.getElementById("ttt-verb");
  const hintEl = document.getElementById("ttt-hint");
  const revealEl = document.getElementById("ttt-reveal");
  const revealAnswerEl = document.getElementById("ttt-reveal-answer");
  const inputEl = document.getElementById("ttt-input");
  const checkBtn = document.getElementById("ttt-check");
  const toastEl = document.getElementById("ttt-toast");
  const resetBtn = document.getElementById("ttt-reset");
  const conjPanel = document.getElementById("ttt-conj-panel");
  const cpuLine = document.getElementById("ttt-cpu-line");
  const modeButtons = [...document.querySelectorAll("[data-ttt-mode]")];

  let board = Array(9).fill("");
  let phase = "conjugate";
  let currentMode = "random";
  let currentPrompt = null;
  let lastPromptId = "";
  let wrongCount = 0;
  let answerRevealed = false;
  let toastTimer = 0;

  function normalize(s) {
    return String(s || "")
      .trim()
      .normalize("NFKC")
      .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }

  function isAnswerCorrect(answer, prompt) {
    const a = normalize(answer);
    if (!a) return false;
    return prompt.answers.some((p) => normalize(p) === a);
  }

  function primaryAnswer(prompt) {
    return prompt.answers[0];
  }

  function promptsForMode(mode) {
    const meta = MODE_META[mode] || MODE_META.random;
    const prompts = PROMPTS.filter(meta.filter);
    return prompts.length ? prompts : PROMPTS;
  }

  function pickPrompt() {
    let pool = promptsForMode(currentMode);
    if (pool.length > 1 && lastPromptId) {
      pool = pool.filter((p) => p.id !== lastPromptId);
    }
    const item = pool[Math.floor(Math.random() * pool.length)];
    lastPromptId = item.id;
    return item;
  }

  function metaFor(prompt) {
    return CATEGORY_META[prompt.category] || CATEGORY_META.past;
  }

  function showToast(msg, kind) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = "ttt-toast show" + (kind ? " ttt-toast--" + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  function updatePlayerTurnGlow() {
    const playerTurn = phase === "conjugate" || phase === "place";
    if (boardWrapEl) boardWrapEl.classList.toggle("ttt-board-wrap--player-turn", playerTurn);
  }

  function hideReveal() {
    if (revealEl) revealEl.hidden = true;
    answerRevealed = false;
    if (checkBtn) checkBtn.textContent = "Check";
  }

  function renderRubyHtml(ruby) {
    if (!ruby || !ruby.length) return "";
    return ruby
      .map((seg) => {
        if (seg.rt && /[\u4e00-\u9fff々]/.test(seg.text)) {
          return (
            '<ruby class="ttt-ruby">' +
            escapeHtml(seg.text) +
            "<rt>" +
            escapeHtml(seg.rt) +
            "</rt></ruby>"
          );
        }
        if (seg.text) {
          return '<span class="ttt-okuri">' + escapeHtml(seg.text) + "</span>";
        }
        return "";
      })
      .join("");
  }

  function renderPromptHtml(prompt) {
    return '<span class="ttt-verb__dict" lang="ja">' + renderRubyHtml(prompt.ruby) + "</span>";
  }

  function showReveal(answer) {
    answerRevealed = true;
    if (revealEl) revealEl.hidden = false;
    if (revealAnswerEl) revealAnswerEl.textContent = answer;
    if (checkBtn) checkBtn.textContent = "Continue";
    if (hintEl) {
      hintEl.textContent = "Answer shown above — press Continue to place your mark.";
    }
    showToast("Answer: " + answer, "reveal");
  }

  function updateModeButtons() {
    modeButtons.forEach((btn) => {
      const pressed = btn.getAttribute("data-ttt-mode") === currentMode;
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    });
  }

  function setMode(mode) {
    if (!MODE_META[mode] || mode === currentMode) return;
    currentMode = mode;
    updateModeButtons();
    resetGame();
    showToast(MODE_META[mode].toast, "ok");
  }

  function unlockPlacePhase() {
    phase = "place";
    if (inputEl) inputEl.disabled = true;
    if (checkBtn) checkBtn.disabled = true;
    hideReveal();
    if (hintEl) hintEl.textContent = "Click an empty square for X.";
    renderBoard();
  }

  function checkWinner(b) {
    for (const [a, x, c] of WINS) {
      if (b[a] && b[a] === b[x] && b[a] === b[c]) return b[a];
    }
    if (b.every((cell) => cell)) return "draw";
    return null;
  }

  function renderBoard() {
    const winner = checkWinner(board);
    cells.forEach((btn, i) => {
      const v = board[i];
      btn.textContent = v || "";
      btn.classList.toggle("ttt-cell--x", v === "X");
      btn.classList.toggle("ttt-cell--o", v === "O");
      btn.disabled = phase !== "place" || !!v || winner !== null;
      btn.setAttribute("aria-label", v ? "Cell " + (i + 1) + ", " + v : "Empty cell " + (i + 1));
    });
    if (winner === "X") highlightWin("X");
    else if (winner === "O") highlightWin("O");
    else cells.forEach((btn) => btn.classList.remove("ttt-cell--win"));
    updatePlayerTurnGlow();
  }

  function highlightWin(mark) {
    for (const line of WINS) {
      const [a, b, c] = line;
      if (board[a] === mark && board[a] === board[b] && board[a] === board[c]) {
        line.forEach((i) => cells[i].classList.add("ttt-cell--win"));
        return;
      }
    }
  }

  function startPlayerTurn() {
    phase = "conjugate";
    wrongCount = 0;
    hideReveal();
    currentPrompt = pickPrompt();
    const meta = metaFor(currentPrompt);

    if (formPillEl) {
      formPillEl.textContent = meta.conjLabel;
      formPillEl.className =
        "ttt-form-pill" + (currentPrompt.category === "te" ? " ttt-form-pill--te" : "");
    }
    if (kindBadgeEl) {
      kindBadgeEl.textContent = KIND_LABEL[currentPrompt.kind] || currentPrompt.kind;
      kindBadgeEl.className = "ttt-kind-badge ttt-kind-badge--" + currentPrompt.kind.replace("-", "");
    }
    if (verbEl) verbEl.innerHTML = renderPromptHtml(currentPrompt);
    if (hintEl) hintEl.textContent = meta.taskHint;
    if (inputEl) {
      inputEl.value = "";
      inputEl.placeholder = meta.placeholder;
      inputEl.disabled = false;
      inputEl.focus();
    }
    if (checkBtn) {
      checkBtn.disabled = false;
      checkBtn.textContent = "Check";
    }
    if (conjPanel) conjPanel.hidden = false;
    if (cpuLine) cpuLine.hidden = true;
    renderBoard();
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function onConjugateSubmit() {
    if (phase !== "conjugate" || !currentPrompt) return;

    if (answerRevealed) {
      showToast("正解！", "ok");
      unlockPlacePhase();
      return;
    }

    const val = inputEl ? inputEl.value : "";
    if (isAnswerCorrect(val, currentPrompt)) {
      showToast("正解！", "ok");
      unlockPlacePhase();
      return;
    }

    wrongCount += 1;

    if (wrongCount >= 3) {
      showReveal(primaryAnswer(currentPrompt));
      if (inputEl) inputEl.select();
      return;
    }

    if (wrongCount === 2) {
      showToast("惜しい！", "miss");
      if (hintEl) {
        hintEl.innerHTML =
          '<strong class="ttt-hint-warn">One more try and I\u2019ll show you the answer.</strong>';
      }
      if (inputEl) inputEl.select();
      return;
    }

    showToast("惜しい！", "miss");
    if (hintEl) hintEl.textContent = "Not quite — try again.";
    if (inputEl) inputEl.select();
  }

  function onCellClick(index) {
    if (phase !== "place" || board[index]) return;
    board[index] = "X";
    const result = checkWinner(board);
    renderBoard();
    if (result) return endGame(result);

    phase = "cpu";
    if (conjPanel) conjPanel.hidden = true;
    hideReveal();
    updatePlayerTurnGlow();
    cells.forEach((btn) => (btn.disabled = true));
    setTimeout(runCpuTurn, 700);
  }

  function emptyCells(b) {
    const out = [];
    b.forEach((v, i) => {
      if (!v) out.push(i);
    });
    return out;
  }

  function minimax(b, isMax) {
    const w = checkWinner(b);
    if (w === "O") return { score: 10, index: -1 };
    if (w === "X") return { score: -10, index: -1 };
    if (w === "draw") return { score: 0, index: -1 };

    const scores = [];
    for (const i of emptyCells(b)) {
      b[i] = isMax ? "O" : "X";
      const result = minimax(b, !isMax);
      b[i] = "";
      scores.push({ score: result.score, index: i });
    }

    if (isMax) {
      return scores.reduce((best, cur) => (cur.score > best.score ? cur : best));
    }
    return scores.reduce((best, cur) => (cur.score < best.score ? cur : best));
  }

  function cpuPickCell() {
    const move = minimax([...board], true);
    return move.index;
  }

  function runCpuTurn() {
    const prompt = pickPrompt();
    const ans = primaryAnswer(prompt);
    const meta = metaFor(prompt);
    if (cpuLine) {
      cpuLine.hidden = false;
      cpuLine.innerHTML =
        "Computer: <span class=\"ttt-cpu-tag\">" +
        escapeHtml(KIND_LABEL[prompt.kind] || "") +
        "</span> · " +
        escapeHtml(meta.conjLabel) +
        " — " +
        renderPromptHtml(prompt) +
        ' → <span lang="ja"><strong>' +
        escapeHtml(ans) +
        "</strong></span>";
    }

    const idx = cpuPickCell();
    if (idx == null || idx < 0) {
      startPlayerTurn();
      return;
    }

    board[idx] = "O";
    renderBoard();
    const result = checkWinner(board);
    if (result) return endGame(result);

    startPlayerTurn();
  }

  function endGame(result) {
    phase = "over";
    if (conjPanel) conjPanel.hidden = true;
    if (cpuLine) cpuLine.hidden = true;
    hideReveal();
    if (inputEl) inputEl.disabled = true;
    if (checkBtn) checkBtn.disabled = true;
    cells.forEach((btn) => (btn.disabled = true));

    updatePlayerTurnGlow();

    if (result === "X") {
      showToast("You win! おめでとう！", "ok");
    } else if (result === "O") {
      showToast("Computer wins. Try again!", "miss");
    } else {
      showToast("Draw — 引き分け", "ok");
    }
  }

  function resetGame() {
    board = Array(9).fill("");
    lastPromptId = "";
    wrongCount = 0;
    startPlayerTurn();
  }

  checkBtn?.addEventListener("click", onConjugateSubmit);
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onConjugateSubmit();
    }
  });
  cells.forEach((btn, i) => btn.addEventListener("click", () => onCellClick(i)));
  resetBtn?.addEventListener("click", resetGame);
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.getAttribute("data-ttt-mode") || "random"));
  });

  updateModeButtons();
  resetGame();
})();
