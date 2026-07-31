/**
 * Shared loading indicator (classic hourglass).
 */
(function (global) {
  function makeHourglass(sizeClass) {
    const glass = document.createElement("span");
    glass.className = ["hw-hourglass", sizeClass].filter(Boolean).join(" ");
    glass.setAttribute("role", "img");
    glass.setAttribute("aria-label", "Loading");
    return glass;
  }

  function showListWait(listEl, opts) {
    if (!listEl) return;

    const options = opts || {};
    const message = options.message || "Loading…";
    const extraClass = options.extraClass || "";

    listEl.replaceChildren();

    const li = document.createElement("li");
    li.className = ["hw-list-wait", extraClass].filter(Boolean).join(" ");
    li.setAttribute("aria-busy", "true");

    const text = document.createElement("p");
    text.className = "hw-list-wait__text";
    text.textContent = message;

    li.append(makeHourglass(), text);
    listEl.appendChild(li);
  }

  /** Inline hourglass + message inside a status <p> (Send to hub, save, etc.). */
  function showInlineWait(el, opts) {
    if (!el) return;
    const options = opts || {};
    const message = options.message || "Loading…";

    el.classList.add("hw-status-wait");
    el.setAttribute("aria-busy", "true");
    el.replaceChildren();

    const text = document.createElement("span");
    text.className = "hw-status-wait__text";
    text.textContent = message;

    el.append(makeHourglass("hw-hourglass--inline"), text);
  }

  function clearInlineWait(el) {
    if (!el) return;
    el.classList.remove("hw-status-wait");
    el.removeAttribute("aria-busy");
  }

  global.HwLoading = { showListWait, showInlineWait, clearInlineWait };
})(window);
