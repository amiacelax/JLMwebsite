/**
 * Teacher hub — Lookup Lexicon flashcard queue (global magnifying-glass rules).
 */
(function (global) {
  let pending = [];
  let currentIndex = 0;
  let tweaking = false;
  let loading = false;
  let bound = false;
  let options = null;
  let doneCount = 0;
  let pendingLoad = false;
  let loadPromise = null;
  let retryTimer = null;

  const KIND_META = {
    merge: { label: "Combine split pieces" },
    custom: { label: "Custom reading & meaning" },
    skip: { label: "Never highlight" },
    force_unit: { label: "Keep whole" },
    lemma: { label: "Dictionary redirect" },
  };

  function setStatus(message) {
    const el = document.getElementById("hw-lookup-lexicon-status");
    if (el) el.textContent = message || "";
  }

  function clearLoadRetry() {
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
  }

  function isPanelActive() {
    const panel = document.getElementById("hw-teacher-lookup-lexicon");
    return Boolean(panel && !panel.hidden);
  }

  function setPanelVisible(which) {
    const empty = document.getElementById("hw-lookup-lexicon-empty");
    const stage = document.getElementById("hw-lookup-lexicon-stage");
    const loadingEl = document.getElementById("hw-lookup-lexicon-loading");
    if (loadingEl) loadingEl.hidden = which !== "loading";
    if (empty) empty.hidden = which !== "empty";
    if (stage) stage.hidden = which !== "card";
    if (which !== "card") unmountMagnifier();
  }

  function scheduleLoad() {
    pendingLoad = true;
    if (!isPanelActive()) return;
    if (options) {
      void loadQueue();
      return;
    }
    setPanelVisible("loading");
    setStatus("Loading deck…");
    clearLoadRetry();
    let attempts = 0;
    retryTimer = setInterval(() => {
      attempts += 1;
      if (options) {
        clearLoadRetry();
        void loadQueue();
      } else if (attempts >= 60) {
        clearLoadRetry();
        setPanelVisible("empty");
        setStatus("Deck did not load — refresh the page.");
      }
    }, 100);
  }

  function currentCard() {
    return pending[currentIndex] || null;
  }

  function field(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderProgress() {
    const progress = document.getElementById("hw-lookup-lexicon-progress");
    const card = currentCard();
    if (!progress) return;
    if (!card) {
      progress.textContent = doneCount ? doneCount + " decided · deck clear" : "Deck empty";
      return;
    }
    progress.textContent =
      "Card " +
      (currentIndex + 1) +
      " of " +
      pending.length +
      (doneCount ? " · " + doneCount + " decided" : "");
  }

  function playgroundSample() {
    const example = field("hw-lookup-lexicon-example-input")?.value?.trim();
    const word = field("hw-lookup-lexicon-word-input")?.value?.trim();
    return example || word || "";
  }

  function syncPlaygroundText() {
    const textEl = field("hw-lookup-lexicon-playground-text");
    if (!textEl) return;
    textEl.textContent = playgroundSample() || "—";
  }

  function unmountMagnifier() {
    global.HwMagnifyingGlass?.releaseOverride?.();
  }

  async function mountMagnifier() {
    const host = field("hw-lookup-lexicon-playground-host");
    const hintEl = document.querySelector(".hw-lookup-lexicon-playground-wrap__hint");
    if (!host || !isPanelActive() || !playgroundSample()) {
      unmountMagnifier();
      return;
    }
    syncPlaygroundText();

    const mgOpts = {
      force: true,
      skipOnboarding: true,
      autoArm: true,
      silentArm: true,
      armHint: "Click a word in the sentence to test lookup",
      storageKey: "hw-mg-lexicon-lens-v1",
      defaultSnap: "br",
    };

    let attached = global.HwMagnifyingGlass?.attachTo?.(host, mgOpts);
    if (!attached) {
      requestAnimationFrame(() => {
        global.HwMagnifyingGlass?.attachTo?.(host, mgOpts);
      });
    }

    if (hintEl) hintEl.textContent = "Loading dictionary for first lookup…";
    void global.HwMgLexicon?.ensureLoaded?.().catch(() => {});
    void global.HwFuriganaAuto?.ensureTokenizer?.()
      .then(() => {
        if (hintEl && isPanelActive()) {
          hintEl.textContent = "Click words in the sentence below — 字 is armed automatically.";
        }
      })
      .catch(() => {
        if (hintEl && isPanelActive()) {
          hintEl.textContent = "Dictionary still loading — 字 works; first click may take a moment.";
        }
      });
  }

  function fillPlaygroundInputs(card) {
    const wordInput = field("hw-lookup-lexicon-word-input");
    const exampleInput = field("hw-lookup-lexicon-example-input");
    if (wordInput) wordInput.value = card.surface || "";
    if (exampleInput) exampleInput.value = card.example || card.surface || "";
    syncPlaygroundText();
  }

  function mergePiecesText(card) {
    return (card.draft?.mergeSurfaces || []).join(" + ") || card.surface || "";
  }

  function proposedMergeHtml(card) {
    const pieces = (card.draft?.mergeSurfaces || []).filter(Boolean);
    if (pieces.length < 2) {
      return (
        '<p class="hw-lookup-lexicon-proposed-line">' +
        "<strong>Don't split</strong> — keep as one word: " +
        escapeHtml(card.surface || "") +
        "</p>"
      );
    }
    const chips = pieces
      .map((p) => '<span class="hw-lookup-lexicon-chip">' + escapeHtml(p) + "</span>")
      .join('<span class="hw-lookup-lexicon-chip-sep">+</span>');
    return (
      '<p class="hw-lookup-lexicon-proposed-line"><strong>Don\'t split</strong> — combine:</p>' +
      '<div class="hw-lookup-lexicon-merge-visual">' +
      chips +
      '<span class="hw-lookup-lexicon-chip-sep">→</span>' +
      '<span class="hw-lookup-lexicon-chip is-result">' +
      escapeHtml(card.surface || pieces.join("")) +
      "</span></div>"
    );
  }

  function proposedCustomHtml(card) {
    const draft = card.draft || {};
    return (
      '<dl class="hw-lookup-lexicon-facts">' +
      "<div><dt>Reading</dt><dd>" +
      escapeHtml(draft.reading || "—") +
      "</dd></div>" +
      "<div><dt>Meaning</dt><dd>" +
      escapeHtml(draft.definition || "—") +
      "</dd></div></dl>" +
      (draft.forceUnit
        ? '<p class="hw-lookup-lexicon-proposed-line">Also keep whole: <strong>' +
          escapeHtml(draft.forceUnit) +
          "</strong></p>"
        : "")
    );
  }

  function proposedSkipHtml(card) {
    const surface = card.draft?.skipSurface || card.surface || "";
    return (
      '<p class="hw-lookup-lexicon-proposed-line">' +
      "<strong>Never highlight</strong> — " +
      escapeHtml(surface) +
      "</p>"
    );
  }

  function proposedForceHtml(card) {
    const surface = card.draft?.forceUnit || card.surface || "";
    return (
      '<p class="hw-lookup-lexicon-proposed-line">' +
      "<strong>Keep whole</strong> — " +
      escapeHtml(surface) +
      "</p>"
    );
  }

  function proposedLemmaHtml(card) {
    const draft = card.draft || {};
    const surface = draft.lemmaSurface || card.surface || "";
    const query = draft.lemmaQuery || "";
    return (
      '<div class="hw-lookup-lexicon-lemma-visual">' +
      '<span class="hw-lookup-lexicon-chip is-target">' +
      escapeHtml(surface) +
      "</span>" +
      '<span class="hw-lookup-lexicon-chip-sep">→ Jisho:</span>' +
      '<span class="hw-lookup-lexicon-chip is-result">' +
      escapeHtml(query) +
      "</span></div>"
    );
  }

  function renderProposedPanel(card) {
    const el = field("hw-lookup-lexicon-proposed");
    if (!el) return;
    if (card.kind === "merge") el.innerHTML = proposedMergeHtml(card);
    else if (card.kind === "custom") el.innerHTML = proposedCustomHtml(card);
    else if (card.kind === "skip") el.innerHTML = proposedSkipHtml(card);
    else if (card.kind === "force_unit") el.innerHTML = proposedForceHtml(card);
    else if (card.kind === "lemma") el.innerHTML = proposedLemmaHtml(card);
    else el.innerHTML = '<p class="hw-lookup-lexicon-proposed-line">Review this card.</p>';
  }

  function renderTweakPanel(card) {
    const wrap = field("hw-lookup-lexicon-tweak-wrap");
    const tweakBtn = field("hw-lookup-lexicon-tweak-btn");
    if (!wrap || !card) return;

    const draft = card.draft || {};
    const surface = card.surface || "";
    let tweakHtml = "";
    const needsTweak =
      card.kind === "merge" ||
      card.kind === "custom" ||
      card.kind === "lemma" ||
      card.kind === "force_unit";

    if (card.kind === "merge") {
      tweakHtml =
        '<label class="hw-lookup-lexicon-tweak-field">Pieces (only if wrong)' +
        '<input type="text" id="hw-lookup-lexicon-merge" autocomplete="off" value="' +
        escapeHtml(mergePiecesText(card)) +
        '"></label>';
    } else if (card.kind === "custom") {
      tweakHtml =
        '<label class="hw-lookup-lexicon-tweak-field">Reading' +
        '<input type="text" id="hw-lookup-lexicon-reading" autocomplete="off" value="' +
        escapeHtml(draft.reading || "") +
        '"></label>' +
        '<label class="hw-lookup-lexicon-tweak-field">Meaning' +
        '<input type="text" id="hw-lookup-lexicon-definition" autocomplete="off" value="' +
        escapeHtml(draft.definition || "") +
        '"></label>' +
        '<label class="hw-lookup-lexicon-tweak-check">' +
        '<input type="checkbox" id="hw-lookup-lexicon-keep-whole"' +
        (draft.forceUnit ? " checked" : "") +
        "> Also keep whole (don't split)</label>";
    } else if (card.kind === "force_unit") {
      tweakHtml =
        '<label class="hw-lookup-lexicon-tweak-field">Word' +
        '<input type="text" id="hw-lookup-lexicon-force" autocomplete="off" value="' +
        escapeHtml(draft.forceUnit || surface) +
        '"></label>';
    } else if (card.kind === "lemma") {
      tweakHtml =
        '<label class="hw-lookup-lexicon-tweak-field">Student clicks' +
        '<input type="text" id="hw-lookup-lexicon-lemma-surface" autocomplete="off" value="' +
        escapeHtml(draft.lemmaSurface || surface) +
        '"></label>' +
        '<label class="hw-lookup-lexicon-tweak-field">Jisho searches' +
        '<input type="text" id="hw-lookup-lexicon-lemma-query" autocomplete="off" value="' +
        escapeHtml(draft.lemmaQuery || "") +
        '"></label>';
    }

    wrap.innerHTML = tweakHtml ? '<div class="hw-lookup-lexicon-tweak">' + tweakHtml + "</div>" : "";
    wrap.hidden = !needsTweak || !tweaking;
    if (tweakBtn) {
      tweakBtn.hidden = !needsTweak;
      tweakBtn.textContent = tweaking ? "Hide edit" : "Edit";
    }
  }

  function renderCard() {
    const card = currentCard();
    renderProgress();

    if (!card) {
      setPanelVisible("empty");
      return;
    }

    setPanelVisible("card");

    const meta = KIND_META[card.kind] || { label: card.kind || "Review" };
    const kindEl = field("hw-lookup-lexicon-kind");
    const noteEl = field("hw-lookup-lexicon-note");
    if (kindEl) kindEl.textContent = meta.label;

    if (noteEl) {
      const note = String(card.note || "").trim();
      noteEl.textContent = note;
      noteEl.hidden = !note;
    }

    fillPlaygroundInputs(card);
    renderProposedPanel(card);
    renderTweakPanel(card);
    void mountMagnifier();
  }

  async function loadQueueInner() {
    clearLoadRetry();
    pendingLoad = false;
    const session = options?.getTeacherSession?.();
    if (!session?.username) {
      setStatus("Teacher login required.");
      setPanelVisible("empty");
      return;
    }

    loading = true;
    setPanelVisible("loading");
    setStatus("Loading deck…");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(
        "/api/mg-lexicon/queue?teacherUsername=" + encodeURIComponent(session.username),
        { signal: controller.signal }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load queue.");
      pending = data.pending || [];
      doneCount = data.doneCount || 0;
      if (currentIndex >= pending.length) currentIndex = 0;
      tweaking = false;
      renderCard();
      setStatus(
        pending.length
          ? "Test with 字 on the left — Save rule when lookup looks right."
          : "All caught up."
      );
    } catch (err) {
      setPanelVisible("empty");
      setStatus(
        err && err.name === "AbortError"
          ? "Deck load timed out — try again."
          : err.message || "Could not load queue."
      );
    } finally {
      clearTimeout(timeoutId);
      loading = false;
    }
  }

  function loadQueue() {
    if (loadPromise) return loadPromise;
    loadPromise = loadQueueInner().finally(() => {
      loadPromise = null;
    });
    return loadPromise;
  }

  function collectSubmitPayload(card) {
    const payload = {
      teacherUsername: options.getTeacherSession().username,
      cardId: card.id,
      kind: card.kind,
      surface: card.surface,
    };
    const draft = card.draft || {};

    if (card.kind === "custom") {
      payload.reading =
        field("hw-lookup-lexicon-reading")?.value?.trim() || draft.reading || "";
      payload.definition =
        field("hw-lookup-lexicon-definition")?.value?.trim() || draft.definition || "";
      const keepWhole = field("hw-lookup-lexicon-keep-whole")?.checked;
      payload.forceUnit = draft.forceUnit || (keepWhole ? card.surface : "");
    } else if (card.kind === "merge") {
      const raw = field("hw-lookup-lexicon-merge")?.value || mergePiecesText(card) || "";
      payload.mergeSurfaces = raw
        .split(/[+＋/／]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (payload.mergeSurfaces.length < 2 && draft.mergeSurfaces?.length >= 2) {
        payload.mergeSurfaces = draft.mergeSurfaces.slice();
      }
    } else if (card.kind === "skip") {
      payload.skipSurface = draft.skipSurface || card.surface;
    } else if (card.kind === "force_unit") {
      payload.forceUnit =
        field("hw-lookup-lexicon-force")?.value?.trim() || draft.forceUnit || card.surface;
    } else if (card.kind === "lemma") {
      payload.lemmaSurface =
        field("hw-lookup-lexicon-lemma-surface")?.value?.trim() ||
        draft.lemmaSurface ||
        card.surface;
      payload.lemmaQuery =
        field("hw-lookup-lexicon-lemma-query")?.value?.trim() || draft.lemmaQuery || "";
    }

    return payload;
  }

  async function submitCurrent() {
    const card = currentCard();
    if (!card || loading) return;

    loading = true;
    setStatus("Saving…");
    try {
      const res = await fetch("/api/mg-lexicon/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectSubmitPayload(card)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed.");

      await global.HwMgLexicon?.ensureLoaded?.();
      const lexRes = await fetch("/api/mg-lexicon");
      const lexData = lexRes.ok ? await lexRes.json() : null;
      if (lexData?.overlay) global.HwMgLexicon.applyGlobalOverlay(lexData.overlay);

      options?.showToast?.("Saved — magnifying glass updated.");
      pending.splice(currentIndex, 1);
      if (currentIndex >= pending.length) currentIndex = 0;
      doneCount += 1;
      tweaking = false;
      renderCard();
      setStatus(data.remaining ? data.remaining + " cards left." : "Deck clear!");
    } catch (err) {
      setStatus(err.message || "Could not save.");
    } finally {
      loading = false;
    }
  }

  async function addCard() {
    const surface = field("hw-lookup-lexicon-add-surface")?.value?.trim();
    if (!surface || loading) return;
    const session = options?.getTeacherSession?.();
    if (!session?.username) return;

    loading = true;
    setStatus("Adding…");
    try {
      const res = await fetch("/api/mg-lexicon/add-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: session.username,
          surface,
          example: surface,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add card.");
      field("hw-lookup-lexicon-add-surface").value = "";
      await loadQueue();
      currentIndex = 0;
      options?.showToast?.("Card added.");
    } catch (err) {
      setStatus(err.message || "Could not add card.");
    } finally {
      loading = false;
    }
  }

  function onPlaygroundInput() {
    syncPlaygroundText();
    void mountMagnifier();
  }

  function bindControls() {
    if (bound) return;
    bound = true;

    field("hw-lookup-lexicon-word-input")?.addEventListener("input", onPlaygroundInput);
    field("hw-lookup-lexicon-example-input")?.addEventListener("input", onPlaygroundInput);

    field("hw-lookup-lexicon-tweak-btn")?.addEventListener("click", () => {
      tweaking = !tweaking;
      renderTweakPanel(currentCard());
    });

    field("hw-lookup-lexicon-submit-btn")?.addEventListener("click", () => {
      void submitCurrent();
    });

    field("hw-lookup-lexicon-next-btn")?.addEventListener("click", () => {
      if (!pending.length) return;
      currentIndex = (currentIndex + 1) % pending.length;
      tweaking = false;
      renderCard();
    });

    field("hw-lookup-lexicon-add-btn")?.addEventListener("click", () => {
      void addCard();
    });

    field("hw-lookup-lexicon-add-surface")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        void addCard();
      }
    });
  }

  function init(opts) {
    options = opts || {};
    bindControls();
    if (isPanelActive() || pendingLoad) scheduleLoad();
  }

  function reloadIfNeeded() {
    if (!isPanelActive()) {
      unmountMagnifier();
      return;
    }
    scheduleLoad();
  }

  global.HwTeacherLookupLexicon = { init, reloadIfNeeded };
})(window);
