/**
 * JLPT-style star ordering — drag sentence pieces into slots.
 */
(function (global) {
  function escapeAttr(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function syncLine(line) {
    const slots = Array.from(line.querySelectorAll(".hw-star-block__slot"));
    const hidden = line.querySelector(".hw-star-block__answer");
    if (!hidden) return;
    const order = slots.map((slot) => String(slot.dataset.value || "").trim());
    const complete = order.length && order.every(Boolean);
    hidden.value = complete ? JSON.stringify(order) : "";
    hidden.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function findChip(pool, piece) {
    return pool.querySelector('.hw-star-block__chip[data-piece="' + escapeAttr(piece) + '"]');
  }

  function showChip(pool, piece) {
    const chip = findChip(pool, piece);
    if (chip) chip.hidden = false;
  }

  function hideChip(pool, piece) {
    const chip = findChip(pool, piece);
    if (chip) chip.hidden = true;
  }

  function clearSlot(slot, pool) {
    const val = String(slot.dataset.value || "").trim();
    if (!val) return;
    showChip(pool, val);
    slot.dataset.value = "";
    if (slot.classList.contains("hw-star-block__slot--star")) {
      slot.innerHTML = '<span class="hw-star-block__star" aria-hidden="true">★</span>';
    } else {
      slot.textContent = "";
    }
    slot.classList.remove("hw-star-block__slot--filled");
    slot.removeAttribute("aria-label");
  }

  function placeInSlot(slot, piece, pool) {
    if (!piece || slot.dataset.value) return;
    const chip = findChip(pool, piece);
    if (!chip || chip.hidden) return;
    slot.dataset.value = piece;
    slot.textContent = piece;
    slot.classList.add("hw-star-block__slot--filled");
    slot.setAttribute("aria-label", "Filled: " + piece);
    hideChip(pool, piece);
  }

  function initLine(line) {
    if (!line || line.dataset.starBound === "true") return;
    line.dataset.starBound = "true";

    const pool = line.querySelector(".hw-star-block__pool");
    const slots = Array.from(line.querySelectorAll(".hw-star-block__slot"));
    if (!pool || !slots.length) return;

    pool.querySelectorAll(".hw-star-block__chip").forEach((chip) => {
      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", chip.dataset.piece || "");
        e.dataTransfer.effectAllowed = "move";
        chip.classList.add("hw-star-block__chip--dragging");
      });
      chip.addEventListener("dragend", () => {
        chip.classList.remove("hw-star-block__chip--dragging");
      });
      chip.addEventListener("click", () => {
        const empty = slots.find((slot) => !slot.dataset.value);
        if (empty) {
          placeInSlot(empty, chip.dataset.piece || "", pool);
          syncLine(line);
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
        slot.classList.add("hw-star-block__slot--over");
      });
      slot.addEventListener("dragleave", () => {
        slot.classList.remove("hw-star-block__slot--over");
      });
      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("hw-star-block__slot--over");
        const piece = e.dataTransfer.getData("text/plain");
        placeInSlot(slot, piece, pool);
        syncLine(line);
      });
      slot.addEventListener("dblclick", () => {
        clearSlot(slot, pool);
        syncLine(line);
      });
    });
  }

  function initForm(form) {
    if (!form) return;
    form.querySelectorAll(".hw-worksheet__line--star").forEach(initLine);
  }

  global.HwStarBlock = { initForm, initLine };
})(window);
