/**
 * Student hub — Feature request / Bug report → Teacher Hub + Discord.
 * Bug reports capture a screenshot (optional comment) before send.
 */
(function (global) {
  const HTML2CANVAS_SRC = "/js/vendor/html2canvas.min.js?v=pro-238";
  const SHOT_SKIPPED = "Couldn’t capture a screenshot. You can still send a text report.";

  let html2canvasPromise = null;
  let pendingScreenshot = null;
  let openInFlight = false;

  function sessionUser() {
    return (
      global.HwAuth?.getSession?.() ||
      global.HwAuth?.getStudentSession?.() ||
      null
    );
  }

  function setStatus(el, msg, isError) {
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("hw-maker-status--error", !!isError);
  }

  function loadHtml2Canvas() {
    if (typeof global.html2canvas === "function") {
      return Promise.resolve(global.html2canvas);
    }
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise((resolve, reject) => {
      const finishOk = () => {
        if (typeof global.html2canvas === "function") resolve(global.html2canvas);
        else reject(new Error("Screenshot tool failed to load."));
      };
      const existing = document.querySelector('script[data-hw-html2canvas="1"]');
      if (existing) {
        existing.addEventListener("load", finishOk);
        existing.addEventListener("error", () =>
          reject(new Error("Could not load screenshot tool."))
        );
        if (typeof global.html2canvas === "function") finishOk();
        return;
      }
      const script = document.createElement("script");
      script.src = HTML2CANVAS_SRC;
      script.async = true;
      script.dataset.hwHtml2canvas = "1";
      script.onload = finishOk;
      script.onerror = () => reject(new Error("Could not load screenshot tool."));
      document.head.appendChild(script);
    });
    const timed = Promise.race([
      html2canvasPromise,
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error("Screenshot tool timed out.")), 8000);
      }),
    ]).catch((err) => {
      html2canvasPromise = null;
      throw err;
    });
    return timed;
  }

  function isDialogOpen(dialog) {
    return Boolean(dialog && (dialog.open || dialog.hasAttribute("open")));
  }

  function showFeedbackDialog(dialog) {
    if (!dialog || isDialogOpen(dialog)) return;
    try {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } catch {
      try {
        dialog.removeAttribute("open");
        if (typeof dialog.showModal === "function") dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    }
  }

  function closeFeedbackDialog(dialog) {
    if (!dialog || !isDialogOpen(dialog)) return;
    try {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    } catch {
      dialog.removeAttribute("open");
    }
  }

  function setBugBtnBusy(busy) {
    const btn = document.getElementById("hw-hub-bug-report-btn");
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.hwLabel) btn.dataset.hwLabel = btn.textContent || "Bug report";
      btn.textContent = "Capturing…";
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
    } else {
      btn.textContent = btn.dataset.hwLabel || "Bug report";
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }

  function waitForImageReady(img) {
    return new Promise((resolve) => {
      if (!img) {
        resolve(false);
        return;
      }
      const src = img.getAttribute("src") || img.src || "";
      if (!src) {
        resolve(false);
        return;
      }
      const finish = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
      const decodeThenFinish = () => {
        if (typeof img.decode === "function") {
          img.decode().then(finish).catch(finish);
        } else {
          finish();
        }
      };
      if (img.complete) {
        if (img.naturalWidth > 0) decodeThenFinish();
        else resolve(false);
        return;
      }
      img.addEventListener("load", decodeThenFinish, { once: true });
      img.addEventListener("error", () => resolve(false), { once: true });
    });
  }

  function isCrossOriginUrl(url) {
    const raw = String(url || "").trim();
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return false;
    try {
      const parsed = new URL(raw, global.location?.href || "http://localhost/");
      return parsed.origin !== global.location.origin;
    } catch {
      return true;
    }
  }

  function shouldSkipShotElement(el) {
    if (!el) return false;
    if (el.id === "hw-hub-feedback-dialog") return true;
    const cls = el.classList;
    if (
      cls &&
      (cls.contains("hw-hub-feedback-dialog") ||
        cls.contains("hw-hub-bug-report-btn") ||
        cls.contains("hw-platform-toast") ||
        cls.contains("section-kumo") ||
        cls.contains("section-kumo__img") ||
        cls.contains("hw-mg-widget") ||
        cls.contains("hw-hc-launcher"))
    ) {
      return true;
    }
    if (el.closest?.(".section-kumo, dialog, .hw-mg-widget, .hw-hc-bubble")) return true;
    const tag = String(el.tagName || "").toUpperCase();
    if (
      tag === "IFRAME" ||
      tag === "VIDEO" ||
      tag === "AUDIO" ||
      tag === "CANVAS" ||
      tag === "EMBED" ||
      tag === "OBJECT"
    ) {
      return true;
    }
    if (tag === "IMG" || tag === "IMAGE" || tag === "SOURCE") {
      const src = el.currentSrc || el.src || el.href || el.getAttribute?.("href") || "";
      if (src && isCrossOriginUrl(src)) return true;
    }
    return false;
  }

  function canvasToJpegDataUrl(canvas, maxWidth, quality) {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return "";
    let out = canvas;
    if (w > maxWidth) {
      const scale = maxWidth / w;
      const resized = document.createElement("canvas");
      resized.width = Math.round(w * scale);
      resized.height = Math.round(h * scale);
      const ctx = resized.getContext("2d");
      if (!ctx) return canvas.toDataURL("image/jpeg", quality);
      ctx.drawImage(canvas, 0, 0, resized.width, resized.height);
      out = resized;
    }
    try {
      return out.toDataURL("image/jpeg", quality);
    } catch {
      return "";
    }
  }

  async function captureScreenshot() {
    const h2c = await loadHtml2Canvas();
    const target =
      document.getElementById("hw-platform-student-only") ||
      document.getElementById("main") ||
      document.body;
    const root = document.documentElement;
    root.classList.add("hw-shot-capture");
    await new Promise((r) => window.setTimeout(r, 30));
    try {
      const canvas = await Promise.race([
        h2c(target, {
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: "#0f1629",
          scale: 0.5,
          ignoreElements: shouldSkipShotElement,
          onclone: (clonedDoc) => {
            clonedDoc.querySelectorAll("dialog").forEach((d) => {
              try {
                if (typeof d.close === "function") d.close();
              } catch {
                /* ignore */
              }
              d.removeAttribute("open");
            });
          },
        }),
        new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error("Screenshot timed out.")), 8000);
        }),
      ]);
      return canvasToJpegDataUrl(canvas, 960, 0.7);
    } finally {
      root.classList.remove("hw-shot-capture");
    }
  }

  async function setScreenshotPreview(dataUrl, options) {
    options = options || {};
    pendingScreenshot = dataUrl || null;
    const wrap = document.getElementById("hw-hub-feedback-shot-wrap");
    const img = document.getElementById("hw-hub-feedback-shot");
    const note = document.getElementById("hw-hub-feedback-shot-note");
    if (img) {
      if (dataUrl) {
        img.hidden = false;
        img.src = dataUrl;
      } else {
        img.removeAttribute("src");
        img.hidden = true;
      }
    }
    if (wrap) wrap.hidden = !dataUrl;
    if (dataUrl && img) {
      const loaded = await waitForImageReady(img);
      if (!loaded) {
        pendingScreenshot = null;
        img.removeAttribute("src");
        img.hidden = true;
        if (wrap) wrap.hidden = true;
        if (note) {
          note.textContent = SHOT_SKIPPED;
          note.hidden = false;
        }
        return false;
      }
    }
    if (!note) return Boolean(dataUrl);
    if (!dataUrl && !options.attempted) {
      note.textContent = "";
      note.hidden = true;
      return false;
    }
    note.textContent = dataUrl ? "Screenshot attached — optional comment below." : SHOT_SKIPPED;
    note.hidden = false;
    return Boolean(dataUrl);
  }

  function selectedKind(form) {
    return String(form.querySelector('input[name="kind"]:checked')?.value || "").trim();
  }

  function syncKindUi(form) {
    const kind = selectedKind(form);
    const messageEl = document.getElementById("hw-hub-feedback-message");
    const label = form.querySelector('label[for="hw-hub-feedback-message"]');
    const shotNote = document.getElementById("hw-hub-feedback-shot-note");
    if (kind === "bug") {
      if (messageEl) {
        messageEl.required = false;
        messageEl.placeholder = "Optional — what’s wrong?";
      }
      if (label) {
        const text = label.childNodes[0];
        if (text && text.nodeType === Node.TEXT_NODE) {
          text.textContent = "Comment (optional)";
        }
      }
      if (shotNote && pendingScreenshot) {
        shotNote.textContent = "Screenshot attached — optional comment below.";
      }
    } else {
      if (messageEl) {
        messageEl.required = true;
        messageEl.placeholder = "What’s broken, or what would you like?";
      }
      if (label) {
        const text = label.childNodes[0];
        if (text && text.nodeType === Node.TEXT_NODE) {
          text.textContent = "Message";
        }
      }
    }
  }

  async function grabBugScreenshot(statusEl) {
    setStatus(statusEl, "");
    try {
      const dataUrl = await captureScreenshot();
      const ok = await setScreenshotPreview(dataUrl, { attempted: true });
      setStatus(statusEl, ok ? "" : "Screenshot skipped — add a comment if you can.");
      return ok;
    } catch {
      await setScreenshotPreview("", { attempted: true });
      setStatus(statusEl, "Screenshot skipped — add a comment if you can.");
      return false;
    }
  }

  async function openDialog(preferKind) {
    const dialog = document.getElementById("hw-hub-feedback-dialog");
    const form = document.getElementById("hw-hub-feedback-form");
    const statusEl = document.getElementById("hw-hub-feedback-status");
    const messageEl = document.getElementById("hw-hub-feedback-message");
    if (!dialog || !form) return;
    if (openInFlight) return;
    openInFlight = true;

    try {
      closeFeedbackDialog(dialog);
      setStatus(statusEl, "");
      if (messageEl) messageEl.value = "";
      pendingScreenshot = null;
      await setScreenshotPreview("");

      const kind = preferKind === "bug" ? "bug" : "feature";
      const radio = form.querySelector('input[name="kind"][value="' + kind + '"]');
      if (radio) radio.checked = true;
      syncKindUi(form);

      if (kind === "bug") {
        setBugBtnBusy(true);
        await grabBugScreenshot(statusEl);
        setBugBtnBusy(false);
      }

      showFeedbackDialog(dialog);
      messageEl?.focus();
    } finally {
      setBugBtnBusy(false);
      openInFlight = false;
    }
  }

  function bind() {
    const pill = document.getElementById("hw-hub-feedback-pill");
    const headerBug = document.getElementById("hw-hub-bug-report-btn");
    const dialog = document.getElementById("hw-hub-feedback-dialog");
    const form = document.getElementById("hw-hub-feedback-form");
    const sendBtn = document.getElementById("hw-hub-feedback-send");
    const statusEl = document.getElementById("hw-hub-feedback-status");
    const messageEl = document.getElementById("hw-hub-feedback-message");
    if (!dialog || !form || !sendBtn || form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    pill?.addEventListener("click", () => {
      void openDialog("feature");
    });
    headerBug?.addEventListener("click", () => {
      void openDialog("bug");
    });

    form.querySelectorAll('input[name="kind"]').forEach((input) => {
      input.addEventListener("change", async () => {
        syncKindUi(form);
        if (selectedKind(form) !== "bug" || pendingScreenshot) return;
        const wasOpen = isDialogOpen(dialog);
        if (wasOpen) closeFeedbackDialog(dialog);
        setBugBtnBusy(true);
        await grabBugScreenshot(statusEl);
        setBugBtnBusy(false);
        if (wasOpen) {
          showFeedbackDialog(dialog);
          messageEl?.focus();
        }
      });
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
    });
    form.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    const cancelBtn = document.getElementById("hw-hub-feedback-cancel");
    cancelBtn?.addEventListener("click", () => {
      setStatus(statusEl, "");
      pendingScreenshot = null;
      setScreenshotPreview("");
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });

    dialog.addEventListener("cancel", (e) => {
      /* Esc — always allow close without validating the message field. */
      e.preventDefault();
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });

    sendBtn.addEventListener("click", async () => {
      const kind = selectedKind(form);
      let message = String(messageEl?.value || "").trim();
      if (!kind) {
        setStatus(statusEl, "Choose Feature request or Bug report.", true);
        return;
      }
      if (kind === "feature" && !message) {
        setStatus(statusEl, "Write a short message before sending.", true);
        messageEl?.focus();
        return;
      }
      if (kind === "bug" && !message && !pendingScreenshot) {
        setStatus(statusEl, "Add a short comment or retry so a screenshot is attached.", true);
        return;
      }
      if (kind === "bug" && !message) {
        message = "(No comment — screenshot only)";
      }

      const session = sessionUser();
      sendBtn.disabled = true;
      setStatus(statusEl, "Sending…");
      try {
        const payload = {
          kind,
          message,
          username: session?.username || "",
          displayName: session?.displayName || session?.username || "",
          page:
            "Homework Hub" +
            (global.location?.pathname ? " (" + global.location.pathname + ")" : ""),
        };
        if (kind === "bug" && pendingScreenshot) {
          payload.imageBase64 = pendingScreenshot;
        }
        const res = await fetch("/api/feature-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not send.");
        setStatus(statusEl, data.message || "Thanks — your message was sent to JD.");
        global.HwToast?.show?.(data.message || "Thanks — your message was sent to JD.");
        pendingScreenshot = null;
        window.setTimeout(() => {
          if (typeof dialog.close === "function") dialog.close();
          else dialog.removeAttribute("open");
        }, 900);
      } catch (err) {
        setStatus(statusEl, (err && err.message) || "Could not send.", true);
      } finally {
        sendBtn.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  global.HwHubFeedback = { bind, openDialog };
})(typeof window !== "undefined" ? window : globalThis);
