/**
 * Custom audio chrome — scrub timestamp tooltip + playback speed for all homework audio.
 */
(function (global) {
  const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2];

  const ICON_PLAY =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72L19 12 8 5.14z"/></svg>';
  const ICON_PAUSE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>';

  /** SS:T or M:SS:T — seconds + tenths; minutes only when needed. */
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "00:0";
    const totalTenths = Math.min(Math.max(0, Math.round(seconds * 10)), 359999);
    const min = Math.floor(totalTenths / 600);
    const sec = Math.floor((totalTenths % 600) / 10);
    const tenth = totalTenths % 10;
    const secPart = String(sec).padStart(2, "0") + ":" + tenth;
    return min > 0 ? min + ":" + secPart : secPart;
  }

  function durationTenths(audio) {
    const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
    return dur > 0 ? Math.max(1, Math.round(dur * 10)) : 1;
  }

  function currentTenths(audio) {
    const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    return Math.min(Math.max(0, Math.round(cur * 10)), durationTenths(audio));
  }

  function nearestSpeed(rate) {
    const n = Number(rate);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return SPEED_OPTIONS.reduce((best, opt) =>
      Math.abs(opt - n) < Math.abs(best - n) ? opt : best
    );
  }

  function mount(audio) {
    if (!audio) return null;
    if (audio.dataset.hwAudioPlayer === "1") {
      return audio.closest(".hw-audio-chrome") || audio;
    }
    audio.dataset.hwAudioPlayer = "1";
    audio.controls = false;
    audio.classList.add("hw-audio-chrome__el");

    const chrome = document.createElement("div");
    chrome.className = "hw-audio-chrome";

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
    timeEl.textContent = "00:0 / 00:0";

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

    seekWrap.append(seek, scrubTip);
    bar.append(playBtn, seekWrap, timeEl, speed);

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

    function syncPlayIcon() {
      const playing = !audio.paused && !audio.ended;
      playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    }

    function syncSeekRange() {
      const maxT = durationTenths(audio);
      seek.max = String(maxT);
      if (!scrubbing) {
        seek.value = String(currentTenths(audio));
      }
    }

    function syncTime() {
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      timeEl.textContent = formatTime(cur) + " / " + (dur ? formatTime(dur) : "00:0");
      syncSeekRange();
    }

    function seekTenthsFromRatio(ratio) {
      const maxT = durationTenths(audio);
      if (maxT <= 0) return 0;
      const clamped = Math.min(Math.max(ratio, 0), 1);
      return Math.min(Math.round(clamped * maxT), maxT);
    }

    function applySeekTenths(tenths) {
      const maxT = durationTenths(audio);
      if (maxT <= 0) return;
      const t = Math.min(Math.max(tenths, 0), maxT);
      seek.value = String(t);
      audio.currentTime = t / 10;
      timeEl.textContent = formatTime(audio.currentTime) + " / " + formatTime(audio.duration);
    }

    function seekRatioFromEvent(ev) {
      const rect = seek.getBoundingClientRect();
      if (!rect.width) return 0;
      const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width);
      return x / rect.width;
    }

    function showScrubTip(ev) {
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      const ratio = seekRatioFromEvent(ev);
      const tenths = seekTenthsFromRatio(ratio);
      scrubTip.textContent = formatTime(tenths / 10);
      scrubTip.style.left = ratio * 100 + "%";
      scrubTip.hidden = false;
    }

    function hideScrubTip() {
      scrubTip.hidden = true;
    }

    playBtn.addEventListener("click", () => {
      if (audio.paused || audio.ended) void audio.play();
      else audio.pause();
    });

    audio.addEventListener("play", syncPlayIcon);
    audio.addEventListener("pause", syncPlayIcon);
    audio.addEventListener("ended", syncPlayIcon);
    audio.addEventListener("loadedmetadata", syncTime);
    audio.addEventListener("durationchange", syncTime);
    audio.addEventListener("timeupdate", syncTime);

    seek.addEventListener("input", () => {
      applySeekTenths(Number(seek.value));
    });

    seek.addEventListener("pointerdown", (ev) => {
      scrubbing = true;
      seekPointerId = ev.pointerId;
      seek.setPointerCapture?.(ev.pointerId);
      applySeekTenths(seekTenthsFromRatio(seekRatioFromEvent(ev)));
      showScrubTip(ev);
    });

    seek.addEventListener("pointermove", (ev) => {
      if (!scrubbing) return;
      applySeekTenths(seekTenthsFromRatio(seekRatioFromEvent(ev)));
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

    speed.addEventListener("change", () => {
      const rate = Number(speed.value);
      audio.playbackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
    });

    const savedRate = nearestSpeed(audio.playbackRate || 1);
    speed.value = String(savedRate);
    audio.playbackRate = savedRate;
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

  global.HwAudioPlayer = { mount, enhanceExisting, formatTime };
})(typeof window !== "undefined" ? window : globalThis);
