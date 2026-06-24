/**
 * Compact inline audio record + upload for worksheet audio prompts.
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

  /**
   * @param {HTMLElement} mount
   * @param {{ username?: string, displayName?: string, assignmentId?: string, lessonName?: string, promptId?: string, promptLabel?: string }} meta
   */
  function emitWorksheetAnswerChange(el) {
    el?.closest("form")?.dispatchEvent(new CustomEvent("hw-worksheet-answer", { bubbles: true }));
  }

  function mount(mount, meta) {
    if (!mount || mount.dataset.bound === "true") return;
    mount.dataset.bound = "true";
    meta = meta || {};

    mount.innerHTML =
      '<div class="hw-audio-inline__idle">' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__start">Record your answer</button>' +
      "</div>" +
      '<div class="hw-audio-inline__live" hidden>' +
      '<p class="hw-audio-inline__recording-label" aria-live="polite">Recording…</p>' +
      '<p class="hw-audio-inline__timer" aria-live="polite">0:00</p>' +
      '<button type="button" class="btn btn--primary btn--sm hw-audio-inline__stop">Stop</button>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__cancel">Cancel</button>' +
      "</div>" +
      '<div class="hw-audio-inline__preview" hidden>' +
      '<audio class="hw-audio-inline__playback" controls aria-label="Recorded answer preview"></audio>' +
      '<div class="hw-audio-inline__preview-actions">' +
      '<button type="button" class="btn btn--primary btn--sm hw-audio-inline__upload">Send audio</button>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-audio-inline__retake">Record again</button>' +
      "</div>" +
      "</div>" +
      '<p class="hw-audio-inline__status" role="status" aria-live="polite"></p>';

    const idleEl = mount.querySelector(".hw-audio-inline__idle");
    const liveEl = mount.querySelector(".hw-audio-inline__live");
    const previewEl = mount.querySelector(".hw-audio-inline__preview");
    const playbackAudio = mount.querySelector(".hw-audio-inline__playback");
    const timerEl = mount.querySelector(".hw-audio-inline__timer");
    const statusEl = mount.querySelector(".hw-audio-inline__status");

    let mediaStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordedBlob = null;
    let recordedMimeType = "audio/webm";
    let previewObjectUrl = "";
    let recordStartedAt = 0;
    let recordTimerId = null;

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
        mediaStream.getTracks().forEach((t) => t.stop());
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
      if (playbackAudio) {
        playbackAudio.removeAttribute("src");
        playbackAudio.load();
      }
    }

    function showIdle() {
      stopStream();
      stopTimer();
      mediaRecorder = null;
      idleEl?.removeAttribute("hidden");
      liveEl?.setAttribute("hidden", "");
      previewEl?.setAttribute("hidden", "");
      if (timerEl) timerEl.textContent = "0:00";
    }

    function showLive() {
      idleEl?.setAttribute("hidden", "");
      liveEl?.removeAttribute("hidden");
      previewEl?.setAttribute("hidden", "");
    }

    function showPreview() {
      stopStream();
      stopTimer();
      idleEl?.setAttribute("hidden", "");
      liveEl?.setAttribute("hidden", "");
      previewEl?.removeAttribute("hidden");
    }

    function resetUi() {
      clearRecording();
      showIdle();
    }

    function finishRecording() {
      if (!recordedChunks.length) {
        setStatus("No audio recorded — try again.");
        resetUi();
        return;
      }
      recordedBlob = new Blob(recordedChunks, { type: recordedMimeType });
      if (recordedBlob.size > MAX_AUDIO_BYTES) {
        setStatus("Too large (max 12 MB). Record a shorter clip.");
        resetUi();
        return;
      }
      previewObjectUrl = URL.createObjectURL(recordedBlob);
      if (playbackAudio) playbackAudio.src = previewObjectUrl;
      showPreview();
      setStatus("Preview your clip, then send it.");
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      stopTimer();
    }

    async function startRecording() {
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
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

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
          resetUi();
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
        resetUi();
      }
    }

    async function uploadRecording() {
      if (!recordedBlob) {
        setStatus("Record a clip first.");
        return;
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const ext = extensionForMime(recordedMimeType);
      const file = new File([recordedBlob], "prompt-" + (meta.promptId || stamp) + "." + ext, {
        type: recordedMimeType,
      });

      const uploadBtn = mount.querySelector(".hw-audio-inline__upload");
      if (uploadBtn) uploadBtn.disabled = true;
      setStatus("Uploading…");

      const body = new FormData();
      body.append("audio", file);
      body.append("username", meta.username || "");
      body.append("displayName", meta.displayName || meta.username || "");
      body.append("assignmentId", meta.assignmentId || "audio-homework");
      body.append("lessonName", meta.lessonName || "Audio homework");
      if (meta.promptId) body.append("promptId", meta.promptId);
      if (meta.promptLabel) body.append("promptLabel", meta.promptLabel);

      try {
        const res = await fetch("/api/homework-audio-upload", {
          method: "POST",
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        mount.dataset.hwAnswerSaved = "true";
        setStatus(data.message || "Audio sent — JD will review it.");
        resetUi();
        emitWorksheetAnswerChange(mount);
      } catch (err) {
        setStatus((err && err.message) || "Upload failed.");
      } finally {
        if (uploadBtn) uploadBtn.disabled = false;
      }
    }

    mount.querySelector(".hw-audio-inline__start")?.addEventListener("click", startRecording);
    mount.querySelector(".hw-audio-inline__stop")?.addEventListener("click", stopRecording);
    mount.querySelector(".hw-audio-inline__cancel")?.addEventListener("click", () => {
      stopRecording();
      resetUi();
      setStatus("");
    });
    mount.querySelector(".hw-audio-inline__retake")?.addEventListener("click", () => {
      resetUi();
      setStatus("");
    });
    mount.querySelector(".hw-audio-inline__upload")?.addEventListener("click", uploadRecording);

    showIdle();
  }

  global.HwAudioInline = { mount };
})(window);
