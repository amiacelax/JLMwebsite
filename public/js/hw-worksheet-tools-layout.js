/**
 * Keep homework worksheet tools (magnifying glass, cloud launcher, note bubble, lookup popup)
 * from stacking on top of each other — lower-priority tools get nudged aside.
 */
(function (global) {
  const GAP = 10;
  const MAX_PASSES = 12;
  /* Match StarQ flyback duration (~620ms); transform-only for smooth live compositing. */
  const RETURN_MS = 620;
  const RETURN_EASE = "cubic-bezier(0.25, 0.85, 0.35, 1)";
  const FLYBACK_TRAVEL_MS = 620;
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
    ghost.style.setProperty("transform", "translate3d(0, 0, 0)", "important");
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

  /** Transform-only flyback. Ghost must already be mounted. */
  function runFlybackMotion(ghost, startLeft, startTop, fromRect, toRect) {
    if (!ghost || !toRect || !fromRect) return Promise.resolve();
    const dx =
      toRect.left + toRect.width / 2 - (startLeft + fromRect.width / 2);
    const dy =
      toRect.top + toRect.height / 2 - (startTop + fromRect.height / 2);

    return new Promise((resolve) => {
      /* Double-rAF: paint at start pose, then one composite transform travel. */
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          ghost.style.setProperty(
            "transition",
            "transform " + FLYBACK_TRAVEL_MS + "ms " + RETURN_EASE
          );
          ghost.style.setProperty(
            "transform",
            "translate3d(" + dx + "px, " + dy + "px, 0)",
            "important"
          );
        });
      });

      window.setTimeout(() => {
        ghost.style.removeProperty("transition");
        ghost.style.removeProperty("will-change");
        ghost.style.removeProperty("transform");
        ghost.remove();
        resolve();
      }, FLYBACK_TRAVEL_MS + 48);
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
    /* Dragged glass/cloud stays put — nudge the other tool aside. */
    if (pinEl && el === pinEl && isToolRowKind(kind)) return 100;
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
    /*
     * Glass/cloud may clear the magnet (horizontal) and each other (shortest axis)
     * so the two floating widgets cannot stack while dragging or after fling settle.
     */
    const toolRowVsMagnet =
      isToolRowKind(movable.kind) && fixed.kind === "tools-cleanup";
    const toolRowVsToolRow =
      isToolRowKind(movable.kind) && isToolRowKind(fixed.kind);
    if (!MOVABLE_KINDS.has(movable.kind) && !toolRowVsMagnet && !toolRowVsToolRow) {
      return null;
    }
    let sep;
    if (toolRowVsToolRow) {
      sep = separation(fixed.rect, movable.rect, gap);
    } else if (toolRowVsMagnet || isToolRowKind(movable.kind) || isToolRowPair(fixed, movable)) {
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

  const TOOL_SIZE = 72;
  const STACK_CENTER_GAP = TOOL_SIZE + GAP; /* Glass above Cloud */
  /** Authored homes — paste from teacher “Copy coords” tool. */
  const FOCUS_NEUTRALS = {
    lens: { x: 0, y: 497 },
    launcher: { x: 0, y: 579 },
  };
  const NORMAL_NEUTRALS = {
    lens: { x: 88.9, y: 329.3 },
    launcher: { x: 88.9, y: 416.9 },
  };
  /** User-saved homes (drag → Save). Beats authored/computed defaults. */
  const HOME_OVERRIDE_KEY = "hw-tool-homes-override-v1";
  let focusNeutralWatchBound = false;
  let lastFocusNeutralMode = null;
  let focusNeutralTimer = null;

  function isHomeworkFocusMode() {
    return document.body.classList.contains("hw-hw-focus-mode");
  }

  function toolbarBarEl() {
    return document.getElementById("hw-toolbar-bar");
  }

  /** Toolbar is in-flow under the HW box — no host-local absolute homes. */
  function getToolbarHome() {
    return null;
  }

  function clearMobileToolbarHome(bar) {
    const el = bar || toolbarBarEl();
    if (!el) return;
    el.classList.remove("hw-toolbar-bar--host-home");
    el.style.left = "";
    el.style.top = "";
  }

  /** Clears any leftover absolute parking; bar stays in document flow under the HW box. */
  function applyMobileToolbarHome() {
    clearMobileToolbarHome();
  }

  function ensureMobileToolbarWatch() {
    clearMobileToolbarHome();
  }

  function readHomeOverrides() {
    try {
      const raw = localStorage.getItem(HOME_OVERRIDE_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  function writeHomeOverride(mode, lens, launcher) {
    try {
      const all = readHomeOverrides();
      all[mode] = {
        lens: { x: lens.x, y: lens.y },
        launcher: { x: launcher.x, y: launcher.y },
      };
      localStorage.setItem(HOME_OVERRIDE_KEY, JSON.stringify(all));
      return all[mode];
    } catch {
      return null;
    }
  }

  function homeOverrideFor(mode) {
    const slot = readHomeOverrides()[mode];
    if (
      slot?.lens &&
      typeof slot.lens.x === "number" &&
      typeof slot.lens.y === "number" &&
      slot?.launcher &&
      typeof slot.launcher.x === "number" &&
      typeof slot.launcher.y === "number"
    ) {
      return {
        lens: { x: slot.lens.x, y: slot.lens.y },
        launcher: { x: slot.launcher.x, y: slot.launcher.y },
      };
    }
    return null;
  }

  function findWorksheetToolHost() {
    return (
      document.querySelector("#hw-hub-v4-homework .hw-hub-v2-worksheet") ||
      document.querySelector(".hw-hub-v2-worksheet") ||
      document.getElementById("hw-v5-worksheet-card") ||
      null
    );
  }

  function toolIsDragging(el) {
    return !!(el && el.classList.contains("is-dragging"));
  }

  /**
   * Outside Focus homes (fixed — from teacher Copy coords).
   * Host-local centers (translate -50%).
   */
  function computeNormalNeutrals(_hostEl) {
    return {
      lens: { ...NORMAL_NEUTRALS.lens },
      launcher: { ...NORMAL_NEUTRALS.launcher },
    };
  }

  /** Current-mode default homes for Glass + Cloud (focus vs normal). */
  function getModeNeutrals(hostEl) {
    const host = hostEl || findWorksheetToolHost();
    const mode = isHomeworkFocusMode() ? "focus" : "normal";
    const override = homeOverrideFor(mode);
    if (override) {
      return {
        mode,
        lens: override.lens,
        launcher: override.launcher,
        lensSnap: null,
        launcherSnap: null,
      };
    }
    if (mode === "focus") {
      return {
        mode,
        lens: { ...FOCUS_NEUTRALS.lens },
        launcher: { ...FOCUS_NEUTRALS.launcher },
        lensSnap: null,
        launcherSnap: null,
      };
    }
    const pair = computeNormalNeutrals(host);
    return {
      mode,
      lens: pair.lens,
      launcher: pair.launcher,
      lensSnap: null,
      launcherSnap: null,
    };
  }

  function modePositionTarget(kind, fallback) {
    if (kind === "lens") {
      const t = global.HwMagnifyingGlass?.getModePositionTarget?.();
      if (t && typeof t.x === "number" && typeof t.y === "number") return t;
    } else {
      const t = global.HwHomeworkComments?.getModePositionTarget?.();
      if (t && typeof t.x === "number" && typeof t.y === "number") return t;
    }
    return fallback;
  }

  /**
   * When Focus turns on/off: move out tools to that mode’s saved-or-default home.
   * Never overwrite a saved home with computed defaults (that was wiping drag work).
   */
  function applyModeNeutrals(hostEl, options) {
    options = options || {};
    const host = hostEl || findWorksheetToolHost();
    if (!host) return null;
    const fallback = getModeNeutrals(host);
    const glassTo = modePositionTarget("lens", fallback.lens);
    const cloudTo = modePositionTarget("launcher", fallback.launcher);
    const targets = {
      mode: fallback.mode,
      lens: glassTo,
      launcher: cloudTo,
      lensSnap: null,
      launcherSnap: null,
    };
    const lens = host.querySelector(":scope > .hw-mg-widget");
    const launcher = host.querySelector(":scope > .hw-hc-launcher");
    const glassOut = !!(lens && isVisibleTool(lens));
    const cloudOut = !!(launcher && isVisibleTool(launcher));
    const moveGlass = glassOut && !toolIsDragging(lens);
    const moveCloud = cloudOut && !toolIsDragging(launcher);

    /* Tucked tools: leave storage alone (next pop uses saved-or-default). */
    if (!moveGlass && !moveCloud) return targets;

    const animate = options.animate !== false && !prefersReducedMotion();
    if (animate) {
      const flingSpecs = [];
      if (moveGlass && lens) {
        const from = lens.getBoundingClientRect();
        flingSpecs.push({
          el: lens,
          fromRect: from,
          to: hostPointToViewportRect(host, glassTo.x, glassTo.y, from.width, from.height),
        });
      }
      if (moveCloud && launcher) {
        const from = launcher.getBoundingClientRect();
        flingSpecs.push({
          el: launcher,
          fromRect: from,
          to: hostPointToViewportRect(host, cloudTo.x, cloudTo.y, from.width, from.height),
        });
      }
      /* Mount decorative ghosts from the old spots, then snap live tools home. */
      const fly = flingTools(flingSpecs);
      if (moveGlass) {
        global.HwMagnifyingGlass?.setLensPositionLocal?.(glassTo.x, glassTo.y, false);
      }
      if (moveCloud) {
        global.HwHomeworkComments?.setLauncherPositionLocal?.(cloudTo.x, cloudTo.y, false);
      }
      Promise.resolve(fly)
        .catch(() => {})
        .then(() => {
          requestAnimationFrame(() => resolve(host));
        });
      return targets;
    }

    if (moveGlass) {
      global.HwMagnifyingGlass?.setLensPositionLocal?.(glassTo.x, glassTo.y, false);
    }
    if (moveCloud) {
      global.HwHomeworkComments?.setLauncherPositionLocal?.(cloudTo.x, cloudTo.y, false);
    }
    requestAnimationFrame(() => resolve(host));
    return targets;
  }

  function readCurrentToolPositions() {
    const host = findWorksheetToolHost();
    if (!host) return null;
    const mode = isHomeworkFocusMode() ? "focus" : "normal";
    const lens = host.querySelector(":scope > .hw-mg-widget");
    const launcher = host.querySelector(":scope > .hw-hc-launcher");
    const glassPos =
      global.HwMagnifyingGlass?.getLensPosition?.() ||
      (lens
        ? {
            x: parseFloat(lens.style.left) || 0,
            y: parseFloat(lens.style.top) || 0,
          }
        : null);
    const cloudPos =
      global.HwHomeworkComments?.getLauncherPosition?.() ||
      (launcher
        ? {
            x: parseFloat(launcher.style.left) || 0,
            y: parseFloat(launcher.style.top) || 0,
          }
        : null);
    if (
      !glassPos ||
      !cloudPos ||
      typeof glassPos.x !== "number" ||
      typeof cloudPos.x !== "number"
    ) {
      return null;
    }
    return {
      mode,
      glass: {
        x: Math.round(glassPos.x * 10) / 10,
        y: Math.round(glassPos.y * 10) / 10,
      },
      cloud: {
        x: Math.round(cloudPos.x * 10) / 10,
        y: Math.round(cloudPos.y * 10) / 10,
      },
    };
  }

  function formatCoordsBlurb(pos) {
    if (!pos) return "";
    const label = pos.mode === "focus" ? "live focus" : "live non-focus";
    return (
      label +
      "\n" +
      "Glass x: " +
      pos.glass.x +
      "  y: " +
      pos.glass.y +
      "\n" +
      "Cloud x: " +
      pos.cloud.x +
      "  y: " +
      pos.cloud.y
    );
  }

  /* ——— Click-to-copy coords (same host-local space as Glass/Cloud) ——— */
  let pickModeActive = false;
  let pickedEl = null;
  let pickHoverEl = null;
  let pickHighlightEl = null;
  let pickLiveRaf = 0;
  /** Last click-point payload (re-copied by “Copy coords”). */
  let lastPointCoords = null;

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function shortElementLabel(el) {
    if (!el || el === document.body || el === document.documentElement) return "page";
    if (el.id) return "#" + el.id;
    const cls = (el.className && typeof el.className === "string"
      ? el.className
      : el.getAttribute?.("class") || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(".");
    const tag = (el.tagName || "?").toLowerCase();
    return cls ? tag + "." + cls : tag;
  }

  function measureClickPoint(clientX, clientY) {
    const host = findWorksheetToolHost();
    const mode = isHomeworkFocusMode() ? "focus" : "normal";
    let space = "viewport";
    let x = clientX;
    let y = clientY;
    if (host) {
      const hr = host.getBoundingClientRect();
      x = clientX - hr.left;
      y = clientY - hr.top;
      space = "host-local";
    }
    return {
      mode,
      space,
      x: round1(x),
      y: round1(y),
    };
  }

  function measureElementCoords(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    const host = findWorksheetToolHost();
    const mode = isHomeworkFocusMode() ? "focus" : "normal";
    let space = "viewport";
    let left = r.left;
    let top = r.top;
    if (host) {
      const hr = host.getBoundingClientRect();
      left = r.left - hr.left;
      top = r.top - hr.top;
      space = "host-local";
    }
    const cx = left + r.width / 2;
    const cy = top + r.height / 2;
    /* Glass/Cloud store center points with translate(-50%,-50%). */
    return {
      mode,
      space,
      label: shortElementLabel(el),
      x: round1(cx),
      y: round1(cy),
      left: round1(left),
      top: round1(top),
      w: round1(r.width),
      h: round1(r.height),
      viewport: {
        left: round1(r.left),
        top: round1(r.top),
        x: round1(r.left + r.width / 2),
        y: round1(r.top + r.height / 2),
      },
    };
  }

  function formatPointCoordsBlurb(info) {
    if (!info) return "";
    const spaceNote =
      info.space === "host-local"
        ? "host-local (same as Glass/Cloud)"
        : "viewport (no worksheet host)";
    const modeLabel = info.mode === "focus" ? "live focus" : "live non-focus";
    let text =
      "point · " +
      modeLabel +
      " · " +
      spaceNote +
      "\n" +
      "x: " +
      info.x +
      "  y: " +
      info.y;
    if (info.elCenter && info.under) {
      text +=
        "\n" +
        info.under +
        " center x: " +
        info.elCenter.x +
        "  y: " +
        info.elCenter.y;
    } else if (info.under) {
      text += "\nunder: " + info.under;
    }
    return text;
  }

  function formatPickedCoordsBlurb(info) {
    if (!info) return "";
    const spaceNote =
      info.space === "host-local"
        ? "host-local center (same as Glass/Cloud)"
        : "viewport center (no worksheet host)";
    const modeLabel = info.mode === "focus" ? "focus" : "non-focus";
    return (
      info.label +
      " · " +
      modeLabel +
      " · " +
      spaceNote +
      "\n" +
      "center x: " +
      info.x +
      "  y: " +
      info.y +
      "\n" +
      "top-left x: " +
      info.left +
      "  y: " +
      info.top +
      "\n" +
      "size w: " +
      info.w +
      "  h: " +
      info.h
    );
  }

  function ensurePickHighlight() {
    if (pickHighlightEl && pickHighlightEl.isConnected) return pickHighlightEl;
    const box = document.createElement("div");
    box.id = "hw-tool-pick-highlight";
    box.className = "hw-tool-pick-highlight";
    box.setAttribute("aria-hidden", "true");
    document.body.appendChild(box);
    pickHighlightEl = box;
    return box;
  }

  function updatePickHighlight(el) {
    const box = ensurePickHighlight();
    if (!el) {
      box.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
  }

  function isLayoutToolsChrome(el) {
    if (!el || !el.closest) return false;
    return !!(
      el.closest("#hw-tool-layout-tools") ||
      el.closest("#hw-tool-pick-highlight") ||
      el.closest("#hw-tool-coord-toast")
    );
  }

  function resolvePickTarget(raw) {
    if (!raw || isLayoutToolsChrome(raw)) return null;
    let el = raw;
    /* Prefer a meaningful interactive / layout node over tiny text nodes' parents. */
    if (el.nodeType === 3) el = el.parentElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    return el;
  }

  function refreshPickChrome() {
    const btn = document.getElementById("hw-pick-element-coords");
    if (btn) {
      btn.classList.toggle("is-active", pickModeActive);
      if (pickModeActive) {
        btn.textContent = pickedEl ? "Click a point…" : "Click to lock…";
      } else {
        btn.textContent = "Click to copy";
      }
      btn.setAttribute("aria-pressed", pickModeActive ? "true" : "false");
    }
    const hint = document.getElementById("hw-tool-layout-hint");
    if (hint) {
      if (pickModeActive) {
        hint.textContent = pickedEl
          ? "Element locked — click anywhere for coords · Esc clears lock"
          : "First click locks an element · then click for coords";
      } else if (pickedEl) {
        hint.textContent =
          "Locked " +
          shortElementLabel(pickedEl) +
          " · Click to copy for points, or Clear / Esc";
      } else {
        hint.textContent = "Click to copy a point, or right‑click Glass / Cloud";
      }
    }
    const clearBtn = document.getElementById("hw-clear-pick-coords");
    if (clearBtn) {
      clearBtn.hidden = !(pickedEl || lastPointCoords);
    }
  }

  function setPickMode(on) {
    pickModeActive = !!on;
    document.documentElement.classList.toggle("hw-tool-pick-mode", pickModeActive);
    if (!pickModeActive) {
      pickHoverEl = null;
      if (!pickedEl && !lastPointCoords) updatePickHighlight(null);
      else if (pickedEl) updatePickHighlight(pickedEl);
    }
    refreshPickChrome();
    refreshLayoutToolsReadout();
  }

  function clearPickedElement() {
    pickedEl = null;
    pickHoverEl = null;
    lastPointCoords = null;
    updatePickHighlight(null);
    refreshPickChrome();
    refreshLayoutToolsReadout();
  }

  /** First click: lock one element. Does not copy. */
  function selectLockedElement(el) {
    if (!el) return;
    pickedEl = el;
    pickHoverEl = null;
    updatePickHighlight(el);
    refreshPickChrome();
    refreshLayoutToolsReadout();
    showCoordToast(shortElementLabel(el) + " — locked. Next click copies a point.");
  }

  /**
   * Further clicks: copy host-local point. Never changes the locked element.
   * Pass lockedEl only for blurb labeling (center of locked selection).
   */
  async function copyPickAtPoint(clientX, clientY) {
    const point = measureClickPoint(clientX, clientY);
    const el = pickedEl && pickedEl.isConnected ? pickedEl : null;
    if (el) {
      updatePickHighlight(el);
      point.under = shortElementLabel(el);
      const elInfo = measureElementCoords(el);
      if (elInfo) {
        point.elCenter = { x: elInfo.x, y: elInfo.y };
      }
    }
    lastPointCoords = point;
    refreshPickChrome();
    refreshLayoutToolsReadout();
    const text = await copyTextToClipboard(formatPointCoordsBlurb(point));
    showCoordToast("Copied " + point.x + ", " + point.y);
    return text;
  }

  function showCoordToast(message) {
    const flash = document.getElementById("hw-tool-coord-toast");
    const el =
      flash ||
      (() => {
        const t = document.createElement("div");
        t.id = "hw-tool-coord-toast";
        t.className = "hw-tool-coord-toast";
        document.body.appendChild(t);
        return t;
      })();
    el.textContent = message;
    el.hidden = false;
    window.clearTimeout(el._hwHide);
    el._hwHide = window.setTimeout(() => {
      el.hidden = true;
    }, 1800);
  }

  function schedulePickLiveRefresh() {
    if (pickLiveRaf) return;
    pickLiveRaf = requestAnimationFrame(() => {
      pickLiveRaf = 0;
      if (pickedEl) updatePickHighlight(pickedEl);
      else if (pickModeActive && pickHoverEl) updatePickHighlight(pickHoverEl);
      refreshLayoutToolsReadout();
    });
  }

  function bindPickElementMode() {
    if (document.documentElement.dataset.hwToolPickBound === "1") return;
    document.documentElement.dataset.hwToolPickBound = "1";

    document.addEventListener(
      "pointermove",
      (e) => {
        if (!pickModeActive || !canUseLayoutTools()) return;
        /* Locked selection — highlight stays on that element. */
        if (pickedEl) {
          if (pickedEl.isConnected) updatePickHighlight(pickedEl);
          return;
        }
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const target = resolvePickTarget(under);
        if (target === pickHoverEl) return;
        pickHoverEl = target;
        updatePickHighlight(target);
      },
      true
    );

    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!pickModeActive || !canUseLayoutTools()) return;
        if (isLayoutToolsChrome(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        /* Already locked — further clicks only copy the point. */
        if (pickedEl && pickedEl.isConnected) {
          copyPickAtPoint(e.clientX, e.clientY);
          return;
        }
        /* First click — lock element only (no copy, no re-select later). */
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const target = resolvePickTarget(under);
        if (!target) {
          showCoordToast("Click an element to lock it first");
          return;
        }
        selectLockedElement(target);
      },
      true
    );

    document.addEventListener(
      "keydown",
      (e) => {
        if (!canUseLayoutTools()) return;
        if (e.key !== "Escape") return;
        if (pickedEl || lastPointCoords) {
          clearPickedElement();
          e.preventDefault();
          return;
        }
        if (pickModeActive) {
          setPickMode(false);
          e.preventDefault();
        }
      },
      true
    );

    window.addEventListener("scroll", schedulePickLiveRefresh, true);
    window.addEventListener("resize", schedulePickLiveRefresh);
  }

  /**
   * Drag Glass/Cloud where you want, then call this (or the Save button) to lock
   * them as that mode’s home. Works with designFocus.
   */
  function saveCurrentAsHomes() {
    const pos = readCurrentToolPositions();
    if (!pos) {
      console.warn("[hw tools] Pop Glass and Cloud out first, then save homes.");
      return null;
    }
    const saved = writeHomeOverride(pos.mode, pos.glass, pos.cloud);
    global.HwMagnifyingGlass?.setLensPositionLocal?.(pos.glass.x, pos.glass.y, true);
    global.HwHomeworkComments?.setLauncherPositionLocal?.(pos.cloud.x, pos.cloud.y, true);
    console.info("[hw tools] Saved " + pos.mode + " homes:", saved);
    return { mode: pos.mode, ...saved };
  }

  function clearHomeOverrides() {
    try {
      localStorage.removeItem(HOME_OVERRIDE_KEY);
    } catch {
      /* ignore */
    }
  }

  function canUseLayoutTools() {
    if (document.body.classList.contains("hw-role-teacher")) return true;
    if (document.documentElement.classList.contains("hw-is-teacher")) return true;
    /* Teacher viewing as a student still needs the coord tools. */
    try {
      if (global.HwAuth?.getTeacherSession?.()) return true;
    } catch {
      /* ignore */
    }
    if (global.HwFeatureFlags?.designFocus?.() === true) return true;
    if (global.HwFeatureFlags?.isLocalDev?.() === true) return true;
    return false;
  }

  function refreshLayoutToolsReadout() {
    const readout = document.getElementById("hw-tool-coords-readout");
    if (!readout) return;

    if (pickModeActive) {
      if (pickedEl && pickedEl.isConnected) {
        const lock = shortElementLabel(pickedEl);
        const last = lastPointCoords
          ? " · last " + lastPointCoords.x + "," + lastPointCoords.y
          : "";
        readout.textContent = "Locked " + lock + last + " · click for coords";
        return;
      }
      if (pickHoverEl) {
        const info = measureElementCoords(pickHoverEl);
        if (info) {
          readout.textContent =
            "Lock · " + info.label + " · center " + info.x + "," + info.y;
          return;
        }
      }
      readout.textContent = "Click an element to lock it";
      return;
    }

    if (lastPointCoords) {
      const p = lastPointCoords;
      const space = p.space === "host-local" ? "host" : "vp";
      let text =
        "Point · " + space + " " + p.x + "," + p.y;
      if (p.under) text += " · " + p.under;
      readout.textContent = text;
      return;
    }

    if (pickedEl) {
      if (!pickedEl.isConnected) {
        pickedEl = null;
        pickHoverEl = null;
        updatePickHighlight(null);
        refreshPickChrome();
      } else {
        const info = measureElementCoords(pickedEl);
        if (!info) {
          readout.textContent = "Selected element not measurable";
          return;
        }
        const space = info.space === "host-local" ? "host" : "vp";
        readout.textContent =
          info.label +
          " · " +
          space +
          " center " +
          info.x +
          "," +
          info.y +
          " · " +
          info.w +
          "×" +
          info.h;
        return;
      }
    }

    const pos = readCurrentToolPositions();
    if (!pos) {
      readout.textContent = "Pop Glass + Cloud, or Click to copy";
      return;
    }
    const label = pos.mode === "focus" ? "Focus" : "Non-focus";
    readout.textContent =
      label +
      " · Glass " +
      pos.glass.x +
      "," +
      pos.glass.y +
      " · Cloud " +
      pos.cloud.x +
      "," +
      pos.cloud.y;
  }

  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy these coords:", text);
    }
    console.info("[hw tools]\n" + text);
    return text;
  }

  async function copyPickedCoords() {
    if (!pickedEl || !pickedEl.isConnected) return null;
    const info = measureElementCoords(pickedEl);
    if (!info) return null;
    return copyTextToClipboard(formatPickedCoordsBlurb(info));
  }

  async function copyLastPointCoords() {
    if (!lastPointCoords) return null;
    return copyTextToClipboard(formatPointCoordsBlurb(lastPointCoords));
  }

  async function copyToolCoords() {
    if (lastPointCoords) {
      return copyLastPointCoords();
    }
    if (pickedEl && pickedEl.isConnected) {
      return copyPickedCoords();
    }
    const pos = readCurrentToolPositions();
    if (!pos) return null;
    return copyTextToClipboard(formatCoordsBlurb(pos));
  }

  function ensureSaveHomesControl() {
    if (!canUseLayoutTools()) return;
    if (document.getElementById("hw-tool-layout-tools")) {
      refreshLayoutToolsReadout();
      return;
    }

    const panel = document.createElement("div");
    panel.id = "hw-tool-layout-tools";
    panel.className = "hw-tool-layout-tools";
    panel.innerHTML =
      '<p class="hw-tool-layout-tools__label">Tool positions</p>' +
      '<p class="hw-tool-layout-tools__readout" id="hw-tool-coords-readout">Pop Glass + Cloud, or Click to copy</p>' +
      '<div class="hw-tool-layout-tools__row">' +
      '<button type="button" class="hw-tool-layout-tools__btn" id="hw-pick-element-coords" aria-pressed="false">Click to copy</button>' +
      '<button type="button" class="hw-tool-layout-tools__btn" id="hw-copy-tool-coords">Copy coords</button>' +
      '<button type="button" class="hw-tool-layout-tools__btn" id="hw-clear-pick-coords" hidden>Clear</button>' +
      '<button type="button" class="hw-tool-layout-tools__btn hw-tool-layout-tools__btn--save" id="hw-save-tool-homes">Save as home</button>' +
      "</div>" +
      '<p class="hw-tool-layout-tools__hint" id="hw-tool-layout-hint">Click to copy a point, or right‑click Glass / Cloud</p>';

    panel.querySelector("#hw-pick-element-coords").addEventListener("click", () => {
      if (pickModeActive) {
        setPickMode(false);
        return;
      }
      setPickMode(true);
    });

    panel.querySelector("#hw-copy-tool-coords").addEventListener("click", async () => {
      const btn = panel.querySelector("#hw-copy-tool-coords");
      const text = await copyToolCoords();
      if (!text) {
        btn.textContent =
          pickedEl || lastPointCoords ? "Nothing to copy" : "Pop tools or Click";
        window.setTimeout(() => {
          btn.textContent = "Copy coords";
        }, 1600);
        return;
      }
      btn.textContent = "Copied!";
      refreshLayoutToolsReadout();
      window.setTimeout(() => {
        btn.textContent = "Copy coords";
      }, 1200);
    });

    panel.querySelector("#hw-clear-pick-coords").addEventListener("click", () => {
      clearPickedElement();
      showCoordToast("Selection cleared");
    });

    panel.querySelector("#hw-save-tool-homes").addEventListener("click", () => {
      const btn = panel.querySelector("#hw-save-tool-homes");
      const result = saveCurrentAsHomes();
      if (!result) {
        btn.textContent = "Pop tools out first";
        window.setTimeout(() => {
          btn.textContent = "Save as home";
        }, 1600);
        return;
      }
      btn.textContent = "Saved " + result.mode;
      refreshLayoutToolsReadout();
      window.setTimeout(() => {
        btn.textContent = "Save as home";
      }, 1600);
    });

    document.body.appendChild(panel);
    refreshPickChrome();
    refreshLayoutToolsReadout();
    document.addEventListener(
      "pointerup",
      () => window.setTimeout(refreshLayoutToolsReadout, 50),
      true
    );
    try {
      const obs = new MutationObserver(() => refreshLayoutToolsReadout());
      obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch {
      /* ignore */
    }
    bindToolCoordContextMenus();
    bindPickElementMode();
  }

  function bindToolCoordContextMenus() {
    if (document.documentElement.dataset.hwToolCoordCtx === "1") return;
    document.documentElement.dataset.hwToolCoordCtx = "1";
    document.addEventListener(
      "contextmenu",
      async (e) => {
        if (!canUseLayoutTools()) return;
        if (pickModeActive) return;
        const glass = e.target.closest?.(".hw-mg-widget");
        const cloud = e.target.closest?.(".hw-hc-launcher");
        if (!glass && !cloud) return;
        e.preventDefault();
        e.stopPropagation();
        /* Right-click always copies Glass+Cloud pair (ignore pick selection). */
        const pos = readCurrentToolPositions();
        if (!pos) {
          window.alert("Pop both Glass and Cloud out first, then right‑click again.");
          return;
        }
        const text = await copyTextToClipboard(formatCoordsBlurb(pos));
        const which = glass ? "Glass" : "Cloud";
        showCoordToast(which + " — coords copied. Paste in chat.");
        refreshLayoutToolsReadout();
        return text;
      },
      true
    );
  }

  function setOutToolsHidden(host, hidden) {
    if (!host) return;
    const lens = host.querySelector(":scope > .hw-mg-widget");
    const launcher = host.querySelector(":scope > .hw-hc-launcher");
    [lens, launcher].forEach((el) => {
      if (!el || !isVisibleTool(el)) return;
      if (hidden) el.style.visibility = "hidden";
      else el.style.visibility = "";
    });
  }

  /**
   * Call BEFORE toggling hw-hw-focus-mode so tools never paint mid-zoom.
   */
  function beginFocusToolSwitch() {
    document.documentElement.classList.add("hw-focus-tools-switching");
    document.body.classList.add("hw-focus-tools-switching");
    const host = findWorksheetToolHost();
    setOutToolsHidden(host, true);
  }

  function endFocusToolSwitch() {
    const host = findWorksheetToolHost();
    applyModeNeutrals(host, { animate: false });
    applyMobileToolbarHome(host);
    /* Double rAF: wait for zoom/layout paint at new homes before showing. */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyMobileToolbarHome(host);
        setOutToolsHidden(host, false);
        document.documentElement.classList.remove("hw-focus-tools-switching");
        document.body.classList.remove("hw-focus-tools-switching");
      });
    });
  }

  function onFocusModeChange() {
    const host = findWorksheetToolHost();
    if (!host) return;
    const mode = isHomeworkFocusMode() ? "focus" : "normal";
    if (mode === lastFocusNeutralMode) return;
    lastFocusNeutralMode = mode;
    if (focusNeutralTimer) window.clearTimeout(focusNeutralTimer);
    beginFocusToolSwitch();
    /* Wait for Focus scale / chrome hide to settle while tools stay invisible. */
    focusNeutralTimer = window.setTimeout(() => {
      focusNeutralTimer = null;
      endFocusToolSwitch();
    }, 280);
  }

  function ensureFocusNeutralWatch() {
    if (focusNeutralWatchBound) return;
    focusNeutralWatchBound = true;
    lastFocusNeutralMode = isHomeworkFocusMode() ? "focus" : "normal";
    try {
      const obs = new MutationObserver(() => onFocusModeChange());
      obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    } catch (_) {}
    document.addEventListener("fullscreenchange", () => {
      window.setTimeout(onFocusModeChange, 80);
    });
    ensureMobileToolbarWatch();
    ensureSaveHomesControl();
  }

  /** Magnifying glass top-right; cloud launcher top-left (host-local px, snap like lens).
   *  Attach defaults (toolbar playtest free coords / snaps) override live neutrals. */
  function computeNeutralPositions(hostEl) {
    if (!hostEl) return null;
    const w = hostEl.clientWidth;
    const h = hostEl.clientHeight;
    if (!w || !h) return null;

    ensureFocusNeutralWatch();

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
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.style.transition = "";
        el.classList.remove("hw-tools-returning");
        el.removeEventListener("pointerdown", finish, true);
        resolve();
      };
      el.classList.add("hw-tools-returning");
      el.style.transition = "left " + RETURN_MS + "ms " + RETURN_EASE;
      el.style.left = targetLeft + unit;
      /* Pointer takes over immediately — do not wait for the slide to finish. */
      el.addEventListener("pointerdown", finish, true);
      window.setTimeout(finish, RETURN_MS + 40);
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
        fromRect: from,
        to: hostPointToViewportRect(hostEl, neutral.lens.x, neutral.lens.y, from.width, from.height),
      });
    }
    if (neutral && launcher && isVisibleTool(launcher)) {
      const from = launcher.getBoundingClientRect();
      flingSpecs.push({
        el: launcher,
        fromRect: from,
        to: hostPointToViewportRect(
          hostEl,
          neutral.launcher.x,
          neutral.launcher.y,
          from.width,
          from.height
        ),
      });
    }

    /*
     * Ghosts mount at the old spots first. Then snap tools to neutrals and keep
     * them live — decorative flyback must not block click/drag.
     */
    const flyPromise = flingTools(flingSpecs);

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

    try {
      await flyPromise;
    } catch (_) {}

    requestAnimationFrame(() => resolve(hostEl));

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
     * First pop / mode home: load this mode’s saved spot, or the mode neutral.
     */
    try {
      if (wantGlass) {
        if (typeof global.HwMagnifyingGlass?.syncModePosition === "function") {
          global.HwMagnifyingGlass.syncModePosition();
        } else {
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
      }
      if (wantCloud) {
        if (typeof global.HwHomeworkComments?.syncModePosition === "function") {
          global.HwHomeworkComments.syncModePosition();
        } else {
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

    /*
     * Reveal immediately so Glass/Cloud are live at their home while the
     * decorative ghost still flies out of the toolbar (ghost is pointer-events:none).
     */
    if (typeof options.onReveal === "function") options.onReveal();

    try {
      await flyPromise;
    } catch (_) {}

    /* After settle, separate glass/cloud if they land stacked. */
    requestAnimationFrame(() => resolve(hostEl));
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
    getModeNeutrals,
    applyModeNeutrals,
    onFocusModeChange,
    ensureFocusNeutralWatch,
    beginFocusToolSwitch,
    saveCurrentAsHomes,
    clearHomeOverrides,
    ensureSaveHomesControl,
    readCurrentToolPositions,
    copyToolCoords,
    copyPickedCoords,
    copyLastPointCoords,
    formatCoordsBlurb,
    formatPickedCoordsBlurb,
    formatPointCoordsBlurb,
    measureElementCoords,
    measureClickPoint,
    beginWorksheetToolBoot,
    cancelWorksheetToolBoot,
    revealWorksheetTools,
    getToolbarHome,
    applyMobileToolbarHome,
    clearMobileToolbarHome,
    ensureMobileToolbarWatch,
  };
})(window);


