/**
 * Student platform — load catalog, render worksheet, save answers, lesson links.
 */
(function () {
  const session = HwAuth.getSession();
  if (!session) return;

  const greet = document.getElementById("hw-platform-greet");
  if (greet) greet.textContent = session.displayName;

  document.getElementById("hw-platform-logout")?.addEventListener("click", () => {
    HwAuth.logout();
    window.location.href = HwAuth.LOGIN_PATH;
  });

  document.querySelectorAll("[data-placeholder]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const msg = btn.getAttribute("data-placeholder-msg") || "Coming soon.";
      showToast(msg);
    });
  });

  const toastEl = document.getElementById("hw-platform-toast");
  let toastTimer = 0;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
  }

  function isYoutubeReady(url) {
    return url && !String(url).startsWith("REPLACE_");
  }

  function bindWorksheetSave(form, assignmentMeta) {
    if (!form || !session.username) return;
    const assignmentId = assignmentMeta.id || form.getAttribute("data-assignment-id");
    const storageKey = `jlm-hw-answers-${session.username}-${assignmentId}`;
    const inputs = form.querySelectorAll(".hw-blank");
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      inputs.forEach((inp) => {
        if (inp.name && saved[inp.name] != null) inp.value = saved[inp.name];
      });
    } catch (_) {}

    const saveStatus = document.getElementById("hw-save-status");
    form.addEventListener("input", () => {
      const data = {};
      inputs.forEach((inp) => {
        if (inp.name) data[inp.name] = inp.value;
      });
      localStorage.setItem(storageKey, JSON.stringify(data));
      if (saveStatus) saveStatus.textContent = "Saved in your browser.";
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const report = HwWorksheet.checkHomework(form);
      HwWorksheet.renderCheckResults(form, report);
      const { correct, total } = report.score;

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const payload = HwWorksheet.buildSubmitPayload(
        form,
        {
          username: session.username,
          displayName: session.displayName,
          assignmentId,
          lessonName: assignmentMeta.lessonName,
          title: assignmentMeta.title,
          register: assignmentMeta.register,
        },
        report
      );

      try {
        const res = await fetch("/api/homework-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Submit failed.");
        }
        if (saveStatus) {
          saveStatus.textContent =
            data.message ||
            (total > 0
              ? "Submitted! Section 1: " + correct + "/" + total + ". JD received your answers."
              : "Submitted! JD received your answers.");
        }
        showToast("Sent to JD");
      } catch (err) {
        if (saveStatus) {
          saveStatus.textContent =
            (err && err.message) ||
            "Could not submit. Answers are still saved in this browser.";
        }
        showToast("Submit failed");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function renderAssignmentList(assignments, currentId) {
    const list = document.getElementById("hw-assignment-list");
    if (!list) return;
    list.innerHTML = "";
    if (!assignments.length) {
      list.innerHTML =
        '<li class="hw-platform-card__row hw-platform-card__row--empty"><span>No assignments yet</span><button type="button" class="btn btn--ghost btn--sm" disabled>Open</button></li>';
      return;
    }
    assignments.forEach((a) => {
      const li = document.createElement("li");
      li.className = "hw-platform-card__row";
      const label = document.createElement("span");
      label.textContent = a.lessonName || (a.date || "") + " — " + (a.title || a.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--ghost btn--sm";
      btn.textContent = a.id === currentId ? "Open" : "View";
      if (a.id === currentId) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => {
          window.location.hash = "hw-" + a.id;
          loadHub();
        });
      }
      li.append(label, btn);
      list.appendChild(li);
    });
  }

  function setLessonLinks(assignment, playlistUrl) {
    const lessonBtn = document.getElementById("hw-latest-lesson");
    const playlistLink = document.getElementById("hw-playlist-link");
    const lessonMeta = document.getElementById("hw-lesson-meta");

    if (lessonBtn) {
      if (assignment && isYoutubeReady(assignment.youtubeUrl)) {
        lessonBtn.href = assignment.youtubeUrl;
        lessonBtn.textContent = "Watch your latest lesson";
        lessonBtn.removeAttribute("data-placeholder");
        lessonBtn.classList.remove("btn--ghost");
        lessonBtn.classList.add("btn--primary");
      } else {
        lessonBtn.removeAttribute("href");
        lessonBtn.textContent = "Watch lesson (YouTube link coming soon)";
        lessonBtn.classList.add("btn--ghost");
        lessonBtn.classList.remove("btn--primary");
      }
    }

    if (lessonMeta && assignment) {
      lessonMeta.textContent =
        assignment.lessonName ||
        (assignment.date ? assignment.date + " · " : "") + (assignment.title || "");
    }

    if (playlistLink) {
      if (isYoutubeReady(playlistUrl)) {
        playlistLink.href = playlistUrl;
        playlistLink.hidden = false;
      } else {
        playlistLink.hidden = true;
      }
    }
  }

  async function loadHub() {
    const mount = document.getElementById("hw-worksheet-mount");
    const heading = document.getElementById("hw-worksheet-heading");
    const intro = document.getElementById("hw-worksheet-intro");

    let catalog;
    try {
      const res = await fetch("/homework/catalog.json", { cache: "no-store" });
      if (!res.ok) throw new Error("catalog");
      catalog = await res.json();
    } catch {
      if (intro) intro.textContent = "Could not load homework catalog.";
      return;
    }

    const user = session.username;
    const mine = (catalog.assignments || []).filter((a) => (a.students || []).includes(user));
    mine.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const hashId = window.location.hash.replace(/^#hw-/, "");
    const active =
      mine.find((a) => a.id === hashId) || mine[0] || null;

    renderAssignmentList(mine, active?.id);
    setLessonLinks(active, catalog.playlistUrl);

    if (!active || !mount) {
      if (heading) heading.textContent = "Current homework";
      if (intro) intro.textContent = "No assignment is linked to your account yet.";
      mount.innerHTML = "";
      return;
    }

    let assignment;
    try {
      const res = await fetch("/homework/assignments/" + active.id + ".json", { cache: "no-store" });
      if (!res.ok) throw new Error("assignment");
      assignment = await res.json();
    } catch {
      if (intro) intro.textContent = "Could not load this worksheet.";
      return;
    }

    if (heading) {
      heading.textContent = active.studentLabel
        ? "Homework — " + active.studentLabel
        : "Current homework";
    }
    if (intro) {
      intro.textContent =
        "Fill in the blanks, then Submit homework. Section 1 is auto-checked; Section 2 is sent to JD on Discord.";
    }

    const form = HwWorksheet.render(mount, assignment);
    bindWorksheetSave(form, assignment);
  }

  loadHub();
  window.addEventListener("hashchange", loadHub);
})();
