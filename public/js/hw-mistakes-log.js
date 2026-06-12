/**
 * Quick mistakes log — private URL key, no platform login.
 */
(function () {
  const win = typeof window !== "undefined" ? window : globalThis;
  const KEY_STORAGE = "jlm-mistakes-log-key";
  const SESSION_KEY = "jlm-mistakes-log-student";

  const CATEGORY_OPTIONS = [
    ["grammar", "Grammar"],
    ["vocab", "Vocabulary"],
    ["pronunciation", "Pronunciation"],
    ["kanji", "Kanji"],
    ["particle", "Particle"],
    ["conjugation", "Conjugation"],
    ["other", "Other"],
  ];

  const NOTES_TEMPLATE = "# grammar\n\n# conjugation\n\n# vocab\n\n# kanji\n";

  let mistakesKey = "";
  let sessionLogged = [];
  let previewEntries = [];

  function getKeyFromUrl() {
    try {
      return new URL(window.location.href).searchParams.get("key") || "";
    } catch {
      return "";
    }
  }

  function resolveKey() {
    const fromUrl = getKeyFromUrl().trim();
    if (fromUrl) {
      try {
        sessionStorage.setItem(KEY_STORAGE, fromUrl);
      } catch {
        /* ignore */
      }
      return fromUrl;
    }
    try {
      return sessionStorage.getItem(KEY_STORAGE) || "";
    } catch {
      return "";
    }
  }

  function isLocalhost() {
    const h = location.hostname;
    return h === "127.0.0.1" || h === "localhost";
  }

  async function tryLocalDevKey() {
    if (!isLocalhost()) return "";
    try {
      const res = await fetch("/api/local-dev-mistakes-key");
      if (!res.ok) return "";
      const data = await res.json().catch(() => ({}));
      const key = String(data.key || "").trim();
      if (!key) return "";
      try {
        sessionStorage.setItem(KEY_STORAGE, key);
      } catch {
        /* ignore */
      }
      try {
        const url = new URL(window.location.href);
        if (!url.searchParams.get("key")) {
          url.searchParams.set("key", key);
          window.history.replaceState(null, "", url);
        }
      } catch {
        /* ignore */
      }
      return key;
    } catch {
      return "";
    }
  }

  function getStudent() {
    return document.getElementById("hw-log-student")?.value || "";
  }

  function rememberStudent(student) {
    try {
      sessionStorage.setItem(SESSION_KEY, student);
    } catch {
      /* ignore */
    }
  }

  function resetNotesTemplate() {
    const textarea = document.getElementById("hw-log-bulk-text");
    if (textarea) textarea.value = NOTES_TEMPLATE;
    previewEntries = [];
    renderPreview();
  }

  function setStatus(elId, msg, isError) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("hw-maker-status--error", !!isError);
  }

  function renderRecent() {
    const list = document.getElementById("hw-log-recent-list");
    if (!list || !win.HwMistakeFeed) return;
    win.HwMistakeFeed.renderFeed(list, sessionLogged, {
      emptyText: "Nothing logged yet this visit.",
      limit: 12,
    });
  }

  function categorySelect(id, value) {
    const sel = document.createElement("select");
    sel.className = "hw-mistakes-log__preview-cat";
    sel.id = id;
    CATEGORY_OPTIONS.forEach(([val, label]) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      if (val === value) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function updateSubmitButton(count) {
    const submit = document.getElementById("hw-log-bulk-submit");
    if (!submit) return;
    submit.disabled = count < 1;
    submit.textContent =
      count === 1 ? "Log mistake" : count > 1 ? "Log mistakes (" + count + ")" : "Log mistakes";
  }

  function renderPreview() {
    const wrap = document.getElementById("hw-log-bulk-preview");
    const list = document.getElementById("hw-log-bulk-preview-list");
    const msg = document.getElementById("hw-log-bulk-parse-msg");
    const raw = document.getElementById("hw-log-bulk-text")?.value || "";
    const defaultCat =
      document.getElementById("hw-log-bulk-default-cat")?.value || "grammar";

    if (!list) return;

    if (!win.HwMistakeParse) {
      previewEntries = [];
      updateSubmitButton(0);
      if (msg) msg.textContent = "Parser failed to load — hard refresh the page.";
      if (msg) msg.classList.add("hw-maker-status--error");
      return;
    }

    const { entries, skipped } = win.HwMistakeParse.parseBulkPaste(raw, defaultCat);
    previewEntries = entries;

    list.innerHTML = "";

    if (!raw.trim()) {
      if (wrap) wrap.hidden = true;
      if (msg) {
        msg.textContent = "";
        msg.classList.remove("hw-maker-status--error");
      }
      updateSubmitButton(0);
      return;
    }

    if (wrap) wrap.hidden = entries.length === 0;
    updateSubmitButton(entries.length);

    if (entries.length === 0) {
      if (msg) {
        msg.textContent = skipped.length
          ? "Could not parse any lines — try wrong > right on each line."
          : "Nothing parsed yet.";
        msg.classList.toggle("hw-maker-status--error", skipped.length > 0);
      }
      return;
    }

    entries.forEach((entry, index) => {
      const li = document.createElement("li");
      li.className = "hw-mistakes-log__preview-row";
      li.dataset.index = String(index);

      const pair = document.createElement("div");
      pair.className = "hw-mistakes-log__preview-pair";

      const wrong = document.createElement("p");
      wrong.className = "hw-mistake-feed__wrong";
      wrong.textContent = "❌" + entry.text;
      pair.appendChild(wrong);

      if (entry.correction) {
        const right = document.createElement("p");
        right.className = "hw-mistake-feed__right";
        right.textContent = "✅" + entry.correction;
        pair.appendChild(right);
      }

      if (entry.context) {
        const note = document.createElement("p");
        note.className = "hw-mistakes-log__preview-context";
        note.textContent = entry.context;
        pair.appendChild(note);
      }

      const catWrap = document.createElement("label");
      catWrap.className = "hw-mistakes-log__preview-cat-wrap";
      catWrap.textContent = "Type ";
      const sel = categorySelect("hw-log-preview-cat-" + index, entry.category);
      sel.addEventListener("change", () => {
        previewEntries[index].category = sel.value;
      });
      catWrap.appendChild(sel);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn--ghost btn--sm hw-mistakes-log__preview-remove";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        previewEntries.splice(index, 1);
        syncTextareaFromPreview();
        renderPreview();
      });

      li.append(pair, catWrap, remove);
      list.appendChild(li);
    });

    if (msg) {
      const parts = [entries.length + " ready to log"];
      if (skipped.length) parts.push(skipped.length + " line(s) skipped");
      msg.textContent = parts.join(" · ");
      msg.classList.remove("hw-maker-status--error");
    }
  }

  function syncTextareaFromPreview() {
    const textarea = document.getElementById("hw-log-bulk-text");
    if (!textarea) return;

    if (!previewEntries.length) {
      resetNotesTemplate();
      return;
    }

    let currentCat = "";
    const lines = [];
    previewEntries.forEach((entry) => {
      if (entry.category !== currentCat) {
        currentCat = entry.category;
        lines.push("# " + currentCat);
        lines.push("");
      }
      const arrow = entry.correction ? " > " + entry.correction : "";
      lines.push(entry.text + arrow);
    });
    textarea.value = lines.join("\n");
    renderPreview();
  }

  let parseTimer = null;
  function scheduleParse() {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(renderPreview, 200);
  }

  async function saveOne(payload) {
    const res = await fetch("/api/student-mistakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Save failed.");
    return data;
  }

  async function logBulk() {
    renderPreview();

    const student = getStudent();
    if (!student) {
      setStatus("hw-log-bulk-parse-msg", "Choose a student first.", true);
      return;
    }
    if (!previewEntries.length) {
      setStatus("hw-log-bulk-parse-msg", "Nothing to log — paste your notes above.", true);
      return;
    }

    const submit = document.getElementById("hw-log-bulk-submit");
    if (submit) submit.disabled = true;

    const total = previewEntries.length;
    let saved = 0;

    try {
      for (const entry of previewEntries) {
        setStatus("hw-log-bulk-parse-msg", "Saving " + (saved + 1) + " / " + total + "…");
        await saveOne({
          mistakesKey,
          studentUsername: student,
          category: entry.category,
          text: entry.text,
          correction: entry.correction || undefined,
          context: entry.context || undefined,
          source: "lesson",
        });
        sessionLogged.unshift({
          username: student,
          text: entry.text,
          correction: entry.correction || undefined,
        });
        saved += 1;
      }

      resetNotesTemplate();
      renderRecent();
      setStatus("hw-log-bulk-parse-msg", "Logged " + saved + " ✓");
      rememberStudent(student);
    } catch (err) {
      setStatus(
        "hw-log-bulk-parse-msg",
        saved
          ? "Saved " + saved + " of " + total + ". " + ((err && err.message) || "")
          : (err && err.message) || "Could not save.",
        true
      );
      if (saved > 0) renderRecent();
    } finally {
      updateSubmitButton(previewEntries.length);
    }
  }

  function bootApp() {
    const gate = document.getElementById("hw-mistakes-log-gate");
    const app = document.getElementById("hw-mistakes-log-app");

    if (gate) gate.hidden = true;
    if (app) app.hidden = false;

    try {
      const savedStudent = sessionStorage.getItem(SESSION_KEY);
      if (savedStudent) {
        const sel = document.getElementById("hw-log-student");
        if (sel) sel.value = savedStudent;
      }
    } catch {
      /* ignore */
    }

    document.getElementById("hw-log-bulk-text")?.addEventListener("input", scheduleParse);
    document.getElementById("hw-log-bulk-text")?.addEventListener("paste", () => {
      setTimeout(renderPreview, 0);
    });
    document.getElementById("hw-log-bulk-default-cat")?.addEventListener("change", renderPreview);
    document.getElementById("hw-log-bulk-submit")?.addEventListener("click", () => logBulk());

    renderRecent();
    resetNotesTemplate();
    document.getElementById("hw-log-bulk-text")?.focus();
  }

  function init() {
    mistakesKey = resolveKey();
    const gate = document.getElementById("hw-mistakes-log-gate");
    const gateMsg = document.getElementById("hw-mistakes-log-gate-msg");
    const app = document.getElementById("hw-mistakes-log-app");

    if (!mistakesKey) {
      if (gate) gate.hidden = false;
      if (app) app.hidden = true;
      if (isLocalhost() && gateMsg) {
        gateMsg.textContent = "Loading local dev key…";
      }
      void tryLocalDevKey().then((key) => {
        if (key) {
          mistakesKey = key;
          bootApp();
          return;
        }
        if (gateMsg) {
          gateMsg.textContent = isLocalhost()
            ? "Local dev key missing. Add MISTAKES_LOG_KEY and LOCAL_DEV=1 to .dev.vars, then restart npm run dev."
            : "This link needs your private key in the URL. Ask JD for the full bookmark.";
        }
      });
      return;
    }

    bootApp();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
