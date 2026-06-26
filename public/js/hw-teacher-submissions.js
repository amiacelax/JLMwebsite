/**
 * Teacher view — stored student homework submissions (online + photos).
 */
(function (global) {
  let submissionsCache = [];
  let expandedId = null;
  let loading = false;
  let bound = false;
  let options = null;

  function formatDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function photoUrl(session, photoId) {
    return (
      "/api/homework-submissions/photo?id=" +
      encodeURIComponent(photoId) +
      "&teacherUsername=" +
      encodeURIComponent(session.username)
    );
  }

  function videoUrl(session, videoId) {
    return (
      "/api/homework-submissions/video?id=" +
      encodeURIComponent(videoId) +
      "&teacherUsername=" +
      encodeURIComponent(session.username)
    );
  }

  function videoDownloadUrl(session, videoId) {
    return videoUrl(session, videoId) + "&download=1";
  }

  function submissionSearchText(entry) {
    return [
      entry.displayName,
      entry.username,
      entry.assignmentId,
      entry.lessonName,
      entry.title,
      entry.type,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function legacyOrderedRows(entry) {
    const listening = (entry.listening || []).map((row) => ({
      ...row,
      blockType: "Listening",
    }));
    const grammar = (entry.section1 || []).map((row) => ({
      ...row,
      blockType: "Grammar",
    }));
    const open = (entry.section2 || []).map((row) => ({
      ...row,
      blockType: "Open response",
    }));
    const combined = [...grammar, ...open, ...listening];
    const total = combined.length;
    return combined.map((row, index) => ({
      ...row,
      progress: total ? index + 1 + " of " + total : undefined,
    }));
  }

  function orderedAnswerRows(entry) {
    if (entry.answers?.length) return entry.answers;
    return legacyOrderedRows(entry);
  }

  function answerCount(entry) {
    if (entry.type === "photo" || entry.type === "video") return 0;
    const ordered = orderedAnswerRows(entry);
    if (ordered.length) return ordered.length;
    return (
      (entry.section1?.length || 0) +
      (entry.section2?.length || 0) +
      (entry.listening?.length || 0)
    );
  }

  function getFilteredSubmissions() {
    const searchInput = document.getElementById("hw-submissions-search");
    const q = String(searchInput?.value || "")
      .trim()
      .toLowerCase();
    let filtered = submissionsCache.slice();
    if (q) {
      filtered = filtered.filter((entry) => submissionSearchText(entry).includes(q));
    }
    filtered.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
    return filtered;
  }

  async function fetchSubmissions(session, student) {
    let url =
      "/api/homework-submissions?teacherUsername=" + encodeURIComponent(session.username);
    if (student) url += "&student=" + encodeURIComponent(student);
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not load submissions.");
    }
    const data = await res.json();
    return Array.isArray(data.submissions) ? data.submissions : [];
  }

  function renderOrderedAnswerCard(row, index, session) {
    const fmt = global.HwSubmitFormat?.normalizeSubmissionRow(row, index) || {
      num: String(index + 1),
      question: row.question?.trim() || row.prompt?.trim() || "",
      answer: row.student?.trim() || "(blank)",
      piecesLine: row.piecesDisplay?.trim() || "",
      mediaLabel: "",
      mediaId: row.mediaId?.trim() || "",
      mediaKind: row.mediaKind || "",
    };

    const card = document.createElement("article");
    card.className = "hw-submission-answer-card";

    const numEl = document.createElement("div");
    numEl.className = "hw-submission-answer-card__num";
    numEl.textContent = fmt.num;
    card.appendChild(numEl);

    if (fmt.question) {
      const promptEl = document.createElement("p");
      promptEl.className = "hw-submission-answer-card__prompt";
      promptEl.textContent = fmt.question;
      card.appendChild(promptEl);
    }

    if (fmt.mediaLabel) {
      const media = document.createElement("p");
      media.className = "hw-submission-answer-card__media";
      media.textContent = fmt.mediaLabel;
      card.appendChild(media);

      if (fmt.mediaId && session) {
        const actions = document.createElement("div");
        actions.className = "hw-submission-answer-card__media-actions";

        const listen = document.createElement("a");
        listen.className = "btn btn--ghost btn--sm";
        listen.href = shortMediaUrl(fmt.mediaId, false);
        listen.target = "_blank";
        listen.rel = "noopener noreferrer";
        listen.textContent = "Listen";
        actions.appendChild(listen);

        const download = document.createElement("a");
        download.className = "btn btn--ghost btn--sm";
        download.href = shortMediaUrl(fmt.mediaId, true);
        download.textContent = "Download";
        download.setAttribute("download", "");
        actions.appendChild(download);

        card.appendChild(actions);
      }
    } else {
      const student = document.createElement("p");
      student.className = "hw-submission-answer-card__student";
      student.textContent = fmt.answer;
      card.appendChild(student);
    }

    if (fmt.piecesLine) {
      const pieces = document.createElement("p");
      pieces.className = "hw-submission-answer-card__pieces";
      pieces.textContent = fmt.piecesLine;
      card.appendChild(pieces);
    }

    return card;
  }

  function shortMediaUrl(mediaId, download) {
    const base = "/api/hw-m/" + encodeURIComponent(mediaId);
    return download ? base + "?d=1" : base;
  }

  function renderOrderedAnswers(entry, session) {
    const rows = orderedAnswerRows(entry);
    const block = document.createElement("div");
    block.className = "hw-submission-checker__answers";

    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "hw-submission-detail__empty";
      empty.textContent = "No text answers stored for this submission.";
      block.appendChild(empty);
      return block;
    }

    const list = document.createElement("div");
    list.className = "hw-submission-answer-cards";
    const loading = document.createElement("p");
    loading.className = "hw-submission-detail__empty";
    loading.textContent = "Loading answers…";
    block.appendChild(loading);

    const paint = (enrichedRows) => {
      block.textContent = "";
      list.textContent = "";
      enrichedRows.forEach((row, index) => {
        list.appendChild(renderOrderedAnswerCard(row, index, session));
      });
      block.appendChild(list);
    };

    if (global.HwSubmitFormat?.enrichRowsForEntry && entry.assignmentId) {
      global.HwSubmitFormat.enrichRowsForEntry(rows, entry.assignmentId)
        .then(paint)
        .catch(() => paint(rows));
    } else {
      paint(rows);
    }

    return block;
  }

  function renderCheckerNav(entry, filtered, session) {
    const nav = document.createElement("div");
    nav.className = "hw-submission-checker__nav";

    const idx = filtered.findIndex((e) => e.id === entry.id);
    const prev = idx > 0 ? filtered[idx - 1] : null;
    const next = idx >= 0 && idx < filtered.length - 1 ? filtered[idx + 1] : null;

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "btn btn--ghost btn--sm hw-submission-checker__nav-btn";
    prevBtn.textContent = "← Previous";
    prevBtn.disabled = !prev;
    prevBtn.addEventListener("click", () => {
      if (prev) {
        expandedId = prev.id;
        renderList();
      }
    });

    const counter = document.createElement("p");
    counter.className = "hw-submission-checker__counter";
    counter.textContent =
      filtered.length && idx >= 0 ? idx + 1 + " of " + filtered.length + " shown" : "";

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn--ghost btn--sm hw-submission-checker__nav-btn";
    nextBtn.textContent = "Next →";
    nextBtn.disabled = !next;
    nextBtn.addEventListener("click", () => {
      if (next) {
        expandedId = next.id;
        renderList();
      }
    });

    nav.append(prevBtn, counter, nextBtn);

    const title = document.createElement("h3");
    title.className = "hw-submission-checker__title";
    title.textContent =
      entry.displayName +
      " — " +
      (entry.lessonName || entry.title || entry.assignmentId || "Homework");

    const sub = document.createElement("p");
    sub.className = "hw-submission-checker__sub";
    sub.textContent = [
      formatDate(entry.submittedAt),
      entry.type === "online"
        ? answerCount(entry) + " answer" + (answerCount(entry) === 1 ? "" : "s")
        : entry.type === "photo"
          ? "Printed photo"
          : "Video / audio",
      entry.register ? "Register: " + entry.register : "",
      entry.assignmentId,
    ]
      .filter(Boolean)
      .join(" · ");

    const wrap = document.createElement("div");
    wrap.className = "hw-submission-checker";
    wrap.append(nav, title, sub);

    if (entry.type === "photo" && entry.photo?.id) {
      const link = document.createElement("a");
      link.className = "hw-submission-detail__photo-link";
      link.href = photoUrl(session, entry.photo.id);
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const img = document.createElement("img");
      img.className = "hw-submission-detail__photo";
      img.src = photoUrl(session, entry.photo.id);
      img.alt = entry.photo.name || "Printed homework photo";
      img.loading = "lazy";
      link.appendChild(img);
      wrap.appendChild(link);
    } else if (entry.type === "video" && entry.video?.id) {
      const video = document.createElement("video");
      video.className = "hw-submission-detail__video";
      video.src = videoUrl(session, entry.video.id);
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      wrap.appendChild(video);

      const mediaActions = document.createElement("div");
      mediaActions.className = "hw-submission-detail__media-actions";

      const download = document.createElement("a");
      download.className = "btn btn--ghost btn--sm";
      download.href = videoDownloadUrl(session, entry.video.id);
      download.textContent = "Download";
      download.setAttribute("download", "");
      mediaActions.appendChild(download);

      const hint = document.createElement("p");
      hint.className = "hw-submission-detail__media-hint";
      hint.textContent =
        "On phone: tap Download, save the file, then open in VLC if it won\u2019t play in the browser.";
      mediaActions.appendChild(hint);

      wrap.appendChild(mediaActions);
    } else if (entry.type === "online") {
      wrap.appendChild(renderOrderedAnswers(entry, session));
    }

    return wrap;
  }

  function renderList() {
    const list = document.getElementById("hw-submissions-list");
    const meta = document.getElementById("hw-submissions-meta");
    const session = options?.getTeacherSession?.();
    if (!list || !session) return;

    if (loading) {
      if (meta) meta.textContent = "Loading submissions…";
      global.HwLoading?.showListWait(list, {
        message: "Loading submissions…",
        extraClass: "hw-submissions-item",
      });
      return;
    }

    const searchInput = document.getElementById("hw-submissions-search");
    const studentFilter = document.getElementById("hw-submissions-student");
    const filtered = getFilteredSubmissions();

    list.replaceChildren();
    if (meta) {
      const q = String(searchInput?.value || "").trim();
      const studentLabel =
        studentFilter && studentFilter.value
          ? " · " + studentFilter.selectedOptions[0]?.textContent
          : "";
      meta.textContent =
        filtered.length +
        " submission" +
        (filtered.length === 1 ? "" : "s") +
        (q ? ' matching “' + q + "”" : "") +
        studentLabel +
        (submissionsCache.length !== filtered.length ? " of " + submissionsCache.length : "");
    }

    if (!filtered.length) {
      const li = document.createElement("li");
      li.className = "hw-submissions-item hw-submissions-item--empty";
      const p = document.createElement("p");
      p.textContent = submissionsCache.length
        ? "No submissions match. Try another student or keyword."
        : "No submissions stored yet. They appear here when students submit homework online, upload a photo, or upload a video.";
      li.appendChild(p);
      list.appendChild(li);
      return;
    }

    const activeEntry = expandedId ? filtered.find((e) => e.id === expandedId) : null;

    if (activeEntry) {
      const li = document.createElement("li");
      li.className = "hw-submissions-item hw-submissions-item--open hw-submissions-item--checker";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "btn btn--ghost btn--sm hw-submission-checker__close";
      closeBtn.textContent = "Close";
      closeBtn.addEventListener("click", () => {
        expandedId = null;
        renderList();
      });
      li.appendChild(closeBtn);
      li.appendChild(renderCheckerNav(activeEntry, filtered, session));
      list.appendChild(li);
      li.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    filtered.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "hw-submissions-item";

      const main = document.createElement("div");
      main.className = "hw-submissions-item__main";

      const top = document.createElement("div");
      top.className = "hw-submissions-item__top";

      const date = document.createElement("p");
      date.className = "hw-submissions-item__date";
      date.textContent = formatDate(entry.submittedAt);

      const type = document.createElement("span");
      type.className =
        "hw-submissions-item__type hw-submissions-item__type--" + (entry.type || "online");
      type.textContent =
        entry.type === "photo" ? "Photo" : entry.type === "video" ? "Video" : "Online";

      top.append(date, type);

      const title = document.createElement("h3");
      title.className = "hw-submissions-item__title";
      title.textContent = entry.displayName + " — " + (entry.lessonName || entry.title || entry.assignmentId);

      const sub = document.createElement("p");
      sub.className = "hw-submissions-item__sub";
      sub.textContent =
        entry.type === "photo"
          ? "Printed homework · " + entry.assignmentId
          : entry.type === "video"
            ? "Video homework · " + entry.assignmentId
            : answerCount(entry) + " answer" + (answerCount(entry) === 1 ? "" : "s") + " · " + entry.assignmentId;

      main.append(top, title, sub);

      if (entry.type === "photo" && entry.photo?.id) {
        const thumb = document.createElement("img");
        thumb.className = "hw-submissions-item__thumb";
        thumb.src = photoUrl(session, entry.photo.id);
        thumb.alt = "";
        thumb.loading = "lazy";
        main.appendChild(thumb);
      }

      const actions = document.createElement("div");
      actions.className = "hw-submissions-item__actions";

      const viewBtn = document.createElement("button");
      viewBtn.type = "button";
      viewBtn.className = "btn btn--primary btn--sm";
      viewBtn.textContent = "Review";
      viewBtn.addEventListener("click", () => {
        expandedId = entry.id;
        renderList();
      });

      actions.appendChild(viewBtn);
      li.append(main, actions);
      list.appendChild(li);
    });
  }

  async function reloadSubmissions() {
    const session = options?.getTeacherSession?.();
    if (!session || session.role !== "teacher") return;
    if (loading) return;

    const studentFilter = document.getElementById("hw-submissions-student");
    const student = studentFilter ? studentFilter.value : "";

    loading = true;
    renderList();
    try {
      submissionsCache = await fetchSubmissions(session, student);
      if (expandedId && !submissionsCache.some((entry) => entry.id === expandedId)) {
        expandedId = null;
      }
    } catch (err) {
      const meta = document.getElementById("hw-submissions-meta");
      if (meta) meta.textContent = err.message || "Could not load submissions.";
    } finally {
      loading = false;
      renderList();
    }
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    const studentFilter = document.getElementById("hw-submissions-student");
    if (studentFilter && global.HwStudentList?.refreshSelect) {
      void global.HwStudentList.refreshSelect(studentFilter, {
        includeAllOption: true,
        allLabel: "All students",
      });
    }

    const search = document.getElementById("hw-submissions-search");
    const refreshBtn = document.getElementById("hw-submissions-refresh");

    if (search) {
      search.addEventListener("input", () => {
        expandedId = null;
        renderList();
      });
    }
    if (studentFilter) {
      studentFilter.addEventListener("change", () => {
        expandedId = null;
        void reloadSubmissions();
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        void reloadSubmissions();
        options?.showToast?.("Submissions refreshed.");
      });
    }

    document.addEventListener("keydown", (e) => {
      if (!expandedId) return;
      const panel = document.getElementById("hw-teacher-submissions");
      if (!panel || panel.hidden) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === "ArrowLeft") {
        const filtered = getFilteredSubmissions();
        const idx = filtered.findIndex((entry) => entry.id === expandedId);
        if (idx > 0) {
          expandedId = filtered[idx - 1].id;
          renderList();
        }
      } else if (e.key === "ArrowRight") {
        const filtered = getFilteredSubmissions();
        const idx = filtered.findIndex((entry) => entry.id === expandedId);
        if (idx >= 0 && idx < filtered.length - 1) {
          expandedId = filtered[idx + 1].id;
          renderList();
        }
      } else if (e.key === "Escape") {
        expandedId = null;
        renderList();
      }
    });
  }

  function init(opts) {
    options = opts || {};
    bindOnce();
    void reloadSubmissions();
  }

  global.HwTeacherSubmissions = { init, reload: reloadSubmissions };
})(window);
