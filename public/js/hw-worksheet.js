/**
 * Renders fillable homework from JSON (Section 1: grammar blank, Section 2: context blank).
 */
(function (global) {
  const LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

  function formatHint(hint) {
    if (!hint) return "";
    const d = hint.dictionary || "—";
    const c = hint.conjugation;
    if (!c || c === "たい" || c === "plain" || c === "ない") return "（" + d + "）";
    return "（" + d + "・" + c + "）";
  }

  function renderRegisterPills(activeRegister) {
    const wrap = document.createElement("div");
    wrap.className = "hw-register";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Lesson speech register");

    ["casual", "polite"].forEach((key) => {
      const pill = document.createElement("span");
      const isActive = key === activeRegister;
      pill.className =
        "hw-register__pill" + (isActive ? " hw-register__pill--active" : " hw-register__pill--inactive");
      pill.textContent = key === "casual" ? "Casual" : "Polite";
      if (isActive) pill.setAttribute("aria-current", "true");
      wrap.appendChild(pill);
    });

    return wrap;
  }

  function renderHintBelow(hint) {
    const span = document.createElement("span");
    span.className = "hw-conj-hint hw-conj-hint--below";
    span.textContent = formatHint(hint);
    span.setAttribute("aria-label", "Dictionary form and conjugation hint");
    return span;
  }

  function renderRubySegment(seg) {
    const text = seg.text || "";
    const hasKanji = /[\u4e00-\u9fff々]/.test(text);
    const rtDiffers =
      seg.rt &&
      normalizeAnswer(seg.rt) !== normalizeAnswer(text) &&
      !/^[\u3041-\u309fー]+$/.test(text);
    if (seg.rt && hasKanji && rtDiffers) {
      const ruby = document.createElement("ruby");
      ruby.className = "ja-ruby";
      ruby.appendChild(document.createTextNode(text));
      const rt = document.createElement("rt");
      rt.textContent = seg.rt;
      ruby.appendChild(rt);
      return ruby;
    }
    const plain = document.createElement("span");
    plain.className = "ja-okuri";
    plain.textContent = text;
    return plain;
  }

  function renderTextPart(part) {
    if (part.ruby && part.ruby.length) {
      const frag = document.createDocumentFragment();
      part.ruby.forEach((seg) => frag.appendChild(renderRubySegment(seg)));
      return frag;
    }
    return document.createTextNode(part.value || "");
  }

  function renderBlankWithHint(part) {
    const wrap = document.createElement("span");
    wrap.className = "hw-blank-wrap";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "hw-blank" + (part.wide ? " hw-blank--wide" : "");
    input.name = part.name;
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Answer");
    if (part.answer) input.dataset.answer = part.answer;
    wrap.appendChild(input);

    const hintData = part.hint || null;
    if (hintData) wrap.appendChild(renderHintBelow(hintData));

    return wrap;
  }

  function renderNegativeBadge() {
    const badge = document.createElement("span");
    badge.className = "hw-negative-badge";
    badge.textContent = "NEGATIVE";
    badge.setAttribute("aria-label", "Answer must be negative form");
    return badge;
  }

  function renderTenseBubbles(section) {
    const options = section.tenseBubbles || ["Now-Later", "Past"];
    const active = section.activeTense || options[0];
    const wrap = document.createElement("div");
    wrap.className = "hw-tense-bubbles";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Verb tense guide");

    options.forEach((label) => {
      const pill = document.createElement("span");
      const on = label === active;
      pill.className = "hw-tense-pill" + (on ? " hw-tense-pill--active" : " hw-tense-pill--inactive");
      pill.textContent = label;
      if (on) pill.setAttribute("aria-current", "true");
      wrap.appendChild(pill);
    });

    return wrap;
  }

  function renderLine(item, index) {
    const line = document.createElement("p");
    line.className = "hw-worksheet__line" + (item.negative ? " hw-worksheet__line--negative" : "");

    const label = document.createElement("span");
    label.className = "hw-worksheet__label";
    label.textContent = LABELS[index] || String(index + 1);
    line.appendChild(label);

    const content = document.createElement("span");
    content.className = "hw-worksheet__content";

    (item.parts || []).forEach((part) => {
      if (part.type === "text") {
        content.appendChild(renderTextPart(part));
      } else if (part.type === "blank") {
        content.appendChild(renderBlankWithHint(part));
      } else if (part.type === "hint") {
        /* legacy: hint after blank in JSON — attach below previous blank if possible */
        const wraps = content.querySelectorAll(".hw-blank-wrap");
        const lastWrap = wraps[wraps.length - 1];
        if (lastWrap && !lastWrap.querySelector(".hw-conj-hint--below")) {
          lastWrap.appendChild(renderHintBelow({ dictionary: part.dictionary, conjugation: part.conjugation }));
        }
      }
    });

    if (item.negative) {
      content.appendChild(renderNegativeBadge());
    }

    line.appendChild(content);

    return line;
  }

  function renderSection(section) {
    const wrap = document.createElement("div");
    wrap.className = "hw-worksheet__section";

    const head = document.createElement("div");
    head.className = "hw-worksheet__section-head";

    const heading = document.createElement("h3");
    heading.className = "hw-worksheet__section-title";
    heading.textContent = section.title;
    head.appendChild(heading);

    if (section.tenseBubbles && section.tenseBubbles.length) {
      head.appendChild(renderTenseBubbles(section));
    }

    wrap.appendChild(head);

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
  function render(mount, assignment, options) {
    options = options || {};
    mount.innerHTML = "";

    const form = document.createElement("form");
    form.id = "hw-worksheet-form";
    form.className = "hw-worksheet";
    form.lang = "ja";
    form.setAttribute("data-assignment-id", assignment.id || "");

    const meta = document.createElement("div");
    meta.className = "hw-worksheet__meta";
    const metaTop = document.createElement("div");
    metaTop.className = "hw-worksheet__meta-top";

    const metaText = document.createElement("div");
    metaText.className = "hw-worksheet__meta-text";
    metaText.innerHTML =
      '<p class="hw-worksheet__meta-date">' +
      escapeHtml(assignment.date || "") +
      (assignment.level ? ' · <span class="hw-worksheet__meta-level">' + escapeHtml(assignment.level) + "</span>" : "") +
      "</p>" +
      '<p class="hw-worksheet__meta-title">' +
      escapeHtml(assignment.title || "Homework") +
      "</p>";
    metaTop.appendChild(metaText);

    const reg = String(assignment.register || "").toLowerCase();
    if (reg === "casual" || reg === "polite") {
      metaTop.appendChild(renderRegisterPills(reg));
    }

    meta.appendChild(metaTop);
    form.appendChild(meta);

    (assignment.sections || []).forEach((section) => {
      form.appendChild(renderSection(section));
    });

    const actions = document.createElement("div");
    actions.className = "hw-worksheet__actions";
    actions.innerHTML =
      '<button type="button" class="btn btn--ghost" data-hw-print>Print</button>' +
      (options.preview
        ? ""
        : '<button type="submit" class="btn btn--primary">Submit homework</button>');
    form.appendChild(actions);

    const status = document.createElement("p");
    status.id = "hw-save-status";
    status.className = "hw-worksheet__status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    form.appendChild(status);

    const results = document.createElement("div");
    results.id = "hw-check-results";
    results.className = "hw-check-results";
    results.hidden = true;
    form.appendChild(results);

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

  /** Normalize student input for comparison (Japanese-friendly). */
  function normalizeAnswer(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[。．、，！？!?]/g, "")
      .normalize("NFKC");
  }

  function answersMatch(student, expected) {
    const a = normalizeAnswer(student);
    const b = normalizeAnswer(expected);
    if (!a || !b) return false;
    if (a === b) return true;
    // Allow student to include particle when answer is grammar stem only
    if (a.endsWith(b) || b.endsWith(a)) return true;
    return false;
  }

  /**
   * @param {HTMLFormElement} form
   * @returns {{ graded: Array<object>, openEnded: Array<object>, score: { correct: number, total: number }, openFilled: number, openTotal: number }}
   */
  function checkHomework(form) {
    const graded = [];
    const openEnded = [];
    let correct = 0;
    let openFilled = 0;

    form.querySelectorAll(".hw-blank").forEach((input) => {
      const expected = input.dataset.answer;
      const value = input.value;
      input.classList.remove("hw-blank--correct", "hw-blank--wrong");

      if (expected) {
        const ok = answersMatch(value, expected);
        if (ok) {
          correct += 1;
          input.classList.add("hw-blank--correct");
        } else {
          input.classList.add("hw-blank--wrong");
        }
        graded.push({
          name: input.name,
          ok,
          expected,
          student: value.trim(),
        });
      } else {
        const filled = normalizeAnswer(value).length > 0;
        if (filled) openFilled += 1;
        openEnded.push({ name: input.name, filled, student: value.trim() });
      }
    });

    return {
      graded,
      openEnded,
      score: { correct, total: graded.length },
      openFilled,
      openTotal: openEnded.length,
    };
  }

  function getBlankInput(form, inputName) {
    const el = form.elements.namedItem(inputName);
    return el && el.tagName === "INPUT" ? el : null;
  }

  function completedSentenceForBlank(form, inputName, answerText) {
    const input = getBlankInput(form, inputName);
    if (!input) return (answerText || "").trim() || "(blank)";
    const content = input.closest(".hw-worksheet__content");
    if (!content) return (answerText || "").trim() || "(blank)";
    const clone = content.cloneNode(true);
    clone.querySelectorAll(".hw-conj-hint").forEach((el) => el.remove());
    clone.querySelectorAll(".hw-negative-badge").forEach((el) => el.remove());
    clone.querySelectorAll("rt").forEach((el) => el.remove());
    const blank = clone.querySelector(".hw-blank");
    if (blank) blank.replaceWith(document.createTextNode((answerText || "").trim() || "___"));
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function renderCheckResults(form, report) {
    const box = form.querySelector("#hw-check-results");
    if (!box) return;

    const { score, openFilled, openTotal } = report;
    let html = '<div class="hw-check-results__summary">';

    if (score.total > 0) {
      html +=
        "<p><strong>Section 1 (grammar):</strong> " +
        score.correct +
        " / " +
        score.total +
        " correct</p>";
    }

    html +=
      "<p><strong>Section 2 (your sentences):</strong> " +
      openFilled +
      " / " +
      openTotal +
      " filled in — open-ended, not auto-graded yet.</p>";

    html +=
      "<p class=\"hw-check-results__note\">Your full answers are below (same as what JD receives). Scroll up to edit.</p></div>";

    if (report.graded.length) {
      html += '<p class="hw-check-results__subhead"><strong>Section 1</strong></p><ul class="hw-check-results__list">';
      report.graded.forEach((row, i) => {
        const label = LABELS[i] || String(i + 1);
        const yours = row.student ? escapeHtml(row.student) : "(blank)";
        const expected = row.expected ? escapeHtml(row.expected) : "—";
        const completed = escapeHtml(completedSentenceForBlank(form, row.name, row.student));

        if (row.ok) {
          html +=
            "<li class=\"hw-check-results__item hw-check-results__item--ok\">" +
            label +
            " ✓ Correct · Yours: <span class=\"hw-check-yours\" lang=\"ja\">" +
            yours +
            "</span>" +
            '<div class="hw-check-complete" lang="ja">' +
            completed +
            "</div></li>";
        } else {
          html +=
            "<li class=\"hw-check-results__item hw-check-results__item--miss\">" +
            label +
            " ✗ Expected: <span class=\"hw-check-expected\" lang=\"ja\">" +
            expected +
            "</span> · Yours: <span class=\"hw-check-yours\" lang=\"ja\">" +
            yours +
            "</span>" +
            '<div class="hw-check-complete" lang="ja">' +
            completed +
            "</div></li>";
        }
      });
      html += "</ul>";
    }

    if (report.openEnded.length) {
      html += '<p class="hw-check-results__subhead"><strong>Section 2 — completed sentences</strong></p><ul class="hw-check-results__list">';
      report.openEnded.forEach((row, i) => {
        const label = LABELS[i] || String(i + 1);
        const completed = escapeHtml(completedSentenceForBlank(form, row.name, row.student));
        html +=
          "<li class=\"hw-check-results__item hw-check-results__item--open\">" +
          label +
          '<div class="hw-check-complete" lang="ja">' +
          (row.filled ? completed : "(blank)") +
          "</div></li>";
      });
      html += "</ul>";
    }

    box.innerHTML = html;
    box.hidden = false;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function promptForBlank(form, inputName) {
    const input = getBlankInput(form, inputName);
    if (!input) return "";
    const content = input.closest(".hw-worksheet__content");
    if (!content) return "";
    const clone = content.cloneNode(true);
    clone.querySelectorAll(".hw-blank").forEach((el) => {
      el.replaceWith(document.createTextNode("___"));
    });
    clone.querySelectorAll(".hw-conj-hint").forEach((el) => el.remove());
    clone.querySelectorAll("rt").forEach((el) => el.remove());
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function buildSubmitPayload(form, meta, report) {
    const section1 = report.graded.map((row, i) => ({
      label: LABELS[i] || String(i + 1),
      prompt: promptForBlank(form, row.name),
      student: row.student,
      expected: row.expected,
      correct: row.ok,
      completed: completedSentenceForBlank(form, row.name, row.student),
    }));

    const section2 = report.openEnded.map((row, i) => ({
      label: LABELS[i] || String(i + 1),
      prompt: promptForBlank(form, row.name),
      student: row.student,
      completed: completedSentenceForBlank(form, row.name, row.student),
    }));

    return {
      username: meta.username,
      displayName: meta.displayName,
      assignmentId: meta.assignmentId,
      lessonName: meta.lessonName,
      title: meta.title,
      register: meta.register,
      scoreCorrect: report.score.correct,
      scoreTotal: report.score.total,
      section1,
      section2,
    };
  }

  global.HwWorksheet = {
    render,
    formatHint,
    checkHomework,
    renderCheckResults,
    normalizeAnswer,
    buildSubmitPayload,
  };
})(window);
