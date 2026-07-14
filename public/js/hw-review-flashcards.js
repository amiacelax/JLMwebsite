/**
 * Teacher flashcard review deck — one review unit at a time (Phase 1b).
 * Same comment/remark model as full-sheet review; UI only.
 */
(function (global) {
  let options = null;
  let submission = null;
  let assignment = null;
  let workingComments = [];
  let deck = [];
  let cursor = 0;
  let doneKeys = new Set();
  let draftBusy = false;
  let draftTimer = null;
  let submitBusy = false;
  let hasUnsaved = false;
  let activePanel = null; /* "remark" | "note" | null */
  let mediaApi = null;

  const DRAFT_MS = 1500;

  function uid() {
    return "c-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function el(id) {
    return document.getElementById(id);
  }

  function orderedAnswerRows(entry) {
    if (entry?.answers?.length) return entry.answers;
    const listening = (entry?.listening || []).map((row) => ({
      ...row,
      blockType: "Listening",
    }));
    const grammar = (entry?.section1 || []).map((row) => ({
      ...row,
      blockType: "Grammar",
    }));
    const open = (entry?.section2 || []).map((row) => ({
      ...row,
      blockType: "Open response",
    }));
    return [...grammar, ...open, ...listening];
  }

  function cloneComments(list) {
    return (Array.isArray(list) ? list : []).map((c) => ({ ...c }));
  }

  function setStatus(msg, isError, state) {
    const node = el("hw-rfc-status");
    if (!node) return;
    node.textContent = msg || "";
    node.classList.toggle("is-error", Boolean(isError));
    node.classList.toggle("is-saving", state === "is-saving");
    node.classList.toggle("is-saved", state === "is-saved");
    node.classList.toggle("is-dirty", state === "is-dirty");
  }

  function clearDraftTimer() {
    if (draftTimer) {
      clearTimeout(draftTimer);
      draftTimer = null;
    }
  }

  function scheduleDraftSave() {
    if (!submission || submitBusy) return;
    hasUnsaved = true;
    setStatus("Unsaved changes — saving draft…", false, "is-dirty");
    clearDraftTimer();
    draftTimer = setTimeout(() => {
      void saveDraft();
    }, DRAFT_MS);
  }

  async function saveDraft() {
    if (draftBusy || submitBusy || !submission) return;
    const session = options?.getTeacherSession?.();
    if (!session) return;

    flushActiveCardIntoComments();
    draftBusy = true;
    setStatus("Saving draft…", false, "is-saving");
    try {
      const res = await fetch("/api/homework-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: session.username,
          submissionId: submission.id,
          comments: workingComments,
          markReviewed: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save draft.");
      hasUnsaved = false;
      if (submission) submission.comments = cloneComments(workingComments);
      setStatus("Draft saved — finish cards, then submit notes.", false, "is-saved");
    } catch (err) {
      setStatus((err && err.message) || "Could not save draft.", true);
    } finally {
      draftBusy = false;
    }
  }

  function lessonLabel() {
    return (
      assignment?.title ||
      assignment?.lessonName ||
      submission?.lessonName ||
      submission?.title ||
      submission?.assignmentId ||
      "Homework"
    );
  }

  function studentLabel() {
    return submission?.displayName || submission?.username || "Student";
  }

  function remainingUnits() {
    return deck.filter((u) => !doneKeys.has(u.key));
  }

  function currentUnit() {
    const rem = remainingUnits();
    if (!rem.length) return null;
    if (cursor >= rem.length) cursor = rem.length - 1;
    if (cursor < 0) cursor = 0;
    return rem[cursor] || null;
  }

  function buildDeck() {
    const rows = orderedAnswerRows(submission);
    const sections = assignment?.sections || [];
    const enriched =
      global.HwSubmitFormat?.enrichRowsFromAssignment?.(rows, sections) || rows;

    const bySlide = [];
    enriched.forEach((row, i) => {
      const fmt = global.HwSubmitFormat?.normalizeSubmissionRow?.(row, i) || {
        num: String(i + 1),
        question: row.question?.trim() || row.prompt?.trim() || "",
        answer: row.student?.trim() || "(blank)",
        piecesLine: row.piecesDisplay?.trim() || "",
        mediaLabel: "",
        mediaId: row.mediaId?.trim() || "",
        mediaKind: row.mediaKind || "",
      };
      const isMedia = Boolean(fmt.mediaId || fmt.mediaLabel);
      bySlide.push({
        key: "answer:" + i,
        kind: isMedia ? "media" : "answer",
        slideIndex: i,
        num: fmt.num,
        prompt: fmt.question || "",
        answer: isMedia ? "" : fmt.answer || "(blank)",
        piecesLine: fmt.piecesLine || "",
        mediaId: fmt.mediaId || "",
        mediaKind: fmt.mediaKind || "",
        mediaLabel: fmt.mediaLabel || "",
      });
    });

    const units = [];
    bySlide.forEach((answerUnit) => {
      units.push(answerUnit);
      workingComments
        .filter(
          (c) =>
            c.author !== "teacher" &&
            (c.slideIndex ?? 0) === answerUnit.slideIndex &&
            (String(c.text || "").trim() || c.anchor)
        )
        .forEach((c) => {
          units.push({
            key: "memo:" + c.id,
            kind: "memo",
            slideIndex: answerUnit.slideIndex,
            num: answerUnit.num,
            commentId: c.id,
            memoText: String(c.text || "").trim(),
            anchor: c.anchor || "",
            prompt: answerUnit.prompt,
            answer: answerUnit.answer,
            piecesLine: answerUnit.piecesLine,
            mediaId: answerUnit.mediaId,
            mediaKind: answerUnit.mediaKind,
            mediaLabel: answerUnit.mediaLabel,
          });
        });
    });

    /* Memos on slides with no answer row (edge case) */
    workingComments.forEach((c) => {
      if (c.author === "teacher") return;
      if (!(String(c.text || "").trim() || c.anchor)) return;
      const slide = c.slideIndex ?? 0;
      if (units.some((u) => u.key === "memo:" + c.id)) return;
      units.push({
        key: "memo:" + c.id,
        kind: "memo",
        slideIndex: slide,
        num: String(slide + 1),
        commentId: c.id,
        memoText: String(c.text || "").trim(),
        anchor: c.anchor || "",
        prompt: "",
        answer: "",
        piecesLine: "",
        mediaId: "",
        mediaKind: "",
        mediaLabel: "",
      });
    });

    return units;
  }

  function findTeacherNoteForSlide(slideIndex) {
    return workingComments.find(
      (c) => c.author === "teacher" && (c.slideIndex ?? 0) === slideIndex
    );
  }

  function ensureTeacherNote(slideIndex) {
    let note = findTeacherNoteForSlide(slideIndex);
    if (note) return note;
    note = {
      id: uid(),
      text: "",
      author: "teacher",
      slideIndex,
      x: 72,
      y: 18,
      createdAt: new Date().toISOString(),
    };
    workingComments.push(note);
    return note;
  }

  function findMemoComment(commentId) {
    return workingComments.find((c) => c.id === commentId);
  }

  function flushActiveCardIntoComments() {
    const unit = currentUnit();
    if (!unit) return;

    const remarkInput = el("hw-rfc-remark-input");
    const noteInput = el("hw-rfc-note-input");
    const remarkPanel = el("hw-rfc-remark-panel");
    const notePanel = el("hw-rfc-note-panel");

    if (unit.kind === "memo" && unit.commentId && remarkInput && remarkPanel && !remarkPanel.hidden) {
      const memo = findMemoComment(unit.commentId);
      if (memo) {
        memo.teacherRemark = String(remarkInput.value || "");
        memo.updatedAt = new Date().toISOString();
      }
    }

    if (noteInput && notePanel && !notePanel.hidden) {
      const text = String(noteInput.value || "");
      if (text.trim()) {
        const note = ensureTeacherNote(unit.slideIndex);
        note.text = text;
        note.updatedAt = new Date().toISOString();
      } else {
        const existing = findTeacherNoteForSlide(unit.slideIndex);
        if (existing && !existing.teacherRemarkMedia?.id) {
          existing.text = "";
        }
      }
    }
  }

  function mediaUrl(mediaId) {
    if (global.HwVideoInline?.mediaUrl) return global.HwVideoInline.mediaUrl(mediaId);
    return "/api/hw-m/" + encodeURIComponent(mediaId);
  }

  function renderMediaPlayback(mount, mediaId, mediaKind) {
    if (!mount || !mediaId) return;
    mount.replaceChildren();
    const url = mediaUrl(mediaId);
    if (mediaKind === "audio") {
      if (global.HwWorksheet?.renderListenSlideAudio) {
        mount.appendChild(global.HwWorksheet.renderListenSlideAudio(url, {
          ariaLabel: "Student's recorded answer",
        }));
      } else {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "metadata";
        audio.src = url;
        audio.setAttribute("aria-label", "Student's recorded answer");
        mount.appendChild(audio);
      }
      return;
    }
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    video.setAttribute("aria-label", "Student's recorded answer");
    video.className = "hw-rfc-video";
    const player =
      global.HwCompat?.enhanceVideoElement?.(video, url, { compact: true }) || video;
    mount.appendChild(player);
  }

  function syncProgress() {
    const progress = el("hw-rfc-progress");
    const unit = currentUnit();
    const total = deck.length;
    const done = doneKeys.size;
    if (!progress) return;
    if (!unit) {
      progress.textContent =
        (done ? done + " of " + total + " done" : "Empty deck") +
        " · " +
        studentLabel() +
        " · " +
        lessonLabel();
      return;
    }
    const position = done + cursor + 1;
    progress.textContent =
      "Card " +
      position +
      " of " +
      total +
      (done ? " · " + done + " done" : "") +
      " · " +
      studentLabel() +
      " · " +
      lessonLabel();
  }

  function showStage(which) {
    const loading = el("hw-rfc-loading");
    const empty = el("hw-rfc-empty");
    const stage = el("hw-rfc-stage");
    if (loading) loading.hidden = which !== "loading";
    if (empty) empty.hidden = which !== "empty";
    if (stage) stage.hidden = which !== "card";
  }

  function setPanel(which) {
    activePanel = which;
    const remarkPanel = el("hw-rfc-remark-panel");
    const notePanel = el("hw-rfc-note-panel");
    if (remarkPanel) remarkPanel.hidden = which !== "remark";
    if (notePanel) notePanel.hidden = which !== "note";
    if (which === "remark") el("hw-rfc-remark-input")?.focus();
    if (which === "note") el("hw-rfc-note-input")?.focus();
  }

  function bindRemarkMedia(comment) {
    const mount = el("hw-rfc-remark-media");
    if (!mount) return;
    mount.replaceChildren();
    delete mount.dataset.bound;
    mediaApi = null;
    const session = options?.getTeacherSession?.();
    global.HwReviewMedia?.mountRemarkRecorder?.(mount, {
      teacherUsername: session?.username || "",
      existing: comment?.teacherRemarkMedia || null,
      onChange: (media) => {
        if (!comment) return;
        comment.teacherRemarkMedia = media?.id
          ? {
              id: String(media.id),
              kind: media.kind === "video" ? "video" : "audio",
              mimeType: media.mimeType,
            }
          : null;
        comment.updatedAt = new Date().toISOString();
        scheduleDraftSave();
      },
      onReady: (api) => {
        mediaApi = api;
      },
    });
  }

  function renderEmpty() {
    showStage("empty");
    syncProgress();
    const empty = el("hw-rfc-empty");
    if (!empty) return;
    const hadCards = deck.length > 0;
    empty.innerHTML =
      '<p class="hw-rfc-empty__lead">' +
      (hadCards
        ? "Deck clear — submit notes to mark this submission reviewed, or open the full sheet for a sanity pass."
        : "No review units on this submission. Open the full sheet or submit notes to mark reviewed.") +
      "</p>" +
      '<div class="hw-rfc-empty__actions">' +
      '<button type="button" class="btn btn--primary" id="hw-rfc-submit-notes">Submit notes</button>' +
      '<button type="button" class="btn btn--ghost" id="hw-rfc-empty-sheet">Review full sheet</button>' +
      "</div>";
    empty.querySelector("#hw-rfc-submit-notes")?.addEventListener("click", () => {
      void submitNotes();
    });
    empty.querySelector("#hw-rfc-empty-sheet")?.addEventListener("click", () => {
      openFullSheet();
    });
  }

  function renderCard() {
    const unit = currentUnit();
    if (!unit) {
      renderEmpty();
      return;
    }

    showStage("card");
    syncProgress();
    activePanel = null;
    mediaApi = null;

    const stage = el("hw-rfc-stage");
    if (!stage) return;

    const isMemo = unit.kind === "memo";
    const memo = isMemo ? findMemoComment(unit.commentId) : null;
    const teacherNote = findTeacherNoteForSlide(unit.slideIndex);

    let bodyHtml = "";
    if (unit.prompt) {
      bodyHtml +=
        '<div class="hw-rfc-field">' +
        '<p class="hw-rfc-field__label">Prompt</p>' +
        '<p class="hw-rfc-field__value" lang="ja">' +
        escapeHtml(unit.prompt) +
        "</p></div>";
    }
    if (unit.kind === "media" || unit.mediaId) {
      bodyHtml +=
        '<div class="hw-rfc-field">' +
        '<p class="hw-rfc-field__label">Answer</p>' +
        '<p class="hw-rfc-field__value">' +
        escapeHtml(unit.mediaLabel || "Media submitted") +
        "</p>" +
        '<div class="hw-rfc-media" id="hw-rfc-student-media"></div></div>';
    } else if (unit.answer) {
      bodyHtml +=
        '<div class="hw-rfc-field">' +
        '<p class="hw-rfc-field__label">Answer</p>' +
        '<p class="hw-rfc-field__value hw-rfc-field__value--answer" lang="ja">【' +
        escapeHtml(unit.answer) +
        "】</p>";
      if (unit.piecesLine) {
        bodyHtml +=
          '<p class="hw-rfc-field__meta">' + escapeHtml(unit.piecesLine) + "</p>";
      }
      bodyHtml += "</div>";
    }

    if (isMemo) {
      bodyHtml +=
        '<div class="hw-rfc-memo">' +
        '<p class="hw-rfc-memo__label">☁ Student memo' +
        (unit.anchor ? " on “" + escapeHtml(unit.anchor) + "”" : "") +
        "</p>" +
        '<p class="hw-rfc-memo__text">' +
        escapeHtml(unit.memoText || "(empty memo)") +
        "</p></div>";
    }

    const actionsTop = [];
    if (isMemo) {
      actionsTop.push(
        '<button type="button" class="btn btn--ghost btn--sm" id="hw-rfc-btn-remark">Remark on memo</button>'
      );
    }
    actionsTop.push(
      '<button type="button" class="btn btn--ghost btn--sm" id="hw-rfc-btn-note">Add note</button>'
    );

    stage.innerHTML =
      '<article class="hw-rfc-card">' +
      bodyHtml +
      '<div class="hw-rfc-panel" id="hw-rfc-remark-panel" hidden>' +
      '<p class="hw-rfc-panel__label">JD remark on memo</p>' +
      '<div class="hw-rfc-remark-media" id="hw-rfc-remark-media"></div>' +
      '<textarea class="hw-rfc-textarea" id="hw-rfc-remark-input" rows="3" maxlength="2000" placeholder="Write a remark for the student…"></textarea>' +
      "</div>" +
      '<div class="hw-rfc-panel" id="hw-rfc-note-panel" hidden>' +
      '<p class="hw-rfc-panel__label">Question note</p>' +
      '<textarea class="hw-rfc-textarea" id="hw-rfc-note-input" rows="3" maxlength="2000" placeholder="Write a note on this question for the student…"></textarea>' +
      "</div>" +
      '<div class="hw-rfc-actions hw-rfc-actions--edit">' +
      actionsTop.join("") +
      "</div>" +
      '<div class="hw-rfc-actions hw-rfc-actions--nav">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="hw-rfc-open-sheet">Open in sheet ↗</button>' +
      '<button type="button" class="btn btn--primary btn--sm" id="hw-rfc-done">Done →</button>' +
      "</div></article>";

    if (unit.mediaId) {
      renderMediaPlayback(
        el("hw-rfc-student-media"),
        unit.mediaId,
        unit.mediaKind === "audio" ? "audio" : "video"
      );
    }

    const remarkInput = el("hw-rfc-remark-input");
    if (remarkInput && memo) {
      remarkInput.value = memo.teacherRemark || "";
      remarkInput.addEventListener("input", () => {
        memo.teacherRemark = remarkInput.value;
        memo.updatedAt = new Date().toISOString();
        scheduleDraftSave();
      });
    }

    const noteInput = el("hw-rfc-note-input");
    if (noteInput) {
      noteInput.value = teacherNote?.text || "";
      noteInput.addEventListener("input", () => {
        const note = ensureTeacherNote(unit.slideIndex);
        note.text = noteInput.value;
        note.updatedAt = new Date().toISOString();
        scheduleDraftSave();
      });
    }

    el("hw-rfc-btn-remark")?.addEventListener("click", () => {
      setPanel("remark");
      if (memo) bindRemarkMedia(memo);
    });
    el("hw-rfc-btn-note")?.addEventListener("click", () => {
      setPanel("note");
    });
    el("hw-rfc-open-sheet")?.addEventListener("click", () => {
      openFullSheet({
        slideIndex: unit.slideIndex,
        commentId: unit.commentId || null,
      });
    });
    el("hw-rfc-done")?.addEventListener("click", () => {
      void markDone();
    });

    /* Auto-open primary editor for speed */
    if (isMemo) {
      setPanel("remark");
      if (memo) bindRemarkMedia(memo);
    } else {
      setPanel("note");
    }
  }

  async function markDone() {
    const unit = currentUnit();
    if (!unit) return;
    flushActiveCardIntoComments();

    /* Drop empty teacher notes created then abandoned */
    workingComments = workingComments.filter((c) => {
      if (c.author !== "teacher") return true;
      return String(c.text || "").trim().length > 0 || c.teacherRemarkMedia?.id;
    });

    doneKeys.add(unit.key);
    if (submission) submission.comments = cloneComments(workingComments);
    scheduleDraftSave();
    /* Stay on same cursor index in remaining list (next card slides into place) */
    renderCard();
  }

  async function openFullSheet(focus) {
    flushActiveCardIntoComments();
    clearDraftTimer();
    if (hasUnsaved) await saveDraft();
    if (submission) submission.comments = cloneComments(workingComments);

    const openSheet = options?.openWorksheetReview;
    if (!openSheet) {
      options?.showToast?.("Full sheet review is unavailable.");
      return;
    }

    const overlay = el("hw-review-flashcards");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("hw-review-flashcards-open");

    await openSheet(submission, {
      focusSlideIndex: focus?.slideIndex,
      focusCommentId: focus?.commentId || null,
      initialComments: cloneComments(workingComments),
    });
  }

  async function submitNotes() {
    if (submitBusy || !submission) return;
    const session = options?.getTeacherSession?.();
    if (!session) return;

    flushActiveCardIntoComments();
    clearDraftTimer();
    hasUnsaved = false;
    submitBusy = true;
    const chromeBtn = el("hw-rfc-submit-notes-chrome");
    if (chromeBtn) chromeBtn.disabled = true;
    setStatus("Sending to student…", false, "is-saving");

    try {
      const res = await fetch("/api/homework-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: session.username,
          submissionId: submission.id,
          comments: workingComments,
          markReviewed: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not submit notes.");

      try {
        const student = submission.username;
        const assignmentId = submission.assignmentId;
        if (student && assignmentId) {
          localStorage.setItem(
            "jlm-hw-reviewed-" + String(student).toLowerCase() + "-" + assignmentId,
            "1"
          );
        }
      } catch {
        /* ignore */
      }

      options?.showToast?.("Notes sent — student can see your feedback.");
      await close();
      if (global.HwTeacherSubmissions?.reload) {
        await global.HwTeacherSubmissions.reload();
      }
    } catch (err) {
      setStatus((err && err.message) || "Could not submit notes.", true);
    } finally {
      submitBusy = false;
      if (chromeBtn) chromeBtn.disabled = false;
    }
  }

  async function close() {
    clearDraftTimer();
    if (hasUnsaved && submission && !submitBusy) {
      await saveDraft();
    }
    const overlay = el("hw-review-flashcards");
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("hw-review-flashcards-open");
    submission = null;
    assignment = null;
    workingComments = [];
    deck = [];
    cursor = 0;
    doneKeys = new Set();
    hasUnsaved = false;
    activePanel = null;
    mediaApi = null;
    setStatus("");
  }

  async function open(entry) {
    if (!entry?.id || entry.type !== "online") {
      options?.showToast?.("Flashcards are for online worksheet submissions.");
      return;
    }
    const session = options?.getTeacherSession?.();
    if (!session) return;

    const overlay = el("hw-review-flashcards");
    const titleEl = el("hw-rfc-title");
    if (!overlay) {
      options?.showToast?.("Flashcard review UI is missing.");
      return;
    }

    if (overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }

    submission = entry;
    workingComments = cloneComments(entry.comments || []);
    doneKeys = new Set();
    cursor = 0;
    hasUnsaved = false;
    clearDraftTimer();

    if (titleEl) {
      titleEl.textContent =
        studentLabel() + " — " + (entry.lessonName || entry.title || entry.assignmentId || "Homework");
    }
    setStatus("Loading deck…");
    showStage("loading");
    overlay.hidden = false;
    document.body.classList.add("hw-review-flashcards-open");

    try {
      assignment = options?.fetchAssignment
        ? await options.fetchAssignment(entry.assignmentId)
        : null;
    } catch (err) {
      setStatus((err && err.message) || "Could not load the worksheet.", true);
      showStage("empty");
      return;
    }

    deck = buildDeck();
    setStatus(
      entry.reviewStatus === "reviewed"
        ? "Already reviewed — edits save as drafts until you submit notes again."
        : "Review one card at a time. Done saves and advances.",
      false,
      "is-saved"
    );
    renderCard();
  }

  function bindChrome() {
    const overlay = el("hw-review-flashcards");
    if (!overlay || overlay.dataset.bound === "1") return;
    overlay.dataset.bound = "1";

    el("hw-rfc-back")?.addEventListener("click", () => {
      void close();
    });
    el("hw-rfc-full-sheet")?.addEventListener("click", () => {
      openFullSheet();
    });
    el("hw-rfc-submit-notes-chrome")?.addEventListener("click", () => {
      void submitNotes();
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (overlay.hidden) return;
      /* Prefer sheet overlay if also open */
      const sheet = el("hw-teacher-review-overlay");
      if (sheet && !sheet.hidden) return;
      ev.preventDefault();
      void close();
    });
  }

  function init(opts) {
    options = opts || {};
    bindChrome();
  }

  global.HwReviewFlashcards = {
    init,
    open,
    close,
  };
})(window);
