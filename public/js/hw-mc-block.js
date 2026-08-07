/**
 * Multiple-choice line — click or drag one choice into a single blank.
 * Toolbar zoom / touch: pointer drag when CSS zoom or embed theater size is on.
 */
(function (global) {
  const POINTER_THRESHOLD = 6;

  function worksheetToolsArmed() {
    return !!document.querySelector(".hw-mg-host.hw-mg-armed, .hw-hc-host.hw-hc-armed");
  }

  function mcInteractionBlocked() {
    if (worksheetToolsArmed()) return true;
    if (typeof global._hwSuppressMcUntil === "number" && Date.now() < global._hwSuppressMcUntil) {
      return true;
    }
    return false;
  }

  function usePointerDragOnly() {
    const root = document.documentElement;
    const body = document.body;
    if (
      root.classList.contains("hw-hub-v5-toolbar-embed") ||
      (body && body.classList.contains("hw-hub-v5-toolbar-embed"))
    ) {
      return true;
    }
    const mount =
      document.getElementById("hw-v2-worksheet-mount") ||
      document.getElementById("hw-worksheet-mount");
    if (!mount) return false;
    const z = Number.parseFloat(getComputedStyle(mount).zoom);
    return Number.isFinite(z) && Math.abs(z - 1) > 0.001;
  }

  function scheduleMcFit(line) {
    if (global.HwWorksheet && typeof global.HwWorksheet.scheduleFitMcLine === "function") {
      global.HwWorksheet.scheduleFitMcLine(line);
    }
  }

  function findChip(pool, choice) {
    const want = String(choice || "");
    return Array.from(pool.querySelectorAll(".hw-mc-block__chip")).find(
      (chip) => String(chip.dataset.choice || "") === want
    );
  }

  function showChip(pool, choice) {
    const chip = findChip(pool, choice);
    if (!chip) return;
    chip.classList.remove("hw-mc-block__chip--placed");
    chip.removeAttribute("aria-hidden");
  }

  function hideChip(pool, choice) {
    const chip = findChip(pool, choice);
    if (!chip) return;
    chip.classList.add("hw-mc-block__chip--placed");
    chip.setAttribute("aria-hidden", "true");
  }

  function emptySlot(slot) {
    slot.dataset.value = "";
    delete slot.dataset.color;
    slot.className = "hw-mc-block__slot";
    slot.draggable = false;
    slot.innerHTML = "";
    slot.setAttribute("aria-label", "Answer blank");
  }

  function syncLine(line) {
    const slot = line.querySelector(".hw-mc-block__slot");
    const hidden = line.querySelector(".hw-mc-block__answer");
    const resetBtn = line.querySelector(".hw-mc-block__reset");
    if (!hidden) return;
    const value = String(slot?.dataset.value || "").trim();
    hidden.value = value;
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
    line.dispatchEvent(new CustomEvent("hw-worksheet-answer", { bubbles: true }));
    if (resetBtn) resetBtn.disabled = !value;
  }

  function renderFilledSlot(slot, choice, colorIndex, opts) {
    slot.dataset.value = choice;
    slot.dataset.color = colorIndex;
    slot.className =
      "hw-mc-block__slot hw-mc-block__slot--filled hw-mc-block__slot--color-" + colorIndex;
    slot.draggable = !(opts && opts.pointerOnly);
    slot.setAttribute("aria-label", "Filled: " + choice + ". Click × or drag to change.");
    slot.replaceChildren();

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "hw-mc-block__slot-clear";
    clearBtn.setAttribute("aria-label", "Remove " + choice);
    clearBtn.innerHTML = '<span aria-hidden="true">×</span>';
    slot.appendChild(clearBtn);

    const text = document.createElement("span");
    text.className = "hw-mc-block__slot-text";
    text.textContent = choice;
    slot.appendChild(text);

    return clearBtn;
  }

  function placeChoice(line, choice) {
    const pool = line.querySelector(".hw-mc-block__pool");
    const slot = line.querySelector(".hw-mc-block__slot");
    if (!pool || !slot || !choice) return false;
    const chip = findChip(pool, choice);
    if (!chip) return false;

    const prev = String(slot.dataset.value || "").trim();
    if (prev && prev !== choice) showChip(pool, prev);

    const colorIndex = chip.dataset.color || "1";
    renderFilledSlot(slot, choice, colorIndex, { pointerOnly: usePointerDragOnly() });
    hideChip(pool, choice);
    syncLine(line);
    scheduleMcFit(line);
    return true;
  }

  function clearChoice(line) {
    const pool = line.querySelector(".hw-mc-block__pool");
    const slot = line.querySelector(".hw-mc-block__slot");
    if (!pool || !slot) return;
    const prev = String(slot.dataset.value || "").trim();
    if (prev) showChip(pool, prev);
    emptySlot(slot);
    syncLine(line);
    scheduleMcFit(line);
  }

  function createDragGhost(rect, choice, colorIndex) {
    const ghost = document.createElement("div");
    ghost.className =
      "hw-mc-block__chip hw-mc-block__chip--drag-ghost hw-mc-block__chip--" + colorIndex;
    ghost.textContent = choice;
    ghost.style.position = "fixed";
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    ghost.style.margin = "0";
    ghost.style.zIndex = "10050";
    ghost.style.pointerEvents = "none";
    ghost.style.left = "-9999px";
    ghost.style.top = "0";
    document.body.appendChild(ghost);
    return ghost;
  }

  function setDragImage(e, rect, choice, colorIndex, sourceEl) {
    const ghost = createDragGhost(rect, choice, colorIndex);
    e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
    requestAnimationFrame(() => {
      ghost.remove();
      if (sourceEl._dragGhost === ghost) sourceEl._dragGhost = null;
    });
    sourceEl._dragGhost = ghost;
  }

  function removeDragGhost(sourceEl) {
    if (sourceEl._dragGhost) {
      sourceEl._dragGhost.remove();
      sourceEl._dragGhost = null;
    }
  }

  function findDropTarget(clientX, clientY, line) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const slot = el.closest(".hw-mc-block__slot");
    if (slot && line.contains(slot)) return { type: "slot", el: slot };
    const pool = el.closest(".hw-mc-block__pool");
    if (pool && line.contains(pool)) return { type: "pool", el: pool };
    return null;
  }

  function bindPointerDrag(line, pool, slot, pointerOnly) {
    function onPointerDown(sourceEl, getChoice, meta) {
      return function (e) {
        if (mcInteractionBlocked()) return;
        if (e.button != null && e.button !== 0) return;
        const choice = getChoice();
        if (!choice) return;
        if (sourceEl.classList.contains("hw-mc-block__chip--placed")) return;

        line._mcPointer = {
          pointerId: e.pointerId,
          sourceEl,
          choice,
          fromPool: !!meta.fromPool,
          fromSlot: meta.fromSlot || null,
          colorIndex: meta.colorIndex || sourceEl.dataset.color || "1",
          startX: e.clientX,
          startY: e.clientY,
          active: false,
          ghost: null,
          dropped: false,
        };

        if (pointerOnly) {
          try {
            sourceEl.setPointerCapture(e.pointerId);
          } catch (_) {}
        }
      };
    }

    function onPointerMove(e) {
      const ptr = line._mcPointer;
      if (!ptr || ptr.pointerId !== e.pointerId) return;
      const dx = e.clientX - ptr.startX;
      const dy = e.clientY - ptr.startY;
      if (!ptr.active) {
        if (Math.hypot(dx, dy) < POINTER_THRESHOLD) return;
        ptr.active = true;
        if (!pointerOnly) {
          ptr._restoreDraggable = ptr.sourceEl.draggable;
          ptr.sourceEl.draggable = false;
        }
        try {
          ptr.sourceEl.setPointerCapture(e.pointerId);
        } catch (_) {}
        const rect = ptr.sourceEl.getBoundingClientRect();
        ptr.ghost = createDragGhost(rect, ptr.choice, ptr.colorIndex);
        ptr.sourceEl.classList.add(
          ptr.fromPool ? "hw-mc-block__chip--dragging" : "hw-mc-block__slot--dragging"
        );
        if (ptr.fromSlot) {
          emptySlot(slot);
          syncLine(line);
        }
      }
      if (ptr.ghost) {
        ptr.ghost.style.left = e.clientX - ptr.ghost.offsetWidth / 2 + "px";
        ptr.ghost.style.top = e.clientY - ptr.ghost.offsetHeight / 2 + "px";
      }
      line.querySelectorAll(".hw-mc-block__slot--over").forEach((el) => {
        el.classList.remove("hw-mc-block__slot--over");
      });
      pool.classList.remove("hw-mc-block__pool--over");
      const target = findDropTarget(e.clientX, e.clientY, line);
      if (target?.type === "slot") target.el.classList.add("hw-mc-block__slot--over");
      else if (target?.type === "pool") pool.classList.add("hw-mc-block__pool--over");
    }

    function finishPointer(e) {
      const ptr = line._mcPointer;
      if (!ptr || ptr.pointerId !== e.pointerId) return;

      line.querySelectorAll(".hw-mc-block__slot--over").forEach((el) => {
        el.classList.remove("hw-mc-block__slot--over");
      });
      pool.classList.remove("hw-mc-block__pool--over");
      if (ptr.ghost) {
        ptr.ghost.remove();
        ptr.ghost = null;
      }
      ptr.sourceEl.classList.remove("hw-mc-block__chip--dragging");
      ptr.sourceEl.classList.remove("hw-mc-block__slot--dragging");
      if (ptr._restoreDraggable) {
        ptr.sourceEl.draggable = true;
        ptr._restoreDraggable = false;
      }

      if (ptr.active) {
        line._mcSuppressClickUntil = Date.now() + 320;
        global._hwSuppressMcUntil = Date.now() + 320;
        const target = findDropTarget(e.clientX, e.clientY, line);
        if (target?.type === "slot") {
          placeChoice(line, ptr.choice);
          ptr.dropped = true;
        } else if (target?.type === "pool" && !ptr.fromPool) {
          /* returned to pool — already cleared if from slot */
          syncLine(line);
          ptr.dropped = true;
        } else if (ptr.fromSlot && !ptr.dropped) {
          placeChoice(line, ptr.choice);
        }
      }

      try {
        ptr.sourceEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
      line._mcPointer = null;
    }

    pool.querySelectorAll(".hw-mc-block__chip").forEach((chip) => {
      if (pointerOnly) chip.draggable = false;
      chip.addEventListener(
        "pointerdown",
        onPointerDown(chip, () => chip.dataset.choice || "", {
          fromPool: true,
          colorIndex: chip.dataset.color || "1",
        })
      );
    });

    if (pointerOnly) slot.draggable = false;
    slot.addEventListener(
      "pointerdown",
      onPointerDown(slot, () => (slot.dataset.value ? slot.dataset.value : ""), {
        fromPool: false,
        fromSlot: slot,
        colorIndex: slot.dataset.color || "1",
      })
    );

    line.addEventListener("pointermove", onPointerMove);
    line.addEventListener("pointerup", finishPointer);
    line.addEventListener("pointercancel", finishPointer);
  }

  function restoreLineFromHidden(line) {
    const hidden = line.querySelector(".hw-mc-block__answer");
    const value = String(hidden?.value || "").trim();
    if (!value) {
      clearChoice(line);
      return;
    }
    placeChoice(line, value);
  }

  function initLine(line) {
    if (!line || line.dataset.mcBound === "true") return;
    line.dataset.mcBound = "true";

    const pool = line.querySelector(".hw-mc-block__pool");
    const slot = line.querySelector(".hw-mc-block__slot");
    const resetBtn = line.querySelector(".hw-mc-block__reset");
    if (!pool || !slot) return;

    const pointerOnly = usePointerDragOnly();
    bindPointerDrag(line, pool, slot, pointerOnly);

    pool.querySelectorAll(".hw-mc-block__chip").forEach((chip) => {
      if (pointerOnly) chip.draggable = false;

      chip.addEventListener("dragstart", (e) => {
        if (mcInteractionBlocked()) {
          e.preventDefault();
          return;
        }
        if (chip.classList.contains("hw-mc-block__chip--placed")) {
          e.preventDefault();
          return;
        }
        if (pointerOnly || usePointerDragOnly()) {
          e.preventDefault();
          return;
        }
        if (line._mcPointer && line._mcPointer.active) {
          e.preventDefault();
          return;
        }
        const choice = chip.dataset.choice || "";
        line._mcDrag = { choice, fromPool: true, dropped: false };
        e.dataTransfer.setData("text/plain", choice);
        e.dataTransfer.effectAllowed = "move";
        const rect = chip.getBoundingClientRect();
        setDragImage(e, rect, choice, chip.dataset.color || "1", chip);
        chip.classList.add("hw-mc-block__chip--dragging");
      });

      chip.addEventListener("dragend", () => {
        chip.classList.remove("hw-mc-block__chip--dragging");
        removeDragGhost(chip);
        line._mcDrag = null;
      });

      chip.addEventListener("click", () => {
        if (mcInteractionBlocked()) return;
        if (line._mcSuppressClickUntil && Date.now() < line._mcSuppressClickUntil) return;
        if (chip.classList.contains("hw-mc-block__chip--placed")) return;
        placeChoice(line, chip.dataset.choice || "");
      });

      chip.addEventListener("keydown", (e) => {
        if (mcInteractionBlocked()) return;
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        chip.click();
      });
    });

    slot.addEventListener("dragover", (e) => {
      if (mcInteractionBlocked()) return;
      e.preventDefault();
      slot.classList.add("hw-mc-block__slot--over");
    });
    slot.addEventListener("dragleave", (e) => {
      if (!slot.contains(e.relatedTarget)) slot.classList.remove("hw-mc-block__slot--over");
    });
    slot.addEventListener("drop", (e) => {
      if (mcInteractionBlocked()) return;
      e.preventDefault();
      slot.classList.remove("hw-mc-block__slot--over");
      const choice = e.dataTransfer.getData("text/plain");
      if (choice) placeChoice(line, choice);
      line._mcDrag = null;
    });

    slot.addEventListener("dragstart", (e) => {
      if (mcInteractionBlocked() || !slot.dataset.value) {
        e.preventDefault();
        return;
      }
      if (pointerOnly || usePointerDragOnly()) {
        e.preventDefault();
        return;
      }
      const choice = slot.dataset.value;
      line._mcDrag = { choice, fromPool: false, dropped: false };
      e.dataTransfer.setData("text/plain", choice);
      e.dataTransfer.effectAllowed = "move";
      const rect = slot.getBoundingClientRect();
      setDragImage(e, rect, choice, slot.dataset.color || "1", slot);
      emptySlot(slot);
      showChip(pool, choice);
      syncLine(line);
      slot.classList.add("hw-mc-block__slot--dragging");
    });
    slot.addEventListener("dragend", () => {
      slot.classList.remove("hw-mc-block__slot--dragging");
      removeDragGhost(slot);
      if (line._mcDrag && !line._mcDrag.dropped && line._mcDrag.choice) {
        placeChoice(line, line._mcDrag.choice);
      }
      line._mcDrag = null;
    });

    slot.addEventListener("click", (e) => {
      if (mcInteractionBlocked()) return;
      if (e.target.closest(".hw-mc-block__slot-clear")) {
        e.preventDefault();
        clearChoice(line);
      }
    });

    pool.addEventListener("dragover", (e) => {
      if (mcInteractionBlocked()) return;
      e.preventDefault();
      pool.classList.add("hw-mc-block__pool--over");
    });
    pool.addEventListener("dragleave", (e) => {
      if (!pool.contains(e.relatedTarget)) pool.classList.remove("hw-mc-block__pool--over");
    });
    pool.addEventListener("drop", (e) => {
      if (mcInteractionBlocked()) return;
      e.preventDefault();
      pool.classList.remove("hw-mc-block__pool--over");
      const choice = e.dataTransfer.getData("text/plain");
      if (!choice) return;
      if (line._mcDrag) line._mcDrag.dropped = true;
      /* Returning to pool — show chip (slot already emptied on dragstart from slot). */
      showChip(pool, choice);
      syncLine(line);
    });

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (mcInteractionBlocked()) return;
        clearChoice(line);
      });
    }

    const existing = String(line.querySelector(".hw-mc-block__answer")?.value || "").trim();
    if (existing) restoreLineFromHidden(line);
    else syncLine(line);
    scheduleMcFit(line);
  }

  function initForm(form) {
    if (!form) return;
    form.querySelectorAll(".hw-worksheet__line--mc").forEach(initLine);
    if (global.HwWorksheet && typeof global.HwWorksheet.scheduleFitAllMcLines === "function") {
      global.HwWorksheet.scheduleFitAllMcLines(form);
    }
  }

  function syncFormFromAnswers(form) {
    if (!form) return;
    form.querySelectorAll(".hw-worksheet__line--mc").forEach((line) => {
      if (line.dataset.mcBound === "true") restoreLineFromHidden(line);
      else initLine(line);
    });
  }

  function restoreLineFromSubmission(line, row) {
    if (!line || !row) return;
    const hidden = line.querySelector(".hw-mc-block__answer");
    const pool = line.querySelector(".hw-mc-block__pool");
    const resetBtn = line.querySelector(".hw-mc-block__reset");
    const student = row.student === "(blank)" ? "" : String(row.student || "").trim();
    if (hidden) hidden.value = student;
    if (student) {
      placeChoice(line, student);
    }
    if (pool) pool.hidden = true;
    if (resetBtn) resetBtn.hidden = true;
    line.classList.add("hw-mc-block--replay");
    line.querySelectorAll(".hw-mc-block__slot-clear").forEach((btn) => btn.remove());
    const slot = line.querySelector(".hw-mc-block__slot");
    if (slot) slot.draggable = false;
  }

  global.HwMcBlock = {
    initForm,
    initLine,
    syncFormFromAnswers,
    restoreLineFromSubmission,
    placeChoice,
    clearChoice,
  };
})(window);
