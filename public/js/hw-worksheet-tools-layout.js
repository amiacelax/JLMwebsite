/**
 * Keep homework worksheet tools (magnifying glass, cloud launcher, note bubble, lookup popup)
 * from stacking on top of each other — lower-priority tools get nudged aside.
 */
(function (global) {
  const GAP = 10;
  const MAX_PASSES = 12;

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

  function collectTools(hostEl, pinEl) {
    const specs = [
      { el: hostEl.querySelector(".hw-hc-memo--expanded"), kind: "hc-memo", priority: 3 },
      { el: hostEl.querySelector(".hw-mg-popup"), kind: "mg-popup", priority: 3 },
      { el: hostEl.querySelector(".hw-hc-launcher"), kind: "hc-launcher", priority: 1 },
      { el: hostEl.querySelector(".hw-mg-widget"), kind: "mg-lens", priority: 1 },
    ];
    const tools = [];
    specs.forEach((spec) => {
      if (!isVisibleTool(spec.el)) return;
      const rect = hostLocalRect(spec.el, hostEl);
      if (!rect) return;
      tools.push({
        el: spec.el,
        kind: spec.kind,
        priority: spec.el === pinEl ? 100 : spec.priority,
        rect,
      });
    });
    return tools;
  }

  function separation(high, low, gap) {
    const ox = Math.min(high.right, low.right) - Math.max(high.left, low.left);
    const oy = Math.min(high.bottom, low.bottom) - Math.max(high.top, low.top);
    if (ox <= 0 || oy <= 0) return null;

    const hCx = (high.left + high.right) / 2;
    const hCy = (high.top + high.bottom) / 2;
    const lCx = (low.left + low.right) / 2;
    const lCy = (low.top + low.bottom) / 2;

    if (ox < oy) {
      const dir = lCx >= hCx ? 1 : -1;
      return { dx: dir * (ox + gap), dy: 0 };
    }
    const dir = lCy >= hCy ? 1 : -1;
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
      return;
    }
    if (kind === "hc-memo") {
      global.HwHomeworkComments?.offsetActiveMemoBy?.(dx, dy);
    }
  }

  function resolve(hostEl, options) {
    options = options || {};
    if (!hostEl) return;
    const pin = options.pin || null;
    const gap = typeof options.gap === "number" ? options.gap : GAP;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const tools = collectTools(hostEl, pin);
      if (tools.length < 2) return;

      tools.sort((a, b) => b.priority - a.priority);
      let moved = false;

      for (let i = 0; i < tools.length; i++) {
        for (let j = i + 1; j < tools.length; j++) {
          const high = tools[i];
          const low = tools[j];
          if (low.priority >= 100) continue;

          const sep = separation(high.rect, low.rect, gap);
          if (!sep) continue;

          applyMove(low.kind, sep.dx, sep.dy);
          moved = true;

          const refreshed = hostLocalRect(low.el, hostEl);
          if (refreshed) low.rect = refreshed;
        }
      }

      if (!moved) return;
    }
  }

  global.HwWorksheetToolLayout = { resolve };
})(window);
