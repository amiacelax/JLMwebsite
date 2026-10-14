/**
 * Click the dimmed area to close any <dialog> — feedback, checkout, wipe, etc.
 * Close only when the click's target is the dialog itself (the dim), never a child.
 */
(function () {
  function bind(dialog) {
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (dialog.dataset.outsideCloseBound === "1") return;
    dialog.dataset.outsideCloseBound = "1";
    if (!dialog.hasAttribute("closedby")) {
      try {
        dialog.setAttribute("closedby", "closerequest");
      } catch {
        /* ignore */
      }
    }
    dialog.addEventListener("click", (e) => {
      if (!dialog.open) return;
      if (e.target !== dialog) return;
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
