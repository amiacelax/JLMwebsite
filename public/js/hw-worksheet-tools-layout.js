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
          to: hostPointToViewportRect(host, glassTo.x, glassTo.y, from.width, from.height),
        });
        lens.style.visibility = "hidden";
      }
      if (moveCloud && launcher) {
        const from = launcher.getBoundingClientRect();
        flingSpecs.push({
          el: launcher,
          to: hostPointToViewportRect(host, cloudTo.x, cloudTo.y, from.width, from.height),
        });
        launcher.style.visibility = "hidden";
      }
      const fly = flingTools(flingSpecs);
      Promise.resolve(fly)
        .catch(() => {})
        .then(() => {
          if (moveGlass) {
            global.HwMagnifyingGlass?.setLensPositionLocal?.(glassTo.x, glassTo.y, false);
            if (lens) lens.style.visibility = "";
          }
          if (moveCloud) {
            global.HwHomeworkComments?.setLauncherPositionLocal?.(cloudTo.x, cloudTo.y, false);
            if (launcher) launcher.style.visibility = "";
          }
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
    const pos = readCurrentToolPositions();
    if (!pos) {
      readout.textContent = "Pop Glass + Cloud out to see coords";
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

  async function copyToolCoords() {
    const pos = readCurrentToolPositions();
    if (!pos) return null;
    const text = formatCoordsBlurb(pos);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy these coords:", text);
    }
    console.info("[hw tools]\n" + text);
    return text;
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
      '<p class="hw-tool-layout-tools__readout" id="hw-tool-coords-readout">Pop Glass + Cloud out to see coords</p>' +
      '<div class="hw-tool-layout-tools__row">' +
      '<button type="button" class="hw-tool-layout-tools__btn" id="hw-copy-tool-coords">Copy coords</button>' +
      '<button type="button" class="hw-tool-layout-tools__btn hw-tool-layout-tools__btn--save" id="hw-save-tool-homes">Save as home</button>' +
      "</div>" +
      '<p class="hw-tool-layout-tools__hint">Or right‑click Glass / Cloud → Copy coords</p>';

    panel.querySelector("#hw-copy-tool-coords").addEventListener("click", async () => {
      const btn = panel.querySelector("#hw-copy-tool-coords");
      const text = await copyToolCoords();
      if (!text) {
        btn.textContent = "Pop tools out first";
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
  }

  function bindToolCoordContextMenus() {
    if (document.documentElement.dataset.hwToolCoordCtx === "1") return;
    document.documentElement.dataset.hwToolCoordCtx = "1";
    document.addEventListener(
      "contextmenu",
      async (e) => {
        if (!canUseLayoutTools()) return;
        const glass = e.target.closest?.(".hw-mg-widget");
        const cloud = e.target.closest?.(".hw-hc-launcher");
        if (!glass && !cloud) return;
        e.preventDefault();
        e.stopPropagation();
        const text = await copyToolCoords();
        if (!text) {
          window.alert("Pop both Glass and Cloud out first, then right‑click again.");
          return;
        }
        const which = glass ? "Glass" : "Cloud";
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
        el.textContent = which + " — coords copied. Paste in chat.";
        el.hidden = false;
        window.clearTimeout(el._hwHide);
        el._hwHide = window.setTimeout(() => {
          el.hidden = true;
        }, 1800);
        refreshLayoutToolsReadout();
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
    /* Double rAF: wait for zoom/layout paint at new homes before showing. */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
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

    try {
      await flyPromise;
    } catch (_) {}

    if (typeof options.onReveal === "function") options.onReveal();
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
    formatCoordsBlurb,
    beginWorksheetToolBoot,
    cancelWorksheetToolBoot,
    revealWorksheetTools,
  };
})(window);


