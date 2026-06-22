/**
 * Inline video record + save for worksheet video prompts.
 */
(function (global) {
  const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
  const MAX_VIDEO_MS = 3 * 60 * 1000;
  const controllers = new WeakMap();

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
    return mimeType.includes("mp4") ? "mp4" : "webm";
  }

  function formatTimer(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min + ":" + String(sec).padStart(2, "0");
  }

  function getState(mountEl) {
    return mountEl?.querySelector(".hw-video-inline__card")?.dataset.state || "idle";
  }

  function mountsInForm(form) {
    return form ? Array.from(form.querySelectorAll(".hw-video-inline[data-bound]")) : [];
  }

  /**
   * Upload pending clips and verify every video prompt is saved before homework submit.
   * @param {HTMLFormElement} form
   * @returns {Promise<{ ok: boolean, message?: string }>}
   */
  async function prepareForSubmit(form) {
    const mounts = mountsInForm(form);
    if (!mounts.length) return { ok: true };

    for (const el of mounts) {
      if (getState(el) === "live") {
        return { ok: false, message: "Stop recording before sending homework." };
      }
    }

    for (const el of mounts) {
      const ctrl = controllers.get(el);
      if (!ctrl || getState(el) !== "preview") continue;
      const result = await ctrl.upload();
      if (!result.ok) {
        return { ok: false, message: result.message || "Could not save a video answer." };
      }
    }

    for (const el of mounts) {
      const ctrl = controllers.get(el);
      const label = ctrl?.meta?.promptLabel?.trim() || "Video answer";
      if (getState(el) !== "saved") {
        return { ok: false, message: "Record and save: " + label };
      }
    }

    return { ok: true };
  }

  /**
   * @param {HTMLElement} mount
   * @param {{ username?: string, displayName?: string, assignmentId?: string, lessonName?: string, promptId?: string, promptLabel?: string }} meta
   */
  function mount(mount, meta) {
    if (!mount || mount.dataset.bound === "true") return;
    mount.dataset.bound = "true";
    meta = meta || {};

    mount.className = "hw-video-inline";
    mount.innerHTML =
      '<div class="hw-video-inline__card">' +
      '<div class="hw-video-inline__idle">' +
      '<div class="hw-video-inline__placeholder" aria-hidden="true">' +
      '<span class="hw-video-inline__camera-icon">▶</span>' +
      '<p class="hw-video-inline__idle-label">Record your spoken answer</p>' +
      '<p class="hw-video-inline__idle-hint">Camera + mic · up to 3 minutes</p>' +
      "</div>" +
      '<button type="button" class="btn btn--primary hw-video-inline__start">Start recording</button>' +
      "</div>" +
      '<div class="hw-video-inline__live" hidden>' +
      '<div class="hw-video-inline__viewport">' +
      '<video class="hw-video-inline__live-video" playsinline muted autoplay aria-hidden="true"></video>' +
      '<span class="hw-video-inline__rec-badge"><span class="hw-video-inline__rec-dot"></span>REC</span>' +
      '<span class="hw-video-inline__timer" aria-live="polite">0:00</span>' +
      "</div>" +
      '<div class="hw-video-inline__toolbar">' +
      '<button type="button" class="btn btn--primary hw-video-inline__stop">Stop recording</button>' +
      '<button type="button" class="btn btn--ghost hw-video-inline__cancel">Cancel</button>' +
      "</div>" +
      "</div>" +
      '<div class="hw-video-inline__preview" hidden>' +
      '<div class="hw-video-inline__viewport">' +
      '<video class="hw-video-inline__playback" playsinline controls aria-label="Recorded answer preview"></video>' +
      "</div>" +
      '<p class="hw-video-inline__preview-label">Review your clip, then save it.</p>' +
      '<div class="hw-video-inline__toolbar">' +
      '<button type="button" class="btn btn--primary hw-video-inline__save">Save video</button>' +
      '<button type="button" class="btn btn--ghost hw-video-inline__retake">Re-record</button>' +
      "</div>" +
      "</div>" +
      '<div class="hw-video-inline__saved" hidden>' +
      '<div class="hw-video-inline__saved-badge" aria-hidden="true">✓</div>' +
      '<p class="hw-video-inline__saved-title">Video saved</p>' +
      '<p class="hw-video-inline__saved-hint">Included when you send homework to JD.</p>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-video-inline__record-again">Record again</button>' +
      "</div>" +
      "</div>" +
      '<p class="hw-video-inline__status" role="status" aria-live="polite"></p>';

    const cardEl = mount.querySelector(".hw-video-inline__card");
    const idleEl = mount.querySelector(".hw-video-inline__idle");
    const liveEl = mount.querySelector(".hw-video-inline__live");
    const previewEl = mount.querySelector(".hw-video-inline__preview");
    const savedEl = mount.querySelector(".hw-video-inline__saved");
    const liveVideo = mount.querySelector(".hw-video-inline__live-video");
    const playbackVideo = mount.querySelector(".hw-video-inline__playback");
    const timerEl = mount.querySelector(".hw-video-inline__timer");
    const statusEl = mount.querySelector(".hw-video-inline__status");

    let mediaStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordedBlob = null;
    let recordedMimeType = "video/webm";
    let previewObjectUrl = "";
    let recordStartedAt = 0;
    let recordTimerId = null;

    function setStatus(msg, tone) {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.dataset.tone = tone || "";
    }

    function setCardState(state) {
      if (cardEl) cardEl.dataset.state = state;
    }

    function stopTimer() {
      if (recordTimerId) {
        clearInterval(recordTimerId);
        recordTimerId = null;
      }
    }

    function stopStream() {
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
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

    function hideAllPanels() {
      idleEl?.setAttribute("hidden", "");
      liveEl?.setAttribute("hidden", "");
      previewEl?.setAttribute("hidden", "");
      savedEl?.setAttribute("hidden", "");
    }

    function showIdle() {
      stopStream();
      stopTimer();
      mediaRecorder = null;
      hideAllPanels();
      idleEl?.removeAttribute("hidden");
      setCardState("idle");
      if (timerEl) timerEl.textContent = "0:00";
    }

    function showLive() {
      hideAllPanels();
      liveEl?.removeAttribute("hidden");
      setCardState("live");
    }

    function showPreview() {
      stopStream();
      stopTimer();
      hideAllPanels();
      previewEl?.removeAttribute("hidden");
      setCardState("preview");
    }

    function showSaved() {
      hideAllPanels();
      savedEl?.removeAttribute("hidden");
      setCardState("saved");
    }

    function resetUi() {
      clearRecording();
      showIdle();
    }

    function finishRecording() {
      if (!recordedChunks.length) {
        setStatus("Nothing was recorded — try again.", "error");
        resetUi();
        return;
      }
      recordedBlob = new Blob(recordedChunks, { type: recordedMimeType });
      if (recordedBlob.size > MAX_VIDEO_BYTES) {
        setStatus("Too large (max 24 MB). Record a shorter clip.", "error");
        resetUi();
        return;
      }
      previewObjectUrl = URL.createObjectURL(recordedBlob);
      if (playbackVideo) playbackVideo.src = previewObjectUrl;
      showPreview();
      setStatus("");
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      stopTimer();
    }

    async function startRecording() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Recording is not supported in this browser.", "error");
        return;
      }
      if (typeof MediaRecorder === "undefined") {
        setStatus("Recording is not supported in this browser.", "error");
        return;
      }

      clearRecording();
      setStatus("");

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
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

        mediaRecorder.ondataavailable = (e) => {
          if (e.data?.size) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = finishRecording;
        mediaRecorder.onerror = () => {
          setStatus("Recording error — try again.", "error");
          resetUi();
        };

        mediaRecorder.start(1000);
        recordStartedAt = Date.now();
        showLive();
        recordTimerId = setInterval(() => {
          const elapsed = Date.now() - recordStartedAt;
          if (timerEl) timerEl.textContent = formatTimer(elapsed);
          if (elapsed >= MAX_VIDEO_MS) stopRecording();
        }, 500);
      } catch {
        setStatus("Camera access denied or unavailable.", "error");
        resetUi();
      }
    }

    async function uploadRecording() {
      if (!recordedBlob) {
        return { ok: false, message: "Record a clip first." };
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = extensionForMime(recordedMimeType);
      const file = new File([recordedBlob], "prompt-" + (meta.promptId || stamp) + "." + ext, {
        type: recordedMimeType,
      });

      const saveBtn = mount.querySelector(".hw-video-inline__save");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";
      }
      setStatus("Saving video…", "pending");

      const body = new FormData();
      body.append("video", file);
      body.append("username", meta.username || "");
      body.append("displayName", meta.displayName || meta.username || "");
      body.append("assignmentId", meta.assignmentId || "video-homework");
      body.append("lessonName", meta.lessonName || "Video homework");
      if (meta.promptId) body.append("promptId", meta.promptId);
      if (meta.promptLabel) body.append("promptLabel", meta.promptLabel);

      try {
        const res = await fetch("/api/homework-video-upload", {
          method: "POST",
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Save failed.");
        clearRecording();
        showSaved();
        setStatus(data.message || "Video saved.", "success");
        return { ok: true };
      } catch (err) {
        const message = (err && err.message) || "Save failed — try again.";
        setStatus(message, "error");
        return { ok: false, message };
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save video";
        }
      }
    }

    async function saveRecording() {
      await uploadRecording();
    }

    const controller = {
      meta,
      upload: uploadRecording,
      getState: () => getState(mount),
    };
    controllers.set(mount, controller);

    mount.querySelector(".hw-video-inline__start")?.addEventListener("click", startRecording);
    mount.querySelector(".hw-video-inline__stop")?.addEventListener("click", stopRecording);
    mount.querySelector(".hw-video-inline__cancel")?.addEventListener("click", () => {
      stopRecording();
      resetUi();
      setStatus("");
    });
    mount.querySelector(".hw-video-inline__retake")?.addEventListener("click", () => {
      resetUi();
      setStatus("");
    });
    mount.querySelector(".hw-video-inline__record-again")?.addEventListener("click", () => {
      resetUi();
      setStatus("");
    });
    mount.querySelector(".hw-video-inline__save")?.addEventListener("click", saveRecording);

    showIdle();
  }

  global.HwVideoInline = { mount, prepareForSubmit };
})(window);
