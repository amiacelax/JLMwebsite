/**
 * Homework platform — small browser compatibility helpers (Chrome, Safari, Firefox).
 */
(function (global) {
  function normalizeMediaUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    return raw.replace(/'/g, "%27");
  }

  function isAppleWebKit() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/i.test(ua) || (/\bMacintosh\b/i.test(ua) && "ontouchend" in document);
  }

  function pickRecorderMimeType(candidates) {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
    const types = candidates || [
      ...(isAppleWebKit()
        ? ["video/mp4", "audio/mp4", "video/webm;codecs=vp8,opus", "video/webm"]
        : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]),
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function getFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      null
    );
  }

  function requestFullscreen(el) {
    const target = el || document.documentElement;
    const fn =
      target.requestFullscreen ||
      target.webkitRequestFullscreen ||
      target.mozRequestFullScreen;
    if (!fn) return Promise.reject(new Error("fullscreen unsupported"));
    return Promise.resolve(fn.call(target));
  }

  function exitFullscreen() {
    const fn =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.mozCancelFullScreen;
    if (!fn) return Promise.resolve();
    return Promise.resolve(fn.call(document));
  }

  function bindFullscreenChange(handler) {
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
  }

  function enhanceAudioElement(audio, url) {
    const clipUrl = normalizeMediaUrl(url);
    if (!clipUrl) return false;
    audio.preload = "metadata";
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    try {
      audio.src = clipUrl;
    } catch {
      return false;
    }
    if (global.HwAudioPlayer?.mount) {
      global.HwAudioPlayer.mount(audio);
    } else {
      audio.controls = true;
    }
    return true;
  }

  global.HwCompat = {
    normalizeMediaUrl,
    isAppleWebKit,
    pickRecorderMimeType,
    getFullscreenElement,
    requestFullscreen,
    exitFullscreen,
    bindFullscreenChange,
    enhanceAudioElement,
  };
})(typeof window !== "undefined" ? window : globalThis);
