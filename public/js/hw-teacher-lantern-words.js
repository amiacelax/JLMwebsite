/**
 * Teacher hub — edit Lantern Word Hunt study-set word lists.
 */
(function (global) {
  let setsCache = [];
  let currentSetId = "demo";
  let dirty = false;
  let loading = false;
  let bound = false;
  let options = null;

  const BUILTIN_DEFAULTS = {
    demo: () => global.LanternWordsDemo || [],
    n5: () => global.LanternWordsN5 || [],
  };

  function fmt() {
    return global.LanternWordFormat;
  }

  function setStatus(message) {
    const el = document.getElementById("hw-lantern-words-status");
    if (el) el.textContent = message || "";
  }

  function setMeta(message) {
    const el = document.getElementById("hw-lantern-words-meta");
    if (el) el.textContent = message || "";
  }

  function currentSet() {
    return setsCache.find((s) => s.id === currentSetId) || null;
  }

  function isBuiltin(id) {
    return id === "demo" || id === "n5";
  }

  function wordsTextarea() {
    return document.getElementById("hw-lantern-words-text");
  }

  function labelInput() {
    return document.getElementById("hw-lantern-words-label");
  }

  function setSelect() {
    return document.getElementById("hw-lantern-words-set");
  }

  function markDirty(on) {
    dirty = Boolean(on);
    const saveBtn = document.getElementById("hw-lantern-words-save");
    if (saveBtn) saveBtn.textContent = dirty ? "Save word list *" : "Save word list";
  }

  function updateWordCount() {
    const text = wordsTextarea()?.value || "";
    const count = fmt()?.parseLines(text)?.length || 0;
    const set = currentSet();
    const parts = [count + " word" + (count === 1 ? "" : "s")];
    if (set?.updatedAt) {
      try {
        parts.push("saved " + new Date(set.updatedAt).toLocaleString());
      } catch {
        /* ignore */
      }
    } else if (set?.source === "builtin") {
      parts.push("using built-in file (not saved yet)");
    }
    setMeta(parts.join(" · "));
  }

  function renderSetSelect() {
    const select = setSelect();
    if (!select) return;
    const prev = currentSetId;
    select.innerHTML = "";
    setsCache.forEach((set) => {
      const opt = document.createElement("option");
      opt.value = set.id;
      opt.textContent = set.label + (set.wordCount ? " (" + set.wordCount + ")" : "");
      select.appendChild(opt);
    });
    if (setsCache.some((s) => s.id === prev)) {
      select.value = prev;
      currentSetId = prev;
    } else if (setsCache.length) {
      currentSetId = setsCache[0].id;
      select.value = currentSetId;
    }
    const delBtn = document.getElementById("hw-lantern-words-delete-set");
    if (delBtn) delBtn.hidden = isBuiltin(currentSetId);
  }

  async function ensureBuiltinScripts() {
    const loads = [];
    if (!global.LanternWordsDemo?.length) {
      loads.push(
        new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "/game/lantern-hunt/lantern-words-demo.js?v=20260650";
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        })
      );
    }
    if (!global.LanternWordsN5?.length) {
      loads.push(
        new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "/game/lantern-hunt/lantern-words-n5.js?v=20260650";
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        })
      );
    }
    if (loads.length) await Promise.all(loads);
  }

  function builtinWords(setId) {
    const fn = BUILTIN_DEFAULTS[setId];
    return fn ? fn().slice() : [];
  }

  async function fetchSets() {
    const res = await fetch("/api/lantern-words/sets");
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not load study sets.");
    }
    const data = await res.json();
    return Array.isArray(data.sets) ? data.sets : [];
  }

  async function fetchWords(setId) {
    const res = await fetch("/api/lantern-words?set=" + encodeURIComponent(setId));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not load words.");
    }
    return res.json();
  }

  async function loadCurrentSetIntoEditor() {
    loading = true;
    setStatus("Loading…");
    try {
      await ensureBuiltinScripts();
      const data = await fetchWords(currentSetId);
      const labelEl = labelInput();
      if (labelEl) labelEl.value = data.label || currentSetId;

      let words = data.words;
      let source = data.source;
      if (!words?.length) {
        words = builtinWords(currentSetId);
        source = "builtin";
      }

      const text = fmt()?.serializeWords(words) || "";
      const ta = wordsTextarea();
      if (ta) ta.value = text;
      markDirty(false);
      updateWordCount();
      setStatus(
        source === "kv"
          ? "Loaded saved list."
          : "Showing built-in defaults — edit and Save to publish to the game."
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not load list.");
    } finally {
      loading = false;
    }
  }

  async function reloadSetsAndEditor() {
    loading = true;
    setStatus("Loading study sets…");
    try {
      setsCache = await fetchSets();
      renderSetSelect();
      await loadCurrentSetIntoEditor();
    } catch (err) {
      setsCache = [
        { id: "demo", label: "Demo words", wordCount: 0, builtin: true },
        { id: "n5", label: "JLPT N5 words", wordCount: 0, builtin: true },
      ];
      renderSetSelect();
      setStatus(err instanceof Error ? err.message : "Could not load study sets.");
    } finally {
      loading = false;
    }
  }

  async function saveCurrentSet() {
    const session = options?.getTeacherSession?.();
    if (!session?.username) return;

    const words = fmt()?.parseLines(wordsTextarea()?.value || "") || [];
    if (!words.length) {
      setStatus("Add at least one line: word TAB reading TAB meaning");
      return;
    }

    const label = (labelInput()?.value || "").trim() || currentSetId;
    setStatus("Saving…");
    try {
      const res = await fetch("/api/lantern-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: session.username,
          setId: currentSetId,
          label,
          words,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");

      markDirty(false);
      options?.showToast?.("Lantern words saved — live in the game now.");
      setsCache = await fetchSets();
      const found = setsCache.find((s) => s.id === currentSetId);
      if (found) found.label = label;
      renderSetSelect();
      updateWordCount();
      setStatus("Saved " + words.length + " words to “" + label + "”.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save.");
    }
  }

  async function loadBuiltinIntoEditor() {
    await ensureBuiltinScripts();
    const words = builtinWords(currentSetId);
    if (!words.length) {
      setStatus("Built-in list not available for this set.");
      return;
    }
    const ta = wordsTextarea();
    if (ta) ta.value = fmt()?.serializeWords(words) || "";
    markDirty(true);
    updateWordCount();
    setStatus("Loaded built-in defaults — Save when ready.");
  }

  async function createNewSet() {
    const idRaw = window.prompt("New study set id (letters, numbers, dashes — e.g. chapter-3):");
    if (!idRaw) return;
    const id = idRaw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!id || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(id)) {
      setStatus("Invalid id — use letters, numbers, and dashes.");
      return;
    }
    if (setsCache.some((s) => s.id === id)) {
      setStatus("That study set already exists.");
      currentSetId = id;
      renderSetSelect();
      await loadCurrentSetIntoEditor();
      return;
    }
    const label = window.prompt("Display name for students:", id) || id;
    setsCache.push({ id, label, wordCount: 0 });
    currentSetId = id;
    renderSetSelect();
    if (labelInput()) labelInput().value = label;
    if (wordsTextarea()) wordsTextarea().value = "";
    markDirty(false);
    updateWordCount();
    setStatus("New set created — paste words and Save.");
  }

  async function deleteCurrentSet() {
    if (isBuiltin(currentSetId)) return;
    const set = currentSet();
    if (!window.confirm("Delete study set “" + (set?.label || currentSetId) + "”?")) return;

    const session = options?.getTeacherSession?.();
    if (!session?.username) return;

    setStatus("Deleting…");
    try {
      const res = await fetch("/api/lantern-words/delete-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: session.username,
          setId: currentSetId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete.");

      options?.showToast?.("Study set deleted.");
      currentSetId = "demo";
      await reloadSetsAndEditor();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    setSelect()?.addEventListener("change", async () => {
      if (dirty && !window.confirm("Discard unsaved changes?")) {
        setSelect().value = currentSetId;
        return;
      }
      currentSetId = setSelect().value || "demo";
      const delBtn = document.getElementById("hw-lantern-words-delete-set");
      if (delBtn) delBtn.hidden = isBuiltin(currentSetId);
      await loadCurrentSetIntoEditor();
    });

    wordsTextarea()?.addEventListener("input", () => {
      markDirty(true);
      updateWordCount();
    });

    labelInput()?.addEventListener("input", () => markDirty(true));

    document.getElementById("hw-lantern-words-save")?.addEventListener("click", saveCurrentSet);
    document.getElementById("hw-lantern-words-builtin")?.addEventListener("click", loadBuiltinIntoEditor);
    document.getElementById("hw-lantern-words-new-set")?.addEventListener("click", createNewSet);
    document.getElementById("hw-lantern-words-delete-set")?.addEventListener("click", deleteCurrentSet);

    document.getElementById("hw-lantern-words-preview")?.addEventListener("click", () => {
      const url = "/game/lantern-hunt/?set=" + encodeURIComponent(currentSetId);
      window.open(url, "_blank", "noopener,noreferrer");
    });

    document.getElementById("hw-lantern-words-toggle")?.addEventListener("click", () => {
      const editor = document.getElementById("hw-lantern-words-editor");
      const toggle = document.getElementById("hw-lantern-words-toggle");
      if (!editor || !toggle) return;
      const open = editor.hasAttribute("hidden");
      if (open) {
        editor.removeAttribute("hidden");
        toggle.setAttribute("aria-expanded", "true");
        reloadIfNeeded();
        editor.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        editor.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function init(opts) {
    options = opts || null;
    bindOnce();
    reloadSetsAndEditor();
  }

  function reload() {
    return reloadSetsAndEditor();
  }

  function reloadIfNeeded() {
    if (!setsCache.length) return reloadSetsAndEditor();
    return loadCurrentSetIntoEditor();
  }

  global.HwTeacherLanternWords = { init, reload, reloadIfNeeded };
})(typeof window !== "undefined" ? window : globalThis);
