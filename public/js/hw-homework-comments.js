/**
 * Homework comment cloud — highlight text on the worksheet, attach a memo bubble.
 */
(function (global) {
  const DRAFT_SAVE_MS = 700;
  const LAUNCHER_POS = { x: 92, y: 10 };
  const LAUNCHER_POS_KEY = "jlm-hc-launcher-pos";
  const DRAG_THRESHOLD = 5;
  const SKIP_SELECTOR =
    "input, textarea, select, button, a, label, video, audio, .hw-hc-launcher, .hw-hc-memo, .hw-hc-mini, .hw-hc-highlight";

  let hostEl = null;
  let shellEl = null;
  let layersEl = null;
  let launcherEl = null;
  let config = null;
  let comments = [];
  let armed = false;
  let activeCommentId = null;
  let draftSaveTimer = null;
  let draftSaveInFlight = null;
  let built = false;
  let docPointerBound = null;
  let keyDownBound = null;
  let dragState = null;

  function uid() {
    return "hc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function findHost() {
    const v4 = document.querySelector("#hw-hub-v4-homework .hw-hub-v2-worksheet");
    if (v4 && !v4.hidden && !v4.closest("[hidden]")) return v4;
    const legacy = document.getElementById("hw-worksheet-section");
    if (legacy && !legacy.hidden && !legacy.closest("[hidden]")) return legacy;
    const mount = document.getElementById("hw-worksheet-mount");
    if (mount && mount.querySelector(".hw-worksheet")) return mount;
    return null;
  }

  function hostIsVisible(el) {
    return el && !el.hidden && !el.closest("[hidden]") && el.offsetParent !== null;
  }

  function storageKey() {
    if (!config?.username || !config?.assignmentId) return "";
    return "jlm-hw-comments-" + config.username + "-" + config.assignmentId;
  }

  function storageTsKey() {
    return storageKey() + ":ts";
  }

  function pctClamp(n) {
    return Math.min(98, Math.max(2, n));
  }

  function clampBubbleAnchorX(xPct) {
    const hostW = hostEl?.clientWidth || 520;
    const halfBubblePct = ((176 / 2 + 12) / hostW) * 100;
    return Math.min(100 - halfBubblePct, Math.max(halfBubblePct, xPct));
  }

  function loadLauncherPos() {
    try {
      const raw = JSON.parse(localStorage.getItem(LAUNCHER_POS_KEY) || "null");
      if (raw && typeof raw.x === "number" && typeof raw.y === "number") {
        return { x: pctClamp(raw.x), y: pctClamp(raw.y) };
      }
    } catch (_) {}
    return { ...LAUNCHER_POS };
  }

  function saveLauncherPos(x, y) {
    try {
      localStorage.setItem(LAUNCHER_POS_KEY, JSON.stringify({ x: pctClamp(x), y: pctClamp(y) }));
    } catch (_) {}
  }

  function hostRectToPct(rect) {
    if (!hostEl) return null;
    const hostRect = hostEl.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height || !rect.width) return null;
    return {
      left: pctClamp(((rect.left - hostRect.left) / hostRect.width) * 100),
      top: pctClamp(((rect.top - hostRect.top) / hostRect.height) * 100),
      right: pctClamp(((rect.right - hostRect.left) / hostRect.width) * 100),
      bottom: pctClamp(((rect.bottom - hostRect.top) / hostRect.height) * 100),
      width: pctClamp((rect.width / hostRect.width) * 100),
      height: pctClamp((rect.height / hostRect.height) * 100),
    };
  }

  function pctRectToStyle(anchorRect) {
    if (!anchorRect) return {};
    return {
      left: anchorRect.left + "%",
      top: anchorRect.top + "%",
      width: anchorRect.width + "%",
      height: anchorRect.height + "%",
    };
  }

  function defaultMiniPos(comment) {
    const r = comment.anchorRect;
    if (!r) return { x: 50, y: 20 };
    return { x: r.right, y: r.top };
  }

  function defaultMemoPos(comment) {
    const r = comment.anchorRect;
    if (!r) return { x: 50, y: 20 };
    const centerX = clampBubbleAnchorX(r.left + r.width / 2);
    return { x: centerX, y: r.top };
  }

  function getCloudPos(comment, mode) {
    if (typeof comment.x === "number" && typeof comment.y === "number") {
      return { x: comment.x, y: comment.y };
    }
    return mode === "memo" ? defaultMemoPos(comment) : defaultMiniPos(comment);
  }

  function applyCloudPos(el, comment, mode) {
    const pos = getCloudPos(comment, mode);
    el.style.left = pos.x + "%";
    el.style.top = pos.y + "%";
  }

  function updateCloudPos(id, x, y, persist) {
    if (persist === undefined) persist = true;
    const now = new Date().toISOString();
    comments = comments.map((c) =>
      c.id === id ? { ...c, x: pctClamp(x), y: pctClamp(y), updatedAt: now } : c
    );
    if (persist) {
      saveLocal();
      queueDraftSave();
    }
  }

  function ensureCloudPosOnMinimize(id) {
    const comment = comments.find((c) => c.id === id);
    if (!comment || typeof comment.x === "number") return;
    const pos = defaultMemoPos(comment);
    updateCloudPos(id, pos.x, pos.y, false);
  }

  function dedupeComments(list) {
    const out = [];
    const byAnchor = new Map();
    list.forEach((c) => {
      if (!c.anchor) {
        out.push(c);
        return;
      }
      const existing = byAnchor.get(c.anchor);
      if (!existing) {
        byAnchor.set(c.anchor, c);
        return;
      }
      const pickExisting =
        (existing.text.trim() && !c.text.trim()) ||
        (existing.text.trim() === c.text.trim() &&
          Date.parse(existing.updatedAt || existing.createdAt || 0) >=
            Date.parse(c.updatedAt || c.createdAt || 0));
      const keep = pickExisting ? existing : c;
      const drop = pickExisting ? c : existing;
      byAnchor.set(c.anchor, {
        ...keep,
        text: keep.text.trim() ? keep.text : drop.text,
        anchorRect: keep.anchorRect || drop.anchorRect,
        x: typeof keep.x === "number" ? keep.x : drop.x,
        y: typeof keep.y === "number" ? keep.y : drop.y,
      });
    });
    return out.concat([...byAnchor.values()]);
  }

  function normalizeComments(raw, forSubmit) {
    if (!Array.isArray(raw)) return [];
    const list = dedupeComments(
      raw
      .map((c) => ({
        id: String(c.id || uid()),
        text: String(c.text || ""),
        anchor: c.anchor ? String(c.anchor) : undefined,
        anchorRect:
          c.anchorRect && typeof c.anchorRect === "object"
            ? {
                left: Number(c.anchorRect.left),
                top: Number(c.anchorRect.top),
                right: Number(c.anchorRect.right),
                bottom: Number(c.anchorRect.bottom),
                width: Number(c.anchorRect.width),
                height: Number(c.anchorRect.height),
              }
            : undefined,
        x: typeof c.x === "number" ? c.x : undefined,
        y: typeof c.y === "number" ? c.y : undefined,
        createdAt: c.createdAt || new Date().toISOString(),
        updatedAt: c.updatedAt,
      }))
      .filter((c) => c.anchor || c.text.trim().length > 0)
    );
    if (forSubmit) return list.filter((c) => c.text.trim().length > 0);
    return list;
  }

  function saveLocal() {
    const key = storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(comments));
      localStorage.setItem(storageTsKey(), String(Date.now()));
    } catch (_) {}
  }

  async function saveDraftToServer(list) {
    if (!config?.username || !config?.assignmentId || config.readOnly) return;
    const payload = {
      username: config.username,
      assignmentId: config.assignmentId,
      comments: list,
    };
    const res = await fetch(
      "/api/homework-comments-draft?username=" +
        encodeURIComponent(config.username) +
        "&assignmentId=" +
        encodeURIComponent(config.assignmentId),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Comment save failed.");
    }
  }

  function queueDraftSave() {
    if (config?.readOnly) return;
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      void flushDraftSave();
    }, DRAFT_SAVE_MS);
  }

  async function flushDraftSave() {
    if (config?.readOnly) return;
    const list = normalizeComments(comments);
    saveLocal();
    const work = saveDraftToServer(list)
      .catch(() => {})
      .finally(() => {
        if (draftSaveInFlight === work) draftSaveInFlight = null;
      });
    draftSaveInFlight = work;
    return work;
  }

  async function hydrateDraftFromAccount() {
    if (config?.readOnly) return;
    const key = storageKey();
    if (!key) return;

    let localList = [];
    let localTs = 0;
    try {
      localList = normalizeComments(JSON.parse(localStorage.getItem(key) || "[]"));
      localTs = parseInt(localStorage.getItem(storageTsKey()) || "0", 10) || 0;
    } catch (_) {}

    let serverList = null;
    let serverTs = 0;
    try {
      const res = await fetch(
        "/api/homework-comments-draft?username=" +
          encodeURIComponent(config.username) +
          "&assignmentId=" +
          encodeURIComponent(config.assignmentId),
        { cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.draft?.comments) {
          serverList = normalizeComments(data.draft.comments);
          serverTs = data.draft.updatedAt ? Date.parse(data.draft.updatedAt) : 0;
        }
      }
    } catch (_) {}

    if (serverList?.length) {
      if (localTs > serverTs && localList.length) {
        comments = localList.map(sanitizeCloudPos);
        queueDraftSave();
      } else {
        comments = serverList.map(sanitizeCloudPos);
        saveLocal();
      }
    } else if (localList.length) {
      comments = localList.map(sanitizeCloudPos);
      queueDraftSave();
    }
    const deduped = dedupeComments(comments);
    if (deduped.length !== comments.length) {
      comments = deduped.map(sanitizeCloudPos);
      saveLocal();
      queueDraftSave();
    }
    renderAll();
  }

  function setArmed(next) {
    armed = !!next;
    hostEl?.classList.toggle("hw-hc-armed", armed);
    launcherEl?.classList.toggle("is-armed", armed);
    launcherEl?.setAttribute("aria-pressed", armed ? "true" : "false");
    if (armed) {
      activeCommentId = null;
      global.HwMagnifyingGlass?.setArmed?.(false);
    } else {
      window.getSelection()?.removeAllRanges();
    }
  }

  function disarm() {
    if (!armed) return;
    setArmed(false);
  }

  function sanitizeCloudPos(comment) {
    if (typeof comment.x !== "number" || typeof comment.y !== "number") return comment;
    const x = comment.x;
    const y = comment.y;
    if (x < 8 || x > 92 || y < 4 || y > 96) {
      const next = { ...comment };
      delete next.x;
      delete next.y;
      return next;
    }
    return comment;
  }

  function minimizeActive() {
    if (activeCommentId) {
      const comment = comments.find((c) => c.id === activeCommentId);
      if (comment && !comment.text.trim()) {
        removeComment(activeCommentId);
        return;
      }
      ensureCloudPosOnMinimize(activeCommentId);
    }
    activeCommentId = null;
    renderAll();
  }

  function expandComment(id) {
    activeCommentId = id;
    renderAll();
    requestAnimationFrame(() => {
      fitExpandedMemo(id);
      const memo = layersEl?.querySelector('.hw-hc-memo[data-id="' + id + '"] textarea');
      memo?.focus();
    });
  }

  function fitExpandedMemo(id) {
    const memo = layersEl?.querySelector('.hw-hc-memo[data-id="' + id + '"]');
    if (!memo || !hostEl) return;
    const hostRect = hostEl.getBoundingClientRect();
    const rect = memo.getBoundingClientRect();
    const pad = 12;
    let dx = 0;
    let dy = 0;
    if (rect.left < hostRect.left + pad) dx = hostRect.left + pad - rect.left;
    else if (rect.right > hostRect.right - pad) dx = hostRect.right - pad - rect.right;
    if (rect.top < hostRect.top + pad) dy = hostRect.top + pad - rect.top;
    if (!dx && !dy) return;
    const comment = comments.find((c) => c.id === id);
    if (!comment) return;
    const pos = getCloudPos(comment, "memo");
    const newX = pctClamp(pos.x + (dx / hostRect.width) * 100);
    const newY = pctClamp(pos.y + (dy / hostRect.height) * 100);
    memo.style.left = newX + "%";
    memo.style.top = newY + "%";
    updateCloudPos(id, newX, newY);
  }

  function updateCommentText(id, text) {
    const now = new Date().toISOString();
    comments = comments.map((c) =>
      c.id === id ? { ...c, text, updatedAt: now } : c
    );
    updateLauncherBadge();
    queueDraftSave();
  }

  function removeComment(id) {
    comments = comments.filter((c) => c.id !== id);
    if (activeCommentId === id) activeCommentId = null;
    renderAll();
    queueDraftSave();
  }

  function findCommentByAnchor(anchor) {
    return comments.find((c) => c.anchor === anchor);
  }

  function createCommentFromSelection(text, anchorRect) {
    const existing = findCommentByAnchor(text);
    if (existing) {
      existing.anchorRect = anchorRect;
      return existing.id;
    }
    const id = uid();
    comments.push({
      id,
      text: "",
      anchor: text,
      anchorRect,
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  function onHostMouseUp(ev) {
    if (!armed || config?.readOnly) return;
    if (ev.target.closest(SKIP_SELECTOR)) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;
    if (!hostEl?.contains(sel.anchorNode)) return;

    let range;
    try {
      range = sel.getRangeAt(0);
    } catch {
      return;
    }
    const rect = range.getBoundingClientRect();
    const anchorRect = hostRectToPct(rect);
    if (!anchorRect) return;

    const id = createCommentFromSelection(text, anchorRect);
    setArmed(false);
    sel.removeAllRanges();
    expandComment(id);
    saveLocal();
    queueDraftSave();
  }

  function onKeyDown(ev) {
    if (ev.key !== "Escape") return;
    if (armed) {
      setArmed(false);
      ev.preventDefault();
      return;
    }
    if (activeCommentId) {
      minimizeActive();
      ev.preventDefault();
    }
  }

  function onLauncherClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onDocPointerDown(ev) {
    if (dragState?.moved) return;
    if (ev.target.closest(".hw-hc-highlight")) return;
    if (ev.target.closest(".hw-hc-memo")) return;
    if (ev.target.closest(".hw-hc-mini")) return;
    if (!activeCommentId) return;
    minimizeActive();
  }

  function onCloudDragStart(ev, commentId, mode, el, handleEl) {
    if (config?.readOnly || ev.button !== 0) return;
    if (ev.target.closest(".hw-hc-memo__input") || ev.target.closest("button")) return;

    ev.stopPropagation();

    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;
    const pos = getCloudPos(comment, mode);

    dragState = {
      pointerId: ev.pointerId,
      commentId,
      mode,
      el,
      handleEl: handleEl || el,
      startX: ev.clientX,
      startY: ev.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
      expandOnUp: mode === "mini",
    };
    el.classList.add("is-dragging");
    (handleEl || el).setPointerCapture(ev.pointerId);
  }

  function onCloudDragMove(ev) {
    if (!dragState || dragState.pointerId !== ev.pointerId || !hostEl) return;
    const dx = ev.clientX - dragState.startX;
    const dy = ev.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

    dragState.moved = true;
    ev.preventDefault();
    ev.stopPropagation();

    const hostRect = hostEl.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return;
    const nextX = dragState.originX + (dx / hostRect.width) * 100;
    const nextY = dragState.originY + (dy / hostRect.height) * 100;
    dragState.el.style.left = pctClamp(nextX) + "%";
    dragState.el.style.top = pctClamp(nextY) + "%";
  }

  function onCloudDragEnd(ev) {
    if (!dragState || dragState.pointerId !== ev.pointerId) return;

    const state = dragState;
    dragState = null;
    state.el.classList.remove("is-dragging");

    if (state.moved) {
      const x = parseFloat(state.el.style.left) || 0;
      const y = parseFloat(state.el.style.top) || 0;
      updateCloudPos(state.commentId, x, y);
      renderAll();
    } else if (state.expandOnUp) {
      expandComment(state.commentId);
    }

    try {
      (state.handleEl || state.el).releasePointerCapture(ev.pointerId);
    } catch (_) {}
  }

  function bindCloudDrag(handleEl, commentId, mode, moveEl) {
    const target = moveEl || handleEl;
    const onDown = (ev) => onCloudDragStart(ev, commentId, mode, target, handleEl);
    handleEl.addEventListener("pointerdown", onDown);
    handleEl.addEventListener("pointermove", onCloudDragMove);
    handleEl.addEventListener("pointerup", onCloudDragEnd);
    handleEl.addEventListener("pointercancel", onCloudDragEnd);
  }

  let launcherDrag = null;

  function bindLauncherDrag() {
    if (!launcherEl) return;
    launcherEl.addEventListener("pointerdown", (ev) => {
      if (config?.readOnly || ev.button !== 0) return;
      ev.stopPropagation();
      const pos = loadLauncherPos();
      launcherDrag = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        originX: parseFloat(launcherEl.style.left) || pos.x,
        originY: parseFloat(launcherEl.style.top) || pos.y,
        moved: false,
      };
      launcherEl.classList.add("is-dragging");
      launcherEl.setPointerCapture(ev.pointerId);
    });
    launcherEl.addEventListener("pointermove", (ev) => {
      if (!launcherDrag || launcherDrag.pointerId !== ev.pointerId || !hostEl) return;
      const dx = ev.clientX - launcherDrag.startX;
      const dy = ev.clientY - launcherDrag.startY;
      if (!launcherDrag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      launcherDrag.moved = true;
      ev.preventDefault();
      const hostRect = hostEl.getBoundingClientRect();
      if (!hostRect.width || !hostRect.height) return;
      launcherEl.style.left =
        pctClamp(launcherDrag.originX + (dx / hostRect.width) * 100) + "%";
      launcherEl.style.top =
        pctClamp(launcherDrag.originY + (dy / hostRect.height) * 100) + "%";
    });
    launcherEl.addEventListener("pointerup", (ev) => {
      if (!launcherDrag || launcherDrag.pointerId !== ev.pointerId) return;
      launcherEl.classList.remove("is-dragging");
      if (launcherDrag.moved) {
        saveLauncherPos(parseFloat(launcherEl.style.left), parseFloat(launcherEl.style.top));
      } else {
        setArmed(!armed);
        if (armed) minimizeActive();
      }
      launcherDrag = null;
      try {
        launcherEl.releasePointerCapture(ev.pointerId);
      } catch (_) {}
    });
    launcherEl.addEventListener("pointercancel", (ev) => {
      if (!launcherDrag || launcherDrag.pointerId !== ev.pointerId) return;
      launcherEl.classList.remove("is-dragging");
      launcherDrag = null;
    });
  }

  function bindKeyDown() {
    if (keyDownBound) return;
    keyDownBound = onKeyDown;
    document.addEventListener("keydown", keyDownBound);
  }

  function bindDocPointer() {
    if (docPointerBound) return;
    docPointerBound = onDocPointerDown;
    document.addEventListener("pointerdown", docPointerBound, true);
  }

  function unbindKeyDown() {
    if (!keyDownBound) return;
    document.removeEventListener("keydown", keyDownBound);
    keyDownBound = null;
  }

  function unbindDocPointer() {
    if (!docPointerBound) return;
    document.removeEventListener("pointerdown", docPointerBound, true);
    docPointerBound = null;
  }

  function cloudIconSvg(className) {
    return (
      '<svg class="' +
      className +
      '" viewBox="0 0 64 40" aria-hidden="true">' +
      '<path d="M18 32h34a14 14 0 0 0 .4-28A18 18 0 0 0 14 8 12 12 0 0 0 18 32z" fill="currentColor"/>' +
      "</svg>"
    );
  }

  function renderHighlight(comment) {
    if (!comment.anchorRect) return null;
    const el = document.createElement("div");
    el.className = "hw-hc-highlight";
    el.dataset.id = comment.id;
    Object.assign(el.style, pctRectToStyle(comment.anchorRect));
    if (!config?.readOnly) {
      el.style.pointerEvents = "auto";
      el.style.cursor = "pointer";
      el.title = "Open note";
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        expandComment(comment.id);
      });
    }
    return el;
  }

  function renderMini(comment) {
    if (!comment.anchorRect || activeCommentId === comment.id) return null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hw-hc-mini";
    btn.dataset.id = comment.id;
    applyCloudPos(btn, comment, "mini");
    btn.setAttribute(
      "aria-label",
      comment.text.trim()
        ? "Edit note on “" + comment.anchor + "”"
        : "Add note on “" + comment.anchor + "”"
    );
    btn.innerHTML = cloudIconSvg("hw-hc-mini__icon");
    if (!config?.readOnly) bindCloudDrag(btn, comment.id, "mini");
    else {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        expandComment(comment.id);
      });
    }
    return btn;
  }

  function renderMemo(comment) {
    if (activeCommentId !== comment.id || !comment.anchorRect) return null;

    const wrap = document.createElement("div");
    wrap.className = "hw-hc-memo hw-hc-memo--expanded";
    wrap.dataset.id = comment.id;
    applyCloudPos(wrap, comment, "memo");

    const quote = document.createElement("p");
    quote.className = "hw-hc-memo__quote";
    quote.textContent = "“" + comment.anchor + "”";
    if (!config?.readOnly) quote.title = "Drag to move";

    const body = document.createElement("div");
    body.className = "hw-hc-memo__body";

    const input = document.createElement("textarea");
    input.className = "hw-hc-memo__input";
    input.rows = 3;
    input.maxLength = 500;
    input.placeholder = "Your note for JD…";
    input.value = comment.text || "";
    input.readOnly = !!config?.readOnly;
    input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    input.addEventListener("click", (ev) => ev.stopPropagation());
    input.addEventListener("input", () => {
      updateCommentText(comment.id, input.value);
    });

    body.appendChild(input);

    if (!config?.readOnly) {
      const actions = document.createElement("div");
      actions.className = "hw-hc-memo__actions";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn--ghost btn--sm";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeComment(comment.id);
      });

      actions.appendChild(removeBtn);
      body.appendChild(actions);
    }

    wrap.append(quote, body);
    body.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    body.addEventListener("click", (ev) => ev.stopPropagation());
    if (!config?.readOnly) bindCloudDrag(quote, comment.id, "memo", wrap);
    return wrap;
  }

  function renderAll() {
    if (!layersEl) return;
    layersEl.replaceChildren();
    comments.forEach((comment) => {
      const highlight = renderHighlight(comment);
      const mini = renderMini(comment);
      const memo = renderMemo(comment);
      if (highlight) layersEl.appendChild(highlight);
      if (mini) layersEl.appendChild(mini);
      if (memo) layersEl.appendChild(memo);
    });
    updateLauncherBadge();
  }

  function updateLauncherBadge() {
    const badge = launcherEl?.querySelector(".hw-hc-launcher__badge");
    if (!badge) return;
    const n = comments.filter((c) => c.anchor && c.anchorRect).length;
    if (n > 0) {
      badge.hidden = false;
      badge.textContent = String(n);
    } else {
      badge.hidden = true;
    }
  }

  function buildShell() {
    if (!hostEl || built) return;
    hostEl.classList.add("hw-hc-host");

    shellEl = document.createElement("div");
    shellEl.className = "hw-hc-shell";
    shellEl.setAttribute("aria-hidden", "true");

    layersEl = document.createElement("div");
    layersEl.className = "hw-hc-layers";

    launcherEl = document.createElement("button");
    launcherEl.type = "button";
    launcherEl.className = "hw-hc-launcher";
    const launcherPos = loadLauncherPos();
    launcherEl.style.left = launcherPos.x + "%";
    launcherEl.style.top = launcherPos.y + "%";
    launcherEl.setAttribute("aria-label", "Add a note on highlighted text");
    launcherEl.setAttribute("aria-pressed", "false");
    launcherEl.innerHTML =
      cloudIconSvg("hw-hc-launcher__icon") +
      '<span class="hw-hc-launcher__badge" hidden></span>';

    launcherEl.addEventListener("click", onLauncherClick);
    bindLauncherDrag();

    shellEl.append(layersEl, launcherEl);
    hostEl.appendChild(shellEl);

    hostEl.addEventListener("mouseup", onHostMouseUp);
    bindDocPointer();
    bindKeyDown();
    built = true;
    renderAll();
  }

  function teardown() {
    clearTimeout(draftSaveTimer);
    dragState = null;
    launcherDrag = null;
    unbindDocPointer();
    unbindKeyDown();
    if (hostEl) {
      hostEl.removeEventListener("mouseup", onHostMouseUp);
      hostEl.classList.remove("hw-hc-host", "hw-hc-armed");
      hostEl.querySelector(":scope > .hw-hc-shell")?.remove();
    }
    hostEl = null;
    shellEl = null;
    layersEl = null;
    launcherEl = null;
    built = false;
    armed = false;
    activeCommentId = null;
  }

  function attachTo(formEl, options) {
    options = options || {};
    teardown();

    config = {
      username: options.username || "",
      assignmentId: options.assignmentId || formEl?.getAttribute("data-assignment-id") || "",
      readOnly: !!options.readOnly,
    };

    if (options.initialComments?.length) {
      comments = normalizeComments(options.initialComments);
    } else {
      comments = [];
    }

    hostEl = formEl?.closest(".hw-hub-v2-worksheet") || formEl?.parentElement || findHost();
    if (!hostEl) return false;

    buildShell();

    if (config.readOnly) {
      if (launcherEl) launcherEl.hidden = true;
      renderAll();
      return true;
    }

    void hydrateDraftFromAccount();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return true;
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") void flushDraftSave();
  }

  function onPageHide() {
    if (config?.readOnly || !config?.username || !config?.assignmentId) return;
    saveLocal();
    const payload = JSON.stringify({
      username: config.username,
      assignmentId: config.assignmentId,
      comments: normalizeComments(comments),
    });
    const url =
      "/api/homework-comments-draft?username=" +
      encodeURIComponent(config.username) +
      "&assignmentId=" +
      encodeURIComponent(config.assignmentId);
    try {
      fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    } catch (_) {
      void flushDraftSave();
    }
  }

  function getCommentsForSubmit() {
    return normalizeComments(comments, true);
  }

  function freezeAfterSubmit() {
    if (!config) return;
    config.readOnly = true;
    setArmed(false);
    minimizeActive();
  }

  async function clearDraftStorage() {
    clearTimeout(draftSaveTimer);
    if (draftSaveInFlight) {
      try {
        await draftSaveInFlight;
      } catch (_) {}
    }
    const key = storageKey();
    try {
      if (key) {
        localStorage.removeItem(key);
        localStorage.removeItem(storageTsKey());
      }
    } catch (_) {}
    if (!config?.username || !config?.assignmentId) return;
    try {
      await fetch(
        "/api/homework-comments-draft?username=" +
          encodeURIComponent(config.username) +
          "&assignmentId=" +
          encodeURIComponent(config.assignmentId),
        { method: "DELETE" }
      );
    } catch (_) {}
  }

  async function clearDraft() {
    await clearDraftStorage();
    comments = [];
    renderAll();
  }

  function init() {}

  function refresh() {
    if (hostEl && hostIsVisible(hostEl)) return true;
    return false;
  }

  function destroy() {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
    teardown();
    config = null;
    comments = [];
  }

  global.HwHomeworkComments = {
    init,
    refresh,
    destroy,
    attachTo,
    setArmed,
    disarm,
    getCommentsForSubmit,
    clearDraft,
    clearDraftStorage,
    freezeAfterSubmit,
  };
})(window);
