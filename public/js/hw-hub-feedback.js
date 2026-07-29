/**
 * Student hub — Feature request / Bug report pill → Teacher Hub Home notifications.
 */
(function (global) {
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

  function bind() {
    const pill = document.getElementById("hw-hub-feedback-pill");
    const dialog = document.getElementById("hw-hub-feedback-dialog");
    const form = document.getElementById("hw-hub-feedback-form");
    const sendBtn = document.getElementById("hw-hub-feedback-send");
    const statusEl = document.getElementById("hw-hub-feedback-status");
    const messageEl = document.getElementById("hw-hub-feedback-message");
    if (!pill || !dialog || !form || !sendBtn || form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    pill.addEventListener("click", () => {
      setStatus(statusEl, "");
      if (messageEl) messageEl.value = "";
      const featureRadio = form.querySelector('input[name="kind"][value="feature"]');
      if (featureRadio) featureRadio.checked = true;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      messageEl?.focus();
    });

    form.addEventListener("submit", (e) => {
      /* Cancel / Esc closes via method=dialog */
      if (e.submitter && e.submitter.value === "cancel") return;
      e.preventDefault();
    });

    sendBtn.addEventListener("click", async () => {
      const kind = String(form.querySelector('input[name="kind"]:checked')?.value || "").trim();
      const message = String(messageEl?.value || "").trim();
      if (!kind) {
        setStatus(statusEl, "Choose Feature request or Bug report.", true);
        return;
      }
      if (!message) {
        setStatus(statusEl, "Write a short message before sending.", true);
        messageEl?.focus();
        return;
      }

      const session = sessionUser();
      sendBtn.disabled = true;
      setStatus(statusEl, "Sending…");
      try {
        const res = await fetch("/api/feature-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            message,
            username: session?.username || "",
            displayName: session?.displayName || session?.username || "",
            page: "Homework Hub",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not send.");
        setStatus(statusEl, data.message || "Sent to JD — thanks!");
        global.HwToast?.show?.(data.message || "Sent to JD — thanks!");
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

  global.HwHubFeedback = { bind };
})(typeof window !== "undefined" ? window : globalThis);
