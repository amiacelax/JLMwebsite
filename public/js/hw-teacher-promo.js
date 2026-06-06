/**
 * Teacher view — promo popup email signups.
 */
(function (global) {
  let signupsCache = [];
  let bound = false;
  let options = null;

  function formatDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  function signupSearchText(entry) {
    return [entry.email, entry.page].filter(Boolean).join(" ").toLowerCase();
  }

  async function fetchSignups(session) {
    const url =
      "/api/promo-signups?teacherUsername=" + encodeURIComponent(session.username);
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not load email list.");
    }
    const data = await res.json();
    return Array.isArray(data.signups) ? data.signups : [];
  }

  function renderList() {
    const list = document.getElementById("hw-promo-list");
    const meta = document.getElementById("hw-promo-meta");
    if (!list) return;

    const query = (document.getElementById("hw-promo-search")?.value || "").trim().toLowerCase();
    const filtered = signupsCache.filter((entry) => {
      if (!query) return true;
      return signupSearchText(entry).includes(query);
    });

    list.replaceChildren();

    if (meta) {
      meta.textContent =
        signupsCache.length === 0
          ? "No signups yet."
          : filtered.length + " of " + signupsCache.length + " signup" + (signupsCache.length === 1 ? "" : "s");
    }

    if (!filtered.length) {
      const li = document.createElement("li");
      li.className = "hw-submissions-item hw-submissions-item--empty";
      const p = document.createElement("p");
      p.textContent = signupsCache.length
        ? "No signups match that search."
        : "No promo emails yet. They appear here when visitors submit the popup on the site.";
      li.appendChild(p);
      list.appendChild(li);
      return;
    }

    filtered.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "hw-submissions-item";

      const main = document.createElement("div");
      main.className = "hw-submissions-item__main";

      const top = document.createElement("div");
      top.className = "hw-submissions-item__top";

      const date = document.createElement("p");
      date.className = "hw-submissions-item__date";
      date.textContent = formatDate(entry.signedUpAt);

      const page = document.createElement("span");
      page.className = "hw-submissions-item__type hw-submissions-item__type--online";
      page.textContent = entry.page || "Unknown";

      top.append(date, page);

      const title = document.createElement("h3");
      title.className = "hw-submissions-item__title";
      title.textContent = entry.email;

      main.append(top, title);
      li.appendChild(main);
      list.appendChild(li);
    });
  }

  async function reloadSignups() {
    const session = options?.getTeacherSession?.();
    if (!session || session.role !== "teacher") return;

    try {
      signupsCache = await fetchSignups(session);
      renderList();
    } catch (err) {
      const meta = document.getElementById("hw-promo-meta");
      if (meta) meta.textContent = err.message || "Could not load email list.";
    }
  }

  async function copyEmails() {
    if (!signupsCache.length) {
      options?.showToast?.("No emails to copy.");
      return;
    }
    const text = signupsCache.map((entry) => entry.email).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      options?.showToast?.("Copied " + signupsCache.length + " email(s).");
    } catch {
      options?.showToast?.("Could not copy to clipboard.");
    }
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    document.getElementById("hw-promo-search")?.addEventListener("input", renderList);
    document.getElementById("hw-promo-refresh")?.addEventListener("click", () => {
      void reloadSignups();
      options?.showToast?.("Email list refreshed.");
    });
    document.getElementById("hw-promo-copy")?.addEventListener("click", () => {
      void copyEmails();
    });
  }

  function init(opts) {
    options = opts || {};
    bindOnce();
    void reloadSignups();
  }

  global.HwTeacherPromo = { init, reload: reloadSignups };
})(window);
