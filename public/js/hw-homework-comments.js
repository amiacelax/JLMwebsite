/**
 * Homework comment cloud — highlight text on the worksheet, attach a note bubble.
 */
(function (global) {
  if (!global.HwFeatureFlags?.homeworkComments?.()) return;

  (function ensureCommentStyles() {
    if (document.querySelector("[data-hw-comments-css]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/hw-homework-comments.css?v=20";
    link.setAttribute("data-hw-comments-css", "1");
    document.head.appendChild(link);
  })();

  const DRAFT_SAVE_MS = 700;
  const LAUNCHER_POS_KEY = "jlm-hc-launcher-pos";
  const LAUNCHER_SNAP_IDS = ["tl", "tc", "tr", "ml", "mr", "bl", "bc", "br"];
  const ONBOARD_KEY = "hw-hc-onboarding-v1";
  const MG_ONBOARD_KEY = "hw-mg-onboarding-v1";
  const DRAG_THRESHOLD = 5;
  const TOUCH_HOLD_MS = 420;
  const TOUCH_MOVE_CANCEL = 12;
  const SKIP_SELECTOR =
    "input, textarea, select, button, a, label, video, audio, .hw-tools-cleanup, .hw-hc-launcher, .hw-hc-memo, .hw-hc-mini, .hw-hc-onboard, .hw-hc-sel-menu";
  const TOUCH_SKIP_EXTRA =
    ", .hw-star-block__reset, .hw-star-block__slot-clear, .hw-star-block__slot:not(.hw-star-block__slot--filled)";

  function openDeleteConfirmPopover(anchorBtn, onConfirm) {
    if (typeof global._hwDeleteConfirmClose === "function") global._hwDeleteConfirmClose();

    const pop = document.createElement("div");
    pop.className = "hw-delete-confirm-popover";
    pop.setAttribute("role", "alertdialog");
    pop.setAttribute("aria-modal", "true");
    pop.innerHTML =
      '<p class="hw-delete-confirm-popover__q" id="hw-delete-confirm-q" lang="ja">いいの？</p>' +
      '<div class="hw-delete-confirm-popover__actions">' +
      '<button type="button" class="hw-delete-confirm-popover__yes" lang="ja">いいよ</button>' +
      '<button type="button" class="hw-delete-confirm-popover__no" lang="ja">ダメ</button>' +
      "</div>";

    document.body.appendChild(pop);
    const anchorRect = anchorBtn.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let top = anchorRect.top - popRect.height - 8;
    let left = anchorRect.left;
    if (top < 8) top = anchorRect.bottom + 8;
    left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
    pop.style.top = top + "px";
    pop.style.left = left + "px";

    const close = () => {
      document.removeEventListener("pointerdown", onOutside, true);
      pop.remove();
      global._hwDeleteConfirmClose = null;
    };
    global._hwDeleteConfirmClose = close;

    const onOutside = (ev) => {
      if (pop.contains(ev.target)) return;
      close();
    };
    setTimeout(() => document.addEventListener("pointerdown", onOutside, true), 0);

    pop.querySelector(".hw-delete-confirm-popover__yes")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      close();
      onConfirm();
    });
    pop.querySelector(".hw-delete-confirm-popover__no")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    });
  }

  function attachDeleteConfirm(deleteBtn, onConfirm) {
    deleteBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openDeleteConfirmPopover(deleteBtn, onConfirm);
    });
    const row = document.createElement("div");
    row.className = "hw-delete-row";
    row.appendChild(deleteBtn);
    return row;
  }

  let hostEl = null;
  let worksheetFormEl = null;
  let slideIndex = 0;
  let slideChangeBound = null;
  let shellEl = null;
  let layersEl = null;
  let launcherEl = null;
  let launcherSnapId = "tl";
  let launcherPosition = { x: 100, y: 48 };
  let launcherResizeObserver = null;
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
  let suppressMiniClickUntil = 0;
  let onboardEl = null;
  let onboardScrimEl = null;
  let onboardScrimResizeBound = null;
  let onboardScheduleTimer = null;
  let layoutScheduleRaf = null;
  let touchSelect = null;
  let selMenuEl = null;
  let selMenuSubOpen = false;
  let touchSelectBound = false;
  let selectionChangeBound = null;
  let contextMenuBound = null;
  let coarseResizeBound = null;
  let readAloudUtterance = null;

  function suppressStarInteraction(ms) {
    global._hwSuppressStarUntil = Date.now() + (ms || 450);
  }

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

  function launcherSnapPoints() {
    const pad = 12;
    const broomLane = 76;
    const w = hostEl?.clientWidth || 520;
    const h = hostEl?.clientHeight || 480;
    const half = 36;
    const cloudLeft = broomLane + half;
    const midY = h * 0.5;
    return {
      tl: { x: cloudLeft, y: pad + half },
      tc: { x: w * 0.5, y: pad + half },
      tr: { x: w - pad - half, y: pad + half },
      ml: { x: cloudLeft, y: midY },
      mr: { x: w - pad - half, y: midY },
      bl: { x: cloudLeft, y: h - pad - half },
      bc: { x: w * 0.5, y: h - pad - half },
      br: { x: w - pad - half, y: h - pad - half },
    };
  }

  function clampLauncherLocal(x, y) {
    const pad = 8;
    const half = 36;
    const w = hostEl?.clientWidth || 0;
    const h = hostEl?.clientHeight || 0;
    return {
      x: Math.max(half + pad, Math.min(x, w - half - pad)),
      y: Math.max(half + pad, Math.min(y, h - half - pad)),
    };
  }

  function applyLauncherPosition() {
    if (!launcherEl || !hostEl) return;
    if (launcherSnapId) {
      const p = launcherSnapPoints()[launcherSnapId] || launcherSnapPoints().tl;
      launcherPosition = { x: p.x, y: p.y };
    } else {
      launcherPosition = clampLauncherLocal(launcherPosition.x, launcherPosition.y);
    }
    launcherEl.style.left = launcherPosition.x + "px";
    launcherEl.style.top = launcherPosition.y + "px";
  }

  function saveLauncherPosition() {
    try {
      if (launcherSnapId) {
        localStorage.setItem(LAUNCHER_POS_KEY, JSON.stringify({ snap: launcherSnapId }));
      } else {
        localStorage.setItem(
          LAUNCHER_POS_KEY,
          JSON.stringify({ x: launcherPosition.x, y: launcherPosition.y })
        );
      }
    } catch (_) {}
  }

  function loadLauncherPosition() {
    launcherSnapId = "tl";
    launcherPosition = launcherSnapPoints().tl;
    try {
      const raw = JSON.parse(localStorage.getItem(LAUNCHER_POS_KEY) || "null");
      if (!raw) return;
      if (raw.snap && LAUNCHER_SNAP_IDS.includes(raw.snap)) {
        launcherSnapId = raw.snap;
        return;
      }
      if (typeof raw.x === "number" && typeof raw.y === "number") {
        if (raw.x <= 100 && raw.y <= 100) {
          const w = hostEl?.clientWidth || 520;
          const h = hostEl?.clientHeight || 480;
          launcherSnapId = null;
          launcherPosition = clampLauncherLocal((raw.x / 100) * w, (raw.y / 100) * h);
          saveLauncherPosition();
        } else {
          launcherSnapId = null;
          launcherPosition = { x: raw.x, y: raw.y };
        }
      }
    } catch (_) {}
  }

  function loadLauncherPos() {
    return launcherSnapId
      ? { ...(launcherSnapPoints()[launcherSnapId] || launcherSnapPoints().tl) }
      : { ...launcherPosition };
  }

  function saveLauncherPos(x, y) {
    launcherSnapId = null;
    launcherPosition = clampLauncherLocal(x, y);
    saveLauncherPosition();
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

  /** Shared anchor for mini + memo (both use translate(-50%, calc(-100% - 0.35rem))). */
  function defaultCloudPos(comment) {
    const r = comment.anchorRect;
    if (!r) return { x: 50, y: 20 };
    return {
      x: clampBubbleAnchorX(r.left + r.width / 2),
      y: pctClamp(r.top),
    };
  }

  function getCloudPos(comment, mode) {
    if (typeof comment.x === "number" && typeof comment.y === "number") {
      return { x: comment.x, y: comment.y };
    }
    return defaultCloudPos(comment);
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
    if (persist && !config?.teacherReview) {
      saveLocal();
      queueDraftSave();
    } else if (persist && config?.teacherReview) {
      notifyTeacherReviewChange();
    }
  }

  function getSlideIndex() {
    if (global.HwWorksheet?.getSlideIndex && worksheetFormEl) {
      return global.HwWorksheet.getSlideIndex(worksheetFormEl);
    }
    return slideIndex;
  }

  function commentsForCurrentSlide() {
    const idx = getSlideIndex();
    return comments.filter((c) => (c.slideIndex ?? 0) === idx);
  }

  function anchorKey(c) {
    return (c.slideIndex ?? 0) + ":" + c.anchor;
  }

  function dedupeComments(list) {
    const out = [];
    const byAnchor = new Map();
    list.forEach((c) => {
      if (!c.anchor) {
        out.push(c);
        return;
      }
      const key = anchorKey(c);
      const existing = byAnchor.get(key);
      if (!existing) {
        byAnchor.set(key, c);
        return;
      }
      const pickExisting =
        (existing.text.trim() && !c.text.trim()) ||
        (existing.text.trim() === c.text.trim() &&
          Date.parse(existing.updatedAt || existing.createdAt || 0) >=
            Date.parse(c.updatedAt || c.createdAt || 0));
      const keep = pickExisting ? existing : c;
      const drop = pickExisting ? c : existing;
      byAnchor.set(key, {
        ...keep,
        text: keep.text.trim() ? keep.text : drop.text,
        author: keep.author || drop.author,
        teacherRemark: keep.teacherRemark || drop.teacherRemark,
        teacherRemarkMedia: keep.teacherRemarkMedia || drop.teacherRemarkMedia,
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
      .map((c) => {
        const authorRaw = String(c.author || "").trim().toLowerCase();
        const author = authorRaw === "teacher" ? "teacher" : "student";
        const teacherRemark = String(c.teacherRemark || c.jdRemark || "").trim();
        const remarkMediaRaw = c.teacherRemarkMedia;
        let teacherRemarkMedia;
        if (remarkMediaRaw && typeof remarkMediaRaw === "object" && remarkMediaRaw.id) {
          teacherRemarkMedia = {
            id: String(remarkMediaRaw.id),
            kind: remarkMediaRaw.kind === "video" ? "video" : "audio",
            mimeType: remarkMediaRaw.mimeType ? String(remarkMediaRaw.mimeType) : undefined,
          };
        }
        return {
          id: String(c.id || uid()),
          text: String(c.text || ""),
          author,
          teacherRemark: teacherRemark || undefined,
          teacherRemarkMedia,
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
          slideIndex: typeof c.slideIndex === "number" ? c.slideIndex : 0,
          createdAt: c.createdAt || new Date().toISOString(),
          updatedAt: c.updatedAt,
        };
      })
      .filter((c) => {
        if (c.author === "teacher") return c.text.trim().length > 0 || c.teacherRemarkMedia;
        return c.anchor || c.text.trim().length > 0 || c.teacherRemark || c.teacherRemarkMedia;
      })
    );
    if (forSubmit) {
      return list.filter((c) => {
        if (c.author === "teacher") return c.text.trim().length > 0 || c.teacherRemarkMedia;
        return c.text.trim().length > 0 || c.teacherRemark || c.teacherRemarkMedia;
      });
    }
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
    if (!config?.username || !config?.assignmentId || config.readOnly || config.teacherReview) return;
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
    if (config?.readOnly || config?.teacherReview) return;
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      void flushDraftSave();
    }, DRAFT_SAVE_MS);
  }

  async function flushDraftSave() {
    if (config?.readOnly || config?.teacherReview) return;
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
    if (config?.readOnly || config?.teacherReview) return;
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

  function onSlideChange(e) {
    slideIndex = e.detail?.index ?? 0;
    if (activeCommentId) {
      const stillVisible = comments.some(
        (c) => c.id === activeCommentId && (c.slideIndex ?? 0) === slideIndex
      );
      if (!stillVisible) activeCommentId = null;
    }
    setArmed(false);
    renderAll();
  }

  function setArmed(next) {
    armed = !!next;
    hostEl?.classList.toggle("hw-hc-armed", armed);
    launcherEl?.classList.toggle("is-armed", armed);
    launcherEl?.setAttribute("aria-pressed", armed ? "true" : "false");
    if (armed) {
      global.HwMagnifyingGlass?.setArmed?.(false);
    } else {
      cancelTouchSelect();
      hideSelectionMenu();
      window.getSelection()?.removeAllRanges();
    }
  }

  function disarm() {
    if (!armed) return;
    setArmed(false);
  }

  function sanitizeCloudPos(comment) {
    const next = { ...comment };
    if (next.anchorRect) {
      delete next.x;
      delete next.y;
    }
    return next;
  }

  /** Tip point under both mini + memo (translate(-50%, calc(-100% - 0.35rem))). */
  function cloudPosFromVisual(el, mode) {
    if (!el || !hostEl) return null;
    const hostRect = hostEl.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return null;
    const r = el.getBoundingClientRect();
    return {
      x: pctClamp(((r.left + r.width / 2 - hostRect.left) / hostRect.width) * 100),
      y: pctClamp(((r.bottom - hostRect.top) / hostRect.height) * 100),
    };
  }

  function minimizeActive() {
    if (activeCommentId) {
      const id = activeCommentId;
      const comment = comments.find((c) => c.id === id);
      if (comment && !comment.text.trim()) {
        if (config?.teacherReview) {
          if (comment.author === "teacher") {
            removeComment(id);
            return;
          }
          /* Keep empty student memos during review — only remarks matter. */
        } else {
          removeComment(id);
          return;
        }
      }
    }
    activeCommentId = null;
    renderAll();
  }

  function expandComment(id) {
    if (armed) setArmed(false);
    activeCommentId = id;
    renderAll();
    requestAnimationFrame(() => {
      fitExpandedMemo(id);
      if (config?.readOnly && !config?.teacherReview) return;
      const focusEl =
        layersEl?.querySelector(
          '.hw-hc-memo[data-id="' + id + '"] .hw-hc-memo__remark'
        ) ||
        layersEl?.querySelector(
          '.hw-hc-memo[data-id="' + id + '"] .hw-hc-memo__input:not([readonly])'
        );
      focusEl?.focus();
      const memoEl = layersEl?.querySelector('.hw-hc-memo[data-id="' + id + '"]');
      resolveToolLayout(memoEl);
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
    /* Visual-only clamp — don't rewrite the shared mini/memo tip position. */
    resolveToolLayout(memo);
  }

  function resolveToolLayout(pinEl) {
    if (!hostEl) return;
    requestAnimationFrame(() => {
      global.HwWorksheetToolLayout?.resolve?.(hostEl, { pin: pinEl || null });
    });
  }

  function offsetCloudById(id, dx, dy) {
    if (!id || !hostEl) return;
    const comment = comments.find((c) => c.id === id);
    if (!comment) return;
    const hostRect = hostEl.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return;
    const mode = activeCommentId === id ? "memo" : "mini";
    const pos = getCloudPos(comment, mode);
    const nx = pctClamp(pos.x + (dx / hostRect.width) * 100);
    const ny = pctClamp(pos.y + (dy / hostRect.height) * 100);
    const sel =
      mode === "memo"
        ? '.hw-hc-memo[data-id="' + id + '"]'
        : '.hw-hc-mini[data-id="' + id + '"]';
    const el = layersEl?.querySelector(sel);
    if (el) {
      el.style.left = nx + "%";
      el.style.top = ny + "%";
    }
    updateCloudPos(id, nx, ny, false);
  }

  function getLauncherPosition() {
    if (!launcherEl) return loadLauncherPos();
    return { ...launcherPosition };
  }

  function setLauncherPositionLocal(localX, localY, persist) {
    if (!launcherEl) return;
    launcherSnapId = null;
    launcherPosition = clampLauncherLocal(localX, localY);
    applyLauncherPosition();
    if (persist !== false) saveLauncherPosition();
  }

  function setLauncherSnap(id) {
    if (!id || !LAUNCHER_SNAP_IDS.includes(id) || !launcherEl || !hostEl) return;
    launcherSnapId = id;
    applyLauncherPosition();
    saveLauncherPosition();
  }

  /** @deprecated use setLauncherPositionLocal — kept for tool-layout reset helpers */
  function setLauncherPosition(x, y, persist) {
    setLauncherPositionLocal(x, y, persist);
  }

  function resetLauncherPosition(target) {
    try {
      localStorage.removeItem(LAUNCHER_POS_KEY);
    } catch (_) {}
    if (target?.snap && LAUNCHER_SNAP_IDS.includes(target.snap)) {
      setLauncherSnap(target.snap);
      return;
    }
    if (target && typeof target.x === "number" && typeof target.y === "number") {
      setLauncherPositionLocal(target.x, target.y, false);
      return;
    }
    setLauncherSnap("tl");
  }

  function offsetLauncherBy(dx, dy) {
    if (!hostEl || !launcherEl || launcherEl.hidden) return;
    launcherSnapId = null;
    launcherPosition = clampLauncherLocal(launcherPosition.x + dx, launcherPosition.y + dy);
    applyLauncherPosition();
    saveLauncherPosition();
  }

  function offsetActiveMemoBy(dx, dy) {
    if (!activeCommentId || !hostEl) return;
    const comment = comments.find((c) => c.id === activeCommentId);
    if (!comment) return;
    const hostRect = hostEl.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return;
    const pos = getCloudPos(comment, "memo");
    const nx = pctClamp(pos.x + (dx / hostRect.width) * 100);
    const ny = pctClamp(pos.y + (dy / hostRect.height) * 100);
    const memo = layersEl?.querySelector('.hw-hc-memo[data-id="' + activeCommentId + '"]');
    if (memo) {
      memo.style.left = nx + "%";
      memo.style.top = ny + "%";
    }
    updateCloudPos(activeCommentId, nx, ny, false);
  }

  function notifyTeacherReviewChange() {
    if (!config?.teacherReview) return;
    document.dispatchEvent(
      new CustomEvent("hw-teacher-review-change", {
        bubbles: true,
        detail: { submissionId: config.submissionId || "" },
      })
    );
  }

  function updateCommentText(id, text) {
    const now = new Date().toISOString();
    comments = comments.map((c) =>
      c.id === id ? { ...c, text, updatedAt: now } : c
    );
    if (config?.teacherReview) notifyTeacherReviewChange();
    else queueDraftSave();
  }

  function updateTeacherRemarkMedia(id, media) {
    const now = new Date().toISOString();
    comments = comments.map((c) =>
      c.id === id
        ? {
            ...c,
            teacherRemarkMedia: media?.id
              ? {
                  id: String(media.id),
                  kind: media.kind === "video" ? "video" : "audio",
                  mimeType: media.mimeType ? String(media.mimeType) : undefined,
                }
              : undefined,
            updatedAt: now,
          }
        : c
    );
    notifyTeacherReviewChange();
  }

  function appendStudentRemarkMedia(body, comment) {
    if (!comment?.teacherRemarkMedia?.id) return;
    const mediaBlock = document.createElement("div");
    mediaBlock.className = "hw-hc-memo__jd-block hw-hc-memo__jd-block--media";
    const mediaHead = document.createElement("p");
    mediaHead.className = "hw-hc-memo__remark-label";
    mediaHead.textContent =
      comment.teacherRemarkMedia.kind === "video" ? "JD’s video remark" : "JD’s audio remark";
    const playback = document.createElement("div");
    playback.className = "hw-hc-memo__remark-playback";
    mediaBlock.append(mediaHead, playback);
    body.appendChild(mediaBlock);
    global.HwReviewMedia?.renderPlayback?.(playback, comment.teacherRemarkMedia);
  }

  function appendTeacherRemarkRecorder(body, comment) {
    const mediaBlock = document.createElement("div");
    mediaBlock.className = "hw-hc-memo__remark-media";
    const mediaLabel = document.createElement("p");
    mediaLabel.className = "hw-hc-memo__remark-label";
    mediaLabel.textContent = "Audio or video reply (optional)";
    const mediaMount = document.createElement("div");
    mediaMount.className = "hw-hc-memo__remark-media-mount";
    mediaBlock.append(mediaLabel, mediaMount);
    body.appendChild(mediaBlock);
    global.HwReviewMedia?.mountRemarkRecorder?.(mediaMount, {
      teacherUsername: config?.teacherUsername || "",
      existing: comment.teacherRemarkMedia,
      onChange: (media) => updateTeacherRemarkMedia(comment.id, media),
    });
  }

  function updateTeacherRemark(id, teacherRemark) {
    const now = new Date().toISOString();
    comments = comments.map((c) =>
      c.id === id
        ? { ...c, teacherRemark: String(teacherRemark || ""), updatedAt: now }
        : c
    );
    notifyTeacherReviewChange();
  }

  function removeComment(id) {
    comments = comments.filter((c) => c.id !== id);
    if (activeCommentId === id) activeCommentId = null;
    renderAll();
    if (config?.teacherReview) notifyTeacherReviewChange();
    else queueDraftSave();
  }

  function findCommentByAnchor(anchor) {
    const idx = getSlideIndex();
    return comments.find((c) => c.anchor === anchor && (c.slideIndex ?? 0) === idx);
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
      author: "student",
      anchor: text,
      anchorRect,
      slideIndex: getSlideIndex(),
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  function createTeacherQuestionNote() {
    const id = uid();
    const idx = getSlideIndex();
    comments.push({
      id,
      text: "",
      author: "teacher",
      slideIndex: idx,
      x: 72,
      y: 18 + commentsForCurrentSlide().filter((c) => c.author === "teacher").length * 8,
      createdAt: new Date().toISOString(),
    });
    notifyTeacherReviewChange();
    return id;
  }

  function isCoarsePointer() {
    try {
      return (
        window.matchMedia("(pointer: coarse)").matches ||
        window.matchMedia("(max-width: 767px)").matches
      );
    } catch (_) {
      return window.innerWidth < 768;
    }
  }

  function syncCoarseClass() {
    hostEl?.classList.toggle("hw-hc-coarse", isCoarsePointer());
  }

  function shouldSkipTouchTarget(target) {
    return Boolean(target?.closest?.(SKIP_SELECTOR + TOUCH_SKIP_EXTRA));
  }

  function starTextUnitFromTarget(target) {
    return target?.closest?.(
      ".hw-star-block__chip:not(.hw-star-block__chip--placed), .hw-star-block__slot-text, .hw-star-block__fixed"
    );
  }

  function selectStarTextUnit(el) {
    if (!el) return false;
    const range = document.createRange();
    try {
      range.selectNodeContents(el);
    } catch (_) {
      return false;
    }
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return !sel.isCollapsed && sel.toString().trim().length > 0;
  }

  function offerStarUnitSelection(target) {
    const unit = starTextUnitFromTarget(target);
    if (!unit || !selectStarTextUnit(unit)) return false;
    const picked = getHostSelection();
    if (!picked) return false;
    showSelectionMenu(picked.range.getBoundingClientRect());
    return true;
  }

  function caretRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    const pos = document.caretPositionFromPoint?.(x, y);
    if (!pos?.offsetNode) return null;
    const range = document.createRange();
    try {
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    } catch (_) {
      return null;
    }
  }

  function setSelectionBetweenPoints(x1, y1, x2, y2) {
    const startRange = caretRangeFromPoint(x1, y1);
    const endRange = caretRangeFromPoint(x2, y2);
    if (!startRange || !endRange) return false;
    const range = document.createRange();
    const backward = startRange.compareBoundaryPoints(Range.START_TO_START, endRange) > 0;
    try {
      range.setStart(
        backward ? endRange.startContainer : startRange.startContainer,
        backward ? endRange.startOffset : startRange.startOffset
      );
      range.setEnd(
        backward ? startRange.startContainer : endRange.startContainer,
        backward ? startRange.startOffset : endRange.startOffset
      );
    } catch (_) {
      return false;
    }
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return !sel.isCollapsed && sel.toString().trim().length > 0;
  }

  function getHostSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
    if (!hostEl?.contains(sel.anchorNode)) return null;
    let range;
    try {
      range = sel.getRangeAt(0);
    } catch (_) {
      return null;
    }
    return { sel, text: sel.toString().trim(), range };
  }

  function commitSelectionToMemo() {
    const picked = getHostSelection();
    if (!picked) return false;
    const rect = picked.range.getBoundingClientRect();
    const anchorRect = hostRectToPct(rect);
    if (!anchorRect) return false;
    const id = createCommentFromSelection(picked.text, anchorRect);
    setArmed(false);
    picked.sel.removeAllRanges();
    suppressStarInteraction();
    expandComment(id);
    saveLocal();
    queueDraftSave();
    return true;
  }

  function copySelectionText() {
    const picked = getHostSelection();
    if (!picked) return;
    const text = picked.text;
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (_) {}
    ta.remove();
  }

  function selectAllInContext(anchorNode) {
    const container =
      anchorNode?.closest?.(
        ".hw-worksheet__content, .hw-translation-block__japanese, .hw-star-block__sentence, .hw-star-block__prefix, .hw-star-block__suffix, .hw-star-block__fixed, .hw-open-topic, .hw-video-prompt__text, .hw-audio-prompt__text, [lang='ja']"
      ) || worksheetFormEl?.querySelector(".hw-worksheet");
    if (!container) return;
    const range = document.createRange();
    try {
      range.selectNodeContents(container);
    } catch (_) {
      return;
    }
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) showSelectionMenu(rect);
  }

  function openWebSearchForSelection() {
    const picked = getHostSelection();
    if (!picked) return;
    const q = encodeURIComponent(picked.text);
    window.open("https://www.google.com/search?q=" + q, "_blank", "noopener,noreferrer");
  }

  function readSelectionAloud() {
    const picked = getHostSelection();
    if (!picked || !global.speechSynthesis) return;
    global.speechSynthesis.cancel();
    readAloudUtterance = new SpeechSynthesisUtterance(picked.text);
    const ja = /[\u3040-\u30ff\u4e00-\u9faf]/.test(picked.text);
    readAloudUtterance.lang = ja ? "ja-JP" : document.documentElement.lang || "en-US";
    global.speechSynthesis.speak(readAloudUtterance);
  }

  function stopReadAloud() {
    global.speechSynthesis?.cancel();
    readAloudUtterance = null;
  }

  function hideSelectionMenu() {
    stopReadAloud();
    selMenuSubOpen = false;
    if (!selMenuEl) return;
    selMenuEl.hidden = true;
    selMenuEl.querySelector(".hw-hc-sel-menu__sub")?.setAttribute("hidden", "");
    selMenuEl.querySelector(".hw-hc-sel-menu__more")?.setAttribute("aria-expanded", "false");
  }

  function positionSelectionMenu(rect) {
    if (!selMenuEl) return;
    selMenuEl.hidden = false;
    const menuRect = selMenuEl.getBoundingClientRect();
    let top = rect.top - menuRect.height - 10;
    let left = rect.left + rect.width / 2 - menuRect.width / 2;
    if (top < 8) top = rect.bottom + 10;
    left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
    selMenuEl.style.top = Math.round(top) + "px";
    selMenuEl.style.left = Math.round(left) + "px";
  }

  function showSelectionMenu(rect) {
    if (!selMenuEl) ensureSelectionMenu();
    if (!selMenuEl) return;
    selMenuSubOpen = false;
    selMenuEl.querySelector(".hw-hc-sel-menu__sub")?.setAttribute("hidden", "");
    selMenuEl.querySelector(".hw-hc-sel-menu__more")?.setAttribute("aria-expanded", "false");
    positionSelectionMenu(rect);
  }

  function ensureSelectionMenu() {
    if (selMenuEl) return;
    selMenuEl = document.createElement("div");
    selMenuEl.className = "hw-hc-sel-menu";
    selMenuEl.hidden = true;
    selMenuEl.setAttribute("role", "toolbar");
    selMenuEl.setAttribute("aria-label", "Text selection");
    selMenuEl.innerHTML =
      '<div class="hw-hc-sel-menu__row">' +
      '<button type="button" class="hw-hc-sel-menu__btn" data-action="copy">Copy</button>' +
      '<button type="button" class="hw-hc-sel-menu__btn hw-hc-sel-menu__btn--accent" data-action="memo">Cloud Memo</button>' +
      '<button type="button" class="hw-hc-sel-menu__btn" data-action="select-all">Select All</button>' +
      '<button type="button" class="hw-hc-sel-menu__btn" data-action="search">Web Search</button>' +
      '<button type="button" class="hw-hc-sel-menu__btn" data-action="read">Read Aloud</button>' +
      '<button type="button" class="hw-hc-sel-menu__btn hw-hc-sel-menu__more" data-action="more" aria-label="More options" aria-expanded="false" aria-haspopup="true">☰</button>' +
      "</div>" +
      '<div class="hw-hc-sel-menu__sub" hidden role="menu" aria-label="App options">' +
      '<button type="button" class="hw-hc-sel-menu__sub-btn" data-action="disarm">Exit note mode</button>' +
      '<button type="button" class="hw-hc-sel-menu__sub-btn" data-action="reset-tools">Reset tool positions</button>' +
      '<button type="button" class="hw-hc-sel-menu__sub-btn" data-action="focus">Focus mode</button>' +
      '<button type="button" class="hw-hc-sel-menu__sub-btn" data-action="print">Print worksheet</button>' +
      "</div>";

    selMenuEl.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    selMenuEl.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      onSelectionMenuAction(btn.dataset.action);
    });
    document.body.appendChild(selMenuEl);
  }

  function onSelectionMenuAction(action) {
    if (action === "more") {
      selMenuSubOpen = !selMenuSubOpen;
      const sub = selMenuEl?.querySelector(".hw-hc-sel-menu__sub");
      const moreBtn = selMenuEl?.querySelector(".hw-hc-sel-menu__more");
      if (sub) sub.hidden = !selMenuSubOpen;
      moreBtn?.setAttribute("aria-expanded", selMenuSubOpen ? "true" : "false");
      const picked = getHostSelection();
      if (picked) positionSelectionMenu(picked.range.getBoundingClientRect());
      return;
    }
    if (action === "copy") {
      copySelectionText();
      hideSelectionMenu();
      return;
    }
    if (action === "memo") {
      if (commitSelectionToMemo()) hideSelectionMenu();
      return;
    }
    if (action === "select-all") {
      const picked = getHostSelection();
      selectAllInContext(picked?.range?.commonAncestorContainer || picked?.range?.startContainer);
      return;
    }
    if (action === "search") {
      openWebSearchForSelection();
      hideSelectionMenu();
      return;
    }
    if (action === "read") {
      readSelectionAloud();
      return;
    }
    if (action === "disarm") {
      hideSelectionMenu();
      setArmed(false);
      return;
    }
    if (action === "reset-tools") {
      hideSelectionMenu();
      global.HwWorksheetToolLayout?.resetToolPositions?.(hostEl);
      return;
    }
    if (action === "focus") {
      hideSelectionMenu();
      worksheetFormEl?.querySelector("[data-hw-focus]")?.click();
      return;
    }
    if (action === "print") {
      hideSelectionMenu();
      worksheetFormEl?.querySelector("[data-hw-print]")?.click() ||
        document.getElementById("hw-offline-print")?.click();
    }
  }

  function cancelTouchSelect() {
    if (touchSelect?.holdTimer) clearTimeout(touchSelect.holdTimer);
    if (touchSelect?.pointerId != null && hostEl) {
      try {
        hostEl.releasePointerCapture(touchSelect.pointerId);
      } catch (_) {}
    }
    touchSelect = null;
    hostEl?.classList.remove("hw-hc-touch-selecting");
  }

  function finishTouchSelect(clientX, clientY) {
    if (!touchSelect?.active) {
      cancelTouchSelect();
      return;
    }
    setSelectionBetweenPoints(touchSelect.startX, touchSelect.startY, clientX, clientY);
    const picked = getHostSelection();
    cancelTouchSelect();
    if (picked) {
      showSelectionMenu(picked.range.getBoundingClientRect());
    }
  }

  function onTouchSelectPointerDown(ev) {
    if (!armed || config?.readOnly || !isCoarsePointer()) return;
    if (ev.pointerType === "mouse") return;
    if (ev.button !== 0) return;
    if (shouldSkipTouchTarget(ev.target)) return;
    if (!hostEl?.contains(ev.target)) return;

    cancelTouchSelect();
    hideSelectionMenu();

    touchSelect = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
      holdTimer: setTimeout(() => {
        if (!touchSelect || touchSelect.pointerId !== ev.pointerId) return;
        touchSelect.active = true;
        hostEl?.classList.add("hw-hc-touch-selecting");
        setSelectionBetweenPoints(ev.clientX, ev.clientY, ev.clientX, ev.clientY);
      }, TOUCH_HOLD_MS),
    };
    try {
      hostEl.setPointerCapture(ev.pointerId);
    } catch (_) {}
  }

  function onTouchSelectPointerMove(ev) {
    if (!touchSelect || touchSelect.pointerId !== ev.pointerId) return;
    const dx = ev.clientX - touchSelect.startX;
    const dy = ev.clientY - touchSelect.startY;
    if (!touchSelect.active) {
      if (Math.hypot(dx, dy) > TOUCH_MOVE_CANCEL) cancelTouchSelect();
      return;
    }
    ev.preventDefault();
    setSelectionBetweenPoints(touchSelect.startX, touchSelect.startY, ev.clientX, ev.clientY);
  }

  function onTouchSelectPointerUp(ev) {
    if (!touchSelect || touchSelect.pointerId !== ev.pointerId) return;
    if (touchSelect.active) {
      ev.preventDefault();
      finishTouchSelect(ev.clientX, ev.clientY);
    } else if (armed && !config?.readOnly) {
      offerStarUnitSelection(ev.target);
      cancelTouchSelect();
    } else {
      cancelTouchSelect();
    }
    try {
      hostEl.releasePointerCapture(ev.pointerId);
    } catch (_) {}
  }

  function onTouchSelectPointerCancel(ev) {
    if (!touchSelect || touchSelect.pointerId !== ev.pointerId) return;
    cancelTouchSelect();
  }

  function onSelectionChange() {
    if (!armed || !isCoarsePointer() || touchSelect?.active) return;
    const picked = getHostSelection();
    if (picked) showSelectionMenu(picked.range.getBoundingClientRect());
  }

  function onHostContextMenu(ev) {
    if (!armed || !isCoarsePointer()) return;
    if (!hostEl?.contains(ev.target)) return;
    ev.preventDefault();
  }

  function bindTouchSelection() {
    if (touchSelectBound || !hostEl) return;
    touchSelectBound = true;
    hostEl.addEventListener("pointerdown", onTouchSelectPointerDown);
    hostEl.addEventListener("pointermove", onTouchSelectPointerMove);
    hostEl.addEventListener("pointerup", onTouchSelectPointerUp);
    hostEl.addEventListener("pointercancel", onTouchSelectPointerCancel);
    if (!selectionChangeBound) {
      selectionChangeBound = onSelectionChange;
      document.addEventListener("selectionchange", selectionChangeBound);
    }
    if (!contextMenuBound) {
      contextMenuBound = onHostContextMenu;
      hostEl.addEventListener("contextmenu", contextMenuBound);
    }
    if (!coarseResizeBound) {
      coarseResizeBound = syncCoarseClass;
      window.addEventListener("resize", coarseResizeBound);
    }
    syncCoarseClass();
    ensureSelectionMenu();
  }

  function unbindTouchSelection() {
    cancelTouchSelect();
    hideSelectionMenu();
    if (hostEl && touchSelectBound) {
      hostEl.removeEventListener("pointerdown", onTouchSelectPointerDown);
      hostEl.removeEventListener("pointermove", onTouchSelectPointerMove);
      hostEl.removeEventListener("pointerup", onTouchSelectPointerUp);
      hostEl.removeEventListener("pointercancel", onTouchSelectPointerCancel);
      hostEl.removeEventListener("contextmenu", contextMenuBound);
    }
    touchSelectBound = false;
    if (selectionChangeBound) {
      document.removeEventListener("selectionchange", selectionChangeBound);
      selectionChangeBound = null;
    }
    contextMenuBound = null;
    if (coarseResizeBound) {
      window.removeEventListener("resize", coarseResizeBound);
      coarseResizeBound = null;
    }
    selMenuEl?.remove();
    selMenuEl = null;
  }

  function onHostMouseUp(ev) {
    if (!armed || config?.readOnly) return;
    if (isCoarsePointer()) return;
    if (ev.target.closest(SKIP_SELECTOR + TOUCH_SKIP_EXTRA)) return;

    let picked = getHostSelection();
    if (!picked) {
      if (offerStarUnitSelection(ev.target)) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      return;
    }

    commitSelectionToMemo();
    ev.preventDefault();
    ev.stopPropagation();
  }

  function onKeyDown(ev) {
    if (ev.key !== "Escape") return;
    if (onboardEl) {
      dismissOnboarding();
      ev.preventDefault();
      return;
    }
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
    ev.stopPropagation();
  }

  function onDocPointerDown(ev) {
    if (dragState?.moved) return;
    if (ev.target.closest(".hw-hc-sel-menu")) return;
    if (!ev.target.closest(".hw-hc-sel-menu")) hideSelectionMenu();
    if (!activeCommentId) return;
    if (
      ev.target.closest(".hw-hc-memo") ||
      ev.target.closest(".hw-hc-mini") ||
      ev.target.closest(".hw-hc-launcher")
    ) {
      return;
    }
    minimizeActive();
  }

  function onCloudDragStart(ev, commentId, mode, el, handleEl) {
    if ((config?.readOnly && !config?.teacherReview) || ev.button !== 0) return;
    if (ev.target.closest(".hw-hc-memo__input") || ev.target.closest(".hw-hc-memo__remove") || ev.target.closest(".hw-delete-confirm-popover")) return;

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
      if (state.mode === "mini") suppressMiniClickUntil = Date.now() + 300;
      renderAll();
      if (state.mode === "memo") {
        const memo = layersEl?.querySelector('.hw-hc-memo[data-id="' + state.commentId + '"]');
        resolveToolLayout(memo);
      } else if (state.mode === "mini") {
        resolveToolLayout(state.el);
      }
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

  function spotlightRect(el, pad) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return {
      x: r.left - pad,
      y: r.top - pad,
      w: r.width + pad * 2,
      h: r.height + pad * 2,
    };
  }

  function mergeSpotlightRects(a, b) {
    if (!a) return b;
    if (!b) return a;
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x + a.w, b.x + b.w);
    const y2 = Math.max(a.y + a.h, b.y + b.h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function syncOnboardScrimViewport() {
    if (!onboardScrimEl) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    onboardScrimEl.setAttribute("viewBox", "0 0 " + w + " " + h);
    onboardScrimEl.setAttribute("preserveAspectRatio", "none");
    const backdrop = onboardScrimEl.querySelector("mask > rect:first-child");
    const fill = onboardScrimEl.querySelector(".hw-hc-onboard-scrim__fill");
    if (backdrop) {
      backdrop.setAttribute("width", String(w));
      backdrop.setAttribute("height", String(h));
    }
    if (fill) {
      fill.setAttribute("width", String(w));
      fill.setAttribute("height", String(h));
    }
  }

  function updateOnboardScrimSpotlight() {
    if (!onboardScrimEl || !launcherEl || !onboardEl) return;
    syncOnboardScrimViewport();
    const hole = onboardScrimEl.querySelector(".hw-hc-onboard-scrim__hole");
    if (!hole) return;
    const pad = 16;
    const spot = mergeSpotlightRects(
      spotlightRect(launcherEl, pad),
      spotlightRect(onboardEl, pad)
    );
    if (!spot) return;
    const x = Math.max(0, spot.x);
    const y = Math.max(0, spot.y);
    const w = Math.min(window.innerWidth - x, spot.w);
    const h = Math.min(window.innerHeight - y, spot.h);
    hole.setAttribute("x", String(x));
    hole.setAttribute("y", String(y));
    hole.setAttribute("width", String(Math.max(0, w)));
    hole.setAttribute("height", String(Math.max(0, h)));
  }

  function bindOnboardScrimResize() {
    unbindOnboardScrimResize();
    onboardScrimResizeBound = () => {
      placeOnboard();
      updateOnboardScrimSpotlight();
    };
    window.addEventListener("resize", onboardScrimResizeBound);
  }

  function unbindOnboardScrimResize() {
    if (!onboardScrimResizeBound) return;
    window.removeEventListener("resize", onboardScrimResizeBound);
    onboardScrimResizeBound = null;
  }

  function dismissOnboarding(options) {
    if (onboardEl) {
      onboardEl.remove();
      onboardEl = null;
    }
    if (onboardScrimEl) {
      onboardScrimEl.remove();
      onboardScrimEl = null;
    }
    unbindOnboardScrimResize();
    document.body.classList.remove("hw-hc-onboarding-active");
    hostEl?.classList.remove("hw-hc-onboarding");
    if (options?.persist === false) return;
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch (_) {}
  }

  function placeOnboard() {
    if (!onboardEl || !launcherEl || !hostEl) return;
    const cardW = Math.min(268, hostEl.clientWidth - 16);
    onboardEl.style.width = cardW + "px";

    const hostRect = hostEl.getBoundingClientRect();
    const launcherRect = launcherEl.getBoundingClientRect();
    const gap = 10;
    const cardH = onboardEl.offsetHeight || 150;
    const maxLeft = hostEl.clientWidth - cardW - 8;
    const maxTop = hostEl.clientHeight - cardH - 8;

    let left = launcherRect.right - hostRect.left + gap;
    let top = launcherRect.top - hostRect.top + (launcherRect.height - cardH) / 2;

    if (left + cardW > hostEl.clientWidth - 8) {
      left = launcherRect.left - hostRect.left - cardW - gap;
    }
    left = Math.max(8, Math.min(left, maxLeft));
    top = Math.max(8, Math.min(top, maxTop));

    onboardEl.style.left = left + "px";
    onboardEl.style.top = top + "px";
    updateOnboardScrimSpotlight();
  }

  function mgOnboardingBlocking() {
    if (document.body.classList.contains("hw-mg-onboarding-active")) return true;
    if (!global.HwFeatureFlags?.magnifyingGlass?.()) return false;
    try {
      return localStorage.getItem(MG_ONBOARD_KEY) !== "1";
    } catch (_) {
      return false;
    }
  }

  function initOnboarding() {
    if (config?.readOnly || config?.skipOnboarding) return;
    if (!shellEl || !launcherEl) return;
    try {
      if (localStorage.getItem(ONBOARD_KEY) === "1") return;
    } catch (_) {
      return;
    }
    if (onboardEl) return;

    onboardScrimEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    onboardScrimEl.classList.add("hw-hc-onboard-scrim");
    onboardScrimEl.setAttribute("aria-hidden", "true");
    const maskId = "hw-hc-onboard-spotlight-" + Math.random().toString(36).slice(2, 9);
    onboardScrimEl.innerHTML =
      "<defs><mask id=\"" +
      maskId +
      "\"><rect x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" fill=\"white\"/>" +
      "<rect class=\"hw-hc-onboard-scrim__hole\" rx=\"14\" ry=\"14\" fill=\"black\"/></mask></defs>" +
      "<rect class=\"hw-hc-onboard-scrim__fill\" x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" " +
      "fill=\"rgba(0,0,0,0.88)\" mask=\"url(#" +
      maskId +
      ")\"/>";
    onboardScrimEl.addEventListener("click", () => dismissOnboarding());
    document.body.appendChild(onboardScrimEl);

    onboardEl = document.createElement("div");
    onboardEl.className = "hw-hc-onboard";
    onboardEl.setAttribute("role", "dialog");
    onboardEl.setAttribute("aria-labelledby", "hw-hc-onboard-title");
    onboardEl.innerHTML =
      '<div class="hw-hc-onboard__card">' +
      '<p class="hw-hc-onboard__eyebrow">New · Note cloud</p>' +
      '<h2 class="hw-hc-onboard__title" id="hw-hc-onboard-title">Leave a note for JD</h2>' +
      '<p class="hw-hc-onboard__text">Tap the cloud, then hold on worksheet text to highlight it. Pick <strong>Cloud Memo</strong> to leave a note, or tap a mini cloud to review notes later.</p>' +
      '<button type="button" class="btn btn--primary btn--sm hw-hc-onboard__btn">Got it</button>' +
      "</div>";

    onboardEl.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    onboardEl.addEventListener("click", (ev) => ev.stopPropagation());
    onboardEl.querySelector(".hw-hc-onboard__btn")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      dismissOnboarding();
    });

    shellEl.appendChild(onboardEl);
    hostEl?.classList.add("hw-hc-onboarding");
    document.body.classList.add("hw-hc-onboarding-active");
    bindOnboardScrimResize();
    requestAnimationFrame(() => {
      placeOnboard();
      onboardScrimEl?.classList.add("is-visible");
      onboardEl?.classList.add("is-visible");
      requestAnimationFrame(updateOnboardScrimSpotlight);
    });
  }

  function scheduleOnboarding() {
    if (config?.readOnly || config?.skipOnboarding) return;
    clearTimeout(onboardScheduleTimer);
    const tryStart = () => {
      if (!shellEl || !launcherEl || !hostIsVisible(hostEl)) return;
      if (mgOnboardingBlocking()) {
        onboardScheduleTimer = setTimeout(tryStart, 400);
        return;
      }
      initOnboarding();
    };
    onboardScheduleTimer = setTimeout(tryStart, 500);
  }

  function resetOnboarding() {
    dismissOnboarding({ persist: false });
    try {
      localStorage.removeItem(ONBOARD_KEY);
    } catch (_) {}
    scheduleOnboarding();
  }

  let launcherDrag = null;

  function bindLauncherDrag() {
    if (!launcherEl) return;
    launcherEl.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      launcherDrag = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        originX: launcherPosition.x,
        originY: launcherPosition.y,
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
      launcherSnapId = null;
      launcherPosition = clampLauncherLocal(
        launcherDrag.originX + (ev.clientX - launcherDrag.startX),
        launcherDrag.originY + (ev.clientY - launcherDrag.startY)
      );
      applyLauncherPosition();
    });
    launcherEl.addEventListener("pointerup", (ev) => {
      if (!launcherDrag || launcherDrag.pointerId !== ev.pointerId) return;
      launcherEl.classList.remove("is-dragging");
      if (launcherDrag.moved) {
        saveLauncherPosition();
      } else if (!config?.readOnly && !config?.teacherReview) {
        setArmed(!armed);
      }
      launcherDrag = null;
      try {
        launcherEl.releasePointerCapture(ev.pointerId);
      } catch (_) {}
    });
    launcherEl.addEventListener("pointercancel", (ev) => {
      if (!launcherDrag || launcherDrag.pointerId !== ev.pointerId) return;
      launcherEl.classList.remove("is-dragging");
      if (launcherDrag.moved) {
        saveLauncherPosition();
      }
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
      '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 48" aria-hidden="true">' +
      '<g fill="currentColor">' +
      '<circle cx="22" cy="28" r="13"/>' +
      '<circle cx="40" cy="21" r="16"/>' +
      '<circle cx="58" cy="28" r="12"/>' +
      '<rect x="12" y="26" width="56" height="15" rx="7.5"/>' +
      "</g></svg>"
    );
  }

  function renderMini(comment) {
    if (activeCommentId === comment.id) return null;
    if (!comment.anchorRect && comment.author !== "teacher") return null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "hw-hc-mini" +
      (comment.author === "teacher" ? " hw-hc-mini--teacher" : "") +
      (comment.teacherRemark || comment.teacherRemarkMedia ? " hw-hc-mini--has-remark" : "");
    btn.dataset.id = comment.id;
    applyCloudPos(btn, comment, "mini");
    const label =
      comment.author === "teacher"
        ? comment.text.trim()
          ? "View JD note"
          : "Add JD note on this question"
        : comment.teacherRemark || comment.teacherRemarkMedia
          ? "View note with JD remark on “" + (comment.anchor || "worksheet") + "”"
          : comment.text.trim()
            ? "View note on “" + (comment.anchor || "worksheet") + "”"
            : "Add note on “" + (comment.anchor || "worksheet") + "”";
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = cloudIconSvg("hw-hc-mini__icon");
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (Date.now() < suppressMiniClickUntil) return;
      expandComment(comment.id);
    });
    if (!config?.readOnly || config?.teacherReview) bindCloudDrag(btn, comment.id, "mini");
    return btn;
  }

  function renderAnchorHighlight(comment) {
    if (activeCommentId !== comment.id || !comment.anchorRect) return null;
    const el = document.createElement("div");
    el.className = "hw-hc-anchor-highlight";
    el.dataset.id = comment.id;
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, pctRectToStyle(comment.anchorRect));
    return el;
  }

  function renderMemo(comment) {
    if (activeCommentId !== comment.id) return null;
    /* Student memos need an anchor rect; teacher-only notes use free placement. */
    if (!comment.anchorRect && comment.author !== "teacher") return null;

    const wrap = document.createElement("div");
    wrap.className =
      "hw-hc-memo hw-hc-memo--expanded" +
      (comment.author === "teacher" ? " hw-hc-memo--teacher" : "") +
      (config?.teacherReview ? " hw-hc-memo--review" : "");
    wrap.dataset.id = comment.id;
    applyCloudPos(wrap, comment, "memo");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute(
      "aria-label",
      comment.author === "teacher"
        ? "JD note on this question"
        : "Note on “" + (comment.anchor || "worksheet") + "”"
    );

    const body = document.createElement("div");
    body.className = "hw-hc-memo__body";
    if (!config?.readOnly || config?.teacherReview) body.title = "Drag to move";

    const isTeacherNote = comment.author === "teacher";
    const reviewStudentMemo = !!config?.teacherReview && !isTeacherNote;
    const studentReadonlyView = !!config?.readOnly && !config?.teacherReview;

    if (reviewStudentMemo) {
      if (comment.anchor) {
        const quote = document.createElement("p");
        quote.className = "hw-hc-memo__quote";
        quote.textContent = "“" + comment.anchor + "”";
        body.appendChild(quote);
      }
      const studentNote = document.createElement("p");
      studentNote.className = "hw-hc-memo__student-text";
      studentNote.textContent = comment.text || "(No note text)";
      body.appendChild(studentNote);

      const remarkLabel = document.createElement("label");
      remarkLabel.className = "hw-hc-memo__remark-label";
      remarkLabel.textContent = "Your remark";
      const remark = document.createElement("textarea");
      remark.className = "hw-hc-memo__remark";
      remark.rows = 4;
      remark.maxLength = 2000;
      remark.placeholder = "Reply to this memo for the student…";
      remark.value = comment.teacherRemark || "";
      remark.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      remark.addEventListener("click", (ev) => ev.stopPropagation());
      remark.addEventListener("input", () => {
        updateTeacherRemark(comment.id, remark.value);
      });
      remarkLabel.appendChild(remark);
      body.appendChild(remarkLabel);
      appendTeacherRemarkRecorder(body, comment);
    } else {
      const input = document.createElement("textarea");
      input.className = "hw-hc-memo__input";
      input.rows = isTeacherNote ? 5 : 3;
      input.maxLength = isTeacherNote ? 2000 : 500;
      input.placeholder = isTeacherNote
        ? "Write a note on this question for the student…"
        : "Write a note...JD will see it later!";
      input.value = comment.text || "";
      input.readOnly = studentReadonlyView || (config?.teacherReview && !isTeacherNote);
      input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      input.addEventListener("click", (ev) => ev.stopPropagation());
      if (!input.readOnly) {
        input.addEventListener("input", () => {
          updateCommentText(comment.id, input.value);
        });
      }
      body.appendChild(input);

      if (config?.teacherReview && isTeacherNote) {
        appendTeacherRemarkRecorder(body, comment);
      }

      if (studentReadonlyView && comment.teacherRemark) {
        const remarkBlock = document.createElement("div");
        remarkBlock.className = "hw-hc-memo__jd-block";
        const remarkHead = document.createElement("p");
        remarkHead.className = "hw-hc-memo__remark-label";
        remarkHead.textContent = "JD’s remark";
        const remarkText = document.createElement("p");
        remarkText.className = "hw-hc-memo__jd-text";
        remarkText.textContent = comment.teacherRemark;
        remarkBlock.append(remarkHead, remarkText);
        body.appendChild(remarkBlock);
      }

      if (studentReadonlyView) appendStudentRemarkMedia(body, comment);
    }

    if (config?.teacherReview && isTeacherNote) {
      const actions = document.createElement("div");
      actions.className = "hw-hc-memo__actions";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "hw-hc-memo__remove";
      removeBtn.setAttribute("aria-label", "Delete note");
      removeBtn.textContent = "DELETE";
      actions.appendChild(
        attachDeleteConfirm(removeBtn, () => {
          removeComment(comment.id);
        })
      );
      body.appendChild(actions);
    } else if (!config?.readOnly && !config?.teacherReview) {
      const actions = document.createElement("div");
      actions.className = "hw-hc-memo__actions";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "hw-hc-memo__remove";
      removeBtn.setAttribute("aria-label", "Delete note");
      removeBtn.textContent = "DELETE";
      actions.appendChild(
        attachDeleteConfirm(removeBtn, () => {
          removeComment(comment.id);
        })
      );
      body.appendChild(actions);
    }

    wrap.append(body);
    body.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    body.addEventListener("click", (ev) => ev.stopPropagation());
    if (!config?.readOnly || config?.teacherReview) {
      bindCloudDrag(body, comment.id, "memo", wrap);
    }
    return wrap;
  }

  function scheduleCloudLayout(pinEl) {
    if (layoutScheduleRaf) cancelAnimationFrame(layoutScheduleRaf);
    layoutScheduleRaf = requestAnimationFrame(() => {
      layoutScheduleRaf = null;
      resolveToolLayout(pinEl || null);
    });
  }

  function renderAll() {
    if (!layersEl) return;
    layersEl.replaceChildren();
    commentsForCurrentSlide().forEach((comment) => {
      const highlight = renderAnchorHighlight(comment);
      const mini = renderMini(comment);
      const memo = renderMemo(comment);
      if (highlight) layersEl.appendChild(highlight);
      if (mini) layersEl.appendChild(mini);
      if (memo) layersEl.appendChild(memo);
    });
    const pin =
      activeCommentId &&
      layersEl.querySelector('.hw-hc-memo[data-id="' + activeCommentId + '"]');
    scheduleCloudLayout(pin || null);
  }

  function bindLauncherResize() {
    launcherResizeObserver?.disconnect();
    if (!hostEl) return;
    launcherResizeObserver = new ResizeObserver(() => {
      applyLauncherPosition();
    });
    launcherResizeObserver.observe(hostEl);
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
    launcherEl.setAttribute("aria-label", "Add a note on highlighted text");
    launcherEl.setAttribute("aria-pressed", "false");
    launcherEl.innerHTML = cloudIconSvg("hw-hc-launcher__icon");

    loadLauncherPosition();
    try {
      if (!localStorage.getItem(LAUNCHER_POS_KEY)) {
        const neutral = global.HwWorksheetToolLayout?.computeNeutralPositions?.(hostEl);
        if (neutral?.launcherSnap && LAUNCHER_SNAP_IDS.includes(neutral.launcherSnap)) {
          launcherSnapId = neutral.launcherSnap;
        } else if (neutral?.launcher) {
          launcherSnapId = null;
          launcherPosition = { x: neutral.launcher.x, y: neutral.launcher.y };
        }
      }
    } catch (_) {}
    applyLauncherPosition();
    bindLauncherResize();

    launcherEl.addEventListener("click", onLauncherClick);
    bindLauncherDrag();

    shellEl.append(layersEl, launcherEl);
    hostEl.appendChild(shellEl);
    global.HwWorksheetToolLayout?.ensureCleanupButton?.(hostEl);

    hostEl.addEventListener("mouseup", onHostMouseUp);
    bindTouchSelection();
    bindDocPointer();
    bindKeyDown();
    built = true;
    renderAll();
  }

  function teardown() {
    clearTimeout(draftSaveTimer);
    clearTimeout(onboardScheduleTimer);
    onboardScheduleTimer = null;
    dragState = null;
    launcherDrag = null;
    launcherResizeObserver?.disconnect();
    launcherResizeObserver = null;
    dismissOnboarding();
    unbindTouchSelection();
    unbindDocPointer();
    unbindKeyDown();
    if (hostEl) {
      hostEl.removeEventListener("mouseup", onHostMouseUp);
      hostEl.classList.remove(
        "hw-hc-host",
        "hw-hc-armed",
        "hw-hc-onboarding",
        "hw-hc-coarse",
        "hw-hc-touch-selecting",
        "hw-hc-teacher-review"
      );
      hostEl.querySelector(":scope > .hw-hc-shell")?.remove();
      hostEl.querySelector(":scope > .hw-hc-teacher-bar")?.remove();
    }
    if (worksheetFormEl && slideChangeBound) {
      worksheetFormEl.removeEventListener("hw-worksheet-slide", slideChangeBound);
    }
    worksheetFormEl = null;
    slideChangeBound = null;
    slideIndex = 0;
    hostEl = null;
    shellEl = null;
    layersEl = null;
    launcherEl = null;
    launcherSnapId = "tl";
    launcherPosition = { x: 100, y: 48 };
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
      readOnly: !!options.readOnly || !!options.teacherReview,
      teacherReview: !!options.teacherReview,
      submissionId: options.submissionId || "",
      teacherUsername: options.teacherUsername || "",
      skipOnboarding: !!options.skipOnboarding || !!options.teacherReview,
    };

    if (options.initialComments?.length) {
      comments = normalizeComments(options.initialComments);
    } else {
      comments = [];
    }

    hostEl =
      formEl?.closest(".hw-hub-v2-worksheet") ||
      formEl?.closest(".hw-teacher-review-worksheet") ||
      formEl?.parentElement ||
      findHost();
    if (!hostEl) return false;

    worksheetFormEl = formEl;
    slideIndex = global.HwWorksheet?.getSlideIndex?.(formEl) ?? 0;
    if (worksheetFormEl) {
      slideChangeBound = onSlideChange;
      worksheetFormEl.addEventListener("hw-worksheet-slide", slideChangeBound);
    }

    buildShell();

    if (config.teacherReview) {
      if (launcherEl) launcherEl.hidden = true;
      hostEl.classList.add("hw-hc-teacher-review");
      ensureTeacherReviewChrome();
      renderAll();
      return true;
    }

    if (config.readOnly) {
      renderAll();
      return true;
    }

    void hydrateDraftFromAccount();
    scheduleOnboarding();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return true;
  }

  function ensureTeacherReviewChrome() {
    if (!hostEl || !shellEl) return;
    let bar = hostEl.querySelector(".hw-hc-teacher-bar");
    if (bar) return;
    bar = document.createElement("div");
    bar.className = "hw-hc-teacher-bar";
    bar.innerHTML =
      '<p class="hw-hc-teacher-bar__hint">Click a cloud to reply. Add a note on any question that needs feedback.</p>' +
      '<div class="hw-hc-teacher-bar__actions">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="hw-hc-add-question-note">Add note on this question</button>' +
      "</div>";
    bar
      .querySelector("#hw-hc-add-question-note")
      ?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = createTeacherQuestionNote();
        expandComment(id);
      });
    hostEl.insertBefore(bar, shellEl);
  }

  function getCommentsForReview() {
    return normalizeComments(comments).map((c) => ({
      id: c.id,
      text: c.text,
      author: c.author || "student",
      teacherRemark: c.teacherRemark || undefined,
      teacherRemarkMedia: c.teacherRemarkMedia || undefined,
      anchor: c.anchor,
      anchorRect: c.anchorRect,
      slideIndex: c.slideIndex ?? 0,
      x: c.x,
      y: c.y,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") void flushDraftSave();
  }

  function onPageHide() {
    if (config?.readOnly || config?.teacherReview || !config?.username || !config?.assignmentId) return;
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
    getCommentsForReview,
    clearDraft,
    clearDraftStorage,
    freezeAfterSubmit,
    resetOnboarding,
    getLauncherPosition,
    setLauncherPosition,
    setLauncherPositionLocal,
    setLauncherSnap,
    applyLauncherPosition,
    resetLauncherPosition,
    offsetLauncherBy,
    offsetActiveMemoBy,
    offsetCloudById,
  };
})(window);
