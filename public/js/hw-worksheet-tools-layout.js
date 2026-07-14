/**
 * Keep homework worksheet tools (magnifying glass, cloud launcher, note bubble, lookup popup)
 * from stacking on top of each other — lower-priority tools get nudged aside.
 */
(function (global) {
  const GAP = 10;
  const MAX_PASSES = 12;
  const RETURN_MS = 620;
  const RETURN_EASE = "cubic-bezier(0.25, 0.85, 0.35, 1)";

  /** Notes/minis/memor stay anchored; these tools get nudged aside. */
  const ANCHOR_KINDS = new Set(["hc-mini", "hc-memo", "tools-cleanup"]);
  /** Popups can freely clear; tool-row icons (cloud/glass) only clear the magnet. */
  const MOVABLE_KINDS = new Set(["mg-popup"]);
  const TOOL_ROW_KINDS = new Set(["hc-launcher", "mg-lens"]);

  let resetBusy = false;

  function isToolRowKind(kind) {
    return TOOL_ROW_KINDS.has(kind);
  }

  function hostLocalRect(el, hostEl) {
    const hostRect = hostEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return {
      left: r.left - hostRect.left,
      top: r.top - hostRect.top,
      right: r.right - hostRect.left,
      bottom: r.bottom - hostRect.top,
      width: r.width,
      height: r.height,
    };
  }

  function isVisibleTool(el) {
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function toolPriority(el, kind, pinEl, basePriority) {
    if (pinEl && el === pinEl && ANCHOR_KINDS.has(kind)) return 100;
    return basePriority;
  }

  function collectTools(hostEl, pinEl) {
    const tools = [];
    const specs = [
      { el: hostEl.querySelector(".hw-hc-memo--expanded"), kind: "hc-memo", priority: 4 },
      { el: hostEl.querySelector(".hw-mg-popup"), kind: "mg-popup", priority: 3 },
    ];
    specs.forEach((spec) => {
      if (!isVisibleTool(spec.el)) return;
      const rect = hostLocalRect(spec.el, hostEl);
      if (!rect) return;
      tools.push({
        el: spec.el,
        kind: spec.kind,
        priority: toolPriority(spec.el, spec.kind, pinEl, spec.priority),
        rect,
      });
    });
    /* Paired blue+green minis are one tip unit — don't treat each child as its own tip. */
    hostEl.querySelectorAll(".hw-hc-review-mini-pair").forEach((el) => {
      if (!isVisibleTool(el)) return;
      const rect = hostLocalRect(el, hostEl);
      if (!rect) return;
      tools.push({
        el,
        kind: "hc-mini",
        priority: toolPriority(el, "hc-mini", pinEl, 4),
        rect,
      });
    });
    hostEl.querySelectorAll(".hw-hc-mini:not(.hw-hc-mini--in-pair)").forEach((el) => {
      if (!isVisibleTool(el)) return;
      if (el.closest(".hw-hc-review-mini-pair")) return;
      const rect = hostLocalRect(el, hostEl);
      if (!rect) return;
      tools.push({
        el,
        kind: "hc-mini",
        priority: toolPriority(el, "hc-mini", pinEl, 4),
        rect,
      });
    });
    [
      { el: hostEl.querySelector(":scope > .hw-hc-launcher"), kind: "hc-launcher", priority: 1 },
      { el: hostEl.querySelector(":scope > .hw-mg-widget"), kind: "mg-lens", priority: 1 },
      {
        el: hostEl.querySelector(":scope > .hw-tools-cleanup"),
        kind: "tools-cleanup",
        priority: 5,
      },
    ].forEach((spec) => {
      if (!isVisibleTool(spec.el)) return;
      const rect = hostLocalRect(spec.el, hostEl);
      if (!rect) return;
      tools.push({
        el: spec.el,
        kind: spec.kind,
        priority: toolPriority(spec.el, spec.kind, pinEl, spec.priority),
        rect,
      });
    });
    return tools;
  }

  function separationHorizontalOnly(fixed, moving, gap) {
    const ox = Math.min(fixed.right, moving.right) - Math.max(fixed.left, moving.left);
    const oy = Math.min(fixed.bottom, moving.bottom) - Math.max(fixed.top, moving.top);
    if (ox <= 0 || oy <= 0) return null;
    const fCx = (fixed.left + fixed.right) / 2;
    const mCx = (moving.left + moving.right) / 2;
    const dir = mCx >= fCx ? 1 : -1;
    return { dx: dir * (ox + gap), dy: 0 };
  }

  function isToolRowPair(a, b) {
    const kinds = new Set([a.kind, b.kind]);
    if (kinds.has("mg-lens") && kinds.has("hc-launcher")) return true;
    /* Keep cloud/glass clearing the magnet with a sideways nudge in the top tool row. */
    if (kinds.has("tools-cleanup") && (kinds.has("mg-lens") || kinds.has("hc-launcher"))) {
      return true;
    }
    return false;
  }

  /** Tool-row icons stay put when note tips open — never auto-nudge for minis/memos. */
  function isLauncherTipPair(a, b) {
    const kinds = new Set([a.kind, b.kind]);
    return (
      (kinds.has("hc-launcher") || kinds.has("mg-lens")) &&
      (kinds.has("hc-mini") || kinds.has("hc-memo"))
    );
  }

  function separation(fixed, moving, gap) {
    const ox = Math.min(fixed.right, moving.right) - Math.max(fixed.left, moving.left);
    const oy = Math.min(fixed.bottom, moving.bottom) - Math.max(fixed.top, moving.top);
    if (ox <= 0 || oy <= 0) return null;

    const fCx = (fixed.left + fixed.right) / 2;
    const fCy = (fixed.top + fixed.bottom) / 2;
    const mCx = (moving.left + moving.right) / 2;
    const mCy = (moving.top + moving.bottom) / 2;

    if (ox < oy) {
      const dir = mCx >= fCx ? 1 : -1;
      return { dx: dir * (ox + gap), dy: 0 };
    }
    const dir = mCy >= fCy ? 1 : -1;
    return { dx: 0, dy: dir * (oy + gap) };
  }

  function applyMove(kind, dx, dy) {
    if (!dx && !dy) return;
    if (kind === "mg-lens") {
      global.HwMagnifyingGlass?.offsetLensBy?.(dx, dy);
      return;
    }
    if (kind === "mg-popup") {
      global.HwMagnifyingGlass?.offsetPopupBy?.(dx, dy);
      return;
    }
    if (kind === "hc-launcher") {
      global.HwHomeworkComments?.offsetLauncherBy?.(dx, dy);
    }
  }

  /** Pick which tool to nudge when two overlap. Anchors always win over movable tools. */
  function pickMove(fixed, movable, gap) {
    /* Magnet is fixed — nudge the glass/cloud horizontally when they sit on it. */
    const canMoveToolRow = isToolRowKind(movable.kind) && fixed.kind === "tools-cleanup";
    if (!MOVABLE_KINDS.has(movable.kind) && !canMoveToolRow) return null;
    let sep;
    if (isToolRowKind(movable.kind) || isToolRowPair(fixed, movable)) {
      sep = separationHorizontalOnly(fixed.rect, movable.rect, gap);
    } else {
      sep = separation(fixed.rect, movable.rect, gap);
    }
    if (!sep) return null;
    return { tool: movable, sep };
  }

  function resolvePair(a, b, gap) {
    if (isLauncherTipPair(a, b)) return null;

    const aAnchor = ANCHOR_KINDS.has(a.kind);
    const bAnchor = ANCHOR_KINDS.has(b.kind);
    const aMovable = MOVABLE_KINDS.has(a.kind) || isToolRowKind(a.kind);
    const bMovable = MOVABLE_KINDS.has(b.kind) || isToolRowKind(b.kind);

    /* Minis/memos are fixed tips — never shove them when a memo opens nearby. */
    if (aAnchor && bAnchor) return null;

    /* Only the magnet should push cloud/glass — other anchors leave them alone. */
    if (isToolRowKind(a.kind) && bAnchor && b.kind !== "tools-cleanup") return null;
    if (isToolRowKind(b.kind) && aAnchor && a.kind !== "tools-cleanup") return null;

    if (aAnchor && bMovable) return pickMove(a, b, gap);
    if (bAnchor && aMovable) return pickMove(b, a, gap);

    if (a.priority >= 100 && aMovable === false && bMovable) return pickMove(a, b, gap);
    if (b.priority >= 100 && bMovable === false && aMovable) return pickMove(b, a, gap);

    if (aMovable && !bMovable) return pickMove(b, a, gap);
    if (bMovable && !aMovable) return pickMove(a, b, gap);

    if (aMovable && bMovable) {
      if (a.priority <= b.priority) return pickMove(b, a, gap);
      return pickMove(a, b, gap);
    }
    return null;
  }

  function toolsEnabled() {
    const flags = global.HwFeatureFlags;
    return flags?.magnifyingGlass?.() === true || flags?.homeworkComments?.() === true;
  }

  /** Magnifying glass top-right; cloud launcher top-left (host-local px, snap like lens). */
  function computeNeutralPositions(hostEl) {
    if (!hostEl) return null;
    const hostRect = hostEl.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return null;

    const pad = 12;
    const broomLane = 76;
    const half = 36;
    const cloudLeft = broomLane + half;
    const lensX = hostRect.width - pad;
    const lensY = pad;

    return {
      lensX,
      lensY,
      lens: { x: lensX, y: lensY },
      lensSnap: "tr",
      launcher: { x: cloudLeft, y: pad + half },
      launcherSnap: "tl",
    };
  }

  function applyLauncherNeutral(hostEl, neutral, persist) {
    if (!neutral) return;
    if (neutral.launcherSnap && global.HwHomeworkComments?.setLauncherSnap) {
      global.HwHomeworkComments.setLauncherSnap(neutral.launcherSnap);
    } else {
      global.HwHomeworkComments?.setLauncherPositionLocal?.(
        neutral.launcher.x,
        neutral.launcher.y,
        persist
      );
    }
  }

  function finalizeNeutralPositions(hostEl, neutral, options) {
    options = options || {};
    if (!hostEl || !neutral) return;
    if (neutral.lensSnap && global.HwMagnifyingGlass?.setLensSnap) {
      global.HwMagnifyingGlass.setLensSnap(neutral.lensSnap);
    } else {
      global.HwMagnifyingGlass?.setLensPositionLocal?.(neutral.lens.x, neutral.lens.y, true);
    }
    if (options.includeLauncher) {
      applyLauncherNeutral(hostEl, neutral, true);
    }
  }

  function syncNeutralToolRow(hostEl) {
    const neutral = computeNeutralPositions(hostEl);
    if (neutral) finalizeNeutralPositions(hostEl, neutral, { includeLauncher: false });
  }

  function toolsOverlap(hostEl) {
    const launcher = hostEl.querySelector(":scope > .hw-hc-launcher");
    const lens = hostEl.querySelector(":scope > .hw-mg-widget");
    if (!launcher || !lens) return false;
    const a = launcher.getBoundingClientRect();
    const b = lens.getBoundingClientRect();
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return ox > 16 && oy > 16;
  }

  function syncNeutralToolRowIfUnset(hostEl) {
    if (!hostEl) return;
    const hasBoth =
      hostEl.querySelector(":scope > .hw-hc-launcher") &&
      hostEl.querySelector(":scope > .hw-mg-widget");
    if (!hasBoth) return;
    const overlapping = toolsOverlap(hostEl);
    try {
      if (
        !overlapping &&
        (localStorage.getItem("jlm-hc-launcher-pos") || localStorage.getItem("hw-mg-position-v2"))
      ) {
        return;
      }
    } catch (_) {}
    syncNeutralToolRow(hostEl);
  }

  function cleanupButtonIconHtml() {
    return (
      '<span class="hw-tools-cleanup__magnet" aria-hidden="true">' +
      '<img class="hw-tools-cleanup__body" src="/images/hw-tool-magnet-body.png?v=3" width="30" height="30" alt="" decoding="async" />' +
      '<img class="hw-tools-cleanup__bolts" src="/images/hw-tool-magnet-sparks.png?v=3" width="30" height="30" alt="" decoding="async" />' +
      "</span>"
    );
  }

  function animateToolReturnX(el, targetLeft, unit) {
    if (!el) return Promise.resolve();
    const current = parseFloat(el.style.left) || 0;
    const near = unit === "%" ? Math.abs(current - targetLeft) < 0.25 : Math.abs(current - targetLeft) < 2;
    if (near) {
      el.style.left = targetLeft + unit;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      el.classList.add("hw-tools-returning");
      el.style.transition = "left " + RETURN_MS + "ms " + RETURN_EASE;
      el.style.left = targetLeft + unit;
      window.setTimeout(() => {
        el.style.transition = "";
        el.classList.remove("hw-tools-returning");
        resolve();
      }, RETURN_MS + 40);
    });
  }

  async function resetToolPositions(hostEl) {
    if (!hostEl || resetBusy) return;
    resetBusy = true;
    const cleanupBtn = hostEl.querySelector(":scope > .hw-tools-cleanup");
    if (cleanupBtn) cleanupBtn.disabled = true;

    global.HwHomeworkComments?.disarm?.();
    global.HwMagnifyingGlass?.setArmed?.(false);

    const neutral = computeNeutralPositions(hostEl);

    if (neutral) {
      applyLauncherNeutral(hostEl, neutral, false);
    }

    try {
      localStorage.removeItem("jlm-hc-launcher-pos");
      localStorage.removeItem("hw-mg-position-v2");
    } catch (_) {}

    if (neutral) finalizeNeutralPositions(hostEl, neutral, { includeLauncher: true });

    resetBusy = false;
    if (cleanupBtn) cleanupBtn.disabled = false;
  }

  function isLexiconLookupHost(hostEl) {
    if (!hostEl) return false;
    return (
      hostEl.classList.contains("hw-lookup-lexicon-playground") ||
      hostEl.id === "hw-lookup-lexicon-playground-host" ||
      Boolean(hostEl.closest(".hw-teacher-lookup-lexicon"))
    );
  }

  /** Keep magnet under cloud/glass: tools use z-index 66 (drag/armed 70), magnet 62; also earlier DOM. */
  function placeCleanupUnderTools(hostEl, btn) {
    if (!hostEl || !btn) return;
    const firstTool = hostEl.querySelector(
      ":scope > .hw-hc-launcher, :scope > .hw-mg-widget"
    );
    if (firstTool) {
      if (btn.nextElementSibling !== firstTool) {
        hostEl.insertBefore(btn, firstTool);
      }
      return;
    }
    if (btn.parentElement !== hostEl) hostEl.appendChild(btn);
  }

  function ensureCleanupButton(hostEl) {
    if (!hostEl) return;

    const existing = hostEl.querySelector(":scope > .hw-tools-cleanup");

    if (!toolsEnabled() || isLexiconLookupHost(hostEl)) {
      existing?.remove();
      return;
    }

    if (existing) {
      const magnet = existing.querySelector(".hw-tools-cleanup__magnet");
      if (!magnet || !magnet.querySelector(".hw-tools-cleanup__bolts")) {
        existing.innerHTML = cleanupButtonIconHtml();
      }
      placeCleanupUnderTools(hostEl, existing);
      requestAnimationFrame(() => syncNeutralToolRowIfUnset(hostEl));
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hw-tools-cleanup";
    btn.setAttribute("aria-label", "Reset tool positions");
    btn.title = "Reset tool positions";
    btn.innerHTML = cleanupButtonIconHtml();
    btn.addEventListener("click", () => resetToolPositions(hostEl));
    placeCleanupUnderTools(hostEl, btn);
    requestAnimationFrame(() => syncNeutralToolRowIfUnset(hostEl));
  }

  function worksheetToolHost(hostOrForm) {
    if (!hostOrForm) return null;
    return hostOrForm.closest?.(".hw-hub-v2-worksheet") || hostOrForm;
  }

  function beginWorksheetToolBoot() {
    document.body.classList.add("hw-worksheet-tools-booting");
    document.querySelectorAll(".hw-hub-v2-worksheet").forEach((hostEl) => {
      hostEl.classList.remove("hw-worksheet-tools-ready");
      hostEl.classList.add("hw-worksheet-tools-booting");
    });
  }

  function cancelWorksheetToolBoot() {
    document.body.classList.remove("hw-worksheet-tools-booting");
    document.querySelectorAll(".hw-hub-v2-worksheet").forEach((hostEl) => {
      hostEl.classList.remove("hw-worksheet-tools-booting");
    });
  }

  function revealWorksheetTools(hostOrForm, done) {
    const hostEl = worksheetToolHost(hostOrForm);
    if (!hostEl) {
      cancelWorksheetToolBoot();
      if (typeof done === "function") done();
      return;
    }

    global.HwMagnifyingGlass?.refresh?.();
    global.HwHomeworkComments?.applyLauncherPosition?.();
    syncNeutralToolRowIfUnset(hostEl);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.remove("hw-worksheet-tools-booting");
        hostEl.classList.remove("hw-worksheet-tools-booting");
        hostEl.classList.add("hw-worksheet-tools-ready");
        if (typeof done === "function") done();
      });
    });
  }

  function resolve(hostEl, options) {
    options = options || {};
    if (!hostEl) return;
    const pin = options.pin || null;
    const gap = typeof options.gap === "number" ? options.gap : GAP;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const tools = collectTools(hostEl, pin);
      if (tools.length < 2) return;

      let moved = false;

      for (let i = 0; i < tools.length; i++) {
        for (let j = i + 1; j < tools.length; j++) {
          const move = resolvePair(tools[i], tools[j], gap);
          const canApply =
            move && (MOVABLE_KINDS.has(move.tool.kind) || isToolRowKind(move.tool.kind));
          if (!canApply) continue;

          applyMove(move.tool.kind, move.sep.dx, move.sep.dy);
          moved = true;

          const refreshed = hostLocalRect(move.tool.el, hostEl);
          if (refreshed) move.tool.rect = refreshed;
        }
      }

      if (!moved) return;
    }
  }

  global.HwWorksheetToolLayout = {
    resolve,
    ensureCleanupButton,
    resetToolPositions,
    computeNeutralPositions,
    beginWorksheetToolBoot,
    cancelWorksheetToolBoot,
    revealWorksheetTools,
  };
})(window);
