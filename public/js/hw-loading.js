/**
 * Shared list loading indicator (classic hourglass).
 */
(function (global) {
  function showListWait(listEl, opts) {
    if (!listEl) return;

    const options = opts || {};
    const message = options.message || "Loading…";
    const extraClass = options.extraClass || "";

    listEl.replaceChildren();

    const li = document.createElement("li");
    li.className = ["hw-list-wait", extraClass].filter(Boolean).join(" ");
    li.setAttribute("aria-busy", "true");

    const glass = document.createElement("span");
    glass.className = "hw-hourglass";
    glass.setAttribute("role", "img");
    glass.setAttribute("aria-label", "Loading");

    const text = document.createElement("p");
    text.className = "hw-list-wait__text";
    text.textContent = message;

    li.append(glass, text);
    listEl.appendChild(li);
  }

  global.HwLoading = { showListWait };
})(window);
