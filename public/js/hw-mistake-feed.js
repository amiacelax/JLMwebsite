/**
 * Shared mistake feed — ❌ wrong / ✅ correction display.
 */
(function (global) {
  function sortByRecent(mistakes) {
    return (mistakes || [])
      .slice()
      .sort((a, b) =>
        String(b.createdAt || b.updatedAt || "").localeCompare(
          String(a.createdAt || a.updatedAt || "")
        )
      );
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  function createPairEl(entry) {
    const pair = document.createElement("div");
    pair.className = "hw-mistake-feed__pair";

    const wrong = document.createElement("p");
    wrong.className = "hw-mistake-feed__wrong";
    wrong.textContent = "❌" + (entry.text || "");
    pair.appendChild(wrong);

    if (entry.correction) {
      const right = document.createElement("p");
      right.className = "hw-mistake-feed__right";
      right.textContent = "✅" + entry.correction;
      pair.appendChild(right);
    }

    return pair;
  }

  function createFeedItem(entry, options) {
    options = options || {};
    const li = document.createElement("li");
    li.className = "hw-mistake-feed__item";
    if (entry.id) li.dataset.mistakeId = entry.id;

    const pair = createPairEl(entry);

    if (options.checkable) {
      const label = document.createElement("label");
      label.className = "hw-mistake-feed__row";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "hw-mistake-feed__check";
      check.setAttribute("aria-label", "I've got this — mark resolved");

      const body = document.createElement("span");
      body.className = "hw-mistake-feed__body";
      body.appendChild(pair);

      label.append(check, body);
      li.appendChild(label);

      label.addEventListener("click", (e) => e.stopPropagation());
      check.addEventListener("click", (e) => e.stopPropagation());

      check.addEventListener("change", () => {
        if (check.checked && typeof options.onResolve === "function") {
          options.onResolve(entry, li, check);
        }
      });
    } else {
      li.appendChild(pair);
    }

    if (options.showStudent || options.showWhen) {
      const meta = document.createElement("p");
      meta.className = "hw-mistake-feed__meta";
      const parts = [];
      if (options.showStudent && entry.username) parts.push(entry.username);
      if (options.showWhen) {
        const when = formatWhen(entry.createdAt || entry.updatedAt);
        if (when) parts.push(when);
      }
      meta.textContent = parts.join(" · ");
      li.appendChild(meta);
    }

    return li;
  }

  function renderFeed(listEl, mistakes, options) {
    if (!listEl) return;
    listEl.innerHTML = "";
    options = options || {};

    const rows = sortByRecent(mistakes);
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.className = "hw-mistake-feed__empty";
      empty.textContent = options.emptyText || "Nothing here yet.";
      listEl.appendChild(empty);
      return;
    }

    const limit = options.limit || 0;
    const slice = limit > 0 ? rows.slice(0, limit) : rows;
    slice.forEach((entry) => {
      listEl.appendChild(createFeedItem(entry, options));
    });
  }

  global.HwMistakeFeed = {
    sortByRecent,
    renderFeed,
    createFeedItem,
  };
})(typeof window !== "undefined" ? window : globalThis);
