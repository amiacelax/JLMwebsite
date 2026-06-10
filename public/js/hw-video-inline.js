/**
 * Compact inline video record + upload for worksheet video prompts.
 */
(function (global) {
  const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
  const MAX_VIDEO_MS = 3 * 60 * 1000;

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

  /**
   * @param {HTMLElement} mount
   * @param {{ username?: string, displayName?: string, assignmentId?: string, lessonName?: string, promptId?: string, promptLabel?: string }} meta
   */
  function mount(mount, meta) {
    if (!mount || mount.dataset.bound === "true") return;
    mount.dataset.bound = "true";
    meta = meta || {};

    mount.innerHTML =
      '<div class="hw-video-inline__idle">' +
      '<button type="button" class="btn btn--ghost btn--sm hw-video-inline__start">Record your answer</button>' +
      "</div>" +
      '<div class="hw-video-inline__live" hidden>' +
      '<video class="hw-video-inline__live-video" playsinline muted autoplay aria-hidden="true"></video>' +
      '<p class="hw-video-inline__timer" aria-live="polite">0:00</p>' +
      '<button type="button" class="btn btn--primary btn--sm hw-video-inline__stop">Stop</button>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-video-inline__cancel">Cancel</button>' +
      "</div>" +
      '<div class="hw-video-inline__preview" hidden>' +
      '<video class="hw-video-inline__playback" playsinline controls aria-label="Recorded answer preview"></video>' +
      '<div class="hw-video-inline__preview-actions">' +
      '<button type="button" class="btn btn--primary btn--sm hw-video-inline__upload">Send video</button>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-video-inline__retake">Record again</button>' +
      "</div>" +
      "</div>" +
      '<p class="hw-video-inline__status" role="status" aria-live="polite"></p>';

    const idleEl = mount.querySelector(".hw-video-inline__idle");
    const liveEl = mount.querySelector(".hw-video-inline__live");
    const previewEl = mount.querySelector(".hw-video-inline__preview");
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
        setStatus("No video recorded — try again.");
        resetUi();
        return;
      }
      recordedBlob = new Blob(recordedChunks, { type: recordedMimeType });
      if (recordedBlob.size > MAX_VIDEO_BYTES) {
        setStatus("Too large (max 24 MB). Record a shorter clip.");
        resetUi();
        return;
      }
      previewObjectUrl = URL.createObjectURL(recordedBlob);
      if (playbackVideo) playbackVideo.src = previewObjectUrl;
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
        setStatus("Recording not supported — use the Video section below to upload.");
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
          setStatus("Recording error — try again.");
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
        setStatus("Camera access denied or unavailable.");
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

      const uploadBtn = mount.querySelector(".hw-video-inline__upload");
      if (uploadBtn) uploadBtn.disabled = true;
      setStatus("Uploading…");

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
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        setStatus(data.message || "Video sent — JD will review it.");
        resetUi();
      } catch (err) {
        setStatus((err && err.message) || "Upload failed.");
      } finally {
        if (uploadBtn) uploadBtn.disabled = false;
      }
    }

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
    mount.querySelector(".hw-video-inline__upload")?.addEventListener("click", uploadRecording);

    showIdle();
  }

  global.HwVideoInline = { mount };
})(window);
