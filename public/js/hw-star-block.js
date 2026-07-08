/**

 * Sentence ordering — drag pieces into slots, reset with fly-back animation.

 * Touch: pointer drag (no long-press). Desktop: HTML5 drag + pointer.

 */

(function (global) {

  const POINTER_THRESHOLD = 6;



  function worksheetToolsArmed() {

    return !!document.querySelector(".hw-mg-host.hw-mg-armed, .hw-hc-host.hw-hc-armed");

  }



  function starInteractionBlocked() {

    if (worksheetToolsArmed()) return true;

    if (typeof global._hwSuppressStarUntil === "number" && Date.now() < global._hwSuppressStarUntil) {

      return true;

    }

    return false;

  }



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

    slot.draggable = false;

    slot.innerHTML = "";

    slot.setAttribute("aria-label", "Blank " + (Number(idx) + 1));

  }



  function createDragGhost(rect, piece, colorIndex) {

    const ghost = document.createElement("div");

    ghost.className =

      "hw-star-block__chip hw-star-block__chip--drag-ghost hw-star-block__chip--" + colorIndex;

    ghost.textContent = piece;

    ghost.style.width = rect.width + "px";

    ghost.style.height = rect.height + "px";

    document.body.appendChild(ghost);

    return ghost;

  }



  function setDragImage(e, rect, piece, colorIndex, sourceEl) {

    const ghost = createDragGhost(rect, piece, colorIndex);

    e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);

    sourceEl._dragGhost = ghost;

  }



  function removeDragGhost(sourceEl) {

    if (sourceEl._dragGhost) {

      sourceEl._dragGhost.remove();

      sourceEl._dragGhost = null;

    }

  }



  function renderFilledSlot(slot, piece, colorIndex) {

    slot.dataset.value = piece;

    slot.dataset.color = colorIndex;

    slot.className =

      "hw-star-block__slot hw-star-block__slot--filled hw-star-block__slot--color-" + colorIndex;

    slot.draggable = true;

    slot.setAttribute("aria-label", "Filled: " + piece + ". Drag to move.");

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



  function markDrop(line) {

    if (line._starDrag) line._starDrag.dropped = true;

  }



  function placeInSlot(slot, piece, pool, line) {

    if (!piece || slot.dataset.value) return false;

    const chip = findChip(pool, piece);

    if (!chip) return false;



    const drag = line._starDrag;

    const fromPool = !drag || drag.fromPool;



    if (fromPool && chip.classList.contains("hw-star-block__chip--placed")) {

      return false;

    }



    const colorIndex = chip.dataset.color || colorIndexForPiece(line, piece);

    renderFilledSlot(slot, piece, colorIndex);

    hideChip(pool, piece);

    syncLine(line);

    return true;

  }



  function finishDrag(line, pool) {

    const drag = line._starDrag;

    if (!drag) return;



    if (!drag.dropped && drag.fromSlot && !drag.fromSlot.dataset.value) {

      const colorIndex = drag.colorIndex || colorIndexForPiece(line, drag.piece);

      renderFilledSlot(drag.fromSlot, drag.piece, colorIndex);

      hideChip(pool, drag.piece);

      syncLine(line);

    }



    if (drag.fromSlot) {

      drag.fromSlot.classList.remove("hw-star-block__slot--dragging");

    }



    line._starDrag = null;

  }



  function clearDropHighlights(line) {

    line.querySelectorAll(".hw-star-block__slot--over").forEach((el) => {

      el.classList.remove("hw-star-block__slot--over");

    });

    line.querySelector(".hw-star-block__pool")?.classList.remove("hw-star-block__pool--over");

  }



  function findDropTarget(clientX, clientY, line) {

    const el = document.elementFromPoint(clientX, clientY);

    if (!el) return null;

    const slot = el.closest(".hw-star-block__slot");

    if (slot && line.contains(slot)) return { type: "slot", el: slot };

    const pool = el.closest(".hw-star-block__pool");

    if (pool && line.contains(pool)) return { type: "pool", el: pool };

    return null;

  }



  function highlightDropTarget(target) {

    if (!target) return;

    if (target.type === "slot" && !target.el.dataset.value) {

      target.el.classList.add("hw-star-block__slot--over");

    } else if (target.type === "pool") {

      target.el.classList.add("hw-star-block__pool--over");

    }

  }



  function finishPointerDrag(line, pool) {

    const ptr = line._starPointer;

    if (!ptr) return;



    clearDropHighlights(line);

    if (ptr.ghost) {

      ptr.ghost.remove();

      ptr.ghost = null;

    }

    if (ptr.sourceEl) {

      ptr.sourceEl.classList.remove("hw-star-block__chip--dragging");

      ptr.sourceEl.classList.remove("hw-star-block__slot--dragging");

    }



    if (ptr.active) {

      line._starSuppressClickUntil = Date.now() + 320;

      global._hwSuppressStarUntil = Date.now() + 320;

    }



    line._starPointer = null;

    finishDrag(line, pool);

  }



  function bindPointerDrag(line, pool, slots) {

    function onPointerDown(sourceEl, getPiece, opts) {

      return (e) => {

        if (starInteractionBlocked()) return;

        if (e.button !== 0 && e.pointerType !== "touch") return;

        if (e.target.closest(".hw-star-block__slot-clear")) return;



        const piece = getPiece();

        if (!piece) return;



        line._starPointer = {

          pointerId: e.pointerId,

          sourceEl,

          piece,

          fromPool: opts.fromPool,

          fromSlot: opts.fromSlot || null,

          colorIndex: opts.colorIndex || colorIndexForPiece(line, piece),

          startX: e.clientX,

          startY: e.clientY,

          offsetX: 0,

          offsetY: 0,

          active: false,

          ghost: null,

        };



        try {

          sourceEl.setPointerCapture(e.pointerId);

        } catch (_) {}

      };

    }



    function onPointerMove(e) {

      const ptr = line._starPointer;

      if (!ptr || ptr.pointerId !== e.pointerId) return;



      const dx = e.clientX - ptr.startX;

      const dy = e.clientY - ptr.startY;



      if (!ptr.active) {

        if (Math.hypot(dx, dy) < POINTER_THRESHOLD) return;



        ptr.active = true;

        const rect = ptr.sourceEl.getBoundingClientRect();

        ptr.offsetX = e.clientX - rect.left;

        ptr.offsetY = e.clientY - rect.top;



        line._starDrag = {

          piece: ptr.piece,

          fromPool: ptr.fromPool,

          fromSlot: ptr.fromSlot,

          colorIndex: ptr.colorIndex,

          dropped: false,

        };



        if (ptr.fromSlot) {

          ptr.fromSlot.classList.add("hw-star-block__slot--dragging");

          emptySlot(ptr.fromSlot);

          syncLine(line);

        } else {

          ptr.sourceEl.classList.add("hw-star-block__chip--dragging");

        }



        ptr.ghost = createDragGhost(rect, ptr.piece, ptr.colorIndex);

        ptr.ghost.style.position = "fixed";

        ptr.ghost.style.left = e.clientX - ptr.offsetX + "px";

        ptr.ghost.style.top = e.clientY - ptr.offsetY + "px";

        ptr.ghost.style.zIndex = "10050";

        ptr.ghost.style.margin = "0";

      }



      e.preventDefault();



      if (ptr.ghost) {

        ptr.ghost.style.left = e.clientX - ptr.offsetX + "px";

        ptr.ghost.style.top = e.clientY - ptr.offsetY + "px";

      }



      clearDropHighlights(line);

      highlightDropTarget(findDropTarget(e.clientX, e.clientY, line));

    }



    function onPointerUp(e) {

      const ptr = line._starPointer;

      if (!ptr || ptr.pointerId !== e.pointerId) return;



      if (!ptr.active) {

        line._starPointer = null;

        return;

      }



      e.preventDefault();

      const target = findDropTarget(e.clientX, e.clientY, line);

      const piece = ptr.piece;



      if (target?.type === "slot" && placeInSlot(target.el, piece, pool, line)) {

        markDrop(line);

      } else if (target?.type === "pool" && !ptr.fromPool) {

        markDrop(line);

        showChip(pool, piece);

        syncLine(line);

      }



      try {

        ptr.sourceEl.releasePointerCapture(e.pointerId);

      } catch (_) {}

      finishPointerDrag(line, pool);

    }



    function onPointerCancel(e) {

      const ptr = line._starPointer;

      if (!ptr || ptr.pointerId !== e.pointerId) return;

      try {

        ptr.sourceEl.releasePointerCapture(e.pointerId);

      } catch (_) {}

      finishPointerDrag(line, pool);

    }



    pool.querySelectorAll(".hw-star-block__chip").forEach((chip) => {

      chip.addEventListener(

        "pointerdown",

        onPointerDown(chip, () => chip.dataset.piece || "", { fromPool: true })

      );

    });



    slots.forEach((slot) => {

      slot.addEventListener(

        "pointerdown",

        onPointerDown(

          slot,

          () => (slot.dataset.value ? slot.dataset.value : ""),

          {

            fromPool: false,

            fromSlot: slot,

            colorIndex: slot.dataset.color || colorIndexForPiece(line, slot.dataset.value || ""),

          }

        )

      );

    });



    line.addEventListener("pointermove", onPointerMove);

    line.addEventListener("pointerup", onPointerUp);

    line.addEventListener("pointercancel", onPointerCancel);

  }



  function animateFlyback(fromRect, toRect, colorClass, text) {

    const travelMs = 620;

    const boingMs = 32;

    return new Promise((resolve) => {

      const ghost = document.createElement("div");

      ghost.className = "hw-star-block__chip hw-star-block__flyback " + colorClass;

      ghost.textContent = text;



      const startLeft = fromRect.left + fromRect.width / 2 - toRect.width / 2;

      const startTop = fromRect.top + fromRect.height / 2 - toRect.height / 2;

      ghost.style.left = startLeft + "px";

      ghost.style.top = startTop + "px";

      ghost.style.width = toRect.width + "px";

      ghost.style.height = toRect.height + "px";

      document.body.appendChild(ghost);



      const dx = toRect.left - startLeft;

      const dy = toRect.top - startTop;



      requestAnimationFrame(() => {

        ghost.style.transition =

          "transform " + boingMs + "ms cubic-bezier(0.34, 1.25, 0.68, 1)";

        ghost.style.transform = "scale(1.04, 0.97)";

      });



      window.setTimeout(() => {

        ghost.style.transition = "transform 18ms ease-out";

        ghost.style.transform = "scale(1, 1)";

      }, boingMs);



      window.setTimeout(() => {

        ghost.style.transition =

          "transform " + travelMs + "ms cubic-bezier(0.25, 0.85, 0.35, 1)";

        ghost.style.transform = "translate(" + dx + "px, " + dy + "px)";

      }, boingMs + 22);



      window.setTimeout(() => {

        ghost.remove();

        resolve();

      }, boingMs + travelMs + 72);

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



    bindPointerDrag(line, pool, slots);



    pool.querySelectorAll(".hw-star-block__chip").forEach((chip) => {

      chip.addEventListener("dragstart", (e) => {

        if (starInteractionBlocked()) {

          e.preventDefault();

          return;

        }

        if (chip.classList.contains("hw-star-block__chip--placed")) {

          e.preventDefault();

          return;

        }

        const piece = chip.dataset.piece || "";

        line._starDrag = { piece, fromPool: true, dropped: false };

        e.dataTransfer.setData("text/plain", piece);

        e.dataTransfer.effectAllowed = "move";

        const rect = chip.getBoundingClientRect();

        const colorIndex = chip.dataset.color || colorIndexForPiece(line, piece);

        setDragImage(e, rect, piece, colorIndex, chip);

        chip.classList.add("hw-star-block__chip--dragging");

      });

      chip.addEventListener("dragend", () => {

        chip.classList.remove("hw-star-block__chip--dragging");

        removeDragGhost(chip);

        finishDrag(line, pool);

      });

      chip.addEventListener("click", () => {

        if (starInteractionBlocked()) return;

        if (line._starSuppressClickUntil && Date.now() < line._starSuppressClickUntil) return;

        if (chip.classList.contains("hw-star-block__chip--placed")) return;

        const empty = slots.find((slot) => !slot.dataset.value);

        if (empty) {

          placeInSlot(empty, chip.dataset.piece || "", pool, line);

        }

      });

      chip.addEventListener("keydown", (e) => {

        if (starInteractionBlocked()) return;

        if (e.key !== "Enter" && e.key !== " ") return;

        e.preventDefault();

        chip.click();

      });

    });



    pool.addEventListener("dragover", (e) => {

      if (starInteractionBlocked()) return;

      e.preventDefault();

      pool.classList.add("hw-star-block__pool--over");

    });

    pool.addEventListener("dragleave", (e) => {

      if (!pool.contains(e.relatedTarget)) {

        pool.classList.remove("hw-star-block__pool--over");

      }

    });

    pool.addEventListener("drop", (e) => {

      if (starInteractionBlocked()) return;

      e.preventDefault();

      pool.classList.remove("hw-star-block__pool--over");

      const piece = e.dataTransfer.getData("text/plain");

      if (!piece) return;

      markDrop(line);

      showChip(pool, piece);

      syncLine(line);

    });



    slots.forEach((slot) => {

      slot.addEventListener("dragstart", (e) => {

        if (starInteractionBlocked()) {

          e.preventDefault();

          return;

        }

        if (!slot.dataset.value || e.target.closest(".hw-star-block__slot-clear")) {

          e.preventDefault();

          return;

        }

        const piece = slot.dataset.value;

        const colorIndex = slot.dataset.color || colorIndexForPiece(line, piece);

        line._starDrag = {

          piece,

          fromPool: false,

          fromSlot: slot,

          colorIndex,

          dropped: false,

        };

        e.dataTransfer.setData("text/plain", piece);

        e.dataTransfer.effectAllowed = "move";

        const rect = slot.getBoundingClientRect();

        setDragImage(e, rect, piece, colorIndex, slot);

        slot.classList.add("hw-star-block__slot--dragging");

        emptySlot(slot);

        syncLine(line);

      });

      slot.addEventListener("dragend", () => {

        removeDragGhost(slot);

        finishDrag(line, pool);

      });

      slot.addEventListener("dragover", (e) => {

        if (starInteractionBlocked()) return;

        e.preventDefault();

        if (!slot.dataset.value) slot.classList.add("hw-star-block__slot--over");

      });

      slot.addEventListener("dragleave", () => {

        slot.classList.remove("hw-star-block__slot--over");

      });

      slot.addEventListener("drop", (e) => {

        if (starInteractionBlocked()) return;

        e.preventDefault();

        slot.classList.remove("hw-star-block__slot--over");

        const piece = e.dataTransfer.getData("text/plain");

        if (placeInSlot(slot, piece, pool, line)) {

          markDrop(line);

        }

      });

      slot.addEventListener("click", (e) => {

        if (starInteractionBlocked()) return;

        const clearBtn = e.target.closest(".hw-star-block__slot-clear");

        if (clearBtn) {

          e.preventDefault();

          clearSlot(slot, pool, line);

        }

      });

    });



    if (resetBtn) {

      resetBtn.addEventListener("click", () => {

        if (starInteractionBlocked()) return;

        resetLine(line);

      });

    }



    syncLine(line);

  }



  function initForm(form) {

    if (!form) return;

    form.querySelectorAll(".hw-worksheet__line--star").forEach(initLine);

  }



  global.HwStarBlock = { initForm, initLine };

})(window);


