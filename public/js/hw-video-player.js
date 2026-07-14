/**
 * Custom video chrome — play/pause, scrub, time, volume, Document PiP.
 */
(function (global) {
  const ICON_PLAY =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72L19 12 8 5.14z"/></svg>';
  const ICON_PAUSE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>';
  const ICON_PIP =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>';
  const ICON_VOLUME =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
  const ICON_MUTE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';

  const ARROW_SEEK_SECONDS = 5;

  function formatTime(seconds) {
    if (global.HwAudioPlayer?.formatTime) {
      return global.HwAudioPlayer.formatTime(seconds);
    }
    if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
    const totalCs = Math.min(Math.max(0, Math.floor(seconds * 100)), 35999999);
    const min = Math.floor(totalCs / 6000);
    const sec = Math.floor((totalCs % 6000) / 100);
    const cs = totalCs % 100;
    const secPart = String(sec).padStart(2, "0") + ":" + String(cs).padStart(2, "0");
    return min > 0
      ? String(min).padStart(2, "0") + ":" + secPart
      : secPart;
  }

  function hasKnownDuration(video) {
    const dur = Number(video.duration);
    return Number.isFinite(dur) && dur > 0;
  }

  function bufferedEndSeconds(video) {
    try {
      const ranges = video.buffered;
      if (!ranges || !ranges.length) return 0;
      const end = ranges.end(ranges.length - 1);
      return Number.isFinite(end) && end > 0 ? end : 0;
    } catch {
      return 0;
    }
  }

  /** Metadata duration, else buffered end (never invent from currentTime while playing). */
  function effectiveDurationSeconds(video, estimate) {
    if (hasKnownDuration(video)) return video.duration;
    const buffered = bufferedEndSeconds(video);
    const est = Math.max(estimate || 0, buffered);
    return est > 0 ? est : 0;
  }

  function probeMediaDuration(media) {
    if (global.HwAudioPlayer?.probeMediaDuration) {
      return global.HwAudioPlayer.probeMediaDuration(media);
    }
    return Promise.resolve(hasKnownDuration(media) ? Number(media.duration) : 0);
  }

  function pipDocumentSupported() {
    return !!global.documentPictureInPicture?.requestWindow;
  }

  function copyStylesIntoDocument(targetDoc) {
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach((link) => {
      const clone = targetDoc.createElement("link");
      clone.rel = "stylesheet";
      clone.href = link.href;
      targetDoc.head.appendChild(clone);
    });
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme) targetDoc.documentElement.setAttribute("data-theme", theme);
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {{ compact?: boolean }} options
   */
  function mount(video, options) {
    options = options || {};
    if (!video) return null;
    if (video.dataset.hwVideoPlayer === "1") {
      return video.closest(".hw-video-chrome") || video;
    }
    const compact = !!options.compact;
    video.dataset.hwVideoPlayer = "1";
    video.controls = false;
    video.disablePictureInPicture = true;
    video.setAttribute("controlsList", "nodownload noplaybackrate nopictureinpicture");
    video.classList.add("hw-video-chrome__el");

    const chrome = document.createElement("div");
    chrome.className =
      "hw-video-chrome" + (compact ? " hw-video-chrome--compact" : "");

    const viewport = document.createElement("div");
    viewport.className = "hw-video-chrome__viewport";

    const bar = document.createElement("div");
    bar.className = "hw-video-chrome__bar";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "hw-video-chrome__play";
    playBtn.setAttribute("aria-label", "Play");
    playBtn.innerHTML = ICON_PLAY;

    const seekWrap = document.createElement("div");
    seekWrap.className = "hw-video-chrome__seek-wrap";

    const seek = document.createElement("input");
    seek.type = "range";
    seek.className = "hw-video-chrome__seek";
    seek.min = "0";
    seek.max = "1000";
    seek.step = "1";
    seek.value = "0";
    seek.setAttribute("aria-label", "Seek");

    const timeEl = document.createElement("span");
    timeEl.className = "hw-video-chrome__time";
    timeEl.textContent = "00:00 / 00:00";

    const volumeBtn = document.createElement("button");
    volumeBtn.type = "button";
    volumeBtn.className = "hw-video-chrome__volume-btn";
    volumeBtn.setAttribute("aria-label", "Mute");
    volumeBtn.innerHTML = ICON_VOLUME;

    const volume = document.createElement("input");
    volume.type = "range";
    volume.className = "hw-video-chrome__volume";
    volume.min = "0";
    volume.max = "100";
    volume.step = "1";
    volume.value = "100";
    volume.setAttribute("aria-label", "Volume");

    seekWrap.appendChild(seek);
    bar.append(playBtn, seekWrap, timeEl, volumeBtn, volume);

    const pipBtn = document.createElement("button");
    pipBtn.type = "button";
    pipBtn.className = "hw-video-chrome__pip";
    pipBtn.setAttribute("aria-label", "Picture in picture");
    pipBtn.setAttribute("aria-pressed", "false");
    pipBtn.innerHTML = ICON_PIP;
    if (!pipDocumentSupported()) {
      pipBtn.disabled = true;
      pipBtn.title = "Picture-in-picture is not available in this browser";
    }
    bar.appendChild(pipBtn);

    chrome.append(viewport, bar);

    const parent = video.parentNode;
    if (parent) {
      parent.replaceChild(chrome, video);
      viewport.appendChild(video);
    } else {
      viewport.appendChild(video);
    }

    let scrubbing = false;
    let timeLoopId = null;
    let pipRestore = null;
    let pipArrowDoc = null;
    let lastVolume = 1;
    let durationEstimate = 0;

    function syncPlayIcon() {
      const playing = !video.paused && !video.ended;
      playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    }

    function refreshDurationEstimate() {
      const buffered = bufferedEndSeconds(video);
      durationEstimate = Math.max(durationEstimate, buffered);
      if (hasKnownDuration(video)) {
        durationEstimate = Math.max(durationEstimate, video.duration);
      }
      if (video.ended) {
        const cur = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        if (cur > 0) durationEstimate = Math.max(durationEstimate, cur);
      }
    }

    function getEffectiveDuration() {
      refreshDurationEstimate();
      return effectiveDurationSeconds(video, durationEstimate);
    }

    function syncSeekRange() {
      const dur = getEffectiveDuration();
      if (dur <= 0) {
        seek.disabled = true;
        seek.max = "1000";
        if (!scrubbing) seek.value = "0";
        return;
      }
      seek.disabled = false;
      const maxMs = Math.max(1, Math.floor(dur * 1000));
      const curMs = Math.min(
        Math.max(0, Math.floor((Number.isFinite(video.currentTime) ? video.currentTime : 0) * 1000)),
        maxMs
      );
      /* Set max before value so the thumb ratio stays correct when duration grows. */
      if (seek.max !== String(maxMs)) seek.max = String(maxMs);
      if (!scrubbing && seek.value !== String(curMs)) seek.value = String(curMs);
    }

    function durationLabel() {
      if (hasKnownDuration(video)) return formatTime(video.duration);
      const dur = getEffectiveDuration();
      return dur > 0 ? formatTime(dur) : "--:--";
    }

    function syncTimeDisplay() {
      const cur = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      timeEl.textContent = formatTime(cur) + " / " + durationLabel();
    }

    function syncTime() {
      syncTimeDisplay();
      syncSeekRange();
    }

    function startTimeLoop() {
      if (timeLoopId != null) return;
      const loop = () => {
        if (!scrubbing) {
          syncTimeDisplay();
          syncSeekRange();
        }
        if (!video.paused && !video.ended) {
          timeLoopId = requestAnimationFrame(loop);
        } else {
          timeLoopId = null;
        }
      };
      timeLoopId = requestAnimationFrame(loop);
    }

    function stopTimeLoop() {
      if (timeLoopId == null) return;
      cancelAnimationFrame(timeLoopId);
      timeLoopId = null;
    }

    function applySeekMs(ms) {
      const dur = getEffectiveDuration();
      if (dur <= 0) return;
      const maxMs = Math.floor(dur * 1000);
      const clamped = Math.min(Math.max(ms, 0), maxMs);
      if (seek.max !== String(maxMs)) seek.max = String(maxMs);
      seek.value = String(clamped);
      video.currentTime = clamped / 1000;
      syncTimeDisplay();
    }

    function syncVolumeUi() {
      const vol = video.muted ? 0 : video.volume;
      volume.value = String(Math.round(vol * 100));
      const muted = video.muted || video.volume === 0;
      volumeBtn.innerHTML = muted ? ICON_MUTE : ICON_VOLUME;
      volumeBtn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    }

    function seekByArrowSeconds(deltaSeconds) {
      const dur = getEffectiveDuration();
      if (dur <= 0) return;
      const cur = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const next = Math.min(Math.max(0, cur + deltaSeconds), dur);
      applySeekMs(Math.floor(next * 1000));
    }

    function arrowSeekArmed() {
      return chrome.dataset.hwVideoArmed === "1" || chrome.matches(":focus-within");
    }

    function onArrowSeekKey(ev) {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      if (!arrowSeekArmed()) return;
      const target = ev.target;
      if (
        target &&
        target.closest &&
        target.closest("textarea, input:not([type=range]), select, [contenteditable='true']")
      ) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const delta = ev.key === "ArrowLeft" ? -ARROW_SEEK_SECONDS : ARROW_SEEK_SECONDS;
      seekByArrowSeconds(delta);
    }

    function bindArrowSeek(doc) {
      if (!doc || doc === pipArrowDoc) return;
      if (pipArrowDoc) {
        pipArrowDoc.removeEventListener("keydown", onArrowSeekKey, true);
        pipArrowDoc = null;
      }
      doc.addEventListener("keydown", onArrowSeekKey, true);
      pipArrowDoc = doc;
    }

    function setPipActive(active) {
      if (!pipBtn) return;
      pipBtn.classList.toggle("is-active", active);
      pipBtn.setAttribute("aria-pressed", active ? "true" : "false");
    }

    function restoreFromPip() {
      if (!pipRestore) return;
      const { parent: pipParent, next } = pipRestore;
      chrome.classList.remove("hw-video-chrome--pip");
      if (next && next.parentNode === pipParent) pipParent.insertBefore(chrome, next);
      else pipParent.appendChild(chrome);
      pipRestore = null;
      setPipActive(false);
      bindArrowSeek(document);
    }

    async function enterDocumentPip() {
      const rect = chrome.getBoundingClientRect();
      const pipWindow = await global.documentPictureInPicture.requestWindow({
        width: Math.round(Math.max(320, rect.width)),
        height: Math.round(Math.max(200, rect.height)),
      });
      copyStylesIntoDocument(pipWindow.document);
      pipWindow.document.body.className = "hw-video-chrome--pip-root";
      const pipParent = chrome.parentNode;
      const next = chrome.nextSibling;
      pipRestore = { parent: pipParent, next, pipWindow };
      chrome.classList.add("hw-video-chrome--pip");
      pipWindow.document.body.append(chrome);
      setPipActive(true);
      bindArrowSeek(pipWindow.document);
      pipWindow.addEventListener("pagehide", () => restoreFromPip(), { once: true });
    }

    async function togglePip() {
      if (pipBtn.disabled) return;
      if (pipRestore) {
        pipRestore.pipWindow?.close?.();
        restoreFromPip();
        return;
      }
      if (!pipDocumentSupported()) return;
      try {
        await enterDocumentPip();
      } catch (err) {
        if (err?.name !== "NotAllowedError") {
          /* user dismissed or browser blocked */
        }
      }
    }

    chrome.tabIndex = 0;
    chrome.addEventListener("pointerdown", () => {
      chrome.dataset.hwVideoArmed = "1";
    });
    document.addEventListener(
      "pointerdown",
      (ev) => {
        if (!chrome.contains(ev.target)) delete chrome.dataset.hwVideoArmed;
      },
      true
    );
    bindArrowSeek(document);

    pipBtn.addEventListener("click", () => {
      void togglePip();
    });

    playBtn.addEventListener("click", () => {
      if (video.paused || video.ended) void video.play();
      else video.pause();
    });

    viewport.addEventListener("click", () => {
      if (video.paused || video.ended) void video.play();
      else video.pause();
    });

    video.addEventListener("play", () => {
      syncPlayIcon();
      refreshDurationEstimate();
      syncTime();
      startTimeLoop();
    });
    video.addEventListener("pause", () => {
      syncPlayIcon();
      stopTimeLoop();
      syncTime();
    });
    video.addEventListener("ended", () => {
      syncPlayIcon();
      stopTimeLoop();
      syncTime();
    });
    video.addEventListener("loadedmetadata", syncTime);
    video.addEventListener("loadeddata", syncTime);
    video.addEventListener("durationchange", syncTime);
    video.addEventListener("canplay", syncTime);
    video.addEventListener("progress", syncTime);
    video.addEventListener("timeupdate", () => {
      if (video.paused || video.ended) syncTime();
    });
    video.addEventListener("volumechange", syncVolumeUi);

    void probeMediaDuration(video).then((probed) => {
      if (probed > durationEstimate) {
        durationEstimate = probed;
        syncTime();
      }
    });

    seek.addEventListener("input", () => {
      applySeekMs(Number(seek.value));
    });
    seek.addEventListener("pointerdown", () => {
      scrubbing = true;
    });
    seek.addEventListener("pointerup", () => {
      scrubbing = false;
    });
    seek.addEventListener("pointercancel", () => {
      scrubbing = false;
    });

    volume.addEventListener("input", () => {
      const vol = Number(volume.value) / 100;
      video.volume = vol;
      video.muted = vol === 0;
      if (vol > 0) lastVolume = vol;
      syncVolumeUi();
    });

    volumeBtn.addEventListener("click", () => {
      if (video.muted || video.volume === 0) {
        video.muted = false;
        video.volume = lastVolume > 0 ? lastVolume : 1;
      } else {
        if (video.volume > 0) lastVolume = video.volume;
        video.muted = true;
      }
      syncVolumeUi();
    });

    if (!Number.isFinite(video.volume) || video.volume < 0) video.volume = 1;
    syncPlayIcon();
    syncTime();
    syncVolumeUi();

    return chrome;
  }

  function enhanceExisting(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("video:not([data-hw-video-player])").forEach((el) => {
      if (el.closest(".hw-video-chrome")) return;
      if (el.hasAttribute("data-hw-video-native")) return;
      if (el.classList.contains("hw-video-inline__live-video")) return;
      mount(el);
    });
  }

  global.HwVideoPlayer = { mount, enhanceExisting, formatTime };
})(typeof window !== "undefined" ? window : globalThis);
