/**
 * Homework Hub — single Subscribe CTA opens tier picker modal.
 */
(function (global) {
  const modal = document.getElementById("hw-subscribe-modal");
  if (!modal) return;

  const openBtns = document.querySelectorAll("[data-hw-subscribe-open]");
  const closeBtns = modal.querySelectorAll("[data-hw-subscribe-close]");
  let lastFocus = null;

  function openModal() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("is-modal-open");
    global.HwCheckout?.bindCheckoutControls?.(modal);
    modal.querySelector("[data-hw-subscribe-close]")?.focus();
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("is-modal-open");
    if (lastFocus instanceof HTMLElement) lastFocus.focus();
    lastFocus = null;
  }

  openBtns.forEach((btn) => {
    btn.addEventListener("click", openModal);
  });

  closeBtns.forEach((el) => {
    el.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  global.HwCheckout?.bindCheckoutControls?.(modal);
})();
