/**
 * Teacher view — stored student homework submissions (online + photos).
 */
(function (global) {
  const STUDENTS = [
    { username: "joshs", label: "joshs — Josh S" },
    { username: "benm", label: "benm — Ben M" },
    { username: "deme", label: "deme — Deme" },
    { username: "ivan", label: "ivan — Ivan" },
  ];

  let submissionsCache = [];
  let expandedId = null;
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

  function answerCount(entry) {
    if (entry.type === "photo") return 0;
    return (entry.section1?.length || 0) + (entry.section2?.length || 0);
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

  function renderAnswerSection(title, rows) {
    const block = document.createElement("div");
    block.className = "hw-submission-detail__section";

    const heading = document.createElement("h4");
    heading.className = "hw-submission-detail__heading";
    heading.textContent = title;
    block.appendChild(heading);

    if (!rows?.length) {
      const empty = document.createElement("p");
      empty.className = "hw-submission-detail__empty";
      empty.textContent = "(none)";
      block.appendChild(empty);
      return block;
    }

    const list = document.createElement("ul");
    list.className = "hw-submission-detail__answers";
    rows.forEach((row) => {
      const li = document.createElement("li");
      li.className = "hw-submission-detail__answer";

      const label = document.createElement("p");
      label.className = "hw-submission-detail__label";
      label.textContent = (row.label || "—") + ": " + (row.student || "(blank)");

      li.appendChild(label);

      const completed = row.completed?.trim();
      if (completed) {
        const sentence = document.createElement("p");
        sentence.className = "hw-submission-detail__sentence";
        sentence.textContent = "→ " + completed;
        li.appendChild(sentence);
      }

      const prompt = row.prompt?.trim();
      if (prompt) {
        const promptEl = document.createElement("p");
        promptEl.className = "hw-submission-detail__prompt";
        promptEl.textContent = prompt;
        li.appendChild(promptEl);
      }

      list.appendChild(li);
    });
    block.appendChild(list);
    return block;
  }

  function renderDetail(entry, session) {
    const detail = document.createElement("div");
    detail.className = "hw-submission-detail";

    const meta = document.createElement("p");
    meta.className = "hw-submission-detail__meta";
    meta.textContent = [
      entry.displayName + " (" + entry.username + ")",
      entry.lessonName || entry.title || entry.assignmentId,
      entry.register ? "Register: " + entry.register : "",
    ]
      .filter(Boolean)
      .join(" · ");
    detail.appendChild(meta);

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
      detail.appendChild(link);
    } else {
      detail.append(
        renderAnswerSection("Section 1", entry.section1),
        renderAnswerSection("Section 2 — student response", entry.section2)
      );
    }

    return detail;
  }

  function renderList() {
    const list = document.getElementById("hw-submissions-list");
    const meta = document.getElementById("hw-submissions-meta");
    const session = options?.getTeacherSession?.();
    if (!list || !session) return;

    const searchInput = document.getElementById("hw-submissions-search");
    const studentFilter = document.getElementById("hw-submissions-student");
    const q = String(searchInput?.value || "")
      .trim()
      .toLowerCase();

    let filtered = submissionsCache.slice();
    if (q) {
      filtered = filtered.filter((entry) => submissionSearchText(entry).includes(q));
    }
    filtered.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

    list.replaceChildren();
    if (meta) {
      const studentLabel =
        studentFilter && studentFilter.value
          ? " · " + studentFilter.selectedOptions[0]?.textContent
          : "";
      meta.textContent =
        filtered.length +
        " submission" +
        (filtered.length === 1 ? "" : "s") +
        (q ? ' matching “' + searchInput.value.trim() + "”' : "") +
        studentLabel +
        (submissionsCache.length !== filtered.length ? " of " + submissionsCache.length : "");
    }

    if (!filtered.length) {
      const li = document.createElement("li");
      li.className = "hw-submissions-item hw-submissions-item--empty";
      const p = document.createElement("p");
      p.textContent = submissionsCache.length
        ? "No submissions match. Try another student or keyword."
        : "No submissions stored yet. They appear here when students submit homework online or upload a photo.";
      li.appendChild(p);
      list.appendChild(li);
      return;
    }

    filtered.forEach((entry) => {
      const li = document.createElement("li");
      li.className =
        "hw-submissions-item" + (entry.id === expandedId ? " hw-submissions-item--open" : "");

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
      type.textContent = entry.type === "photo" ? "Photo" : "Online";

      top.append(date, type);

      const title = document.createElement("h3");
      title.className = "hw-submissions-item__title";
      title.textContent = entry.displayName + " — " + (entry.lessonName || entry.title || entry.assignmentId);

      const sub = document.createElement("p");
      sub.className = "hw-submissions-item__sub";
      sub.textContent =
        entry.type === "photo"
          ? "Printed homework · " + entry.assignmentId
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
      viewBtn.textContent = entry.id === expandedId ? "Hide" : "View";
      viewBtn.addEventListener("click", () => {
        expandedId = entry.id === expandedId ? null : entry.id;
        renderList();
      });

      actions.appendChild(viewBtn);
      li.append(main, actions);

      if (entry.id === expandedId) {
        li.appendChild(renderDetail(entry, session));
      }

      list.appendChild(li);
    });
  }

  async function reloadSubmissions() {
    const session = options?.getTeacherSession?.();
    if (!session || session.role !== "teacher") return;

    const studentFilter = document.getElementById("hw-submissions-student");
    const student = studentFilter ? studentFilter.value : "";

    try {
      submissionsCache = await fetchSubmissions(session, student);
      if (expandedId && !submissionsCache.some((entry) => entry.id === expandedId)) {
        expandedId = null;
      }
      renderList();
    } catch (err) {
      const meta = document.getElementById("hw-submissions-meta");
      if (meta) meta.textContent = err.message || "Could not load submissions.";
    }
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    const search = document.getElementById("hw-submissions-search");
    const studentFilter = document.getElementById("hw-submissions-student");
    const refreshBtn = document.getElementById("hw-submissions-refresh");

    if (search) search.addEventListener("input", renderList);
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
  }

  function init(opts) {
    options = opts || {};
    bindOnce();
    void reloadSubmissions();
  }

  global.HwTeacherSubmissions = { init, reload: reloadSubmissions };
})(window);
