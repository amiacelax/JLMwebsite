/**
 * Worksheet library category tabs — Core Japanese, JLPT, Christian, Other, plus custom tabs.
 * Custom tab names persist in localStorage (jlm-hw-ws-custom-cats-v1).
 */
(function (global) {
  "use strict";

  const BUILTIN = [
    { id: "core-japanese", label: "Core Japanese" },
    { id: "jlpt", label: "JLPT" },
    { id: "christian", label: "Christian" },
    { id: "other", label: "Other" },
  ];

  const LS_CUSTOM = "jlm-hw-ws-custom-cats-v1";
  const LS_TAB = "jlm-hw-ws-category-tab";
  const CORE_DEFAULT_IDS = { "sykohpath-secret-hiragana": true };
  const SLUG_RE = /^[a-z0-9-]{1,32}$/;

  function slugify(label) {
    return String(label || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
  }

  function loadCustom() {
    try {
      const raw = localStorage.getItem(LS_CUSTOM);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((entry) => {
          const id = slugify(entry?.id || entry?.label || "");
          const label = String(entry?.label || entry?.id || "").trim();
          if (!id || !label || !SLUG_RE.test(id)) return null;
          if (BUILTIN.some((b) => b.id === id)) return null;
          return { id, label };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function saveCustom(list) {
    try {
      localStorage.setItem(LS_CUSTOM, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  function normalize(raw) {
    const key = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (key === "core-japanese" || key === "core-social-japanese" || key === "corejp") {
      return "core-japanese";
    }
    if (key === "other") return "other";
    if (key === "jlpt") return "jlpt";
    if (key === "christian" || key === "gospel") return "christian";
    if (SLUG_RE.test(key)) return key;
    return undefined;
  }

  function allCategories() {
    const seen = new Set(BUILTIN.map((c) => c.id));
    const custom = loadCustom().filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    return BUILTIN.concat(custom);
  }

  function labelFor(id) {
    const key = normalize(id);
    if (!key) return "Other";
    const hit = allCategories().find((c) => c.id === key);
    return hit ? hit.label : key;
  }

  function defaultForEntry(entry) {
    const id = String(entry?.id || "").trim();
    return (
      normalize(entry?.wsCategory) ||
      (CORE_DEFAULT_IDS[id] ? "core-japanese" : "other")
    );
  }

  function readTab() {
    try {
      const saved = normalize(localStorage.getItem(LS_TAB));
      if (saved && allCategories().some((c) => c.id === saved)) return saved;
    } catch {
      /* ignore */
    }
    return "core-japanese";
  }

  function writeTab(cat) {
    const next = normalize(cat) || "core-japanese";
    try {
      localStorage.setItem(LS_TAB, next);
    } catch {
      /* ignore */
    }
    return next;
  }

  function renderTabs(container, activeId) {
    if (!container) return;
    const active = normalize(activeId) || readTab();
    container.innerHTML = "";
    allCategories().forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-ws-cat-tab" + (cat.id === active ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-ws-cat", cat.id);
      btn.setAttribute("aria-selected", cat.id === active ? "true" : "false");
      btn.textContent = cat.label;
      container.appendChild(btn);
    });
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "hw-ws-cat-tab hw-ws-cat-tab--add";
    addBtn.setAttribute("role", "tab");
    addBtn.setAttribute("data-ws-cat-add", "1");
    addBtn.setAttribute("aria-label", "Add worksheet category");
    addBtn.textContent = "+";
    container.appendChild(addBtn);
  }

  function populateSelect(selectEl, selectedId) {
    if (!selectEl) return;
    const active = normalize(selectedId) || readTab();
    selectEl.innerHTML = allCategories()
      .map(
        (cat) =>
          '<option value="' +
          cat.id +
          '"' +
          (cat.id === active ? " selected" : "") +
          ">" +
          cat.label +
          "</option>"
      )
      .join("");
  }

  function promptAddCategory() {
    const label = window.prompt("Name for new worksheet category tab:", "");
    if (!label || !String(label).trim()) return null;
    const trimmed = String(label).trim().slice(0, 40);
    let id = slugify(trimmed);
    if (!id) {
      window.alert("Please use letters or numbers in the name.");
      return null;
    }
    const exists = allCategories().some((c) => c.id === id);
    if (exists) {
      let n = 2;
      while (allCategories().some((c) => c.id === id + "-" + n)) n++;
      id = (id + "-" + n).slice(0, 32);
    }
    const custom = loadCustom();
    custom.push({ id, label: trimmed });
    saveCustom(custom);
    return id;
  }

  function refreshAllTabs(activeId) {
    const active = normalize(activeId) || readTab();
    renderTabs(document.getElementById("hw-teacher-maker-cat-tabs"), active);
    renderTabs(document.getElementById("hw-library-cat-tabs"), active);
    populateSelect(document.getElementById("hw-teacher-maker-ws-cat"), active);
  }

  global.HwWsCategories = {
    BUILTIN,
    normalize,
    allCategories,
    labelFor,
    defaultForEntry,
    readTab,
    writeTab,
    renderTabs,
    populateSelect,
    promptAddCategory,
    refreshAllTabs,
    loadCustom,
  };

  /* Paint category tabs as soon as this file loads (don’t wait for platform bootstrap). */
  function paintWhenReady() {
    refreshAllTabs(readTab());
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", paintWhenReady);
  } else {
    paintWhenReady();
  }
})(window);
