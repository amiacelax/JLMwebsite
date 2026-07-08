/**
 * Teacher hub — Lookup Lexicon flashcard queue (global magnifying-glass rules).
 */
(function (global) {
  let pending = [];
  let currentIndex = 0;
  let loading = false;
  let bound = false;
  let options = null;
  let doneCount = 0;
  let pendingLoad = false;
  let loadPromise = null;
  let retryTimer = null;
  let lookupPreviewGen = 0;
  const jishoCache = {};

  const KIND_META = {
    merge: { label: "Merge" },
    split: { label: "Split" },
    custom: { label: "Custom" },
    skip: { label: "Skip" },
    force_unit: { label: "Whole" },
    lemma: { label: "Lemma" },
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
    if (which === "empty") unmountMagnifier();
  }

  function scheduleLoad() {
    pendingLoad = true;
    if (!isPanelActive()) return;
    if (options) {
      void loadQueue();
      return;
    }
    setPanelVisible("loading");
    setStatus("Loading…");
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
      progress.textContent = doneCount ? doneCount + " done" : "Empty";
      return;
    }
    progress.textContent =
      (currentIndex + 1) + "/" + pending.length + (doneCount ? " · " + doneCount + " done" : "");
  }

  function cardExample(card) {
    return String(card?.example || card?.surface || "").trim();
  }

  function syncPlaygroundText(card) {
    const textEl = field("hw-lookup-lexicon-playground-text");
    if (!textEl) return;
    textEl.textContent = cardExample(card) || "—";
  }

  function unmountMagnifier() {
    global.HwMgLexicon?.clearPreview?.();
    global.HwMagnifyingGlass?.releaseOverride?.(true);
  }

  function splitPartsForCard(card) {
    if (!card) return [];
    if (isBad("highlight")) {
      return parseSplit(field("hw-lookup-lexicon-split")?.value || defaultSplitText(card));
    }
    const primary = String(card.surface || "").trim();
    return primary ? [primary] : [];
  }

  async function fetchJishoForSurface(surface, card) {
    const word = String(surface || "").trim();
    if (!word) return { reading: "", definition: "" };

    const custom = global.HwMgLexicon?.CUSTOM?.[word];
    if (custom?.reading || custom?.definition) {
      return { reading: custom.reading || "", definition: custom.definition || "" };
    }

    await global.HwMgLexicon?.ensureLoaded?.().catch(() => {});
    const sentence = cardExample(card);
    let lemma =
      global.HwMgLexicon?.LEMMA_QUERY?.[word] ||
      global.HwMgLexicon?.getPreview?.()?.lemmaQuery?.[word] ||
      null;

    if (!lemma && hasKanji(word) && sentence) {
      try {
        const info = await global.HwMgLexicon?.inspectWordInText?.(sentence, word);
        lemma = info?.jishoQuery || info?.pieces?.[0]?.jishoQuery || null;
      } catch {
        /* ignore */
      }
    }

    const resolved = global.HwMgLexicon?.resolve?.(word, lemma) || {};
    const unit = {
      surface: word,
      lemma,
      reading: resolved.reading || "",
      definition: resolved.definition || "",
      query: resolved.query || word,
    };

    if (unit.definition) return { reading: unit.reading, definition: unit.definition };

    try {
      const fetched = await global.HwMagnifyingGlass?.fetchLookup?.(unit);
      return {
        reading: fetched?.reading || unit.reading || "",
        definition: fetched?.definition || unit.definition || "",
      };
    } catch {
      return { reading: unit.reading || "", definition: unit.definition || "" };
    }
  }

  async function fillJishoValues(card, words) {
    const gen = ++lookupPreviewGen;
    Object.keys(jishoCache).forEach((key) => delete jishoCache[key]);

    words.forEach((word) => {
      document
        .querySelectorAll('.hw-lookup-lexicon-jisho-val[data-surface="' + CSS.escape(word.surface) + '"]')
        .forEach((el) => {
          el.classList.add("is-loading");
          el.textContent = "…";
        });
    });

    const results = await Promise.all(
      words.map(async (word) => ({
        word,
        fetched: await fetchJishoForSurface(word.surface, card),
      }))
    );

    if (gen !== lookupPreviewGen || currentCard() !== card) return;

    for (const { word, fetched } of results) {
      jishoCache[word.surface] = fetched;
      document
        .querySelectorAll('.hw-lookup-lexicon-jisho-val[data-surface="' + CSS.escape(word.surface) + '"]')
        .forEach((el) => {
          el.classList.remove("is-loading");
          el.textContent =
            el.dataset.field === "reading"
              ? fetched.reading || "—"
              : fetched.definition || "—";
        });
    }
  }

  function refreshDraftPreviews(card) {
    const words = glossWordsForCard(card);
    if (words.length) void fillJishoValues(card, words);
  }

  function applyLexiconPreview(card) {
    if (!card || !isPanelActive()) {
      global.HwMgLexicon?.clearPreview?.();
      refreshDraftPreviews(card);
      return;
    }

    if (!isBad("highlight")) {
      global.HwMgLexicon?.clearPreview?.();
      refreshDraftPreviews(card);
      global.HwMagnifyingGlass?.refresh?.();
      return;
    }

    const parts = parseSplit(field("hw-lookup-lexicon-split")?.value || defaultSplitText(card));
    if (!parts.length) {
      global.HwMgLexicon?.clearPreview?.();
      refreshDraftPreviews(card);
      return;
    }

    const { entries } = collectGlossEntries(card);
    const preview = {
      custom: { ...entries },
    };

    if (card.kind === "merge") {
      preview.mergeSurfaces = parts;
    } else if (card.kind === "split" || (card.kind !== "skip" && card.kind !== "force_unit")) {
      preview.segmentSurfaces = parts;
    }

    global.HwMgLexicon?.setPreview?.(preview);
    refreshDraftPreviews(card);
    global.HwMagnifyingGlass?.refresh?.();

    void buildExtraLemma(parts, card, cardExample(card)).then((lemmaQuery) => {
      if (currentCard() !== card || !isBad("highlight")) return;
      if (Object.keys(lemmaQuery).length) {
        preview.lemmaQuery = lemmaQuery;
        global.HwMgLexicon?.setPreview?.({ ...preview, lemmaQuery });
        global.HwMagnifyingGlass?.refresh?.();
        refreshDraftPreviews(card);
      }
    });
  }

  function mountMagnifier(card) {
    const host = field("hw-lookup-lexicon-playground-host");
    const sample = cardExample(card);
    if (!host || !isPanelActive() || !sample) {
      unmountMagnifier();
      return;
    }
    syncPlaygroundText(card);

    const mgOpts = {
      force: true,
      skipOnboarding: true,
      autoArm: true,
      silentArm: true,
      armHint: "",
      storageKey: "hw-mg-lexicon-lens-v1",
      defaultSnap: "tr",
    };

    let attachAttempts = 0;
    const maxAttempts = 16;

    function tryAttach() {
      if (!isPanelActive() || currentCard() !== card) return;
      attachAttempts += 1;
      syncPlaygroundText(card);
      const attached = global.HwMagnifyingGlass?.attachTo?.(host, mgOpts);
      if (attached) {
        global.HwMagnifyingGlass?.refresh?.();
        applyLexiconPreview(card);
        return;
      }
      if (attachAttempts < maxAttempts) {
        requestAnimationFrame(tryAttach);
      }
    }

    tryAttach();

    void global.HwMgLexicon?.ensureLoaded?.().catch(() => {});
    void global.HwFuriganaAuto?.ensureTokenizer?.().catch(() => {});
  }

  function defaultSplitText(card) {
    const draft = card?.draft || {};
    if (card?.kind === "merge" && draft.mergeSurfaces?.length >= 2) {
      return draft.mergeSurfaces.join("＋");
    }
    if (card?.kind === "split" && draft.splitSurfaces?.length >= 2) {
      return draft.splitSurfaces.join("＋");
    }
    if (card?.kind === "custom" && card.surface === "たい") {
      return "行き＋たい";
    }
    if (card?.kind === "lemma" && draft.lemmaSurface) {
      return draft.lemmaSurface;
    }
    if (card?.kind === "force_unit") {
      return draft.forceUnit || card.surface || "";
    }
    return card?.surface || "";
  }

  function parseSplit(raw) {
    return String(raw || "")
      .split(/[+＋/／]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function hasKanji(str) {
    return /[\u4e00-\u9fff]/.test(String(str || ""));
  }

  function isBad(name) {
    const el = field("hw-lookup-lexicon-" + name + "-bad");
    return Boolean(el?.checked);
  }

  function setGood(name) {
    const good = field("hw-lookup-lexicon-" + name + "-good");
    if (good) good.checked = true;
    syncFixVisibility();
  }

  function syncFixVisibility() {
    const splitWrap = field("hw-lookup-lexicon-split-wrap");
    const lemmaWrap = field("hw-lookup-lexicon-lemma-wrap");
    if (splitWrap) splitWrap.hidden = !isBad("highlight");
    if (lemmaWrap) lemmaWrap.hidden = !isBad("lemma");
    renderPieceSections(currentCard());
    applyLexiconPreview(currentCard());
  }

  function glossDraftForSurface(surface, cardDraft) {
    const word = String(surface || "").trim();
    if (!word) return { reading: "", definition: "" };
    if (cardDraft?.reading || cardDraft?.definition) {
      if (word === (currentCard()?.surface || "")) {
        return {
          reading: cardDraft.reading || "",
          definition: cardDraft.definition || "",
        };
      }
    }
    const custom = global.HwMgLexicon?.CUSTOM?.[word];
    return {
      reading: custom?.reading || "",
      definition: custom?.definition || "",
    };
  }

  function glossWordsForCard(card) {
    if (!card) return [];
    const draft = card.draft || {};
    const primary = String(card.surface || "").trim();
    if (!primary) return [];

    if (isBad("highlight")) {
      const parts = parseSplit(field("hw-lookup-lexicon-split")?.value || defaultSplitText(card));
      if (parts.length) {
        return parts.map((part) => ({
          surface: part,
          primary: part === primary,
          usesJisho: hasKanji(part) && !global.HwMgLexicon?.CUSTOM?.[part],
          ...glossDraftForSurface(part, part === primary ? draft : null),
        }));
      }
    }

    return [
      {
        surface: primary,
        primary: true,
        usesJisho: false,
        ...glossDraftForSurface(primary, draft),
      },
    ];
  }

  function glossFieldId(index, fieldName) {
    return "hw-lookup-lexicon-gloss-" + index + "-" + fieldName;
  }

  function isGlossBad(index, fieldName) {
    const el = field(glossFieldId(index, fieldName + "-bad"));
    return Boolean(el?.checked);
  }

  function definitionRowHtml(word, index) {
    return (
      '<div class="hw-lookup-lexicon-piece-row" data-gloss-index="' +
      index +
      '" data-surface="' +
      escapeHtml(word.surface) +
      '">' +
      '<p class="hw-lookup-lexicon-piece-row__word" lang="ja">' +
      escapeHtml(word.surface) +
      '</p><p class="hw-lookup-lexicon-piece-row__jisho">jisho = <span class="hw-lookup-lexicon-jisho-val is-loading" data-field="definition" data-surface="' +
      escapeHtml(word.surface) +
      '">…</span></p>' +
      '<div class="hw-lookup-lexicon-goodbad" role="radiogroup" aria-label="Definition for ' +
      escapeHtml(word.surface) +
      '">' +
      '<label class="hw-lookup-lexicon-goodbad__opt"><input type="radio" name="' +
      glossFieldId(index, "meaning") +
      '" id="' +
      glossFieldId(index, "meaning-good") +
      '" value="good" checked> Good</label>' +
      '<label class="hw-lookup-lexicon-goodbad__opt"><input type="radio" name="' +
      glossFieldId(index, "meaning") +
      '" id="' +
      glossFieldId(index, "meaning-bad") +
      '" value="bad"> Bad</label>' +
      "</div>" +
      '<div class="hw-lookup-lexicon-fix hw-lookup-lexicon-gloss-fix" id="' +
      glossFieldId(index, "meaning-wrap") +
      '" hidden>' +
      '<input type="text" class="hw-lookup-lexicon-fix__input" id="' +
      glossFieldId(index, "meaning-input") +
      '" autocomplete="off" placeholder="short English gloss" value="' +
      escapeHtml(word.definition || "") +
      '">' +
      "</div></div>"
    );
  }

  function readingRowHtml(word, index) {
    return (
      '<div class="hw-lookup-lexicon-piece-row" data-gloss-index="' +
      index +
      '" data-surface="' +
      escapeHtml(word.surface) +
      '">' +
      '<p class="hw-lookup-lexicon-piece-row__word" lang="ja">' +
      escapeHtml(word.surface) +
      '</p><p class="hw-lookup-lexicon-piece-row__eq">= <span class="hw-lookup-lexicon-jisho-val is-loading" data-field="reading" data-surface="' +
      escapeHtml(word.surface) +
      '">…</span></p>' +
      '<div class="hw-lookup-lexicon-goodbad" role="radiogroup" aria-label="Reading for ' +
      escapeHtml(word.surface) +
      '">' +
      '<label class="hw-lookup-lexicon-goodbad__opt"><input type="radio" name="' +
      glossFieldId(index, "reading") +
      '" id="' +
      glossFieldId(index, "reading-good") +
      '" value="good" checked> Good</label>' +
      '<label class="hw-lookup-lexicon-goodbad__opt"><input type="radio" name="' +
      glossFieldId(index, "reading") +
      '" id="' +
      glossFieldId(index, "reading-bad") +
      '" value="bad"> Bad</label>' +
      "</div>" +
      '<div class="hw-lookup-lexicon-fix hw-lookup-lexicon-gloss-fix" id="' +
      glossFieldId(index, "reading-wrap") +
      '" hidden>' +
      '<input type="text" class="hw-lookup-lexicon-fix__input" id="' +
      glossFieldId(index, "reading-input") +
      '" autocomplete="off" lang="ja" placeholder="ひらがな" value="' +
      escapeHtml(word.reading || "") +
      '">' +
      "</div></div>"
    );
  }

  function bindGlossWord(index) {
    ["reading", "meaning"].forEach((fieldName) => {
      field(glossFieldId(index, fieldName + "-good"))?.addEventListener("change", () => {
        syncGlossFixVisibility(index);
      });
      field(glossFieldId(index, fieldName + "-bad"))?.addEventListener("change", () => {
        syncGlossFixVisibility(index);
      });
    });
    syncGlossFixVisibility(index);
  }

  function syncGlossFixVisibility(index) {
    ["reading", "meaning"].forEach((fieldName) => {
      const wrap = field(glossFieldId(index, fieldName + "-wrap"));
      if (wrap) wrap.hidden = !isGlossBad(index, fieldName);
    });
    applyLexiconPreview(currentCard());
  }

  function renderPieceSections(card) {
    const defSection = field("hw-lookup-lexicon-definitions-section");
    const defHost = field("hw-lookup-lexicon-definitions-host");
    const readSection = field("hw-lookup-lexicon-readings-section");
    const readHost = field("hw-lookup-lexicon-readings-host");
    if (!defSection || !defHost || !readSection || !readHost || !card) return;

    if (card.kind === "skip" || card.kind === "lemma") {
      defSection.hidden = true;
      readSection.hidden = true;
      defHost.innerHTML = "";
      readHost.innerHTML = "";
      return;
    }

    defSection.hidden = false;
    readSection.hidden = false;
    const words = glossWordsForCard(card);
    defHost.innerHTML = words.map((word, index) => definitionRowHtml(word, index)).join("");
    readHost.innerHTML = words.map((word, index) => readingRowHtml(word, index)).join("");
    words.forEach((_, index) => bindGlossWord(index));
    void fillJishoValues(card, words);
  }

  function collectGlossEntries(card) {
    const words = glossWordsForCard(card);
    const entries = {};
    words.forEach((word, index) => {
      const readingBad = isGlossBad(index, "reading");
      const meaningBad = isGlossBad(index, "meaning");
      const jisho = jishoCache[word.surface] || {};
      const reading = readingBad
        ? field(glossFieldId(index, "reading-input"))?.value?.trim() || ""
        : word.reading || jisho.reading || "";
      const definition = meaningBad
        ? field(glossFieldId(index, "meaning-input"))?.value?.trim() || ""
        : word.definition || jisho.definition || "";
      if (!word.primary && word.usesJisho && !readingBad && !meaningBad) return;
      if (!word.primary && !readingBad && !meaningBad && !reading && !definition) return;
      entries[word.surface] = { reading, definition };
    });
    return { words, entries };
  }

  function configureReviewBlocks(card) {
    const kind = card?.kind || "custom";
    const draft = card?.draft || {};
    const lemmaBlock = field("hw-lookup-lexicon-lemma-block");
    const splitInput = field("hw-lookup-lexicon-split");

    if (lemmaBlock) lemmaBlock.hidden = kind !== "lemma";
    if (splitInput) splitInput.value = defaultSplitText(card);

    const lemmaQueryInput = field("hw-lookup-lexicon-lemma-query");
    if (lemmaQueryInput) lemmaQueryInput.value = draft.lemmaQuery || "";

    setGood("highlight");
    setGood("lemma");
    syncFixVisibility();
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
    const wordEl = field("hw-lookup-lexicon-word");
    const noteEl = field("hw-lookup-lexicon-note");

    if (kindEl) kindEl.textContent = meta.label;
    if (wordEl) wordEl.textContent = card.surface || "—";

    if (noteEl) {
      const note = String(card.note || "").trim();
      noteEl.textContent = note;
      noteEl.hidden = !note;
    }

    configureReviewBlocks(card);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => mountMagnifier(card));
    });
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
    const hadCards = pending.length > 0;
    if (!hadCards) {
      setPanelVisible("loading");
      setStatus("Loading…");
    }
    void global.HwMgLexicon?.ensureLoaded?.();
    void global.HwFuriganaAuto?.ensureTokenizer?.();
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
      renderCard();
      setStatus(pending.length ? "" : "Done.");
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

  async function buildExtraLemma(parts, card, sentence) {
    const extra = {};
    const targets = parts.filter((part) => part !== card.surface && hasKanji(part));
    if (!targets.length) return extra;

    for (const part of targets) {
      const known =
        global.HwMgLexicon?.LEMMA_QUERY?.[part] ||
        global.HwMgLexicon?.getPreview?.()?.lemmaQuery?.[part];
      if (known) extra[part] = known;
    }

    const remaining = targets.filter((part) => !extra[part]);
    if (!remaining.length) return extra;

    let units = [];
    try {
      const analysis = await global.HwMgLexicon?.analyzeText?.(sentence);
      units = analysis?.units || [];
    } catch {
      return extra;
    }

    for (const part of remaining) {
      const unit =
        units.find((u) => u.surface === part) ||
        units.find((u) => part.includes(u.surface) || u.surface.includes(part));
      if (!unit) continue;
      const resolved = global.HwMgLexicon?.resolve?.(part, unit.token?.basic_form);
      const query = resolved?.query;
      if (query && query !== part) extra[part] = query;
    }
    return extra;
  }

  async function collectSubmitPayload(card) {
    const payload = {
      teacherUsername: options.getTeacherSession().username,
      cardId: card.id,
      kind: card.kind,
      surface: card.surface,
    };
    const draft = card.draft || {};
    const sentence = cardExample(card);
    const highlightBad = isBad("highlight");
    const splitParts = parseSplit(field("hw-lookup-lexicon-split")?.value || defaultSplitText(card));
    const { words, entries } = collectGlossEntries(card);
    const primaryWord = words.find((w) => w.primary) || words[0];
    const primaryEntry = primaryWord ? entries[primaryWord.surface] : null;

    if (highlightBad && splitParts.length) {
      if (card.kind === "merge") {
        payload.mergeSurfaces = splitParts;
      } else if (card.kind === "split") {
        payload.splitSurfaces = splitParts;
        payload.extraLemmaQuery = await buildExtraLemma(splitParts, card, sentence);
      } else if (card.kind === "force_unit") {
        payload.forceUnit = splitParts.join("") || card.surface;
      } else if (card.kind !== "skip" && splitParts.length >= 2) {
        payload.splitSurfaces = splitParts;
        payload.extraLemmaQuery = await buildExtraLemma(splitParts, card, sentence);
      }
    } else if (!highlightBad) {
      if (card.kind === "merge" && draft.mergeSurfaces?.length >= 2) {
        payload.mergeSurfaces = draft.mergeSurfaces.slice();
      } else if (card.kind === "split" && draft.splitSurfaces?.length >= 2) {
        payload.splitSurfaces = draft.splitSurfaces.slice();
      } else if (card.kind === "force_unit") {
        payload.forceUnit = draft.forceUnit || card.surface;
      } else if (card.kind === "skip") {
        payload.skipSurface = draft.skipSurface || card.surface;
      } else if (card.kind === "lemma") {
        payload.lemmaSurface = draft.lemmaSurface || card.surface;
        payload.lemmaQuery = draft.lemmaQuery || "";
      }
    }

    const extraCustom = {};
    for (const [surface, entry] of Object.entries(entries)) {
      if (card.kind === "custom" && surface === card.surface) continue;
      if (entry?.reading || entry?.definition) extraCustom[surface] = entry;
    }
    if (Object.keys(extraCustom).length) payload.extraCustom = extraCustom;

    if (card.kind === "custom") {
      const cardEntry = entries[card.surface] || primaryEntry;
      payload.reading = cardEntry?.reading || draft.reading || "";
      payload.definition = cardEntry?.definition || draft.definition || "";
      if (!highlightBad && draft.forceUnit) payload.forceUnit = draft.forceUnit;
    } else if (card.kind === "skip") {
      payload.skipSurface = draft.skipSurface || card.surface;
    } else if (card.kind === "lemma") {
      payload.lemmaSurface = draft.lemmaSurface || card.surface;
      payload.lemmaQuery = isBad("lemma")
        ? field("hw-lookup-lexicon-lemma-query")?.value?.trim() || ""
        : draft.lemmaQuery || "";
    } else if (card.kind === "force_unit") {
      if (!payload.forceUnit) payload.forceUnit = draft.forceUnit || card.surface;
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
        body: JSON.stringify(await collectSubmitPayload(card)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed.");

      global.HwMgLexicon?.clearPreview?.();
      if (data.overlay && global.HwMgLexicon?.applyGlobalOverlay) {
        global.HwMgLexicon.applyGlobalOverlay(data.overlay);
      } else {
        await global.HwMgLexicon?.ensureLoaded?.();
      }

      options?.showToast?.("Saved.");
      pending.splice(currentIndex, 1);
      if (currentIndex >= pending.length) currentIndex = 0;
      doneCount += 1;
      renderCard();
      setStatus(data.remaining ? data.remaining + " left" : "Done.");
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

  function bindGoodBad(name) {
    field("hw-lookup-lexicon-" + name + "-good")?.addEventListener("change", syncFixVisibility);
    field("hw-lookup-lexicon-" + name + "-bad")?.addEventListener("change", syncFixVisibility);
  }

  function bindControls() {
    if (bound) return;
    bound = true;

    bindGoodBad("highlight");
    bindGoodBad("lemma");

    field("hw-lookup-lexicon-split")?.addEventListener("input", () => {
      renderPieceSections(currentCard());
      applyLexiconPreview(currentCard());
    });

    field("hw-lookup-lexicon-lemma-query")?.addEventListener("input", () => {
      refreshDraftPreviews(currentCard());
    });

    field("hw-lookup-lexicon-definitions-host")?.addEventListener("input", () => {
      applyLexiconPreview(currentCard());
    });

    field("hw-lookup-lexicon-readings-host")?.addEventListener("input", () => {
      applyLexiconPreview(currentCard());
    });

    field("hw-lookup-lexicon-submit-btn")?.addEventListener("click", () => {
      void submitCurrent();
    });

    field("hw-lookup-lexicon-next-btn")?.addEventListener("click", () => {
      if (!pending.length) return;
      currentIndex = (currentIndex + 1) % pending.length;
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
    if (pending.length && currentCard()) {
      renderCard();
      return;
    }
    scheduleLoad();
  }

  global.HwTeacherLookupLexicon = { init, reloadIfNeeded, unmountMagnifier };
})(window);
