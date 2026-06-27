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
    "input, textarea, select, button, a, label, video, audio, .hw-mg-widget, .hw-mg-lens, .hw-mg-popup, .hw-mg-onboard, .hw-video-inline, .hw-audio-inline, .hw-star-block__chip, .hw-star-block__slot";

  const LENS_ICON =
    '<svg class="hw-mg-lens__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="10" cy="10" r="6.5"/>' +
    '<path d="M15 15l6 6"/>' +
    "</svg>";

  /** WIP preview — 字 as magnifying glass (sketch: 宀 + round 子 lens + ー + hook); angled like LENS_ICON. */
  const LENS_ICON_JI_PREVIEW =
    '<svg class="hw-mg-ji-preview__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<g transform="rotate(-40 12 12)" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 2.1v1.5" stroke-width="1.7"/>' +
    '<path d="M4.1 9.4V7.1c0-0.6 3.5-2.8 7.9-2.8s7.9 2.2 7.9 2.8v2.3" stroke-width="2.1"/>' +
    '<circle cx="12" cy="11.4" r="4.4" stroke-width="2" fill="currentColor" fill-opacity="0.1"/>' +
    '<path d="M5.8 15.6h12.4" stroke-width="2.15"/>' +
    '<path d="M12 15.6v5.1" stroke-width="2.25"/>' +
    '<path d="M12 20.7H8.1" stroke-width="2.15"/>' +
    "</g></svg>";

  let hostEl = null;
  let shellEl = null;
  let widgetEl = null;
  let lensEl = null;
  let popupEl = null;
  let toastEl = null;
  let snapHintEl = null;
  let onboardEl = null;
  let resizeObserver = null;
  let armed = false;
  let lensSnapId = null;
  let lensPosition = { ...DEFAULT_LENS };
  let dragState = null;
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

  function saveLensPosition() {
    try {
      if (lensSnapId) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ snap: lensSnapId }));
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ x: lensPosition.x, y: lensPosition.y }));
      }
    } catch {
      /* ignore */
    }
  }

  function loadLensPosition() {
    lensSnapId = null;
    lensPosition = { ...DEFAULT_LENS };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
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

  function setArmed(next) {
    armed = !!next;
    hostEl?.classList.toggle("hw-mg-armed", armed);
    widgetEl?.classList.toggle("is-armed", armed);
    lensEl?.classList.toggle("is-armed", armed);
    if (lensEl) lensEl.setAttribute("aria-pressed", armed ? "true" : "false");
    if (armed) {
      closePopup();
      showToast("Tap a word to look it up · Esc to cancel");
    } else {
      clearHoverHighlight();
    }
  }

  function closePopup() {
    lookupBusy = false;
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
        ".hw-worksheet__content, .hw-translation-block__japanese, .hw-star-block__sentence, .hw-star-block__prefix, .hw-star-block__suffix, .hw-open-topic, .hw-video-prompt__text, .hw-audio-prompt__text, .hw-worksheet, [lang='ja']"
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
        ".hw-worksheet__content, .hw-translation-block__japanese, .hw-star-block__sentence, .hw-open-topic, .hw-video-prompt__text, .hw-audio-prompt__text, [lang='ja']"
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

  async function refreshHoverHighlight(clientX, clientY) {
    if (!armed || !supportsHoverHighlight() || lookupBusy || !hostEl) {
      clearHoverHighlight();
      return;
    }

    const target = document.elementFromPoint(clientX, clientY);
    if (!target || !isLookupTarget(target)) {
      clearHoverHighlight();
      return;
    }

    const data = await resolveLookup(target, clientX, clientY);
    if (!armed || lookupBusy || pendingHoverPoint?.x !== clientX || pendingHoverPoint?.y !== clientY) {
      return;
    }
    if (!data?.surface) {
      clearHoverHighlight();
      return;
    }

    const container = lookupContainerFor(target);
    const range = rangeFromOffsets(container, data.start, data.end);
    if (range) renderHoverHighlight(range);
    else clearHoverHighlight();
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

  function onHostMouseMove(e) {
    if (!armed || !supportsHoverHighlight()) return;
    scheduleHoverHighlight(e.clientX, e.clientY);
  }

  function onHostMouseLeave() {
    clearHoverHighlight();
  }

  function bindHostHover() {
    if (!hostEl) return;
    unbindHostHover();
    hostMouseMoveBound = onHostMouseMove;
    hostEl.addEventListener("mousemove", hostMouseMoveBound);
    hostEl.addEventListener("mouseleave", onHostMouseLeave);
  }

  function unbindHostHover() {
    if (hostEl && hostMouseMoveBound) {
      hostEl.removeEventListener("mousemove", hostMouseMoveBound);
      hostEl.removeEventListener("mouseleave", onHostMouseLeave);
    }
    hostMouseMoveBound = null;
    clearHoverHighlight();
  }

  async function tokenizeText(text) {
    const auto = global.HwFuriganaAuto;
    if (!auto?.ensureTokenizer) return [];
    try {
      const tokenizer = await auto.ensureTokenizer();
      return tokenizer.tokenize(String(text || ""));
    } catch {
      return [];
    }
  }

  async function resolveLookup(target, clientX, clientY, options) {
    const maxPointerPx = options?.maxPointerPx ?? 22;
    const container = lookupContainerFor(target);
    const text = normalizeContainerText(container);
    if (!text) return null;

    const offset = caretOffsetNearPointer(container, clientX, clientY, maxPointerPx);
    if (offset < 0) return null;

    const tokens = await tokenizeText(text);
    const rawSpans = buildTokenSpans(tokens, text);
    const spans = global.HwMgLexicon?.mergeTokenSpans?.(rawSpans) || rawSpans;
    const unit = pickLookupUnit(spans, offset);
    if (!unit?.surface) return null;

    const range = rangeFromOffsets(container, unit.start, unit.end);
    if (!range || !pointerNearRange(clientX, clientY, range, maxPointerPx + 6)) return null;

    return unit;
  }

  async function fetchLookup(unit) {
    const surface = unit?.surface || String(unit || "").trim();
    if (!surface) return null;

    const lex = global.HwMgLexicon?.resolve?.(surface, unit?.lemma) || {};
    if (lex.definition) {
      return {
        query: surface,
        reading: lex.reading || unit?.reading || "",
        definition: lex.definition,
        jishoUrl: lex.jishoUrl,
      };
    }

    const q = lex.query || unit?.query || unit?.lemma || surface;
    try {
      const res = await fetch("/api/ja-lookup?q=" + encodeURIComponent(q));
      if (!res.ok) return null;
      const data = await res.json();
      return {
        ...data,
        query: surface,
        reading: data.reading || unit?.reading || "",
        jishoUrl: data.jishoUrl || lex.jishoUrl,
      };
    } catch {
      return null;
    }
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
    if (top + rect.height > boxH - pad) top = localY - rect.height - 10;
    left = Math.max(pad, Math.min(left, boxW - rect.width - pad));
    top = Math.max(pad, Math.min(top, boxH - rect.height - pad));
    popupEl.style.left = left + "px";
    popupEl.style.top = top + "px";
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
      empty.textContent = result.reading ? "No short definition found." : "Could not read this word.";
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
    positionPopup(localX, localY);
  }

  async function handleLookupClick(e) {
    if (!armed || !hostEl?.contains(e.target)) return;
    if (e.target.closest(".hw-mg-popup") || e.target.closest(".hw-mg-widget") || e.target.closest(".hw-mg-onboard")) return;
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
    loading.textContent = "…";
    shellEl.appendChild(loading);
    popupEl = loading;
    bindPopupClose(loading);

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
          jishoUrl: lookup.jishoUrl || data.jishoUrl || "https://jisho.org/search/" + encodeURIComponent(data.query || data.surface),
        },
        local.x,
        local.y
      );
    } catch {
      closePopup();
      showToast("Lookup failed — try again");
    } finally {
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

  function dismissOnboarding() {
    if (!onboardEl) return;
    onboardEl.remove();
    onboardEl = null;
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

    const x = parseFloat(widgetEl.style.left) || DEFAULT_LENS.x;
    const y = parseFloat(widgetEl.style.top) || DEFAULT_LENS.y;
    let left = x + 40;
    let top = y + 52;

    const cardH = onboardEl.offsetHeight || 150;
    const maxLeft = hostEl.clientWidth - cardW - 8;
    const maxTop = hostEl.clientHeight - cardH - 8;
    if (left + cardW > hostEl.clientWidth - 8) left = x - cardW - 16;
    left = Math.max(8, Math.min(left, maxLeft));
    top = Math.max(8, Math.min(top, maxTop));

    onboardEl.style.left = left + "px";
    onboardEl.style.top = top + "px";
  }

  function initOnboarding() {
    if (!shellEl || !widgetEl) return;
    try {
      if (localStorage.getItem(ONBOARD_KEY) === "1") return;
    } catch {
      return;
    }
    if (onboardEl) return;

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
    requestAnimationFrame(() => {
      placeOnboard();
      onboardEl?.classList.add("is-visible");
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

    const jiPreviewEl = document.createElement("div");
    jiPreviewEl.className = "hw-mg-ji-preview";
    jiPreviewEl.setAttribute("aria-hidden", "true");
    jiPreviewEl.innerHTML = '<span class="hw-mg-ji-preview__label">Test</span>' + LENS_ICON_JI_PREVIEW;

    widgetEl = document.createElement("div");
    widgetEl.className = "hw-mg-widget";
    widgetEl.append(lensEl, jiPreviewEl);

    document.addEventListener("click", handleLookupClick, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("click", onDocumentClick);

    built = true;
  }

  function attachHost() {
    if (!enabled()) {
      destroy();
      return false;
    }
    buildUi();
    const nextHost = findHost();
    if (!nextHost || !hostIsVisible(nextHost)) return false;

    if (hostEl === nextHost && shellEl?.parentElement === nextHost) {
      applyLensPosition();
      placeOnboard();
      return true;
    }

    closePopup();
    setArmed(false);
    unbindHostHover();
    hostEl?.classList.remove("hw-mg-host", "hw-mg-armed");

    hostEl = nextHost;
    hostEl.classList.add("hw-mg-host");

    shellEl = hostEl.querySelector(".hw-mg-shell");
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
      placeOnboard();
    });
    resizeObserver.observe(hostEl);
    bindHostHover();

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
    if (!enabled()) {
      destroy();
      return;
    }
    attachHost();
  }

  function destroy() {
    closePopup();
    dismissOnboarding();
    unbindHostHover();
    setArmed(false);
    hostEl?.classList.remove("hw-mg-host", "hw-mg-armed");
    resizeObserver?.disconnect();
    shellEl?.remove();
    hostEl = null;
    shellEl = null;
    widgetEl = null;
    lensEl = null;
  }

  global.HwMagnifyingGlass = { init, refresh, destroy, setArmed };
})(window);
