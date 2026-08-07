/**
 * Compact inline audio record + upload for worksheet audio prompts.
 * Also mounts teacher prompt-clip recording for the worksheet maker.
 */
(function (global) {
  const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
  const MAX_AUDIO_MS = 3 * 60 * 1000;

  function pickRecorderMimeType() {
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

  function extensionForMime(mimeType) {
    if (mimeType.includes("mp4")) return "m4a";
    if (mimeType.includes("mpeg")) return "mp3";
    if (mimeType.includes("ogg")) return "ogg";
    return "webm";
  }

  function formatTimer(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min + ":" + String(sec).padStart(2, "0");
  }

  function submissionMediaUrl(mediaId) {
    if (global.HwVideoInline?.mediaUrl) return global.HwVideoInline.mediaUrl(mediaId);
    if (global.HwReviewMedia?.mediaUrl) return global.HwReviewMedia.mediaUrl(mediaId);
    return "/api/hw-m/" + encodeURIComponent(String(mediaId || "").trim());
  }

  function normalizeAudioUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    return global.HwCompat?.normalizeMediaUrl ? global.HwCompat.normalizeMediaUrl(raw) : raw;
  }

  function renderAudioPreview(container, url, ariaLabel) {
    if (!container || !url) return;
    container.replaceChildren();
    if (global.HwWorksheet?.renderListenSlideAudio) {
      container.appendChild(
        global.HwWorksheet.renderListenSlideAudio(url, {
          ariaLabel: ariaLabel || "Audio preview",
        })
      );
      return;
    }
    if (global.HwWorksheet?.renderAudioPlayer) {
      container.appendChild(
        global.HwWorksheet.renderAudioPlayer(url, {
          inline: true,
          listenCard: true,
        })
      );
      container
        .querySelector(".hw-audio-player__el")
        ?.setAttribute("aria-label", ariaLabel || "Audio preview");
      return;
    }
    const audio = document.createElement("audio");
    audio.className = "hw-audio-inline__playback";
    audio.controls = true;
    audio.preload = "metadata";
    audio.setAttribute("aria-label", ariaLabel || "Audio preview");
    audio.src = url;
    container.appendChild(audio);
  }

  function emitWorksheetAnswerChange(el) {
    el?.closest("form")?.dispatchEvent(new CustomEvent("hw-worksheet-answer", { bubbles: true }));
  }

  /**
   * @param {HTMLElement} mount
   * @param {{
   *   username?: string,
   *   displayName?: string,
   *   assignmentId?: string,
   *   lessonName?: string,
   *   promptId?: string,
   *   promptLabel?: string,
   *   startLabel?: string,
   *   saveLabel?: string,
   * }} meta
   */
  function mount(mount, meta) {
    if (!mount || mount.dataset.bound === "true") return;
    mount.dataset.bound = "true";
    meta = meta || {};
    mount.classList.add("hw-audio-inline");

    const startLabel = meta.startLabel || "Record";

    mount.innerHTML =
      '<div class="hw-audio-inline__idle">' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__start"></button>' +
      "</div>" +
      '<div class="hw-audio-inline__live" hidden>' +
      '<p class="hw-audio-inline__recording-label" aria-live="polite">Recording…</p>' +
      '<p class="hw-audio-inline__timer" aria-live="polite">0:00</p>' +
      '<button type="button" class="btn btn--primary btn--sm hw-audio-inline__stop">Stop</button>' +
      "</div>" +
      '<div class="hw-audio-inline__saved" hidden>' +
      '<p class="hw-audio-inline__saved-label">Saved</p>' +
      '<div class="hw-audio-inline__saved-player"></div>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__start-again">Record</button>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__delete">Delete</button>' +
      "</div>" +
      '<p class="hw-audio-inline__status" role="status" aria-live="polite"></p>';

    const startBtn = mount.querySelector(".hw-audio-inline__start");
    if (startBtn) startBtn.textContent = startLabel;
    const startAgainBtn = mount.querySelector(".hw-audio-inline__start-again");
    if (startAgainBtn) startAgainBtn.textContent = startLabel;

    const idleEl = mount.querySelector(".hw-audio-inline__idle");
    const liveEl = mount.querySelector(".hw-audio-inline__live");
    const savedEl = mount.querySelector(".hw-audio-inline__saved");
    const savedPlayerMount = mount.querySelector(".hw-audio-inline__saved-player");
    const timerEl = mount.querySelector(".hw-audio-inline__timer");
    const statusEl = mount.querySelector(".hw-audio-inline__status");
    const stopBtn = mount.querySelector(".hw-audio-inline__stop");

    let mediaStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordedBlob = null;
    let recordedMimeType = "audio/webm";
    let recordStartedAt = 0;
    let recordTimerId = null;
    let uploading = false;

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || "";
    }

    function stopTimer() {
      if (recordTimerId) {
        clearInterval(recordTimerId);
        recordTimerId = null;
      }
    }

    function stopStream() {
      if (mediaStream) {
        if (global.HwCompat?.stopMediaStream) {
          global.HwCompat.stopMediaStream(mediaStream);
        } else {
          mediaStream.getTracks().forEach((t) => t.stop());
        }
        mediaStream = null;
      }
    }

    function clearRecording() {
      recordedBlob = null;
      recordedChunks = [];
    }

    function hideAllPanels() {
      if (idleEl) idleEl.hidden = true;
      if (liveEl) liveEl.hidden = true;
      if (savedEl) savedEl.hidden = true;
    }

    function showIdle() {
      stopStream();
      stopTimer();
      mediaRecorder = null;
      hideAllPanels();
      if (idleEl) idleEl.hidden = false;
      if (timerEl) timerEl.textContent = "0:00";
      if (stopBtn) stopBtn.disabled = false;
    }

    function showLive() {
      hideAllPanels();
      if (liveEl) liveEl.hidden = false;
      if (stopBtn) stopBtn.disabled = false;
    }

    function showSaved() {
      const mediaId = mount.dataset.mediaId?.trim();
      if (!mediaId) {
        showIdle();
        return;
      }
      stopStream();
      stopTimer();
      clearRecording();
      hideAllPanels();
      if (savedEl) savedEl.hidden = false;
      renderAudioPreview(savedPlayerMount, submissionMediaUrl(mediaId), "Your recorded answer");
      emitWorksheetAnswerChange(mount);
    }

    function deleteSaved() {
      if (uploading) return;
      clearRecording();
      delete mount.dataset.mediaId;
      delete mount.dataset.mediaKind;
      delete mount.dataset.hwAnswerSaved;
      if (savedPlayerMount) savedPlayerMount.replaceChildren();
      setStatus("");
      showIdle();
      emitWorksheetAnswerChange(mount);
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        if (stopBtn) stopBtn.disabled = true;
        mediaRecorder.stop();
      }
      stopTimer();
    }

    async function uploadRecording() {
      if (!recordedBlob || uploading) {
        if (!recordedBlob) {
          setStatus("No audio recorded — try again.");
          showIdle();
        }
        return;
      }

      uploading = true;
      setStatus("Saving…");

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = extensionForMime(recordedMimeType);
      const file = new File([recordedBlob], "prompt-" + (meta.promptId || stamp) + "." + ext, {
        type: recordedMimeType,
      });

      const body = new FormData();
      body.append("audio", file);
      body.append("username", meta.username || "");
      body.append("displayName", meta.displayName || meta.username || "");
      body.append("assignmentId", meta.assignmentId || "audio-homework");
      body.append("lessonName", meta.lessonName || "Audio homework");
      if (meta.promptId) body.append("promptId", meta.promptId);
      if (meta.promptLabel) body.append("promptLabel", meta.promptLabel);
      body.append("inlineSave", "1");

      try {
        const res = await fetch("/api/homework-audio-upload", {
          method: "POST",
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        if (data.mediaId) {
          mount.dataset.mediaId = data.mediaId;
          mount.dataset.mediaKind = "audio";
        }
        mount.dataset.hwAnswerSaved = "true";
        setStatus("");
        showSaved();
      } catch (err) {
        setStatus((err && err.message) || "Upload failed.");
        showIdle();
      } finally {
        uploading = false;
        if (stopBtn) stopBtn.disabled = false;
      }
    }

    function finishRecording() {
      stopStream();
      stopTimer();
      if (!recordedChunks.length) {
        setStatus("No audio recorded — try again.");
        showIdle();
        return;
      }
      recordedBlob = new Blob(recordedChunks, { type: recordedMimeType });
      if (recordedBlob.size > MAX_AUDIO_BYTES) {
        setStatus("Too large (max 12 MB). Record a shorter clip.");
        showIdle();
        return;
      }
      void uploadRecording();
    }

    async function startRecording() {
      if (uploading) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("Recording not supported in this browser.");
        return;
      }
      if (typeof MediaRecorder === "undefined") {
        setStatus("Recording not supported in this browser.");
        return;
      }

      delete mount.dataset.hwAnswerSaved;
      clearRecording();
      setStatus("");

      try {
        mediaStream = global.HwCompat?.getStereoUserMedia
          ? await global.HwCompat.getStereoUserMedia({ audio: true })
          : await navigator.mediaDevices.getUserMedia({ audio: true });

        recordedMimeType = pickRecorderMimeType() || "audio/webm";
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
        recordedMimeType = mediaRecorder.mimeType || recordedMimeType;
        recordedChunks = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data?.size) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = finishRecording;
        mediaRecorder.onerror = () => {
          setStatus("Recording error — try again.");
          showIdle();
        };

        mediaRecorder.start(1000);
        recordStartedAt = Date.now();
        showLive();
        recordTimerId = setInterval(() => {
          const elapsed = Date.now() - recordStartedAt;
          if (timerEl) timerEl.textContent = formatTimer(elapsed);
          if (elapsed >= MAX_AUDIO_MS) stopRecording();
        }, 500);
      } catch {
        setStatus("Microphone access denied or unavailable.");
        showIdle();
      }
    }

    mount.querySelector(".hw-audio-inline__start")?.addEventListener("click", startRecording);
    mount.querySelector(".hw-audio-inline__start-again")?.addEventListener("click", startRecording);
    mount.querySelector(".hw-audio-inline__stop")?.addEventListener("click", stopRecording);
    mount.querySelector(".hw-audio-inline__delete")?.addEventListener("click", deleteSaved);

    if (mount.dataset.mediaId?.trim()) showSaved();
    else showIdle();
  }

  const MAX_TEACHER_UPLOAD_BYTES = 24 * 1024 * 1024;

  /**
   * Teacher prompt audio for worksheet maker (record / upload file → review-media KV, or paste URL).
   * @param {HTMLElement} mount
   * @param {{
   *   teacherUsername?: string,
   *   audioUrl?: string,
   *   mediaId?: string,
   *   startLabel?: string,
   *   uploadLabel?: string,
   *   urlLabel?: string,
   *   previewAriaLabel?: string,
   *   onChange?: (next: { audioUrl: string, mediaId?: string }) => void,
   * }} options
   */
  function mountTeacherClip(mount, options) {
    if (!mount || mount.dataset.bound === "true") return;
    mount.dataset.bound = "true";
    options = options || {};
    mount.classList.add("hw-audio-inline", "hw-audio-inline--teacher");

    let audioUrl = String(options.audioUrl || "").trim();
    let mediaId = String(options.mediaId || "").trim();
    const startLabel = options.startLabel || "Record teacher audio";
    const uploadLabel = options.uploadLabel || "Upload audio";
    const urlLabel = options.urlLabel || "Or paste audio URL";
    const previewAria = options.previewAriaLabel || "Teacher prompt audio";

    mount.innerHTML =
      '<div class="hw-audio-inline__teacher-row">' +
      '<div class="hw-audio-inline__idle">' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__start"></button>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__pick-file"></button>' +
      '<input type="file" class="hw-audio-inline__file" accept="audio/*,.mp3,.m4a,.ogg,.webm,.wav,.aac" hidden />' +
      "</div>" +
      '<div class="hw-audio-inline__live" hidden>' +
      '<p class="hw-audio-inline__recording-label" aria-live="polite">Recording…</p>' +
      '<p class="hw-audio-inline__timer" aria-live="polite">0:00</p>' +
      '<button type="button" class="btn btn--primary btn--sm hw-audio-inline__stop">Stop</button>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__cancel">Cancel</button>' +
      "</div>" +
      '<div class="hw-audio-inline__preview" hidden>' +
      '<div class="hw-audio-inline__preview-player"></div>' +
      '<div class="hw-audio-inline__preview-actions">' +
      '<button type="button" class="btn btn--primary btn--sm hw-audio-inline__upload">Save clip</button>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__retake">Record again</button>' +
      "</div>" +
      "</div>" +
      '<div class="hw-audio-inline__saved" hidden>' +
      '<div class="hw-audio-inline__saved-player"></div>' +
      '<div class="hw-audio-inline__saved-actions">' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__record-again">Replace audio</button>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__remove">Remove audio</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<label class="hw-builder__audio-label hw-audio-inline__url-label"></label>' +
      '<p class="hw-audio-inline__status" role="status" aria-live="polite"></p>';

    const startBtn = mount.querySelector(".hw-audio-inline__start");
    if (startBtn) startBtn.textContent = startLabel;
    const pickFileBtn = mount.querySelector(".hw-audio-inline__pick-file");
    if (pickFileBtn) pickFileBtn.textContent = uploadLabel;
    const urlLabelEl = mount.querySelector(".hw-audio-inline__url-label");
    if (urlLabelEl) {
      urlLabelEl.appendChild(document.createTextNode(urlLabel));
      const urlField = document.createElement("input");
      urlField.type = "text";
      urlField.className = "hw-builder__field hw-builder__field--compact hw-audio-inline__url";
      urlField.spellcheck = false;
      urlField.placeholder = "https://… or /api/hw-m/…";
      urlLabelEl.appendChild(urlField);
    }

    const idleEl = mount.querySelector(".hw-audio-inline__idle");
    const liveEl = mount.querySelector(".hw-audio-inline__live");
    const previewEl = mount.querySelector(".hw-audio-inline__preview");
    const savedEl = mount.querySelector(".hw-audio-inline__saved");
    const previewPlayerMount = mount.querySelector(".hw-audio-inline__preview-player");
    const savedPlayerMount = mount.querySelector(".hw-audio-inline__saved-player");
    const timerEl = mount.querySelector(".hw-audio-inline__timer");
    const statusEl = mount.querySelector(".hw-audio-inline__status");
    const urlInput = mount.querySelector(".hw-audio-inline__url");
    const fileInput = mount.querySelector(".hw-audio-inline__file");

    let mediaStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordedBlob = null;
    let recordedMimeType = "audio/webm";
    let previewObjectUrl = "";
    let recordStartedAt = 0;
    let recordTimerId = null;
    let uploading = false;

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || "";
    }

    function emitChange() {
      options.onChange?.({
        audioUrl: audioUrl,
        mediaId: mediaId || undefined,
      });
    }

    function stopTimer() {
      if (recordTimerId) {
        clearInterval(recordTimerId);
        recordTimerId = null;
      }
    }

    function stopStream() {
      if (mediaStream) {
        if (global.HwCompat?.stopMediaStream) {
          global.HwCompat.stopMediaStream(mediaStream);
        } else {
          mediaStream.getTracks().forEach((t) => t.stop());
        }
        mediaStream = null;
      }
    }

    function clearRecording() {
      recordedBlob = null;
      recordedChunks = [];
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
      }
      if (previewPlayerMount) previewPlayerMount.replaceChildren();
    }

    function hideRecordPanels() {
      if (idleEl) idleEl.hidden = true;
      if (liveEl) liveEl.hidden = true;
      if (previewEl) previewEl.hidden = true;
      if (savedEl) savedEl.hidden = true;
    }

    function showIdle() {
      stopStream();
      stopTimer();
      mediaRecorder = null;
      hideRecordPanels();
      if (idleEl) idleEl.hidden = false;
      if (timerEl) timerEl.textContent = "0:00";
    }

    function showLive() {
      hideRecordPanels();
      if (liveEl) liveEl.hidden = false;
    }

    function showPreview() {
      stopStream();
      stopTimer();
      hideRecordPanels();
      if (previewEl) previewEl.hidden = false;
    }

    function showSavedFromUrl() {
      const playUrl = normalizeAudioUrl(audioUrl);
      hideRecordPanels();
      if (playUrl) {
        if (savedEl) savedEl.hidden = false;
        renderAudioPreview(savedPlayerMount, playUrl, previewAria);
      } else {
        showIdle();
        if (savedPlayerMount) savedPlayerMount.replaceChildren();
      }
    }

    function syncFromFields() {
      if (urlInput) urlInput.value = audioUrl || "";
      if (audioUrl) showSavedFromUrl();
      else showIdle();
    }

    function applyUrl(nextUrl, nextMediaId) {
      audioUrl = String(nextUrl || "").trim();
      mediaId = String(nextMediaId || "").trim();
      if (urlInput) urlInput.value = audioUrl;
      emitChange();
      if (audioUrl) showSavedFromUrl();
      else {
        if (savedPlayerMount) savedPlayerMount.replaceChildren();
        showIdle();
      }
    }

    function teacherUsername() {
      return (
        String(options.teacherUsername || "").trim() ||
        String(global.HwAuth?.getTeacherSession?.()?.username || "").trim()
      );
    }

    async function postMediaFile(file, statusMsg) {
      const username = teacherUsername();
      if (!username) {
        setStatus("Teacher login required to save clips.");
        return false;
      }
      const body = new FormData();
      body.append("media", file);
      body.append("teacherUsername", username);
      setStatus(statusMsg || "Saving clip…");
      const res = await fetch("/api/homework-review-media-upload", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      const id = String(data.mediaId || "").trim();
      if (!id) throw new Error("Upload failed.");
      applyUrl(submissionMediaUrl(id), id);
      return true;
    }

    function finishRecording() {
      if (!recordedChunks.length) {
        setStatus("No audio recorded — try again.");
        showIdle();
        return;
      }
      recordedBlob = new Blob(recordedChunks, { type: recordedMimeType });
      if (recordedBlob.size > MAX_AUDIO_BYTES) {
        setStatus("Too large (max 12 MB). Record a shorter clip.");
        showIdle();
        return;
      }
      previewObjectUrl = URL.createObjectURL(recordedBlob);
      renderAudioPreview(previewPlayerMount, previewObjectUrl, "Teacher clip preview");
      showPreview();
      setStatus("Preview, then save the teacher clip.");
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      stopTimer();
    }

    async function startRecording() {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setStatus("Recording not supported in this browser.");
        return;
      }
      clearRecording();
      setStatus("");
      try {
        mediaStream = global.HwCompat?.getStereoUserMedia
          ? await global.HwCompat.getStereoUserMedia({ audio: true })
          : await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedMimeType = pickRecorderMimeType() || "audio/webm";
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
        recordedMimeType = mediaRecorder.mimeType || recordedMimeType;
        recordedChunks = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data?.size) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = finishRecording;
        mediaRecorder.onerror = () => {
          setStatus("Recording error — try again.");
          showIdle();
        };
        mediaRecorder.start(1000);
        recordStartedAt = Date.now();
        showLive();
        recordTimerId = setInterval(() => {
          const elapsed = Date.now() - recordStartedAt;
          if (timerEl) timerEl.textContent = formatTimer(elapsed);
          if (elapsed >= MAX_AUDIO_MS) stopRecording();
        }, 500);
      } catch {
        setStatus("Microphone access denied or unavailable.");
        showIdle();
      }
    }

    async function uploadRecording() {
      if (!recordedBlob || uploading) {
        if (!recordedBlob) setStatus("Record a clip first.");
        return;
      }
      const ext = extensionForMime(recordedMimeType);
      const file = new File([recordedBlob], "teacher-prompt." + ext, { type: recordedMimeType });
      const btn = mount.querySelector(".hw-audio-inline__upload");
      if (btn) btn.disabled = true;
      uploading = true;
      try {
        const ok = await postMediaFile(file, "Saving clip…");
        if (ok) {
          clearRecording();
          setStatus("Teacher clip saved.");
        }
      } catch (err) {
        setStatus((err && err.message) || "Could not save clip.");
      } finally {
        uploading = false;
        if (btn) btn.disabled = false;
      }
    }

    async function uploadPickedFile(file) {
      if (!file || uploading) return;
      if (!String(file.type || "").startsWith("audio/") && !/\.(mp3|m4a|ogg|webm|wav|aac)$/i.test(file.name || "")) {
        setStatus("Please choose an audio file.");
        return;
      }
      if (file.size > MAX_TEACHER_UPLOAD_BYTES) {
        setStatus("Too large (max 24 MB).");
        return;
      }
      if (pickFileBtn) pickFileBtn.disabled = true;
      uploading = true;
      try {
        const ok = await postMediaFile(file, "Uploading audio…");
        if (ok) setStatus("Audio uploaded.");
      } catch (err) {
        setStatus((err && err.message) || "Could not upload audio.");
      } finally {
        uploading = false;
        if (pickFileBtn) pickFileBtn.disabled = false;
        if (fileInput) fileInput.value = "";
      }
    }

    mount.querySelector(".hw-audio-inline__start")?.addEventListener("click", startRecording);
    mount.querySelector(".hw-audio-inline__stop")?.addEventListener("click", stopRecording);
    mount.querySelector(".hw-audio-inline__cancel")?.addEventListener("click", () => {
      stopRecording();
      clearRecording();
      setStatus("");
      if (audioUrl) showSavedFromUrl();
      else showIdle();
    });
    mount.querySelector(".hw-audio-inline__retake")?.addEventListener("click", () => {
      clearRecording();
      setStatus("");
      showIdle();
    });
    mount.querySelector(".hw-audio-inline__record-again")?.addEventListener("click", () => {
      clearRecording();
      setStatus("");
      showIdle();
    });
    mount.querySelector(".hw-audio-inline__remove")?.addEventListener("click", () => {
      clearRecording();
      applyUrl("", "");
      setStatus("Audio removed.");
    });
    mount.querySelector(".hw-audio-inline__upload")?.addEventListener("click", uploadRecording);
    pickFileBtn?.addEventListener("click", () => fileInput?.click());
    fileInput?.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) void uploadPickedFile(file);
    });

    urlInput?.addEventListener("change", () => {
      const next = urlInput.value.trim();
      mediaId = "";
      applyUrl(next, "");
      setStatus(next ? "Using pasted audio URL." : "");
    });
    urlInput?.addEventListener("input", () => {
      /* live-update block state without requiring blur */
      audioUrl = urlInput.value.trim();
      mediaId = "";
      emitChange();
    });

    syncFromFields();
  }

  global.HwAudioInline = { mount, mountTeacherClip, mediaUrl: submissionMediaUrl };
})(window);
