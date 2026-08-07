/**
 * Teacher view — promo popup email signups (add, edit, delete).
 */
(function (global) {
  let signupsCache = [];
  let editingId = null;
  let loading = false;
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
    return [entry.name, entry.email, entry.page, ...(entry.interests || []), entry.interestOther]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function setComposeStatus(message) {
    const status = document.getElementById("hw-promo-compose-status");
    if (status) status.textContent = message;
  }

  function resetCompose() {
    editingId = null;
    const form = document.getElementById("hw-promo-compose-form");
    form?.reset();
    const cancel = document.getElementById("hw-promo-compose-cancel");
    const save = document.getElementById("hw-promo-compose-save");
    if (cancel) cancel.hidden = true;
    if (save) save.textContent = "Add contact";
    setComposeStatus("Add a name and email, or click Edit on an existing entry.");
    renderList();
  }

  function startEdit(entry) {
    editingId = entry.id;
    const nameInput = document.getElementById("hw-promo-compose-name");
    const emailInput = document.getElementById("hw-promo-compose-email");
    const cancel = document.getElementById("hw-promo-compose-cancel");
    const save = document.getElementById("hw-promo-compose-save");
    if (nameInput) nameInput.value = entry.name || "";
    if (emailInput) emailInput.value = entry.email || "";
    if (cancel) cancel.hidden = false;
    if (save) save.textContent = "Save changes";
    setComposeStatus("Editing " + (entry.name || entry.email) + ".");
    renderList();
    document.getElementById("hw-promo-compose-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    emailInput?.focus();
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

  async function saveContact(session, payload) {
    const res = await fetch("/api/promo-signups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherUsername: session.username,
        ...payload,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not save contact.");
    return data;
  }

  async function deleteContact(session, id) {
    const res = await fetch("/api/promo-signups/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherUsername: session.username,
        id,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not delete contact.");
    return data;
  }

  function renderList() {
    const list = document.getElementById("hw-promo-list");
    const meta = document.getElementById("hw-promo-meta");
    if (!list) return;

    if (loading) {
      if (meta) meta.textContent = "Loading email list…";
      global.HwLoading?.showListWait(list, {
        message: "Loading email list…",
        extraClass: "hw-submissions-item",
      });
      return;
    }

    const query = (document.getElementById("hw-promo-search")?.value || "").trim().toLowerCase();
    const filtered = signupsCache.filter((entry) => {
      if (!query) return true;
      return signupSearchText(entry).includes(query);
    });

    list.replaceChildren();

    if (meta) {
      meta.textContent =
        signupsCache.length === 0
          ? "No contacts yet."
          : filtered.length + " of " + signupsCache.length + " contact" + (signupsCache.length === 1 ? "" : "s");
    }

    if (!filtered.length) {
      const li = document.createElement("li");
      li.className = "hw-submissions-item hw-submissions-item--empty";
      const p = document.createElement("p");
      p.textContent = signupsCache.length
        ? "No contacts match that search."
        : "No contacts yet — add one above or wait for popup signups.";
      li.appendChild(p);
      list.appendChild(li);
      return;
    }

    filtered.forEach((entry) => {
      const li = document.createElement("li");
      li.className =
        "hw-submissions-item" + (entry.id === editingId ? " hw-submissions-item--editing" : "");

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
      title.textContent = entry.name || entry.email;

      if (entry.name) {
        const sub = document.createElement("p");
        sub.className = "hw-submissions-item__sub";
        sub.textContent = entry.email;
        main.append(top, title, sub);
      } else {
        main.append(top, title);
      }

      if (entry.interests?.length || entry.interestOther) {
        const interestLabels = {
          "lesson-discounts": "Lesson discounts",
          "new-learning-games": "New learning games",
          other: entry.interestOther
            ? "Other: " + entry.interestOther
            : "Other",
        };
        const interestLine = document.createElement("p");
        interestLine.className = "hw-submissions-item__sub";
        interestLine.textContent = (entry.interests || [])
          .map((k) => interestLabels[k] || k)
          .join(" · ");
        main.append(interestLine);
      }

      const actions = document.createElement("div");
      actions.className = "hw-submissions-item__actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--ghost btn--sm";
      editBtn.textContent = entry.id === editingId ? "Editing…" : "Edit";
      if (entry.id === editingId) editBtn.disabled = true;
      editBtn.addEventListener("click", () => startEdit(entry));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--ghost btn--sm";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        const label = entry.name || entry.email;
        if (!window.confirm("Remove " + label + " from the email list?")) return;
        const session = options?.getTeacherSession?.();
        if (!session || session.role !== "teacher") return;
        try {
          await deleteContact(session, entry.id);
          signupsCache = signupsCache.filter((item) => item.id !== entry.id);
          if (editingId === entry.id) resetCompose();
          else renderList();
          options?.showToast?.("Contact removed.");
        } catch (err) {
          options?.showToast?.(err.message || "Could not delete.");
        }
      });

      actions.append(editBtn, delBtn);
      li.append(main, actions);
      list.appendChild(li);
    });
  }

  async function reloadSignups() {
    const session = options?.getTeacherSession?.();
    if (!session || session.role !== "teacher") return;
    if (loading) return;

    loading = true;
    renderList();
    try {
      signupsCache = await fetchSignups(session);
    } catch (err) {
      const meta = document.getElementById("hw-promo-meta");
      if (meta) meta.textContent = err.message || "Could not load email list.";
    } finally {
      loading = false;
      renderList();
    }
  }

  async function copyEmails() {
    if (!signupsCache.length) {
      options?.showToast?.("No emails to copy.");
      return;
    }
    const text = signupsCache
      .map((entry) => (entry.name ? entry.name + " <" + entry.email + ">" : entry.email))
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      options?.showToast?.("Copied " + signupsCache.length + " contact(s).");
    } catch {
      options?.showToast?.("Could not copy to clipboard.");
    }
  }

  async function handleComposeSubmit(event) {
    event.preventDefault();
    const session = options?.getTeacherSession?.();
    if (!session || session.role !== "teacher") return;

    const name = (document.getElementById("hw-promo-compose-name")?.value || "").trim();
    const email = (document.getElementById("hw-promo-compose-email")?.value || "").trim();
    if (!email) {
      setComposeStatus("Email or contact info is required.");
      return;
    }

    const saveBtn = document.getElementById("hw-promo-compose-save");
    if (saveBtn) saveBtn.disabled = true;
    const wasEdit = Boolean(editingId);

    try {
      const payload = { email, ...(name ? { name } : {}) };
      if (editingId) payload.id = editingId;

      const result = await saveContact(session, payload);
      await reloadSignups();
      resetCompose();
      options?.showToast?.(result.message || (wasEdit ? "Contact updated." : "Contact added."));
    } catch (err) {
      setComposeStatus(err.message || "Could not save contact.");
      options?.showToast?.(err.message || "Could not save contact.");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
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
    document.getElementById("hw-promo-compose-form")?.addEventListener("submit", (event) => {
      void handleComposeSubmit(event);
    });
    document.getElementById("hw-promo-compose-cancel")?.addEventListener("click", resetCompose);
  }

  function init(opts) {
    options = opts || {};
    bindOnce();
    void reloadSignups();
  }

  global.HwTeacherPromo = { init, reload: reloadSignups };
})(window);
