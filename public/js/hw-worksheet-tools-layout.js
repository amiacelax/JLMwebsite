/**
 * Keep homework worksheet tools (magnifying glass, cloud launcher, note bubble, lookup popup)
 * from stacking on top of each other — lower-priority tools get nudged aside.
 */
(function (global) {
  const GAP = 10;
  const MAX_PASSES = 12;
  const RETURN_MS = 620;
  const RETURN_EASE = "cubic-bezier(0.25, 0.85, 0.35, 1)";
  /* Match StarQ reset-answer flyback (hw-star-block animateFlyback). */
  const FLYBACK_TRAVEL_MS = 620;
  const FLYBACK_BOING_MS = 32;
  const FLYBACK_STAGGER_MS = 110;

  /** Notes/minis/memor stay anchored; these tools get nudged aside. */
  const ANCHOR_KINDS = new Set(["hc-mini", "hc-memo", "tools-cleanup"]);
  /** Popups can freely clear; tool-row icons (cloud/glass) only clear the magnet. */
  const MOVABLE_KINDS = new Set(["mg-popup"]);
  const TOOL_ROW_KINDS = new Set(["hc-launcher", "mg-lens"]);

  let resetBusy = false;

  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function readRect(target) {
    if (!target) return null;
    if (typeof target.getBoundingClientRect === "function") {
      const r = target.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return r;
    }
    if (typeof target.left === "number" && typeof target.top === "number") {
      return target;
    }
    return null;
  }

  function hostPointToViewportRect(hostEl, localX, localY, width, height) {
    const hostRect = hostEl.getBoundingClientRect();
    const w = width || 72;
    const h = height || 72;
    return {
      left: hostRect.left + localX - w / 2,
      top: hostRect.top + localY - h / 2,
      width: w,
      height: h,
      right: hostRect.left + localX + w / 2,
      bottom: hostRect.top + localY + h / 2,
    };
  }

  /**
   * Fly ghosts must never keep .hw-mg-widget / .hw-hc-launcher — tuck CSS
   * targets those, and cloned % left/top + translate(-50%,-50%) fight flight.
   */
  function mountFlybackGhost(fromRect, toRect, sourceEl) {
    const ghost = document.createElement("div");
    ghost.className = "hw-tools-flyback";
    ghost.setAttribute("aria-hidden", "true");

    if (sourceEl) {
      const inner = sourceEl.cloneNode(true);
      const isGlass = sourceEl.classList.contains("hw-mg-widget");
      const isCloud = sourceEl.classList.contains("hw-hc-launcher");
      inner.removeAttribute("id");
      inner.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      inner.classList.remove(
        "hw-mg-widget",
        "hw-hc-launcher",
        "is-dragging",
        "is-armed",
        "hw-tools-returning"
      );
      inner.classList.add("hw-tools-flyback__clone");
      if (isGlass) {
        ghost.classList.add("hw-tools-flyback--glass");
        inner.classList.add("hw-tools-flyback__clone--glass");
      }
      if (isCloud) {
        ghost.classList.add("hw-tools-flyback--cloud");
        inner.classList.add("hw-tools-flyback__clone--cloud");
      }
      /* Outer owns fixed placement; inner only paints. */
      inner.style.cssText =
        "position:relative;inset:auto;left:auto;top:auto;right:auto;bottom:auto;" +
        "width:100%;height:100%;margin:0;transform:none;animation:none;" +
        "display:flex;align-items:center;justify-content:center;" +
        "pointer-events:none;visibility:visible;opacity:1;z-index:auto;";
      ghost.appendChild(inner);
    }

    /*
     * Keep the tool’s on-screen size (unlike StarQ chips which match pool size).
     * Travel still aims at the target center with the same boing + ease.
     */
    const startLeft = fromRect.left;
    const startTop = fromRect.top;
    ghost.style.setProperty("position", "fixed", "important");
    ghost.style.setProperty("left", startLeft + "px", "important");
    ghost.style.setProperty("top", startTop + "px", "important");
    ghost.style.setProperty("width", fromRect.width + "px", "important");
    ghost.style.setProperty("height", fromRect.height + "px", "important");
    ghost.style.setProperty("margin", "0", "important");
    ghost.style.setProperty("z-index", "10050", "important");
    ghost.style.setProperty("pointer-events", "none", "important");
    ghost.style.setProperty("box-sizing", "border-box", "important");
    ghost.style.setProperty("transform-origin", "center center", "important");
    ghost.style.setProperty("will-change", "transform");
    ghost.style.setProperty("animation", "none", "important");
    ghost.style.setProperty("transform", "none", "important");
    ghost.style.setProperty("display", "flex", "important");
    ghost.style.setProperty("visibility", "visible", "important");
    ghost.style.setProperty("opacity", "1", "important");
    document.body.appendChild(ghost);
    return { ghost, startLeft, startTop, fromRect, toRect };
  }

  /** Force-measure a tucked tool (display:none) without a visible flash. */
  function measureHiddenToolRect(el) {
    if (!el) return null;
    const keys = ["display", "visibility", "opacity", "pointer-events"];
    const prev = {};
    keys.forEach((k) => {
      prev[k] = el.style.getPropertyValue(k);
      prev[k + "-priority"] = el.style.getPropertyPriority(k);
    });
    el.style.setProperty("display", "flex", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("opacity", "0", "important");
    el.style.setProperty("pointer-events", "none", "important");
    const r = el.getBoundingClientRect();
    keys.forEach((k) => {
      if (prev[k]) el.style.setProperty(k, prev[k], prev[k + "-priority"] || "");
      else el.style.removeProperty(k);
    });
    if (!r.width && !r.height) return null;
    return r;
  }

  /** StarQ reset-answer flyback (boing → travel). Ghost must already be mounted. */
  function runFlybackMotion(ghost, startLeft, startTop, fromRect, toRect) {
    if (!ghost || !toRect || !fromRect) return Promise.resolve();
    const dx =
      toRect.left + toRect.width / 2 - (startLeft + fromRect.width / 2);
    const dy =
      toRect.top + toRect.height / 2 - (startTop + fromRect.height / 2);

    function setXform(value, transition) {
      ghost.style.setProperty("transition", transition || "none");
      ghost.style.setProperty("transform", value, "important");
    }

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setXform(
          "scale(1.04, 0.97)",
          "transform " + FLYBACK_BOING_MS + "ms cubic-bezier(0.34, 1.25, 0.68, 1)"
        );
      });

      window.setTimeout(() => {
        setXform("scale(1, 1)", "transform 18ms ease-out");
      }, FLYBACK_BOING_MS);

      window.setTimeout(() => {
        setXform(
          "translate(" + dx + "px, " + dy + "px)",
          "transform " + FLYBACK_TRAVEL_MS + "ms " + RETURN_EASE
        );
      }, FLYBACK_BOING_MS + 22);

      window.setTimeout(() => {
        ghost.remove();
        resolve();
      }, FLYBACK_BOING_MS + FLYBACK_TRAVEL_MS + 72);
    });
  }

  /**
   * StarQ-style flyback. Appends the ghost synchronously so callers can hide
   * the real tool immediately without losing the visual.
   */
  function animateToolFlyback(fromRect, toRect, sourceEl) {
    if (!fromRect || !toRect) return Promise.resolve();
    if (prefersReducedMotion()) return Promise.resolve();
    const mounted = mountFlybackGhost(fromRect, toRect, sourceEl);
    return runFlybackMotion(
      mounted.ghost,
      mounted.startLeft,
      mounted.startTop,
      mounted.fromRect,
      mounted.toRect
    );
  }

  /**
   * Fling tools with StarQ flyback. Ghosts mount synchronously (before any
   * await) so sources can be hidden/tucked immediately.
   * @param {{ el: HTMLElement, to: HTMLElement|{left:number,top:number,width:number,height:number}, fromRect?: DOMRect|{left:number,top:number,width:number,height:number}, delayMs?: number }[]} specs
   */
  function flingTools(specs) {
    if (!specs || !specs.length) return Promise.resolve();
    if (prefersReducedMotion()) return Promise.resolve();

    const prepared = [];
    let staggerIndex = 0;
    specs.forEach((spec) => {
      if (!spec?.el) return;
      const fromRect = spec.fromRect || spec.el.getBoundingClientRect();
      if (!fromRect.width && !fromRect.height) return;
      const toRect = readRect(spec.to);
      if (!toRect) return;
      const delayMs =
        typeof spec.delayMs === "number" ? spec.delayMs : staggerIndex * FLYBACK_STAGGER_MS;
      staggerIndex += 1;
      const mounted = mountFlybackGhost(fromRect, toRect, spec.el);
      prepared.push({
        ghost: mounted.ghost,
        startLeft: mounted.startLeft,
        startTop: mounted.startTop,
        fromRect: mounted.fromRect,
        toRect: mounted.toRect,
        delayMs,
      });
    });

    return Promise.all(
      prepared.map((job) =>
        delay(job.delayMs).then(() =>
          runFlybackMotion(
            job.ghost,
            job.startLeft,
            job.startTop,
            job.fromRect,
            job.toRect
          )
        )
      )
    ).then(() => {});
  }

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

  /** Magnifying glass top-right; cloud launcher top-left (host-local px, snap like lens).
   *  Attach defaults (toolbar playtest free coords / snaps) override live neutrals. */
  function computeNeutralPositions(hostEl) {
    if (!hostEl) return null;
    const w = hostEl.clientWidth;
    const h = hostEl.clientHeight;
    if (!w || !h) return null;

    const pad = 12;
    const broomLane = 76;
    const half = 36;
    const cloudLeft = broomLane + half;
    /* Same half+pad inset as clampLocal / clampLauncherLocal (center + translate -50%). */
    const lensX = w - pad - half;
    const lensY = pad + half;

    let lens = { x: lensX, y: lensY };
    let lensSnap = "tr";
    const attachLensSnap = global.HwMagnifyingGlass?.getAttachDefaultSnap?.();
    const attachLens = global.HwMagnifyingGlass?.getAttachDefaultLens?.();
    if (attachLensSnap) {
      lensSnap = attachLensSnap;
      const pts = {
        tl: { x: half + pad, y: pad + half },
        tc: { x: w * 0.5, y: pad + half },
        tr: { x: w - pad - half, y: pad + half },
        ml: { x: half + pad, y: h * 0.5 },
        mr: { x: w - pad - half, y: h * 0.5 },
        bl: { x: half + pad, y: h - pad - half },
        bc: { x: w * 0.5, y: h - pad - half },
        br: { x: w - pad - half, y: h - pad - half },
      };
      lens = { ...(pts[attachLensSnap] || lens) };
    } else if (attachLens) {
      lensSnap = null;
      lens = { x: attachLens.x, y: attachLens.y };
    }

    let launcher = { x: cloudLeft, y: pad + half };
    let launcherSnap = "tl";
    const attachLauncherSnap = global.HwHomeworkComments?.getAttachDefaultSnap?.();
    const attachLauncher = global.HwHomeworkComments?.getAttachDefaultLauncher?.();
    if (attachLauncherSnap) {
      launcherSnap = attachLauncherSnap;
      const midY = h * 0.5;
      const lpts = {
        tl: { x: cloudLeft, y: pad + half },
        tc: { x: w * 0.5, y: pad + half },
        tr: { x: w - pad - half, y: pad + half },
        ml: { x: cloudLeft, y: midY },
        mr: { x: w - pad - half, y: midY },
        bl: { x: cloudLeft, y: h - pad - half },
        bc: { x: w * 0.5, y: h - pad - half },
        br: { x: w - pad - half, y: h - pad - half },
      };
      launcher = { ...(lpts[attachLauncherSnap] || launcher) };
    } else if (attachLauncher) {
      launcherSnap = null;
      launcher = { x: attachLauncher.x, y: attachLauncher.y };
    }

    return {
      lensX: lens.x,
      lensY: lens.y,
      lens,
      lensSnap,
      launcher,
      launcherSnap,
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
      const mgKey =
        (typeof global.HwMagnifyingGlass?.getStorageKey === "function" &&
          global.HwMagnifyingGlass.getStorageKey()) ||
        "hw-mg-position-v2";
      const hcKey =
        (typeof global.HwHomeworkComments?.getStorageKey === "function" &&
          global.HwHomeworkComments.getStorageKey()) ||
        "jlm-hc-launcher-pos";
      if (
        !overlapping &&
        (localStorage.getItem(hcKey) || localStorage.getItem(mgKey))
      ) {
        return;
      }
      /* Attach defaults (toolbar playtest snap/coords) count as configured — don't yank to TR. */
      if (
        !overlapping &&
        (global.HwMagnifyingGlass?.getAttachDefaultSnap?.() ||
          global.HwMagnifyingGlass?.getAttachDefaultLens?.() ||
          global.HwHomeworkComments?.getAttachDefaultSnap?.() ||
          global.HwHomeworkComments?.getAttachDefaultLauncher?.())
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
    const lens = hostEl.querySelector(":scope > .hw-mg-widget");
    const launcher = hostEl.querySelector(":scope > .hw-hc-launcher");
    const flingSpecs = [];

    if (neutral && lens && isVisibleTool(lens)) {
      const from = lens.getBoundingClientRect();
      flingSpecs.push({
        el: lens,
        to: hostPointToViewportRect(hostEl, neutral.lens.x, neutral.lens.y, from.width, from.height),
      });
    }
    if (neutral && launcher && isVisibleTool(launcher)) {
      const from = launcher.getBoundingClientRect();
      flingSpecs.push({
        el: launcher,
        to: hostPointToViewportRect(
          hostEl,
          neutral.launcher.x,
          neutral.launcher.y,
          from.width,
          from.height
        ),
      });
    }

    /* Ghosts mount sync; hide originals so they don't double-draw during flight. */
    const flyPromise = flingTools(flingSpecs);
    if (lens) lens.style.visibility = "hidden";
    if (launcher) launcher.style.visibility = "hidden";

    try {
      await flyPromise;
    } catch (_) {}

    try {
      const mgKey =
        (typeof global.HwMagnifyingGlass?.getStorageKey === "function" &&
          global.HwMagnifyingGlass.getStorageKey()) ||
        "hw-mg-position-v2";
      const hcKey =
        (typeof global.HwHomeworkComments?.getStorageKey === "function" &&
          global.HwHomeworkComments.getStorageKey()) ||
        "jlm-hc-launcher-pos";
      localStorage.removeItem(hcKey);
      localStorage.removeItem("jlm-hc-launcher-pos");
      localStorage.removeItem(mgKey);
      localStorage.removeItem("hw-mg-position-v2");
    } catch (_) {}

    if (neutral) finalizeNeutralPositions(hostEl, neutral, { includeLauncher: true });

    if (lens) lens.style.visibility = "";
    if (launcher) launcher.style.visibility = "";

    resetBusy = false;
    if (cleanupBtn) cleanupBtn.disabled = false;
  }

  /**
   * Toolbar Magnet / Glass·Cloud off: fling floating tools into toolbar icons, then tuck.
   * @param {{
   *   hostEl: HTMLElement,
   *   glassBtn?: HTMLElement|null,
   *   cloudBtn?: HTMLElement|null,
   *   glassOut?: boolean,
   *   cloudOut?: boolean,
   *   onTuck?: () => void
   * }} options
   */
  async function flingToolsToToolbar(options) {
    options = options || {};
    const hostEl = options.hostEl;
    if (!hostEl || resetBusy) return;
    const glassOut = !!options.glassOut;
    const cloudOut = !!options.cloudOut;
    if (!glassOut && !cloudOut) return;

    resetBusy = true;

    global.HwHomeworkComments?.disarm?.();
    global.HwMagnifyingGlass?.setArmed?.(false);

    const lens = glassOut ? hostEl.querySelector(":scope > .hw-mg-widget") : null;
    const launcher = cloudOut ? hostEl.querySelector(":scope > .hw-hc-launcher") : null;
    const flingSpecs = [];

    /* Prefer live rects; fall back to force-measure if opacity/boot hid size. */
    if (lens && options.glassBtn) {
      const from =
        isVisibleTool(lens) ? lens.getBoundingClientRect() : measureHiddenToolRect(lens);
      if (from) flingSpecs.push({ el: lens, fromRect: from, to: options.glassBtn });
    }
    if (launcher && options.cloudBtn) {
      const from =
        isVisibleTool(launcher)
          ? launcher.getBoundingClientRect()
          : measureHiddenToolRect(launcher);
      if (from) flingSpecs.push({ el: launcher, fromRect: from, to: options.cloudBtn });
    }

    /* Ghosts mount sync while still “out”; tuck originals immediately after. */
    const flyPromise = flingTools(flingSpecs);
    if (lens) lens.style.visibility = "hidden";
    if (launcher) launcher.style.visibility = "hidden";
    if (typeof options.onTuck === "function") options.onTuck();

    try {
      await flyPromise;
    } catch (_) {}

    if (lens) lens.style.visibility = "";
    if (launcher) launcher.style.visibility = "";
    resetBusy = false;
  }

  /**
   * Toolbar Glass/Cloud on: fling from toolbar icon out to the floating start spot.
   * @param {{
   *   hostEl: HTMLElement,
   *   glassBtn?: HTMLElement|null,
   *   cloudBtn?: HTMLElement|null,
   *   glass?: boolean,
   *   cloud?: boolean,
   *   onReveal?: () => void
   * }} options
   */
  async function flingToolsFromToolbar(options) {
    options = options || {};
    const hostEl = options.hostEl;
    if (!hostEl || resetBusy) return;
    const wantGlass = !!options.glass;
    const wantCloud = !!options.cloud;
    if (!wantGlass && !wantCloud) return;

    resetBusy = true;

    const lens = wantGlass ? hostEl.querySelector(":scope > .hw-mg-widget") : null;
    const launcher = wantCloud ? hostEl.querySelector(":scope > .hw-hc-launcher") : null;

    /*
     * First pop (nothing saved): pin to attach defaultLens / defaultLauncher so the
     * fling lands on the authored neutral, not a stale style left/top.
     */
    try {
      if (wantGlass) {
        const mgKey =
          (typeof global.HwMagnifyingGlass?.getStorageKey === "function" &&
            global.HwMagnifyingGlass.getStorageKey()) ||
          "";
        if (!mgKey || !localStorage.getItem(mgKey)) {
          global.HwMagnifyingGlass?.resetLensPosition?.();
        } else {
          global.HwMagnifyingGlass?.refresh?.();
        }
      }
      if (wantCloud) {
        const hcKey =
          (typeof global.HwHomeworkComments?.getStorageKey === "function" &&
            global.HwHomeworkComments.getStorageKey()) ||
          "";
        if (!hcKey || !localStorage.getItem(hcKey)) {
          global.HwHomeworkComments?.resetLauncherPosition?.();
        } else {
          global.HwHomeworkComments?.applyLauncherPosition?.();
        }
      }
    } catch (_) {
      if (wantGlass) global.HwMagnifyingGlass?.refresh?.();
      if (wantCloud) global.HwHomeworkComments?.applyLauncherPosition?.();
    }

    const prepared = [];
    let staggerIndex = 0;

    function queueOut(el, btn) {
      if (!el || !btn) return;
      const toRect = measureHiddenToolRect(el) || (isVisibleTool(el) ? el.getBoundingClientRect() : null);
      const fromBtn = readRect(btn);
      if (!toRect || !fromBtn) return;
      /* Start centered on the toolbar icon, sized like the floating tool. */
      const fromRect = {
        left: fromBtn.left + fromBtn.width / 2 - toRect.width / 2,
        top: fromBtn.top + fromBtn.height / 2 - toRect.height / 2,
        width: toRect.width,
        height: toRect.height,
        right: fromBtn.left + fromBtn.width / 2 + toRect.width / 2,
        bottom: fromBtn.top + fromBtn.height / 2 + toRect.height / 2,
      };
      const delayMs = staggerIndex * FLYBACK_STAGGER_MS;
      staggerIndex += 1;
      const mounted = mountFlybackGhost(fromRect, toRect, el);
      prepared.push({
        ghost: mounted.ghost,
        startLeft: mounted.startLeft,
        startTop: mounted.startTop,
        fromRect: mounted.fromRect,
        toRect: mounted.toRect,
        delayMs,
      });
    }

    if (!prefersReducedMotion()) {
      if (wantGlass) queueOut(lens, options.glassBtn);
      if (wantCloud) queueOut(launcher, options.cloudBtn);
    }

    const flyPromise = Promise.all(
      prepared.map((job) =>
        delay(job.delayMs).then(() =>
          runFlybackMotion(
            job.ghost,
            job.startLeft,
            job.startTop,
            job.fromRect,
            job.toRect
          )
        )
      )
    ).then(() => {});

    try {
      await flyPromise;
    } catch (_) {}

    if (typeof options.onReveal === "function") options.onReveal();
    resetBusy = false;
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
    flingTools,
    flingToolsToToolbar,
    flingToolsFromToolbar,
    animateToolFlyback,
    computeNeutralPositions,
    beginWorksheetToolBoot,
    cancelWorksheetToolBoot,
    revealWorksheetTools,
  };
})(window);
