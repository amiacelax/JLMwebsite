/**
 * Sachiko — student study tutor (hub card → popup; minimize to corner dock).
 * Mock replies until AI backend is wired.
 */
(function (global) {
  "use strict";

  const SUGGESTIONS = [
    "Explain this grammar simply",
    "Give me a hint (not the answer)",
    "Why is my answer wrong?",
    "Message JD on Discord",
  ];

  let initialized = false;
  let greetingSent = false;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatChatText(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  function homeworkContext() {
    const title =
      document.getElementById("hw-current-assignment-title")?.textContent?.trim() ||
      document.querySelector(".hw-worksheet__meta-title")?.textContent?.trim() ||
      "your homework";
    const counter = document.querySelector(".hw-worksheet__slide-counter")?.textContent?.trim();
    return { title, counter };
  }

  function botReply(userText) {
    const t = userText.toLowerCase();
    if (/answer|fill in|what goes|solution/.test(t) && !/hint/.test(t)) {
      return "I can explain the **pattern**, but I won't fill in blanks while you're working.\n\nTry asking for a **hint** or a **grammar note** instead.";
    }
    if (/explain|grammar|how/.test(t)) {
      return "Think about the **verb stem + たい** for wants, and **たくない** for negatives.\n\nIf you tell me which question you're on, I can narrow it down.";
    }
    if (/hint/.test(t)) {
      return "Hint: look at the sentence ending — casual or polite? Negative or positive? Match the blank to the pattern JD used in your lesson.";
    }
    if (/wrong|mistake|why/.test(t)) {
      return "Common slips: mixing **たい** and **たくない**, or adding **です** when the sheet asks for casual. Check your recent mistakes card too.";
    }
    if (/jd|discord|stuck|human|message/.test(t)) {
      return "If you're really stuck, message **JD on Discord** — same place you get lesson links.";
    }
    return "I'm **Sachiko**, your study tutor. Ask for grammar help or a hint — I won't spoil the blanks.";
  }

  function addMessage(box, text, role) {
    if (!box) return;
    const div = document.createElement("div");
    div.className = "hw-sachiko-msg hw-sachiko-msg--" + (role === "user" ? "user" : "bot");
    div.innerHTML = formatChatText(text);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function sendGreetingIfNeeded(msgs) {
    if (greetingSent || !msgs) return;
    greetingSent = true;
    const ctx = homeworkContext();
    const name = global.HwAuth?.getSession?.()?.displayName || "there";
    const line = ctx.counter ? " (" + ctx.counter + ")" : "";
    addMessage(
      msgs,
      `Hi ${name}! I'm **Sachiko**. I can help with **${ctx.title}**${line} — hints and grammar, not answer keys.`,
      "bot"
    );
  }

  function openModal(modal, dock) {
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("hw-sachiko-open");
    if (dock) dock.hidden = true;
    sendGreetingIfNeeded(modal.querySelector(".hw-sachiko-modal__msgs"));
    modal.querySelector(".hw-sachiko-modal__input")?.focus();
  }

  function minimizeModal(modal, dock) {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("hw-sachiko-open");
    if (dock) dock.hidden = false;
  }

  function init() {
    if (initialized) return;
    const session = global.HwAuth?.getSession?.();
    if (!session || session.role === "teacher") return;

    const card = document.getElementById("hw-sachiko-card");
    if (!card || card.classList.contains("hw-sachiko-card--soon")) return;

    const openBtn = document.getElementById("hw-sachiko-open");
    const modal = document.getElementById("hw-sachiko-modal");
    const dock = document.getElementById("hw-sachiko-dock");
    const closeBtn = modal?.querySelector("[data-sachiko-minimize]");
    const backdrop = modal?.querySelector(".hw-sachiko-modal__backdrop");
    const form = modal?.querySelector(".hw-sachiko-modal__form");
    const input = modal?.querySelector(".hw-sachiko-modal__input");
    const msgs = modal?.querySelector(".hw-sachiko-modal__msgs");
    const suggestions = modal?.querySelector(".hw-sachiko-modal__suggestions");

    if (!card || !modal) return;
    initialized = true;

    function open() {
      openModal(modal, dock);
    }

    function minimize() {
      minimizeModal(modal, dock);
    }

    openBtn?.addEventListener("click", open);
    card.addEventListener("click", (e) => {
      if (e.target.closest("#hw-sachiko-open")) return;
      if (e.target.closest("a, button")) return;
      open();
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    dock?.addEventListener("click", open);
    closeBtn?.addEventListener("click", minimize);
    backdrop?.addEventListener("click", minimize);

    SUGGESTIONS.forEach((text) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-sachiko-suggest";
      btn.textContent = text;
      btn.addEventListener("click", () => {
        addMessage(msgs, text, "user");
        setTimeout(() => addMessage(msgs, botReply(text), "bot"), 400);
      });
      suggestions?.appendChild(btn);
    });

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input?.value?.trim();
      if (!text) return;
      addMessage(msgs, text, "user");
      if (input) input.value = "";
      setTimeout(() => addMessage(msgs, botReply(text), "bot"), 450);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) minimize();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.HwSachiko = { init, openModal, minimizeModal };
})(window);
