/**
 * Custom audio chrome — scrub timestamp tooltip + playback speed for all homework audio.
 */
(function (global) {
  const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2];

  const ICON_PLAY =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72L19 12 8 5.14z"/></svg>';
  const ICON_PAUSE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>';

  /** SS:CC — seconds and centiseconds; MM:SS:CC only when past 59s. */
  function formatTime(seconds) {
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

  function hasKnownDuration(audio) {
    const dur = Number(audio.duration);
    return Number.isFinite(dur) && dur > 0;
  }

  function bufferedEndSeconds(audio) {
    try {
      const ranges = audio.buffered;
      if (!ranges || !ranges.length) return 0;
      const end = ranges.end(ranges.length - 1);
      return Number.isFinite(end) && end > 0 ? end : 0;
    } catch {
      return 0;
    }
  }

  /** Metadata duration, else buffered end (never invent from currentTime while playing). */
  function effectiveDurationSeconds(audio, estimate) {
    const known = Number(audio.duration);
    if (Number.isFinite(known) && known > 0) return known;
    const buffered = bufferedEndSeconds(audio);
    const est = Math.max(estimate || 0, buffered);
    return est > 0 ? est : 0;
  }

  /**
   * WebM/MediaRecorder blobs often lack duration until we force a seek to the end.
   * Probe on a detached element so the live player's currentTime is never touched
   * (the old in-place seek + `currentTime = 0` stole user seeks and rewound to start).
   * @returns {Promise<number>}
   */
  function probeMediaDuration(media) {
    return new Promise((resolve) => {
      if (hasKnownDuration(media)) {
        resolve(Number(media.duration));
        return;
      }

      const src = media.currentSrc || media.getAttribute("src") || "";
      if (!src) {
        resolve(bufferedEndSeconds(media));
        return;
      }

      let settled = false;
      const probe = document.createElement(media.tagName === "VIDEO" ? "video" : "audio");
      probe.preload = "auto";
      probe.muted = true;
      probe.playsInline = true;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        probe.removeEventListener("loadedmetadata", onMeta);
        probe.removeEventListener("seeked", onSeeked);
        probe.removeEventListener("error", onFail);
        try {
          probe.removeAttribute("src");
          probe.load();
        } catch {
          /* ignore */
        }
        resolve(Number.isFinite(value) && value > 0 ? value : 0);
      };

      const onFail = () => finish(bufferedEndSeconds(media));

      const onSeeked = () => {
        const probed = Number(probe.currentTime);
        const known = hasKnownDuration(probe) ? Number(probe.duration) : 0;
        finish(Math.max(probed, known, bufferedEndSeconds(probe)));
      };

      const beginInfinitySeek = () => {
        if (settled) return;
        if (hasKnownDuration(probe)) {
          finish(Number(probe.duration));
          return;
        }
        probe.addEventListener("seeked", onSeeked);
        try {
          probe.currentTime = 1e101;
        } catch {
          finish(Math.max(bufferedEndSeconds(probe), bufferedEndSeconds(media)));
        }
      };

      const onMeta = () => beginInfinitySeek();

      probe.addEventListener("loadedmetadata", onMeta);
      probe.addEventListener("error", onFail);
      probe.src = src;

      setTimeout(() => {
        if (settled) return;
        if (hasKnownDuration(probe)) {
          finish(Number(probe.duration));
          return;
        }
        finish(
          Math.max(
            bufferedEndSeconds(probe),
            bufferedEndSeconds(media),
            Number.isFinite(probe.currentTime) ? probe.currentTime : 0
          )
        );
      }, 1500);
    });
  }

  function durationCentisecondsFromSeconds(seconds) {
    return Math.max(1, Math.floor(seconds * 100));
  }

  function currentCentisecondsFrom(audio, effectiveSeconds) {
    const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const maxCs = durationCentisecondsFromSeconds(effectiveSeconds);
    return Math.min(Math.max(0, Math.floor(cur * 100)), maxCs);
  }

  function nearestSpeed(rate) {
    const n = Number(rate);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return SPEED_OPTIONS.reduce((best, opt) =>
      Math.abs(opt - n) < Math.abs(best - n) ? opt : best
    );
  }

  const ICON_CHEVRON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const ICON_PIP =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>';

  const ARROW_SEEK_SECONDS = 5;

  function pipDocumentSupported() {
    return !!global.documentPictureInPicture?.requestWindow;
  }

  function pipMediaSupported(media) {
    return !!(
      document.pictureInPictureEnabled &&
      media &&
      typeof media.requestPictureInPicture === "function"
    );
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

  function mount(audio, options) {
    options = options || {};
    if (!audio) return null;
    if (audio.dataset.hwAudioPlayer === "1") {
      return audio.closest(".hw-audio-chrome") || audio;
    }
    const compactSpeed = !!(options.compactSpeed || audio.dataset.compactSpeed === "1");
    audio.dataset.hwAudioPlayer = "1";
    audio.controls = false;
    audio.classList.add("hw-audio-chrome__el");

    const chrome = document.createElement("div");
    chrome.className = "hw-audio-chrome" + (compactSpeed ? " hw-audio-chrome--compact-speed" : "");

    const bar = document.createElement("div");
    bar.className = "hw-audio-chrome__bar";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "hw-audio-chrome__play";
    playBtn.setAttribute("aria-label", "Play");
    playBtn.innerHTML = ICON_PLAY;

    const seekWrap = document.createElement("div");
    seekWrap.className = "hw-audio-chrome__seek-wrap";

    const seek = document.createElement("input");
    seek.type = "range";
    seek.className = "hw-audio-chrome__seek";
    seek.min = "0";
    seek.max = "1";
    seek.step = "1";
    seek.value = "0";
    seek.setAttribute("aria-label", "Seek");

    const scrubTip = document.createElement("span");
    scrubTip.className = "hw-audio-chrome__scrub-tip";
    scrubTip.hidden = true;
    scrubTip.setAttribute("aria-hidden", "true");

    const timeEl = document.createElement("span");
    timeEl.className = "hw-audio-chrome__time";
    timeEl.textContent = "00:00 / 00:00";

    let speedControl;
    let applyRate = null;

    if (compactSpeed) {
      const speedWrap = document.createElement("div");
      speedWrap.className = "hw-audio-chrome__speed-wrap";

      const speedBtn = document.createElement("button");
      speedBtn.type = "button";
      speedBtn.className = "hw-audio-chrome__speed-btn";
      speedBtn.setAttribute("aria-label", "Playback speed");
      speedBtn.setAttribute("aria-haspopup", "listbox");
      speedBtn.setAttribute("aria-expanded", "false");
      speedBtn.innerHTML = ICON_CHEVRON;

      const speedMenu = document.createElement("div");
      speedMenu.className = "hw-audio-chrome__speed-menu";
      speedMenu.setAttribute("role", "listbox");
      speedMenu.hidden = true;

      function closeSpeedMenu() {
        speedMenu.hidden = true;
        speedBtn.setAttribute("aria-expanded", "false");
      }

      applyRate = function (rate) {
        const next = nearestSpeed(rate);
        audio.playbackRate = next;
        speedMenu.querySelectorAll(".hw-audio-chrome__speed-opt").forEach((btn) => {
          btn.classList.toggle("is-active", Number(btn.dataset.rate) === next);
        });
      };

      SPEED_OPTIONS.forEach((opt) => {
        const optBtn = document.createElement("button");
        optBtn.type = "button";
        optBtn.className = "hw-audio-chrome__speed-opt";
        optBtn.dataset.rate = String(opt);
        optBtn.setAttribute("role", "option");
        optBtn.textContent = opt === 1 ? "1×" : opt + "×";
        optBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          applyRate(opt);
          closeSpeedMenu();
        });
        speedMenu.appendChild(optBtn);
      });

      speedBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const open = speedMenu.hidden;
        speedMenu.hidden = !open;
        speedBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });

      speedMenu.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      document.addEventListener("pointerdown", (ev) => {
        if (!speedWrap.contains(ev.target)) closeSpeedMenu();
      });

      speedWrap.append(speedBtn, speedMenu);
      speedControl = speedWrap;
    } else {
      const speed = document.createElement("select");
      speed.className = "hw-audio-chrome__speed";
      speed.setAttribute("aria-label", "Playback speed");
      SPEED_OPTIONS.forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt);
        option.textContent = opt === 1 ? "1×" : opt + "×";
        if (opt === 1) option.selected = true;
        speed.appendChild(option);
      });
      speed.addEventListener("change", () => {
        const rate = Number(speed.value);
        audio.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
      });
      applyRate = function (rate) {
        const next = nearestSpeed(rate);
        speed.value = String(next);
        audio.playbackRate = next;
      };
      speedControl = speed;
    }

    seekWrap.append(seek, scrubTip);
    bar.append(playBtn, seekWrap, timeEl, speedControl);

    const pipBtn = document.createElement("button");
    pipBtn.type = "button";
    pipBtn.className = "hw-audio-chrome__pip";
    pipBtn.setAttribute("aria-label", "Picture in picture");
    pipBtn.setAttribute("aria-pressed", "false");
    pipBtn.innerHTML = ICON_PIP;
    if (!pipDocumentSupported() && !pipMediaSupported(audio)) {
      pipBtn.disabled = true;
      pipBtn.title = "Picture-in-picture is not available in this browser";
    }
    bar.appendChild(pipBtn);

    const parent = audio.parentNode;
    if (parent) {
      chrome.append(bar);
      parent.replaceChild(chrome, audio);
      chrome.insertBefore(audio, bar);
    } else {
      chrome.append(audio, bar);
    }

    let scrubbing = false;
    let seekPointerId = null;
    let durationEstimate = 0;
    let timeLoopId = null;
    let lastDisplayedCentiseconds = -1;
    let pipRestore = null;
    let pipArrowDoc = null;
    let stereoGraph = null;

    /**
     * Fold L+R into both ears. Fixes stored clips that are “stereo” but only
     * have signal on the left channel (silent right = left-ear-only headphones).
     */
    function ensureStereoBothEars() {
      if (stereoGraph || audio.dataset.hwStereoWired === "1") return;
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return;
      try {
        const ctx = new AudioCtx();
        const src = ctx.createMediaElementSource(audio);
        const splitter = ctx.createChannelSplitter(2);
        const gainL = ctx.createGain();
        const gainR = ctx.createGain();
        gainL.gain.value = 0.5;
        gainR.gain.value = 0.5;
        const merger = ctx.createChannelMerger(2);
        src.connect(splitter);
        splitter.connect(gainL, 0);
        splitter.connect(gainR, 1);
        gainL.connect(merger, 0, 0);
        gainL.connect(merger, 0, 1);
        gainR.connect(merger, 0, 0);
        gainR.connect(merger, 0, 1);
        merger.connect(ctx.destination);
        audio.dataset.hwStereoWired = "1";
        stereoGraph = { ctx };
      } catch {
        /* Already connected, CORS, or unsupported — keep element output. */
      }
    }

    function rewindIfEnded() {
      const dur = Number(audio.duration);
      const atEnd =
        audio.ended ||
        (Number.isFinite(dur) &&
          dur > 0 &&
          Number.isFinite(audio.currentTime) &&
          audio.currentTime >= dur - 0.05);
      if (!atEnd) return;
      try {
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }

    function refreshDurationEstimate() {
      const buffered = bufferedEndSeconds(audio);
      durationEstimate = Math.max(durationEstimate, buffered);
      if (hasKnownDuration(audio)) {
        durationEstimate = Math.max(durationEstimate, audio.duration);
      }
      if (audio.ended) {
        const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        if (cur > 0) durationEstimate = Math.max(durationEstimate, cur);
      }
    }

    function getEffectiveDuration() {
      refreshDurationEstimate();
      return effectiveDurationSeconds(audio, durationEstimate);
    }

    function syncPlayIcon() {
      const playing = !audio.paused && !audio.ended;
      playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    }

    function syncSeekRange() {
      const effectiveDur = getEffectiveDuration();
      if (effectiveDur <= 0) {
        seek.max = "100";
        seek.disabled = true;
        if (!scrubbing) seek.value = "0";
        return;
      }
      seek.disabled = false;
      const maxCs = durationCentisecondsFromSeconds(effectiveDur);
      const curCs = currentCentisecondsFrom(audio, effectiveDur);
      /* Set max before value so the thumb ratio stays correct when duration grows. */
      if (seek.max !== String(maxCs)) seek.max = String(maxCs);
      if (!scrubbing && seek.value !== String(curCs)) seek.value = String(curCs);
    }

    function durationLabel() {
      if (hasKnownDuration(audio)) return formatTime(audio.duration);
      const effectiveDur = getEffectiveDuration();
      return effectiveDur > 0 ? formatTime(effectiveDur) : "--:--";
    }

    function syncTimeDisplay(force) {
      const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const cs = Math.floor(cur * 100);
      if (!force && cs === lastDisplayedCentiseconds) return;
      lastDisplayedCentiseconds = cs;
      timeEl.textContent = formatTime(cur) + " / " + durationLabel();
    }

    function syncTime() {
      lastDisplayedCentiseconds = -1;
      syncTimeDisplay(true);
      syncSeekRange();
    }

    function startTimeLoop() {
      if (timeLoopId != null) return;
      const loop = () => {
        if (!scrubbing) {
          syncTimeDisplay(false);
          syncSeekRange();
        }
        if (!audio.paused && !audio.ended) {
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

    function seekCentisecondsFromRatio(ratio) {
      const effectiveDur = getEffectiveDuration();
      if (effectiveDur <= 0) return 0;
      const maxCs = durationCentisecondsFromSeconds(effectiveDur);
      const clamped = Math.min(Math.max(ratio, 0), 1);
      return Math.min(Math.round(clamped * maxCs), maxCs);
    }

    function applySeekCentiseconds(centiseconds) {
      const effectiveDur = getEffectiveDuration();
      if (effectiveDur <= 0) return;
      const maxCs = durationCentisecondsFromSeconds(effectiveDur);
      const c = Math.min(Math.max(centiseconds, 0), maxCs);
      seek.value = String(c);
      audio.currentTime = c / 100;
      lastDisplayedCentiseconds = -1;
      syncTimeDisplay(true);
    }

    function seekRatioFromEvent(ev) {
      const rect = seek.getBoundingClientRect();
      if (!rect.width) return 0;
      const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width);
      return x / rect.width;
    }

    function showScrubTip(ev) {
      const effectiveDur = getEffectiveDuration();
      if (effectiveDur <= 0) {
        scrubTip.hidden = true;
        return;
      }
      const ratio = seekRatioFromEvent(ev);
      const centiseconds = seekCentisecondsFromRatio(ratio);
      scrubTip.textContent = formatTime(centiseconds / 100);
      scrubTip.style.left = ratio * 100 + "%";
      scrubTip.hidden = false;
    }

    function hideScrubTip() {
      scrubTip.hidden = true;
    }

    function seekByArrowSeconds(deltaSeconds) {
      const effectiveDur = getEffectiveDuration();
      if (effectiveDur <= 0) return;
      const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const next = Math.min(Math.max(0, cur + deltaSeconds), effectiveDur);
      applySeekCentiseconds(Math.floor(next * 100));
    }

    function arrowSeekArmed() {
      return chrome.dataset.hwAudioArmed === "1" || chrome.matches(":focus-within");
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
      chrome.classList.remove("hw-audio-chrome--pip");
      if (next && next.parentNode === pipParent) pipParent.insertBefore(chrome, next);
      else pipParent.appendChild(chrome);
      pipRestore = null;
      setPipActive(false);
      bindArrowSeek(document);
    }

    async function enterDocumentPip() {
      const rect = bar.getBoundingClientRect();
      const pipWindow = await global.documentPictureInPicture.requestWindow({
        width: Math.round(Math.max(320, rect.width)),
        height: Math.round(Math.max(72, rect.height + 8)),
      });
      copyStylesIntoDocument(pipWindow.document);
      pipWindow.document.body.className = "hw-audio-chrome--pip-root";
      const pipParent = chrome.parentNode;
      const next = chrome.nextSibling;
      pipRestore = { parent: pipParent, next, pipWindow };
      chrome.classList.add("hw-audio-chrome--pip");
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
      if (document.pictureInPictureElement === audio) {
        await document.exitPictureInPicture();
        return;
      }
      if (pipDocumentSupported()) {
        try {
          await enterDocumentPip();
        } catch (err) {
          if (err?.name !== "NotAllowedError") {
            /* ignore — user dismissed or browser blocked */
          }
        }
        return;
      }
      if (pipMediaSupported(audio)) {
        try {
          await audio.requestPictureInPicture();
          setPipActive(true);
        } catch {
          /* ignore */
        }
      }
    }

    chrome.tabIndex = 0;
    chrome.addEventListener("pointerdown", () => {
      chrome.dataset.hwAudioArmed = "1";
    });
    document.addEventListener(
      "pointerdown",
      (ev) => {
        if (!chrome.contains(ev.target)) delete chrome.dataset.hwAudioArmed;
      },
      true
    );
    bindArrowSeek(document);

    pipBtn.addEventListener("click", () => {
      void togglePip();
    });
    audio.addEventListener("enterpictureinpicture", () => {
      if (!pipRestore) setPipActive(true);
    });
    audio.addEventListener("leavepictureinpicture", () => {
      if (!pipRestore) setPipActive(false);
    });

    playBtn.addEventListener("click", () => {
      if (audio.paused || audio.ended) {
        ensureStereoBothEars();
        if (stereoGraph?.ctx?.state === "suspended") {
          void stereoGraph.ctx.resume();
        }
        rewindIfEnded();
        void audio.play();
      } else {
        audio.pause();
      }
    });

    audio.addEventListener("play", () => {
      syncPlayIcon();
      refreshDurationEstimate();
      syncTime();
      startTimeLoop();
    });
    audio.addEventListener("pause", () => {
      syncPlayIcon();
      stopTimeLoop();
      syncTime();
    });
    audio.addEventListener("ended", () => {
      syncPlayIcon();
      stopTimeLoop();
      syncTime();
    });
    audio.addEventListener("loadedmetadata", syncTime);
    audio.addEventListener("loadeddata", syncTime);
    audio.addEventListener("durationchange", syncTime);
    audio.addEventListener("canplay", syncTime);
    audio.addEventListener("progress", syncTime);
    audio.addEventListener("timeupdate", () => {
      if (audio.paused || audio.ended) syncTime();
    });

    void probeMediaDuration(audio).then((probed) => {
      if (probed > durationEstimate) {
        durationEstimate = probed;
        syncTime();
      }
    });

    seek.addEventListener("input", () => {
      /* Pointer scrub owns seeks; ignore native range jumps (often briefly 0). */
      if (scrubbing && seekPointerId != null) return;
      applySeekCentiseconds(Number(seek.value));
    });

    seek.addEventListener("pointerdown", (ev) => {
      scrubbing = true;
      seekPointerId = ev.pointerId;
      seek.setPointerCapture?.(ev.pointerId);
      applySeekCentiseconds(seekCentisecondsFromRatio(seekRatioFromEvent(ev)));
      showScrubTip(ev);
    });

    seek.addEventListener("pointermove", (ev) => {
      if (!scrubbing) return;
      applySeekCentiseconds(seekCentisecondsFromRatio(seekRatioFromEvent(ev)));
      showScrubTip(ev);
    });

    seek.addEventListener("pointerup", (ev) => {
      if (seekPointerId != null && ev.pointerId !== seekPointerId) return;
      scrubbing = false;
      seekPointerId = null;
      hideScrubTip();
    });

    seek.addEventListener("pointercancel", () => {
      scrubbing = false;
      seekPointerId = null;
      hideScrubTip();
    });

    seekWrap.addEventListener("mouseenter", (ev) => {
      if (!scrubbing) showScrubTip(ev);
    });
    seekWrap.addEventListener("mousemove", (ev) => {
      if (!scrubbing) showScrubTip(ev);
    });
    seekWrap.addEventListener("mouseleave", () => {
      if (!scrubbing) hideScrubTip();
    });

    const savedRate = nearestSpeed(audio.playbackRate || 1);
    applyRate(savedRate);
    syncPlayIcon();
    syncTime();

    return chrome;
  }

  function enhanceExisting(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("audio:not([data-hw-audio-player])").forEach((el) => {
      if (el.closest(".hw-audio-chrome")) return;
      if (el.hasAttribute("data-hw-audio-native")) return;
      mount(el);
    });
  }

  global.HwAudioPlayer = { mount, enhanceExisting, formatTime, probeMediaDuration };
})(typeof window !== "undefined" ? window : globalThis);
