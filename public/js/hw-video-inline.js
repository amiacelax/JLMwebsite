/**
 * Inline video record + save for worksheet video prompts.
 * Students may choose video or audio-only before recording.
 */
(function (global) {
  const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
  const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
  const MAX_RECORD_MS = 3 * 60 * 1000;
  const controllers = new WeakMap();

  function pickVideoRecorderMimeType() {
    if (global.HwCompat?.pickRecorderMimeType) {
      return global.HwCompat.pickRecorderMimeType();
    }
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function pickAudioRecorderMimeType() {
    if (global.HwCompat?.pickRecorderMimeType) {
      return global.HwCompat.pickRecorderMimeType([
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/mpeg",
      ]);
    }
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/mpeg",
    ];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function extensionForMime(mimeType, mode) {
    if (mode === "audio") {
      if (mimeType.includes("mp4")) return "m4a";
      if (mimeType.includes("mpeg")) return "mp3";
      if (mimeType.includes("ogg")) return "ogg";
      return "webm";
    }
    return mimeType.includes("mp4") ? "mp4" : "webm";
  }

  function formatTimer(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min + ":" + String(sec).padStart(2, "0");
  }

  const ICON_CAMERA =
    '<svg class="hw-video-inline__glyph hw-video-inline__glyph--camera" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>' +
    '<circle cx="12" cy="13" r="3"/>' +
    "</svg>";

  const ICON_MIC =
    '<svg class="hw-video-inline__glyph hw-video-inline__glyph--mic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>' +
    '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
    '<line x1="12" x2="12" y1="19" y2="22"/>' +
    "</svg>";

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
        return { ok: false, message: result.message || "Could not save your answer." };
      }
    }

    for (const el of mounts) {
      const ctrl = controllers.get(el);
      const label = ctrl?.meta?.promptLabel?.trim() || "Answer";
      if (getState(el) !== "saved" || !el.dataset.mediaId?.trim()) {
        return { ok: false, message: "Record and save: " + label };
      }
    }

    return { ok: true };
  }

  /**
   * @param {HTMLElement} mount
   * @param {{ username?: string, displayName?: string, assignmentId?: string, lessonName?: string, promptId?: string, promptLabel?: string }} meta
   */
  function emitWorksheetAnswerChange(el) {
    el?.closest("form")?.dispatchEvent(new CustomEvent("hw-worksheet-answer", { bubbles: true }));
  }

  function submissionMediaUrl(mediaId) {
    return "/api/hw-m/" + encodeURIComponent(String(mediaId || "").trim());
  }

  /**
   * Read-only playback for archived / reviewed worksheet answers (video only).
   * @param {HTMLElement} mountEl
   * @param {{ mediaId?: string, mediaKind?: string }} options
   */
  function mountPlayback(mountEl, options) {
    options = options || {};
    const mediaId = String(options.mediaId || "").trim();
    if (!mountEl || !mediaId) return;
    if (options.mediaKind === "audio") return;

    const url = submissionMediaUrl(mediaId);

    mountEl.className = "hw-video-inline hw-video-inline--playback";
    mountEl.dataset.mediaId = mediaId;
    mountEl.dataset.mediaKind = "video";
    mountEl.dataset.bound = "playback";
    mountEl.hidden = false;
    mountEl.replaceChildren();

    const wrap = document.createElement("div");
    wrap.className = "hw-video-inline__playback-only";
    const video = document.createElement("video");
    video.setAttribute("aria-label", "Your recorded answer");
    const player =
      global.HwCompat?.enhanceVideoElement?.(video, url, { compact: true }) ||
      (function () {
        video.className = "hw-video-inline__playback hw-video-inline__playback--submitted";
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.src = url;
        return video;
      })();
    if (player !== video) {
      player.classList.add("hw-video-inline__playback", "hw-video-inline__playback--submitted");
    }
    wrap.appendChild(player);
    mountEl.appendChild(wrap);
  }

  function mount(mount, meta) {
    if (!mount || mount.dataset.bound === "true") return;
    mount.dataset.bound = "true";
    meta = meta || {};

    mount.className = "hw-video-inline";
    mount.innerHTML =
      '<div class="hw-video-inline__card">' +
      '<div class="hw-video-inline__idle">' +
      '<div class="hw-video-inline__mode" data-mode="video" role="group" aria-label="Choose video or audio recording">' +
      '<span class="hw-video-inline__mode-slider" aria-hidden="true"></span>' +
      '<button type="button" class="hw-video-inline__mode-btn is-active" data-mode="video" aria-pressed="true">' +
      ICON_CAMERA +
      "<span>Video</span></button>" +
      '<button type="button" class="hw-video-inline__mode-btn" data-mode="audio" aria-pressed="false">' +
      ICON_MIC +
      "<span>Audio only</span></button>" +
      "</div>" +
      '<div class="hw-video-inline__placeholder" aria-hidden="true">' +
      '<span class="hw-video-inline__media-icon">' +
      ICON_CAMERA +
      ICON_MIC +
      "</span>" +
      '<p class="hw-video-inline__idle-label">Record your spoken answer</p>' +
      '<p class="hw-video-inline__idle-hint">Camera + mic · up to 3 minutes</p>' +
      "</div>" +
      '<button type="button" class="btn btn--primary hw-video-inline__start">Start recording</button>' +
      "</div>" +
      '<div class="hw-video-inline__live" hidden>' +
      '<div class="hw-video-inline__viewport hw-video-inline__live-viewport">' +
      '<video class="hw-video-inline__live-video" playsinline muted autoplay aria-hidden="true"></video>' +
      '<span class="hw-video-inline__rec-badge"><span class="hw-video-inline__rec-dot"></span>REC</span>' +
      '<span class="hw-video-inline__timer" aria-live="polite">0:00</span>' +
      "</div>" +
      '<div class="hw-video-inline__audio-live" hidden>' +
      '<p class="hw-video-inline__audio-rec-label" aria-live="polite">Recording…</p>' +
      '<span class="hw-video-inline__rec-badge hw-video-inline__rec-badge--inline"><span class="hw-video-inline__rec-dot"></span>REC</span>' +
      '<span class="hw-video-inline__audio-timer" aria-live="polite">0:00</span>' +
      "</div>" +
      '<div class="hw-video-inline__toolbar">' +
      '<button type="button" class="btn btn--primary hw-video-inline__stop">Stop recording</button>' +
      '<button type="button" class="btn btn--ghost hw-video-inline__cancel">Cancel</button>' +
      "</div>" +
      "</div>" +
      '<div class="hw-video-inline__preview" hidden>' +
      '<div class="hw-video-inline__viewport hw-video-inline__preview-viewport" hidden>' +
      '<video class="hw-video-inline__playback" playsinline aria-hidden="true" hidden></video>' +
      "</div>" +
      '<p class="hw-video-inline__preview-label">Review your clip, then save it.</p>' +
      '<div class="hw-video-inline__toolbar">' +
      '<button type="button" class="btn btn--primary hw-video-inline__save">Save video</button>' +
      '<button type="button" class="btn btn--ghost hw-video-inline__retake">Re-record</button>' +
      "</div>" +
      "</div>" +
      '<div class="hw-video-inline__saved" hidden>' +
      '<div class="hw-video-inline__saved-badge" aria-hidden="true">✓</div>' +
      '<p class="hw-video-inline__saved-title">Answer saved</p>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-video-inline__record-again">Record again?</button>' +
      "</div>" +
      "</div>" +
      '<p class="hw-video-inline__status" role="status" aria-live="polite"></p>';

    const cardEl = mount.querySelector(".hw-video-inline__card");
    const idleEl = mount.querySelector(".hw-video-inline__idle");
    const liveEl = mount.querySelector(".hw-video-inline__live");
    const previewEl = mount.querySelector(".hw-video-inline__preview");
    const savedEl = mount.querySelector(".hw-video-inline__saved");
    const liveViewportEl = mount.querySelector(".hw-video-inline__live-viewport");
    const previewViewportEl = mount.querySelector(".hw-video-inline__preview-viewport");
    const audioLiveEl = mount.querySelector(".hw-video-inline__audio-live");
    const liveVideo = mount.querySelector(".hw-video-inline__live-video");
    const playbackVideo = mount.querySelector(".hw-video-inline__playback");
    const timerEl = mount.querySelector(".hw-video-inline__timer");
    const audioTimerEl = mount.querySelector(".hw-video-inline__audio-timer");
    const idleHintEl = mount.querySelector(".hw-video-inline__idle-hint");
    const saveBtn = mount.querySelector(".hw-video-inline__save");
    const savedTitleEl = mount.querySelector(".hw-video-inline__saved-title");
    const previewLabelEl = mount.querySelector(".hw-video-inline__preview-label");
    const statusEl = mount.querySelector(".hw-video-inline__status");
    const modeEl = mount.querySelector(".hw-video-inline__mode");
    const modeBtns = mount.querySelectorAll(".hw-video-inline__mode-btn");

    let recordMode = "video";
    let mediaStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordedBlob = null;
    let recordedMimeType = "video/webm";
    let previewObjectUrl = "";
    let recordStartedAt = 0;
    let recordTimerId = null;

    function isAudioMode() {
      return recordMode === "audio";
    }

    function setStatus(msg, tone) {
      if (!statusEl) return;
      statusEl.textContent = msg || "";
      statusEl.dataset.tone = tone || "";
    }

    function setCardState(state) {
      if (cardEl) cardEl.dataset.state = state;
    }

    function saveButtonLabel() {
      return isAudioMode() ? "Save audio" : "Save video";
    }

    function updateIdleCopy() {
      if (idleHintEl) {
        idleHintEl.textContent = isAudioMode()
          ? "Microphone only · up to 3 minutes"
          : "Camera + mic · up to 3 minutes";
      }
      if (saveBtn) saveBtn.textContent = saveButtonLabel();
    }

    function setMode(mode) {
      const nextMode = mode === "audio" ? "audio" : "video";
      if (recordMode === nextMode) return;
      recordMode = nextMode;
      if (modeEl) modeEl.dataset.mode = recordMode;
      modeBtns.forEach((btn) => {
        const active = btn.dataset.mode === recordMode;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      updateIdleCopy();
    }

    function setModeLocked(locked) {
      modeBtns.forEach((btn) => {
        btn.disabled = locked;
      });
    }

    function activeTimerEl() {
      return isAudioMode() ? audioTimerEl : timerEl;
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
      global.HwWorksheet?.clearAudioAnswerReplay?.(mount);
      global.HwWorksheet?.clearVideoAnswerReplay?.(mount);
    }

    function clearSavedMedia() {
      delete mount.dataset.mediaId;
      delete mount.dataset.mediaKind;
    }

    function hideAllPanels() {
      if (idleEl) idleEl.hidden = true;
      if (liveEl) liveEl.hidden = true;
      if (previewEl) previewEl.hidden = true;
      if (savedEl) savedEl.hidden = true;
    }

    function showIdle() {
      stopStream();
      stopTimer();
      mediaRecorder = null;
      hideAllPanels();
      if (idleEl) idleEl.hidden = false;
      setCardState("idle");
      setModeLocked(false);
      if (timerEl) timerEl.textContent = "0:00";
      if (audioTimerEl) audioTimerEl.textContent = "0:00";
      updateIdleCopy();
    }

    function showLive() {
      hideAllPanels();
      if (liveEl) liveEl.hidden = false;
      setCardState("live");
      setModeLocked(true);
      if (isAudioMode()) {
        if (liveViewportEl) liveViewportEl.hidden = true;
        if (audioLiveEl) audioLiveEl.hidden = false;
      } else {
        if (liveViewportEl) liveViewportEl.hidden = false;
        if (audioLiveEl) audioLiveEl.hidden = true;
      }
    }

    function showPreview() {
      stopStream();
      stopTimer();
      hideAllPanels();
      if (previewEl) previewEl.hidden = false;
      setCardState("preview");
      if (previewViewportEl) previewViewportEl.hidden = true;
      if (saveBtn) saveBtn.textContent = saveButtonLabel();
      if (previewLabelEl) {
        previewLabelEl.textContent = isAudioMode()
          ? "Clip ready — save or re-record."
          : "Review your clip, then save it.";
      }
    }

    function showSaved() {
      if (!mount.dataset.mediaId?.trim()) {
        resetUi();
        return;
      }
      hideAllPanels();
      if (savedEl) savedEl.hidden = false;
      setCardState("saved");
      if (savedTitleEl) {
        savedTitleEl.textContent = isAudioMode() ? "Audio saved" : "Video saved";
      }
      if (isAudioMode() && mount.dataset.mediaId) {
        global.HwWorksheet?.setAudioAnswerReplay?.(mount, submissionMediaUrl(mount.dataset.mediaId), {
          ariaLabel: "Your recorded answer",
        });
      } else if (!isAudioMode() && mount.dataset.mediaId) {
        global.HwWorksheet?.setVideoAnswerReplay?.(mount, submissionMediaUrl(mount.dataset.mediaId), {
          ariaLabel: "Your recorded answer",
        });
      }
      emitWorksheetAnswerChange(mount);
    }

    function resetUi() {
      clearRecording();
      clearSavedMedia();
      showIdle();
    }

    function finishRecording() {
      if (!recordedChunks.length) {
        setStatus("Nothing was recorded — try again.", "error");
        resetUi();
        return;
      }
      recordedBlob = new Blob(recordedChunks, { type: recordedMimeType });
      const maxBytes = isAudioMode() ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;
      const maxLabel = isAudioMode() ? "12 MB" : "24 MB";
      if (recordedBlob.size > maxBytes) {
        setStatus("Too large (max " + maxLabel + "). Record a shorter clip.", "error");
        resetUi();
        return;
      }
      if (!isAudioMode() && !String(recordedBlob.type || "").startsWith("video/")) {
        setStatus(
          "Camera video wasn’t captured — allow the camera and record again (or switch to Audio).",
          "error"
        );
        resetUi();
        return;
      }
      if (isAudioMode()) {
        previewObjectUrl = URL.createObjectURL(recordedBlob);
        global.HwWorksheet?.setAudioAnswerReplay?.(mount, previewObjectUrl, {
          ariaLabel: "Recorded answer preview",
        });
      } else {
        previewObjectUrl = URL.createObjectURL(recordedBlob);
        global.HwWorksheet?.setVideoAnswerReplay?.(mount, previewObjectUrl, {
          ariaLabel: "Recorded answer preview",
        });
      }
      showPreview();
      setStatus("");
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      stopTimer();
    }

    async function startVideoRecording() {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      if (liveVideo) {
        liveVideo.srcObject = mediaStream;
        await liveVideo.play();
      }

      recordedMimeType = pickVideoRecorderMimeType() || "video/webm";
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
    }

    async function startAudioRecording() {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      recordedMimeType = pickAudioRecorderMimeType() || "audio/webm";
      try {
        mediaRecorder = new MediaRecorder(mediaStream, {
          mimeType: recordedMimeType,
          audioBitsPerSecond: 96000,
        });
      } catch {
        try {
          mediaRecorder = new MediaRecorder(mediaStream, { mimeType: recordedMimeType });
        } catch {
          mediaRecorder = new MediaRecorder(mediaStream);
        }
      }
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
      clearSavedMedia();
      setStatus("");

      try {
        if (isAudioMode()) {
          await startAudioRecording();
        } else {
          await startVideoRecording();
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
        const timerTarget = activeTimerEl();
        if (timerTarget) timerTarget.textContent = "0:00";
        recordTimerId = setInterval(() => {
          const elapsed = Date.now() - recordStartedAt;
          const label = formatTimer(elapsed);
          if (timerEl) timerEl.textContent = label;
          if (audioTimerEl) audioTimerEl.textContent = label;
          if (elapsed >= MAX_RECORD_MS) stopRecording();
        }, 500);
      } catch {
        setStatus(
          isAudioMode() ? "Microphone access denied or unavailable." : "Camera access denied or unavailable.",
          "error"
        );
        resetUi();
      }
    }

    async function uploadRecording() {
      if (!recordedBlob) {
        return { ok: false, message: "Record a clip first." };
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = extensionForMime(recordedMimeType, recordMode);
      const file = new File([recordedBlob], "prompt-" + (meta.promptId || stamp) + "." + ext, {
        type: recordedMimeType,
      });

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving…";
      }
      setStatus(isAudioMode() ? "Saving audio…" : "Saving video…", "pending");

      const body = new FormData();
      body.append(isAudioMode() ? "audio" : "video", file);
      body.append("username", meta.username || "");
      body.append("displayName", meta.displayName || meta.username || "");
      body.append(
        "assignmentId",
        meta.assignmentId || (isAudioMode() ? "audio-homework" : "video-homework")
      );
      body.append(
        "lessonName",
        meta.lessonName || (isAudioMode() ? "Audio homework" : "Video homework")
      );
      if (meta.promptId) body.append("promptId", meta.promptId);
      if (meta.promptLabel) body.append("promptLabel", meta.promptLabel);
      body.append("inlineSave", "1");

      const endpoint = isAudioMode() ? "/api/homework-audio-upload" : "/api/homework-video-upload";

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Save failed.");
        if (data.mediaId) {
          mount.dataset.mediaId = data.mediaId;
          mount.dataset.mediaKind = isAudioMode() ? "audio" : "video";
        }
        clearRecording();
        showSaved();
        setStatus("");
        return { ok: true };
      } catch (err) {
        const message = (err && err.message) || "Save failed — try again.";
        setStatus(message, "error");
        return { ok: false, message };
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = saveButtonLabel();
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

    modeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (getState(mount) !== "idle" || btn.disabled) return;
        setMode(btn.dataset.mode || "video");
      });
    });

    mount.querySelector(".hw-video-inline__start")?.addEventListener("click", startRecording);
    mount.querySelector(".hw-video-inline__stop")?.addEventListener("click", stopRecording);
    mount.querySelector(".hw-video-inline__cancel")?.addEventListener("click", () => {
      stopRecording();
      resetUi();
      setStatus("");
    });
    mount.querySelector(".hw-video-inline__retake")?.addEventListener("click", () => {
      const wasSaved = getState(mount) === "saved";
      resetUi();
      setStatus("");
      if (wasSaved) emitWorksheetAnswerChange(mount);
    });
    mount.querySelector(".hw-video-inline__record-again")?.addEventListener("click", () => {
      resetUi();
      setStatus("");
      emitWorksheetAnswerChange(mount);
    });
    mount.querySelector(".hw-video-inline__save")?.addEventListener("click", saveRecording);

    updateIdleCopy();
    showIdle();
  }

  global.HwVideoInline = { mount, mountPlayback, prepareForSubmit, mediaUrl: submissionMediaUrl };
})(window);
