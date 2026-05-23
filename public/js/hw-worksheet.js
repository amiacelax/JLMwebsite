/**
 * Renders fillable homework from JSON (Section 1: grammar blank, Section 2: context blank).
 */
(function (global) {
  const LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

  function formatHint(dictionary, conjugation) {
    if (!dictionary && !conjugation) return "";
    const d = dictionary || "—";
    const c = conjugation || "—";
    return "（" + d + "・" + c + "）";
  }

  function renderHint(part) {
    const span = document.createElement("span");
    span.className = "hw-conj-hint";
    span.textContent = formatHint(part.dictionary, part.conjugation);
    span.setAttribute("aria-label", "Dictionary form and conjugation hint");
    return span;
  }

  function renderBlank(part) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "hw-blank" + (part.wide ? " hw-blank--wide" : "");
    input.name = part.name;
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Answer");
    if (part.answer) input.dataset.answer = part.answer;
    return input;
  }

  function renderLine(item, index) {
    const line = document.createElement("p");
    line.className = "hw-worksheet__line";

    const label = document.createElement("span");
    label.className = "hw-worksheet__label";
    label.textContent = LABELS[index] || String(index + 1);
    line.appendChild(label);

    const content = document.createElement("span");
    content.className = "hw-worksheet__content";
    (item.parts || []).forEach((part) => {
      if (part.type === "text") {
        content.appendChild(document.createTextNode(part.value));
      } else if (part.type === "blank") {
        content.appendChild(renderBlank(part));
      } else if (part.type === "hint") {
        content.appendChild(renderHint(part));
      }
    });
    line.appendChild(content);
    return line;
  }

  function renderSection(section) {
    const wrap = document.createElement("div");
    wrap.className = "hw-worksheet__section";

    const heading = document.createElement("h3");
    heading.className = "hw-worksheet__section-title";
    heading.textContent = section.title;
    wrap.appendChild(heading);

    if (section.instructions) {
      const intro = document.createElement("p");
      intro.className = "hw-worksheet__section-intro";
      intro.textContent = section.instructions;
      wrap.appendChild(intro);
    }

    (section.items || []).forEach((item, i) => {
      wrap.appendChild(renderLine(item, i));
    });

    return wrap;
  }

  /**
   * @param {HTMLElement} mount
   * @param {object} assignment
   * @returns {HTMLFormElement}
   */
  function render(mount, assignment) {
    mount.innerHTML = "";

    const meta = document.createElement("div");
    meta.className = "hw-worksheet__meta";
    meta.innerHTML =
      '<p class="hw-worksheet__meta-date">' +
      escapeHtml(assignment.date || "") +
      (assignment.level ? ' · <span class="hw-worksheet__meta-level">' + escapeHtml(assignment.level) + "</span>" : "") +
      "</p>" +
      '<p class="hw-worksheet__meta-title">' +
      escapeHtml(assignment.title || "Homework") +
      "</p>";
    mount.appendChild(meta);

    const form = document.createElement("form");
    form.id = "hw-worksheet-form";
    form.className = "hw-worksheet";
    form.lang = "ja";
    form.setAttribute("data-assignment-id", assignment.id || "");

    (assignment.sections || []).forEach((section) => {
      form.appendChild(renderSection(section));
    });

    const actions = document.createElement("div");
    actions.className = "hw-worksheet__actions";
    actions.innerHTML =
      '<button type="button" class="btn btn--ghost" data-hw-print>Print</button>' +
      '<button type="submit" class="btn btn--primary">Submit (demo)</button>';
    form.appendChild(actions);

    const status = document.createElement("p");
    status.id = "hw-save-status";
    status.className = "hw-worksheet__status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    form.appendChild(status);

    mount.appendChild(form);

    actions.querySelector("[data-hw-print]")?.addEventListener("click", () => window.print());

    return form;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  global.HwWorksheet = { render, formatHint };
})(window);
