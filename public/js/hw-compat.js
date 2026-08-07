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

  function enhanceVideoElement(video, url, options) {
    options = options || {};
    const clipUrl = normalizeMediaUrl(url);
    if (!clipUrl && !video.src && !video.currentSrc) return null;
    video.preload = options.preload || "metadata";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    if (clipUrl) {
      try {
        video.src = clipUrl;
      } catch {
        return null;
      }
      try {
        video.load();
      } catch {
        /* ignore */
      }
    }
    if (global.HwVideoPlayer?.mount) {
      return global.HwVideoPlayer.mount(video, options);
    }
    video.controls = true;
    return video;
  }

  function enhanceAudioElement(audio, url, options) {
    options = options || {};
    const clipUrl = normalizeMediaUrl(url);
    if (!clipUrl) return null;
    audio.preload = "metadata";
    audio.setAttribute("playsinline", "");
    audio.setAttribute("webkit-playsinline", "");
    try {
      audio.src = clipUrl;
    } catch {
      return null;
    }
    try {
      audio.load();
    } catch {
      /* ignore — src is set; browser will load on play */
    }
    if (global.HwAudioPlayer?.mount) {
      return global.HwAudioPlayer.mount(audio, options);
    }
    audio.controls = true;
    return audio;
  }

  /**
   * MediaRecorder often writes stereo WebM with signal only on the left and a
   * silent right channel. Duplicate the mic into L and R before recording so
   * both ears hear the clip.
   */
  async function getStereoUserMedia(constraints) {
    const base =
      constraints && typeof constraints === "object" ? constraints : { audio: true };
    const raw = await navigator.mediaDevices.getUserMedia(base);
    const micTracks = raw.getAudioTracks();
    if (!micTracks.length) return raw;

    const AudioCtx = global.AudioContext || global.webkitAudioContext;
    if (!AudioCtx) return raw;

    try {
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* ignore */
        }
      }
      const micOnly = new MediaStream(micTracks);
      const source = ctx.createMediaStreamSource(micOnly);
      const merger = ctx.createChannelMerger(2);
      source.connect(merger, 0, 0);
      source.connect(merger, 0, 1);
      const dest = ctx.createMediaStreamDestination();
      merger.connect(dest);
      const stereoTracks = dest.stream.getAudioTracks();
      if (!stereoTracks.length) {
        try {
          await ctx.close();
        } catch {
          /* ignore */
        }
        return raw;
      }

      const out = new MediaStream([...raw.getVideoTracks(), ...stereoTracks]);
      out._hwStereoCleanup = function () {
        try {
          raw.getTracks().forEach((t) => t.stop());
        } catch {
          /* ignore */
        }
        try {
          stereoTracks.forEach((t) => t.stop());
        } catch {
          /* ignore */
        }
        try {
          ctx.close();
        } catch {
          /* ignore */
        }
      };
      return out;
    } catch {
      return raw;
    }
  }

  function stopMediaStream(stream) {
    if (!stream) return;
    if (typeof stream._hwStereoCleanup === "function") {
      try {
        stream._hwStereoCleanup();
      } catch {
        /* ignore */
      }
      stream._hwStereoCleanup = null;
      return;
    }
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
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
    enhanceVideoElement,
    getStereoUserMedia,
    stopMediaStream,
  };
})(typeof window !== "undefined" ? window : globalThis);
