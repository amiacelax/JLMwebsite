/**
 * Homework platform — student hub (assignments + submit) or teacher hub (worksheet library).
 */
(function () {
  const global = window;
  const session = HwAuth.getSession();
  if (!session) return;

  const isTeacher = session.role === "teacher";

  const VIDEO_RESPONSE_DESC =
    "Receive detailed, enriching video feedback from JD on each homework assignment.";

  const greet = document.getElementById("hw-platform-greet");
  if (greet) {
    greet.textContent = session.displayName + (isTeacher ? " · Teacher" : "");
  }

  function renderAccountBar() {
    const badges = document.getElementById("hw-platform-badges");
    if (!badges || isTeacher) return;
    badges.hidden = false;
    badges.replaceChildren();

    const labelPill = document.createElement("span");
    labelPill.className = "hw-account-badge hw-account-badge--label";
    labelPill.textContent = session.accountLabelDisplay || "Homework Only";

    const tierPill = document.createElement("span");
    tierPill.className = "hw-account-badge hw-account-badge--tier";
    tierPill.textContent = session.tierDisplay || HwAuth.getTierMeta(session)?.name || "—";

    badges.append(labelPill, tierPill);
  }

  function renderPendingNotice() {
    if (isTeacher || session.tier !== "pending") return;
    const desc = document.getElementById("hw-hub-desc");
    if (desc) {
      desc.textContent =
        "Your account is ready. Pick a homework plan on the Homework page, or unlock courses from Courses — checkout uses your login.";
    }
  }

  function bindWeeklyUpgradeCard() {
    const card = document.getElementById("hw-weekly-upgrade-card");
    const btn = document.getElementById("hw-weekly-upgrade-btn");
    if (!card || !btn || btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";
    card.hidden = !HwAuth.canShowWeeklyHomeworkUpgrade(session);
    btn.addEventListener("click", () => {
      showToast(
        "Weekly homework add-on ($" +
          HwAuth.WEEKLY_HOMEWORK_UPGRADE_PRICE +
          "/mo) — PayPal coming soon. Message JD to sign up."
      );
    });
  }

  /** Student-safe labels — never show another learner's name from catalog/JSON. */
  function studentViewMeta(catalogEntry, assignment) {
    const date = assignment?.date || catalogEntry?.date || "";
    const title =
      assignment?.title || catalogEntry?.title || catalogEntry?.id || "Homework";
    const line = date ? date + " · " + title : title;
    const lessonName = date ? date + " — " + title : title;
    return {
      listLabel: line,
      lessonMeta: line,
      heading: "Your homework",
      lessonName,
      title,
      date,
    };
  }

  function getStudentMedia(catalog) {
    const profile = catalog?.studentProfiles?.[session.username] || {};
    return {
      latestLessonUrl: profile.latestLessonUrl || profile.youtubeUrl || null,
      lessonPlaylistUrl:
        profile.lessonPlaylistUrl ||
        profile.reviewPlaylistUrl ||
        catalog?.playlistUrl ||
        null,
      reviewPlaylistUrl:
        profile.reviewPlaylistUrl || catalog?.reviewPlaylistUrl || catalog?.playlistUrl || null,
    };
  }

  function courseStatusButton(labelLocked, labelUnlock, onClick, ariaLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "course-card__status";
    if (ariaLabel) btn.setAttribute("aria-label", ariaLabel);
    btn.innerHTML =
      '<span class="course-card__status-text course-card__status-text--locked">' +
      labelLocked +
      '</span><span class="course-card__status-text course-card__status-text--unlock">' +
      labelUnlock +
      "</span>";
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
  }

  function courseStatusLink(labelLocked, labelUnlock, href, ariaLabel) {
    const link = document.createElement("a");
    link.className = "course-card__status course-card__status-link";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (ariaLabel) link.setAttribute("aria-label", ariaLabel);
    link.innerHTML =
      '<span class="course-card__status-text course-card__status-text--locked">' +
      labelLocked +
      '</span><span class="course-card__status-text course-card__status-text--unlock">' +
      labelUnlock +
      "</span>";
    return link;
  }

  function renderVideoResponseCard(catalog) {
    const card = document.getElementById("hw-video-response-card");
    const desc = document.getElementById("hw-video-response-desc");
    const footer = document.getElementById("hw-video-response-footer");
    if (!footer) return;
    footer.replaceChildren();

    const media = getStudentMedia(catalog);
    const price = document.createElement("span");
    price.className = "course-card__price";
    price.setAttribute("aria-label", "Price: " + HwAuth.VIDEO_RESPONSE_ADDON_PRICE + " dollars per month");

    if (HwAuth.hasVideoResponseAccess(session)) {
      card?.classList.add("hw-addon-card--active");
      if (desc) desc.textContent = VIDEO_RESPONSE_DESC + " Open your review playlist below.";
      price.textContent = "✓";
      price.setAttribute("aria-label", "Video responses included");

      const playlistUrl = media.reviewPlaylistUrl;
      if (isYoutubeReady(playlistUrl)) {
        footer.append(
          courseStatusLink("Playlist", "Open", playlistUrl, "Open HW Review Playlist on YouTube"),
          price
        );
      } else {
        footer.append(
          courseStatusButton("Soon", "Soon", null, "HW Review Playlist coming soon"),
          price
        );
        footer.querySelector("button")?.setAttribute("disabled", "true");
      }
      return;
    }

    card?.classList.remove("hw-addon-card--active");
    price.textContent = "$" + HwAuth.VIDEO_RESPONSE_ADDON_PRICE;

    if (HwAuth.canOfferVideoUnlock(session)) {
      if (desc) desc.textContent = VIDEO_RESPONSE_DESC;
      const videoPaypal =
        global.HwCheckout?.buildCheckoutUrl?.("video-feedback", session) ||
        HwAuth.PAYPAL?.videoFeedback;
      footer.append(
        videoPaypal
          ? courseStatusLink(
              "Locked",
              "Subscribe",
              videoPaypal,
              "Subscribe to Video Feedback HW — fifteen dollars per four weeks"
            )
          : courseStatusButton("Locked", "Soon", null, "Video feedback subscription link coming soon"),
        price
      );
      return;
    }

    if (desc) desc.textContent = VIDEO_RESPONSE_DESC + " Included on Unlimited (Tier 3).";
    footer.append(
      courseStatusButton("Tier 3", "Tier 3", null, "Video responses require Unlimited tier"),
      price
    );
    footer.querySelector("button")?.setAttribute("disabled", "true");
  }

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

  function assignmentFileUrl(id) {
    return new URL("/homework/assignments/" + id + ".json", window.location.origin).href;
  }

  function studentWorksheetUrl(id) {
    return window.location.origin + "/homework/platform.html#hw-" + id;
  }

  function librarySearchText(entry) {
    return [
      entry.id,
      entry.title,
      entry.date,
      entry.lessonName,
      entry.studentLabel,
      entry.summary,
      (entry.tags || []).join(" "),
      (entry.students || []).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  async function fetchCatalog() {
    const res = await fetch("/api/homework-catalog", { cache: "no-store" });
    if (!res.ok) throw new Error("catalog");
    return res.json();
  }

  function normalizeAssignmentPayload(data) {
    if (!data) return null;
    if (data.sections && Array.isArray(data.sections)) return data;
    if (data.assignment && data.assignment.sections) return data.assignment;
    return data;
  }

  async function fetchAssignmentJson(id) {
    try {
      const res = await fetch(
        "/api/homework-assignment?id=" + encodeURIComponent(id),
        { cache: "no-store" }
      );
      if (res.ok) {
        const assignment = normalizeAssignmentPayload(await res.json());
        if (assignment?.sections?.length) return assignment;
      }
    } catch {
      /* fall through to static file */
    }
    const staticRes = await fetch(
      "/homework/assignments/" + encodeURIComponent(id) + ".json",
      { cache: "no-store" }
    );
    if (!staticRes.ok) throw new Error("assignment");
    const assignment = normalizeAssignmentPayload(await staticRes.json());
    if (!assignment?.sections?.length) throw new Error("assignment");
    return assignment;
  }

  function bindWorksheetSave(form, assignmentMeta, options) {
    options = options || {};
    if (!form || !session.username || options.preview) return;

    const submitMeta = isTeacher
      ? assignmentMeta
      : {
          ...assignmentMeta,
          ...studentViewMeta(null, assignmentMeta),
        };

    const assignmentId = assignmentMeta.id || form.getAttribute("data-assignment-id");
    const storageKey = `jlm-hw-answers-${session.username}-${assignmentId}`;
    const inputs = form.querySelectorAll("input.hw-blank, textarea.hw-blank");
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
      const report = HwWorksheet.collectHomeworkAnswers(form);
      HwWorksheet.renderCheckResults(form);

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      const payload = HwWorksheet.buildSubmitPayload(
        form,
        {
          username: session.username,
          displayName: session.displayName,
          assignmentId: assignmentId || assignmentMeta.id || form.getAttribute("data-assignment-id"),
          lessonName:
            submitMeta.lessonName ||
            assignmentMeta.lessonName ||
            assignmentMeta.title ||
            assignmentId,
          title: submitMeta.title || assignmentMeta.title,
          register: assignmentMeta.register,
        },
        report
      );

      if (!payload.assignmentId) {
        if (saveStatus) {
          saveStatus.textContent = "Worksheet id missing — refresh the page and try again.";
        }
        showToast("Submit failed");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
      if (!payload.section1?.length && !payload.section2?.length) {
        if (saveStatus) {
          saveStatus.textContent = "Fill in at least one blank before submitting.";
        }
        showToast("Nothing to submit");
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

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
          saveStatus.textContent = data.message || "Submitted! JD received your answers.";
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

  async function loadWorksheetPreview(catalogEntry) {
    const mount = document.getElementById("hw-worksheet-mount");
    const heading = document.getElementById("hw-worksheet-heading");
    const intro = document.getElementById("hw-worksheet-intro");
    if (!mount || !catalogEntry) return;

    let assignment;
    try {
      assignment = await fetchAssignmentJson(catalogEntry.id);
    } catch {
      if (intro) intro.textContent = "Could not load this worksheet.";
      mount.innerHTML = "";
      return;
    }

    if (heading) heading.textContent = "Preview — " + (catalogEntry.title || catalogEntry.id);
    if (intro) {
      intro.textContent =
        "Teacher preview (blank template). Download JSON or copy the student link — add the student username to catalog “students” so they can open it.";
    }

    const form = HwWorksheet.render(mount, assignment, { preview: true });
    bindWorksheetSave(form, assignment, { preview: true });
  }

  function bindCurrentAssignmentPills(active) {
    const pillOnline = document.getElementById("hw-pill-online");
    const pillPrint = document.getElementById("hw-pill-print");
    const pillsWrap = pillOnline?.closest(".hw-current-assignment__pills");

    if (!active) {
      if (pillsWrap) pillsWrap.hidden = true;
      return;
    }

    if (pillsWrap) pillsWrap.hidden = false;
    if (pillOnline) {
      pillOnline.hidden = false;
      pillOnline.href = "#hw-worksheet-section";
      pillOnline.onclick = () => {
        const targetHash = "hw-" + active.id;
        if (window.location.hash !== "#" + targetHash) {
          window.location.hash = targetHash;
        }
      };
    }
    if (pillPrint) {
      pillPrint.onclick = () => requestPrintHomework(active);
    }
  }

  function requestPrintHomework(active) {
    const tryPrint = () => {
      const form = document.getElementById("hw-worksheet-form");
      if (!form || typeof window.HwWorksheet?.printBlank !== "function") return false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      return window.HwWorksheet.printBlank(form);
    };

    if (tryPrint()) return;

    if (active?.id) {
      const targetHash = "hw-" + active.id;
      if (window.location.hash !== "#" + targetHash) {
        window.location.hash = targetHash;
      }
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      if (tryPrint() || ++attempts > 50) {
        window.clearInterval(timer);
        if (attempts > 50) {
          showToast("Homework is still loading — try again in a moment.");
        }
      }
    }, 150);
  }

  function renderCurrentAssignmentCard(assignments, currentId) {
    const titleEl = document.getElementById("hw-current-assignment-title");
    const pillOnline = document.getElementById("hw-pill-online");
    if (!titleEl) return;

    const active = assignments.find((a) => a.id === currentId) || assignments[0] || null;
    if (!active) {
      titleEl.textContent = "No assignment linked to your account yet.";
      if (pillOnline) pillOnline.hidden = true;
      bindCurrentAssignmentPills(null);
      return;
    }

    titleEl.textContent = studentViewMeta(active, null).listLabel;
    bindCurrentAssignmentPills(active);
  }

  function setLessonLinks(assignment, catalog) {
    const lessonBtn = document.getElementById("hw-latest-lesson");
    const lessonPlaylist = document.getElementById("hw-lesson-playlist");
    const lessonMeta = document.getElementById("hw-lesson-meta");
    const media = getStudentMedia(catalog);
    const lessonUrl = media.latestLessonUrl || assignment?.youtubeUrl;

    if (lessonBtn) {
      if (isYoutubeReady(lessonUrl)) {
        lessonBtn.href = lessonUrl;
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

    if (lessonPlaylist) {
      const playlistUrl = media.lessonPlaylistUrl;
      if (isYoutubeReady(playlistUrl)) {
        lessonPlaylist.href = playlistUrl;
        lessonPlaylist.hidden = false;
      } else {
        lessonPlaylist.hidden = true;
      }
    }

    if (lessonMeta) {
      const catalogEntry = assignment || {};
      lessonMeta.textContent = studentViewMeta(catalogEntry, assignment).lessonMeta;
    }
  }

  function renderLibraryList(entries, query, activeId) {
    const list = document.getElementById("hw-library-list");
    const meta = document.getElementById("hw-library-meta");
    if (!list) return;

    const q = String(query || "")
      .trim()
      .toLowerCase();
    const filtered = entries.filter((e) => !q || librarySearchText(e).includes(q));
    filtered.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    list.innerHTML = "";
    if (meta) {
      meta.textContent =
        filtered.length +
        " worksheet" +
        (filtered.length === 1 ? "" : "s") +
        (q ? ' matching “' + query.trim() + "”" : "") +
        (entries.length !== filtered.length ? " of " + entries.length : "");
    }

    if (!filtered.length) {
      list.innerHTML =
        '<li class="hw-library-item hw-library-item--empty"><p>No worksheets match. Try tags like <em>たい</em>, <em>negative</em>, or a lesson title.</p></li>';
      return;
    }

    filtered.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "hw-library-item" + (entry.id === activeId ? " hw-library-item--active" : "");

      const main = document.createElement("div");
      main.className = "hw-library-item__main";

      const title = document.createElement("h3");
      title.className = "hw-library-item__title";
      title.textContent = entry.title || entry.id;

      const sub = document.createElement("p");
      sub.className = "hw-library-item__sub";
      sub.textContent = [entry.lessonName || entry.title, (entry.students || []).join(", ")]
        .filter(Boolean)
        .join(" · ");

      if (entry.summary) {
        const sum = document.createElement("p");
        sum.className = "hw-library-item__summary";
        sum.textContent = entry.summary;
        main.append(title, sub, sum);
      } else {
        main.append(title, sub);
      }

      if (entry.tags && entry.tags.length) {
        const tags = document.createElement("div");
        tags.className = "hw-library-tags";
        entry.tags.forEach((tag) => {
          const pill = document.createElement("span");
          pill.className = "hw-library-tag";
          pill.textContent = tag;
          tags.appendChild(pill);
        });
        main.appendChild(tags);
      }

      const actions = document.createElement("div");
      actions.className = "hw-library-item__actions";

      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.className = "btn btn--primary btn--sm";
      previewBtn.textContent = entry.id === activeId ? "Previewing" : "Preview";
      if (entry.id === activeId) previewBtn.disabled = true;
      previewBtn.addEventListener("click", () => {
        window.location.hash = "hw-" + entry.id;
        loadTeacherHub();
      });

      const dl = document.createElement("a");
      dl.className = "btn btn--ghost btn--sm";
      dl.href = assignmentFileUrl(entry.id);
      dl.download = entry.id + ".json";
      dl.textContent = "Download";

      const copyJson = document.createElement("button");
      copyJson.type = "button";
      copyJson.className = "btn btn--ghost btn--sm";
      copyJson.textContent = "Copy JSON URL";
      copyJson.addEventListener("click", () => {
        copyText(assignmentFileUrl(entry.id), "JSON file URL copied");
      });

      const copyStudent = document.createElement("button");
      copyStudent.type = "button";
      copyStudent.className = "btn btn--ghost btn--sm";
      copyStudent.textContent = "Copy student link";
      copyStudent.addEventListener("click", () => {
        const students = (entry.students || []).join(", ") || "(add students in catalog)";
        copyText(
          studentWorksheetUrl(entry.id),
          "Student link copied — allowed: " + students
        );
      });

      const editMaker = document.createElement("button");
      editMaker.type = "button";
      editMaker.className = "btn btn--ghost btn--sm";
      editMaker.textContent = "Open in editor";
      editMaker.addEventListener("click", () => {
        openInTeacherEditor(entry.id);
      });

      actions.append(previewBtn, dl, copyJson, copyStudent, editMaker);
      li.append(main, actions);
      list.appendChild(li);
    });
  }

  function bindPhotoUpload(activeAssignment) {
    const form = document.getElementById("hw-photo-upload-form");
    const fileInput = document.getElementById("hw-photo-file");
    const status = document.getElementById("hw-photo-upload-status");
    const startBtn = document.getElementById("hw-photo-open-camera");
    const captureBtn = document.getElementById("hw-photo-capture-btn");
    const cancelBtn = document.getElementById("hw-photo-cancel-camera");
    const retakeBtn = document.getElementById("hw-photo-retake");
    const idlePanel = document.getElementById("hw-photo-capture-idle");
    const livePanel = document.getElementById("hw-photo-capture-live");
    const previewPanel = document.getElementById("hw-photo-capture-preview");
    const videoEl = document.getElementById("hw-photo-capture-video");
    const previewImg = document.getElementById("hw-photo-capture-img");
    if (!form) return;
    form.dataset.assignmentId = activeAssignment?.id || "printed-homework";
    const photoMeta = activeAssignment
      ? studentViewMeta(null, activeAssignment)
      : { lessonName: "Printed homework" };
    form.dataset.lessonName = photoMeta.lessonName;
    if (form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    let cameraStream = null;
    let capturedBlob = null;
    let previewObjectUrl = "";

    function setStatus(message) {
      if (status) status.textContent = message || "";
    }

    function stopCamera() {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        cameraStream = null;
      }
      if (videoEl) videoEl.srcObject = null;
    }

    function clearCapture() {
      capturedBlob = null;
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
      }
      if (previewImg) previewImg.removeAttribute("src");
    }

    function showCaptureIdle() {
      stopCamera();
      idlePanel?.removeAttribute("hidden");
      livePanel?.setAttribute("hidden", "");
      previewPanel?.setAttribute("hidden", "");
    }

    function showCaptureLive() {
      idlePanel?.setAttribute("hidden", "");
      livePanel?.removeAttribute("hidden");
      previewPanel?.setAttribute("hidden", "");
    }

    function showCapturePreview() {
      stopCamera();
      idlePanel?.setAttribute("hidden", "");
      livePanel?.setAttribute("hidden", "");
      previewPanel?.removeAttribute("hidden");
    }

    function resetCaptureUi() {
      clearCapture();
      showCaptureIdle();
    }

    function resolvePhotoFile() {
      const picked = fileInput?.files?.[0];
      if (picked) return picked;
      if (!capturedBlob) return null;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return new File([capturedBlob], `homework-camera-${stamp}.jpg`, {
        type: capturedBlob.type || "image/jpeg",
      });
    }

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Camera capture is not supported in this browser.");
        return;
      }
      clearCapture();
      if (fileInput) fileInput.value = "";
      setStatus("");

      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (videoEl) {
          videoEl.srcObject = cameraStream;
          await videoEl.play();
        }
        showCaptureLive();
      } catch (err) {
        stopCamera();
        showCaptureIdle();
        const name = err && err.name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setStatus("Camera access was blocked. Allow camera permission and try again.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setStatus("No camera found on this device.");
        } else {
          setStatus("Could not start camera. Try uploading a file instead.");
        }
      }
    }

    function capturePhoto() {
      if (!videoEl || !cameraStream) return;
      const width = videoEl.videoWidth;
      const height = videoEl.videoHeight;
      if (!width || !height) {
        setStatus("Camera is still loading — wait a moment and try again.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setStatus("Could not capture photo. Try uploading a file instead.");
        return;
      }
      ctx.drawImage(videoEl, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setStatus("Could not capture photo. Try again.");
            return;
          }
          clearCapture();
          capturedBlob = blob;
          previewObjectUrl = URL.createObjectURL(blob);
          if (previewImg) previewImg.src = previewObjectUrl;
          showCapturePreview();
          setStatus("Photo captured — tap Upload homework photo when ready.");
        },
        "image/jpeg",
        0.9
      );
    }

    startBtn?.addEventListener("click", () => {
      openCamera();
    });

    captureBtn?.addEventListener("click", () => {
      capturePhoto();
    });

    cancelBtn?.addEventListener("click", () => {
      resetCaptureUi();
      setStatus("");
    });

    retakeBtn?.addEventListener("click", () => {
      clearCapture();
      openCamera();
    });

    fileInput?.addEventListener("change", () => {
      if (fileInput.files?.[0]) {
        resetCaptureUi();
        setStatus("");
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopCamera();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = resolvePhotoFile();
      if (!file) {
        setStatus("Choose a file or open the camera to capture a photo first.");
        return;
      }
      const submitBtn = document.getElementById("hw-photo-upload-submit");
      if (submitBtn) submitBtn.disabled = true;
      stopCamera();
      setStatus("Uploading photo…");

      const body = new FormData();
      body.append("photo", file);
      body.append("username", session.username || "");
      body.append("displayName", session.displayName || session.username || "");
      body.append("assignmentId", form.dataset.assignmentId || "printed-homework");
      body.append("lessonName", form.dataset.lessonName || "Printed homework");

      try {
        const res = await fetch("/api/homework-photo-upload", {
          method: "POST",
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        setStatus(data.message || "Photo uploaded.");
        showToast("Photo uploaded");
        form.reset();
        resetCaptureUi();
      } catch (err) {
        setStatus((err && err.message) || "Upload failed.");
        showToast("Photo upload failed");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function bindVideoUpload(activeAssignment) {
    const form = document.getElementById("hw-video-upload-form");
    const fileInput = document.getElementById("hw-video-file");
    const status = document.getElementById("hw-video-upload-status");
    const startBtn = document.getElementById("hw-video-start-recording");
    const stopBtn = document.getElementById("hw-video-stop-recording");
    const cancelBtn = document.getElementById("hw-video-cancel-recording");
    const retakeBtn = document.getElementById("hw-video-retake");
    const idlePanel = document.getElementById("hw-video-capture-idle");
    const livePanel = document.getElementById("hw-video-capture-live");
    const previewPanel = document.getElementById("hw-video-capture-preview");
    const liveVideo = document.getElementById("hw-video-capture-preview-live");
    const playbackVideo = document.getElementById("hw-video-capture-playback");
    const timerEl = document.getElementById("hw-video-recording-timer");
    if (!form) return;

    const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
    const MAX_VIDEO_MS = 3 * 60 * 1000;

    form.dataset.assignmentId = activeAssignment?.id || "video-homework";
    const videoMeta = activeAssignment
      ? studentViewMeta(null, activeAssignment)
      : { lessonName: "Video homework" };
    form.dataset.lessonName = videoMeta.lessonName;
    if (form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    let mediaStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordedBlob = null;
    let recordedMimeType = "video/webm";
    let previewObjectUrl = "";
    let recordStartedAt = 0;
    let recordTimerId = null;

    function setStatus(message) {
      if (status) status.textContent = message || "";
    }

    function pickRecorderMimeType() {
      if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
      const types = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    }

    function extensionForMime(mimeType) {
      if (mimeType.includes("mp4")) return "mp4";
      return "webm";
    }

    function formatTimer(ms) {
      const totalSec = Math.floor(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      return min + ":" + String(sec).padStart(2, "0");
    }

    function stopTimer() {
      if (recordTimerId) {
        clearInterval(recordTimerId);
        recordTimerId = null;
      }
    }

    function stopStream() {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        mediaStream = null;
      }
      if (liveVideo) liveVideo.srcObject = null;
    }

    function clearRecording() {
      recordedBlob = null;
      recordedChunks = [];
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
      }
      if (playbackVideo) {
        playbackVideo.removeAttribute("src");
        playbackVideo.load();
      }
    }

    function showIdle() {
      stopStream();
      stopTimer();
      mediaRecorder = null;
      idlePanel?.removeAttribute("hidden");
      livePanel?.setAttribute("hidden", "");
      previewPanel?.setAttribute("hidden", "");
      if (timerEl) timerEl.textContent = "0:00";
    }

    function showLive() {
      idlePanel?.setAttribute("hidden", "");
      livePanel?.removeAttribute("hidden");
      previewPanel?.setAttribute("hidden", "");
    }

    function showPreview() {
      stopStream();
      stopTimer();
      idlePanel?.setAttribute("hidden", "");
      livePanel?.setAttribute("hidden", "");
      previewPanel?.removeAttribute("hidden");
    }

    function resetUi() {
      clearRecording();
      showIdle();
    }

    function resolveVideoFile() {
      const picked = fileInput?.files?.[0];
      if (picked) return picked;
      if (!recordedBlob) return null;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = extensionForMime(recordedMimeType);
      return new File([recordedBlob], `homework-video-${stamp}.${ext}`, {
        type: recordedMimeType,
      });
    }

    function finishRecording() {
      if (!recordedChunks.length) {
        setStatus("No video was recorded. Try again.");
        resetUi();
        return;
      }
      recordedBlob = new Blob(recordedChunks, { type: recordedMimeType });
      if (recordedBlob.size > MAX_VIDEO_BYTES) {
        setStatus("Recording is too large (max 24 MB). Record a shorter clip.");
        resetUi();
        return;
      }
      previewObjectUrl = URL.createObjectURL(recordedBlob);
      if (playbackVideo) playbackVideo.src = previewObjectUrl;
      showPreview();
      setStatus("Video ready — tap Upload video when you're happy with it.");
    }

    async function startRecording() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Video recording is not supported in this browser.");
        return;
      }
      if (typeof MediaRecorder === "undefined") {
        setStatus("Video recording is not supported in this browser. Upload a file instead.");
        return;
      }

      clearRecording();
      if (fileInput) fileInput.value = "";
      setStatus("");

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        });
        if (liveVideo) {
          liveVideo.srcObject = mediaStream;
          await liveVideo.play();
        }

        recordedMimeType = pickRecorderMimeType() || "video/webm";
        try {
          mediaRecorder = new MediaRecorder(mediaStream, {
            mimeType: recordedMimeType,
            videoBitsPerSecond: 900000,
            audioBitsPerSecond: 96000,
          });
        } catch {
          try {
            mediaRecorder = new MediaRecorder(mediaStream, { mimeType: recordedMimeType });
          } catch {
            mediaRecorder = new MediaRecorder(mediaStream);
          }
        }
        recordedMimeType = mediaRecorder.mimeType || recordedMimeType;
        recordedChunks = [];
        mediaRecorder.addEventListener("dataavailable", (event) => {
          if (event.data && event.data.size > 0) recordedChunks.push(event.data);
        });
        mediaRecorder.addEventListener("stop", finishRecording);
        mediaRecorder.start(1000);
        recordStartedAt = Date.now();
        if (timerEl) timerEl.textContent = "0:00";
        recordTimerId = setInterval(() => {
          const elapsed = Date.now() - recordStartedAt;
          if (timerEl) timerEl.textContent = formatTimer(elapsed);
          if (elapsed >= MAX_VIDEO_MS) stopRecording();
        }, 500);
        showLive();
      } catch (err) {
        resetUi();
        const name = err && err.name;
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setStatus("Camera/mic access was blocked. Allow permission and try again.");
        } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          setStatus("No camera or microphone found on this device.");
        } else {
          setStatus("Could not start recording. Try uploading a video file instead.");
        }
      }
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      } else {
        finishRecording();
      }
      stopStream();
      stopTimer();
    }

    startBtn?.addEventListener("click", () => {
      startRecording();
    });

    stopBtn?.addEventListener("click", () => {
      stopRecording();
    });

    cancelBtn?.addEventListener("click", () => {
      recordedChunks = [];
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.onstop = null;
        try {
          mediaRecorder.stop();
        } catch {
          /* ignore */
        }
      }
      resetUi();
      setStatus("");
    });

    retakeBtn?.addEventListener("click", () => {
      clearRecording();
      startRecording();
    });

    fileInput?.addEventListener("change", () => {
      if (fileInput.files?.[0]) {
        resetUi();
        setStatus("");
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && mediaRecorder && mediaRecorder.state === "recording") {
        stopRecording();
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = resolveVideoFile();
      if (!file) {
        setStatus("Choose a video file or record one first.");
        return;
      }
      if (file.size > MAX_VIDEO_BYTES) {
        setStatus("Video must be under 24 MB.");
        return;
      }

      const submitBtn = document.getElementById("hw-video-upload-submit");
      if (submitBtn) submitBtn.disabled = true;
      stopRecording();
      setStatus("Uploading video…");

      const body = new FormData();
      body.append("video", file);
      body.append("username", session.username || "");
      body.append("displayName", session.displayName || session.username || "");
      body.append("assignmentId", form.dataset.assignmentId || "video-homework");
      body.append("lessonName", form.dataset.lessonName || "Video homework");

      try {
        const res = await fetch("/api/homework-video-upload", {
          method: "POST",
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        setStatus(data.message || "Video uploaded.");
        showToast("Video uploaded");
        form.reset();
        resetUi();
      } catch (err) {
        setStatus((err && err.message) || "Upload failed.");
        showToast("Video upload failed");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  function copyText(text, toastMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast(toastMsg),
        () => fallbackCopy(text, toastMsg)
      );
    } else {
      fallbackCopy(text, toastMsg);
    }
  }

  function fallbackCopy(text, toastMsg) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast(toastMsg);
    } catch {
      showToast("Could not copy — select and copy manually.");
    }
    document.body.removeChild(ta);
  }

  let catalogCache = null;
  let librarySearchBound = false;

  function getCatalogEntry(id) {
    return (catalogCache?.assignments || []).find((e) => e.id === id) || null;
  }

  function initTeacherEditor() {
    if (!global.HwTeacherEditor) return;
    const mount = document.getElementById("hw-teacher-maker-mount");
    if (!mount) return;
    if (mount.querySelector("#hw-worksheet-form")) return;
    HwTeacherEditor.init({
      showToast,
      fetchAssignmentJson,
      fetchCatalog,
      getCatalogEntry,
      getTeacherSession: () => session,
      getStudentAccounts: function () {
        if (global.HwAuth && typeof global.HwAuth.listStudentAccounts === "function") {
          return global.HwAuth.listStudentAccounts();
        }
        return [];
      },
      isStudentAccount: function (username) {
        if (global.HwAuth && typeof global.HwAuth.isStudentAccount === "function") {
          return global.HwAuth.isStudentAccount(username);
        }
        return ["joshs", "benm", "deme", "ivan"].includes(String(username || "").toLowerCase());
      },
      onWorksheetSaved: async function () {
        catalogCache = null;
        try {
          catalogCache = await fetchCatalog();
          HwTeacherEditor.refreshCatalog(
            catalogCache.assignments || [],
            catalogCache.studentProfiles || {}
          );
        } catch {
          /* ignore */
        }
      },
      onPublished: async function (id) {
        catalogCache = null;
        try {
          catalogCache = await fetchCatalog();
          HwTeacherEditor.refreshCatalog(
            catalogCache.assignments || [],
            catalogCache.studentProfiles || {}
          );
          if (id) {
            const publishSelect = document.getElementById("hw-teacher-publish-worksheet");
            if (publishSelect) publishSelect.value = id;
          }
        } catch {
          /* ignore */
        }
        showToast("Student can refresh their hub to see changes");
      },
    });
  }

  async function openInTeacherEditor(id) {
    document.getElementById("hw-teacher-tab-maker")?.click();
    const makerPanel = document.getElementById("hw-teacher-maker");
    if (makerPanel) makerPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      const assignment = await fetchAssignmentJson(id);
      HwTeacherEditor.loadAssignment(assignment, getCatalogEntry(id));
      showToast("Loaded " + id);
    } catch {
      showToast("Could not load worksheet");
    }
  }

  function initTeacherTabs() {
    const tablist = document.querySelector(".hw-teacher-tabs");
    if (!tablist || tablist.dataset.bound === "true") return;
    tablist.dataset.bound = "true";

    const tabs = tablist.querySelectorAll("[data-teacher-tab]");
    const panels = {
      account: document.getElementById("hw-teacher-account"),
      maker: document.getElementById("hw-teacher-maker"),
      homework: document.getElementById("hw-teacher-homework"),
      library: document.getElementById("hw-teacher-library"),
      ideas: document.getElementById("hw-teacher-ideas"),
      submissions: document.getElementById("hw-teacher-submissions"),
      promo: document.getElementById("hw-teacher-promo"),
      birthdays: document.getElementById("hw-teacher-birthdays"),
      harris: document.getElementById("hw-teacher-harris"),
      gamelab: document.getElementById("hw-teacher-gamelab"),
    };

    function activate(name) {
      tabs.forEach((tab) => {
        const on = tab.getAttribute("data-teacher-tab") === name;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-selected", on ? "true" : "false");
      });
      Object.keys(panels).forEach((key) => {
        const panel = panels[key];
        if (panel) panel.hidden = key !== name;
      });
      try {
        localStorage.setItem("jlm-hw-teacher-tab", name);
      } catch {
        /* ignore */
      }
      if (name === "ideas" && global.HwTeacherIdeas?.reloadIfNeeded) {
        HwTeacherIdeas.reloadIfNeeded();
      }
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        activate(tab.getAttribute("data-teacher-tab") || "account");
      });
    });

    let initial = "maker";
    try {
      const saved = localStorage.getItem("jlm-hw-teacher-tab");
      if (
        saved === "maker" ||
        saved === "homework" ||
        saved === "account" ||
        saved === "library" ||
        saved === "ideas" ||
        saved === "submissions" ||
        saved === "promo" ||
        saved === "birthdays" ||
        saved === "harris" ||
        saved === "gamelab"
      ) {
        initial = saved;
      }
    } catch {
      /* ignore */
    }
    document.getElementById("hw-harris-copy-link")?.addEventListener("click", async () => {
      const url = new URL("/preview/harris-notarization/", window.location.origin).href;
      try {
        await navigator.clipboard.writeText(url);
        showToast("Preview link copied.");
      } catch {
        showToast("Could not copy link.");
      }
    });

    activate(initial);
    return activate;
  }

  async function loadTeacherHub() {
    document.body.classList.add("hw-role-teacher");
    document.documentElement.classList.add("hw-is-teacher");

    const hubTitle = document.getElementById("hw-hub-title");
    const hubDesc = document.getElementById("hw-hub-desc");
    const teacherHub = document.getElementById("hw-teacher-hub");
    const studentOnly = document.getElementById("hw-platform-student-only");

    if (hubTitle) hubTitle.textContent = "Teacher's hub";
    if (hubDesc) {
      hubDesc.textContent =
        "Worksheet maker → Homework → Student info → Library → Ideas & memos → Submissions → Email list → Birthdays.";
    }
    if (teacherHub) teacherHub.hidden = false;
    if (studentOnly) studentOnly.hidden = true;

    const activateTeacherTab = initTeacherTabs();
    initTeacherEditor();
    if (global.HwTeacherIdeas?.init) {
      HwTeacherIdeas.init({
        getTeacherSession: () => session,
        showToast,
      });
    }
    if (global.HwTeacherSubmissions?.init) {
      HwTeacherSubmissions.init({
        getTeacherSession: () => session,
        showToast,
      });
    }
    if (global.HwTeacherPromo?.init) {
      HwTeacherPromo.init({
        getTeacherSession: () => session,
        showToast,
      });
    }
    if (global.HwTeacherBirthdays?.init) {
      HwTeacherBirthdays.init({
        getTeacherSession: () => session,
        showToast,
      });
    }

    const searchInput = document.getElementById("hw-library-search");
    if (!catalogCache) {
      try {
        catalogCache = await fetchCatalog();
      } catch {
        const meta = document.getElementById("hw-library-meta");
        if (meta) meta.textContent = "Could not load worksheet library.";
        if (global.HwTeacherEditor?.bootstrap) await HwTeacherEditor.bootstrap();
        return;
      }
    }

    const entries = catalogCache.assignments || [];
    const hashId = window.location.hash.replace(/^#hw-/, "");
    if (global.HwTeacherEditor?.refreshCatalog) {
      HwTeacherEditor.refreshCatalog(entries, catalogCache.studentProfiles || {});
    }
    if (global.HwTeacherEditor?.bootstrap) {
      HwTeacherEditor.bootstrap();
    }

    if (searchInput && !librarySearchBound) {
      librarySearchBound = true;
      searchInput.addEventListener("input", () => {
        const id = window.location.hash.replace(/^#hw-/, "");
        renderLibraryList(entries, searchInput.value, id);
      });
    }

    renderLibraryList(entries, searchInput ? searchInput.value : "", hashId);

    if (hashId) {
      if (activateTeacherTab) activateTeacherTab("maker");
      await openInTeacherEditor(hashId);
    }
  }

  async function loadStudentHub() {
    document.body.classList.add("hw-role-student");

    const teacherHub = document.getElementById("hw-teacher-hub");
    const studentOnly = document.getElementById("hw-platform-student-only");
    if (teacherHub) teacherHub.hidden = true;
    if (studentOnly) studentOnly.hidden = false;

    const mount = document.getElementById("hw-worksheet-mount");
    const heading = document.getElementById("hw-worksheet-heading");
    const intro = document.getElementById("hw-worksheet-intro");

    let catalog;
    try {
      catalog = await fetchCatalog();
    } catch {
      if (intro) intro.textContent = "Could not load homework catalog.";
      return;
    }

    const user = session.username;
    const mine = (catalog.assignments || []).filter((a) => (a.students || []).includes(user));
    mine.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const hashId = window.location.hash.replace(/^#hw-/, "");
    const active = mine.find((a) => a.id === hashId) || mine[0] || null;

    renderCurrentAssignmentCard(mine, active?.id);
    setLessonLinks(active, catalog);
    renderVideoResponseCard(catalog);
    bindPhotoUpload(active);
    bindVideoUpload(active);

    if (!active || !mount) {
      if (heading) heading.textContent = "Current homework";
      if (intro) intro.textContent = "No assignment is linked to your account yet.";
      mount.innerHTML = "";
      return;
    }

    let assignment;
    try {
      assignment = await fetchAssignmentJson(active.id);
    } catch {
      if (intro) intro.textContent = "Could not load this worksheet.";
      return;
    }

    const view = studentViewMeta(active, assignment);

    if (heading) heading.textContent = view.heading;
    if (intro) {
      intro.textContent =
        "Fill in the blanks, then Submit homework. JD will review your answers on Discord.";
    }

    const form = HwWorksheet.render(mount, assignment);
    const saveMeta = {
      ...assignment,
      id: assignment.id || active.id,
      title: assignment.title || active.title,
      lessonName:
        assignment.lessonName || active.lessonName || active.title || active.id,
      date: assignment.date || active.date,
      register: assignment.register || "casual",
    };
    if (!form.getAttribute("data-assignment-id") && saveMeta.id) {
      form.setAttribute("data-assignment-id", saveMeta.id);
    }
    bindWorksheetSave(form, saveMeta);
  }

  function ensureTeacherEditorMounted() {
    if (!isTeacher) return;
    initTeacherEditor();
  }

  function init() {
    if (isTeacher) {
      initTeacherEditor();
      void loadTeacherHub();
      requestAnimationFrame(ensureTeacherEditorMounted);
      setTimeout(ensureTeacherEditorMounted, 0);
    } else {
      renderAccountBar();
      renderPendingNotice();
      bindWeeklyUpgradeCard();
      loadStudentHub();
      window.addEventListener("hashchange", loadStudentHub);
    }
  }

  init();
})();
