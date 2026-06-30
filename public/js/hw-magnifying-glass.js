/**
 * Magnifying glass (虫眼鏡) — draggable click-to-lookup inside the homework card.
 */
(function (global) {
  const STORAGE_KEY = "hw-mg-position-v2";
  const ONBOARD_KEY = "hw-mg-onboarding-v1";
  const DEFAULT_LENS = { x: 114, y: 40 };
  const SNAP_IDS = ["tl", "tc", "tr", "ml", "mr", "bl", "bc", "br"];
  const JA_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff々ー]/;
  const SKIP_SELECTOR =
    "input, textarea, select, button, a, label, video, audio, .hw-mg-widget, .hw-mg-lens, .hw-mg-popup, .hw-mg-onboard, .hw-video-inline, .hw-audio-inline, .hw-star-block__chip, .hw-star-block__slot, .hw-star-block__fixed";

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
  let hoverHighlightEl = null;
  let hoverHighlightRaf = null;
  let hostMouseMoveBound = null;
  let pendingHoverPoint = null;

  function supportsHoverHighlight() {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  function enabled() {
    return global.HwFeatureFlags?.magnifyingGlass?.() === true;
  }

  function findHost() {
    if (overrideHostEl && hostIsVisible(overrideHostEl)) return overrideHostEl;
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

  function snapPoints() {
    const box = hostEl;
    const pad = 12;
    const w = box?.clientWidth || 320;
    const h = box?.clientHeight || 480;
    const midY = h * 0.5;
    return {
      tl: { x: pad, y: pad },
      tc: { x: w * 0.5, y: pad },
      tr: { x: w - pad, y: pad },
      ml: { x: pad, y: midY },
      mr: { x: w - pad, y: midY },
      bl: { x: pad, y: h - pad },
      bc: { x: w * 0.5, y: h - pad },
      br: { x: w - pad, y: h - pad },
    };
  }

  function clampLocal(x, y) {
    const pad = 8;
    const w = hostEl?.clientWidth || 0;
    const h = hostEl?.clientHeight || 0;
    return {
      x: Math.max(pad, Math.min(x, w - pad)),
      y: Math.max(pad, Math.min(y, h - pad)),
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
      closePopup();
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
    lookupBusy = false;
    popupDragState = null;
    if (popupEl) {
      popupEl.remove();
      popupEl = null;
    }
  }

  function isLookupTarget(el) {
    if (!el || !(el instanceof Element) || !hostEl?.contains(el)) return false;
    if (el.closest(".hw-mg-popup") || el.closest(".hw-mg-widget") || el.closest(".hw-mg-onboard")) return false;
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

  function caretOffsetIn(container, clientX, clientY) {
    const range = caretRangeAtPoint(clientX, clientY);
    if (!range || !container.contains(range.startContainer)) return -1;
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
    const pre = document.createRange();
    pre.selectNodeContents(container);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }

  function expandRangeToJapaneseWordRange(range) {
    if (!range || !range.startContainer) return null;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.textContent || "";
    let start = range.startOffset;
    let end = range.endOffset;
    while (start > 0 && JA_CHAR.test(text[start - 1])) start -= 1;
    while (end < text.length && JA_CHAR.test(text[end])) end += 1;
    if (start >= end || !JA_CHAR.test(text.slice(start, end))) return null;
    const next = range.cloneRange();
    next.setStart(node, start);
    next.setEnd(node, end);
    return next;
  }

  function expandRangeToJapaneseWord(range) {
    return expandRangeToJapaneseWordRange(range)?.toString().trim() || "";
  }

  function lookupContainerFor(el) {
    return (
      el?.closest(
        ".hw-worksheet__content, .hw-translation-block__japanese, .hw-star-block__sentence, .hw-open-topic, .hw-video-prompt__text, .hw-audio-prompt__text, .hw-lookup-lexicon-playground__content, .hw-lookup-lexicon-playground__text, [lang='ja']"
      ) || el
    );
  }

  function normalizeContainerText(container) {
    return (container?.textContent || "").replace(/\s+/g, " ").trim();
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
    if (global.HwMgLexicon?.isSkipped?.(span.surface, span.token)) return true;
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

    const hostRect = hostEl.getBoundingClientRect();
    if (!hoverHighlightEl) {
      hoverHighlightEl = document.createElement("div");
      hoverHighlightEl.className = "hw-mg-hover-highlight";
      hoverHighlightEl.setAttribute("aria-hidden", "true");
      shellEl.appendChild(hoverHighlightEl);
    }

    hoverHighlightEl.replaceChildren();
    const padX = 4;
    const padY = 3;
    const rects = range.getClientRects();
    for (const rect of rects) {
      if (!rect.width || !rect.height) continue;
      const box = document.createElement("span");
      box.className = "hw-mg-hover-highlight__rect";
      box.style.left = rect.left - hostRect.left - padX + "px";
      box.style.top = rect.top - hostRect.top - padY + "px";
      box.style.width = rect.width + padX * 2 + "px";
      box.style.height = rect.height + padY * 2 + "px";
      hoverHighlightEl.appendChild(box);
    }

    if (!hoverHighlightEl.childElementCount) {
      clearHoverHighlight();
    }
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
    const container = lookupContainerFor(target);
    if (!container) return null;
    const offset = caretOffsetNearPointer(container, clientX, clientY, 24);
    if (offset < 0) return null;
    const text = normalizeContainerText(container);
    const unit = global.HwMgLexicon?.pickQuickUnit?.(text, offset);
    if (unit) return rangeFromOffsets(container, unit.start, unit.end);
    const range = caretRangeAtPoint(clientX, clientY);
    if (!range || !container.contains(range.startContainer)) return null;
    if (!pointerNearRange(clientX, clientY, range, 24)) return null;
    return expandRangeToJapaneseWordRange(range);
  }

  async function refreshHoverHighlight(clientX, clientY) {
    if (!armed || !supportsHoverHighlight() || lookupBusy || !hostEl) {
      clearHoverHighlight();
      return;
    }

    const target = lookupTargetFromPoint(clientX, clientY);
    if (!target) {
      clearHoverHighlight();
      return;
    }

    const quickRange = hoverRangeQuick(target, clientX, clientY);
    if (quickRange) renderHoverHighlight(quickRange);

    try {
      const data = await resolveLookup(target, clientX, clientY);
      if (!armed || lookupBusy || pendingHoverPoint?.x !== clientX || pendingHoverPoint?.y !== clientY) {
        return;
      }
      if (data?.surface) {
        const container = lookupContainerFor(target);
        const range = rangeFromOffsets(container, data.start, data.end);
        if (range) renderHoverHighlight(range);
        else if (!quickRange) clearHoverHighlight();
      } else if (!quickRange) {
        clearHoverHighlight();
      }
    } catch {
      if (!quickRange) clearHoverHighlight();
    }
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
    const auto = global.HwFuriganaAuto;
    if (!auto?.ensureTokenizer) return [];
    try {
      const tokenizerPromise = auto.ensureTokenizer();
      const tokenizer = auto.withTimeout
        ? await auto.withTimeout(tokenizerPromise, 4500, "tokenizer timeout")
        : await tokenizerPromise;
      return tokenizer.tokenize(String(text || ""));
    } catch {
      return [];
    }
  }

  function pickQuickLookupUnit(text, offset, clientX, clientY, container, maxPointerPx) {
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
    const lexReady = global.HwMgLexicon?.ensureLoaded?.()?.catch?.(() => {});

    const maxPointerPx = options?.maxPointerPx ?? 22;
    const container = lookupContainerFor(target);
    const text = normalizeContainerText(container);
    if (!text) return null;

    const offset = caretOffsetNearPointer(container, clientX, clientY, maxPointerPx);
    if (offset < 0) return null;

    await lexReady;

    const forced = global.HwMgLexicon?.pickForceUnit?.(text, offset);
    if (forced && !lexiconPreviewActive()) {
      const range = rangeFromOffsets(container, forced.start, forced.end);
      if (range && pointerNearRange(clientX, clientY, range, maxPointerPx + 6)) {
        return global.HwMgLexicon?.enrich?.(forced) || forced;
      }
    }

    if (lexiconPreviewActive()) {
      return pickQuickLookupUnit(text, offset, clientX, clientY, container, maxPointerPx);
    }

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

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch("/api/ja-lookup?q=" + encodeURIComponent(q), {
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
            continue;
          }
          break;
        }
        const data = await res.json();
        if (data?.error) {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
            continue;
          }
          break;
        }
        return {
          ...data,
          query: surface,
          reading: data.reading || unit?.reading || lex.reading || "",
          definition: data.definition || unit?.definition || lex.definition || "",
          jishoUrl: data.jishoUrl || jishoUrl,
        };
      } catch {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
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

  function positionPopup(localX, localY) {
    if (!popupEl || !hostEl) return;
    const pad = 8;
    const boxW = hostEl.clientWidth;
    const boxH = hostEl.clientHeight;
    const rect = popupEl.getBoundingClientRect();
    let left = localX + 10;
    let top = localY + 10;
    if (left + rect.width > boxW - pad) left = localX - rect.width - 10;
    if (isLexiconPlaygroundHost()) {
      if (top + rect.height > boxH - pad) top = localY - rect.height - 12;
      setPopupPosition(left, top);
      return;
    }
    if (top + rect.height > boxH - pad) top = localY - rect.height - 10;
    setPopupPosition(left, top);
  }

  function onPopupDragStart(e) {
    if (e.button !== 0 || !popupEl || e.target !== popupEl && !popupEl.contains(e.target)) return;
    if (e.target.closest(".hw-mg-popup__close") || e.target.closest(".hw-mg-popup__more")) return;

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

  function bindPopupClose(popup) {
    popup.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    popup.addEventListener("click", (ev) => ev.stopPropagation());
    popup.querySelector(".hw-mg-popup__close")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closePopup();
    });
  }

  function renderPopup(result, localX, localY) {
    closePopup();
    if (!shellEl) return;

    popupEl = document.createElement("div");
    popupEl.className = "hw-mg-popup";
    popupEl.setAttribute("role", "dialog");
    popupEl.setAttribute("aria-label", "Word lookup");

    if (result.surface) {
      const wordEl = document.createElement("p");
      wordEl.className = "hw-mg-popup__word";
      wordEl.textContent = result.surface;
      popupEl.appendChild(wordEl);
    }

    const head = document.createElement("div");
    head.className = "hw-mg-popup__head";

    const readingEl = document.createElement("p");
    readingEl.className = "hw-mg-popup__reading";
    readingEl.textContent = result.reading || "—";
    head.appendChild(readingEl);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "hw-mg-popup__close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    head.appendChild(closeBtn);
    popupEl.appendChild(head);

    if (result.definition) {
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
        empty.textContent = "Dictionary busy — try again or use Jisho below.";
      } else {
        empty.textContent = "Could not read this word.";
      }
      popupEl.appendChild(empty);
    }

    if (result.jishoUrl) {
      const link = document.createElement("a");
      link.className = "hw-mg-popup__more";
      link.href = result.jishoUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "See more on Jisho →";
      popupEl.appendChild(link);
    }

    shellEl.appendChild(popupEl);
    bindPopupClose(popupEl);
    bindPopupDrag(popupEl);
    positionPopup(localX, localY);
  }

  async function handleLookupClick(e) {
    if (!armed || !hostEl?.contains(e.target)) return;
    if (
      e.target.closest(".hw-mg-popup") ||
      e.target.closest(".hw-mg-widget") ||
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

    clearHoverHighlight();
    closePopup();

    const local = clientToLocal(e.clientX, e.clientY);
    lookupBusy = true;

    const loading = document.createElement("div");
    loading.className = "hw-mg-popup hw-mg-popup--loading";
    loading.style.left = local.x + 10 + "px";
    loading.style.top = local.y + 10 + "px";
    loading.textContent = "Looking up…";
    shellEl.appendChild(loading);
    popupEl = loading;
    bindPopupClose(loading);
    bindPopupDrag(loading);

    const lookupTimeout = setTimeout(() => {
      if (lookupBusy && popupEl === loading) {
        closePopup();
        showToast("Lookup timed out — try again in a moment");
        lookupBusy = false;
      }
    }, 15000);

    try {
      const data = await resolveLookup(e.target, e.clientX, e.clientY, { maxPointerPx: 36 });
      if (!data?.surface) {
        closePopup();
        showToast("No Japanese word here — try again");
        return;
      }
      const lookup = (await fetchLookup(data)) || {};
      renderPopup(
        {
          reading: lookup.reading || data.reading || "",
          definition: lookup.definition || data.definition || "",
          jishoUrl:
            lookup.jishoUrl ||
            data.jishoUrl ||
            "https://jisho.org/search/" + encodeURIComponent(data.query || data.surface),
          surface: data.surface,
        },
        local.x,
        local.y
      );
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
      moved: false,
    };
    lensEl.classList.add("is-dragging");
    widgetEl?.classList.add("is-dragging");
    lensEl.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && dx * dx + dy * dy > 16) {
      dragState.moved = true;
      if (armed) setArmed(false);
    }
    if (!dragState.moved) return;

    const local = clientToLocal(e.clientX, e.clientY);
    setLensPosition(local.x, local.y);

    const snapId = nearestSnap(local.x, local.y);
    if (snapHintEl && snapId) {
      const p = snapPoints()[snapId];
      snapHintEl.style.left = p.x + "px";
      snapHintEl.style.top = p.y + "px";
      snapHintEl.classList.add("is-visible", "is-target");
    }
  }

  function onPointerUp(e) {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    lensEl.classList.remove("is-dragging");
    widgetEl?.classList.remove("is-dragging");
    snapHintEl?.classList.remove("is-visible", "is-target");

    if (dragState.moved) {
      const local = clientToLocal(e.clientX, e.clientY);
      const snapId = nearestSnap(local.x, local.y);
      if (snapId) placeLens(snapId);
      else setFreeLensPosition(local.x, local.y);
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
    } else if (popupEl && !e.target.closest(".hw-mg-popup")) {
      closePopup();
    }
  }

  function onDocumentClick(e) {
    if (!popupEl || armed) return;
    if (!e.target.closest(".hw-mg-popup")) closePopup();
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
    lensEl.addEventListener("pointercancel", onPointerUp);
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
    document.addEventListener("click", onDocumentClick);

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

    shellEl.append(snapHintEl, toastEl, widgetEl);

    loadLensPosition();
    applyLensPosition();
    initOnboarding();

    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => {
      applyLensPosition();
      if (!overrideOptions?.skipOnboarding) placeOnboard();
    });
    resizeObserver.observe(hostEl);
    bindHostHover();

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
    }
    resizeObserver?.disconnect();
    hostEl = null;
    shellEl = null;
  }

  global.HwMagnifyingGlass = {
    init,
    refresh,
    destroy,
    setArmed,
    attachTo,
    releaseOverride,
    fetchLookup,
  };
})(window);
