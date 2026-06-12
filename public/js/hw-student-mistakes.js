/**
 * Student mistakes card — select, copy, trash, restore.
 */
(function () {
  const win = typeof window !== "undefined" ? window : globalThis;

  let activeCache = [];
  let trashCache = [];
  let loading = false;
  let trashOpen = false;
  let selectedIds = new Set();
  let sessionRef = null;

  async function fetchMistakes(username, status) {
    const url =
      "/api/student-mistakes?username=" +
      encodeURIComponent(username) +
      "&status=" +
      encodeURIComponent(status);
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not load mistakes.");
    }
    const data = await res.json();
    return Array.isArray(data.mistakes) ? data.mistakes : [];
  }

  async function trashMistake(username, id) {
    const res = await fetch("/api/student-mistakes/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not delete.");
    return data;
  }

  async function restoreMistake(username, id) {
    const res = await fetch("/api/student-mistakes/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not restore.");
    return data;
  }

  function setStatus(msg, isError) {
    const el = document.getElementById("hw-student-mistakes-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("hw-maker-status--error", !!isError);
  }

  function entryCopyText(entry) {
    let text = "❌" + (entry.text || "");
    if (entry.correction) text += "\n✅" + entry.correction;
    return text;
  }

  function clearSelection() {
    selectedIds.clear();
    updateActions();
    document.querySelectorAll(".hw-mistake-feed__item--selected").forEach((el) => {
      el.classList.remove("hw-mistake-feed__item--selected");
      el.setAttribute("aria-pressed", "false");
    });
  }

  function updateActions() {
    const bar = document.getElementById("hw-student-mistakes-actions");
    if (!bar) return;
    bar.hidden = trashOpen || selectedIds.size === 0;
  }

  function updateTrashBadge() {
    const badge = document.getElementById("hw-student-mistakes-trash-count");
    const btn = document.getElementById("hw-student-mistakes-trash-btn");
    if (!badge) return;
    const n = trashCache.length;
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = String(n);
    } else {
      badge.hidden = true;
      badge.textContent = "";
    }
    if (btn) btn.classList.toggle("hw-student-mistakes__trash-btn--has-items", n > 0);
  }

  function toggleSelect(entry, btn) {
    if (!entry.id) return;
    if (selectedIds.has(entry.id)) {
      selectedIds.delete(entry.id);
      btn.classList.remove("hw-mistake-feed__item--selected");
      btn.setAttribute("aria-pressed", "false");
    } else {
      selectedIds.add(entry.id);
      btn.classList.add("hw-mistake-feed__item--selected");
      btn.setAttribute("aria-pressed", "true");
    }
    updateActions();
  }

  function createSelectableItem(entry) {
    const li = document.createElement("li");
    li.className = "hw-mistake-feed__item hw-mistake-feed__item--selectable";
    if (entry.id) li.dataset.mistakeId = entry.id;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hw-mistake-feed__select-btn";
    btn.setAttribute("aria-pressed", selectedIds.has(entry.id) ? "true" : "false");

    const pair = win.HwMistakeFeed?.createFeedItem
      ? (function () {
          const inner = document.createElement("div");
          inner.className = "hw-mistake-feed__pair";
          const wrong = document.createElement("p");
          wrong.className = "hw-mistake-feed__wrong";
          wrong.textContent = "❌" + (entry.text || "");
          inner.appendChild(wrong);
          if (entry.correction) {
            const right = document.createElement("p");
            right.className = "hw-mistake-feed__right";
            right.textContent = "✅" + entry.correction;
            inner.appendChild(right);
          }
          return inner;
        })()
      : null;

    if (pair) btn.appendChild(pair);
    if (selectedIds.has(entry.id)) btn.classList.add("hw-mistake-feed__item--selected");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSelect(entry, btn);
    });

    li.appendChild(btn);
    return li;
  }

  function createTrashItem(entry, session) {
    const li = document.createElement("li");
    li.className = "hw-mistake-feed__item hw-mistake-feed__item--trash";

    const row = document.createElement("div");
    row.className = "hw-mistake-feed__trash-row";

    const body = document.createElement("div");
    body.className = "hw-mistake-feed__trash-body";
    const item = win.HwMistakeFeed?.createFeedItem(entry, {});
    if (item) {
      const pair = item.querySelector(".hw-mistake-feed__pair");
      if (pair) body.appendChild(pair);
    }

    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "btn btn--ghost btn--sm";
    restore.textContent = "Restore";
    restore.addEventListener("click", () => {
      restore.disabled = true;
      restoreMistake(session.username, entry.id)
        .then(() => reload(session))
        .then(() => setStatus("Restored ✓"))
        .catch((err) => setStatus((err && err.message) || "Could not restore.", true))
        .finally(() => {
          restore.disabled = false;
        });
    });

    row.append(body, restore);
    li.appendChild(row);
    return li;
  }

  function renderActiveList(container, entries) {
    if (!container) return;
    container.innerHTML = "";
    entries.forEach((entry) => {
      container.appendChild(createSelectableItem(entry));
    });
  }

  function renderMain(session) {
    const singleEl = document.getElementById("hw-student-mistakes-single");
    const foldEl = document.getElementById("hw-student-mistakes-fold");
    const previewEl = document.getElementById("hw-student-mistakes-preview");
    const expandLabel = document.getElementById("hw-student-mistakes-expand-label");
    const listEl = document.getElementById("hw-student-mistakes-list");
    const emptyEl = document.getElementById("hw-student-mistakes-empty");
    const metaEl = document.getElementById("hw-student-mistakes-meta");

    const sorted = win.HwMistakeFeed?.sortByRecent(activeCache) || activeCache.slice();
    const count = sorted.length;

    if (singleEl) singleEl.hidden = true;
    if (foldEl) foldEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    if (loading && !count) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "Loading…";
      }
      if (metaEl) metaEl.textContent = "";
      return;
    }

    if (!count) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "No mistakes on your list — nice work!";
      }
      if (metaEl) metaEl.textContent = "";
      return;
    }

    if (metaEl) {
      metaEl.textContent =
        count + " to work on — tap to select, then copy or delete.";
    }

    const latest = sorted[0];

    if (count === 1) {
      if (singleEl) {
        singleEl.hidden = false;
        singleEl.innerHTML = "";
        singleEl.appendChild(createSelectableItem(latest));
      }
      return;
    }

    if (foldEl) {
      foldEl.hidden = false;
      if (expandLabel) expandLabel.textContent = "Show all (" + count + ")";
      if (previewEl) {
        previewEl.innerHTML = "";
        previewEl.appendChild(createSelectableItem(latest));
      }
      renderActiveList(listEl, sorted);
    }
  }

  function renderTrash(session) {
    const listEl = document.getElementById("hw-student-mistakes-trash-list");
    const emptyEl = document.getElementById("hw-student-mistakes-trash-empty");
    if (!listEl) return;

    const sorted = win.HwMistakeFeed?.sortByRecent(trashCache) || trashCache.slice();
    listEl.innerHTML = "";

    if (!sorted.length) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = "Nothing in the trash.";
      }
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    sorted.forEach((entry) => {
      listEl.appendChild(createTrashItem(entry, session));
    });
  }

  function render(session) {
    sessionRef = session;
    const mainEl = document.getElementById("hw-student-mistakes-main");
    const trashPanel = document.getElementById("hw-student-mistakes-trash-panel");
    const titleEl = document.getElementById("hw-student-mistakes-title");
    const descEl = document.getElementById("hw-student-mistakes-desc");
    const trashBtn = document.getElementById("hw-student-mistakes-trash-btn");

    updateTrashBadge();

    if (trashOpen) {
      if (mainEl) mainEl.hidden = true;
      if (trashPanel) trashPanel.hidden = false;
      if (titleEl) titleEl.textContent = "Deleted mistakes";
      if (descEl) descEl.textContent = "Restore anything you deleted by mistake.";
      if (trashBtn) trashBtn.classList.add("hw-student-mistakes__trash-btn--open");
      clearSelection();
      renderTrash(session);
    } else {
      if (mainEl) mainEl.hidden = false;
      if (trashPanel) trashPanel.hidden = true;
      if (titleEl) titleEl.textContent = "Recent mistakes";
      if (descEl) descEl.textContent = "From your lessons — tap to select, then copy or delete.";
      if (trashBtn) trashBtn.classList.remove("hw-student-mistakes__trash-btn--open");
      renderMain(session);
    }

    updateActions();
  }

  async function reload(session) {
    const [active, trash] = await Promise.all([
      fetchMistakes(session.username, "active"),
      fetchMistakes(session.username, "resolved"),
    ]);
    activeCache = active;
    trashCache = trash;
    selectedIds = new Set(
      [...selectedIds].filter((id) => activeCache.some((m) => m.id === id))
    );
    render(session);
  }

  async function copySelected() {
    const entries = activeCache.filter((m) => selectedIds.has(m.id));
    if (!entries.length) return;
    const text = entries.map(entryCopyText).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied ✓");
    } catch {
      setStatus("Could not copy — try again.", true);
    }
  }

  async function deleteSelected(session) {
    const ids = [...selectedIds];
    if (!ids.length || !session?.username) return;

    const deleteBtn = document.getElementById("hw-student-mistakes-delete");
    if (deleteBtn) deleteBtn.disabled = true;

    try {
      for (let i = 0; i < ids.length; i++) {
        setStatus("Deleting " + (i + 1) + " / " + ids.length + "…");
        await trashMistake(session.username, ids[i]);
      }
      clearSelection();
      await reload(session);
      setStatus(ids.length === 1 ? "Moved to trash ✓" : "Moved " + ids.length + " to trash ✓");
    } catch (err) {
      setStatus((err && err.message) || "Could not delete.", true);
      await reload(session);
    } finally {
      if (deleteBtn) deleteBtn.disabled = false;
    }
  }

  function bindOnce() {
    if (bindOnce.done) return;
    bindOnce.done = true;

    document.getElementById("hw-student-mistakes-trash-btn")?.addEventListener("click", () => {
      trashOpen = !trashOpen;
      if (!trashOpen) clearSelection();
      render(sessionRef);
    });

    document.getElementById("hw-student-mistakes-copy")?.addEventListener("click", () => {
      void copySelected();
    });

    document.getElementById("hw-student-mistakes-delete")?.addEventListener("click", () => {
      if (sessionRef) void deleteSelected(sessionRef);
    });
  }

  async function load(session) {
    const card = document.getElementById("hw-student-mistakes-card");
    if (!session?.username) return;

    bindOnce();
    sessionRef = session;
    loading = true;
    render(session);

    try {
      await reload(session);
      if (card) card.hidden = false;
    } catch {
      activeCache = [];
      trashCache = [];
      if (card) card.hidden = false;
      const metaEl = document.getElementById("hw-student-mistakes-meta");
      if (metaEl) metaEl.textContent = "Could not load your mistake list.";
    } finally {
      loading = false;
      render(session);
    }
  }

  win.HwStudentMistakes = { load };
})();
