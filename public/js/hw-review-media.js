/**
 * Teacher audio/video replies on homework review memos.
 */
(function (global) {
  const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
  const MAX_RECORD_MS = 3 * 60 * 1000;

  function mediaUrl(mediaId) {
    return "/api/hw-m/" + encodeURIComponent(String(mediaId || "").trim());
  }

  function formatTimer(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min + ":" + String(sec).padStart(2, "0");
  }

  function pickAudioMime() {
    if (global.HwCompat?.pickRecorderMimeType) {
      return global.HwCompat.pickRecorderMimeType([
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/mpeg",
      ]);
    }
    return "";
  }

  function pickVideoMime() {
    if (global.HwCompat?.pickRecorderMimeType) {
      return global.HwCompat.pickRecorderMimeType();
    }
    return "";
  }

  function extensionForMime(mimeType, kind) {
    if (kind === "audio") {
      if (mimeType.includes("mp4")) return "m4a";
      if (mimeType.includes("mpeg")) return "mp3";
      if (mimeType.includes("ogg")) return "ogg";
      return "webm";
    }
    return mimeType.includes("mp4") ? "mp4" : "webm";
  }

  function renderPlayback(container, media) {
    if (!container || !media?.id) return;
    container.replaceChildren();
    const url = mediaUrl(media.id);
    const kind = media.kind === "audio" ? "audio" : "video";

    if (kind === "audio") {
      if (global.HwWorksheet?.renderListenSlideAudio) {
        const player = global.HwWorksheet.renderListenSlideAudio(url, {
          ariaLabel: "JD audio remark",
          compact: false,
        });
        player.classList.add("hw-review-media__playback");
        container.appendChild(player);
      } else if (global.HwCompat?.enhanceAudioElement) {
        const wrap = document.createElement("div");
        wrap.className = "hw-listen-card hw-review-media__playback";
        const audio = document.createElement("audio");
        const chrome = global.HwCompat.enhanceAudioElement(audio, url, {});
        if (chrome) wrap.appendChild(chrome);
        else {
          audio.controls = true;
          audio.src = url;
          wrap.appendChild(audio);
        }
        container.appendChild(wrap);
      } else {
        const audio = document.createElement("audio");
        audio.className = "hw-review-media__playback";
        audio.controls = true;
        audio.src = url;
        container.appendChild(audio);
      }
      return;
    }

    const video = document.createElement("video");
    video.setAttribute("aria-label", "JD video remark");
    const player =
      global.HwCompat?.enhanceVideoElement?.(video, url, { compact: true }) ||
      (function () {
        video.className = "hw-review-media__playback hw-review-media__playback--video";
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.src = url;
        return video;
      })();
    if (player !== video) {
      player.classList.add("hw-review-media__playback", "hw-review-media__playback--video");
    }
    container.appendChild(player);
  }

  /**
   * @param {HTMLElement} mount
   * @param {{
   *   teacherUsername?: string,
   *   existing?: { id?: string, kind?: string, mimeType?: string },
   *   onChange?: (media: { id: string, kind: 'audio'|'video', mimeType?: string } | null) => void,
   *   onBusy?: (busy: boolean) => void,
   *   compactToolbar?: boolean,
   *   audioBtn?: HTMLButtonElement,
   *   videoBtn?: HTMLButtonElement,
   *   confirmErase?: (anchor: HTMLElement | null, onConfirm: () => void) => void,
   *   onReady?: (api: {
   *     resetAll: () => void,
   *     resetClip: () => void,
   *     hasRecording: () => boolean
   *   }) => void
   * }} options
   */
  function mountRemarkRecorder(mount, options) {
    options = options || {};
    if (!mount || mount.dataset.bound === "1") return;
    mount.dataset.bound = "1";
    mount.className = "hw-review-media" + (options.compactToolbar ? " hw-review-media--compact" : "");

    let mode = "audio";
    let mediaStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordedBlob = null;
    let recordedMimeType = "";
    let previewUrl = "";
    let recordTimerId = null;
    let recordStartedAt = 0;
    let state = "idle";
    let currentMedia = options.existing?.id
      ? {
          id: String(options.existing.id),
          kind: options.existing.kind === "video" ? "video" : "audio",
          mimeType: options.existing.mimeType,
        }
      : null;

    mount.innerHTML =
      '<div class="hw-review-media__mode" role="group" aria-label="Record audio or video reply">' +
      '<button type="button" class="hw-review-media__mode-btn is-active" data-mode="audio">Audio</button>' +
      '<button type="button" class="btn btn--ghost btn--sm hw-review-media__mode-btn" data-mode="video">Video</button>' +
      "</div>" +
      '<div class="hw-review-media__idle">' +
      '<button type="button" class="btn btn--ghost btn--sm hw-review-media__record">Record reply</button>' +
      "</div>" +
      '<div class="hw-review-media__live" hidden>' +
      '<div class="hw-review-media__live-viewport" hidden>' +
      '<video class="hw-review-media__live-video" playsinline muted autoplay aria-hidden="true"></video>' +
      "</div>" +
      '<div class="hw-review-media__live-bar">' +
      '<p class="hw-review-media__live-label">Recording… <span class="hw-review-media__timer">0:00</span></p>' +
      '<button type="button" class="btn btn--primary btn--sm hw-review-media__stop">Stop</button>' +
      "</div>" +
      "</div>" +
      '<div class="hw-review-media__preview" hidden></div>' +
      '<p class="hw-review-media__status" role="status" aria-live="polite"></p>';

    const idleEl = mount.querySelector(".hw-review-media__idle");
    const liveEl = mount.querySelector(".hw-review-media__live");
    const liveViewportEl = mount.querySelector(".hw-review-media__live-viewport");
    const liveVideo = mount.querySelector(".hw-review-media__live-video");
    const previewEl = mount.querySelector(".hw-review-media__preview");
    const statusEl = mount.querySelector(".hw-review-media__status");
    const timerEl = mount.querySelector(".hw-review-media__timer");

    function syncToolbarState() {
      if (!options.compactToolbar) return;
      options.audioBtn?.classList.toggle("is-active", currentMedia?.kind === "audio");
      options.videoBtn?.classList.toggle("is-active", currentMedia?.kind === "video");
      const recording = state === "live";
      options.audioBtn?.classList.toggle("is-recording", recording && mode === "audio");
      options.videoBtn?.classList.toggle("is-recording", recording && mode === "video");
    }

    function setMode(next) {
      mode = next === "video" ? "video" : "audio";
      mount.querySelectorAll(".hw-review-media__mode-btn").forEach((b) => {
        const active = b.getAttribute("data-mode") === mode;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      syncToolbarState();
    }

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || "";
    }

    function setBusy(busy) {
      options.onBusy?.(busy);
    }

    function stopStream() {
      if (liveVideo) liveVideo.srcObject = null;
      if (liveViewportEl) liveViewportEl.hidden = true;
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
      }
    }

    function stopTimer() {
      if (recordTimerId) {
        clearInterval(recordTimerId);
        recordTimerId = null;
      }
    }

    function clearRecording() {
      recordedBlob = null;
      recordedChunks = [];
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = "";
      }
    }

    function showIdle() {
      state = "idle";
      stopStream();
      stopTimer();
      mediaRecorder = null;
      mount.classList.remove("hw-review-media--live-video");
      if (idleEl) idleEl.hidden = false;
      if (liveEl) liveEl.hidden = true;
      if (previewEl) previewEl.hidden = true;
      syncToolbarState();
    }

    function showLive() {
      state = "live";
      if (idleEl) idleEl.hidden = true;
      if (liveEl) liveEl.hidden = false;
      if (previewEl) previewEl.hidden = true;
      if (liveViewportEl) liveViewportEl.hidden = mode !== "video";
      mount.classList.toggle("hw-review-media--live-video", mode === "video");
      syncToolbarState();
    }

    function showPreview() {
      state = "preview";
      stopStream();
      stopTimer();
      mount.classList.remove("hw-review-media--live-video");
      if (idleEl) idleEl.hidden = true;
      if (liveEl) liveEl.hidden = true;
      if (previewEl) previewEl.hidden = false;
      syncToolbarState();
    }

    function showSaved() {
      state = "saved";
      stopStream();
      stopTimer();
      mount.classList.remove("hw-review-media--live-video");
      if (idleEl) idleEl.hidden = true;
      if (liveEl) liveEl.hidden = true;
      if (previewEl) previewEl.hidden = false;
      syncToolbarState();
    }

    function stopPreviewPlayback() {
      if (!previewEl) return;
      previewEl.querySelectorAll("audio, video").forEach((el) => {
        try {
          el.pause();
          el.removeAttribute("src");
          if (typeof el.load === "function") el.load();
        } catch (_) {
          /* ignore */
        }
      });
    }

    function hasRecording() {
      return (
        state === "live" ||
        state === "preview" ||
        !!recordedBlob ||
        !!currentMedia?.id
      );
    }

    function confirmEraseIfNeeded(anchor, onConfirm) {
      if (!hasRecording()) {
        onConfirm();
        return;
      }
      if (typeof options.confirmErase === "function") {
        options.confirmErase(anchor, onConfirm);
        return;
      }
      if (global.confirm("Are you sure? This will erase your current recording.")) {
        onConfirm();
      }
    }

    function resetSavedClip() {
      currentMedia = null;
      clearRecording();
      stopPreviewPlayback();
      if (previewEl) {
        previewEl.replaceChildren();
        previewEl.hidden = true;
      }
      showIdle();
      setStatus("");
      syncToolbarState();
      options.onChange?.(null);
    }

    function resetAll() {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        try {
          mediaRecorder.stop();
        } catch (_) {
          /* ignore */
        }
      }
      stopStream();
      stopTimer();
      mediaRecorder = null;
      resetSavedClip();
    }

    function dismissPreview() {
      stopPreviewPlayback();
      clearRecording();
      if (previewEl) {
        previewEl.replaceChildren();
        previewEl.hidden = true;
      }
      setStatus("");
    }

    function renderSaved() {
      if (!previewEl) return;
      previewEl.replaceChildren();
      if (!currentMedia?.id) {
        previewEl.hidden = true;
        if (idleEl) idleEl.hidden = false;
        return;
      }
      renderPlayback(previewEl, currentMedia);
      showSaved();
    }

    function finishRecording() {
      if (!recordedChunks.length) {
        setStatus("Nothing recorded — try again.");
        showIdle();
        return;
      }
      recordedBlob = new Blob(recordedChunks, { type: recordedMimeType });
      const maxBytes = mode === "audio" ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;
      if (recordedBlob.size > maxBytes) {
        setStatus("Clip too large — record a shorter reply.");
        clearRecording();
        showIdle();
        return;
      }
      previewUrl = URL.createObjectURL(recordedBlob);
      if (!previewEl) return;
      previewEl.replaceChildren();
      if (mode === "audio") {
        if (global.HwWorksheet?.renderListenSlideAudio) {
          previewEl.appendChild(
            global.HwWorksheet.renderListenSlideAudio(previewUrl, {
              ariaLabel: "Recorded remark preview",
              compact: false,
            })
          );
        } else if (global.HwCompat?.enhanceAudioElement) {
          const wrap = document.createElement("div");
          wrap.className = "hw-listen-card";
          const audio = document.createElement("audio");
          const chrome = global.HwCompat.enhanceAudioElement(audio, previewUrl, {});
          if (chrome) wrap.appendChild(chrome);
          else {
            audio.controls = true;
            audio.src = previewUrl;
            wrap.appendChild(audio);
          }
          previewEl.appendChild(wrap);
        } else {
          const audio = document.createElement("audio");
          audio.className = "hw-review-media__playback";
          audio.controls = true;
          audio.src = previewUrl;
          previewEl.appendChild(audio);
        }
      } else {
        const video = document.createElement("video");
        const player =
          global.HwCompat?.enhanceVideoElement?.(video, previewUrl, { compact: true }) ||
          (function () {
            video.className = "hw-review-media__playback hw-review-media__playback--video";
            video.controls = true;
            video.playsInline = true;
            video.src = previewUrl;
            return video;
          })();
        if (player !== video) {
          player.classList.add("hw-review-media__playback", "hw-review-media__playback--video");
        }
        previewEl.appendChild(player);
      }
      const actions = document.createElement("div");
      actions.className = "hw-review-media__preview-actions";
      actions.innerHTML =
        '<button type="button" class="btn btn--primary btn--sm hw-review-media__upload">Save clip</button>';
      previewEl.appendChild(actions);
      actions.querySelector(".hw-review-media__upload")?.addEventListener("click", () => {
        void uploadRecording(actions.querySelector(".hw-review-media__upload"));
      });
      showPreview();
      setStatus("Preview your clip, then save it.");
    }

    async function uploadRecording(uploadBtn) {
      if (!recordedBlob) {
        setStatus("Record a clip first.");
        return;
      }
      const teacherUsername = String(options.teacherUsername || "").trim();
      if (!teacherUsername) {
        setStatus("Teacher login required.");
        return;
      }

      const ext = extensionForMime(recordedMimeType, mode);
      const file = new File([recordedBlob], "review-remark." + ext, { type: recordedMimeType });
      const body = new FormData();
      body.append("media", file);
      body.append("teacherUsername", teacherUsername);

      if (uploadBtn) uploadBtn.disabled = true;
      setBusy(true);
      setStatus("Saving clip…");

      try {
        const res = await fetch("/api/homework-review-media-upload", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload failed.");
        currentMedia = {
          id: String(data.mediaId || ""),
          kind: data.mediaKind === "video" ? "video" : "audio",
          mimeType: data.mimeType,
        };
        clearRecording();
        renderSaved();
        setStatus("Clip saved.");
        options.onChange?.(currentMedia);
      } catch (err) {
        setStatus((err && err.message) || "Could not save clip.");
      } finally {
        setBusy(false);
        if (uploadBtn) uploadBtn.disabled = false;
      }
    }

    async function startRecording(opts) {
      opts = opts || {};
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setStatus("Recording not supported in this browser.");
        return;
      }
      if (state === "live") return;

      const begin = async () => {
        if (state === "preview") dismissPreview();
        else clearRecording();
        setStatus("");

        const constraints =
          mode === "audio" ? { audio: true } : { audio: true, video: { facingMode: "user" } };

        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
          if (mode === "video" && liveVideo) {
            liveVideo.srcObject = mediaStream;
            try {
              await liveVideo.play();
            } catch (_) {
              /* autoplay may be blocked; stream still records */
            }
          }
          recordedMimeType = mode === "audio" ? pickAudioMime() || "audio/webm" : pickVideoMime() || "video/webm";
          try {
            mediaRecorder = new MediaRecorder(mediaStream, { mimeType: recordedMimeType });
          } catch {
            mediaRecorder = new MediaRecorder(mediaStream);
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
            if (elapsed >= MAX_RECORD_MS) stopRecording();
          }, 500);
        } catch {
          setStatus(mode === "video" ? "Camera/mic access denied." : "Microphone access denied.");
          showIdle();
        }
      };

      if (!opts.skipConfirm && hasRecording()) {
        confirmEraseIfNeeded(mount.querySelector(".hw-review-media__record"), () => {
          resetSavedClip();
          void begin();
        });
        return;
      }

      void begin();
    }

    function stopRecording() {
      if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
      stopTimer();
    }

    mount.querySelectorAll(".hw-review-media__mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state === "live") return;
        setMode(btn.getAttribute("data-mode"));
      });
    });

    mount.querySelector(".hw-review-media__record")?.addEventListener("click", () => {
      void startRecording();
    });
    mount.querySelector(".hw-review-media__stop")?.addEventListener("click", stopRecording);

    function bindToolbarRecord(btn, nextMode) {
      btn?.addEventListener("click", () => {
        if (state === "live") return;
        const run = () => {
          setMode(nextMode);
          void startRecording({ skipConfirm: true });
        };
        if (hasRecording()) {
          confirmEraseIfNeeded(btn, () => {
            resetSavedClip();
            run();
          });
          return;
        }
        run();
      });
    }

    if (options.compactToolbar) {
      bindToolbarRecord(options.audioBtn, "audio");
      bindToolbarRecord(options.videoBtn, "video");
    }

    options.onReady?.({
      resetAll,
      resetClip: resetSavedClip,
      hasRecording,
    });

    if (currentMedia?.id) renderSaved();
    else showIdle();
  }

  global.HwReviewMedia = {
    mountRemarkRecorder,
    renderPlayback,
    mediaUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
