/**
 * Student hub — Feature request / Bug report → Teacher Hub + Discord.
 * Bug reports capture a screenshot (optional comment) before send.
 */
(function (global) {
  const HTML2CANVAS_SRC =
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";

  let html2canvasPromise = null;
  let pendingScreenshot = null;

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
    if (global.html2canvas) return Promise.resolve(global.html2canvas);
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-hw-html2canvas="1"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(global.html2canvas));
        existing.addEventListener("error", () =>
          reject(new Error("Could not load screenshot tool."))
        );
        return;
      }
      const script = document.createElement("script");
      script.src = HTML2CANVAS_SRC;
      script.async = true;
      script.dataset.hwHtml2canvas = "1";
      script.onload = () => {
        if (global.html2canvas) resolve(global.html2canvas);
        else reject(new Error("Screenshot tool failed to load."));
      };
      script.onerror = () => reject(new Error("Could not load screenshot tool."));
      document.head.appendChild(script);
    });
    return html2canvasPromise;
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
    const dialog = document.getElementById("hw-hub-feedback-dialog");
    const wasOpen = dialog && (dialog.open || dialog.hasAttribute("open"));
    if (wasOpen && typeof dialog.close === "function") dialog.close();
    else if (wasOpen) dialog.removeAttribute("open");

    /* Let the dialog hide before capture. */
    await new Promise((r) => window.setTimeout(r, 60));

    try {
      const canvas = await h2c(document.body, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        scale: Math.min(1.25, global.devicePixelRatio || 1),
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
        ignoreElements: (el) => {
          if (!el || !el.classList) return false;
          return (
            el.id === "hw-hub-feedback-dialog" ||
            el.classList.contains("hw-hub-feedback-dialog") ||
            el.classList.contains("hw-platform-toast")
          );
        },
      });
      return canvasToJpegDataUrl(canvas, 1280, 0.72);
    } finally {
      if (wasOpen) {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
    }
  }

  function setScreenshotPreview(dataUrl) {
    pendingScreenshot = dataUrl || null;
    const wrap = document.getElementById("hw-hub-feedback-shot-wrap");
    const img = document.getElementById("hw-hub-feedback-shot");
    const note = document.getElementById("hw-hub-feedback-shot-note");
    if (img) {
      if (dataUrl) {
        img.src = dataUrl;
        img.hidden = false;
      } else {
        img.removeAttribute("src");
        img.hidden = true;
      }
    }
    if (wrap) wrap.hidden = !dataUrl;
    if (note) {
      note.textContent = dataUrl
        ? "Screenshot attached — optional comment below."
        : "Couldn’t capture a screenshot. You can still send a text report.";
      note.hidden = false;
    }
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

  async function openDialog(preferKind) {
    const dialog = document.getElementById("hw-hub-feedback-dialog");
    const form = document.getElementById("hw-hub-feedback-form");
    const statusEl = document.getElementById("hw-hub-feedback-status");
    const messageEl = document.getElementById("hw-hub-feedback-message");
    if (!dialog || !form) return;

    setStatus(statusEl, "");
    if (messageEl) messageEl.value = "";
    pendingScreenshot = null;
    setScreenshotPreview("");

    const kind = preferKind === "bug" ? "bug" : "feature";
    const radio = form.querySelector('input[name="kind"][value="' + kind + '"]');
    if (radio) radio.checked = true;
    syncKindUi(form);

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");

    if (kind === "bug") {
      setStatus(statusEl, "Capturing screenshot…");
      try {
        const dataUrl = await captureScreenshot();
        setScreenshotPreview(dataUrl);
        setStatus(statusEl, dataUrl ? "" : "Screenshot skipped — add a comment if you can.");
      } catch (err) {
        setScreenshotPreview("");
        setStatus(
          statusEl,
          (err && err.message) || "Screenshot skipped — you can still send text.",
          false
        );
      }
    }

    messageEl?.focus();
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
        if (selectedKind(form) === "bug" && !pendingScreenshot) {
          setStatus(statusEl, "Capturing screenshot…");
          try {
            const dataUrl = await captureScreenshot();
            setScreenshotPreview(dataUrl);
            setStatus(statusEl, "");
          } catch (err) {
            setScreenshotPreview("");
            setStatus(
              statusEl,
              (err && err.message) || "Screenshot skipped.",
              false
            );
          }
        }
      });
    });

    form.addEventListener("submit", (e) => {
      /* Send is type=button; prevent accidental Enter submit validation traps. */
      e.preventDefault();
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
        setStatus(statusEl, data.message || "Sent to JD — thanks!");
        global.HwToast?.show?.(data.message || "Sent to JD — thanks!");
        pendingScreenshot = null;
        window.setTimeout(() => {
          if (typeof dialog.close === "function") dialog.close();
          else dialog.removeAttribute("open");
        }, 450);
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
