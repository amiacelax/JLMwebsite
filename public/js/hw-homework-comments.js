/**
 * Homework comment cloud — highlight text on the worksheet, attach a note bubble.
 */
(function (global) {
  if (!global.HwFeatureFlags?.homeworkComments?.()) return;

  (function ensureCommentStyles() {
    if (document.querySelector("[data-hw-comments-css]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/css/hw-homework-comments.css?v=20260813-bank";
    link.setAttribute("data-hw-comments-css", "1");
    document.head.appendChild(link);
  })();

  const DRAFT_SAVE_MS = 700;
  const LAUNCHER_POS_KEY = "jlm-hc-launcher-pos";
  const LAUNCHER_SNAP_IDS = ["tl", "tc", "tr", "ml", "mr", "bl", "bc", "br"];
  const ONBOARD_KEY = "hw-hc-onboarding-v1";
  const MG_ONBOARD_KEY = "hw-mg-onboarding-v1";
  const MINI_CLOUD_ONBOARD_PREFIX = "hw-mini-cloud-onboard:";
  const MINI_CLOUD_ONBOARD_WINDOW_MS = 14 * 86400000;
  const MINI_CLOUD_ONBOARD_MAX_SHOWS = 2;
  const DRAG_THRESHOLD = 5;
  const TOUCH_HOLD_MS = 420;
  const TOUCH_MOVE_CANCEL = 12;
  /** Tap vs drag — beyond this, prefer the user's selection over the soft word preview. */
  const PREVIEW_DRAG_PX = 10;
  const PREVIEW_POINTER_MAX_PX = 24;
  /** Hard cap so a bad lexicon hit never soft-highlights a whole sentence. */
  const PREVIEW_MAX_CHARS = 40;
  const SKIP_SELECTOR =
    "input, textarea, select, button, a, label, video, audio, .hw-tools-cleanup, .hw-hc-launcher, .hw-hc-memo, .hw-hc-mini, .hw-hc-onboard, .hw-hc-sel-menu, .hw-toolbar-bar, .hw-mg-widget, .hw-mg-popup";
  const TOUCH_SKIP_EXTRA =
    ", .hw-star-block__reset, .hw-star-block__slot-clear, .hw-star-block__slot:not(.hw-star-block__slot--filled), .hw-mc-block__reset, .hw-mc-block__slot-clear, .hw-mc-block__slot:not(.hw-mc-block__slot--filled)";
  const PREVIEW_TEXT_SELECTOR =
    ".hw-worksheet__content, .hw-translation-block__japanese, .hw-star-block__sentence, .hw-star-block__prefix, .hw-star-block__suffix, .hw-star-block__fixed, .hw-star-block__chip, .hw-star-block__slot-text, .hw-mc-block__sentence, .hw-mc-block__text, .hw-mc-block__chip, .hw-mc-block__slot-text, .hw-open-topic, .hw-video-prompt__text, .hw-audio-prompt__text, [lang='ja']";

  function openRecordingEraseConfirm(anchorBtn, onConfirm) {
    if (typeof global._hwDeleteConfirmClose === "function") global._hwDeleteConfirmClose();

    const pop = document.createElement("div");
    pop.className = "hw-delete-confirm-popover hw-recording-erase-confirm";
    pop.setAttribute("role", "alertdialog");
    pop.setAttribute("aria-modal", "true");
    pop.innerHTML =
      '<p class="hw-delete-confirm-popover__q">Are you sure? This will erase your current recording.</p>' +
      '<div class="hw-delete-confirm-popover__actions">' +
      '<button type="button" class="hw-delete-confirm-popover__yes">Yes</button>' +
      '<button type="button" class="hw-delete-confirm-popover__no">No</button>' +
      "</div>";

    document.body.appendChild(pop);
    if (anchorBtn) {
      const anchorRect = anchorBtn.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      let top = anchorRect.top - popRect.height - 8;
      let left = anchorRect.left;
      if (top < 8) top = anchorRect.bottom + 8;
      left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
      pop.style.top = top + "px";
      pop.style.left = left + "px";
    } else {
      pop.style.top = "50%";
      pop.style.left = "50%";
      pop.style.transform = "translate(-50%, -50%)";
    }

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
  /** Student memo ids with the teacher reply panel open (review mode). */
  let teacherReplyOpenIds = new Set();
  /** Student memos minimized to blue mini cloud in teacher review. */
  let reviewStudentMinimizedIds = new Set();
  /** Standalone JD notes the student collapsed (studentReviewed). Empty = all open. */
  let reviewTeacherMinimizedIds = new Set();
  let reviewResizeObserver = null;
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
  /** Soft lexicon-word preview while Cloud is armed (not a committed selection). */
  let wordPreviewEl = null;
  let wordPreview = null;
  let wordPreviewRaf = null;
  let wordPreviewSeq = 0;
  let pendingPreviewPoint = null;
  let wordPreviewBound = false;
  let previewPointerDown = null;

  function hasTeacherReply(comment) {
    return !!(String(comment?.teacherRemark || "").trim() || comment?.teacherRemarkMedia?.id);
  }

  /** Teacher review sheet or student viewing JD notes on the worksheet. */
  function isPairReviewMode() {
    return !!(config?.teacherReview || config?.studentReviewed);
  }

  /** Student reviewed archive: JD notes open/close only — not movable. */
  function teacherNotesDraggable() {
    return !config?.studentReviewed;
  }

  function isTeacherReplyOpen(comment) {
    return teacherReplyOpenIds.has(comment.id);
  }

  function closeTeacherReply(id) {
    teacherReplyOpenIds.delete(id);
    renderAll();
  }

  function minimizeStudentReviewMemo(id) {
    reviewStudentMinimizedIds.add(id);
    teacherReplyOpenIds.delete(id);
    if (activeCommentId === id) activeCommentId = null;
    renderAll();
  }

  function expandStudentReviewMemo(id) {
    reviewStudentMinimizedIds.delete(id);
    activeCommentId = id;
    renderAll();
  }

  /** Open both blue student memo and green JD reply together. */
  function expandReviewPair(id) {
    reviewStudentMinimizedIds.delete(id);
    teacherReplyOpenIds.add(id);
    activeCommentId = id;
    renderAll();
    requestAnimationFrame(() => {
      const pair = layersEl?.querySelector('.hw-hc-review-pair[data-id="' + id + '"]');
      pair?.querySelectorAll(".hw-hc-memo__remark--review-auto").forEach(autosizeReviewMemoInput);
      if (config?.teacherReview) {
        pair?.querySelector(".hw-hc-memo__remark")?.focus();
      }
      resolveToolLayout(pair || null);
    });
  }

  function minimizeTeacherReviewReply(id) {
    teacherReplyOpenIds.delete(id);
    renderAll();
  }

  function attachMemoCloseBtn(body, onClose, extraClass, ariaLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hw-hc-memo__close" + (extraClass ? " " + extraClass : "");
    btn.setAttribute("aria-label", ariaLabel || "Minimize");
    btn.textContent = "\u00d7";
    btn.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onClose();
    });
    if (!extraClass || extraClass.indexOf("--inline") < 0) {
      body.appendChild(btn);
    }
    return btn;
  }

  function openTeacherReply(id) {
    expandReviewPair(id);
  }

  function seedTeacherReplyOpen() {
    teacherReplyOpenIds = new Set();
    comments.forEach((c) => {
      if (c.author !== "teacher" && hasTeacherReply(c)) {
        teacherReplyOpenIds.add(c.id);
      }
    });
  }

  /** Student reviewed: JD green notes start expanded (paired replies + standalone). */
  function seedStudentReviewedOpen() {
    seedTeacherReplyOpen();
    reviewTeacherMinimizedIds = new Set();
  }

  function isTeacherStandaloneOpen(comment) {
    if (!comment || comment.author !== "teacher") return false;
    if (config?.studentReviewed) return !reviewTeacherMinimizedIds.has(comment.id);
    return activeCommentId === comment.id;
  }

  function minimizeTeacherStandalone(id) {
    if (config?.studentReviewed) {
      reviewTeacherMinimizedIds.add(id);
      if (activeCommentId === id) activeCommentId = null;
      renderAll();
      return;
    }
    minimizeActive();
  }

  function miniCloudOnboardKey() {
    const user = String(config?.username || "").trim() || "anon";
    return MINI_CLOUD_ONBOARD_PREFIX + user;
  }

  function readMiniCloudOnboardState() {
    try {
      const raw = localStorage.getItem(miniCloudOnboardKey());
      if (!raw) return { shownCount: 0, firstAt: null };
      const parsed = JSON.parse(raw);
      const shownCount = Math.max(0, Number(parsed?.shownCount) || 0);
      const firstAt = Number(parsed?.firstAt) || null;
      return { shownCount, firstAt };
    } catch (_) {
      return { shownCount: 0, firstAt: null };
    }
  }

  function writeMiniCloudOnboardState(state) {
    try {
      localStorage.setItem(
        miniCloudOnboardKey(),
        JSON.stringify({
          shownCount: state.shownCount || 0,
          firstAt: state.firstAt || null,
        })
      );
    } catch (_) {}
  }

  function shouldShowMiniCloudOnboard() {
    if (!config?.studentReviewed) return false;
    const state = readMiniCloudOnboardState();
    if (state.shownCount >= MINI_CLOUD_ONBOARD_MAX_SHOWS) return false;
    if (!state.firstAt) return true;
    return Date.now() - state.firstAt < MINI_CLOUD_ONBOARD_WINDOW_MS;
  }

  function recordMiniCloudOnboardShow() {
    const state = readMiniCloudOnboardState();
    writeMiniCloudOnboardState({
      shownCount: (state.shownCount || 0) + 1,
      firstAt: state.firstAt || Date.now(),
    });
  }

  function rightArrowIconSvg(className) {
    return (
      '<svg class="' +
      (className || "hw-hc-review-comment-btn__icon") +
      '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 12h14M14 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  function autosizeReviewMemoInput(input) {
    if (!input) return;
    const resize = () => {
      input.style.setProperty("min-height", "0", "important");
      input.style.setProperty("height", "0", "important");
      const line = Math.ceil(parseFloat(getComputedStyle(input).lineHeight) || 20);
      const padY =
        (parseFloat(getComputedStyle(input).paddingTop) || 0) +
        (parseFloat(getComputedStyle(input).paddingBottom) || 0);
      const next = Math.max(input.scrollHeight, line + padY);
      input.style.setProperty("height", next + "px", "important");
    };
    resize();
    requestAnimationFrame(resize);
  }

  function straightConnectorEl() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "hw-hc-review-connect hw-hc-review-connect--straight");
    svg.setAttribute("viewBox", "0 0 28 16");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "5");
    line.setAttribute("y1", "12");
    line.setAttribute("x2", "23");
    line.setAttribute("y2", "3");
    line.setAttribute("stroke", "currentColor");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);
    return svg;
  }

  function createJdAuthorLabel() {
    const el = document.createElement("div");
    el.className = "hw-hc-memo__jd-label";
    el.textContent = "JD:";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function buildStudentTeacherReplyBody(comment) {
    /* Student view: same green JD memo, playback + text only (no record/erase). */
    const body = document.createElement("div");
    body.className =
      "hw-hc-memo__body hw-hc-memo__body--teacher-reply hw-hc-memo__body--student-reviewed";
    body.appendChild(createJdAuthorLabel());

    if (comment.teacherRemarkMedia?.id) {
      const mediaMount = document.createElement("div");
      mediaMount.className =
        "hw-hc-memo__remark-media-mount hw-hc-memo__remark-media-mount--compact";
      body.appendChild(mediaMount);
      global.HwReviewMedia?.renderPlayback?.(mediaMount, comment.teacherRemarkMedia);
    }

    const remark = document.createElement("textarea");
    remark.className = "hw-hc-memo__remark hw-hc-memo__remark--review-auto";
    remark.rows = 1;
    remark.readOnly = true;
    remark.value = comment.teacherRemark || "";
    remark.placeholder = comment.teacherRemarkMedia?.id
      ? "JD left an audio/video reply above."
      : "JD’s note";
    remark.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    remark.addEventListener("click", (ev) => ev.stopPropagation());
    body.appendChild(remark);
    autosizeReviewMemoInput(remark);

    /* Absolute top-right on body — not in actions (avoids top-left / flow regressions) */
    attachMemoCloseBtn(
      body,
      () => minimizeTeacherReviewReply(comment.id),
      "hw-hc-memo__close--teacher",
      "Close JD memo"
    );
    return body;
  }

  function buildTeacherReplyBody(comment) {
    if (config?.studentReviewed) return buildStudentTeacherReplyBody(comment);

    /* Media above text in JD memo */
    const body = document.createElement("div");
    body.className = "hw-hc-memo__body hw-hc-memo__body--teacher-reply";
    body.appendChild(createJdAuthorLabel());

    const mediaMount = document.createElement("div");
    mediaMount.className = "hw-hc-memo__remark-media-mount hw-hc-memo__remark-media-mount--compact";
    body.appendChild(mediaMount);

    const remark = document.createElement("textarea");
    remark.className = "hw-hc-memo__remark hw-hc-memo__remark--review-auto";
    remark.rows = 1;
    remark.maxLength = 2000;
    remark.placeholder = "Write a note on this question for the student…";
    remark.value = comment.teacherRemark || "";
    remark.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    remark.addEventListener("click", (ev) => ev.stopPropagation());
    remark.addEventListener("input", () => {
      updateTeacherRemark(comment.id, remark.value);
      autosizeReviewMemoInput(remark);
    });
    body.appendChild(remark);
    autosizeReviewMemoInput(remark);

    attachMemoCloseBtn(
      body,
      () => minimizeTeacherReviewReply(comment.id),
      "hw-hc-memo__close--teacher",
      "Close JD memo"
    );

    const actions = document.createElement("div");
    actions.className = "hw-hc-memo__actions hw-hc-memo__actions--review hw-hc-memo__actions--teacher-reply";

    const trashBtn = document.createElement("button");
    trashBtn.type = "button";
    trashBtn.className = "hw-hc-review-media-btn hw-hc-review-media-btn--trash";
    trashBtn.setAttribute("aria-label", "Erase recording");
    trashBtn.textContent = "\uD83D\uDDD1\uFE0F";
    trashBtn.addEventListener("pointerdown", (ev) => ev.stopPropagation());

    const audioBtn = document.createElement("button");
    audioBtn.type = "button";
    audioBtn.className = "hw-hc-review-media-btn hw-hc-review-media-btn--audio";
    audioBtn.setAttribute("aria-label", "Record audio reply");
    audioBtn.textContent = "\u266A";
    audioBtn.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    audioBtn.addEventListener("click", (ev) => ev.stopPropagation());

    const videoBtn = document.createElement("button");
    videoBtn.type = "button";
    videoBtn.className = "hw-hc-review-media-btn hw-hc-review-media-btn--video";
    videoBtn.setAttribute("aria-label", "Record video reply");
    videoBtn.textContent = "\uD83D\uDCF8";
    videoBtn.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    videoBtn.addEventListener("click", (ev) => ev.stopPropagation());

    actions.appendChild(trashBtn);
    actions.appendChild(audioBtn);
    actions.appendChild(videoBtn);
    body.appendChild(actions);

    let mediaApi = null;
    function syncTrashState() {
      const has = !!mediaApi?.hasRecording?.();
      trashBtn.disabled = !has;
      trashBtn.classList.toggle("is-disabled", !has);
    }

    global.HwReviewMedia?.mountRemarkRecorder?.(mediaMount, {
      teacherUsername: config?.teacherUsername || "",
      existing: comment.teacherRemarkMedia,
      onChange: (media) => {
        updateTeacherRemarkMedia(comment.id, media);
        syncTrashState();
      },
      compactToolbar: true,
      audioBtn,
      videoBtn,
      confirmErase: openRecordingEraseConfirm,
      onReady: (api) => {
        mediaApi = api;
        syncTrashState();
      },
    });

    trashBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!mediaApi?.hasRecording?.()) return;
      openRecordingEraseConfirm(trashBtn, () => {
        mediaApi.resetAll?.();
        if (comment.teacherRemarkMedia?.id) updateTeacherRemarkMedia(comment.id, null);
        syncTrashState();
      });
    });

    const trashObserver = new MutationObserver(() => syncTrashState());
    trashObserver.observe(mediaMount, { childList: true, subtree: true, attributes: true });
    requestAnimationFrame(syncTrashState);

    return body;
  }

  function buildReviewStudentMemo(comment, pair) {
    const wrap = document.createElement("div");
    wrap.className = "hw-hc-memo hw-hc-memo--expanded hw-hc-memo--review-student";
    wrap.dataset.id = comment.id;

    const body = document.createElement("div");
    body.className = "hw-hc-memo__body";

    const input = document.createElement("textarea");
    input.className = "hw-hc-memo__input hw-hc-memo__input--review-auto";
    input.rows = 1;
    input.maxLength = 500;
    input.readOnly = true;
    input.placeholder = "Write a note...JD will see it later!";
    input.value = comment.text || "";
    input.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    input.addEventListener("click", (ev) => ev.stopPropagation());
    body.appendChild(input);
    autosizeReviewMemoInput(input);

    const actions = document.createElement("div");
    actions.className = "hw-hc-memo__actions hw-hc-memo__actions--review";

    actions.appendChild(
      attachMemoCloseBtn(
        body,
        () => minimizeStudentReviewMemo(comment.id),
        "hw-hc-memo__close--inline",
        "Minimize student memo"
      )
    );

    if (!isTeacherReplyOpen(comment) && (config?.teacherReview || hasTeacherReply(comment))) {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "hw-hc-review-comment-btn hw-hc-review-comment-btn--arrow";
      openBtn.setAttribute("aria-label", "Open JD note");
      openBtn.innerHTML = rightArrowIconSvg();
      openBtn.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      openBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openTeacherReply(comment.id);
      });
      actions.appendChild(openBtn);
    }

    body.appendChild(actions);

    /* Memo + mini clouds are draggable; positions save to draft until submit. */
    if (pair && studentCloudsDraggable()) attachMemoDragHandles(body, comment.id, pair);

    body.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    body.addEventListener("click", (ev) => ev.stopPropagation());
    wrap.append(body);
    return wrap;
  }

  function renderReviewPair(comment) {
    if (!comment.anchorRect) return null;
    if (reviewStudentMinimizedIds.has(comment.id)) return null;

    const pair = document.createElement("div");
    pair.className = "hw-hc-review-pair";
    pair.dataset.id = comment.id;
    applyCloudPos(pair, comment, "mini");
    pair.setAttribute("role", "group");
    pair.setAttribute(
      "aria-label",
      "Student memo on “" + (comment.anchor || "worksheet") + "”"
    );

    const stack = document.createElement("div");
    stack.className = "hw-hc-review-pair__anchor";

    const studentSlot = document.createElement("div");
    studentSlot.className = "hw-hc-review-pair__student";
    studentSlot.appendChild(buildReviewStudentMemo(comment, pair));
    stack.appendChild(studentSlot);

    if (isTeacherReplyOpen(comment)) {
      stack.appendChild(straightConnectorEl());
      const teacherSlot = document.createElement("div");
      teacherSlot.className = "hw-hc-review-pair__teacher";
      const teacherMemo = document.createElement("div");
      teacherMemo.className =
        "hw-hc-memo hw-hc-memo--expanded hw-hc-memo--teacher hw-hc-memo--review-teacher";
      const teacherBody = buildTeacherReplyBody(comment);
      if (teacherNotesDraggable()) {
        attachMemoDragHandles(teacherBody, comment.id, pair);
      }
      teacherMemo.appendChild(teacherBody);
      teacherSlot.appendChild(teacherMemo);
      stack.appendChild(teacherSlot);
    }

    pair.appendChild(stack);
    pair.addEventListener("click", (ev) => ev.stopPropagation());
    return pair;
  }

  function renderReviewAnchorHighlight(comment) {
    if (!isPairReviewMode() || comment.author === "teacher" || !comment.anchorRect) return null;
    if (reviewStudentMinimizedIds.has(comment.id)) return null;
    const anchorRect = resolveHighlightAnchorRect(comment);
    if (!anchorRect) return null;
    const el = document.createElement("div");
    el.className = "hw-hc-anchor-highlight";
    el.dataset.id = comment.id;
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, pctRectToStyle(anchorRect));
    return el;
  }

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

  /** In-flow toolbar lives inside the tool host — keep Cloud clear of its hit box. */
  function toolbarBottomClearance() {
    const root = document.documentElement;
    if (
      !root.classList.contains("hw-ws-toolbar") &&
      !root.classList.contains("hw-hub-v5-toolbar-embed")
    ) {
      return 0;
    }
    const bar = document.getElementById("hw-toolbar-bar");
    if (!bar || bar.hidden || !hostEl || !hostEl.contains(bar)) return 0;
    return Math.max(72, bar.offsetHeight || 0) + 16;
  }

  function launcherSnapPoints() {
    const pad = 12;
    const broomLane = 76;
    const w = hostEl?.clientWidth || 520;
    const h = hostEl?.clientHeight || 480;
    const half = 36;
    const cloudLeft = broomLane + half;
    const midY = h * 0.5;
    const bottomY = Math.max(pad + half, h - pad - half - toolbarBottomClearance());
    return {
      tl: { x: cloudLeft, y: pad + half },
      tc: { x: w * 0.5, y: pad + half },
      tr: { x: w - pad - half, y: pad + half },
      ml: { x: cloudLeft, y: midY },
      mr: { x: w - pad - half, y: midY },
      bl: { x: cloudLeft, y: bottomY },
      bc: { x: w * 0.5, y: bottomY },
      br: { x: w - pad - half, y: bottomY },
    };
  }

  /**
   * Horizontal clamp in host-local coords. Parked: desktop used to widen out into
   * the viewport gutters; every pointer type now stays inside the host, like mobile
   * (same parking as the magnifying glass).
   */
  function launcherHorizontalClampRange(half, pad) {
    const w = hostEl?.clientWidth || 0;
    return { minX: half + pad, maxX: w - half - pad };
  }

  function clampLauncherLocal(x, y) {
    const pad = 8;
    const half = 36;
    const h = hostEl?.clientHeight || 0;
    const bottomClear = toolbarBottomClearance();
    const { minX, maxX } = launcherHorizontalClampRange(half, pad);
    return {
      x: Math.max(minX, Math.min(x, maxX)),
      y: Math.max(half + pad, Math.min(y, h - half - pad - bottomClear)),
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

  function launcherStorageKey() {
    return config?.launcherStorageKey || LAUNCHER_POS_KEY;
  }

  function usesModeNeutrals() {
    return !!config?.useModeNeutrals;
  }

  function positionModeKey() {
    return document.body.classList.contains("hw-hw-focus-mode") ? "focus" : "normal";
  }

  function readLauncherStore() {
    try {
      const raw = localStorage.getItem(launcherStorageKey());
      if (!raw) return {};
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return {};
      if (data.normal || data.focus) return data;
      return { legacy: data };
    } catch (_) {
      return {};
    }
  }

  function slotFromLauncherStore(all, mode) {
    if (all && all[mode]) return all[mode];
    if (all?.legacy && mode === "focus") return all.legacy;
    return null;
  }

  function saveLauncherPosition() {
    try {
      if (usesModeNeutrals()) {
        const mode = positionModeKey();
        const all = readLauncherStore();
        delete all.legacy;
        if (launcherSnapId) all[mode] = { snap: launcherSnapId };
        else all[mode] = { x: launcherPosition.x, y: launcherPosition.y };
        localStorage.setItem(launcherStorageKey(), JSON.stringify(all));
        return;
      }
      if (launcherSnapId) {
        localStorage.setItem(launcherStorageKey(), JSON.stringify({ snap: launcherSnapId }));
      } else {
        localStorage.setItem(
          launcherStorageKey(),
          JSON.stringify({ x: launcherPosition.x, y: launcherPosition.y })
        );
      }
    } catch (_) {}
  }

  function resolveAttachDefaultLauncher() {
    if (config?.useModeNeutrals) {
      const n = global.HwWorksheetToolLayout?.getModeNeutrals?.(hostEl);
      if (
        n?.launcher &&
        typeof n.launcher.x === "number" &&
        typeof n.launcher.y === "number"
      ) {
        return { x: n.launcher.x, y: n.launcher.y };
      }
    }
    const p = config?.defaultLauncher;
    if (p && typeof p.x === "number" && typeof p.y === "number") return { x: p.x, y: p.y };
    return null;
  }

  function applyLauncherSlot(slot) {
    if (!slot) return false;
    if (slot.snap && LAUNCHER_SNAP_IDS.includes(slot.snap)) {
      launcherSnapId = slot.snap;
      return true;
    }
    if (typeof slot.x === "number" && typeof slot.y === "number") {
      launcherSnapId = null;
      launcherPosition = { x: slot.x, y: slot.y };
      return true;
    }
    return false;
  }

  function loadLauncherPosition() {
    launcherSnapId = null;
    if (config?.defaultSnap && LAUNCHER_SNAP_IDS.includes(config.defaultSnap)) {
      launcherSnapId = config.defaultSnap;
      launcherPosition = launcherSnapPoints()[config.defaultSnap] || launcherSnapPoints().tl;
    } else {
      const attach = resolveAttachDefaultLauncher();
      if (attach) {
        launcherPosition = { x: attach.x, y: attach.y };
      } else {
        launcherSnapId = "tl";
        launcherPosition = launcherSnapPoints().tl;
      }
    }
    try {
      if (usesModeNeutrals()) {
        const slot = slotFromLauncherStore(readLauncherStore(), positionModeKey());
        applyLauncherSlot(slot);
        return;
      }
      const raw = JSON.parse(localStorage.getItem(launcherStorageKey()) || "null");
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

  function getModePositionTarget() {
    const def = resolveAttachDefaultLauncher();
    if (!usesModeNeutrals()) {
      return def || { x: launcherPosition.x, y: launcherPosition.y };
    }
    const slot = slotFromLauncherStore(readLauncherStore(), positionModeKey());
    if (slot && typeof slot.x === "number" && typeof slot.y === "number") {
      return { x: slot.x, y: slot.y };
    }
    return def || { x: 0, y: 579 };
  }

  function hasSavedModePosition() {
    if (!usesModeNeutrals()) {
      try {
        return !!localStorage.getItem(launcherStorageKey());
      } catch (_) {
        return false;
      }
    }
    return !!slotFromLauncherStore(readLauncherStore(), positionModeKey());
  }

  function syncModePosition() {
    if (!launcherEl || !hostEl) return null;
    loadLauncherPosition();
    applyLauncherPosition();
    return { x: launcherPosition.x, y: launcherPosition.y, snap: launcherSnapId };
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

  function pctDim(n) {
    return Math.min(100, Math.max(0, n));
  }

  function hostRectToPct(rect, options) {
    if (!hostEl) return null;
    const hostRect = hostEl.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height || !rect.width) return null;
    const toPos = options?.exact ? pctDim : pctClamp;
    return {
      left: toPos(((rect.left - hostRect.left) / hostRect.width) * 100),
      top: toPos(((rect.top - hostRect.top) / hostRect.height) * 100),
      right: toPos(((rect.right - hostRect.left) / hostRect.width) * 100),
      bottom: toPos(((rect.bottom - hostRect.top) / hostRect.height) * 100),
      width: pctDim((rect.width / hostRect.width) * 100),
      height: pctDim((rect.height / hostRect.height) * 100),
    };
  }

  /** Symmetric inset around native Range client-rect union (browser selection bounds). */
  function padHighlightRect(rect, pad) {
    const p = pad == null ? 1 : pad;
    return {
      left: rect.left - p,
      top: rect.top - p,
      right: rect.right + p,
      bottom: rect.bottom + p,
      width: rect.width + p * 2,
      height: rect.height + p * 2,
    };
  }

  function anchorRectFromRange(range) {
    const rect = rangeRectUnion(range);
    if (!rect) return null;
    return padHighlightRect(rect, 1);
  }

  function rangeRectUnion(range) {
    const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) {
      const r = range.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    }
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    rects.forEach((r) => {
      x1 = Math.min(x1, r.left);
      y1 = Math.min(y1, r.top);
      x2 = Math.max(x2, r.right);
      y2 = Math.max(y2, r.bottom);
    });
    return { left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1 };
  }

  function rangeForSubstring(root, needle) {
    if (!root || !needle) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let full = "";
    const chunks = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.nodeValue) continue;
      if (node.parentElement?.closest("[hidden]")) continue;
      chunks.push({ node, start: full.length, text: node.nodeValue });
      full += node.nodeValue;
    }
    const idx = full.indexOf(needle);
    if (idx < 0) return null;
    const endIdx = idx + needle.length;
    let startNode = null;
    let startOff = 0;
    let endNode = null;
    let endOff = 0;
    for (const chunk of chunks) {
      const chunkEnd = chunk.start + chunk.text.length;
      if (!startNode && idx >= chunk.start && idx < chunkEnd) {
        startNode = chunk.node;
        startOff = idx - chunk.start;
      }
      if (endIdx > chunk.start && endIdx <= chunkEnd) {
        endNode = chunk.node;
        endOff = endIdx - chunk.start;
        break;
      }
    }
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    try {
      range.setStart(startNode, startOff);
      range.setEnd(endNode, endOff);
      return range;
    } catch (_) {
      return null;
    }
  }

  function anchorSearchRoots() {
    const roots = [];
    const lines = worksheetFormEl?.querySelectorAll(".hw-worksheet__line:not([hidden])");
    /* Prefer tight text nodes (slot-text, fixed) before whole-sentence roots. */
    const selector =
      ".hw-star-block__slot-text, .hw-star-block__fixed, .hw-star-block__prefix, .hw-star-block__suffix, .hw-star-block__sentence, .hw-translation-block__japanese, .hw-worksheet__content";
    if (lines?.length) {
      lines.forEach((line) => {
        line.querySelectorAll(selector).forEach((el) => {
          if (!el.closest("[hidden]")) roots.push(el);
        });
      });
    } else if (hostEl) {
      hostEl.querySelectorAll(selector).forEach((el) => {
        if (!el.closest("[hidden]")) roots.push(el);
      });
    }
    return roots;
  }

  function findAnchorRangeInHost(anchorText) {
    const needle = String(anchorText || "").trim();
    if (!needle || !hostEl) return null;
    for (const root of anchorSearchRoots()) {
      const range = rangeForSubstring(root, needle);
      if (range) return range;
    }
    return null;
  }

  function findAnchorRectInHost(anchorText) {
    const range = findAnchorRangeInHost(anchorText);
    if (!range) return null;
    const rect = anchorRectFromRange(range);
    if (!rect?.width) return null;
    return hostRectToPct(rect, { exact: true });
  }

  /** Memo / bubble layout — pair review keeps student-saved pct rect. */
  function resolveCommentAnchorRect(comment) {
    if (!comment) return null;
    if (isPairReviewMode() && comment.anchorRect) {
      return comment.anchorRect;
    }
    const live = comment.anchor ? findAnchorRectInHost(comment.anchor) : null;
    return live || comment.anchorRect || null;
  }

  /** Live blue highlight — always prefer native Range client rects when host is visible. */
  function resolveHighlightAnchorRect(comment) {
    if (!comment) return null;
    if (comment.anchor && hostEl && hostIsVisible(hostEl)) {
      const live = findAnchorRectInHost(comment.anchor);
      if (live) return live;
    }
    return comment.anchorRect || null;
  }

  function reviewCloudPos(comment) {
    const anchorRect = resolveCommentAnchorRect(comment);
    return defaultCloudPos({ ...comment, anchorRect });
  }

  function hasCustomCloudPos(comment) {
    return typeof comment.x === "number" && typeof comment.y === "number";
  }

  /** Anchor-derived pos in pair review; stored x/y when the mini/memo was dragged. */
  function resolveCloudPos(comment, mode) {
    if (hasCustomCloudPos(comment)) {
      return { x: comment.x, y: comment.y };
    }
    if (isPairReviewMode() && comment.author !== "teacher") {
      return reviewCloudPos(comment);
    }
    return getCloudPos(comment, mode);
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
    const pos = resolveCloudPos(comment, mode);
    el.style.left = pos.x + "%";
    el.style.top = pos.y + "%";
  }

  /** Student tip positions move until submit; then they stay baked. */
  function studentCloudsDraggable() {
    return !config?.readOnly && !config?.studentReviewed && !config?.positionsFrozen;
  }

  /** Write current tip spots into x/y so submit keeps them. */
  function bakeCloudPositions() {
    const now = new Date().toISOString();
    comments = comments.map((c) => {
      if (typeof c.x === "number" && typeof c.y === "number") return c;
      const pos = defaultCloudPos(c);
      return { ...c, x: pos.x, y: pos.y, updatedAt: now };
    });
  }

  function updateCloudPos(id, x, y, persist) {
    if (persist === undefined) persist = true;
    if (persist && (config?.positionsFrozen || (config?.readOnly && !config?.teacherReview))) {
      /* Submitted / frozen tips stay put — ignore layout nudges that ask to persist. */
      return;
    }
    const now = new Date().toISOString();
    comments = comments.map((c) =>
      c.id === id ? { ...c, x: pctClamp(x), y: pctClamp(y), updatedAt: now } : c
    );
    if (persist && config?.studentReviewed) {
      /* Session-only positions while viewing JD notes — do not write drafts. */
    } else if (persist && !config?.teacherReview) {
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
        if (remarkMediaRaw === null) {
          teacherRemarkMedia = null;
        } else if (remarkMediaRaw && typeof remarkMediaRaw === "object" && remarkMediaRaw.id) {
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
          /** Started from a saved reply rather than typed for this student. */
          bankPrefill: c.bankPrefill === true || undefined,
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
      void global.HwMgLexicon?.ensureLoaded?.()?.catch?.(() => {});
      bindWordPreview();
    } else {
      cancelTouchSelect();
      hideSelectionMenu();
      clearWordPreview();
      unbindWordPreview();
      previewPointerDown = null;
      window.getSelection()?.removeAllRanges();
    }
    try {
      document.dispatchEvent(
        new CustomEvent("hw-tool-arm-change", { detail: { tool: "cloud", armed } })
      );
    } catch {
      /* ignore */
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
        } else if (!config?.studentReviewed) {
          removeComment(id);
          return;
        }
      }
      if (config?.studentReviewed && comment?.author === "teacher") {
        minimizeTeacherStandalone(id);
        return;
      }
    }
    activeCommentId = null;
    renderAll();
  }

  function expandComment(id) {
    if (armed) setArmed(false);
    if (config?.studentReviewed) reviewTeacherMinimizedIds.delete(id);
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

  /** Deep-link helper for flashcard → full sheet (memo pair or teacher note). */
  function focusComment(id) {
    if (!id) return false;
    const comment = comments.find((c) => c.id === id);
    if (!comment) return false;
    if (isPairReviewMode() && comment.author !== "teacher") {
      expandReviewPair(id);
      return true;
    }
    expandComment(id);
    return true;
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
    if (usesModeNeutrals() && !target) {
      try {
        const mode = positionModeKey();
        const all = readLauncherStore();
        delete all[mode];
        delete all.legacy;
        if (all.normal || all.focus) {
          localStorage.setItem(launcherStorageKey(), JSON.stringify(all));
        } else {
          localStorage.removeItem(launcherStorageKey());
        }
      } catch (_) {}
      const attach = resolveAttachDefaultLauncher();
      if (attach) {
        setLauncherPositionLocal(attach.x, attach.y, false);
        return;
      }
      setLauncherSnap("tl");
      return;
    }
    try {
      localStorage.removeItem(launcherStorageKey());
    } catch (_) {}
    if (target?.snap && LAUNCHER_SNAP_IDS.includes(target.snap)) {
      setLauncherSnap(target.snap);
      return;
    }
    if (target && typeof target.x === "number" && typeof target.y === "number") {
      setLauncherPositionLocal(target.x, target.y, false);
      return;
    }
    if (config?.defaultSnap && LAUNCHER_SNAP_IDS.includes(config.defaultSnap)) {
      launcherSnapId = config.defaultSnap;
      applyLauncherPosition();
      return;
    }
    const attach = resolveAttachDefaultLauncher();
    if (attach) {
      setLauncherPositionLocal(attach.x, attach.y, false);
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
              : null,
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
      confirmErase: openRecordingEraseConfirm,
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
    teacherReplyOpenIds.delete(id);
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

  function shellClientScale() {
    if (!shellEl) return { x: 1, y: 1 };
    const r = shellEl.getBoundingClientRect();
    const w = shellEl.offsetWidth || r.width || 1;
    const h = shellEl.offsetHeight || r.height || 1;
    return {
      x: r.width / w || 1,
      y: r.height / h || 1,
    };
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
      const near = rect.left <= prev.right + gapX && prev.left <= rect.right + gapX;
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

  function isSanePreviewUnit(unit) {
    if (!unit?.surface || unit.end <= unit.start) return false;
    if (unit.end - unit.start > PREVIEW_MAX_CHARS) return false;
    if (/[。．！？!?\n\r]/.test(unit.surface)) return false;
    if (global.HwMgLexicon?.isSkipped?.(unit.surface) === true) return false;
    return true;
  }

  function previewTextContainerFor(el, clientX, clientY) {
    const chip = el?.closest?.(".hw-star-block__chip:not(.hw-star-block__chip--placed)");
    if (chip) return chip;
    const slotText = el?.closest?.(".hw-star-block__slot-text");
    if (slotText) return slotText;
    const fixed = el?.closest?.(".hw-star-block__fixed");
    if (fixed) return fixed;
    if (clientX != null && clientY != null && el?.closest?.(".hw-star-block__sentence")) {
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
    return el?.closest?.(PREVIEW_TEXT_SELECTOR) || null;
  }

  function previewTargetFromPoint(clientX, clientY) {
    const stack =
      typeof document.elementsFromPoint === "function"
        ? document.elementsFromPoint(clientX, clientY)
        : [document.elementFromPoint(clientX, clientY)];
    for (const el of stack) {
      if (!(el instanceof Element) || !hostEl?.contains(el)) continue;
      if (el.closest(SKIP_SELECTOR + TOUCH_SKIP_EXTRA)) continue;
      if (el.closest(".hw-hc-hover-highlight")) continue;
      if (previewTextContainerFor(el, clientX, clientY)) return el;
    }
    return null;
  }

  function caretOffsetNearPointer(container, clientX, clientY, maxPx) {
    const range = caretRangeFromPoint(clientX, clientY);
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

  function caretOffsetForPreview(container, clientX, clientY) {
    const caret = caretOffsetNearPointer(container, clientX, clientY, PREVIEW_POINTER_MAX_PX);
    if (caret >= 0) return caret;
    if (container?.closest?.(".hw-star-block__chip, .hw-star-block__slot-text, .hw-star-block__fixed")) {
      return caretOffsetFromStarRect(container, clientX, clientY);
    }
    return -1;
  }

  function lexiconUnitRangeAt(container, clientX, clientY) {
    if (!container) return null;
    const text = flatContainerText(container);
    if (!text.trim()) return null;
    const offset = caretOffsetForPreview(container, clientX, clientY);
    if (offset < 0) return null;

    const forced = global.HwMgLexicon?.pickForceUnit?.(text, offset);
    if (forced && isSanePreviewUnit(forced)) {
      const range = rangeFromOffsets(container, forced.start, forced.end);
      if (range && pointerNearRange(clientX, clientY, range, PREVIEW_POINTER_MAX_PX + 6)) {
        return { range, surface: forced.surface, start: forced.start, end: forced.end };
      }
    }

    const unit = global.HwMgLexicon?.pickQuickUnit?.(text, offset);
    if (!unit || !isSanePreviewUnit(unit)) return null;
    const range = rangeFromOffsets(container, unit.start, unit.end);
    if (!range || !pointerNearRange(clientX, clientY, range, PREVIEW_POINTER_MAX_PX + 6)) return null;
    return { range, surface: unit.surface, start: unit.start, end: unit.end };
  }

  function clearWordPreview() {
    pendingPreviewPoint = null;
    wordPreview = null;
    if (wordPreviewRaf) {
      cancelAnimationFrame(wordPreviewRaf);
      wordPreviewRaf = null;
    }
    wordPreviewEl?.remove();
    wordPreviewEl = null;
  }

  function renderWordPreview(range) {
    if (!shellEl || !hostEl || !range) {
      clearWordPreview();
      return;
    }

    const shellRect = shellEl.getBoundingClientRect();
    const scale = shellClientScale();
    if (!wordPreviewEl) {
      wordPreviewEl = document.createElement("div");
      wordPreviewEl.className = "hw-hc-hover-highlight";
      wordPreviewEl.setAttribute("aria-hidden", "true");
      shellEl.appendChild(wordPreviewEl);
    }

    wordPreviewEl.replaceChildren();
    const rects = mergeClientRects(Array.from(range.getClientRects()));
    for (const rect of rects) {
      if (!rect.width || !rect.height) continue;
      const box = document.createElement("span");
      box.className = "hw-hc-hover-highlight__rect";
      box.style.left = (rect.left - shellRect.left) / scale.x + "px";
      box.style.top = (rect.top - shellRect.top) / scale.y + "px";
      box.style.width = rect.width / scale.x + "px";
      box.style.height = rect.height / scale.y + "px";
      wordPreviewEl.appendChild(box);
    }

    if (!wordPreviewEl.childElementCount) {
      clearWordPreview();
    }
  }

  async function refreshWordPreview(clientX, clientY) {
    if (!armed || config?.readOnly || !hostEl) {
      clearWordPreview();
      return;
    }
    if (touchSelect?.active) {
      clearWordPreview();
      return;
    }

    const seq = ++wordPreviewSeq;
    const target = previewTargetFromPoint(clientX, clientY);
    if (!target) {
      clearWordPreview();
      return;
    }

    await global.HwMgLexicon?.ensureLoaded?.()?.catch?.(() => {});
    if (seq !== wordPreviewSeq) return;

    const container = previewTextContainerFor(target, clientX, clientY);
    const hit = lexiconUnitRangeAt(container, clientX, clientY);
    if (!hit || seq !== wordPreviewSeq) {
      if (seq === wordPreviewSeq) clearWordPreview();
      return;
    }

    wordPreview = {
      range: hit.range,
      surface: hit.surface,
      x: clientX,
      y: clientY,
    };
    renderWordPreview(hit.range);
  }

  function scheduleWordPreview(clientX, clientY) {
    if (!armed || config?.readOnly) {
      clearWordPreview();
      return;
    }
    pendingPreviewPoint = { x: clientX, y: clientY };
    if (wordPreviewRaf) return;
    wordPreviewRaf = requestAnimationFrame(() => {
      wordPreviewRaf = null;
      const point = pendingPreviewPoint;
      if (!point) return;
      void refreshWordPreview(point.x, point.y);
    });
  }

  function selectPreviewRange(range) {
    if (!range) return false;
    const sel = window.getSelection();
    if (!sel) return false;
    try {
      const next = range.cloneRange();
      sel.removeAllRanges();
      sel.addRange(next);
    } catch (_) {
      return false;
    }
    return !sel.isCollapsed && sel.toString().trim().length > 0;
  }

  /** Commit path helper: turn the soft preview into a real selection (does not auto-expand). */
  function adoptWordPreviewSelection(clientX, clientY) {
    let hit = wordPreview;
    if ((!hit?.range || !hit.surface) && clientX != null && clientY != null) {
      const target = previewTargetFromPoint(clientX, clientY);
      const container = previewTextContainerFor(target, clientX, clientY);
      hit = lexiconUnitRangeAt(container, clientX, clientY);
    }
    if (!hit?.range || !isSanePreviewUnit({
      surface: hit.surface,
      start: hit.start ?? 0,
      end: hit.end ?? (hit.surface ? hit.surface.length : 0),
    })) {
      return false;
    }
    if (!selectPreviewRange(hit.range)) {
      if (clientX == null || clientY == null) return false;
      const target = previewTargetFromPoint(clientX, clientY);
      const fresh = lexiconUnitRangeAt(previewTextContainerFor(target, clientX, clientY), clientX, clientY);
      if (!fresh || !selectPreviewRange(fresh.range)) return false;
    }
    return !!getHostSelection();
  }

  function pointerMovedBeyond(start, clientX, clientY, threshold) {
    if (!start) return false;
    return Math.hypot(clientX - start.x, clientY - start.y) > threshold;
  }

  function onWordPreviewPointerMove(ev) {
    if (!armed || config?.readOnly) return;
    if (ev.buttons === 1) {
      clearWordPreview();
      return;
    }
    if (touchSelect?.active) {
      clearWordPreview();
      return;
    }
    if (ev.target?.closest?.(SKIP_SELECTOR)) {
      clearWordPreview();
      return;
    }
    scheduleWordPreview(ev.clientX, ev.clientY);
  }

  function onWordPreviewPointerLeave() {
    if (touchSelect?.active) return;
    clearWordPreview();
  }

  function onWordPreviewPointerDown(ev) {
    if (!armed || config?.readOnly) return;
    if (ev.button != null && ev.button !== 0) return;
    if (shouldSkipTouchTarget(ev.target)) return;
    if (!hostEl?.contains(ev.target)) return;
    previewPointerDown = { x: ev.clientX, y: ev.clientY, pointerId: ev.pointerId };
    scheduleWordPreview(ev.clientX, ev.clientY);
  }

  function bindWordPreview() {
    if (wordPreviewBound || !hostEl) return;
    wordPreviewBound = true;
    hostEl.addEventListener("pointermove", onWordPreviewPointerMove);
    hostEl.addEventListener("pointerdown", onWordPreviewPointerDown);
    hostEl.addEventListener("pointerleave", onWordPreviewPointerLeave);
    hostEl.addEventListener("mouseleave", onWordPreviewPointerLeave);
  }

  function unbindWordPreview() {
    if (hostEl && wordPreviewBound) {
      hostEl.removeEventListener("pointermove", onWordPreviewPointerMove);
      hostEl.removeEventListener("pointerdown", onWordPreviewPointerDown);
      hostEl.removeEventListener("pointerleave", onWordPreviewPointerLeave);
      hostEl.removeEventListener("mouseleave", onWordPreviewPointerLeave);
    }
    wordPreviewBound = false;
    clearWordPreview();
  }

  function commitSelectionToMemo() {
    const picked = getHostSelection();
    if (!picked) return false;
    const rect = anchorRectFromRange(picked.range);
    const anchorRect = hostRectToPct(rect, { exact: true });
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
    /* Magnet parked — keep the handler, hide the menu entry. */
    if (global.HwFeatureFlags?.toolMagnet?.() !== true) {
      selMenuEl.querySelector('[data-action="reset-tools"]')?.remove();
    }
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
    clearWordPreview();
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
    scheduleWordPreview(ev.clientX, ev.clientY);

    touchSelect = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
      holdTimer: setTimeout(() => {
        if (!touchSelect || touchSelect.pointerId !== ev.pointerId) return;
        touchSelect.active = true;
        clearWordPreview();
        hostEl?.classList.add("hw-hc-touch-selecting");
        setSelectionBetweenPoints(ev.clientX, ev.clientY, ev.clientX, ev.clientY);
      }, TOUCH_HOLD_MS),
    };
    try {
      hostEl.setPointerCapture(touchSelect.pointerId);
    } catch (_) {}
  }

  function onTouchSelectPointerMove(ev) {
    if (!touchSelect || touchSelect.pointerId !== ev.pointerId) return;
    const dx = ev.clientX - touchSelect.startX;
    const dy = ev.clientY - touchSelect.startY;
    if (!touchSelect.active) {
      scheduleWordPreview(ev.clientX, ev.clientY);
      if (Math.hypot(dx, dy) > TOUCH_MOVE_CANCEL) cancelTouchSelect();
      return;
    }
    ev.preventDefault();
    clearWordPreview();
    setSelectionBetweenPoints(touchSelect.startX, touchSelect.startY, ev.clientX, ev.clientY);
  }

  function onTouchSelectPointerUp(ev) {
    if (!touchSelect || touchSelect.pointerId !== ev.pointerId) return;
    if (touchSelect.active) {
      ev.preventDefault();
      finishTouchSelect(ev.clientX, ev.clientY);
    } else if (armed && !config?.readOnly) {
      const start = touchSelect;
      cancelTouchSelect();
      /* Tap / light release: take the soft-previewed lexicon word (not a long drag). */
      if (
        !pointerMovedBeyond(start, ev.clientX, ev.clientY, PREVIEW_DRAG_PX) &&
        (adoptWordPreviewSelection(ev.clientX, ev.clientY) || offerStarUnitSelection(ev.target))
      ) {
        const picked = getHostSelection();
        clearWordPreview();
        if (picked) showSelectionMenu(picked.range.getBoundingClientRect());
      } else {
        clearWordPreview();
      }
    } else {
      cancelTouchSelect();
      clearWordPreview();
    }
    try {
      hostEl.releasePointerCapture(ev.pointerId);
    } catch (_) {}
  }

  function onTouchSelectPointerCancel(ev) {
    if (!touchSelect || touchSelect.pointerId !== ev.pointerId) return;
    cancelTouchSelect();
    clearWordPreview();
  }

  function onSelectionChange() {
    if (!armed || !isCoarsePointer() || touchSelect?.active) return;
    const picked = getHostSelection();
    if (picked) {
      clearWordPreview();
      showSelectionMenu(picked.range.getBoundingClientRect());
    }
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

    const down = previewPointerDown;
    previewPointerDown = null;
    const dragged = pointerMovedBeyond(down, ev.clientX, ev.clientY, PREVIEW_DRAG_PX);

    let picked = getHostSelection();

    /* Drag expanded a real selection — prefer the user's range over the soft preview. */
    if (picked && dragged) {
      clearWordPreview();
      commitSelectionToMemo();
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    /* Tap / click with little or no drag: adopt the soft-previewed lexicon word. */
    if (!dragged && adoptWordPreviewSelection(ev.clientX, ev.clientY)) {
      clearWordPreview();
      commitSelectionToMemo();
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    picked = getHostSelection();
    if (picked) {
      clearWordPreview();
      commitSelectionToMemo();
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    if (offerStarUnitSelection(ev.target)) {
      clearWordPreview();
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    clearWordPreview();
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
    if (isPairReviewMode()) {
      if (
        ev.target.closest(".hw-hc-review-pair") ||
        ev.target.closest(".hw-hc-review-mini-pair") ||
        ev.target.closest(".hw-hc-teacher-bar")
      ) {
        return;
      }
      if (!activeCommentId) return;
      const active = comments.find((c) => c.id === activeCommentId);
      if (active?.author !== "teacher") return;
    } else if (!activeCommentId) {
      return;
    }
    if (
      ev.target.closest(".hw-hc-memo") ||
      ev.target.closest(".hw-hc-mini") ||
      ev.target.closest(".hw-hc-launcher")
    ) {
      return;
    }
    minimizeActive();
  }

  function isMemoDragExcludedTarget(target) {
    if (!target || !target.closest) return true;
    const textField = target.closest("textarea, input, select");
    if (textField) {
      /* Readonly memo text can still start a drag; editable fields cannot. */
      if (textField.tagName === "TEXTAREA" && textField.readOnly) return false;
      if (textField.tagName === "INPUT" && textField.readOnly) return false;
      return true;
    }
    return !!(
      target.closest("button") ||
      target.closest("a") ||
      target.closest("label") ||
      target.closest(".hw-hc-review-comment-btn") ||
      target.closest(".hw-hc-memo__close") ||
      target.closest(".hw-hc-review-media-btn") ||
      target.closest(".hw-hc-memo__remove") ||
      target.closest(".hw-delete-confirm-popover") ||
      target.closest(".hw-audio-chrome") ||
      target.closest(".hw-video-chrome") ||
      target.closest(".hw-listen-card") ||
      target.closest(".hw-review-media") ||
      target.closest("video") ||
      target.closest("audio")
    );
  }

  function onCloudDragStart(ev, commentId, mode, el, handleEl) {
    if (ev.button !== 0) return;
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    if (comment.author === "teacher") {
      if (!(teacherNotesDraggable() && (!config?.readOnly || isPairReviewMode()))) return;
    } else if (!studentCloudsDraggable()) {
      return;
    }

    /* Mini tips are <button>s — memo exclusion would block all mini drag. */
    if (mode !== "mini" && isMemoDragExcludedTarget(ev.target)) return;

    ev.stopPropagation();

    const pos = resolveCloudPos(comment, mode);

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
      /* Persist tip spot right away so a quick submit still has the new place. */
      if (!config?.teacherReview && !config?.readOnly && !config?.positionsFrozen) {
        void flushDraftSave();
      }
      if (state.mode === "mini") suppressMiniClickUntil = Date.now() + 300;
      renderAll();
      if (state.mode === "memo") {
        const memo =
          layersEl?.querySelector('.hw-hc-memo[data-id="' + state.commentId + '"]') ||
          layersEl?.querySelector('.hw-hc-review-pair[data-id="' + state.commentId + '"]');
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

  function attachMemoDragHandles(bodyEl, commentId, moveEl) {
    bodyEl.classList.add("hw-hc-memo__body--draggable");
    bodyEl.title = bodyEl.title || "Drag to move";
    /* Whole memo surface is the grab area; interactive controls are excluded in onCloudDragStart. */
    bindCloudDrag(bodyEl, commentId, "memo", moveEl);

    const dragHandle = document.createElement("div");
    dragHandle.className = "hw-hc-memo__drag";
    dragHandle.title = "Drag to move";
    dragHandle.setAttribute("aria-hidden", "true");
    bodyEl.insertBefore(dragHandle, bodyEl.firstChild);
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
    const isMiniLegend = !!onboardEl?.classList.contains("hw-hc-onboard--mini-legend");
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
    if (options?.persist === false || isMiniLegend) return;
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

  function dismissMiniCloudOnboarding() {
    dismissOnboarding({ persist: false });
  }

  function getMiniCloudSpotlightTargets() {
    if (!shellEl) return [];
    return Array.from(
      shellEl.querySelectorAll(".hw-hc-review-mini-pair, .hw-hc-mini:not(.hw-hc-mini--in-pair)")
    );
  }

  function updateMiniOnboardScrimSpotlight() {
    if (!onboardScrimEl || !onboardEl) return;
    syncOnboardScrimViewport();
    const hole = onboardScrimEl.querySelector(".hw-hc-onboard-scrim__hole");
    if (!hole) return;
    const pad = 18;
    let spot = spotlightRect(onboardEl, pad);
    getMiniCloudSpotlightTargets().forEach((el) => {
      spot = mergeSpotlightRects(spot, spotlightRect(el, pad + 6));
    });
    if (!spot) return;
    const x = Math.max(0, spot.x);
    const y = Math.max(0, spot.y);
    const w = Math.min(window.innerWidth - x, spot.w);
    const h = Math.min(window.innerHeight - y, spot.h);
    hole.setAttribute("x", String(x));
    hole.setAttribute("y", String(y));
    hole.setAttribute("width", String(Math.max(0, w)));
    hole.setAttribute("height", String(Math.max(0, h)));
    hole.setAttribute("rx", "16");
    hole.setAttribute("ry", "16");
  }

  function placeMiniCloudOnboard() {
    if (!onboardEl || !hostEl) return;
    const cardW = Math.min(280, hostEl.clientWidth - 24);
    onboardEl.style.width = cardW + "px";
    const cardH = onboardEl.offsetHeight || 160;
    const hostRect = hostEl.getBoundingClientRect();
    const maxLeft = hostEl.clientWidth - cardW - 12;
    const maxTop = hostEl.clientHeight - cardH - 12;
    const tip = getMiniCloudSpotlightTargets()[0];
    let left;
    let top;
    if (tip) {
      const tipRect = tip.getBoundingClientRect();
      left = tipRect.left - hostRect.left + tipRect.width / 2 - cardW / 2;
      top = tipRect.bottom - hostRect.top + 14;
      if (top + cardH > hostEl.clientHeight - 12) {
        top = tipRect.top - hostRect.top - cardH - 14;
      }
      if (top < 12) {
        left = tipRect.right - hostRect.left + 12;
        top = tipRect.top - hostRect.top;
        if (left + cardW > hostEl.clientWidth - 12) {
          left = tipRect.left - hostRect.left - cardW - 12;
        }
      }
    } else {
      left = Math.max(12, (hostEl.clientWidth - cardW) / 2);
      top = Math.max(12, Math.min((hostEl.clientHeight - cardH) / 3, hostEl.clientHeight - cardH - 12));
    }
    left = Math.max(12, Math.min(left, maxLeft));
    top = Math.max(12, Math.min(top, maxTop));
    onboardEl.style.left = left + "px";
    onboardEl.style.top = top + "px";
    updateMiniOnboardScrimSpotlight();
  }

  function initMiniCloudOnboarding() {
    if (!config?.studentReviewed || !shellEl || !hostEl) return;
    if (!shouldShowMiniCloudOnboard()) return;
    if (onboardEl) return;
    if (!getMiniCloudSpotlightTargets().length) return;

    recordMiniCloudOnboardShow();

    onboardScrimEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    onboardScrimEl.classList.add("hw-hc-onboard-scrim");
    onboardScrimEl.setAttribute("aria-hidden", "true");
    const maskId = "hw-hc-mini-onboard-spotlight-" + Math.random().toString(36).slice(2, 9);
    onboardScrimEl.innerHTML =
      "<defs><mask id=\"" +
      maskId +
      "\"><rect x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" fill=\"white\"/>" +
      "<rect class=\"hw-hc-onboard-scrim__hole\" rx=\"16\" ry=\"16\" fill=\"black\"/></mask></defs>" +
      "<rect class=\"hw-hc-onboard-scrim__fill\" x=\"0\" y=\"0\" width=\"100%\" height=\"100%\" " +
      "fill=\"rgba(0,0,0,0.78)\" mask=\"url(#" +
      maskId +
      ")\"/>";
    onboardScrimEl.addEventListener("click", () => dismissMiniCloudOnboarding());
    document.body.appendChild(onboardScrimEl);

    const icon = cloudIconSvg("hw-hc-mini__icon");
    onboardEl = document.createElement("div");
    onboardEl.className = "hw-hc-onboard hw-hc-onboard--mini-legend";
    onboardEl.setAttribute("role", "dialog");
    onboardEl.setAttribute("aria-labelledby", "hw-hc-mini-onboard-title");
    onboardEl.innerHTML =
      '<div class="hw-hc-onboard__card">' +
      '<p class="hw-hc-onboard__eyebrow">Reviewed homework</p>' +
      '<h2 class="hw-hc-onboard__title" id="hw-hc-mini-onboard-title">Note clouds</h2>' +
      '<ul class="hw-hc-onboard__legend">' +
      '<li class="hw-hc-onboard__legend-item hw-hc-onboard__legend-item--student">' +
      '<span class="hw-hc-onboard__cloud-key" aria-hidden="true">' +
      icon +
      "</span> Your notes</li>" +
      '<li class="hw-hc-onboard__legend-item hw-hc-onboard__legend-item--teacher">' +
      '<span class="hw-hc-onboard__cloud-key hw-hc-onboard__cloud-key--teacher" aria-hidden="true">' +
      icon +
      "</span> JD\u2019s notes</li>" +
      "</ul>" +
      '<button type="button" class="btn btn--primary btn--sm hw-hc-onboard__btn">Got it</button>' +
      "</div>";

    onboardEl.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    onboardEl.addEventListener("click", (ev) => ev.stopPropagation());
    onboardEl.querySelector(".hw-hc-onboard__btn")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      dismissMiniCloudOnboarding();
    });

    shellEl.appendChild(onboardEl);
    hostEl.classList.add("hw-hc-onboarding");
    document.body.classList.add("hw-hc-onboarding-active");
    onboardScrimResizeBound = () => {
      placeMiniCloudOnboard();
      updateMiniOnboardScrimSpotlight();
    };
    window.addEventListener("resize", onboardScrimResizeBound);
    requestAnimationFrame(() => {
      placeMiniCloudOnboard();
      onboardScrimEl?.classList.add("is-visible");
      onboardEl?.classList.add("is-visible");
      requestAnimationFrame(updateMiniOnboardScrimSpotlight);
    });
  }

  function scheduleMiniCloudOnboarding() {
    if (!config?.studentReviewed) return;
    clearTimeout(onboardScheduleTimer);
    let attempts = 0;
    const tryStart = () => {
      if (!shellEl || !hostIsVisible(hostEl)) return;
      if (mgOnboardingBlocking()) {
        onboardScheduleTimer = setTimeout(tryStart, 400);
        return;
      }
      if (!getMiniCloudSpotlightTargets().length && attempts < 20) {
        attempts += 1;
        onboardScheduleTimer = setTimeout(tryStart, 300);
        return;
      }
      initMiniCloudOnboarding();
    };
    onboardScheduleTimer = setTimeout(tryStart, 450);
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
      resolveToolLayout(launcherEl);
    });
    launcherEl.addEventListener("pointerup", (ev) => {
      if (!launcherDrag || launcherDrag.pointerId !== ev.pointerId) return;
      launcherEl.classList.remove("is-dragging");
      if (launcherDrag.moved) {
        saveLauncherPosition();
        resolveToolLayout(launcherEl);
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
        resolveToolLayout(launcherEl);
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

  function renderReviewStudentMini(comment) {
    if (!reviewStudentMinimizedIds.has(comment.id) || !comment.anchorRect) return null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hw-hc-mini hw-hc-mini--review-student";
    btn.dataset.id = comment.id;
    btn.dataset.reviewMini = "student";
    btn.setAttribute(
      "aria-label",
      comment.text.trim()
        ? "Expand memos on “" + (comment.anchor || "worksheet") + "”"
        : "Expand student memo"
    );
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = cloudIconSvg("hw-hc-mini__icon");
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (Date.now() < suppressMiniClickUntil) return;
      expandReviewPair(comment.id);
    });
    return btn;
  }

  function renderReviewTeacherMini(comment) {
    if (!hasTeacherReply(comment) || isTeacherReplyOpen(comment)) return null;
    if (reviewStudentMinimizedIds.has(comment.id)) return null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "hw-hc-mini hw-hc-mini--teacher hw-hc-mini--has-remark hw-hc-mini--jd-reply hw-hc-mini--jd-attached";
    btn.dataset.id = comment.id;
    btn.dataset.reviewMini = "teacher";
    btn.setAttribute("aria-label", "Expand JD reply on “" + (comment.anchor || "worksheet") + "”");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = cloudIconSvg("hw-hc-mini__icon");
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (Date.now() < suppressMiniClickUntil) return;
      expandReviewPair(comment.id);
    });
    return btn;
  }

  /** Blue + green minis as one side-by-side unit at the student's saved tip. */
  function renderReviewMiniPair(comment) {
    if (!reviewStudentMinimizedIds.has(comment.id) || !comment.anchorRect) return null;
    /* Minimized pair means both memos are closed — keep open-ids consistent. */
    teacherReplyOpenIds.delete(comment.id);

    const wrap = document.createElement("div");
    wrap.className = "hw-hc-review-mini-pair";
    wrap.dataset.id = comment.id;
    applyCloudPos(wrap, comment, "mini");

    const studentMini = renderReviewStudentMini(comment);
    if (studentMini) {
      studentMini.classList.add("hw-hc-mini--in-pair");
      wrap.appendChild(studentMini);
    }

    if (hasTeacherReply(comment)) {
      const jdMini = document.createElement("button");
      jdMini.type = "button";
      jdMini.className =
        "hw-hc-mini hw-hc-mini--teacher hw-hc-mini--has-remark hw-hc-mini--jd-reply hw-hc-mini--in-pair";
      jdMini.dataset.id = comment.id;
      jdMini.dataset.reviewMini = "teacher";
      jdMini.setAttribute("aria-label", "Expand JD reply on “" + (comment.anchor || "worksheet") + "”");
      jdMini.setAttribute("aria-expanded", "false");
      jdMini.innerHTML = cloudIconSvg("hw-hc-mini__icon");
      jdMini.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (Date.now() < suppressMiniClickUntil) return;
        expandReviewPair(comment.id);
      });
      wrap.appendChild(jdMini);
    }

    return wrap;
  }

  function renderMini(comment) {
    if (isPairReviewMode() && comment.author !== "teacher") return null;
    if (comment.author === "teacher" && isTeacherStandaloneOpen(comment)) return null;
    if (activeCommentId === comment.id) return null;
    if (!comment.anchorRect && comment.author !== "teacher") return null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "hw-hc-mini" +
      (comment.author === "teacher" ? " hw-hc-mini--teacher" : "") +
      (comment.bankPrefill ? " hw-hc-mini--prefill" : "") +
      (comment.teacherRemark || comment.teacherRemarkMedia ? " hw-hc-mini--has-remark" : "");
    btn.dataset.id = comment.id;
    applyCloudPos(btn, comment, "mini");
    const label =
      comment.author === "teacher"
        ? comment.bankPrefill
          ? "Your saved reply for this question — open to edit"
          : comment.text.trim()
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
      if (config?.studentReviewed && comment.author === "teacher") {
        reviewTeacherMinimizedIds.delete(comment.id);
        activeCommentId = comment.id;
        renderAll();
        return;
      }
      expandComment(comment.id);
    });
    /* Standalone tips (incl. teacher/JD green) are free-draggable; paired review minis use renderReviewMiniPair.
       Student tips move until submit, then stay stuck. JD green tips: open only when reviewed. */
    const canDragMini =
      comment.author === "teacher"
        ? teacherNotesDraggable() && (!config?.readOnly || isPairReviewMode())
        : studentCloudsDraggable();
    if (canDragMini) {
      btn.classList.add("hw-hc-mini--draggable");
      btn.title = "Drag to move";
      bindCloudDrag(btn, comment.id, "mini");
    }
    return btn;
  }

  function renderAnchorHighlight(comment) {
    if (activeCommentId !== comment.id || !comment.anchorRect) return null;
    const anchorRect = resolveHighlightAnchorRect(comment);
    if (!anchorRect) return null;
    const el = document.createElement("div");
    el.className = "hw-hc-anchor-highlight";
    el.dataset.id = comment.id;
    el.setAttribute("aria-hidden", "true");
    Object.assign(el.style, pctRectToStyle(anchorRect));
    return el;
  }

  /**
   * Replies JD has already written for this question on other students' sheets.
   * Only worth showing once there is more than one to choose between — the newest
   * one is already sitting in the box.
   */
  function buildSavedReplyPicker(comment, input) {
    const slot = String(typeof comment.slideIndex === "number" ? comment.slideIndex : 0);
    const replies = (config?.answerBank || {})[slot];
    if (!Array.isArray(replies) || replies.length < 2) return null;

    const select = document.createElement("select");
    select.className = "hw-hc-memo__saved-replies";
    select.setAttribute("aria-label", "Replies you used before on this question");

    const head = document.createElement("option");
    head.value = "";
    head.textContent = "Saved replies…";
    select.appendChild(head);

    replies.forEach((reply, i) => {
      const text = String(reply?.text || "").trim();
      if (!text) return;
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = text.length > 64 ? text.slice(0, 61) + "…" : text;
      select.appendChild(opt);
    });
    if (select.options.length < 2) return null;

    select.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    select.addEventListener("click", (ev) => ev.stopPropagation());
    select.addEventListener("change", () => {
      const pick = replies[Number(select.value)];
      select.value = "";
      if (!pick?.text) return;
      input.value = pick.text;
      updateCommentText(comment.id, input.value);
      autosizeReviewMemoInput(input);
    });
    return select;
  }

  function renderMemo(comment) {
    if (isPairReviewMode() && comment.author !== "teacher") return null;
    const isTeacherNote = comment.author === "teacher";
    if (isTeacherNote) {
      if (!isTeacherStandaloneOpen(comment)) return null;
    } else if (activeCommentId !== comment.id) {
      return null;
    }
    /* Student memos need an anchor rect; teacher-only notes use free placement. */
    if (!comment.anchorRect && !isTeacherNote) return null;

    const wrap = document.createElement("div");
    wrap.className =
      "hw-hc-memo hw-hc-memo--expanded" +
      (isTeacherNote ? " hw-hc-memo--teacher" : "") +
      (isPairReviewMode() ? " hw-hc-memo--review" : "");
    wrap.dataset.id = comment.id;
    applyCloudPos(wrap, comment, "memo");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute(
      "aria-label",
      isTeacherNote
        ? "JD note on this question"
        : "Note on “" + (comment.anchor || "worksheet") + "”"
    );

    const body = document.createElement("div");
    body.className = "hw-hc-memo__body";
    const canDragMemo =
      isTeacherNote
        ? teacherNotesDraggable() && (!config?.readOnly || isPairReviewMode())
        : studentCloudsDraggable();
    if (canDragMemo) body.title = "Drag to move";

    const studentReadonlyView = !!config?.readOnly && !config?.teacherReview;

    if (config?.teacherReview && isTeacherNote) {
      attachMemoCloseBtn(body, () => minimizeActive(), "hw-hc-memo__close--teacher");
    } else if (config?.studentReviewed && isTeacherNote) {
      attachMemoCloseBtn(body, () => minimizeTeacherStandalone(comment.id), "hw-hc-memo__close--teacher");
    }

    if (isTeacherNote) body.appendChild(createJdAuthorLabel());

    {
      const input = document.createElement("textarea");
      /* Always hug text for JD green notes — never leave a tall white slab */
      const reviewAuto = isTeacherNote;
      input.className =
        "hw-hc-memo__input" + (reviewAuto ? " hw-hc-memo__input--review-auto" : "");
      input.rows = reviewAuto ? 1 : 3;
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
          if (reviewAuto) autosizeReviewMemoInput(input);
        });
      }
      body.appendChild(input);
      if (reviewAuto) autosizeReviewMemoInput(input);

      if (config?.teacherReview && isTeacherNote && !input.readOnly) {
        const picker = buildSavedReplyPicker(comment, input);
        if (picker) body.insertBefore(picker, input);
      }

      if (config?.teacherReview && isTeacherNote) {
        appendTeacherRemarkRecorder(body, comment);
      }

      if (studentReadonlyView) appendStudentRemarkMedia(body, comment);

      if (studentReadonlyView && !config?.studentReviewed && comment.teacherRemark) {
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
    if (canDragMemo) {
      attachMemoDragHandles(body, comment.id, wrap);
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
      if (isPairReviewMode() && comment.author !== "teacher") {
        if (reviewStudentMinimizedIds.has(comment.id)) {
          const miniPair = renderReviewMiniPair(comment);
          if (miniPair) layersEl.appendChild(miniPair);
          return;
        }
        const highlight = renderReviewAnchorHighlight(comment);
        const pair = renderReviewPair(comment);
        const jdMini = renderReviewTeacherMini(comment);
        if (highlight) layersEl.appendChild(highlight);
        if (pair) layersEl.appendChild(pair);
        if (jdMini) {
          /* Attach green mini to the open blue memo's top-right. */
          const teacherSlot = pair?.querySelector(".hw-hc-review-pair__teacher");
          if (teacherSlot) {
            teacherSlot.appendChild(jdMini);
          } else {
            const slot = document.createElement("div");
            slot.className = "hw-hc-review-pair__teacher hw-hc-review-pair__teacher--mini-only";
            slot.appendChild(jdMini);
            pair?.querySelector(".hw-hc-review-pair__anchor")?.appendChild(slot);
            if (!pair) layersEl.appendChild(jdMini);
          }
        }
        return;
      }
      const highlight = renderAnchorHighlight(comment);
      const mini = renderMini(comment);
      const memo = renderMemo(comment);
      if (highlight) layersEl.appendChild(highlight);
      if (mini) layersEl.appendChild(mini);
      if (memo) layersEl.appendChild(memo);
    });
    const pin =
      activeCommentId &&
      (layersEl.querySelector('.hw-hc-memo[data-id="' + activeCommentId + '"]') ||
        layersEl.querySelector('.hw-hc-review-pair[data-id="' + activeCommentId + '"]'));
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

  function bindReviewResize() {
    reviewResizeObserver?.disconnect();
    if (!isPairReviewMode() || !hostEl) return;
    reviewResizeObserver = new ResizeObserver(() => {
      renderAll();
    });
    reviewResizeObserver.observe(hostEl);
  }

  function buildShell() {
    if (!hostEl || built) return;
    hostEl.classList.add("hw-hc-host");

    shellEl = document.createElement("div");
    shellEl.className = "hw-hc-shell";
    shellEl.setAttribute("aria-hidden", "true");

    layersEl = document.createElement("div");
    layersEl.className = "hw-hc-layers";

    shellEl.append(layersEl);

    if (!isPairReviewMode()) {
      launcherEl = document.createElement("button");
      launcherEl.type = "button";
      launcherEl.className = "hw-hc-launcher";
      launcherEl.setAttribute("aria-label", "Add a note on highlighted text");
      launcherEl.setAttribute("aria-pressed", "false");
      launcherEl.innerHTML = cloudIconSvg("hw-hc-launcher__icon");

      loadLauncherPosition();
      try {
        /* Live: unset → TL via computeNeutralPositions.
           Explicit attach defaults (toolbar playtest) must win. */
        if (
          !localStorage.getItem(launcherStorageKey()) &&
          !config?.defaultSnap &&
          !config?.defaultLauncher
        ) {
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
    }

    hostEl.appendChild(shellEl);
    /* Same stacking parent as magnet / glass — not inside the note shell. */
    if (launcherEl) hostEl.appendChild(launcherEl);
    global.HwWorksheetToolLayout?.ensureCleanupButton?.(hostEl);
    /* Magnet stays under tools (z-index + DOM order); keep launcher after magnet. */
    if (launcherEl) hostEl.appendChild(launcherEl);

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
    reviewResizeObserver?.disconnect();
    reviewResizeObserver = null;
    dismissOnboarding({ persist: false });
    unbindTouchSelection();
    unbindWordPreview();
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
        "hw-hc-teacher-review",
        "hw-hc-student-reviewed"
      );
      hostEl.querySelector(":scope > .hw-hc-shell")?.remove();
      hostEl.querySelector(":scope > .hw-hc-launcher")?.remove();
      hostEl.querySelector(":scope > .hw-hc-teacher-bar")?.remove();
      hostEl.querySelector(":scope > .hw-hc-student-ack-bar")?.remove();
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
    teacherReplyOpenIds = new Set();
    reviewStudentMinimizedIds = new Set();
    reviewTeacherMinimizedIds = new Set();
  }

  function attachTo(formEl, options) {
    options = options || {};
    teardown();

    config = {
      username: options.username || "",
      assignmentId: options.assignmentId || formEl?.getAttribute("data-assignment-id") || "",
      readOnly: !!options.readOnly || !!options.teacherReview || !!options.studentReviewed,
      teacherReview: !!options.teacherReview,
      studentReviewed: !!options.studentReviewed && !options.teacherReview,
      submissionId: options.submissionId || "",
      teacherUsername: options.teacherUsername || "",
      onStudentAckNotes: typeof options.onStudentAckNotes === "function" ? options.onStudentAckNotes : null,
      skipOnboarding:
        !!options.skipOnboarding || !!options.teacherReview || !!options.studentReviewed,
      launcherStorageKey:
        typeof options.launcherStorageKey === "string" && options.launcherStorageKey
          ? options.launcherStorageKey
          : null,
      defaultSnap:
        options.defaultSnap && LAUNCHER_SNAP_IDS.includes(options.defaultSnap)
          ? options.defaultSnap
          : null,
      defaultLauncher:
        options.defaultLauncher &&
        typeof options.defaultLauncher.x === "number" &&
        typeof options.defaultLauncher.y === "number"
          ? { x: options.defaultLauncher.x, y: options.defaultLauncher.y }
          : null,
      useModeNeutrals: !!options.useModeNeutrals,
      /** Replies JD used before on this worksheet, keyed by question slide index. */
      answerBank:
        options.answerBank && typeof options.answerBank === "object" ? options.answerBank : null,
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
      seedTeacherReplyOpen();
      hostEl.classList.add("hw-hc-teacher-review");
      ensureTeacherReviewChrome();
      bindReviewResize();
      renderAll();
      return true;
    }

    if (config.studentReviewed) {
      config.positionsFrozen = true;
      seedStudentReviewedOpen();
      hostEl.classList.add("hw-hc-student-reviewed", "hw-hc-host--positions-baked");
      ensureStudentReviewedChrome();
      bindReviewResize();
      renderAll();
      scheduleMiniCloudOnboarding();
      return true;
    }

    if (config.readOnly) {
      config.positionsFrozen = true;
      hostEl.classList.add("hw-hc-host--positions-baked");
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
      '<button type="button" class="btn btn--ghost btn--sm" id="hw-hc-add-question-note">Add Note</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="hw-hc-submit-notes">Submit notes</button>';
    bar
      .querySelector("#hw-hc-add-question-note")
      ?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = createTeacherQuestionNote();
        expandComment(id);
      });
    bar.querySelector("#hw-hc-submit-notes")?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      document.getElementById("hw-teacher-review-submit")?.click();
    });
    hostEl.insertBefore(bar, shellEl);
  }

  function ensureStudentReviewedChrome() {
    if (!hostEl || !shellEl) return;
    hostEl.querySelector(":scope > .hw-hc-student-ack-bar")?.remove();
    if (!config?.onStudentAckNotes) return;

    const bar = document.createElement("div");
    bar.className = "hw-hc-student-ack-bar";
    bar.innerHTML =
      '<p class="hw-hc-student-ack-bar__hint">When you\u2019re finished with JD\u2019s notes:</p>' +
      '<button type="button" class="btn btn--primary" id="hw-hc-ack-notes">' +
      "Done reviewing \u2014 ready for new homework</button>";
    const btn = bar.querySelector("#hw-hc-ack-notes");
    btn?.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = "Saving\u2026";
      try {
        await config.onStudentAckNotes();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = prev;
        throw err;
      }
    });
    hostEl.insertBefore(bar, shellEl);
  }

  function getCommentsForReview() {
    return normalizeComments(comments).map((c) => {
      const row = {
        id: c.id,
        text: c.text,
        author: c.author || "student",
        teacherRemark: c.teacherRemark || undefined,
        anchor: c.anchor,
        anchorRect: c.anchorRect,
        slideIndex: c.slideIndex ?? 0,
        x: c.x,
        y: c.y,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
      if (c.teacherRemarkMedia !== undefined) {
        row.teacherRemarkMedia = c.teacherRemarkMedia;
      }
      return row;
    });
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
    bakeCloudPositions();
    return normalizeComments(comments, true);
  }

  function freezeAfterSubmit() {
    if (!config) return;
    bakeCloudPositions();
    config.readOnly = true;
    config.positionsFrozen = true;
    setArmed(false);
    minimizeActive();
    hostEl?.classList.add("hw-hc-host--positions-baked");
    renderAll();
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

  function getStorageKey() {
    return launcherStorageKey();
  }

  /** Snap used when attach opts set defaultSnap and nothing is saved yet. */
  function getAttachDefaultSnap() {
    const s = config?.defaultSnap;
    return s && LAUNCHER_SNAP_IDS.includes(s) ? s : null;
  }

  /** Free host-local coords when attach opts set defaultLauncher (no snap). */
  function getAttachDefaultLauncher() {
    return resolveAttachDefaultLauncher();
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
    focusComment,
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
    getStorageKey,
    getAttachDefaultSnap,
    getAttachDefaultLauncher,
    getModePositionTarget,
    hasSavedModePosition,
    syncModePosition,
  };
})(window);
