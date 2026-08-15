/**
 * Glass check deck — one worksheet question per card, rendered exactly the way a
 * student sees it, with the magnifying glass already armed. JD sweeps every word,
 * fixes what reads wrong straight from the glass popup, then marks the card done.
 * "Done" lives in KV (site:mg-glass-check) so the deck picks up on any device.
 */
(function (global) {
  "use strict";

  const JA_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
  const FETCH_BATCH = 4;

  let options = null;
  let host = null;
  let bound = false;
  let loading = false;
  let loaded = false;
  let cards = [];
  let checked = Object.create(null);
  let cursor = 0;
  let showChecked = false;
  let saving = false;

  function session() {
    return options?.getTeacherSession?.() || global.HwAuth?.getTeacherSession?.() || null;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(msg, isError) {
    const node = el("hw-gd-status");
    if (!node) return;
    node.textContent = msg || "";
    node.classList.toggle("is-error", Boolean(isError));
  }

  function isOpen() {
    return Boolean(host && host.isConnected && !host.closest("[hidden]"));
  }

  /* ── Card list ── */

  function hasJapanese(str) {
    return JA_RE.test(String(str || ""));
  }

  function itemJapanese(item) {
    const bits = [];
    const push = (v) => {
      if (typeof v === "string" && v) bits.push(v);
    };
    push(item?.prompt);
    push(item?.text);
    push(item?.japanese);
    push(item?.sentence);
    push(item?.answer);
    (item?.parts || []).forEach((part) => {
      push(part?.value);
      push(part?.answer);
      (part?.ruby || []).forEach((seg) => push(seg?.text));
    });
    (item?.tokens || []).forEach((token) => push(token?.text));
    (item?.choices || []).forEach((choice) =>
      push(typeof choice === "string" ? choice : choice?.text)
    );
    return bits.join(" ");
  }

  function cardKey(assignmentId, itemId) {
    return assignmentId + "::" + itemId;
  }

  function buildCards(assignment) {
    const out = [];
    const assignmentId = String(assignment?.id || "").trim();
    if (!assignmentId) return out;
    (assignment.sections || []).forEach((section, sectionIndex) => {
      (section.items || []).forEach((item, itemIndex) => {
        if (!hasJapanese(itemJapanese(item))) return;
        const itemId = String(item?.id || "s" + sectionIndex + "i" + itemIndex);
        out.push({
          key: cardKey(assignmentId, itemId),
          assignmentId,
          assignmentTitle: assignment.title || assignmentId,
          assignment,
          section,
          item,
          sectionIndex,
          itemIndex,
        });
      });
    });
    return out;
  }

  async function fetchAssignment(id) {
    try {
      const res = await fetch("/api/homework-assignment?id=" + encodeURIComponent(id));
      if (res.ok) {
        const data = await res.json();
        if (data?.assignment) return data.assignment;
        if (data?.sections) return data;
      }
    } catch {
      /* fall through to the static copy */
    }
    try {
      const res = await fetch("/homework/assignments/" + encodeURIComponent(id) + ".json");
      if (res.ok) return await res.json();
    } catch {
      /* ignore */
    }
    return null;
  }

  async function loadDeck(force) {
    if (loading) return;
    if (loaded && !force) return;
    const teacher = session();
    if (!teacher?.username) {
      setStatus("Teacher login required.");
      return;
    }

    loading = true;
    setStatus("Loading worksheets…");
    showPane("loading");

    try {
      const [checkRes, catalogRes] = await Promise.all([
        fetch("/api/mg-glass-check?teacherUsername=" + encodeURIComponent(teacher.username)),
        fetch("/api/homework-catalog", { cache: "no-store" }),
      ]);

      const checkData = await checkRes.json().catch(() => ({}));
      checked = checkRes.ok && checkData?.checked ? checkData.checked : Object.create(null);

      const catalog = await catalogRes.json().catch(() => ({}));
      const list = Array.isArray(catalog.assignments) ? catalog.assignments : [];
      if (!list.length) throw new Error("No worksheets in the library yet.");

      const built = [];
      for (let i = 0; i < list.length; i += FETCH_BATCH) {
        const slice = list.slice(i, i + FETCH_BATCH);
        const loadedSheets = await Promise.all(
          slice.map((entry) => fetchAssignment(String(entry?.id || "")))
        );
        loadedSheets.forEach((sheet) => {
          if (sheet) built.push(...buildCards(sheet));
        });
        setStatus("Loading worksheets… " + Math.min(i + FETCH_BATCH, list.length) + "/" + list.length);
      }

      cards = built;
      loaded = true;
      cursor = 0;
      setStatus("");
      render();
    } catch (err) {
      setStatus(err?.message || "Could not load worksheets.", true);
      showPane("empty");
      const empty = el("hw-gd-empty");
      if (empty) empty.textContent = err?.message || "Could not load worksheets.";
    } finally {
      loading = false;
    }
  }

  /* ── Deck state ── */

  function visibleCards() {
    if (showChecked) return cards;
    return cards.filter((card) => !checked[card.key]);
  }

  function currentCard() {
    const list = visibleCards();
    if (!list.length) return null;
    if (cursor >= list.length) cursor = list.length - 1;
    if (cursor < 0) cursor = 0;
    return list[cursor];
  }

  function checkedCount() {
    return cards.filter((card) => checked[card.key]).length;
  }

  /* ── Rendering ── */

  function showPane(which) {
    const stage = el("hw-gd-stage");
    const empty = el("hw-gd-empty");
    const loadingEl = el("hw-gd-loading");
    if (stage) stage.hidden = which !== "card";
    if (empty) empty.hidden = which !== "empty";
    if (loadingEl) loadingEl.hidden = which !== "loading";
    if (which !== "card") releaseGlass();
  }

  function syncProgress() {
    const progress = el("hw-gd-progress");
    if (!progress) return;
    const done = checkedCount();
    const left = cards.length - done;
    progress.textContent = cards.length
      ? left + " question" + (left === 1 ? "" : "s") + " left to sweep · " + done + " done"
      : "";
  }

  function releaseGlass() {
    global.HwMagnifyingGlass?.releaseOverride?.(true);
  }

  function mountGlass() {
    const sheet = el("hw-gd-sheet");
    if (!sheet || !isOpen()) return;

    const opts = {
      force: true,
      skipOnboarding: true,
      autoArm: true,
      silentArm: true,
      armHint: "",
      storageKey: "hw-mg-glass-deck-v1",
      defaultSnap: "tr",
    };

    let attempts = 0;
    (function tryAttach() {
      if (!isOpen()) return;
      attempts += 1;
      if (global.HwMagnifyingGlass?.attachTo?.(sheet, opts)) {
        global.HwMagnifyingGlass?.refresh?.();
        return;
      }
      if (attempts < 16) requestAnimationFrame(tryAttach);
    })();

    void global.HwMgLexicon?.ensureLoaded?.().catch(() => {});
    void global.HwFuriganaAuto?.ensureTokenizer?.().catch(() => {});
  }

  function renderEmpty() {
    showPane("empty");
    const empty = el("hw-gd-empty");
    if (!empty) return;
    if (!cards.length) {
      empty.textContent = "No worksheet questions with Japanese in them yet.";
      return;
    }
    empty.textContent = showChecked
      ? "Deck is empty."
      : "Every question is swept. Tick “include swept cards” to go back through them.";
  }

  function render() {
    if (!isOpen()) return;
    syncProgress();

    const card = currentCard();
    if (!card) {
      renderEmpty();
      return;
    }

    showPane("card");

    const list = visibleCards();
    const source = el("hw-gd-source");
    if (source) {
      const isDone = Boolean(checked[card.key]);
      source.innerHTML =
        '<span class="hw-gd-source__sheet">' +
        escapeHtml(card.assignmentTitle) +
        "</span>" +
        '<span class="hw-gd-source__item">Question ' +
        (card.itemIndex + 1) +
        (card.section?.title ? " · " + escapeHtml(card.section.title) : "") +
        "</span>" +
        (isDone ? '<span class="hw-gd-source__done">swept</span>' : "");
    }

    const count = el("hw-gd-count");
    if (count) count.textContent = "Card " + (cursor + 1) + " of " + list.length;

    const sheet = el("hw-gd-sheet");
    if (sheet && global.HwWorksheet?.render) {
      const synthetic = {
        ...card.assignment,
        sections: [{ ...card.section, items: [card.item] }],
      };
      const form = global.HwWorksheet.render(sheet, synthetic, {
        preview: true,
        readOnly: true,
        omitMetaTitle: true,
        omitMetaHint: true,
      });
      /* Keep the student worksheet form id unique to the real sheet. */
      if (form) form.id = "hw-glass-deck-form";
    }

    const doneBtn = el("hw-gd-done");
    if (doneBtn) {
      const isDone = Boolean(checked[card.key]);
      doneBtn.textContent = isDone ? "Unmark this card" : "Finished with this card ✓";
      doneBtn.classList.toggle("btn--ghost", isDone);
      doneBtn.classList.toggle("btn--primary", !isDone);
    }

    const prevBtn = el("hw-gd-prev");
    if (prevBtn) prevBtn.disabled = cursor <= 0;

    mountGlass();
  }

  /* ── Actions ── */

  function step(delta) {
    const list = visibleCards();
    if (!list.length) return;
    cursor = Math.min(Math.max(cursor + delta, 0), list.length - 1);
    render();
  }

  async function toggleDone() {
    if (saving) return;
    const card = currentCard();
    const teacher = session();
    if (!card || !teacher?.username) return;

    const wasDone = Boolean(checked[card.key]);
    const nextDone = !wasDone;

    saving = true;
    const doneBtn = el("hw-gd-done");
    if (doneBtn) doneBtn.disabled = true;

    /* Move on straight away — the save is small and we roll it back if it fails. */
    if (nextDone) checked[card.key] = new Date().toISOString();
    else delete checked[card.key];
    if (nextDone && !showChecked) {
      /* Card drops out of the list, so the cursor already points at the next one. */
      const list = visibleCards();
      if (cursor >= list.length) cursor = Math.max(list.length - 1, 0);
    }
    render();

    try {
      const res = await fetch("/api/mg-glass-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: teacher.username,
          keys: [card.key],
          checked: nextDone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      if (data.checked) checked = data.checked;
      setStatus("");
    } catch (err) {
      if (nextDone) delete checked[card.key];
      else checked[card.key] = new Date().toISOString();
      setStatus(err?.message || "Could not save progress.", true);
      render();
    } finally {
      saving = false;
      if (doneBtn) doneBtn.disabled = false;
    }
  }

  /* ── Shell ── */

  function shellHtml() {
    return (
      '<section class="hw-glass-deck" id="hw-glass-deck">' +
      '<div class="hw-glass-deck__head">' +
      '<h3 class="hw-hub-v6-section__title">Review Deck</h3>' +
      '<p class="hw-glass-deck__lead">One homework question per card, exactly as a student gets it. ' +
      "The glass is already on — tap every word, fix anything that reads wrong, then finish the card.</p>" +
      '<div class="hw-glass-deck__bar">' +
      '<p class="hw-glass-deck__progress" id="hw-gd-progress" aria-live="polite"></p>' +
      '<label class="hw-glass-deck__toggle"><input type="checkbox" id="hw-gd-show-checked"> Include swept cards</label>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="hw-gd-reload">Reload sheets</button>' +
      "</div>" +
      '<p class="hw-glass-deck__status" id="hw-gd-status" role="status" aria-live="polite"></p>' +
      "</div>" +
      '<p class="hw-glass-deck__loading" id="hw-gd-loading" hidden>Loading…</p>' +
      '<p class="hw-glass-deck__empty" id="hw-gd-empty" hidden></p>' +
      '<div class="hw-glass-deck__stage" id="hw-gd-stage" hidden>' +
      '<div class="hw-glass-deck__cardhead">' +
      '<p class="hw-glass-deck__source" id="hw-gd-source"></p>' +
      '<p class="hw-glass-deck__count" id="hw-gd-count"></p>' +
      "</div>" +
      '<div class="hw-glass-deck__sheet" id="hw-gd-sheet"></div>' +
      '<div class="hw-glass-deck__actions">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="hw-gd-prev">← Back</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="hw-gd-skip">Skip →</button>' +
      '<button type="button" class="btn btn--primary" id="hw-gd-done">Finished with this card ✓</button>' +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  function bind() {
    if (bound || !host) return;
    bound = true;
    host.addEventListener("click", (ev) => {
      if (ev.target.closest?.("#hw-gd-done")) {
        ev.preventDefault();
        void toggleDone();
        return;
      }
      if (ev.target.closest?.("#hw-gd-skip")) {
        ev.preventDefault();
        step(1);
        return;
      }
      if (ev.target.closest?.("#hw-gd-prev")) {
        ev.preventDefault();
        step(-1);
        return;
      }
      if (ev.target.closest?.("#hw-gd-reload")) {
        ev.preventDefault();
        void loadDeck(true);
      }
    });
    host.addEventListener("change", (ev) => {
      if (ev.target?.id !== "hw-gd-show-checked") return;
      showChecked = Boolean(ev.target.checked);
      cursor = 0;
      render();
    });
  }

  function open(mount) {
    host = mount || host;
    if (!host) return;
    if (!host.querySelector("#hw-glass-deck")) {
      host.innerHTML = shellHtml();
      bound = false;
    }
    bind();
    if (!loaded) {
      void loadDeck(false);
      return;
    }
    render();
  }

  function close() {
    releaseGlass();
  }

  function init(opts) {
    options = opts || {};
  }

  global.HwGlassDeck = { init, open, close, reload: () => loadDeck(true) };
})(window);
