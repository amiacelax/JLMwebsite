/**
 * Sentence ordering — drag pieces into slots, reset with fly-back animation.
 */
(function (global) {
  function escapeAttr(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function syncLine(line) {
    const slots = Array.from(line.querySelectorAll(".hw-star-block__slot"));
    const hidden = line.querySelector(".hw-star-block__answer");
    const resetBtn = line.querySelector(".hw-star-block__reset");
    if (!hidden) return;
    const order = slots.map((slot) => String(slot.dataset.value || "").trim());
    const complete = order.length && order.every(Boolean);
    hidden.value = complete ? JSON.stringify(order) : "";
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    if (resetBtn) {
      resetBtn.disabled = !order.some(Boolean);
    }
  }

  function findChip(pool, piece) {
    return pool.querySelector('.hw-star-block__chip[data-piece="' + escapeAttr(piece) + '"]');
  }

  function showChip(pool, piece) {
    const chip = findChip(pool, piece);
    if (!chip) return;
    chip.classList.remove("hw-star-block__chip--placed");
    chip.removeAttribute("aria-hidden");
  }

  function hideChip(pool, piece) {
    const chip = findChip(pool, piece);
    if (!chip) return;
    chip.classList.add("hw-star-block__chip--placed");
    chip.setAttribute("aria-hidden", "true");
  }

  function colorIndexForPiece(line, piece) {
    try {
      const pieces = JSON.parse(line.dataset.pieces || "[]");
      const i = pieces.indexOf(piece);
      return String((i >= 0 ? i : 0) % 4 + 1);
    } catch {
      return "1";
    }
  }

  function emptySlot(slot) {
    const idx = slot.dataset.slotIndex || "0";
    slot.dataset.value = "";
    delete slot.dataset.color;
    slot.className = "hw-star-block__slot";
    slot.innerHTML = "";
    slot.setAttribute("aria-label", "Blank " + (Number(idx) + 1));
  }

  function setChipDragImage(e, chip) {
    const rect = chip.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className =
      "hw-star-block__chip hw-star-block__chip--drag-ghost " +
      Array.from(chip.classList)
        .filter((c) => c.startsWith("hw-star-block__chip--") && c !== "hw-star-block__chip--placed")
        .join(" ");
    ghost.textContent = chip.dataset.piece || chip.textContent;
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    ghost.style.left = "-9999px";
    ghost.style.top = "0";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
    chip._dragGhost = ghost;
  }

  function removeChipDragImage(chip) {
    if (chip._dragGhost) {
      chip._dragGhost.remove();
      chip._dragGhost = null;
    }
  }

  function renderFilledSlot(slot, piece, colorIndex) {
    slot.dataset.value = piece;
    slot.dataset.color = colorIndex;
    slot.className =
      "hw-star-block__slot hw-star-block__slot--filled hw-star-block__slot--color-" + colorIndex;
    slot.setAttribute("aria-label", "Filled: " + piece);
    slot.replaceChildren();

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "hw-star-block__slot-clear";
    clearBtn.setAttribute("aria-label", "Remove " + piece);
    clearBtn.innerHTML = '<span aria-hidden="true">×</span>';
    slot.appendChild(clearBtn);

    const text = document.createElement("span");
    text.className = "hw-star-block__slot-text";
    text.textContent = piece;
    slot.appendChild(text);

    return clearBtn;
  }

  function clearSlot(slot, pool, line) {
    const val = String(slot.dataset.value || "").trim();
    if (!val) return;
    showChip(pool, val);
    emptySlot(slot);
    syncLine(line);
  }

  function placeInSlot(slot, piece, pool, line) {
    if (!piece || slot.dataset.value) return;
    const chip = findChip(pool, piece);
    if (!chip || chip.classList.contains("hw-star-block__chip--placed")) return;
    const colorIndex = chip.dataset.color || colorIndexForPiece(line, piece);
    renderFilledSlot(slot, piece, colorIndex);
    hideChip(pool, piece);
    syncLine(line);
  }

  function animateFlyback(fromRect, toRect, colorClass, text) {
    const travelMs = 620;
    const boingMs = Math.round(travelMs / 5);
    return new Promise((resolve) => {
      const ghost = document.createElement("div");
      ghost.className = "hw-star-block__chip hw-star-block__flyback " + colorClass;
      ghost.textContent = text;
      ghost.style.left = fromRect.left + "px";
      ghost.style.top = fromRect.top + "px";
      ghost.style.width = fromRect.width + "px";
      ghost.style.height = fromRect.height + "px";
      document.body.appendChild(ghost);

      const scaleX = toRect.width / Math.max(fromRect.width, 1);
      const scaleY = toRect.height / Math.max(fromRect.height, 1);
      const dx =
        toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
      const dy =
        toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);

      requestAnimationFrame(() => {
        ghost.style.transition =
          "transform " + boingMs + "ms cubic-bezier(0.22, 1.45, 0.42, 1)";
        ghost.style.transform = "scale(1.14, 0.86)";
      });

      window.setTimeout(() => {
        ghost.style.transition =
          "transform " + travelMs + "ms cubic-bezier(0.22, 0.92, 0.36, 1)";
        ghost.style.transform =
          "translate(" + dx + "px, " + dy + "px) scale(" + scaleX + ", " + scaleY + ")";
      }, boingMs + 16);

      window.setTimeout(() => {
        ghost.remove();
        resolve();
      }, boingMs + travelMs + 56);
    });
  }

  async function resetLine(line) {
    const pool = line.querySelector(".hw-star-block__pool");
    const slots = Array.from(line.querySelectorAll(".hw-star-block__slot"));
    const resetBtn = line.querySelector(".hw-star-block__reset");
    if (!pool || !slots.length) return;

    const filled = slots.filter((slot) => String(slot.dataset.value || "").trim());
    if (!filled.length) return;

    if (resetBtn) resetBtn.disabled = true;

    const jobs = filled.map((slot, i) => {
      return delay(i * 110).then(async () => {
        const piece = String(slot.dataset.value || "").trim();
        if (!piece) return;
        const colorIndex = slot.dataset.color || colorIndexForPiece(line, piece);
        const chip = findChip(pool, piece);
        const fromRect = slot.getBoundingClientRect();
        const toRect = chip ? chip.getBoundingClientRect() : fromRect;
        const colorClass = "hw-star-block__chip--" + colorIndex;
        emptySlot(slot);
        await animateFlyback(fromRect, toRect, colorClass, piece);
        showChip(pool, piece);
      });
    });

    await Promise.all(jobs);
    syncLine(line);
  }

  function initLine(line) {
    if (!line || line.dataset.starBound === "true") return;
    line.dataset.starBound = "true";

    const pool = line.querySelector(".hw-star-block__pool");
    const slots = Array.from(line.querySelectorAll(".hw-star-block__slot"));
    const resetBtn = line.querySelector(".hw-star-block__reset");
    if (!pool || !slots.length) return;

    pool.querySelectorAll(".hw-star-block__chip").forEach((chip) => {
      chip.addEventListener("dragstart", (e) => {
        if (chip.classList.contains("hw-star-block__chip--placed")) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", chip.dataset.piece || "");
        e.dataTransfer.effectAllowed = "move";
        setChipDragImage(e, chip);
        chip.classList.add("hw-star-block__chip--dragging");
      });
      chip.addEventListener("dragend", () => {
        chip.classList.remove("hw-star-block__chip--dragging");
        removeChipDragImage(chip);
      });
      chip.addEventListener("click", () => {
        if (chip.classList.contains("hw-star-block__chip--placed")) return;
        const empty = slots.find((slot) => !slot.dataset.value);
        if (empty) {
          placeInSlot(empty, chip.dataset.piece || "", pool, line);
        }
      });
      chip.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        chip.click();
      });
    });

    slots.forEach((slot) => {
      slot.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!slot.dataset.value) slot.classList.add("hw-star-block__slot--over");
      });
      slot.addEventListener("dragleave", () => {
        slot.classList.remove("hw-star-block__slot--over");
      });
      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("hw-star-block__slot--over");
        const piece = e.dataTransfer.getData("text/plain");
        placeInSlot(slot, piece, pool, line);
      });
      slot.addEventListener("click", (e) => {
        const clearBtn = e.target.closest(".hw-star-block__slot-clear");
        if (clearBtn) {
          e.preventDefault();
          clearSlot(slot, pool, line);
        }
      });
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", () => resetLine(line));
    }

    syncLine(line);
  }

  function initForm(form) {
    if (!form) return;
    form.querySelectorAll(".hw-worksheet__line--star").forEach(initLine);
  }

  global.HwStarBlock = { initForm, initLine };
})(window);
