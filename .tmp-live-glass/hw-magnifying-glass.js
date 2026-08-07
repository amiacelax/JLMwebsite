/**
 * Magnifying glass (虫眼鏡) — draggable click-to-lookup inside the homework card.
 */
(function (global) {
  const STORAGE_KEY = "hw-mg-position-v2";
  const ONBOARD_KEY = "hw-mg-onboarding-v1";
  /** Fallback lens — top-right when title anchor is missing. */
  const DEFAULT_LENS = { x: 0, y: 12 };
  const SNAP_IDS = ["tl", "tc", "tr", "ml", "mr", "bl", "bc", "br"];
  const JA_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー]/;
  const SKIP_SELECTOR =
    "input, textarea, select, button, a, label, video, audio, .hw-tools-cleanup, .hw-mg-widget, .hw-mg-lens, .hw-mg-popup, .hw-mg-onboard, .hw-video-inline, .hw-audio-inline, .hw-star-block__reset, .hw-star-block__slot-clear, .hw-star-block__pool";

  /** Shared 字 lens strokes (button + cursor). */
  const LENS_JI_PATHS =
    '<path d="M50 -11.5V-13.5"/>' +
    '<path d="M-9 52A59 59 0 0 1 109 52A59 59 0 0 1 93.85 91.48"/>' +
    '<path d="M11.85 60.11A39 39 0 1 1 50 91"/>' +
    '<path d="M50 91V125"/>' +
    '<path d="M36 103H64"/>' +
    '<path d="M50 125V133Q49 137 46.5 136Q45 134.5 46 131"/>';

  function lensCursorDataUrl(stroke, innerSvg, width, height, viewBox, hotspotX, hotspotY) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      width +
      '" height="' +
      height +
      '" viewBox="' +
      viewBox +
      '" fill="none" stroke="' +
      stroke +
      '" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">' +
      innerSvg +
      "</svg>";
    return (
      'url("data:image/svg+xml,' +
      encodeURIComponent(svg) +
      '") ' +
      hotspotX +
      " " +
      hotspotY +
      ", crosshair"
    );
  }

  /** Compact lens for popup Jisho link (top-right). */
  const POPUP_JISHO_ICON =
    '<svg class="hw-mg-popup__jisho-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="10" cy="10" r="6.5"/>' +
    '<path d="M15 15l6 6"/>' +
    "</svg>";
  /** Classic circle + handle (kept for rollback). */
  const LENS_ICON_CLASSIC =
    '<svg class="hw-mg-lens__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="10" cy="10" r="6.5"/>' +
    '<path d="M15 15l6 6"/>' +
    "</svg>";

  const LENS_ARMED_CURSOR_CLASSIC = lensCursorDataUrl(
    "#2d6a4f",
    '<circle cx="10" cy="10" r="6.5" stroke-width="2.2"/><path d="M15 15l6 6" stroke-width="2.2"/>',
    24,
    24,
    "0 0 24 24",
    10,
    10
  );

  /** 字-as-lens icon (production). */
  const LENS_ICON =
    '<svg class="hw-mg-lens__icon" xmlns="http://www.w3.org/2000/svg" viewBox="-18 -28 148 170" fill="none" aria-hidden="true">' +
    '<g transform="rotate(-40 50 55)" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round">' +
    LENS_JI_PATHS +
    "</g></svg>";

  const LENS_ARMED_CURSOR = lensCursorDataUrl(
    "#2d6a4f",
    '<g transform="rotate(-40 50 55)">' + LENS_JI_PATHS + "</g>",
    24,
    28,
    "-18 -28 148 170",
    11,
    12
  );

  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--hw-mg-armed-cursor", LENS_ARMED_CURSOR);
  }

  let hostEl = null;
  let shellEl = null;
  let widgetEl = null;
  let lensEl = null;
  let popupEl = null;
  let toastEl = null;
  let snapHintEl = null;
  let onboardEl = null;
  let onboardScrimEl = null;
  let onboardScrimResizeBound = null;
  let resizeObserver = null;
  let overrideHostEl = null;
  let overrideOptions = null;
  let armed = false;
  let lensSnapId = null;
  let lensPosition = { ...DEFAULT_LENS };
  let dragState = null;
  let popupDragState = null;
  let lookupBusy = false;
  let built = false;
  let popupEditMode = false;
  let popupContext = null;
  let popupOutsideBound = null;
  let hoverHighlightEl = null;
  let hoverHighlightRaf = null;
  let hoverHighlightSeq = 0;
  let hostMouseMoveBound = null;
  let pendingHoverPoint = null;
  const tokenizeCache = new Map();
  const jaLookupCache = new Map();
  const TOKENIZE_CACHE_MAX = 48;
  const JA_LOOKUP_CACHE_MAX = 200;

  function preloadLookupAssets() {
    void global.HwMgLexicon?.ensureLoaded?.()?.catch?.(() => {});
    const auto = global.HwFuriganaAuto;
    if (auto?.ensureTokenizer) void auto.ensureTokenizer().catch(() => {});
  }

  function supportsHoverHighlight() {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  function enabled() {
    return global.HwFeatureFlags?.magnifyingGlass?.() === true;
  }

  function findHost() {
    if (overrideHostEl && hostIsVisible(overrideHostEl)) return overrideHostEl;
    const reviewOverlay = document.getElementById("hw-teacher-review-overlay");
    const reviewMount = document.getElementById("hw-teacher-review-mount");
    if (reviewOverlay && !reviewOverlay.hidden && reviewMount && hostIsVisible(reviewMount)) {
      return reviewMount;
    }
    const v4 = document.querySelector("#hw-hub-v4-homework .hw-hub-v2-worksheet");
    if (v4 && !v4.hidden && !v4.closest("[hidden]")) return v4;
    const legacy = document.getElementById("hw-worksheet-section");
    if (legacy && !legacy.hidden && !legacy.closest("[hidden]")) return legacy;
    return v4 || legacy || document.querySelector(".hw-hub-v2-worksheet");
  }

  function hostIsVisible(box) {
    return Boolean(box && !box.hidden && !box.closest("[hidden]") && box.getClientRects().length);
  }

  function katakanaToHiragana(str) {
    return String(str || "").replace(/[\u30a1-\u30f6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
  }

  /** Match cloud launcher: center + translate(-50%,-50%) keeps the full 4.5rem tool inside. */
  const TOOL_HALF = 36;

  function useWideHorizontalTravel() {
    try {
      return !(
        window.matchMedia("(pointer: coarse)").matches ||
        window.matchMedia("(max-width: 767px)").matches
      );
    } catch (_) {
      return window.innerWidth >= 768;
    }
  }

  /**
   * Horizontal clamp in host-local coords. Desktop: widen to viewport L/R gutters
   * (card host is too narrow — fixed EDGE_EXPAND still left tools over questions).
   * Mobile/coarse: stay fully inside the host.
   */
  function horizontalClampRange(half, pad) {
    const w = hostEl?.clientWidth || 0;
    let minX = half + pad;
    let maxX = w - half - pad;
    if (useWideHorizontalTravel() && hostEl) {
      const hostLeft = hostEl.getBoundingClientRect().left;
      const viewMinX = half + pad - hostLeft;
      const viewMaxX = window.innerWidth - half - pad - hostLeft;
      minX = Math.min(minX, viewMinX);
      maxX = Math.max(maxX, viewMaxX);
      if (maxX < minX) maxX = minX;
    }
    return { minX, maxX };
  }

  function snapPoints() {
    const box = hostEl;
    const pad = 12;
    const half = TOOL_HALF;
    const w = box?.clientWidth || 320;
    const h = box?.clientHeight || 480;
    const midY = h * 0.5;
    return {
      tl: { x: half + pad, y: pad + half },
      tc: { x: w * 0.5, y: pad + half },
      tr: { x: w - pad - half, y: pad + half },
      ml: { x: half + pad, y: midY },
      mr: { x: w - pad - half, y: midY },
      bl: { x: half + pad, y: h - pad - half },
      bc: { x: w * 0.5, y: h - pad - half },
      br: { x: w - pad - half, y: h - pad - half },
    };
  }

  function clampLocal(x, y) {
    const pad = 8;
    const half = TOOL_HALF;
    const h = hostEl?.clientHeight || 0;
    const { minX, maxX } = horizontalClampRange(half, pad);
    return {
      x: Math.max(minX, Math.min(x, maxX)),
      y: Math.max(half + pad, Math.min(y, h - half - pad)),
    };
  }

  function clientToLocal(clientX, clientY) {
    const rect = hostEl.getBoundingClientRect();
    return clampLocal(clientX - rect.left, clientY - rect.top);
  }

  function nearestSnap(localX, localY) {
    const points = snapPoints();
    let bestId = lensSnapId || "tr";
    let bestDist = Infinity;
    SNAP_IDS.forEach((id) => {
      const p = points[id];
      const dx = p.x - localX;
      const dy = p.y - localY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    });
    return bestDist <= 64 * 64 ? bestId : null;
  }

  function setLensPosition(localX, localY) {
    if (!widgetEl) return;
    widgetEl.style.left = localX + "px";
    widgetEl.style.top = localY + "px";
  }

  function lensStorageKey() {
    return overrideOptions?.storageKey || STORAGE_KEY;
  }

  function saveLensPosition() {
    try {
      if (lensSnapId) {
        localStorage.setItem(lensStorageKey(), JSON.stringify({ snap: lensSnapId }));
      } else {
        localStorage.setItem(lensStorageKey(), JSON.stringify({ x: lensPosition.x, y: lensPosition.y }));
      }
    } catch {
      /* ignore */
    }
  }

  function loadLensPosition() {
    lensSnapId = null;
    lensPosition = { ...(overrideOptions?.defaultLens || DEFAULT_LENS) };
    try {
      const raw = localStorage.getItem(lensStorageKey());
      if (!raw) {
        if (overrideOptions?.defaultSnap && SNAP_IDS.includes(overrideOptions.defaultSnap)) {
          lensSnapId = overrideOptions.defaultSnap;
        } else if (!overrideOptions?.defaultLens) {
          lensSnapId = "tr";
        }
        return;
      }
      if (SNAP_IDS.includes(raw)) {
        lensSnapId = raw;
        return;
      }
      const data = JSON.parse(raw);
      if (data.snap && SNAP_IDS.includes(data.snap)) {
        lensSnapId = data.snap;
      } else if (typeof data.x === "number" && typeof data.y === "number") {
        lensPosition = { x: data.x, y: data.y };
      }
    } catch {
      /* ignore */
    }
  }

  function applyLensPosition() {
    if (!widgetEl || !hostEl) return;
    if (lensSnapId) {
      const p = snapPoints()[lensSnapId] || snapPoints().tr;
      lensPosition = { x: p.x, y: p.y };
    } else {
      lensPosition = clampLocal(lensPosition.x, lensPosition.y);
    }
    setLensPosition(lensPosition.x, lensPosition.y);
  }

  function placeLens(id) {
    if (!widgetEl || !hostEl) return;
    lensSnapId = id || lensSnapId;
    applyLensPosition();
    saveLensPosition();
  }

  function setFreeLensPosition(localX, localY) {
    lensSnapId = null;
    lensPosition = clampLocal(localX, localY);
    setLensPosition(lensPosition.x, lensPosition.y);
    saveLensPosition();
  }

  function getLensPosition() {
    return { ...lensPosition };
  }

  function setLensPositionLocal(localX, localY, persist) {
    if (!widgetEl || !hostEl) return;
    lensSnapId = null;
    lensPosition = clampLocal(localX, localY);
    setLensPosition(lensPosition.x, lensPosition.y);
    if (persist !== false) saveLensPosition();
  }

  function setLensSnap(id) {
    if (!id || !SNAP_IDS.includes(id) || !widgetEl || !hostEl) return;
    lensSnapId = id;
    applyLensPosition();
    saveLensPosition();
  }

  function resetLensPosition(target) {
    try {
      localStorage.removeItem(lensStorageKey());
    } catch (_) {}
    lensSnapId = null;
    if (target?.snap && SNAP_IDS.includes(target.snap)) {
      lensSnapId = target.snap;
      applyLensPosition();
      return;
    }
    if (target && typeof target.x === "number" && typeof target.y === "number") {
      setLensPositionLocal(target.x, target.y, false);
      return;
    }
    if (overrideOptions?.defaultSnap && SNAP_IDS.includes(overrideOptions.defaultSnap)) {
      lensSnapId = overrideOptions.defaultSnap;
      applyLensPosition();
      return;
    }
    const pos = overrideOptions?.defaultLens || DEFAULT_LENS;
    setLensPositionLocal(pos.x, pos.y, false);
  }

  function offsetLensBy(dx, dy) {
    if (!widgetEl || !hostEl) return;
    setFreeLensPosition(lensPosition.x + dx, lensPosition.y + dy);
  }

  function offsetPopupBy(dx, dy) {
    if (!popupEl || !hostEl) return;
    const left = parseFloat(popupEl.style.left) || 0;
    const top = parseFloat(popupEl.style.top) || 0;
    setPopupPosition(left + dx, top + dy);
  }

  function resolveToolLayout(pinEl) {
    if (!hostEl) return;
    requestAnimationFrame(() => {
      global.HwWorksheetToolLayout?.resolve?.(hostEl, { pin: pinEl || null });
    });
  }

  function showToast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("is-visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
  }

  function setArmed(next, opts) {
    armed = !!next;
    hostEl?.classList.toggle("hw-mg-armed", armed);
    widgetEl?.classList.toggle("is-armed", armed);
    lensEl?.classList.toggle("is-armed", armed);
    if (lensEl) lensEl.setAttribute("aria-pressed", armed ? "true" : "false");
    if (armed) {
      preloadLookupAssets();
      global.HwHomeworkComments?.disarm?.();
      if (!opts?.silent) {
        const msg =
          overrideOptions?.armHint ||
          "Tap a word to look it up · Esc to cancel";
        showToast(msg);
      }
    } else {
      clearHoverHighlight();
    }
  }

  function closePopup() {
    exitPopupEditMode(false);
    lookupBusy = false;
    popupDragState = null;
    popupContext = null;
    if (popupEl) {
      popupEl.remove();
      popupEl = null;
    }
  }

  /** True when logged in as teacher (including view-as-student admin mode). */
  function isTeacherUser() {
    return Boolean(global.HwAuth?.getTeacherSession?.());
  }

  function parseHighlightParts(raw) {
    return String(raw || "")
      .split(/[+＋/／]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function glossTargetSurface(surface, highlight) {
    const parts = parseHighlightParts(highlight);
    if (parts.length === 1 && parts[0] && parts[0] !== surface) return parts[0];
    if (parts.length >= 2) return parts.join("");
    return surface;
  }

  function buildHighlightLexiconPatch(surface, highlight, reading, definition) {
    const parts = parseHighlightParts(highlight);
    const patch = {};

    if (parts.length >= 2) {
      const combined = parts.join("");
      if (highlight.includes("+") || highlight.includes("＋")) {
        patch.splitSurfaces = parts;
      } else if (combined === surface) {
        patch.mergeSurfaces = parts;
      } else {
        patch.splitSurfaces = parts;
      }
      if (reading || definition) {
        patch.reading = reading;
        patch.definition = definition;
      }
      return patch;
    }

    const desired = String(parts[0] || surface).trim() || surface;
    if (desired === surface) {
      if (reading || definition) {
        patch.reading = reading;
        patch.definition = definition;
      }
      return patch;
    }

    patch.forceUnit = desired;
    if (surface.startsWith(desired)) {
      const rest = surface.slice(desired.length);
      if (rest) patch.splitSurfaces = [desired, rest];
    } else if (surface.endsWith(desired)) {
      const rest = surface.slice(0, surface.length - desired.length);
      if (rest) patch.splitSurfaces = [rest, desired];
    }

    if (reading || definition) {
      patch.extraCustom = { [desired]: { reading, definition } };
    }
    return patch;
  }

  function buildHighlightPreview(surface, highlight, reading, definition) {
    const parts = parseHighlightParts(highlight);
    const preview = { custom: {} };
    const glossSurface = glossTargetSurface(surface, highlight);
    if (reading || definition) {
      preview.custom[glossSurface] = { reading, definition };
    }

    if (parts.length >= 2) {
      const combined = parts.join("");
      if (highlight.includes("+") || highlight.includes("＋") || combined !== surface) {
        preview.segmentSurfaces = parts;
      } else {
        preview.mergeSurfaces = parts;
      }
      return preview;
    }

    const desired = String(parts[0] || surface).trim();
    if (!desired || desired === surface) return preview;

    if (surface.startsWith(desired)) {
      const rest = surface.slice(desired.length);
      if (rest) preview.segmentSurfaces = [desired, rest];
    } else if (surface.endsWith(desired)) {
      const rest = surface.slice(0, surface.length - desired.length);
      if (rest) preview.segmentSurfaces = [rest, desired];
    }
    return preview;
  }

  function getAssignmentContext() {
    const form =
      hostEl?.closest?.("form") ||
      document.getElementById("hw-worksheet-form") ||
      document.querySelector(".hw-worksheet");
    const id = form?.getAttribute?.("data-assignment-id") || "";
    const title =
      hostEl?.querySelector?.(".hw-hub-v2-top__title, #hw-v2-title, .hw-worksheet__meta-title")
        ?.textContent?.trim() || "";
    return { assignmentId: id, assignmentTitle: title || id };
  }

  function lookupSourceKind(unit, lookup) {
    const surface = unit?.surface || "";
    const custom = global.HwMgLexicon?.customEntry?.(surface, unit?.lemma);
    if (custom?.reading || custom?.definition) return "CUSTOM";
    if (lookup?.definition && global.HwMgLexicon?.CUSTOM?.[surface]) return "CUSTOM";
    return "Jisho";
  }

  function buildPopupContext(unit, lookup, container) {
    const surface = unit?.surface || "";
    const sentence = normalizeContainerText(container);
    const assignment = getAssignmentContext();
    return {
      unit: { ...unit },
      lookup: { ...lookup },
      surface,
      reading: lookup?.reading || unit?.reading || "",
      definition: lookup?.definition || unit?.definition || "",
      jishoUrl:
        lookup?.jishoUrl ||
        unit?.jishoUrl ||
        "https://jisho.org/search/" + encodeURIComponent(unit?.query || surface),
      sourceKind: lookupSourceKind(unit, lookup),
      sentence,
      highlight: surface,
      assignmentId: assignment.assignmentId,
      assignmentTitle: assignment.assignmentTitle,
    };
  }

  function applyPopupLexiconPreview(ctx) {
    if (!ctx || !popupEditMode) {
      global.HwMgLexicon?.clearPreview?.();
      return;
    }
    const highlight = String(ctx.highlight || ctx.surface || "").trim();
    const preview = buildHighlightPreview(
      String(ctx.surface || ""),
      highlight,
      String(ctx.reading || "").trim(),
      String(ctx.definition || "").trim()
    );
    const hasPreview =
      Object.keys(preview.custom).length ||
      preview.segmentSurfaces?.length ||
      preview.mergeSurfaces?.length;
    if (hasPreview) global.HwMgLexicon?.setPreview?.(preview);
    else global.HwMgLexicon?.clearPreview?.();
  }

  function exitPopupEditMode(revert) {
    if (!popupEditMode) return;
    popupEditMode = false;
    if (popupOutsideBound) {
      document.removeEventListener("pointerdown", popupOutsideBound, true);
      popupOutsideBound = null;
    }
    global.HwMgLexicon?.clearPreview?.();
    if (revert && popupContext) {
      renderPopup(popupContext, null, null, { preservePosition: true });
    }
  }

  async function savePopupLexiconEdit(ctx) {
    const teacher = global.HwAuth?.getTeacherSession?.();
    if (!teacher?.username) {
      showToast("Teacher login required");
      return;
    }

    const surface = String(ctx.surface || "").trim();
    const reading = String(ctx.reading || "").trim();
    const definition = String(ctx.definition || "").trim();
    const highlight = String(ctx.highlight || surface).trim();

    const payload = {
      teacherUsername: teacher.username,
      surface,
      ...buildHighlightLexiconPatch(surface, highlight, reading, definition),
    };

    try {
      const res = await fetch("/api/mg-lexicon/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      if (data.overlay && global.HwMgLexicon?.applyGlobalOverlay) {
        global.HwMgLexicon.applyGlobalOverlay(data.overlay);
      } else {
        await global.HwMgLexicon?.ensureLoaded?.();
      }
      tokenizeCache.clear();

      popupEditMode = false;
      if (popupOutsideBound) {
        document.removeEventListener("pointerdown", popupOutsideBound, true);
        popupOutsideBound = null;
      }
      global.HwMgLexicon?.clearPreview?.();

      const saved = {
        ...ctx,
        highlight,
        reading,
        definition,
        surface: glossTargetSurface(surface, highlight),
        sourceKind: "CUSTOM",
      };
      popupContext = saved;
      renderPopup(saved, null, null, { preservePosition: true });
      global.HwMagnifyingGlass?.refresh?.();
      showToast("Saved — look up again to verify");
    } catch (err) {
      showToast(err?.message || "Could not save");
    }
  }

  async function queuePopupLexicon(ctx) {
    const teacher = global.HwAuth?.getTeacherSession?.();
    if (!teacher?.username) {
      showToast("Teacher login required");
      return;
    }

    const surface = String(ctx.surface || "").trim();
    if (!surface) return;

    const example = String(ctx.sentence || ctx.assignmentTitle || surface).trim();
    const note = [
      ctx.sourceKind ? "Source: " + ctx.sourceKind : "",
      ctx.assignmentTitle ? "Sheet: " + ctx.assignmentTitle : "",
      ctx.highlight && ctx.highlight !== surface ? "Highlight: " + ctx.highlight : "",
    ]
      .filter(Boolean)
      .join(" · ");

    try {
      const res = await fetch("/api/mg-lexicon/add-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: teacher.username,
          surface,
          kind: "custom",
          title: "Popup review: " + surface,
          note: note || undefined,
          example,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Queue failed");
      showToast("Queued for Lookup Lexicon");
    } catch (err) {
      showToast(err?.message || "Could not queue");
    }
  }

  /**
   * Prefer HwMgLexicon (baseline skips + submitted KV overlay).
   * If the lexicon script is missing (e.g. a playtest host forgot it),
   * still block common particles so hover doesn't light them up alone.
   */
  const FALLBACK_SKIP_SURFACE = new Set([
    "を",
    "ん",
    "だ",
    "の",
    "は",
    "が",
    "に",
    "で",
    "と",
    "て",
    "も",
    "か",
    "よ",
    "ね",
    "な",
  ]);

  function lookupSurfaceBlocked(surface, token) {
    const word = String(surface || "").trim();
    if (!word) return true;
    if (typeof global.HwMgLexicon?.isSkipped === "function") {
      return global.HwMgLexicon.isSkipped(word, token || null) === true;
    }
    return FALLBACK_SKIP_SURFACE.has(word);
  }

  function clearLookupCachesForSurface(surface) {
    const word = String(surface || "").trim();
    if (!word) return;
    tokenizeCache.delete(word);
    const query = global.HwMgLexicon?.resolve?.(word)?.query || word;
    jaLookupCache.delete(query);
    jaLookupCache.delete(word);
  }

  async function skipPopupHighlight(ctx) {
    const teacher = global.HwAuth?.getTeacherSession?.();
    if (!teacher?.username) {
      showToast("Teacher login required");
      return;
    }

    const surface = String(ctx?.surface || "").trim();
    if (!surface) return;

    try {
      const res = await fetch("/api/mg-lexicon/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: teacher.username,
          surface,
          skipSurface: surface,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Skip failed");

      if (data.overlay && global.HwMgLexicon?.applyGlobalOverlay) {
        global.HwMgLexicon.applyGlobalOverlay(data.overlay);
      } else {
        await global.HwMgLexicon?.ensureLoaded?.();
      }

      clearLookupCachesForSurface(surface);
      closePopup();
      clearHoverHighlight();
      showToast(surface + " will no longer highlight");
    } catch (err) {
      showToast(err?.message || "Could not skip highlight");
    }
  }

  function enterPopupEditMode() {
    if (!popupEl || !popupContext || popupEditMode) return;
    popupEditMode = true;
    renderPopup(popupContext, null, null, { preservePosition: true, edit: true });

    popupOutsideBound = (ev) => {
      if (!popupEditMode || !popupEl) return;
      if (popupEl.contains(ev.target)) return;
      if (ev.target?.closest?.(".hw-delete-confirm-popover")) return;
      exitPopupEditMode(true);
    };
    setTimeout(() => document.addEventListener("pointerdown", popupOutsideBound, true), 0);
  }

  function isStarLookupElement(el) {
    if (!el?.closest) return false;
    if (el.closest(".hw-star-block__reset, .hw-star-block__slot-clear")) return false;
    if (el.closest(".hw-star-block__chip:not(.hw-star-block__chip--placed)")) return true;
    if (el.closest(".hw-star-block__fixed, .hw-star-block__slot-text")) return true;
    if (el.closest(".hw-star-block__sentence") && !el.closest(".hw-star-block__slot:not(.hw-star-block__slot--filled)")) {
      return true;
    }
    return false;
  }

  function isLookupTarget(el) {
    if (!el || !(el instanceof Element) || !hostEl?.contains(el)) return false;
    if (el.closest(".hw-mg-popup") || el.closest(".hw-mg-widget") || el.closest(".hw-mg-onboard")) return false;
    if (armed && isStarLookupElement(el)) return true;
    if (
      el.closest(
        ".hw-star-block__chip, .hw-star-block__slot:not(.hw-star-block__slot--filled), .hw-star-block__pool"
      )
    ) {
      return false;
    }
    if (el.closest(SKIP_SELECTOR)) return false;
    return Boolean(
      el.closest(
        ".hw-worksheet__content, .hw-translation-block__japanese, .hw-star-block__sentence, .hw-star-block__prefix, .hw-star-block__suffix, .hw-star-block__fixed, .hw-open-topic, .hw-video-prompt__text, .hw-audio-prompt__text, .hw-worksheet, .hw-lookup-lexicon-playground__content, .hw-lookup-lexicon-playground__text, [lang='ja']"
      )
    );
  }

  function caretRangeAtPoint(clientX, clientY) {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(clientX, clientY);
    }
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(clientX, clientY);
      if (pos) {
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
        return range;
      }
    }
    return null;
  }

  function flatContainerText(container) {
    if (!container) return "";
    let out = "";
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node = null;
    while ((node = walker.nextNode())) {
      out += node.textContent || "";
    }
    return out;
  }

  function caretOffsetFromTextNodes(container, endNode, endOffset) {
    let pos = 0;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node = null;
    while ((node = walker.nextNode())) {
      if (node === endNode) return pos + endOffset;
      pos += (node.textContent || "").length;
    }
    return pos;
  }

  function caretOffsetIn(container, clientX, clientY) {
    const range = caretRangeAtPoint(clientX, clientY);
    if (!range || !container.contains(range.startContainer)) return -1;
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      return caretOffsetFromTextNodes(container, range.startContainer, range.startOffset);
    }
    const pre = document.createRange();
    pre.selectNodeContents(container);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }

  function pointerNearRange(clientX, clientY, range, maxPx) {
    if (!range) return false;
    const rects = range.getClientRects();
    for (const rect of rects) {
      const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      if (Math.hypot(dx, dy) <= maxPx) return true;
    }
    return false;
  }

  function caretOffsetNearPointer(container, clientX, clientY, maxPx) {
    const range = caretRangeAtPoint(clientX, clientY);
    if (!range || !container.contains(range.startContainer)) return -1;
    if (!pointerNearRange(clientX, clientY, range, maxPx)) return -1;
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      return caretOffsetFromTextNodes(container, range.startContainer, range.startOffset);
    }
    const pre = document.createRange();
    pre.selectNodeContents(container);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }

  function isStarTextContainer(el) {
    return Boolean(
      el?.closest?.(".hw-star-block__chip, .hw-star-block__slot-text, .hw-star-block__fixed")
    );
  }

  /** Map horizontal click position to a character offset when caret APIs fail on chips. */
  function caretOffsetFromStarRect(container, clientX, clientY) {
    const text = flatContainerText(container);
    if (!text) return -1;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return Math.floor(text.length / 2);
    const pad = 6;
    if (
      clientX < rect.left - pad ||
      clientX > rect.right + pad ||
      clientY < rect.top - pad ||
      clientY > rect.bottom + pad
    ) {
      return -1;
    }
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.max(0, Math.min(text.length - 1, Math.round(ratio * Math.max(0, text.length - 1))));
  }

  function caretOffsetForContainer(container, clientX, clientY, maxPx) {
    const caret = caretOffsetNearPointer(container, clientX, clientY, maxPx);
    if (caret >= 0) return caret;
    if (isStarTextContainer(container)) return caretOffsetFromStarRect(container, clientX, clientY);
    return -1;
  }

  function expandRangeToJapaneseWordRange(range, container) {
    if (!range || !range.startContainer) return null;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent || "";
    let start = range.startOffset;
    let end = range.endOffset;
    if (start === end) {
      if (end < text.length && JA_CHAR.test(text[end])) end += 1;
      else if (start > 0 && JA_CHAR.test(text[start - 1])) start -= 1;
    }
    if (start >= end || !JA_CHAR.test(text.slice(start, end))) return null;

    const root = container || node.parentElement;
    if (root?.contains?.(node)) {
      const flatStart = caretOffsetFromTextNodes(root, node, start);
      const caret = Math.max(flatStart, 0);
      const forced = global.HwMgLexicon?.pickForceUnit?.(flatContainerText(root), caret);
      if (forced?.surface && !lookupSurfaceBlocked(forced.surface, null)) {
        const clipped = rangeFromOffsets(root, forced.start, forced.end);
        if (clipped) return clipped;
      }
      const unit = global.HwMgLexicon?.pickQuickUnit?.(flatContainerText(root), caret);
      if (unit?.surface && !lookupSurfaceBlocked(unit.surface, null)) {
        const clipped = rangeFromOffsets(root, unit.start, unit.end);
        if (clipped) return clipped;
      }
      /* No lexicon unit at this caret — do not highlight a raw JA run that may include particles. */
      return null;
    }

    const surface = text.slice(start, end);
    if (lookupSurfaceBlocked(surface, null)) return null;

    const next = range.cloneRange();
    next.setStart(node, start);
    next.setEnd(node, end);
    return next;
  }

  function expandRangeToJapaneseWord(range) {
    return expandRangeToJapaneseWordRange(range)?.toString().trim() || "";
  }

  function lookupContainerFor(el, clientX, clientY) {
    const chip = el?.closest(".hw-star-block__chip");
    if (chip) return chip;
    const slotText = el?.closest(".hw-star-block__slot-text");
    if (slotText) return slotText;
    const fixed = el?.closest(".hw-star-block__fixed");
    if (fixed) return fixed;
    if (clientX != null && clientY != null && el?.closest(".hw-star-block__sentence")) {
      const stack =
        typeof document.elementsFromPoint === "function"
          ? document.elementsFromPoint(clientX, clientY)
          : [document.elementFromPoint(clientX, clientY)];
      for (const node of stack) {
        if (!(node instanceof Element)) continue;
        const chipHit = node.closest(".hw-star-block__chip:not(.hw-star-block__chip--placed)");
        if (chipHit) return chipHit;
        const fixedHit = node.closest(".hw-star-block__fixed");
        if (fixedHit) return fixedHit;
        const slotHit = node.closest(".hw-star-block__slot-text");
        if (slotHit) return slotHit;
      }
    }
    return (
      el?.closest(
        ".hw-worksheet__content, .hw-translation-block__japanese, .hw-star-block__sentence, .hw-open-topic, .hw-video-prompt__text, .hw-audio-prompt__text, .hw-lookup-lexicon-playground__content, .hw-lookup-lexicon-playground__text, [lang='ja']"
      ) || el
    );
  }

  function normalizeContainerText(container) {
    return flatContainerText(container).replace(/\s+/g, " ").trim();
  }

  function readingFromToken(token) {
    return katakanaToHiragana(token?.reading || token?.pronunciation || "");
  }

  function lemmaFromToken(token, surface) {
    const basic = token?.basic_form;
    if (basic && basic !== "*" && basic !== surface) return basic;
    return null;
  }

  function buildTokenSpans(tokens, text) {
    let pos = 0;
    return tokens.map((token) => {
      const sf = token.surface_form || "";
      let start = text.indexOf(sf, pos);
      if (start < 0) start = pos;
      const end = start + sf.length;
      pos = Math.max(pos, end);
      return { token, surface: sf, start, end };
    });
  }

  function isPrefixO(span) {
    return (
      span.surface === "お" &&
      (span.token.pos === "接頭詞" || span.token.pos_detail_1 === "接頭詞")
    );
  }

  function isIterationMark(span) {
    return span.surface === "々";
  }

  function isSkippableSpan(span) {
    if (lookupSurfaceBlocked(span.surface, span.token)) return true;
    if (isPrefixO(span) || isIterationMark(span)) return true;
    return false;
  }

  function buildLookupUnit(spans, index) {
    const span = spans[index];
    if (!span) return null;

    if (isIterationMark(span) && index > 0) {
      return buildLookupUnit(spans, index - 1);
    }

    if (spans[index + 1] && isIterationMark(spans[index + 1])) {
      const next = spans[index + 1];
      return {
        surface: span.surface + next.surface,
        start: span.start,
        end: next.end,
        lemma: null,
        reading: null,
      };
    }

    if (isPrefixO(span) && spans[index + 1]?.token.pos === "名詞") {
      const next = spans[index + 1];
      return {
        surface: span.surface + next.surface,
        start: span.start,
        end: next.end,
        lemma: lemmaFromToken(next.token, next.surface),
        reading: readingFromToken(next.token),
      };
    }

    if (span.token.pos === "名詞" && index > 0 && isPrefixO(spans[index - 1])) {
      return buildLookupUnit(spans, index - 1);
    }

    return {
      surface: span.surface,
      start: span.start,
      end: span.end,
      lemma: lemmaFromToken(span.token, span.surface),
      reading: readingFromToken(span.token),
    };
  }

  function pickLookupUnit(spans, offset) {
    if (!spans.length) return null;

    const index = spans.findIndex((s) => offset >= s.start && offset < s.end);
    if (index < 0) return null;

    const unitFromIndex = (i) => {
      if (i < 0 || i >= spans.length) return null;
      const span = spans[i];
      if (isSkippableSpan(span)) {
        if (isPrefixO(span) && spans[i + 1]) {
          return global.HwMgLexicon?.enrich?.(buildLookupUnit(spans, i)) || buildLookupUnit(spans, i);
        }
        if (isIterationMark(span) && i > 0) {
          return unitFromIndex(i - 1);
        }
        return null;
      }
      const unit = buildLookupUnit(spans, i);
      return global.HwMgLexicon?.enrich?.(unit) || unit;
    };

    const direct = unitFromIndex(index);
    if (direct) return direct;

    if (!isSkippableSpan(spans[index])) return null;

    let left = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      left = unitFromIndex(i);
      if (left) break;
    }
    let right = null;
    for (let i = index + 1; i < spans.length; i += 1) {
      right = unitFromIndex(i);
      if (right) break;
    }
    if (!left && !right) return null;
    if (!left) return right;
    if (!right) return left;

    const distLeft = Math.min(Math.abs(offset - left.start), Math.abs(offset - left.end));
    const distRight = Math.min(Math.abs(offset - right.start), Math.abs(offset - right.end));
    if (Math.min(distLeft, distRight) > 2) return null;
    return distLeft <= distRight ? left : right;
  }

  function rangeFromOffsets(container, start, end) {
    if (!container || start < 0 || end <= start) return null;
    const range = document.createRange();
    let pos = 0;
    let started = false;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node = null;
    while ((node = walker.nextNode())) {
      const len = (node.textContent || "").length;
      if (!started && pos + len > start) {
        range.setStart(node, Math.max(0, start - pos));
        started = true;
      }
      if (started && pos + len >= end) {
        range.setEnd(node, Math.max(0, end - pos));
        return range;
      }
      pos += len;
    }
    return started ? range : null;
  }

  function clearHoverHighlight() {
    pendingHoverPoint = null;
    if (hoverHighlightRaf) {
      cancelAnimationFrame(hoverHighlightRaf);
      hoverHighlightRaf = null;
    }
    hoverHighlightEl?.remove();
    hoverHighlightEl = null;
  }

  function renderHoverHighlight(range) {
    if (!shellEl || !hostEl || !range) {
      clearHoverHighlight();
      return;
    }

    const shellRect = shellEl.getBoundingClientRect();
    if (!hoverHighlightEl) {
      hoverHighlightEl = document.createElement("div");
      hoverHighlightEl.className = "hw-mg-hover-highlight";
      hoverHighlightEl.setAttribute("aria-hidden", "true");
      shellEl.appendChild(hoverHighlightEl);
    }

    hoverHighlightEl.replaceChildren();
    const rects = mergeClientRects(Array.from(range.getClientRects()));
    for (const rect of rects) {
      if (!rect.width || !rect.height) continue;
      const box = document.createElement("span");
      box.className = "hw-mg-hover-highlight__rect";
      box.style.left = rect.left - shellRect.left + "px";
      box.style.top = rect.top - shellRect.top + "px";
      box.style.width = rect.width + "px";
      box.style.height = rect.height + "px";
      hoverHighlightEl.appendChild(box);
    }

    if (!hoverHighlightEl.childElementCount) {
      clearHoverHighlight();
    }
  }

  /**
   * Ruby / okurigana often split one logical word across adjacent spans
   * (新 + しい). getClientRects() then draws two boxes — merge near-touching
   * same-line rects so the highlight reads as one unit.
   */
  function mergeClientRects(rawRects) {
    const sorted = rawRects
      .filter((r) => r && r.width > 0 && r.height > 0)
      .map((r) => ({
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      }))
      .sort((a, b) => a.top - b.top || a.left - b.left);

    if (sorted.length <= 1) return sorted;

    const gapX = 3;
    const gapY = 4;
    const merged = [];
    for (const rect of sorted) {
      const prev = merged[merged.length - 1];
      if (!prev) {
        merged.push({ ...rect });
        continue;
      }
      const sameLine =
        Math.abs(prev.top - rect.top) <= gapY &&
        Math.abs(prev.bottom - rect.bottom) <= Math.max(gapY, prev.height * 0.45);
      const near =
        rect.left <= prev.right + gapX && prev.left <= rect.right + gapX;
      if (sameLine && near) {
        prev.left = Math.min(prev.left, rect.left);
        prev.top = Math.min(prev.top, rect.top);
        prev.right = Math.max(prev.right, rect.right);
        prev.bottom = Math.max(prev.bottom, rect.bottom);
        prev.width = prev.right - prev.left;
        prev.height = prev.bottom - prev.top;
      } else {
        merged.push({ ...rect });
      }
    }
    return merged;
  }

  function lookupTargetFromPoint(clientX, clientY) {
    const stack =
      typeof document.elementsFromPoint === "function"
        ? document.elementsFromPoint(clientX, clientY)
        : [document.elementFromPoint(clientX, clientY)];
    for (const el of stack) {
      if (el instanceof Element && isLookupTarget(el)) return el;
    }
    return null;
  }

  function hoverRangeQuick(target, clientX, clientY) {
    const container = lookupContainerFor(target, clientX, clientY);
    if (!container) return null;
    const offset = caretOffsetForContainer(container, clientX, clientY, 24);
    if (offset >= 0) {
      const text = flatContainerText(container);
      const forced = global.HwMgLexicon?.pickForceUnit?.(text, offset);
      if (forced) {
        const forcedRange = rangeFromOffsets(container, forced.start, forced.end);
        if (forcedRange) return forcedRange;
      }
      const unit = global.HwMgLexicon?.pickQuickUnit?.(text, offset);
      if (unit) return rangeFromOffsets(container, unit.start, unit.end);
    }
    const range = caretRangeAtPoint(clientX, clientY);
    if (!range || !container.contains(range.startContainer)) return null;
    if (!pointerNearRange(clientX, clientY, range, 24)) return null;
    const expanded = expandRangeToJapaneseWordRange(range, container);
    if (!expanded) return null;
    const surface = expanded.toString().trim();
    if (surface && lookupSurfaceBlocked(surface, null)) return null;
    return expanded;
  }

  async function resolveStarTextLookup(container, clientX, clientY, options) {
    const maxPointerPx = options?.maxPointerPx ?? 22;
    const text = flatContainerText(container);
    if (!text.trim() || !JA_CHAR.test(text)) return null;

    await global.HwMgLexicon?.ensureLoaded?.()?.catch?.(() => {});

    const trimmed = text.trim();
    if (isStarTextContainer(container) && trimmed.length <= 24 && lookupSurfaceBlocked(trimmed, null)) {
      return null;
    }

    const offset = caretOffsetForContainer(container, clientX, clientY, maxPointerPx);
    if (offset >= 0) {
      const quickEarly = pickQuickLookupUnit(text, offset, clientX, clientY, container, maxPointerPx);
      if (quickEarly?.surface && !lookupSurfaceBlocked(quickEarly.surface, null)) return quickEarly;
    }

    const wordRange = caretRangeAtPoint(clientX, clientY);
    if (wordRange && container.contains(wordRange.startContainer)) {
      const expanded = expandRangeToJapaneseWordRange(wordRange);
      if (expanded) {
        const surface = expanded.toString().trim();
        if (!lookupSurfaceBlocked(surface, null)) {
          const start = text.indexOf(surface);
          if (start >= 0) {
            return { surface, start, end: start + surface.length };
          }
        }
      }
    }

    if (offset >= 0) {
      const forced = global.HwMgLexicon?.pickForceUnit?.(text, offset);
      if (forced && !lexiconPreviewActive() && !lookupSurfaceBlocked(forced.surface, null)) {
        const range = rangeFromOffsets(container, forced.start, forced.end);
        if (range && pointerNearRange(clientX, clientY, range, maxPointerPx + 6)) {
          return global.HwMgLexicon?.enrich?.(forced) || forced;
        }
      }
      const quick = pickQuickLookupUnit(text, offset, clientX, clientY, container, maxPointerPx);
      if (quick?.surface && !lookupSurfaceBlocked(quick.surface, null)) return quick;
    }

    if (isStarTextContainer(container) && text.length <= 24) {
      const tokens = await tokenizeText(text);
      const pickOffset = offset >= 0 ? offset : caretOffsetFromStarRect(container, clientX, clientY);
      const safeOffset = pickOffset >= 0 ? pickOffset : Math.floor(text.length / 2);
      if (tokens.length) {
        const spans = buildTokenSpans(tokens, text);
        const unit = pickLookupUnit(spans, safeOffset);
        if (unit?.surface && !lookupSurfaceBlocked(unit.surface, unit.token || null)) {
          const range = rangeFromOffsets(container, unit.start, unit.end);
          if (range) return unit;
        }
      }
      if (lookupSurfaceBlocked(trimmed, null)) return null;
      return { surface: trimmed, start: 0, end: trimmed.length };
    }

    return null;
  }

  async function refreshHoverHighlight(clientX, clientY) {
    if (!armed || !supportsHoverHighlight() || lookupBusy || !hostEl) {
      clearHoverHighlight();
      return;
    }

    const seq = ++hoverHighlightSeq;
    const target = lookupTargetFromPoint(clientX, clientY);
    if (!target) {
      clearHoverHighlight();
      return;
    }

    clearHoverHighlight();
    await global.HwMgLexicon?.ensureLoaded?.()?.catch?.(() => {});
    if (seq !== hoverHighlightSeq) return;
    const quickRange = hoverRangeQuick(target, clientX, clientY);
    if (quickRange && seq === hoverHighlightSeq) renderHoverHighlight(quickRange);
  }

  function scheduleHoverHighlight(clientX, clientY) {
    if (!armed || !supportsHoverHighlight()) {
      clearHoverHighlight();
      return;
    }
    pendingHoverPoint = { x: clientX, y: clientY };
    if (hoverHighlightRaf) return;
    hoverHighlightRaf = requestAnimationFrame(() => {
      hoverHighlightRaf = null;
      const point = pendingHoverPoint;
      if (!point) return;
      void refreshHoverHighlight(point.x, point.y);
    });
  }

  function onHostPointerMove(e) {
    if (!armed || !supportsHoverHighlight()) return;
    scheduleHoverHighlight(e.clientX, e.clientY);
  }

  function onHostMouseMove(e) {
    onHostPointerMove(e);
  }

  function onHostMouseLeave() {
    clearHoverHighlight();
  }

  function bindHostHover() {
    if (!hostEl) return;
    unbindHostHover();
    hostMouseMoveBound = onHostPointerMove;
    hostEl.addEventListener("mousemove", hostMouseMoveBound);
    hostEl.addEventListener("pointermove", hostMouseMoveBound);
    hostEl.addEventListener("mouseleave", onHostMouseLeave);
    hostEl.addEventListener("pointerleave", onHostMouseLeave);
  }

  function unbindHostHover() {
    if (hostEl && hostMouseMoveBound) {
      hostEl.removeEventListener("mousemove", hostMouseMoveBound);
      hostEl.removeEventListener("pointermove", hostMouseMoveBound);
      hostEl.removeEventListener("mouseleave", onHostMouseLeave);
      hostEl.removeEventListener("pointerleave", onHostMouseLeave);
    }
    hostMouseMoveBound = null;
    clearHoverHighlight();
  }

  async function tokenizeText(text) {
    const sample = String(text || "");
    if (!sample) return [];
    if (tokenizeCache.has(sample)) return tokenizeCache.get(sample);

    const auto = global.HwFuriganaAuto;
    if (!auto?.ensureTokenizer) return [];
    try {
      const tokenizerPromise = auto.ensureTokenizer();
      const tokenizer = auto.withTimeout
        ? await auto.withTimeout(tokenizerPromise, 4500, "tokenizer timeout")
        : await tokenizerPromise;
      const tokens = tokenizer.tokenize(sample);
      tokenizeCache.set(sample, tokens);
      if (tokenizeCache.size > TOKENIZE_CACHE_MAX) {
        const oldest = tokenizeCache.keys().next().value;
        tokenizeCache.delete(oldest);
      }
      return tokens;
    } catch {
      return [];
    }
  }

  function pickQuickLookupUnit(text, offset, clientX, clientY, container, maxPointerPx) {
    const forced = global.HwMgLexicon?.pickForceUnit?.(text, offset);
    if (forced) {
      const range = rangeFromOffsets(container, forced.start, forced.end);
      if (range && pointerNearRange(clientX, clientY, range, maxPointerPx + 6)) {
        return global.HwMgLexicon?.enrich?.(forced) || forced;
      }
    }
    const unit = global.HwMgLexicon?.pickQuickUnit?.(text, offset);
    if (!unit?.surface) return null;
    const range = rangeFromOffsets(container, unit.start, unit.end);
    if (!range || !pointerNearRange(clientX, clientY, range, maxPointerPx + 6)) return null;
    return unit;
  }

  function lexiconPreviewActive() {
    return global.HwMgLexicon?.hasActivePreview?.() === true;
  }

  async function resolveLookup(target, clientX, clientY, options) {
    const container = lookupContainerFor(target, clientX, clientY);
    const starScoped = container?.closest?.(
      ".hw-star-block__chip, .hw-star-block__slot-text, .hw-star-block__fixed"
    );
    if (starScoped) {
      return resolveStarTextLookup(container, clientX, clientY, options);
    }

    const lexReady = global.HwMgLexicon?.ensureLoaded?.()?.catch?.(() => {});

    const maxPointerPx = options?.maxPointerPx ?? 22;
    const text = flatContainerText(container);
    if (!text.trim()) return null;

    const offset = caretOffsetForContainer(container, clientX, clientY, maxPointerPx);
    if (offset < 0) return null;

    const quickEarly = pickQuickLookupUnit(text, offset, clientX, clientY, container, maxPointerPx);
    if (quickEarly?.definition) return quickEarly;

    await lexReady;

    const forced = global.HwMgLexicon?.pickForceUnit?.(text, offset);
    if (forced && !lexiconPreviewActive()) {
      const range = rangeFromOffsets(container, forced.start, forced.end);
      if (range && pointerNearRange(clientX, clientY, range, maxPointerPx + 6)) {
        return global.HwMgLexicon?.enrich?.(forced) || forced;
      }
    }

    const quick = pickQuickLookupUnit(text, offset, clientX, clientY, container, maxPointerPx);
    if (quick) return quick;

    const tokens = await tokenizeText(text);
    if (!tokens.length) {
      return pickQuickLookupUnit(text, offset, clientX, clientY, container, maxPointerPx);
    }

    const rawSpans = buildTokenSpans(tokens, text);
    const spans = global.HwMgLexicon?.mergeTokenSpans?.(rawSpans) || rawSpans;
    const unit = pickLookupUnit(spans, offset);
    if (!unit?.surface) {
      return pickQuickLookupUnit(text, offset, clientX, clientY, container, maxPointerPx);
    }

    const range = rangeFromOffsets(container, unit.start, unit.end);
    if (!range || !pointerNearRange(clientX, clientY, range, maxPointerPx + 6)) return null;

    return unit;
  }

  async function fetchLookup(unit) {
    const surface = unit?.surface || String(unit || "").trim();
    if (!surface) return null;

    const lex = global.HwMgLexicon?.resolve?.(surface, unit?.lemma) || {};
    const q = lex.query || unit?.query || unit?.lemma || surface;
    const jishoUrl =
      lex.jishoUrl || "https://jisho.org/search/" + encodeURIComponent(q || surface);
    const fallback = {
      query: surface,
      reading: lex.reading || unit?.reading || "",
      definition: lex.definition || unit?.definition || "",
      jishoUrl,
    };

    if (fallback.definition) return fallback;

    const cached = jaLookupCache.get(q);
    if (cached) {
      return {
        ...cached,
        query: surface,
        reading: cached.reading || unit?.reading || lex.reading || "",
        definition: cached.definition || unit?.definition || lex.definition || "",
        jishoUrl: cached.jishoUrl || jishoUrl,
      };
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch("/api/ja-lookup?q=" + encodeURIComponent(q), {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }
          break;
        }
        const data = await res.json();
        if (data?.error) {
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }
          break;
        }
        jaLookupCache.set(q, data);
        if (jaLookupCache.size > JA_LOOKUP_CACHE_MAX) {
          const oldest = jaLookupCache.keys().next().value;
          jaLookupCache.delete(oldest);
        }
        return {
          ...data,
          query: surface,
          reading: data.reading || unit?.reading || lex.reading || "",
          definition: data.definition || unit?.definition || lex.definition || "",
          jishoUrl: data.jishoUrl || jishoUrl,
        };
      } catch {
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }
      }
    }

    return fallback;
  }

  function isLexiconPlaygroundHost() {
    return Boolean(hostEl?.classList?.contains("hw-lookup-lexicon-playground"));
  }

  function setPopupPosition(left, top, popup) {
    const el = popup || popupEl;
    if (!el || !hostEl) return;
    const pad = 8;
    const boxW = hostEl.clientWidth;
    const boxH = hostEl.clientHeight;
    const rect = el.getBoundingClientRect();
    let x = left;
    let y = top;
    x = Math.max(pad, Math.min(x, boxW - rect.width - pad));
    if (isLexiconPlaygroundHost()) {
      el.style.left = x + "px";
      el.style.top = y + "px";
      return;
    }
    y = Math.max(pad, Math.min(y, boxH - rect.height - pad));
    el.style.left = x + "px";
    el.style.top = y + "px";
  }

  /** Top-right of the worksheet header — right of title, out of the exercise area. */
  function defaultPopupAnchor() {
    if (!hostEl) return { rightX: 12, topY: 12 };
    const hostRect = hostEl.getBoundingClientRect();
    const pad = 12;
    const title = hostEl.querySelector(".hw-hub-v2-top__title, #hw-v2-title, .hw-worksheet__meta-title");
    const header = hostEl.querySelector(".hw-hub-v2-top--in-card, .hw-hub-v2-top");
    let topY = pad;
    if (title?.getClientRects().length) {
      topY = title.getBoundingClientRect().top - hostRect.top;
    } else if (header?.getClientRects().length) {
      topY = header.getBoundingClientRect().top - hostRect.top + pad;
    }
    return { rightX: hostRect.width - pad, topY };
  }

  function positionPopupAtDefault() {
    if (!popupEl || !hostEl) return;
    const { rightX, topY } = defaultPopupAnchor();
    const rect = popupEl.getBoundingClientRect();
    setPopupPosition(rightX - rect.width, topY);
    resolveToolLayout(popupEl);
  }

  function positionPopup(localX, localY) {
    if (!popupEl || !hostEl) return;
    if (!isLexiconPlaygroundHost()) {
      positionPopupAtDefault();
      return;
    }
    const pad = 8;
    const boxW = hostEl.clientWidth;
    const boxH = hostEl.clientHeight;
    const rect = popupEl.getBoundingClientRect();
    let left = localX + 10;
    let top = localY + 10;
    if (left + rect.width > boxW - pad) left = localX - rect.width - 10;
    if (top + rect.height > boxH - pad) top = localY - rect.height - 12;
    setPopupPosition(left, top);
    resolveToolLayout(popupEl);
  }

  function onPopupDragStart(e) {
    if (e.button !== 0 || !popupEl || e.target !== popupEl && !popupEl.contains(e.target)) return;
    if (
      e.target.closest(".hw-mg-popup__delete") ||
      e.target.closest(".hw-mg-popup__edit") ||
      e.target.closest(".hw-mg-popup__queue") ||
      e.target.closest(".hw-mg-popup__field") ||
      e.target.closest(".hw-mg-popup__highlight") ||
      e.target.closest("input, textarea, select, label") ||
      e.target.closest(".hw-delete-confirm-popover") ||
      e.target.closest(".hw-mg-popup__more")
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const left = parseFloat(popupEl.style.left) || 0;
    const top = parseFloat(popupEl.style.top) || 0;
    popupDragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: left,
      originTop: top,
    };
    popupEl.classList.add("is-dragging");
    popupEl.setPointerCapture(e.pointerId);
  }

  function onPopupDragMove(e) {
    if (!popupDragState || popupDragState.pointerId !== e.pointerId || !popupEl) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - popupDragState.startX;
    const dy = e.clientY - popupDragState.startY;
    setPopupPosition(popupDragState.originLeft + dx, popupDragState.originTop + dy);
  }

  function onPopupDragEnd(e) {
    if (!popupDragState || popupDragState.pointerId !== e.pointerId) return;
    popupEl?.classList.remove("is-dragging");
    popupDragState = null;
    resolveToolLayout(popupEl);
    try {
      popupEl?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function bindPopupDrag(popup) {
    popup.addEventListener("pointerdown", onPopupDragStart);
    popup.addEventListener("pointermove", onPopupDragMove);
    popup.addEventListener("pointerup", onPopupDragEnd);
    popup.addEventListener("pointercancel", onPopupDragEnd);
  }

  function openDeleteConfirmPopover(anchorBtn, onConfirm) {
    if (typeof global._hwDeleteConfirmClose === "function") global._hwDeleteConfirmClose();

    const pop = document.createElement("div");
    pop.className = "hw-delete-confirm-popover";
    pop.setAttribute("role", "alertdialog");
    pop.setAttribute("aria-modal", "true");
    pop.innerHTML =
      '<p class="hw-delete-confirm-popover__q" lang="ja">いいの？</p>' +
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

  function bindPopupClose(popup) {
    popup.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    popup.addEventListener("click", (ev) => ev.stopPropagation());
  }

  function renderPopup(result, localX, localY, opts) {
    const preservePosition = Boolean(opts?.preservePosition);
    const savedLeft = preservePosition && popupEl ? parseFloat(popupEl.style.left) || 0 : null;
    const savedTop = preservePosition && popupEl ? parseFloat(popupEl.style.top) || 0 : null;
    const edit = Boolean(opts?.edit || popupEditMode);

    if (!preservePosition) {
      exitPopupEditMode(false);
      lookupBusy = false;
      popupDragState = null;
      if (popupEl) {
        popupEl.remove();
        popupEl = null;
      }
    } else if (popupEl) {
      popupDragState = null;
      popupEl.remove();
      popupEl = null;
    }
    if (!shellEl) return;

    popupContext = { ...result };
    if (!edit) popupEditMode = false;

    popupEl = document.createElement("div");
    popupEl.className = "hw-mg-popup" + (edit ? " hw-mg-popup--edit" : "");
    popupEl.setAttribute("role", "dialog");
    popupEl.setAttribute("aria-label", "Word lookup");

    if (result.surface) {
      const titlebar = document.createElement("div");
      titlebar.className = "hw-mg-popup__titlebar";

      const wordEl = document.createElement("p");
      wordEl.className = "hw-mg-popup__word";
      wordEl.textContent = result.surface;
      titlebar.appendChild(wordEl);

      if (!edit && result.jishoUrl) {
        const link = document.createElement("a");
        link.className = "hw-mg-popup__jisho";
        link.href = result.jishoUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", "See more on Jisho");
        link.title = "See more on Jisho";
        link.innerHTML = POPUP_JISHO_ICON;
        titlebar.appendChild(link);
      }

      popupEl.appendChild(titlebar);
    }

    const head = document.createElement("div");
    head.className = "hw-mg-popup__head";

    if (edit) {
      const readingLabel = document.createElement("label");
      readingLabel.className = "hw-mg-popup__field";
      readingLabel.innerHTML =
        '<span class="hw-mg-popup__field-label">Reading</span>' +
        '<input type="text" class="hw-mg-popup__input hw-mg-popup__input--reading" lang="ja" autocomplete="off">';
      const readingInput = readingLabel.querySelector("input");
      readingInput.value = result.reading || "";
      readingInput.addEventListener("input", () => {
        popupContext.reading = readingInput.value;
        applyPopupLexiconPreview(popupContext);
      });
      readingInput.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      head.appendChild(readingLabel);
    } else {
      const readingEl = document.createElement("p");
      readingEl.className = "hw-mg-popup__reading";
      readingEl.textContent = result.reading || "—";
      head.appendChild(readingEl);
    }
    popupEl.appendChild(head);

    if (edit) {
      const defLabel = document.createElement("label");
      defLabel.className = "hw-mg-popup__field";
      defLabel.innerHTML =
        '<span class="hw-mg-popup__field-label">Definition</span>' +
        '<input type="text" class="hw-mg-popup__input hw-mg-popup__input--def" autocomplete="off">';
      const defInput = defLabel.querySelector("input");
      defInput.value = result.definition || "";
      defInput.addEventListener("input", () => {
        popupContext.definition = defInput.value;
        applyPopupLexiconPreview(popupContext);
      });
      defInput.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      popupEl.appendChild(defLabel);

      const highlightLabel = document.createElement("label");
      highlightLabel.className = "hw-mg-popup__field hw-mg-popup__highlight";
      highlightLabel.innerHTML =
        '<span class="hw-mg-popup__field-label">Desired highlight</span>' +
        '<input type="text" class="hw-mg-popup__input hw-mg-popup__input--highlight" lang="ja" autocomplete="off" placeholder="e.g. 子ども or やめ＋たい">';
      const highlightInput = highlightLabel.querySelector("input");
      highlightInput.value = result.highlight || result.surface || "";
      highlightInput.addEventListener("input", () => {
        popupContext.highlight = highlightInput.value;
        applyPopupLexiconPreview(popupContext);
      });
      highlightInput.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      popupEl.appendChild(highlightLabel);
      applyPopupLexiconPreview(popupContext);
    } else if (result.definition) {
      const defEl = document.createElement("p");
      defEl.className = "hw-mg-popup__def";
      defEl.textContent = result.definition;
      popupEl.appendChild(defEl);
    } else {
      const empty = document.createElement("p");
      empty.className = "hw-mg-popup__empty";
      if (result.reading) {
        empty.textContent = "No short definition found.";
      } else if (result.jishoUrl) {
        empty.textContent = "Dictionary busy — try again or tap the lens icon.";
      } else {
        empty.textContent = "Could not read this word.";
      }
      popupEl.appendChild(empty);
    }

    const footer = document.createElement("div");
    footer.className = "hw-mg-popup__footer";

    if (isTeacherUser()) {
      const teacherRow = document.createElement("div");
      teacherRow.className = "hw-mg-popup__teacher-row";

      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "hw-mg-popup__edit";
      actionBtn.textContent = edit ? "Save" : "Edit";
      actionBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (edit) {
          void savePopupLexiconEdit(popupContext);
        } else {
          enterPopupEditMode();
        }
      });
      teacherRow.appendChild(actionBtn);

      const queueBtn = document.createElement("button");
      queueBtn.type = "button";
      queueBtn.className = "hw-mg-popup__queue";
      queueBtn.textContent = "Queue";
      queueBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        void queuePopupLexicon(popupContext);
      });
      teacherRow.appendChild(queueBtn);

      footer.appendChild(teacherRow);
    }

    if (isTeacherUser()) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "hw-mg-popup__delete";
      deleteBtn.setAttribute("aria-label", "Stop highlighting this word");
      deleteBtn.title = "Stop highlighting (particles, etc.)";
      deleteBtn.textContent = "DELETE";
      deleteBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        void skipPopupHighlight(popupContext);
      });
      footer.appendChild(deleteBtn);
    }

    if (footer.childElementCount) popupEl.appendChild(footer);

    shellEl.appendChild(popupEl);
    bindPopupClose(popupEl);
    bindPopupDrag(popupEl);
    if (preservePosition && savedLeft != null && savedTop != null) {
      setPopupPosition(savedLeft, savedTop);
      resolveToolLayout(popupEl);
    } else {
      positionPopup(localX, localY);
    }
  }

  async function handleLookupClick(e) {
    if (!hostEl?.contains(e.target)) return;
    if (isMgToolInteraction(e)) return;
    if (!armed) return;
    if (
      e.target.closest(".hw-mg-onboard") ||
      e.target.closest(".hw-hc-launcher") ||
      e.target.closest(".hw-hc-memo") ||
      e.target.closest(".hw-hc-mini")
    ) {
      return;
    }
    if (!isLookupTarget(e.target)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    clearHoverHighlight();
    closePopup();

    const local = clientToLocal(e.clientX, e.clientY);
    lookupBusy = true;

    const loading = document.createElement("div");
    loading.className = "hw-mg-popup hw-mg-popup--loading";
    loading.textContent = "Looking up…";
    shellEl.appendChild(loading);
    popupEl = loading;
    bindPopupClose(loading);
    bindPopupDrag(loading);
    positionPopupAtDefault();

    const lookupTimeout = setTimeout(() => {
      if (lookupBusy && popupEl === loading) {
        closePopup();
        showToast("Lookup timed out — try again in a moment");
        lookupBusy = false;
      }
    }, 15000);

    try {
      const data = await resolveLookup(e.target, e.clientX, e.clientY, { maxPointerPx: 36 });
      if (!data?.surface || lookupSurfaceBlocked(data.surface, null)) {
        closePopup();
        showToast("No Japanese word here — try again");
        return;
      }
      const container = lookupContainerFor(e.target, e.clientX, e.clientY);
      const lookup = (await fetchLookup(data)) || {};
      const ctx = buildPopupContext(data, lookup, container);
      renderPopup(ctx, local.x, local.y);
    } catch {
      closePopup();
      showToast("Lookup failed — try again");
    } finally {
      clearTimeout(lookupTimeout);
      lookupBusy = false;
    }
  }

  function onPointerDown(e) {
    if (!lensEl || e.button !== 0) return;
    e.stopPropagation();
    dragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: lensPosition.x,
      originY: lensPosition.y,
      moved: false,
    };
    lensEl.classList.add("is-dragging");
    widgetEl?.classList.add("is-dragging");
    /* Top sibling paint order among tools — do not rely on z-index alone vs magnet compositing. */
    if (widgetEl && hostEl && widgetEl.parentElement === hostEl) {
      hostEl.appendChild(widgetEl);
    }
    lensEl.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragState || dragState.pointerId !== e.pointerId || !hostEl) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) < 5) return;
    dragState.moved = true;
    if (armed) setArmed(false);
    e.preventDefault();
    /* Keep lensPosition in sync with the visual so magnet resolve can nudge mid-drag (cloud parity). */
    lensSnapId = null;
    lensPosition = clampLocal(
      dragState.originX + (e.clientX - dragState.startX),
      dragState.originY + (e.clientY - dragState.startY)
    );
    setLensPosition(lensPosition.x, lensPosition.y);
    resolveToolLayout(widgetEl);
  }

  function onPointerUp(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    lensEl.classList.remove("is-dragging");
    widgetEl?.classList.remove("is-dragging");
    snapHintEl?.classList.remove("is-visible", "is-target");

    if (dragState.moved) {
      /* Free-drag stays free — same as cloud launcher (no magnetic snap on drop). */
      saveLensPosition();
      resolveToolLayout(widgetEl);
    } else {
      setArmed(!armed);
    }

    dragState = null;
    try {
      lensEl.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerCancel(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    lensEl.classList.remove("is-dragging");
    widgetEl?.classList.remove("is-dragging");
    snapHintEl?.classList.remove("is-visible", "is-target");
    if (dragState.moved) {
      saveLensPosition();
      resolveToolLayout(widgetEl);
    }
    dragState = null;
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      if (onboardEl) {
        dismissOnboarding();
        e.preventDefault();
        return;
      }
      if (popupEl) {
        closePopup();
        e.preventDefault();
        return;
      }
      if (armed) {
        setArmed(false);
        e.preventDefault();
      }
    }
  }

  function onContextMenu(e) {
    if (!hostEl?.contains(e.target)) return;
    if (armed) {
      setArmed(false);
      e.preventDefault();
    } else if (popupEl && !shouldKeepPopupOpenForTarget(e.target)) {
      closePopup();
    }
  }

  function pointerOnMgLens(clientX, clientY) {
    if (!lensEl) return false;
    const r = lensEl.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const pad = 8;
    return (
      clientX >= r.left - pad &&
      clientX <= r.right + pad &&
      clientY >= r.top - pad &&
      clientY <= r.bottom + pad
    );
  }

  function isMgToolInteraction(e) {
    if (shouldKeepPopupOpenForTarget(e.target)) return true;
    return pointerOnMgLens(e.clientX, e.clientY);
  }

  function shouldKeepPopupOpenForTarget(target) {
    return Boolean(
      target?.closest?.(".hw-mg-popup") ||
      target?.closest?.(".hw-mg-widget") ||
      target?.closest?.(".hw-mg-lens") ||
      target?.closest?.(".hw-hc-launcher, .hw-hc-memo, .hw-hc-mini")
    );
  }

  function onDocumentPointerDown(e) {
    if (!popupEl) return;
    if (popupEditMode) return;
    if (isMgToolInteraction(e)) return;
    if (armed) return;
    closePopup();
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
    const fill = onboardScrimEl.querySelector(".hw-mg-onboard-scrim__fill");
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
    if (!onboardScrimEl || !widgetEl || !onboardEl) return;
    syncOnboardScrimViewport();
    const hole = onboardScrimEl.querySelector(".hw-mg-onboard-scrim__hole");
    if (!hole) return;
    const pad = 16;
    const spot = mergeSpotlightRects(
      spotlightRect(lensEl || widgetEl, pad),
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

  function dismissOnboarding() {
    if (onboardEl) {
      onboardEl.remove();
      onboardEl = null;
    }
    if (onboardScrimEl) {
      onboardScrimEl.remove();
      onboardScrimEl = null;
    }
    unbindOnboardScrimResize();
    document.body.classList.remove("hw-mg-onboarding-active");
    hostEl?.classList.remove("hw-mg-onboarding");
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function placeOnboard() {
    if (!onboardEl || !widgetEl || !hostEl) return;
    const cardW = Math.min(256, hostEl.clientWidth - 16);
    onboardEl.style.width = cardW + "px";

    const hostRect = hostEl.getBoundingClientRect();
    const lensRect = (lensEl || widgetEl).getBoundingClientRect();
    const gap = 10;
    const cardH = onboardEl.offsetHeight || 150;
    const maxLeft = hostEl.clientWidth - cardW - 8;
    const maxTop = hostEl.clientHeight - cardH - 8;

    let left = lensRect.right - hostRect.left + gap;
    let top = lensRect.top - hostRect.top + (lensRect.height - cardH) / 2;

    if (left + cardW > hostEl.clientWidth - 8) {
      left = lensRect.left - hostRect.left - cardW - gap;
    }
    left = Math.max(8, Math.min(left, maxLeft));
    top = Math.max(8, Math.min(top, maxTop));

    onboardEl.style.left = left + "px";
    onboardEl.style.top = top + "px";
    updateOnboardScrimSpotlight();
  }

  function initOnboarding() {
    if (overrideOptions?.skipOnboarding) return;
    if (!shellEl || !widgetEl) return;
    try {
      if (localStorage.getItem(ONBOARD_KEY) === "1") return;
    } catch {
      return;
    }
    if (onboardEl) return;

    onboardScrimEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    onboardScrimEl.classList.add("hw-mg-onboard-scrim");
    onboardScrimEl.setAttribute("aria-hidden", "true");
    const maskId = "hw-mg-onboard-spotlight-" + Math.random().toString(36).slice(2, 9);
    onboardScrimEl.innerHTML =
      "<defs><mask id=\"" +
      maskId +
      "\"><rect x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" fill=\"white\"/>" +
      "<rect class=\"hw-mg-onboard-scrim__hole\" rx=\"14\" ry=\"14\" fill=\"black\"/></mask></defs>" +
      "<rect class=\"hw-mg-onboard-scrim__fill\" x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" " +
      "fill=\"rgba(0,0,0,0.88)\" mask=\"url(#" +
      maskId +
      ")\"/>";
    onboardScrimEl.addEventListener("click", () => dismissOnboarding());
    document.body.appendChild(onboardScrimEl);

    onboardEl = document.createElement("div");
    onboardEl.className = "hw-mg-onboard";
    onboardEl.setAttribute("role", "dialog");
    onboardEl.setAttribute("aria-labelledby", "hw-mg-onboard-title");
    onboardEl.innerHTML =
      '<div class="hw-mg-onboard__card">' +
      '<p class="hw-mg-onboard__eyebrow">New · 虫眼鏡</p>' +
      '<h2 class="hw-mg-onboard__title" id="hw-mg-onboard-title">Look up any word</h2>' +
      '<p class="hw-mg-onboard__text">Tap the magnifying glass, then click a Japanese word to see the reading and meaning.</p>' +
      '<button type="button" class="btn btn--primary btn--sm hw-mg-onboard__btn">Got it</button>' +
      "</div>";

    onboardEl.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    onboardEl.addEventListener("click", (ev) => ev.stopPropagation());
    onboardEl.querySelector(".hw-mg-onboard__btn")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      dismissOnboarding();
    });

    shellEl.appendChild(onboardEl);
    hostEl?.classList.add("hw-mg-onboarding");
    document.body.classList.add("hw-mg-onboarding-active");
    bindOnboardScrimResize();
    requestAnimationFrame(() => {
      placeOnboard();
      onboardScrimEl?.classList.add("is-visible");
      onboardEl?.classList.add("is-visible");
      requestAnimationFrame(updateOnboardScrimSpotlight);
    });
  }

  function buildUi() {
    if (built) return;

    snapHintEl = document.createElement("span");
    snapHintEl.className = "hw-mg-snap-hint";
    snapHintEl.setAttribute("aria-hidden", "true");

    toastEl = document.createElement("div");
    toastEl.className = "hw-mg-toast";
    toastEl.setAttribute("aria-live", "polite");

    lensEl = document.createElement("button");
    lensEl.type = "button";
    lensEl.id = "hw-mg-lens";
    lensEl.className = "hw-mg-lens";
    lensEl.innerHTML = LENS_ICON + '<span class="hw-mg-lens__label">Magnifying glass lookup</span>';
    lensEl.setAttribute("aria-pressed", "false");
    lensEl.addEventListener("pointerdown", onPointerDown);
    lensEl.addEventListener("pointermove", onPointerMove);
    lensEl.addEventListener("pointerup", onPointerUp);
    lensEl.addEventListener("pointercancel", onPointerCancel);
    lensEl.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    });

    widgetEl = document.createElement("div");
    widgetEl.className = "hw-mg-widget";
    widgetEl.append(lensEl);

    document.addEventListener("click", handleLookupClick, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("pointerdown", onDocumentPointerDown, true);

    built = true;
  }

  function attachHost(opts) {
    const force = Boolean(opts?.force || overrideHostEl);
    if (!force && !enabled()) {
      destroy();
      return false;
    }
    buildUi();
    const nextHost = findHost();
    if (!nextHost || !hostIsVisible(nextHost)) return false;

    if (hostEl === nextHost && shellEl?.parentElement === nextHost) {
      global.HwWorksheetToolLayout?.ensureCleanupButton?.(nextHost);
      /* After magnet: same paint-order pattern as cloud launcher. */
      if (widgetEl) nextHost.appendChild(widgetEl);
      applyLensPosition();
      if (!overrideOptions?.skipOnboarding) placeOnboard();
      return true;
    }

    closePopup();
    setArmed(false);
    unbindHostHover();
    if (hostEl && hostEl !== nextHost) {
      hostEl.classList.remove("hw-mg-host", "hw-mg-armed");
      if (shellEl?.parentElement === hostEl) shellEl.remove();
      if (widgetEl?.parentElement === hostEl) widgetEl.remove();
    }

    hostEl = nextHost;
    hostEl.classList.add("hw-mg-host");

    shellEl = hostEl.querySelector(":scope > .hw-mg-shell");
    if (!shellEl) {
      shellEl = document.createElement("div");
      shellEl.className = "hw-mg-shell";
      shellEl.setAttribute("aria-hidden", "true");
      hostEl.appendChild(shellEl);
    }

    shellEl.append(snapHintEl, toastEl);
    /* Same stacking parent as magnet / cloud — not inside the clip shell. */
    hostEl.appendChild(widgetEl);

    loadLensPosition();
    try {
      /* Live platform: unset → TR via computeNeutralPositions.
         Explicit attach defaults (e.g. toolbar playtest ml) must win. */
      if (
        !localStorage.getItem(lensStorageKey()) &&
        !overrideOptions?.defaultSnap &&
        !overrideOptions?.defaultLens
      ) {
        const neutral = global.HwWorksheetToolLayout?.computeNeutralPositions?.(hostEl);
        if (neutral?.lensSnap && SNAP_IDS.includes(neutral.lensSnap)) {
          lensSnapId = neutral.lensSnap;
        } else if (neutral?.lens) {
          lensSnapId = null;
          lensPosition = { ...neutral.lens };
        }
      }
    } catch (_) {}
    applyLensPosition();
    initOnboarding();

    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => {
      applyLensPosition();
      if (!overrideOptions?.skipOnboarding) placeOnboard();
    });
    resizeObserver.observe(hostEl);
    bindHostHover();
    preloadLookupAssets();
    global.HwWorksheetToolLayout?.ensureCleanupButton?.(hostEl);
    /* ensureCleanup may create magnet after this widget; re-append so glass stays above. */
    hostEl.appendChild(widgetEl);

    if (overrideOptions?.autoArm) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setArmed(true, { silent: !!overrideOptions.silentArm }));
      });
    }

    return true;
  }

  function attachTo(el, opts) {
    if (!el) return false;
    overrideHostEl = el;
    overrideOptions = opts || {};
    return attachHost({ force: true });
  }

  function releaseOverride(skipReattach) {
    const prevHost = overrideHostEl;
    overrideHostEl = null;
    overrideOptions = null;
    closePopup();
    dismissOnboarding();
    setArmed(false);
    unbindHostHover();
    if (prevHost) {
      prevHost.classList.remove("hw-mg-host", "hw-mg-armed");
      prevHost.querySelector(":scope > .hw-mg-shell")?.remove();
      prevHost.querySelector(":scope > .hw-mg-widget")?.remove();
    }
    if (hostEl === prevHost) {
      resizeObserver?.disconnect();
      hostEl = null;
      shellEl = null;
    }
    if (!skipReattach && enabled()) attachHost();
    return true;
  }

  function init() {
    if (!enabled()) return;
    attachHost();
    if (!hostEl) {
      const retry = () => {
        if (attachHost()) observer.disconnect();
      };
      const observer = new MutationObserver(retry);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    }
  }

  function refresh() {
    if (overrideHostEl && hostIsVisible(overrideHostEl)) {
      return attachHost({ force: true });
    }
    if (!enabled()) {
      return false;
    }
    return attachHost();
  }

  function destroy() {
    releaseOverride(true);
    closePopup();
    dismissOnboarding();
    unbindHostHover();
    setArmed(false);
    if (hostEl) {
      hostEl.classList.remove("hw-mg-host", "hw-mg-armed");
      hostEl.querySelector(":scope > .hw-mg-shell")?.remove();
      hostEl.querySelector(":scope > .hw-mg-widget")?.remove();
    }
    resizeObserver?.disconnect();
    hostEl = null;
    shellEl = null;
  }

  function getStorageKey() {
    return lensStorageKey();
  }

  /** Snap used when attach opts set defaultSnap and nothing is saved yet. */
  function getAttachDefaultSnap() {
    const s = overrideOptions?.defaultSnap;
    return s && SNAP_IDS.includes(s) ? s : null;
  }

  /** Free host-local coords when attach opts set defaultLens (no snap). */
  function getAttachDefaultLens() {
    const p = overrideOptions?.defaultLens;
    if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
    return null;
  }

  global.HwMagnifyingGlass = {
    init,
    refresh,
    destroy,
    setArmed,
    attachTo,
    releaseOverride,
    fetchLookup,
    getLensPosition,
    setLensPositionLocal,
    setLensSnap,
    resetLensPosition,
    offsetLensBy,
    offsetPopupBy,
    getStorageKey,
    getAttachDefaultSnap,
    getAttachDefaultLens,
  };
})(window);
