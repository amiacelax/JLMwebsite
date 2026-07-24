/**
 * Homework Hub toolbar — question-mark glyph options (playtest chooser).
 * Default is Option 6 (ring idle → solid disc when answers ready).
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "hw-tb-q-icon-option";
  var DEFAULT_ID = "6";

  /** @type {Record<string, { id: string, label: string, blurb: string, html: string }>} */
  var OPTIONS = {
    "1": {
      id: "1",
      label: "Bold sans (current)",
      blurb: "Heavy system sans — the live default.",
      html:
        '<svg class="hw-toolbar-bar__q" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
        '<text x="12" y="18" text-anchor="middle" font-size="18" font-weight="700" font-family="system-ui,Segoe UI,sans-serif" fill="currentColor">?</text>' +
        "</svg>",
    },
    "2": {
      id: "2",
      label: "Classic serif",
      blurb: "Georgia / Times elegance.",
      html:
        '<svg class="hw-toolbar-bar__q" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
        '<text x="12" y="18" text-anchor="middle" font-size="19" font-weight="600" font-family="Georgia,Times New Roman,serif" fill="currentColor">?</text>' +
        "</svg>",
    },
    "3": {
      id: "3",
      label: "Soft rounded",
      blurb: "Friendly rounded display face.",
      html:
        '<svg class="hw-toolbar-bar__q" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
        '<text x="12" y="18.5" text-anchor="middle" font-size="18" font-weight="700" font-family="Nunito,Verdana,sans-serif" fill="currentColor">?</text>' +
        "</svg>",
    },
    "4": {
      id: "4",
      label: "Stroke path",
      blurb: "Thin geometric SVG stroke mark.",
      html:
        '<svg class="hw-toolbar-bar__q" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">' +
        '<path d="M9.2 8.4c0-2.1 1.7-3.6 3.8-3.6 2.1 0 3.7 1.4 3.7 3.4 0 1.5-.7 2.4-2.1 3.3-.9.6-1.4 1.1-1.4 2.2v.6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>' +
        '<circle cx="12.2" cy="18.2" r="1.15" fill="currentColor"/>' +
        "</svg>",
    },
    "5": {
      id: "5",
      label: "Ring badge",
      blurb: "Circle outline with a centered mark.",
      html:
        '<svg class="hw-toolbar-bar__q" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/>' +
        '<text x="12" y="16.2" text-anchor="middle" font-size="12.5" font-weight="700" font-family="system-ui,Segoe UI,sans-serif" fill="currentColor">?</text>' +
        "</svg>",
    },
    "6": {
      id: "6",
      label: "Ring → solid disc",
      blurb: "Hidden until answers are ready; then an orange solid disc with a white ?.",
      html:
        '<svg class="hw-toolbar-bar__q hw-toolbar-bar__q--dual" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
        '<g class="hw-toolbar-bar__q-idle">' +
        '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/>' +
        '<text x="12" y="16.2" text-anchor="middle" font-size="12.5" font-weight="700" font-family="system-ui,Segoe UI,sans-serif" fill="currentColor">?</text>' +
        "</g>" +
        '<g class="hw-toolbar-bar__q-ready">' +
        '<circle cx="12" cy="12" r="10" fill="currentColor"/>' +
        '<text x="12" y="16.4" text-anchor="middle" font-size="13" font-weight="800" font-family="system-ui,Segoe UI,sans-serif" fill="#fff" style="fill:#fff">?</text>' +
        "</g>" +
        "</svg>",
    },
    "7": {
      id: "7",
      label: "Hand sketch",
      blurb: "Irregular hand-drawn stroke.",
      html:
        '<svg class="hw-toolbar-bar__q" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">' +
        '<path d="M8.8 7.6c.4-2.4 2.6-3.8 5-3.5 2.2.3 3.6 1.8 3.4 3.7-.2 1.8-1.2 2.6-2.8 3.5-1 .6-1.7 1.3-1.6 2.6" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M12.6 17.4v.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
        "</svg>",
    },
    "8": {
      id: "8",
      label: "Squared tile",
      blurb: "Rounded square frame.",
      html:
        '<svg class="hw-toolbar-bar__q" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
        '<rect x="3.25" y="3.25" width="17.5" height="17.5" rx="4" fill="none" stroke="currentColor" stroke-width="1.75"/>' +
        '<text x="12" y="16.3" text-anchor="middle" font-size="12.5" font-weight="700" font-family="system-ui,Segoe UI,sans-serif" fill="currentColor">?</text>' +
        "</svg>",
    },
    "9": {
      id: "9",
      label: "Mincho JP",
      blurb: "Japanese serif (Noto / Yu Mincho).",
      html:
        '<svg class="hw-toolbar-bar__q" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
        '<text x="12" y="18" text-anchor="middle" font-size="18" font-weight="600" font-family="Noto Serif JP,Yu Mincho,Hiragino Mincho ProN,serif" fill="currentColor">？</text>' +
        "</svg>",
    },
    "10": {
      id: "10",
      label: "Outline display",
      blurb: "Hollow heavy outline letter.",
      html:
        '<svg class="hw-toolbar-bar__q" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
        '<text x="12" y="18.5" text-anchor="middle" font-size="20" font-weight="800" font-family="Impact,Haettenschweiler,Arial Black,sans-serif" fill="none" stroke="currentColor" stroke-width="1.15" paint-order="stroke">?</text>' +
        "</svg>",
    },
  };

  function normalizeId(raw) {
    var id = String(raw || "").trim();
    return OPTIONS[id] ? id : DEFAULT_ID;
  }

  function getSelectedId() {
    try {
      return normalizeId(global.localStorage?.getItem(STORAGE_KEY));
    } catch {
      return DEFAULT_ID;
    }
  }

  function setSelectedId(id) {
    var next = normalizeId(id);
    try {
      global.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    return next;
  }

  function getOption(id) {
    return OPTIONS[normalizeId(id)];
  }

  function listOptions() {
    return Object.keys(OPTIONS)
      .sort(function (a, b) {
        return Number(a) - Number(b);
      })
      .map(function (id) {
        return OPTIONS[id];
      });
  }

  /**
   * Swap the answers-tool glyph in a toolbar bar (or any host with .hw-toolbar-bar__icon--answers).
   * @param {ParentNode|null|undefined} root
   * @param {string} [id]
   */
  function applyToToolbar(root, id) {
    var host = root || document;
    var icon = host.querySelector?.(".hw-toolbar-bar__icon--answers");
    if (!icon) return null;
    var opt = getOption(id != null ? id : getSelectedId());
    if (icon.dataset.qIconOption === opt.id && icon.querySelector(".hw-toolbar-bar__q")) {
      return opt.id;
    }
    icon.innerHTML = opt.html;
    icon.dataset.qIconOption = opt.id;
    return opt.id;
  }

  global.HwToolbarQIcons = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_ID: DEFAULT_ID,
    OPTIONS: OPTIONS,
    getSelectedId: getSelectedId,
    setSelectedId: setSelectedId,
    getOption: getOption,
    listOptions: listOptions,
    applyToToolbar: applyToToolbar,
    normalizeId: normalizeId,
  };
})(typeof window !== "undefined" ? window : globalThis);
