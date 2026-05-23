/**
 * Dialogue overlay, clickable Japanese words, home-base panel, observation input.
 */
(function () {
  const vocab = () => window.GAME_DATA.vocabulary;

  const els = {
    overlay: null,
    speaker: null,
    text: null,
    hint: null,
    inputWrap: null,
    input: null,
    submit: null,
    homeBase: null,
    hbWord: null,
    hbMeaning: null,
    hbPatterns: null,
    hbExamples: null,
    hbClose: null,
  };

  let onClose = null;
  let onSubmitAnswer = null;
  let onAdvance = null;

  function init() {
    els.overlay = document.getElementById("dialogue-overlay");
    els.speaker = document.getElementById("dialogue-speaker");
    els.text = document.getElementById("dialogue-text");
    els.hint = document.getElementById("dialogue-hint");
    els.inputWrap = document.getElementById("dialogue-input-wrap");
    els.input = document.getElementById("dialogue-input");
    els.submit = document.getElementById("dialogue-submit");
    els.homeBase = document.getElementById("home-base");
    els.hbWord = document.getElementById("hb-word");
    els.hbMeaning = document.getElementById("hb-meaning");
    els.hbPatterns = document.getElementById("hb-patterns");
    els.hbExamples = document.getElementById("hb-examples");
    els.hbClose = document.getElementById("hb-close");

    if (els.submit) els.submit.addEventListener("click", submitAnswer);
    if (els.input) {
      els.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitAnswer();
      });
    }
    els.hbClose.addEventListener("click", hideHomeBase);
    els.homeBase.addEventListener("click", (e) => {
      if (e.target === els.homeBase) hideHomeBase();
    });

    els.overlay.addEventListener("click", (e) => {
      if (!isOpen()) return;
      if (e.target.closest(".word-link")) return;
      if (!els.homeBase.hidden) return;
      if (onAdvance) onAdvance();
      else close();
    });
  }

  function setAdvanceHandler(fn) {
    onAdvance = fn || null;
  }

  function showHomeBase(word) {
    const entry = vocab()[word];
    if (!entry) return;
    els.hbWord.textContent = word;
    els.hbMeaning.textContent = entry.meaning;
    els.hbPatterns.innerHTML = entry.patterns.map((p) => `<li>${p}</li>`).join("");
    els.hbExamples.innerHTML = entry.examples.map((p) => `<li>${p}</li>`).join("");
    els.homeBase.hidden = false;
  }

  function hideHomeBase() {
    els.homeBase.hidden = true;
  }

  /** Build dialogue HTML with clickable word spans. */
  function renderClickable(line, clickableWords) {
    if (!clickableWords || !clickableWords.length) {
      els.text.textContent = line;
      return;
    }
    let html = line;
    const sorted = [...clickableWords].sort((a, b) => b.length - a.length);
    for (const word of sorted) {
      const idx = html.indexOf(word);
      if (idx === -1) continue;
      const before = html.slice(0, idx);
      const after = html.slice(idx + word.length);
      html =
        before +
        `<button type="button" class="word-link" data-word="${word}">${word}</button>` +
        after;
    }
    els.text.innerHTML = html.replace(/\n/g, "<br>");
    els.text.querySelectorAll(".word-link").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showHomeBase(btn.dataset.word);
      });
    });
  }

  function open(options) {
    const {
      speaker,
      line,
      clickable = [],
      hint = "",
      showInput = false,
      inputPlaceholder = "",
      closeCallback,
      submitCallback,
    } = options;

    onClose = closeCallback || null;
    onSubmitAnswer = submitCallback || null;

    if (speaker) {
      els.speaker.textContent = speaker;
      els.speaker.hidden = false;
    } else {
      els.speaker.textContent = "";
      els.speaker.hidden = true;
    }
    renderClickable(line, clickable);
    if (els.hint) {
      els.hint.textContent = hint;
      els.hint.hidden = true;
    }
    if (els.inputWrap) els.inputWrap.hidden = true;
    if (showInput && els.inputWrap && els.input) {
      els.inputWrap.hidden = false;
      els.input.value = "";
      els.input.placeholder = inputPlaceholder;
      setTimeout(() => els.input.focus(), 50);
    }
    els.overlay.hidden = false;
    hideHomeBase();
  }

  function close() {
    els.overlay.hidden = true;
    hideHomeBase();
    if (onClose) onClose();
    onClose = null;
    onSubmitAnswer = null;
  }

  function submitAnswer() {
    if (onSubmitAnswer && els.input) onSubmitAnswer(els.input.value.trim());
  }

  function isOpen() {
    return !els.overlay.hidden;
  }

  window.DialogueUI = {
    init,
    open,
    close,
    isOpen,
    setAdvanceHandler,
    showHomeBase,
    hideHomeBase,
  };
})();
