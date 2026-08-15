/**
 * Click outside (dimmed area) closes any <dialog> — feedback, checkout, wipe, etc.
 */
(function () {
  function clickedOutsideDialog(dialog, event) {
    const r = dialog.getBoundingClientRect();
    return (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    );
  }

  function bind(dialog) {
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (dialog.dataset.outsideCloseBound === "1") return;
    dialog.dataset.outsideCloseBound = "1";
    /* Progressive enhancement where supported (Chrome 134+). */
    if (!dialog.hasAttribute("closedby")) {
      try {
        dialog.setAttribute("closedby", "any");
      } catch {
        /* ignore */
      }
    }
    dialog.addEventListener("click", (e) => {
      if (!dialog.open) return;
      if (!clickedOutsideDialog(dialog, e)) return;
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    });
  }

  function scan(root) {
    (root || document).querySelectorAll?.("dialog")?.forEach(bind);
    if (root instanceof HTMLDialogElement) bind(root);
  }

  function boot() {
    scan(document);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          scan(node);
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
