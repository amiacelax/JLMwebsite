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

  const ANCHOR_KINDS = new Set(["hc-mini", "hc-memo"]);

  const MOVABLE_KINDS = new Set(["mg-lens", "mg-popup", "hc-launcher"]);



  let resetBusy = false;



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

    hostEl.querySelectorAll(".hw-hc-mini").forEach((el) => {

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

    [

      { el: hostEl.querySelector(".hw-hc-launcher"), kind: "hc-launcher", priority: 1 },

      { el: hostEl.querySelector(".hw-mg-widget"), kind: "mg-lens", priority: 1 },

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
    return kinds.has("mg-lens") && kinds.has("hc-launcher");
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

    if (!MOVABLE_KINDS.has(kind)) return;

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

    const sep = isToolRowPair(fixed, movable)
      ? separationHorizontalOnly(fixed.rect, movable.rect, gap)
      : separation(fixed.rect, movable.rect, gap);

    if (!sep) return null;

    return { tool: movable, sep };

  }



  function resolvePair(a, b, gap) {

    const aAnchor = ANCHOR_KINDS.has(a.kind);

    const bAnchor = ANCHOR_KINDS.has(b.kind);

    const aMovable = MOVABLE_KINDS.has(a.kind);

    const bMovable = MOVABLE_KINDS.has(b.kind);



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



  /** Magnifying glass top-right; cloud launcher beside title. */
  function computeNeutralPositions(hostEl) {
    if (!hostEl) return null;
    const hostRect = hostEl.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return null;

    const launcherEl = hostEl.querySelector(".hw-hc-launcher");
    const lensEl = hostEl.querySelector(".hw-mg-widget");
    const title = hostEl.querySelector(".hw-hub-v2-top__title, #hw-v2-title, .hw-worksheet__meta-title");
    const header = hostEl.querySelector(".hw-hub-v2-top--in-card, .hw-hub-v2-top");
    const toolW =
      launcherEl?.getBoundingClientRect().width ||
      lensEl?.getBoundingClientRect().width ||
      72;
    const half = toolW / 2;
    const pad = 12;
    const titleGap = 10;
    const broomLane = 76;

    let rowY;
    let cloudCenterX;

    if (title && title.getClientRects().length) {
      const t = title.getBoundingClientRect();
      rowY = t.top + t.height / 2 - hostRect.top;
      cloudCenterX = t.left - hostRect.left - titleGap - half;
    } else if (header && header.getClientRects().length) {
      const h = header.getBoundingClientRect();
      rowY = h.top + h.height / 2 - hostRect.top;
      cloudCenterX = hostRect.width * 0.42;
    } else {
      rowY = pad + half;
      cloudCenterX = hostRect.width * 0.4;
    }

    let cloudX = cloudCenterX;
    const minCloudX = broomLane + half;
    const maxCloudX = hostRect.width - half - pad;
    cloudX = Math.max(minCloudX, Math.min(cloudX, maxCloudX));

    const sharedY = Math.max(half + pad, Math.min(rowY, hostRect.height - half - pad));
    const lensX = hostRect.width - pad;
    const lensY = pad;

    return {
      sharedY,
      lensX,
      lensY,
      lens: { x: lensX, y: lensY },
      lensSnap: "tr",
      launcher: {
        x: (cloudX / hostRect.width) * 100,
        y: (sharedY / hostRect.height) * 100,
      },
    };
  }

  function applyToolRowY(hostEl, sharedY, persist) {
    if (!hostEl) return;
    const yPct = (sharedY / hostEl.clientHeight) * 100;
    const launcherEl = hostEl.querySelector(".hw-hc-launcher");
    if (launcherEl && global.HwHomeworkComments?.setLauncherPosition) {
      const x = parseFloat(launcherEl.style.left) || 0;
      global.HwHomeworkComments.setLauncherPosition(x, yPct, persist);
    }
  }

  function finalizeNeutralPositions(hostEl, neutral) {
    if (!hostEl || !neutral) return;
    const yPct =
      neutral.sharedY != null
        ? (neutral.sharedY / hostEl.clientHeight) * 100
        : neutral.launcher.y;
    if (neutral.lensSnap && global.HwMagnifyingGlass?.setLensSnap) {
      global.HwMagnifyingGlass.setLensSnap(neutral.lensSnap);
    } else {
      global.HwMagnifyingGlass?.setLensPositionLocal?.(neutral.lens.x, neutral.lens.y, true);
    }
    global.HwHomeworkComments?.setLauncherPosition?.(neutral.launcher.x, yPct, true);
  }

  function syncNeutralToolRow(hostEl) {
    const neutral = computeNeutralPositions(hostEl);
    if (neutral) finalizeNeutralPositions(hostEl, neutral);
  }

  function toolsOverlap(hostEl) {
    const launcher = hostEl.querySelector(".hw-hc-launcher");
    const lens = hostEl.querySelector(".hw-mg-widget");
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
      hostEl.querySelector(".hw-hc-launcher") && hostEl.querySelector(".hw-mg-widget");
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

  function broomIconSvg() {
    return (
      '<svg class="hw-tools-cleanup__icon" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M16.75 4.25 15.05 5.95l-6.3 6.3 1.7 1.7 6.3-6.3 1.7-1.7a1.2 1.2 0 0 0 0-1.7l-1.1-1.1a1.2 1.2 0 0 0-1.7 0z"/>' +
      '<path fill="currentColor" d="M4.25 16.25c0-1.65 3.15-3.25 6.75-3.25s6.75 1.6 6.75 3.25c0 1.35-2.15 3.75-6.75 3.75s-6.75-2.4-6.75-3.75z"/>' +
      '<path fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" d="M6.5 15.25c1.6-.85 3.4-1 4.85-.55 1.2.38 2.15 1.15 2.55 2.15" opacity="0.42"/>' +
      '<path fill="none" stroke="currentColor" stroke-width="0.95" stroke-linecap="round" d="M7.25 17.1c1.9-.55 3.7-.45 5.2.35" opacity="0.32"/>' +
      '<circle cx="15.15" cy="17.35" r="1.05" fill="currentColor"/>' +
      '<circle cx="17.2" cy="18.15" r="0.72" fill="currentColor" opacity="0.85"/>' +
      '<circle cx="18.65" cy="16.55" r="0.58" fill="currentColor" opacity="0.7"/>' +
      "</svg>"
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
    const launcherEl = hostEl.querySelector(".hw-hc-launcher");
    const lensEl = hostEl.querySelector(".hw-mg-widget");

    if (neutral) {
      applyToolRowY(hostEl, neutral.sharedY, false);
      const jobs = [];
      if (launcherEl) jobs.push(animateToolReturnX(launcherEl, neutral.launcher.x, "%"));
      await Promise.all(jobs);
    }

    try {
      localStorage.removeItem("jlm-hc-launcher-pos");
      localStorage.removeItem("hw-mg-position-v2");
    } catch (_) {}

    if (neutral) finalizeNeutralPositions(hostEl, neutral);

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

  function ensureCleanupButton(hostEl) {

    if (!hostEl) return;

    const existing = hostEl.querySelector(":scope > .hw-tools-cleanup");

    if (!toolsEnabled() || isLexiconLookupHost(hostEl)) {

      existing?.remove();

      return;

    }

    if (existing) {
      const icon = existing.querySelector(".hw-tools-cleanup__icon");
      if (!icon) existing.innerHTML = broomIconSvg();
      requestAnimationFrame(() => syncNeutralToolRowIfUnset(hostEl));
      return;
    }

    const btn = document.createElement("button");

    btn.type = "button";

    btn.className = "hw-tools-cleanup";

    btn.setAttribute("aria-label", "Reset tool positions");

    btn.title = "Reset tool positions";

    btn.innerHTML = broomIconSvg();

    btn.addEventListener("click", () => resetToolPositions(hostEl));

    hostEl.appendChild(btn);
    requestAnimationFrame(() => syncNeutralToolRowIfUnset(hostEl));
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

          if (!move || !MOVABLE_KINDS.has(move.tool.kind)) continue;



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

  };

})(window);


