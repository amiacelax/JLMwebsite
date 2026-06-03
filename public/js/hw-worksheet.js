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

  /**
   * Build casual/polite × Now-Later/Past answer keys from a casual present answer.
   * @param {string} casualNowLater
   * @returns {object|null}
   */
  function buildRegisterVariants(casualNowLater) {
    const casual = String(casualNowLater || "").trim();
    if (!casual) return null;

    if (/ないといけない$/.test(casual)) {
      const stem = casual.replace(/ないといけない$/, "");
      return {
        casual: {
          "Now-Later": casual,
          Past: stem + "ないといけなかった",
        },
        polite: {
          "Now-Later": stem + "ないといけません",
          Past: stem + "ないといけませんでした",
        },
      };
    }

    if (/いけない$/.test(casual)) {
      const stem = casual.replace(/いけない$/, "");
      return {
        casual: {
          "Now-Later": casual,
          Past: stem + "いけなかった",
        },
        polite: {
          "Now-Later": stem + "いけません",
          Past: stem + "いけませんでした",
        },
      };
    }

    return null;
  }

  function enrichGrammarVariants(assignment) {
    if (!assignment) return assignment;
    assignment.register = assignment.register || "casual";
    (assignment.sections || []).forEach((section) => {
      if (section.mode !== "grammar-blank") return;
      (section.items || []).forEach((item) => {
        (item.parts || []).forEach((part) => {
          if (part.type !== "blank" || part.variants) return;
          const variants = buildRegisterVariants(part.answer);
          if (!variants) return;
          part.variants = variants;
          if (!part.answer) part.answer = variants.casual["Now-Later"];
        });
      });
    });
    return assignment;
  }

  function resolveVariantAnswer(part, register, tense) {
    const variants = part.variants;
    if (variants && variants[register] && variants[register][tense]) {
      return variants[register][tense];
    }
    if (variants && variants.casual && variants.casual["Now-Later"]) {
      return variants.casual["Now-Later"];
    }
    return part.answer || "";
  }

  function expectedAnswerFromVariants(variants, register, tense, fallback) {
    if (!variants) return fallback || "";
    const reg = variants[register] || variants.casual;
    if (reg && reg[tense]) return reg[tense];
    if (variants.casual && variants.casual["Now-Later"]) return variants.casual["Now-Later"];
    return fallback || "";
  }

  function applyAnswerVariants(form) {
    if (!form) return;
    const register = form.dataset.hwRegister || "casual";
    const tense = form.dataset.hwTense || "Now-Later";
    form.querySelectorAll(".hw-blank").forEach((input) => {
      if (!input.dataset.variants) return;
      try {
        const variants = JSON.parse(input.dataset.variants);
        input.dataset.answer = expectedAnswerFromVariants(
          variants,
          register,
          tense,
          input.dataset.answer
        );
      } catch (_) {}
      input.classList.remove("hw-blank--correct", "hw-blank--wrong");
    });
  }

  function bindVariantGrading(form) {
    if (!form || form.dataset.hwVariantBound === "true") return;
    form.dataset.hwVariantBound = "true";
    form.addEventListener("input", (e) => {
      const inp = e.target;
      if (!inp?.classList?.contains("hw-blank") || !inp.dataset.variants) return;
      applyAnswerVariants(form);
      const expected = inp.dataset.answer;
      if (!expected) return;
      const has = Boolean(normalizeAnswer(inp.value));
      const ok = answersMatch(inp.value, expected, true);
      inp.classList.toggle("hw-blank--correct", ok && has);
      inp.classList.toggle("hw-blank--wrong", has && !ok);
    });
  }

  function renderRegisterPills(form, activeRegister, interactive) {
    const wrap = document.createElement("div");
    wrap.className = "hw-register";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Speech register — switch to practice polite or casual");

    ["casual", "polite"].forEach((key) => {
      const pill = document.createElement(interactive ? "button" : "span");
      if (interactive) pill.type = "button";
      const isActive = key === activeRegister;
      pill.className =
        "hw-register__pill" + (isActive ? " hw-register__pill--active" : " hw-register__pill--inactive");
      pill.textContent = key === "casual" ? "Casual" : "Polite";
      if (isActive) pill.setAttribute("aria-current", "true");
      if (interactive) {
        pill.addEventListener("click", () => {
          form.dataset.hwRegister = key;
          wrap.querySelectorAll(".hw-register__pill").forEach((el) => {
            const on = el.textContent === (key === "casual" ? "Casual" : "Polite");
            el.classList.toggle("hw-register__pill--active", on);
            el.classList.toggle("hw-register__pill--inactive", !on);
            if (on) el.setAttribute("aria-current", "true");
            else el.removeAttribute("aria-current");
          });
          applyAnswerVariants(form);
        });
      }
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

  function renderBlankWithHint(part, options) {
    options = options || {};
    const wrap = document.createElement("span");
    wrap.className = "hw-blank-wrap" + (part.multiline ? " hw-blank-wrap--multiline" : "");

    let field;
    if (part.multiline) {
      field = document.createElement("textarea");
      field.rows = 6;
      field.className = "hw-blank hw-blank--wide hw-blank--open";
    } else {
      field = document.createElement("input");
      field.type = "text";
      field.className = "hw-blank" + (part.wide ? " hw-blank--wide" : "");
    }
    field.name = part.name;
    field.autocomplete = "off";
    field.setAttribute("aria-label", part.multiline ? "Your response" : "Answer");
    if (!options.omitAnswers && part.variants) {
      field.dataset.variants = JSON.stringify(part.variants);
    }
    if (!options.omitAnswers && part.answer) field.dataset.answer = part.answer;
    wrap.appendChild(field);

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

  function renderQuestionBadge() {
    const badge = document.createElement("span");
    badge.className = "hw-question-badge";
    badge.textContent = "QUESTION";
    badge.setAttribute("aria-label", "Your own sentence");
    return badge;
  }

  function renderTenseBubbles(form, section, activeTense, interactive) {
    const options = section.tenseBubbles || ["Now-Later", "Past"];
    const active = activeTense || section.activeTense || options[0];
    const wrap = document.createElement("div");
    wrap.className = "hw-tense-bubbles";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Tense — switch Now-Later or Past");

    options.forEach((label) => {
      const pill = document.createElement(interactive ? "button" : "span");
      if (interactive) pill.type = "button";
      const on = label === active;
      pill.className = "hw-tense-pill" + (on ? " hw-tense-pill--active" : " hw-tense-pill--inactive");
      pill.textContent = label;
      if (on) pill.setAttribute("aria-current", "true");
      if (interactive) {
        pill.addEventListener("click", () => {
          form.dataset.hwTense = label;
          form.querySelectorAll(".hw-tense-bubbles").forEach((group) => {
            group.querySelectorAll(".hw-tense-pill").forEach((el) => {
              const isOn = el.textContent === label;
              el.classList.toggle("hw-tense-pill--active", isOn);
              el.classList.toggle("hw-tense-pill--inactive", !isOn);
              if (isOn) el.setAttribute("aria-current", "true");
              else el.removeAttribute("aria-current");
            });
          });
          applyAnswerVariants(form);
        });
      }
      wrap.appendChild(pill);
    });

    return wrap;
  }

  function authorTextFromPart(part) {
    if (!part) return "";
    if (part.type === "text" && part.value) return part.value;
    if (part.ruby && part.ruby.length) {
      return part.ruby.map((seg) => seg.text || "").join("");
    }
    return "";
  }

  function renderAuthorTextInput(value) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "hw-blank hw-author-text";
    input.setAttribute("data-part-type", "text");
    input.value = value || "";
    input.setAttribute("aria-label", "Sentence text");
    return input;
  }

  function renderAuthorBlank(part, showHints) {
    const wrap = document.createElement("span");
    wrap.className = "hw-blank-wrap";

    let field;
    if (part.multiline) {
      field = document.createElement("textarea");
      field.rows = 6;
      field.className = "hw-blank hw-blank--wide hw-blank--open hw-author-blank";
    } else {
      field = document.createElement("input");
      field.type = "text";
      field.className = "hw-blank hw-blank--wide hw-author-blank";
    }
    field.name = part.name;
    field.setAttribute("data-part-type", "blank");
    field.setAttribute("data-blank-name", part.name);
    field.value = part.answer || "";
    field.setAttribute("aria-label", part.multiline ? "Model response (optional)" : "Answer key (optional)");
    if (part.answer) field.dataset.answer = part.answer;
    wrap.appendChild(field);

    if (showHints) {
      const hintRow = document.createElement("span");
      hintRow.className = "hw-author-hint-row";
      const dict = document.createElement("input");
      dict.type = "text";
      dict.className = "hw-author-hint";
      dict.placeholder = "dictionary (e.g. いく)";
      dict.setAttribute("data-hint-dict", part.name);
      dict.value = part.hint?.dictionary || "";
      const conj = document.createElement("input");
      conj.type = "text";
      conj.className = "hw-author-hint";
      conj.placeholder = "conjugation";
      conj.setAttribute("data-hint-conj", part.name);
      conj.value = part.hint?.conjugation || "plain";
      hintRow.append(dict, conj);
      wrap.appendChild(hintRow);
    }

    return wrap;
  }

  function renderAuthorLine(item, index, sectionMode) {
    const openBlock = item.openResponse || (sectionMode === "context-blank" && item.parts?.[0]?.multiline);
    const line = document.createElement(openBlock ? "div" : "p");
    line.className =
      "hw-worksheet__line hw-worksheet__line--author" +
      (item.negative ? " hw-worksheet__line--negative" : "") +
      (openBlock ? " hw-worksheet__line--open-response" : "");
    line.dataset.itemId = item.id || "item-" + (index + 1);

    if (!openBlock) {
      const label = document.createElement("span");
      label.className = "hw-worksheet__label";
      label.textContent = LABELS[index] || String(index + 1);
      line.appendChild(label);
    }

    const content = document.createElement(openBlock ? "div" : "span");
    content.className = "hw-worksheet__content";

    (item.parts || []).forEach((part) => {
      if (part.type === "text" || part.ruby) {
        content.appendChild(renderAuthorTextInput(authorTextFromPart(part)));
      } else if (part.type === "blank") {
        content.appendChild(renderAuthorBlank(part, sectionMode === "grammar-blank"));
      }
    });

    if (sectionMode === "context-blank") {
      content.appendChild(renderQuestionBadge());
    }

    if (sectionMode === "grammar-blank") {
      const negLabel = document.createElement("label");
      negLabel.className = "hw-author-negative-label";
      const neg = document.createElement("input");
      neg.type = "checkbox";
      neg.className = "hw-author-negative";
      neg.checked = Boolean(item.negative);
      negLabel.append(neg, document.createTextNode(" Negative"));
      content.appendChild(negLabel);
    }

    line.appendChild(content);
    return line;
  }

  function renderLine(item, index, sectionMode) {
    const openBlock = item.openResponse || (sectionMode === "context-blank" && item.parts?.[0]?.multiline);
    const line = document.createElement(openBlock ? "div" : "p");
    line.className =
      "hw-worksheet__line" +
      (item.negative ? " hw-worksheet__line--negative" : "") +
      (openBlock ? " hw-worksheet__line--open-response" : "");
    line.dataset.itemId = item.id || "";

    if (!openBlock) {
      const label = document.createElement("span");
      label.className = "hw-worksheet__label";
      label.textContent = LABELS[index] || String(index + 1);
      line.appendChild(label);
    }

    const content = document.createElement(openBlock ? "div" : "span");
    content.className = "hw-worksheet__content";

    (item.parts || []).forEach((part) => {
      if (part.type === "text") {
        content.appendChild(renderTextPart(part));
      } else if (part.type === "blank") {
        content.appendChild(renderBlankWithHint(part, { omitAnswers: true }));
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

    if (sectionMode === "context-blank") {
      content.appendChild(renderQuestionBadge());
    }

    line.appendChild(content);

    return line;
  }

  function renderSection(form, section, interactive, authoring) {
    const wrap = document.createElement("div");
    wrap.className = "hw-worksheet__section";
    wrap.dataset.sectionId = section.id || "";
    wrap.dataset.mode = section.mode || "";

    const head = document.createElement("div");
    head.className = "hw-worksheet__section-head";

    const heading = document.createElement("h3");
    heading.className = "hw-worksheet__section-title";
    heading.textContent = section.title;
    head.appendChild(heading);

    const tenseAtMeta = form?.dataset.hwTenseAtMeta === "1";
    if (section.tenseBubbles && section.tenseBubbles.length && interactive && !tenseAtMeta) {
      const tense =
        (form && form.dataset.hwTense) || section.activeTense || section.tenseBubbles[0];
      head.appendChild(renderTenseBubbles(form, section, tense, true));
    } else if (section.tenseBubbles && section.tenseBubbles.length && !tenseAtMeta) {
      head.appendChild(
        renderTenseBubbles(form, section, section.activeTense || section.tenseBubbles[0], false)
      );
    }

    wrap.appendChild(head);

    if (section.instructions) {
      const intro = document.createElement("p");
      intro.className = "hw-worksheet__section-intro";
      intro.textContent = section.instructions;
      wrap.appendChild(intro);
    }

    (section.items || []).forEach((item, i) => {
      if (authoring) {
        wrap.appendChild(renderAuthorLine(item, i, section.mode));
      } else {
        wrap.appendChild(renderLine(item, i, section.mode));
      }
    });

    return wrap;
  }

  /**
   * Build assignment JSON from teacher authoring form.
   * @param {HTMLFormElement} form
   */
  function assignmentFromAuthoringForm(form) {
    const assignment = {
      id: form.dataset.assignmentId || "",
      title: form.dataset.title || "",
      youtubeUrl: form.dataset.youtubeUrl || "",
      status: "draft",
      forSale: false,
      salePrice: 0.99,
      sections: [],
    };

    form.querySelectorAll(".hw-worksheet__section").forEach((secEl) => {
      const section = {
        id: secEl.dataset.sectionId || "section",
        title: secEl.querySelector(".hw-worksheet__section-title")?.textContent || "",
        instructions:
          secEl.querySelector(".hw-worksheet__section-intro")?.textContent || "",
        mode: secEl.dataset.mode || "grammar-blank",
        items: [],
      };
      if (section.mode === "grammar-blank") {
        section.tenseBubbles = ["Now-Later", "Past"];
        section.activeTense = "Now-Later";
      }

      secEl.querySelectorAll(".hw-worksheet__line").forEach((lineEl, index) => {
        const item = { id: lineEl.dataset.itemId || "item-" + (index + 1), parts: [] };
        if (lineEl.querySelector(".hw-author-negative")?.checked) {
          item.negative = true;
        }
        const content = lineEl.querySelector(".hw-worksheet__content");
        if (!content) return;

        content.querySelectorAll("input[data-part-type], textarea[data-part-type]").forEach((el) => {
          if (el.dataset.partType === "text") {
            const value = el.value.trim();
            if (value) item.parts.push({ type: "text", value });
          } else if (el.dataset.partType === "blank") {
            if (el.tagName === "TEXTAREA") {
              const part = { type: "blank", name: el.name, wide: true, multiline: true };
              const answer = el.value.trim();
              if (answer) part.answer = answer;
              item.parts.push(part);
              return;
            }
            const name = el.dataset.blankName || el.name;
            const part = { type: "blank", name, wide: true };
            const answer = el.value.trim();
            if (answer) part.answer = answer;
            const dict = content
              .querySelector('[data-hint-dict="' + name + '"]')
              ?.value.trim();
            const conj =
              content.querySelector('[data-hint-conj="' + name + '"]')?.value.trim() ||
              "plain";
            if (dict && section.mode === "grammar-blank") {
              part.hint = { dictionary: dict, conjugation: conj };
            }
            item.parts.push(part);
          }
        });

        if (item.parts.length) section.items.push(item);
      });

      assignment.sections.push(section);
    });

    enrichGrammarVariants(assignment);
    return assignment;
  }

  function assignmentHasVariants(assignment) {
    return (assignment.sections || []).some((section) =>
      (section.items || []).some((item) =>
        (item.parts || []).some((part) => part.type === "blank" && part.variants)
      )
    );
  }

  /**
   * @param {HTMLElement} mount
   * @param {object} assignment
   * @returns {HTMLFormElement}
   */
  function render(mount, assignment, options) {
    options = options || {};
    const authoring = Boolean(options.authoring);
    const prepared = JSON.parse(JSON.stringify(assignment || { sections: [] }));
    mount.innerHTML = "";

    const form = document.createElement("form");
    form.id = "hw-worksheet-form";
    form.className = "hw-worksheet" + (authoring ? " hw-worksheet--authoring" : "");
    form.lang = "ja";
    form.setAttribute("data-assignment-id", prepared.id || "");
    form.dataset.title = prepared.title || "";
    form.dataset.youtubeUrl = prepared.youtubeUrl || "";

    const meta = document.createElement("div");
    meta.className = "hw-worksheet__meta";
    const metaTop = document.createElement("div");
    metaTop.className = "hw-worksheet__meta-top";

    const hasVariants = false;
    const interactive = false;

    const metaText = document.createElement("div");
    metaText.className = "hw-worksheet__meta-text";
    metaText.innerHTML =
      '<p class="hw-worksheet__meta-title">' +
      escapeHtml(prepared.title || "Homework") +
      "</p>" +
      (authoring
        ? '<p class="hw-worksheet__meta-hint">Teacher: type each sentence and an optional answer key in the blank (not shown to students). Section 1 has five lines; Section 2 has three open lines.</p>'
        : '<p class="hw-worksheet__meta-hint">Fill in each blank, then submit. JD will review your work.</p>');
    metaTop.appendChild(metaText);
    const grammarSection = (prepared.sections || []).find((s) => s.mode === "grammar-blank");
    const variantControlsInteractive = !options.preview && hasVariants;

    if (variantControlsInteractive) {
      form.dataset.hwRegister = form.dataset.hwRegister || prepared.register || "casual";
      form.dataset.hwTense = form.dataset.hwTense || "Now-Later";
      const controls = document.createElement("div");
      controls.className = "hw-worksheet__meta-controls";
      controls.appendChild(renderRegisterPills(form, form.dataset.hwRegister, true));
      if (grammarSection?.tenseBubbles?.length) {
        form.dataset.hwTenseAtMeta = "1";
        controls.appendChild(
          renderTenseBubbles(form, grammarSection, form.dataset.hwTense, true)
        );
      }
      metaTop.appendChild(controls);
    }

    meta.appendChild(metaTop);
    form.appendChild(meta);

    (prepared.sections || []).forEach((section) => {
      form.appendChild(renderSection(form, section, interactive, authoring));
    });


    const actions = document.createElement("div");
    actions.className = "hw-worksheet__actions";
    if (!authoring) {
      actions.innerHTML =
        '<button type="button" class="btn btn--ghost" data-hw-print>Print</button>' +
        (options.preview
          ? ""
          : '<button type="submit" class="btn btn--primary">Submit homework</button>');
      form.appendChild(actions);
    }

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

    actions.querySelector?.("[data-hw-print]")?.addEventListener("click", () => printBlank(form));

    return form;
  }

  /**
   * Print empty worksheet — blanks cleared, compact one-page layout via CSS.
   * @param {HTMLFormElement} [formEl]
   * @returns {boolean}
   */
  function printBlank(formEl) {
    const form = formEl || document.getElementById("hw-worksheet-form");
    if (!form) return false;

    document.body.classList.add("hw-print-active");
    const inputs = form.querySelectorAll(".hw-blank");
    const saved = Array.from(inputs, (inp) => inp.value);
    inputs.forEach((inp) => {
      inp.value = "";
    });

    function restore() {
      document.body.classList.remove("hw-print-active");
      inputs.forEach((inp, i) => {
        inp.value = saved[i];
      });
      window.removeEventListener("afterprint", restore);
    }

    window.addEventListener("afterprint", restore);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print());
    });
    return true;
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

  function answersMatch(student, expected, strict) {
    const a = normalizeAnswer(student);
    const b = normalizeAnswer(expected);
    if (!a || !b) return false;
    if (a === b) return true;
    if (strict) return false;
    // Allow student to include particle when answer is grammar stem only
    if (a.endsWith(b) || b.endsWith(a)) return true;
    return false;
  }

  /**
   * @param {HTMLFormElement} form
   * @returns {{ graded: Array<object>, openEnded: Array<object>, score: { correct: number, total: number }, openFilled: number, openTotal: number }}
   */
  function checkHomework(form) {
    applyAnswerVariants(form);
    const graded = [];
    const openEnded = [];
    let correct = 0;
    let openFilled = 0;

    form.querySelectorAll(".hw-blank").forEach((input) => {
      const expected = input.dataset.answer;
      const value = input.value;
      const strict = Boolean(input.dataset.variants);
      input.classList.remove("hw-blank--correct", "hw-blank--wrong");

      if (expected) {
        const ok = answersMatch(value, expected, strict);
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
    if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return null;
    return el;
  }

  function completedSentenceForBlank(form, inputName, answerText) {
    const input = getBlankInput(form, inputName);
    if (!input) return (answerText || "").trim() || "(blank)";
    if (input.tagName === "TEXTAREA") return (answerText || input.value || "").trim() || "(blank)";
    const content = input.closest(".hw-worksheet__content");
    if (!content) return (answerText || "").trim() || "(blank)";
    const clone = content.cloneNode(true);
    clone.querySelectorAll(".hw-conj-hint").forEach((el) => el.remove());
    clone.querySelectorAll(".hw-negative-badge, .hw-question-badge").forEach((el) => el.remove());
    clone.querySelectorAll("rt").forEach((el) => el.remove());
    const blank = clone.querySelector(".hw-blank");
    if (blank) blank.replaceWith(document.createTextNode((answerText || "").trim() || "___"));
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function renderCheckResults(form) {
    const box = form.querySelector("#hw-check-results");
    if (!box) return;
    box.hidden = true;
  }

  /** Collect student answers for submit (no auto-grading). */
  function collectHomeworkAnswers(form) {
    const section1 = [];
    const section2 = [];

    form.querySelectorAll(".hw-worksheet__section").forEach((secEl) => {
      const mode = secEl.dataset.mode || "";
      let idx = 0;
      secEl.querySelectorAll("input.hw-blank, textarea.hw-blank").forEach((el) => {
        if (!el.name) return;
        const student = el.value.trim();
        const row = {
          name: el.name,
          label:
            mode === "context-blank"
              ? "QUESTION " + (LABELS[idx] || String(idx + 1))
              : LABELS[idx] || String(idx + 1),
          prompt: promptForBlank(form, el.name),
          student,
          completed: completedSentenceForBlank(form, el.name, student),
        };
        if (mode === "grammar-blank") {
          section1.push(row);
          idx += 1;
        } else {
          section2.push(row);
        }
      });
    });

    return {
      section1,
      section2,
      score: { correct: 0, total: 0 },
    };
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
    const section1 = (report.section1 || []).map((row) => ({
      label: row.label,
      prompt: row.prompt,
      student: row.student,
      completed: row.completed,
    }));

    const section2 = (report.section2 || []).map((row) => ({
      label: row.label,
      prompt: row.prompt,
      student: row.student,
      completed: row.completed,
    }));

    return {
      username: meta.username,
      displayName: meta.displayName,
      assignmentId: meta.assignmentId,
      lessonName: meta.lessonName,
      title: meta.title,
      register: form.dataset.hwRegister || meta.register,
      tense: form.dataset.hwTense || "Now-Later",
      section1,
      section2,
    };
  }

  global.HwWorksheet = {
    render,
    printBlank,
    formatHint,
    checkHomework,
    collectHomeworkAnswers,
    renderCheckResults,
    normalizeAnswer,
    answersMatch,
    buildSubmitPayload,
    assignmentFromAuthoringForm,
    buildRegisterVariants,
    enrichGrammarVariants,
    applyAnswerVariants,
  };
})(window);
