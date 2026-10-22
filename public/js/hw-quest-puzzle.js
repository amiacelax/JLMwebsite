/**
 * Immersion Quest — monthly animal jigsaw.
 * Classic interlocking pieces; animal = full grid with outline cut out.
 * v1 January: へび (snake-shaped set of cells).
 */
(function (global) {
  "use strict";

  const MONTH_ANIMALS = [
    { month: 1, ja: "へび", en: "Snake" },
    { month: 2, ja: "うさぎ", en: "Rabbit" },
    { month: 3, ja: "かめ", en: "Turtle" },
    { month: 4, ja: "とり", en: "Bird" },
    { month: 5, ja: "ねこ", en: "Cat" },
    { month: 6, ja: "ドラゴン", en: "Dragon" },
    { month: 7, ja: "ねずみ", en: "Mouse" },
    { month: 8, ja: "いぬ", en: "Dog" },
    { month: 9, ja: "サル", en: "Monkey" },
    { month: 10, ja: "ワニ", en: "Crocodile" },
    { month: 11, ja: "シカ", en: "Deer" },
    { month: 12, ja: "うし", en: "Ox" },
  ];

  /**
   * Snake cut from a grid: [row, col], tip-of-tail → head (max 31).
   * Shorter months use the first N cells.
   */
  const SNAKE_CELLS = [
    [7, 0],
    [7, 1],
    [6, 1],
    [5, 1],
    [4, 1],
    [3, 1],
    [2, 1],
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
    [5, 4],
    [6, 4],
    [6, 5],
    [6, 6],
    [6, 7],
    [5, 7],
    [4, 7],
    [3, 7],
    [2, 7],
    [1, 7],
    [1, 8],
    [1, 9],
    [1, 10],
    [2, 10],
    [3, 10],
    [4, 10],
    [4, 11],
  ];

  const GRID = { cols: 12, rows: 9, cell: 28, pad: 14 };
  const PREVIEW_ANIMAL_ONLY = true;

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function monthAnimal(month) {
    return MONTH_ANIMALS.find((a) => a.month === month) || MONTH_ANIMALS[0];
  }

  function earnedDaysForMonth(progress, year, month) {
    const prefix = String(year) + "-" + String(month).padStart(2, "0") + "-";
    const days = new Set();
    const list = Array.isArray(progress?.completed) ? progress.completed : [];
    list.forEach((row) => {
      const ymd = String(row?.ymd || "");
      if (!ymd.startsWith(prefix)) return;
      const d = Number(ymd.slice(8, 10));
      if (d >= 1 && d <= 31) days.add(d);
    });
    return days;
  }

  function cellKey(r, c) {
    return r + "," + c;
  }

  /** Shared-edge tab owner: +1 means first cell gets the tab toward the second. */
  function edgeTabSign(r1, c1, r2, c2) {
    return (r1 * 17 + c1 * 31 + r2 * 13 + c2 * 7) % 2 === 0 ? 1 : -1;
  }

  /**
   * Classic jigsaw outline. tabs n/e/s/w: 1 tab out, -1 socket, 0 flat (shaved).
   * Ends each side on an absolute corner so seams meet cleanly.
   */
  function jigsawPath(x, y, size, tabs) {
    const tab = size * 0.2;
    const mid = size * 0.5;

    function topEdge() {
      const x2 = x + size;
      if (tabs.n === 0) return "L " + x2 + " " + y + " ";
      const s = tabs.n; // +1 out (−y)
      return (
        "L " +
        (x + mid - tab) +
        " " +
        y +
        " " +
        "c " +
        tab * 0.25 +
        " 0, " +
        tab * 0.35 +
        " " +
        -s * tab +
        ", " +
        tab +
        " " +
        -s * tab +
        " " +
        "c " +
        tab * 0.4 +
        " 0, " +
        tab * 0.4 +
        " " +
        s * tab +
        ", " +
        tab +
        " " +
        s * tab +
        " " +
        "L " +
        x2 +
        " " +
        y +
        " "
      );
    }

    function rightEdge() {
      const y2 = y + size;
      if (tabs.e === 0) return "L " + (x + size) + " " + y2 + " ";
      const s = tabs.e; // +1 out (+x)
      return (
        "L " +
        (x + size) +
        " " +
        (y + mid - tab) +
        " " +
        "c 0 " +
        tab * 0.25 +
        ", " +
        s * tab +
        " " +
        tab * 0.35 +
        ", " +
        s * tab +
        " " +
        tab +
        " " +
        "c 0 " +
        tab * 0.4 +
        ", " +
        -s * tab +
        " " +
        tab * 0.4 +
        ", " +
        -s * tab +
        " " +
        tab +
        " " +
        "L " +
        (x + size) +
        " " +
        y2 +
        " "
      );
    }

    function bottomEdge() {
      if (tabs.s === 0) return "L " + x + " " + (y + size) + " ";
      const s = tabs.s; // +1 out (+y)
      return (
        "L " +
        (x + mid + tab) +
        " " +
        (y + size) +
        " " +
        "c " +
        -tab * 0.25 +
        " 0, " +
        -tab * 0.35 +
        " " +
        s * tab +
        ", " +
        -tab +
        " " +
        s * tab +
        " " +
        "c " +
        -tab * 0.4 +
        " 0, " +
        -tab * 0.4 +
        " " +
        -s * tab +
        ", " +
        -tab +
        " " +
        -s * tab +
        " " +
        "L " +
        x +
        " " +
        (y + size) +
        " "
      );
    }

    function leftEdge() {
      if (tabs.w === 0) return "L " + x + " " + y + " ";
      const s = tabs.w; // +1 out (−x)
      return (
        "L " +
        x +
        " " +
        (y + mid + tab) +
        " " +
        "c 0 " +
        -tab * 0.25 +
        ", " +
        -s * tab +
        " " +
        -tab * 0.35 +
        ", " +
        -s * tab +
        " " +
        -tab +
        " " +
        "c 0 " +
        -tab * 0.4 +
        ", " +
        s * tab +
        " " +
        -tab * 0.4 +
        ", " +
        s * tab +
        " " +
        -tab +
        " " +
        "L " +
        x +
        " " +
        y +
        " "
      );
    }

    return (
      "M " + x + " " + y + " " + topEdge() + rightEdge() + bottomEdge() + leftEdge() + "Z"
    );
  }

  function tabsForCell(r, c, inSnake) {
    const hasN = inSnake.has(cellKey(r - 1, c));
    const hasE = inSnake.has(cellKey(r, c + 1));
    const hasS = inSnake.has(cellKey(r + 1, c));
    const hasW = inSnake.has(cellKey(r, c - 1));
    return {
      n: hasN ? edgeTabSign(r, c, r - 1, c) : 0,
      e: hasE ? edgeTabSign(r, c, r, c + 1) : 0,
      s: hasS ? -edgeTabSign(r + 1, c, r, c) : 0,
      w: hasW ? -edgeTabSign(r, c - 1, r, c) : 0,
    };
  }

  function buildSnakePieces(total) {
    const cells = SNAKE_CELLS.slice(0, Math.min(total, SNAKE_CELLS.length));
    const inSnake = new Set(cells.map(([r, c]) => cellKey(r, c)));
    const { cell, pad } = GRID;

    return cells.map(([r, c], i) => {
      const day = i + 1;
      const x = pad + c * cell;
      const y = pad + r * cell;
      return {
        day: day,
        r: r,
        c: c,
        x: x,
        y: y,
        cx: x + cell / 2,
        cy: y + cell / 2,
        path: jigsawPath(x, y, cell, tabsForCell(r, c, inSnake)),
        isHead: day === cells.length,
      };
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderJigsawSvg(total, earned) {
    const pieces = buildSnakePieces(total);
    const vbW = GRID.pad * 2 + GRID.cols * GRID.cell;
    const vbH = GRID.pad * 2 + GRID.rows * GRID.cell;
    let html =
      '<svg class="hw-quest-puzzle__svg" viewBox="0 0 ' +
      vbW +
      " " +
      vbH +
      '" role="img" aria-label="Snake jigsaw puzzle">';

    pieces.forEach((p) => {
      const on = earned.has(p.day);
      html +=
        '<g class="hw-quest-puzzle__piece' +
        (on ? " is-earned" : "") +
        (p.isHead ? " is-head" : "") +
        '" data-puzzle-day="' +
        p.day +
        '">' +
        '<path d="' +
        p.path +
        '" />' +
        '<text class="hw-quest-puzzle__piece-num" x="' +
        p.cx +
        '" y="' +
        p.cy +
        '" dy="0.35em">' +
        p.day +
        "</text></g>";
    });

    html += "</svg>";
    return html;
  }

  function closeModal() {
    document.getElementById("hw-quest-puzzle-dialog")?.remove();
    document.body.classList.remove("hw-quest-puzzle-open");
  }

  function snakeEnabled() {
    return global.HwFeatureFlags?.questSnake?.() === true;
  }

  function open(progress, date) {
    if (!snakeEnabled()) return;
    closeModal();
    const now = date instanceof Date ? date : new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const animal = PREVIEW_ANIMAL_ONLY ? monthAnimal(1) : monthAnimal(month);
    const total = daysInMonth(year, month);
    const earned = earnedDaysForMonth(progress, year, month);
    const earnedCount = earned.size;

    const dialog = document.createElement("div");
    dialog.id = "hw-quest-puzzle-dialog";
    dialog.className = "hw-quest-puzzle-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "hw-quest-puzzle-title");

    dialog.innerHTML =
      '<div class="hw-quest-puzzle-dialog__backdrop" data-quest-puzzle-close></div>' +
      '<div class="hw-quest-puzzle-dialog__panel">' +
      '<header class="hw-quest-puzzle-dialog__head">' +
      '<h2 id="hw-quest-puzzle-title" class="hw-quest-puzzle-dialog__title">' +
      escapeHtml(animal.ja) +
      " · " +
      escapeHtml(animal.en) +
      "</h2>" +
      '<p class="hw-quest-puzzle-dialog__sub">' +
      escapeHtml(
        now.toLocaleString(undefined, { month: "long", year: "numeric" })
      ) +
      " — " +
      earnedCount +
      " / " +
      total +
      " pieces</p>" +
      '<button type="button" class="hw-quest-puzzle-dialog__close" data-quest-puzzle-close aria-label="Close puzzle">×</button>' +
      "</header>" +
      '<div class="hw-quest-puzzle hw-quest-puzzle--snake" aria-label="Snake puzzle">' +
      renderJigsawSvg(total, earned) +
      "</div>" +
      '<p class="hw-quest-puzzle-dialog__hint">Real jigsaw pieces cut into a へび — finish a quest each day to place one.</p>' +
      "</div>";

    document.body.appendChild(dialog);
    document.body.classList.add("hw-quest-puzzle-open");

    dialog.querySelectorAll("[data-quest-puzzle-close]").forEach((el) => {
      el.addEventListener("click", closeModal);
    });
    dialog.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeModal();
    });
    dialog.querySelector(".hw-quest-puzzle-dialog__close")?.focus();
  }

  global.HwQuestPuzzle = {
    MONTH_ANIMALS,
    SNAKE_CELLS,
    daysInMonth,
    monthAnimal,
    earnedDaysForMonth,
    buildSnakePieces,
    open,
    close: closeModal,
  };
})(window);
