/**
 * Renders fillable homework from JSON (Section 1: grammar blank, Section 2: context blank).
 */
(function (global) {
  const HINT_TENSE_OPTIONS = [
    { value: "Now-later", label: "Now-later" },
    { value: "Past", label: "Past" },
    { value: "～たい", label: "～たい" },
    { value: "てform", label: "てform" },
    { value: "Let's", label: "Let's Form" },
    { value: "Direct command", label: "Direct command" },
    { value: "～ている", label: "～ている" },
    { value: "conditional (～たら)", label: "conditional (～たら)" },
    { value: "ば", label: "Conditional (ば)" },
    { value: "potential", label: "Potential" },
    { value: "passive", label: "Passive" },
    { value: "causative", label: "Causative" },
  ];

  const DEFAULT_HINT_TENSE = "Now-later";

  function isImmersionKitMediaUrl(url) {
    const u = String(url || "").toLowerCase();
    return u.includes("immersionkit") || u.includes("linodeobjects.com/immersionkit");
  }

  /**
   * Split a paste of Immersion Kit audio + screenshot URLs.
   * @param {string} text
   * @returns {{ audioUrl: string, imageUrl: string }}
   */
  function parseImmersionKitMediaPaste(text) {
    const urls = [
      ...new Set(
        (String(text).match(/https?:\/\/[^\s<>"\n]+/gi) || []).map((u) => u.replace(/[),.;]+$/, ""))
      ),
    ];
    let audioUrl = "";
    let imageUrl = "";
    urls.forEach((url) => {
      if (!isImmersionKitMediaUrl(url)) return;
      const lower = url.toLowerCase();
      if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(lower)) {
        if (!imageUrl) imageUrl = url;
        return;
      }
      if (/\.(mp3|m4a|wav|ogg|aac)(\?|#|$)/i.test(lower)) {
        if (!audioUrl) audioUrl = url;
        return;
      }
      if (!audioUrl && !/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(lower)) {
        if (!audioUrl) audioUrl = url;
      }
    });
    return { audioUrl, imageUrl };
  }

  function normalizeHintConjugation(value) {
    const c = String(value || "").trim();
    if (!c || c === "plain") return DEFAULT_HINT_TENSE;
    if (c === "たい") return "～たい";
    if (c === "て" || c === "Te-form") return "てform";
    if (c === "かった" || c === "past") return "Past";
    return c;
  }

  function getGrammarBlankTense(item) {
    const blank = (item?.parts || []).find((p) => p.type === "blank");
    let tense = normalizeHintConjugation(blank?.hint?.conjugation);
    if ((!tense || tense === DEFAULT_HINT_TENSE) && item?.past) tense = "Past";
    return tense;
  }

  function tenseShouldShowPill(tense) {
    return Boolean(tense);
  }

  function formatHint(hint) {
    if (!hint) return "";
    const d = hint.dictionary || "—";
    return "（" + d + "）";
  }

  function tensePillText(tense) {
    const opt = HINT_TENSE_OPTIONS.find((o) => o.value === tense);
    return (opt?.label || tense).toUpperCase();
  }

  function createItemLabel(num) {
    const label = document.createElement("span");
    label.className = "hw-item-num";
    label.setAttribute("aria-label", "Item " + num);
    label.textContent = String(num);
    return label;
  }

  function appendLineNumber(line, num) {
    const col = document.createElement("span");
    col.className = "hw-worksheet__line-num";
    col.appendChild(createItemLabel(num));
    line.appendChild(col);
  }

  function blockTypeLabel(mode) {
    if (mode === "grammar-blank") return "Grammar";
    if (mode === "audio-listening") return "Listening";
    if (mode === "context-blank") return "Open response";
    if (mode === "video-response") return "Video";
    if (mode === "audio-prompt") return "Audio";
    if (mode === "audio-mimic") return "Mimic";
    if (mode === "translation") return "Translation";
    if (mode === "star-order") return "Order";
    return "Block";
  }

  function enrichAssignmentMedia(assignment) {
    (assignment?.sections || []).forEach((section) => {
      if (section.mode !== "audio-listening") return;
      const sectionAudio = String(section.audioUrl || "").trim();
      const sectionImage = String(section.imageUrl || "").trim();
      const firstItem = section.items?.[0];
      const fallbackAudio =
        sectionAudio || String(firstItem?.audioUrl || "").trim();
      const fallbackImage =
        sectionImage || String(firstItem?.imageUrl || "").trim();
      (section.items || []).forEach((item) => {
        if (!String(item.audioUrl || "").trim() && fallbackAudio) {
          item.audioUrl = fallbackAudio;
        }
        if (!String(item.imageUrl || "").trim() && fallbackImage) {
          item.imageUrl = fallbackImage;
        }
      });
      if (!sectionAudio && section.items?.[0]?.audioUrl) {
        section.audioUrl = String(section.items[0].audioUrl).trim();
      }
      if (!sectionImage && section.items?.[0]?.imageUrl) {
        section.imageUrl = String(section.items[0].imageUrl).trim();
      }
    });
    return assignment;
  }

  function labelFromLineEl(el, mode, fallback) {
    const line = el.closest(".hw-worksheet__line");
    const num = line?.querySelector(".hw-item-num")?.textContent?.trim() || String(fallback);
    if (mode === "audio-listening") return "Listen " + num;
    if (mode === "audio-prompt") return "Audio " + num;
    if (mode === "audio-mimic") return "Mimic " + num;
    if (mode === "context-blank") return "Question " + num;
    return num;
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

  function normalizeRubyInput(text) {
    return String(text || "").replace(
      /[\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\ufeff]/g,
      ""
    );
  }

  const BRACKET_RUBY_RE = /([^\[\]]+?)\[([^\]]+)\]/g;

  function hasBracketRubyNotation(text) {
    const raw = normalizeRubyInput(text);
    return /([^\[\]]+?)\[([^\]]+)\]/.test(raw);
  }

  /**
   * Parse 直接[ちょくせつ] 言[い]われた into ruby segments.
   * @param {string} text
   * @returns {{ text: string, rt?: string }[]}
   */
  function parseBracketRubyNotation(text) {
    const raw = normalizeRubyInput(text);
    if (!raw) return [];
    const segments = [];
    let lastIndex = 0;
    const re = new RegExp(BRACKET_RUBY_RE.source, "g");
    let match;
    while ((match = re.exec(raw)) !== null) {
      if (match.index > lastIndex) {
        const plain = raw.slice(lastIndex, match.index);
        if (plain) segments.push({ text: plain });
      }
      segments.push({ text: match[1], rt: match[2] });
      lastIndex = re.lastIndex;
    }
    if (lastIndex < raw.length) {
      segments.push({ text: raw.slice(lastIndex) });
    }
    if (!segments.length) segments.push({ text: raw });
    return segments;
  }

  function rubySegmentsToBracketString(segments) {
    return (segments || [])
      .map((seg) => {
        const text = seg.text || "";
        const rt = String(seg.rt || "").trim();
        if (rt && normalizeAnswer(rt) !== normalizeAnswer(text)) {
          return text + "[" + rt + "]";
        }
        return text;
      })
      .join("");
  }

  function textPartToEditorString(part) {
    if (!part || part.type !== "text") return "";
    if (part.ruby?.length) return rubySegmentsToBracketString(part.ruby);
    return part.value || "";
  }

  function renderBracketRubyText(text) {
    const frag = document.createDocumentFragment();
    parseBracketRubyNotation(text).forEach((seg) => {
      if (seg.rt) frag.appendChild(renderRubySegment(seg));
      else if (seg.text) frag.appendChild(document.createTextNode(seg.text));
    });
    return frag;
  }

  function renderRubySegment(seg) {
    const text = seg.text || "";
    if (!text) return document.createTextNode("");
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
    const value = part.value || "";
    if (hasBracketRubyNotation(value)) return renderBracketRubyText(value);
    if (!value) return document.createTextNode("");
    const plain = document.createElement("span");
    plain.className = "ja-okuri";
    plain.textContent = value;
    return plain;
  }

  function renderBlankWithHint(part, options) {
    options = options || {};
    const wrap = document.createElement("span");
    const listenStyle = Boolean(options.listenStyle);
    wrap.className =
      "hw-blank-wrap" +
      (options.translationStyle ? " hw-blank-wrap--translation" : "") +
      (part.multiline && !listenStyle && !options.translationStyle
        ? " hw-blank-wrap--multiline"
        : "") +
      (listenStyle ? " hw-blank-wrap--listen" : "");

    let field;
    if (listenStyle) {
      field = document.createElement("input");
      field.type = "text";
      field.className = "hw-blank hw-blank--wide hw-blank--listen";
      field.setAttribute("aria-label", "What you heard");
    } else if (options.translationStyle) {
      field = document.createElement("textarea");
      field.rows = 4;
      field.className = "hw-blank hw-blank--wide hw-blank--translation";
      field.setAttribute("aria-label", "Your translation");
    } else if (part.multiline) {
      field = document.createElement("textarea");
      field.rows = 6;
      field.className = "hw-blank hw-blank--wide hw-blank--open";
      field.setAttribute("aria-label", "Your response");
    } else {
      field = document.createElement("input");
      field.type = "text";
      field.className = "hw-blank" + (part.wide ? " hw-blank--wide" : "");
      field.setAttribute("aria-label", "Answer");
    }
    field.name = part.name;
    field.autocomplete = "off";
    if (!options.omitAnswers && part.variants) {
      field.dataset.variants = JSON.stringify(part.variants);
    }
    if (!options.omitAnswers && part.answer) field.dataset.answer = part.answer;
    if (options.omitAnswers && listenStyle) {
      const teacherAnswer = String(part.answer || "").trim();
      if (teacherAnswer) wrap.dataset.teacherAnswer = teacherAnswer;
    }
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

  function renderTenseBadge(tense) {
    const label = HINT_TENSE_OPTIONS.find((o) => o.value === tense)?.label || tense;
    const badge = document.createElement("span");
    badge.className = "hw-tense-badge";
    badge.textContent = tensePillText(tense);
    badge.setAttribute("aria-label", "Use " + label + " form");
    return badge;
  }

  function renderRegisterBadge(register) {
    const key = register === "polite" ? "polite" : "casual";
    const badge = document.createElement("span");
    badge.className = "hw-register-badge hw-register-badge--" + key;
    badge.textContent = key === "polite" ? "POLITE" : "CASUAL";
    badge.setAttribute("aria-label", "Use " + (key === "polite" ? "polite" : "casual") + " speech");
    return badge;
  }

  function renderGrammarPills(item) {
    const row = document.createElement("span");
    row.className = "hw-line-pills";
    row.setAttribute("aria-hidden", "true");
    row.appendChild(renderRegisterBadge(item.register || "casual"));
    if (item.negative) row.appendChild(renderNegativeBadge());
    const tense = getGrammarBlankTense(item);
    if (tenseShouldShowPill(tense)) row.appendChild(renderTenseBadge(tense));
    return row;
  }

  function renderQuestionBadge() {
    const badge = document.createElement("span");
    badge.className = "hw-question-badge";
    badge.textContent = "QUESTION";
    badge.setAttribute("aria-label", "Open-ended question");
    return badge;
  }

  const LISTENING_TIP_LINES = [
    "Getting it perfect is not important. Just write down what you hear as best as you can.",
    "Don\u2019t get distracted by words or grammar you don\u2019t know. Just guess!",
  ];

  const SUBMISSION_TIP_LINES = [
    "Don\u2019t plan everything out. Try to speak based on what you currently know. You should feel the pressure of just having to speak on the spot.",
  ];

  function renderRecordingTip(itemId, options) {
    options = options || {};
    const tipLabel = options.label || "Tip";
    const lines = options.lines || LISTENING_TIP_LINES;
    const ariaLabel = options.ariaLabel || "Show " + tipLabel.toLowerCase() + " guidance";

    const wrap = document.createElement("div");
    wrap.className = "hw-recording-tip";
    if (options.important) wrap.classList.add("hw-recording-tip--important");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hw-recording-tip__trigger";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", ariaLabel);

    const icon = document.createElement("span");
    icon.className = "hw-recording-tip__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 18h6"/><path d="M10 22h4"/>' +
      '<path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>' +
      "</svg>";

    const label = document.createElement("span");
    label.className = "hw-recording-tip__label";
    label.textContent = tipLabel;

    btn.appendChild(icon);
    btn.appendChild(label);

    const message = document.createElement("p");
    const tipId =
      "hw-recording-tip-" + String(itemId || "x").replace(/[^\w-]/g, "") + "-" + Math.random().toString(36).slice(2, 7);
    message.id = tipId;
    message.className = "hw-recording-tip__message";
    message.hidden = true;
    message.textContent = lines.map((line) => "- " + line).join("\n");
    btn.setAttribute("aria-controls", tipId);

    btn.addEventListener("click", () => {
      const open = message.hidden;
      message.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.classList.toggle("is-open", open);
    });

    wrap.appendChild(btn);
    wrap.appendChild(message);
    return wrap;
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

  function renderAuthorTenseSelect(part) {
    const select = document.createElement("select");
    select.className = "hw-author-hint hw-author-hint--tense";
    select.setAttribute("data-hint-tense", part.name);
    const current = normalizeHintConjugation(part.hint?.conjugation);
    const values = HINT_TENSE_OPTIONS.map((o) => o.value);
    const options = HINT_TENSE_OPTIONS.slice();
    if (current && !values.includes(current)) {
      options.push({ value: current, label: current });
    }
    options.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === current) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  function renderAuthorRegisterSwitch(activeRegister) {
    const wrap = document.createElement("div");
    wrap.className = "hw-author-register";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Plain or polite");
    ["casual", "polite"].forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "hw-author-register__opt hw-author-register__opt--" +
        key +
        (key === (activeRegister || "casual") ? " is-active" : "");
      btn.dataset.register = key;
      btn.textContent = key === "casual" ? "Casual" : "Polite";
      wrap.appendChild(btn);
    });
    return wrap;
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
      hintRow.appendChild(dict);
      hintRow.appendChild(renderAuthorTenseSelect(part));
      wrap.appendChild(hintRow);
    }

    return wrap;
  }

  function renderAuthorLine(item, index, sectionMode, lineOptions) {
    lineOptions = lineOptions || {};
    const openBlock = item.openResponse || (sectionMode === "context-blank" && item.parts?.[0]?.multiline);
    const line = document.createElement(openBlock ? "div" : "p");
    line.className =
      "hw-worksheet__line hw-worksheet__line--author" +
      (item.negative ? " hw-worksheet__line--negative" : "") +
      (openBlock ? " hw-worksheet__line--open-response" : "");
    line.dataset.itemId = item.id || "item-" + (index + 1);

    if (lineOptions.itemNum) {
      appendLineNumber(line, lineOptions.itemNum);
    }

    const content = document.createElement(openBlock ? "div" : "span");
    content.className = "hw-worksheet__content";

    if (sectionMode === "audio-listening") {
      const audioLabel = document.createElement("label");
      audioLabel.className = "hw-author-audio-url";
      audioLabel.textContent = "Immersion Kit audio URL";
      const audioInput = document.createElement("input");
      audioInput.type = "text";
      audioInput.className = "hw-blank hw-blank--wide hw-author-audio";
      audioInput.spellcheck = false;
      audioInput.value = item.audioUrl || lineOptions.sectionAudioUrl || "";
      audioInput.setAttribute("data-item-audio-url", "1");
      audioInput.placeholder = "Paste audio URL from immersionkit.com";
      audioLabel.appendChild(audioInput);
      content.appendChild(audioLabel);

      const audioPreviewMount = document.createElement("div");
      audioPreviewMount.className = "hw-author-audio-preview";
      content.appendChild(audioPreviewMount);

      function syncAuthorAudioPreview() {
        audioPreviewMount.innerHTML = "";
        const url = String(audioInput.value || "").trim();
        if (!url) return;
        audioPreviewMount.appendChild(renderListenSlideAudio(url));
      }
      syncAuthorAudioPreview();
      audioInput.addEventListener("input", syncAuthorAudioPreview);
      audioInput.addEventListener("change", syncAuthorAudioPreview);

      const imageLabel = document.createElement("label");
      imageLabel.className = "hw-author-audio-url";
      imageLabel.textContent = "Screenshot URL (Immersion Kit)";
      const imageInput = document.createElement("input");
      imageInput.type = "text";
      imageInput.className = "hw-blank hw-blank--wide hw-author-audio";
      imageInput.spellcheck = false;
      imageInput.value = item.imageUrl || "";
      imageInput.setAttribute("data-item-image-url", "1");
      imageInput.placeholder = "Paste screenshot URL from the same clip";
      imageLabel.appendChild(imageInput);
      content.appendChild(imageLabel);

      const englishLabel = document.createElement("label");
      englishLabel.className = "hw-author-audio-url";
      englishLabel.textContent = "English meaning (teacher reference)";
      const englishInput = document.createElement("textarea");
      englishInput.className = "hw-blank hw-blank--wide hw-author-audio";
      englishInput.rows = 2;
      englishInput.value = item.englishAnswer || "";
      englishInput.setAttribute("data-item-english-answer", "1");
      englishInput.placeholder = "English translation of what they should hear";
      englishLabel.appendChild(englishInput);
      content.appendChild(englishLabel);
    }

    (item.parts || []).forEach((part) => {
      if (part.type === "text" || part.ruby) {
        content.appendChild(renderAuthorTextInput(authorTextFromPart(part)));
      } else if (part.type === "blank") {
        content.appendChild(renderAuthorBlank(part, sectionMode === "grammar-blank"));
      }
    });

    if (sectionMode === "grammar-blank") {
      const markerRow = document.createElement("span");
      markerRow.className = "hw-author-markers";

      const negLabel = document.createElement("label");
      negLabel.className = "hw-author-marker-label";
      const neg = document.createElement("input");
      neg.type = "checkbox";
      neg.className = "hw-author-negative";
      neg.checked = Boolean(item.negative);
      negLabel.append(neg, document.createTextNode(" Negative"));
      markerRow.appendChild(negLabel);

      content.appendChild(markerRow);
      content.appendChild(renderAuthorRegisterSwitch(item.register || "casual"));
    }

    if (sectionMode === "context-blank") {
      const qLabel = document.createElement("label");
      qLabel.className = "hw-author-marker-label";
      const q = document.createElement("input");
      q.type = "checkbox";
      q.className = "hw-author-question";
      q.checked = Boolean(item.question);
      qLabel.append(q, document.createTextNode(" Question"));
      content.appendChild(qLabel);
    }

    line.appendChild(content);
    return line;
  }

  function renderListenScreenshot(url) {
    const imgUrl = String(url || "").trim();
    if (!imgUrl) return null;
    const fig = document.createElement("figure");
    fig.className = "hw-listen-card__figure";
    const img = document.createElement("img");
    img.className = "hw-listen-card__img";
    img.src = imgUrl;
    img.alt = "Anime screenshot from Immersion Kit";
    img.loading = "lazy";
    img.decoding = "async";
    fig.appendChild(img);
    return fig;
  }

  function renderAudioPlayer(url, options) {
    options = options || {};
    const wrap = document.createElement("div");
    wrap.className =
      "hw-audio-player" + (options.inline ? " hw-audio-player--inline" : "");
    const clipUrl = global.HwCompat?.normalizeMediaUrl
      ? global.HwCompat.normalizeMediaUrl(url)
      : String(url || "").trim();
    if (!clipUrl) {
      wrap.innerHTML = '<p class="hw-audio-player__missing">Audio clip not set yet.</p>';
      return wrap;
    }
    const audio = document.createElement("audio");
    audio.className = "hw-audio-player__el";
    if (options.compactSpeed) audio.dataset.compactSpeed = "1";
    const playerRoot = global.HwCompat?.enhanceAudioElement
      ? global.HwCompat.enhanceAudioElement(audio, clipUrl, { compactSpeed: options.compactSpeed })
      : (function () {
          audio.controls = true;
          audio.preload = "metadata";
          audio.src = clipUrl;
          return audio;
        })();
    if (!playerRoot) {
      wrap.innerHTML = '<p class="hw-audio-player__missing">Audio clip could not be loaded.</p>';
      return wrap;
    }
    audio.setAttribute("aria-label", "Listening clip — play as many times as you need");
    audio.addEventListener("error", () => {
      if (wrap.querySelector(".hw-audio-player__missing")) return;
      const note = document.createElement("p");
      note.className = "hw-audio-player__missing";
      note.textContent =
        "Audio could not load in this browser. Try refreshing the page.";
      wrap.appendChild(note);
    });
    wrap.appendChild(playerRoot);
    if (!options.inline) {
      const hint = document.createElement("p");
      hint.className = "hw-audio-player__hint";
      hint.textContent =
        "Play the clip as many times as you need, then write what you hear below.";
      wrap.appendChild(hint);
    }
    if (options.listenCard) {
      const card = document.createElement("div");
      card.className = "hw-listen-card";
      card.appendChild(wrap);
      return card;
    }
    return wrap;
  }

  /** Listen-slide audio shell — use for every homework audio player (clips + replays). */
  function renderListenSlideAudio(url, options) {
    options = options || {};
    const card = document.createElement("div");
    card.className =
      "hw-listen-card" + (options.compact ? " hw-listen-card--review-compact" : "");
    card.appendChild(renderAudioPlayer(url, { inline: true, compactSpeed: options.compact }));
    if (options.ariaLabel) {
      card
        .querySelector(".hw-audio-player__el")
        ?.setAttribute("aria-label", options.ariaLabel);
    }
    return card;
  }

  function mediaReplayAnchor(lineEl) {
    return (
      lineEl?.querySelector(".hw-video-prompt__question") ||
      lineEl?.querySelector(".hw-audio-prompt__head") ||
      lineEl?.querySelector(".hw-audio-mimic__you-label") ||
      lineEl?.querySelector(".hw-audio-mimic__head") ||
      null
    );
  }

  /** Same listen-slide player for recorded audio answers (video/audio prompts). */
  function setAudioAnswerReplay(contextEl, url, options) {
    options = options || {};
    const lineEl = contextEl?.closest?.(".hw-worksheet__line") || contextEl;
    if (!lineEl) return;
    clearAudioAnswerReplay(lineEl);
    const clipUrl = String(url || "").trim();
    if (!clipUrl) return;
    const anchor = mediaReplayAnchor(lineEl);
    if (!anchor) return;
    const slot = document.createElement("div");
    slot.className = "hw-listen-replay-slot";
    slot.appendChild(renderListenSlideAudio(clipUrl, options));
    anchor.insertAdjacentElement("afterend", slot);
  }

  function clearAudioAnswerReplay(contextEl) {
    const lineEl = contextEl?.closest?.(".hw-worksheet__line") || contextEl;
    lineEl?.querySelector(".hw-listen-replay-slot")?.remove();
  }

  /** Custom blu/orange video chrome for recorded video answers (video prompts). */
  function setVideoAnswerReplay(contextEl, url, options) {
    options = options || {};
    const lineEl = contextEl?.closest?.(".hw-worksheet__line") || contextEl;
    if (!lineEl) return;
    clearVideoAnswerReplay(lineEl);
    const clipUrl = global.HwCompat?.normalizeMediaUrl
      ? global.HwCompat.normalizeMediaUrl(url)
      : String(url || "").trim();
    if (!clipUrl) return;
    const anchor = mediaReplayAnchor(lineEl);
    if (!anchor) return;
    const slot = document.createElement("div");
    slot.className = "hw-video-replay-slot";
    const video = document.createElement("video");
    video.setAttribute("aria-label", options.ariaLabel || "Recorded answer");
    const player =
      global.HwCompat?.enhanceVideoElement?.(video, clipUrl, { compact: true }) ||
      (function () {
        video.className = "hw-video-replay-slot__el";
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.src = clipUrl;
        return video;
      })();
    if (player !== video) {
      player.classList.add("hw-video-replay-slot__player");
    }
    slot.appendChild(player);
    anchor.insertAdjacentElement("afterend", slot);
  }

  function clearVideoAnswerReplay(contextEl) {
    const lineEl = contextEl?.closest?.(".hw-worksheet__line") || contextEl;
    lineEl?.querySelector(".hw-video-replay-slot")?.remove();
  }

  function resolveRecorderMeta(renderOptions, assignment) {
    const fromOpts = renderOptions?.studentMeta || {};
    const session = global.HwAuth?.getSession?.() || null;
    return {
      username: fromOpts.username || session?.username || "",
      displayName:
        fromOpts.displayName ||
        session?.displayName ||
        session?.username ||
        fromOpts.username ||
        "",
      assignmentId: fromOpts.assignmentId || assignment?.id || "",
      lessonName: fromOpts.lessonName || assignment?.lessonName || assignment?.title || "",
    };
  }

  function renderVideoRecordCue(item, index, renderOptions) {
    renderOptions = renderOptions || {};
    const videoLine = document.createElement("div");
    videoLine.className = "hw-worksheet__line hw-worksheet__line--video";
    if (renderOptions.itemNum) {
      appendLineNumber(videoLine, renderOptions.itemNum);
    }

    const videoContent = document.createElement("div");
    videoContent.className = "hw-worksheet__content";

    const wrap = document.createElement("div");
    wrap.className = "hw-video-prompt";
    wrap.dataset.itemId = item.id || "";

    const label = document.createElement("p");
    label.className = "hw-video-prompt__label";
    label.textContent = "Video question — answer in Japanese";
    wrap.appendChild(label);

    const promptText = item.prompt || "Answer this question on video.";
    const question = document.createElement("p");
    question.className = "hw-video-prompt__text hw-video-prompt__question";
    question.setAttribute("lang", "ja");
    question.textContent = promptText;
    wrap.appendChild(question);

    if (!renderOptions.readOnly) {
      const head = document.createElement("div");
      head.className = "hw-video-prompt__head";

      const instruction = document.createElement("p");
      instruction.className = "hw-video-prompt__instruction";
      instruction.textContent =
        "Choose video or audio-only, record your answer in Japanese, then save it.";
      head.appendChild(instruction);

      if (!renderOptions.preview) {
        head.appendChild(
          renderRecordingTip(item.id || "vid-" + (index + 1), {
            label: "IMPORTANT",
            important: true,
            lines: SUBMISSION_TIP_LINES,
            ariaLabel: "Show important recording guidance",
          })
        );
      }
      wrap.appendChild(head);
    }

    const recorderMount = document.createElement("div");
    recorderMount.className = "hw-video-prompt__recorder";
    wrap.appendChild(recorderMount);

    if (renderOptions.preview) {
      recorderMount.innerHTML =
        '<p class="hw-video-prompt__note">Students record and send their answer here.</p>';
    } else if (!renderOptions.readOnly && global.HwVideoInline?.mount) {
      const meta = resolveRecorderMeta(renderOptions, renderOptions.assignment);
      global.HwVideoInline.mount(recorderMount, {
        username: meta.username,
        displayName: meta.displayName,
        assignmentId: meta.assignmentId,
        lessonName: meta.lessonName,
        promptId: item.id || "vid-" + (index + 1),
        promptLabel: item.prompt || "",
      });
    } else {
      recorderMount.innerHTML =
        '<p class="hw-video-prompt__note">Recording is not available in this browser.</p>';
    }

    videoContent.appendChild(wrap);
    videoLine.appendChild(videoContent);
    return videoLine;
  }

  function renderAuthorVideoItem(item, index, lineOptions) {
    lineOptions = lineOptions || {};
    const wrap = document.createElement("div");
    wrap.className = "hw-worksheet__line hw-worksheet__line--author hw-worksheet__line--video";
    wrap.dataset.itemId = item.id || "vid-" + (index + 1);

    if (lineOptions.itemNum) {
      appendLineNumber(wrap, lineOptions.itemNum);
    }

    const content = document.createElement("div");
    content.className = "hw-worksheet__content";

    const prompt = document.createElement("textarea");
    prompt.className = "hw-blank hw-blank--wide hw-blank--open hw-author-video-prompt";
    prompt.rows = 2;
    prompt.value = item.prompt || "";
    prompt.setAttribute("data-video-prompt", "1");
    prompt.setAttribute("aria-label", "Video prompt " + (index + 1));
    content.appendChild(prompt);
    wrap.appendChild(content);
    return wrap;
  }

  function renderAudioRecordCue(item, index, renderOptions) {
    renderOptions = renderOptions || {};
    const audioLine = document.createElement("div");
    audioLine.className = "hw-worksheet__line hw-worksheet__line--audio-prompt";
    audioLine.dataset.itemId = item.id || "";

    if (renderOptions.itemNum) {
      appendLineNumber(audioLine, renderOptions.itemNum);
    }

    const audioContent = document.createElement("div");
    audioContent.className = "hw-worksheet__content";

    const wrap = document.createElement("div");
    wrap.className = "hw-audio-prompt";

    const head = document.createElement("div");
    head.className = "hw-audio-prompt__head";

    const prompt = document.createElement("p");
    prompt.className = "hw-audio-prompt__text";
    prompt.textContent = item.prompt || "Answer this question on audio.";
    head.appendChild(prompt);

    if (!renderOptions.preview && !renderOptions.readOnly) {
      head.appendChild(
        renderRecordingTip(item.id || "aud-" + (index + 1), {
          label: "IMPORTANT",
          important: true,
          lines: SUBMISSION_TIP_LINES,
          ariaLabel: "Show important recording guidance",
        })
      );
    }
    wrap.appendChild(head);

    const recorderMount = document.createElement("div");
    recorderMount.className = "hw-audio-prompt__recorder";
    wrap.appendChild(recorderMount);

    if (renderOptions.preview) {
      recorderMount.innerHTML =
        '<p class="hw-audio-prompt__note">Students record and send their answer here.</p>';
    } else if (!renderOptions.readOnly && global.HwAudioInline?.mount) {
      const meta = resolveRecorderMeta(renderOptions, renderOptions.assignment);
      global.HwAudioInline.mount(recorderMount, {
        username: meta.username,
        displayName: meta.displayName,
        assignmentId: meta.assignmentId,
        lessonName: meta.lessonName,
        promptId: item.id || "aud-" + (index + 1),
        promptLabel: item.prompt || "",
      });
    } else {
      recorderMount.innerHTML =
        '<p class="hw-audio-prompt__note">Recording is not available in this browser.</p>';
    }

    audioContent.appendChild(wrap);
    audioLine.appendChild(audioContent);
    return audioLine;
  }

  function renderAuthorAudioItem(item, index, lineOptions) {
    lineOptions = lineOptions || {};
    const wrap = document.createElement("div");
    wrap.className =
      "hw-worksheet__line hw-worksheet__line--author hw-worksheet__line--audio-prompt";
    wrap.dataset.itemId = item.id || "aud-" + (index + 1);

    if (lineOptions.itemNum) {
      appendLineNumber(wrap, lineOptions.itemNum);
    }

    const content = document.createElement("div");
    content.className = "hw-worksheet__content";

    const prompt = document.createElement("textarea");
    prompt.className = "hw-blank hw-blank--wide hw-blank--open hw-author-audio-prompt";
    prompt.rows = 2;
    prompt.value = item.prompt || "";
    prompt.setAttribute("data-audio-prompt", "1");
    prompt.setAttribute("aria-label", "Audio prompt " + (index + 1));
    content.appendChild(prompt);
    wrap.appendChild(content);
    return wrap;
  }

  function normalizeItemAudioUrl(item) {
    const raw = String(item?.audioUrl || "").trim();
    if (!raw) {
      const mediaId = String(item?.promptMediaId || "").trim();
      if (mediaId) {
        return global.HwAudioInline?.mediaUrl
          ? global.HwAudioInline.mediaUrl(mediaId)
          : global.HwVideoInline?.mediaUrl
            ? global.HwVideoInline.mediaUrl(mediaId)
            : "/api/hw-m/" + encodeURIComponent(mediaId);
      }
      return "";
    }
    return global.HwCompat?.normalizeMediaUrl ? global.HwCompat.normalizeMediaUrl(raw) : raw;
  }

  function renderAudioMimicCue(item, index, renderOptions) {
    renderOptions = renderOptions || {};
    const mimicLine = document.createElement("div");
    mimicLine.className = "hw-worksheet__line hw-worksheet__line--audio-mimic";
    mimicLine.dataset.itemId = item.id || "";

    if (renderOptions.itemNum) {
      appendLineNumber(mimicLine, renderOptions.itemNum);
    }

    const mimicContent = document.createElement("div");
    mimicContent.className = "hw-worksheet__content";

    const wrap = document.createElement("div");
    wrap.className = "hw-audio-mimic";

    const head = document.createElement("div");
    head.className = "hw-audio-mimic__head";

    const label = document.createElement("p");
    label.className = "hw-audio-mimic__label";
    label.textContent = "Listen, then record your version";
    head.appendChild(label);

    const promptText = String(item.prompt || "").trim();
    if (promptText) {
      const prompt = document.createElement("p");
      prompt.className = "hw-audio-mimic__text";
      prompt.textContent = promptText;
      head.appendChild(prompt);
    }

    if (!renderOptions.preview && !renderOptions.readOnly) {
      head.appendChild(
        renderRecordingTip(item.id || "mimic-" + (index + 1), {
          label: "IMPORTANT",
          important: true,
          lines: SUBMISSION_TIP_LINES,
          ariaLabel: "Show important recording guidance",
        })
      );
    }
    wrap.appendChild(head);

    const teacherMount = document.createElement("div");
    teacherMount.className = "hw-audio-mimic__teacher";
    const teacherUrl = normalizeItemAudioUrl(item);
    if (teacherUrl) {
      const teacherLabel = document.createElement("p");
      teacherLabel.className = "hw-audio-mimic__teacher-label";
      teacherLabel.textContent = "Teacher";
      teacherMount.appendChild(teacherLabel);
      teacherMount.appendChild(
        renderListenSlideAudio(teacherUrl, {
          ariaLabel: "Teacher audio to mimic",
        })
      );
    } else if (renderOptions.preview) {
      const missing = document.createElement("p");
      missing.className = "hw-audio-mimic__note";
      missing.textContent = "Teacher audio will play here once recorded.";
      teacherMount.appendChild(missing);
    }
    wrap.appendChild(teacherMount);

    const youLabel = document.createElement("p");
    youLabel.className = "hw-audio-mimic__you-label";
    youLabel.textContent = "You";
    wrap.appendChild(youLabel);

    const recorderMount = document.createElement("div");
    recorderMount.className = "hw-audio-mimic__recorder";
    wrap.appendChild(recorderMount);

    if (renderOptions.preview) {
      recorderMount.innerHTML =
        '<p class="hw-audio-mimic__note">Students record their mimic here.</p>';
    } else if (!renderOptions.readOnly && global.HwAudioInline?.mount) {
      const meta = resolveRecorderMeta(renderOptions, renderOptions.assignment);
      global.HwAudioInline.mount(recorderMount, {
        username: meta.username,
        displayName: meta.displayName,
        assignmentId: meta.assignmentId,
        lessonName: meta.lessonName,
        promptId: item.id || "mimic-" + (index + 1),
        promptLabel: promptText || "Listen & mimic",
        startLabel: item.recordLabel || "Record",
      });
    } else {
      recorderMount.innerHTML =
        '<p class="hw-audio-mimic__note">Recording is not available in this browser.</p>';
    }

    mimicContent.appendChild(wrap);
    mimicLine.appendChild(mimicContent);
    return mimicLine;
  }

  function shufflePieces(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function renderTranslationLine(item, lineOptions) {
    const line = document.createElement("div");
    line.className = "hw-worksheet__line hw-worksheet__line--translation";
    line.dataset.itemId = item.id || "";

    if (lineOptions.itemNum) appendLineNumber(line, lineOptions.itemNum);

    const content = document.createElement("div");
    content.className = "hw-worksheet__content";

    const jp = document.createElement("p");
    jp.className = "hw-translation-block__japanese";
    jp.setAttribute("lang", "ja");
    jp.textContent = item.japanese || "";
    content.appendChild(jp);

    const instruction = document.createElement("p");
    instruction.className = "hw-translation-block__instruction";
    instruction.textContent = "Translate into English";
    content.appendChild(instruction);

    const blankPart =
      (item.parts || []).find((p) => p.type === "blank") ||
      { type: "blank", name: item.id, wide: true };
    content.appendChild(
      renderBlankWithHint(
        { ...blankPart, multiline: false, wide: true },
        { omitAnswers: true, listenStyle: false, translationStyle: true }
      )
    );

    line.appendChild(content);
    return line;
  }

  function normalizeStarTokens(source) {
    if (Array.isArray(source?.tokens) && source.tokens.length) {
      return source.tokens
        .map((t) => ({
          text: String(t.text || "").trim(),
          fixed: !!t.fixed,
        }))
        .filter((t) => t.text);
    }
    const tokens = [];
    const prefix = String(source?.prefix || "").trim();
    const suffix = String(source?.suffix ?? "。").trim();
    const pieces = (source?.pieces || []).map((p) => String(p).trim()).filter(Boolean);
    if (prefix) tokens.push({ text: prefix, fixed: true });
    pieces.forEach((p) => tokens.push({ text: p, fixed: false }));
    if (suffix) tokens.push({ text: suffix, fixed: true });
    return tokens;
  }

  function draggablePiecesFromTokens(tokens) {
    return tokens.filter((t) => !t.fixed).map((t) => t.text);
  }

  /** Trailing 。 / . /！ /？ etc. — shrunk first in hybrid sentence fit. */
  function isStarPeriodText(text) {
    return /^[。．.！!？?]+$/.test(String(text || "").trim());
  }

  /**
   * Hybrid shrink-to-fit for star sentence rows (one line, no horizontal scroll).
   * Size ladders are discrete rem steps on --star-main-size / --star-period-size.
   * 1) Period-only: try up to 5 smaller period steps while main stays at base.
   * 2) If still overflowing: keep period at max shrink, step main down until fit or floor.
   */
  const STAR_MAIN_SIZES = [1.2, 1.1, 1.0, 0.92, 0.84, 0.76];
  const STAR_PERIOD_SIZES = [1.2, 1.05, 0.92, 0.8, 0.7, 0.6];
  const STAR_PERIOD_MAX_STEP = 5;

  function starSentenceOverflows(sentence) {
    return sentence.scrollWidth > sentence.clientWidth + 1;
  }

  function applyStarSentenceSizes(sentence, mainStep, periodStep) {
    const main = STAR_MAIN_SIZES[Math.min(Math.max(mainStep, 0), STAR_MAIN_SIZES.length - 1)];
    const period =
      STAR_PERIOD_SIZES[Math.min(Math.max(periodStep, 0), STAR_PERIOD_SIZES.length - 1)];
    sentence.style.setProperty("--star-main-size", main + "rem");
    sentence.style.setProperty("--star-period-size", period + "rem");
  }

  function fitStarSentence(sentence) {
    if (!sentence || !sentence.isConnected) return;
    if (sentence.clientWidth < 8) return;

    applyStarSentenceSizes(sentence, 0, 0);
    void sentence.offsetWidth;
    if (!starSentenceOverflows(sentence)) return;

    for (let p = 1; p <= STAR_PERIOD_MAX_STEP; p++) {
      applyStarSentenceSizes(sentence, 0, p);
      void sentence.offsetWidth;
      if (!starSentenceOverflows(sentence)) return;
    }

    for (let m = 1; m < STAR_MAIN_SIZES.length; m++) {
      applyStarSentenceSizes(sentence, m, STAR_PERIOD_MAX_STEP);
      void sentence.offsetWidth;
      if (!starSentenceOverflows(sentence)) return;
    }
  }

  function fitStarLine(line) {
    const sentence = line?.querySelector?.(".hw-star-block__sentence");
    if (sentence) fitStarSentence(sentence);
    const jp = line?.querySelector?.(".hw-translation-block__japanese");
    if (jp) fitJpPrompt(jp);
  }

  /**
   * Shrink-to-fit for translate card Japanese source lines (one line when possible).
   * Desktop (min-width 900px): always keep nowrap; modest font shrink, then horizontal scroll.
   * Mobile: same shrink ladder; if still overflowing at floor, allow wrap.
   */
  const JP_PROMPT_SIZES = [1.25, 1.15, 1.05, 0.95, 0.86, 0.78];
  const JP_PROMPT_DESKTOP_MQ = "(min-width: 900px)";

  function jpPromptOverflows(el) {
    return el.scrollWidth > el.clientWidth + 1;
  }

  function applyJpPromptSize(el, step) {
    const size = JP_PROMPT_SIZES[Math.min(Math.max(step, 0), JP_PROMPT_SIZES.length - 1)];
    el.style.setProperty("--jp-prompt-size", size + "rem");
  }

  function isJpPromptDesktop() {
    return typeof window.matchMedia === "function"
      ? window.matchMedia(JP_PROMPT_DESKTOP_MQ).matches
      : true;
  }

  function fitJpPrompt(el) {
    if (!el || !el.isConnected) return;
    if (el.classList.contains("hw-lookup-lexicon-playground__text")) return;
    if (el.clientWidth < 8) return;

    el.classList.remove("is-jp-prompt-wrap");
    applyJpPromptSize(el, 0);
    void el.offsetWidth;
    if (!jpPromptOverflows(el)) return;

    for (let s = 1; s < JP_PROMPT_SIZES.length; s++) {
      applyJpPromptSize(el, s);
      void el.offsetWidth;
      if (!jpPromptOverflows(el)) return;
    }

    if (isJpPromptDesktop()) return;
    el.classList.add("is-jp-prompt-wrap");
  }

  function scheduleFitStarLine(line) {
    if (!line) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitStarLine(line));
    });
  }

  function scheduleFitAllStarSentences(root) {
    const scope = root || document;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scope.querySelectorAll(".hw-star-block__sentence").forEach(fitStarSentence);
        scope.querySelectorAll(".hw-translation-block__japanese").forEach(fitJpPrompt);
      });
    });
  }

  function initStarSentenceFit(form) {
    if (!form || form.dataset.starFitBound === "true") return;
    form.dataset.starFitBound = "true";

    let resizeTimer = 0;
    let fitQueued = false;
    const queueFit = () => {
      if (fitQueued) return;
      fitQueued = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fitQueued = false;
          form.querySelectorAll(".hw-star-block__sentence").forEach(fitStarSentence);
          form.querySelectorAll(".hw-translation-block__japanese").forEach(fitJpPrompt);
        });
      });
    };

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(queueFit, 120);
    };
    window.addEventListener("resize", onResize);
    form.addEventListener("hw-worksheet-slide", queueFit);

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(queueFit);
      form
        .querySelectorAll(".hw-star-block__sentence, .hw-translation-block__japanese")
        .forEach((el) => {
          ro.observe(el);
        });
      form._starSentenceRo = ro;
    }

    queueFit();
  }

  function renderStarLine(item, lineOptions) {
    lineOptions = lineOptions || {};
    const line = document.createElement("div");
    line.className = "hw-worksheet__line hw-worksheet__line--star";
    line.dataset.itemId = item.id || "";

    const tokens = normalizeStarTokens(item);
    const pieces = draggablePiecesFromTokens(tokens);
    line.dataset.tokens = JSON.stringify(tokens);
    line.dataset.pieceCount = String(pieces.length);
    line.dataset.pieces = JSON.stringify(pieces);

    if (lineOptions.itemNum) appendLineNumber(line, lineOptions.itemNum);

    const content = document.createElement("div");
    content.className = "hw-worksheet__content";

    const starInstruction = String(lineOptions.starInstruction || "").trim();
    if (starInstruction) {
      const hint = document.createElement("p");
      hint.className = "hw-star-block__hint";
      hint.textContent = starInstruction;
      content.appendChild(hint);
    }

    const sentence = document.createElement("div");
    sentence.className = "hw-star-block__sentence";
    sentence.setAttribute("lang", "ja");

    let slotIndex = 0;
    tokens.forEach((token) => {
      if (token.fixed) {
        const fixed = document.createElement("span");
        fixed.className =
          "hw-star-block__fixed" +
          (isStarPeriodText(token.text) ? " hw-star-block__fixed--period" : "");
        fixed.textContent = token.text;
        sentence.appendChild(fixed);
        return;
      }
      const slot = document.createElement("span");
      slot.className = "hw-star-block__slot";
      slot.dataset.slotIndex = String(slotIndex);
      slot.setAttribute("aria-label", "Blank " + (slotIndex + 1));
      slotIndex += 1;
      sentence.appendChild(slot);
    });

    content.appendChild(sentence);

    const pool = document.createElement("div");
    pool.className = "hw-star-block__pool";
    pool.setAttribute("role", "list");
    pool.setAttribute("aria-label", "Sentence pieces");
    shufflePieces(pieces).forEach((piece) => {
      const origIndex = pieces.indexOf(piece);
      const colorNum = ((origIndex >= 0 ? origIndex : 0) % 4) + 1;
      const chip = document.createElement("div");
      chip.className = "hw-star-block__chip hw-star-block__chip--" + colorNum;
      chip.dataset.piece = piece;
      chip.dataset.color = String(colorNum);
      chip.textContent = piece;
      chip.draggable = true;
      chip.setAttribute("role", "button");
      chip.tabIndex = 0;
      chip.setAttribute("aria-label", "Drag " + piece + " into a slot");
      pool.appendChild(chip);
    });
    content.appendChild(pool);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn btn--ghost btn--sm hw-star-block__reset";
    resetBtn.textContent = "Reset answers";
    resetBtn.disabled = true;
    content.appendChild(resetBtn);

    line.appendChild(content);

    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.className = "hw-blank hw-star-block__answer";
    hidden.name = item.id || "star-" + lineOptions.itemNum;
    hidden.dataset.answer = JSON.stringify(pieces);
    line.appendChild(hidden);

    return line;
  }

  function renderLine(item, index, sectionMode, lineOptions) {
    lineOptions = lineOptions || {};
    const openBlock = item.openResponse || (sectionMode === "context-blank" && item.parts?.[0]?.multiline);
    const listenBlock = sectionMode === "audio-listening";
    const useBlockLayout = openBlock || listenBlock;
    const line = document.createElement(useBlockLayout ? "div" : "p");
    line.className =
      "hw-worksheet__line" +
      (item.negative ? " hw-worksheet__line--negative" : "") +
      (openBlock ? " hw-worksheet__line--open-response" : "") +
      (listenBlock ? " hw-worksheet__line--listen" : "");
    line.dataset.itemId = item.id || "";

    if (lineOptions.itemNum) {
      appendLineNumber(line, lineOptions.itemNum);
    }

    const content = document.createElement(useBlockLayout ? "div" : "span");
    content.className = "hw-worksheet__content";

    let listenCard = null;
    if (sectionMode === "audio-listening") {
      listenCard = document.createElement("div");
      listenCard.className = "hw-listen-card";
      const audioUrl = String(item.audioUrl || lineOptions.sectionAudioUrl || "").trim();
      const imageUrl = String(item.imageUrl || "").trim();
      const screenshot = renderListenScreenshot(imageUrl);
      if (screenshot) listenCard.appendChild(screenshot);
      listenCard.appendChild(renderAudioPlayer(audioUrl, { inline: true }));
      const listenInstruction = String(lineOptions.listenInstruction || "").trim();
      if (listenInstruction) {
        const head = document.createElement("div");
        head.className = "hw-listen-card__head";
        const hint = document.createElement("p");
        hint.className = "hw-listen-instruction";
        hint.textContent = listenInstruction;
        head.appendChild(hint);
        if (!lineOptions.authoring && !lineOptions.preview) {
          head.appendChild(
            renderRecordingTip(item.id || "listen-" + (lineOptions.itemNum || index + 1), {
              lines: LISTENING_TIP_LINES,
            })
          );
        }
        listenCard.appendChild(head);
      }
      content.appendChild(listenCard);
    }

    if (openBlock && item.topic) {
      const topicEl = document.createElement("p");
      topicEl.className = "hw-open-topic";
      topicEl.textContent = item.topic;
      content.appendChild(topicEl);
      content.dataset.topic = item.topic;
    }

    (item.parts || []).forEach((part) => {
      if (part.type === "text") {
        content.appendChild(renderTextPart(part));
      } else if (part.type === "blank") {
        const blankWrap = renderBlankWithHint(part, {
          omitAnswers: true,
          listenStyle: sectionMode === "audio-listening",
        });
        if (sectionMode === "grammar-blank") {
          const field = blankWrap.querySelector(".hw-blank");
          if (field) field.after(renderGrammarPills(item));
        }
        (listenCard || content).appendChild(blankWrap);
      } else if (part.type === "hint") {
        /* legacy: hint after blank in JSON — attach below previous blank if possible */
        const wraps = content.querySelectorAll(".hw-blank-wrap");
        const lastWrap = wraps[wraps.length - 1];
        if (lastWrap && !lastWrap.querySelector(".hw-conj-hint--below")) {
          lastWrap.appendChild(renderHintBelow({ dictionary: part.dictionary, conjugation: part.conjugation }));
        }
      }
    });

    if (item.question) {
      content.appendChild(renderQuestionBadge());
    }

    line.appendChild(content);

    return line;
  }

  function renderSection(form, section, interactive, authoring, renderOptions) {
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

    wrap.appendChild(head);

    const sectionIntro =
      section.mode === "star-order"
        ? "Drag/drop the words to form the best answer!"
        : String(section.instructions || "").trim() ||
          (section.mode === "audio-listening"
            ? "Listen to the clip and write down what you think it's saying in Japanese."
            : "");
    /* Listen + star: instruction lives inside the question card (not above it). */
    if (
      sectionIntro &&
      (authoring || (section.mode !== "audio-listening" && section.mode !== "star-order"))
    ) {
      const intro = document.createElement("p");
      intro.className = "hw-worksheet__section-intro";
      intro.textContent = sectionIntro;
      wrap.appendChild(intro);
    }

    const sectionAudioUrl =
      section.mode === "audio-listening" ? String(section.audioUrl || "").trim() : "";
    const listenInstruction =
      !authoring && section.mode === "audio-listening" ? sectionIntro : "";
    const starInstruction =
      !authoring && section.mode === "star-order" ? sectionIntro : "";

    (section.items || []).forEach((item, i) => {
      const itemCounter = renderOptions.itemCounter;
      if (itemCounter) itemCounter.value += 1;
      const itemNum = itemCounter ? itemCounter.value : i + 1;
      const lineOpts = {
        sectionAudioUrl,
        itemNum,
        listenInstruction,
        starInstruction,
        authoring,
        preview: renderOptions.preview,
      };

      if (section.mode === "video-response") {
        if (authoring) wrap.appendChild(renderAuthorVideoItem(item, i, lineOpts));
        else wrap.appendChild(renderVideoRecordCue(item, i, { ...renderOptions, ...lineOpts }));
        return;
      }
      if (section.mode === "audio-prompt") {
        if (authoring) wrap.appendChild(renderAuthorAudioItem(item, i, lineOpts));
        else wrap.appendChild(renderAudioRecordCue(item, i, { ...renderOptions, ...lineOpts }));
        return;
      }
      if (section.mode === "audio-mimic") {
        wrap.appendChild(renderAudioMimicCue(item, i, { ...renderOptions, ...lineOpts }));
        return;
      }
      if (section.mode === "translation") {
        wrap.appendChild(renderTranslationLine(item, lineOpts));
        return;
      }
      if (section.mode === "star-order") {
        wrap.appendChild(renderStarLine(item, lineOpts));
        return;
      }
      if (authoring) {
        wrap.appendChild(renderAuthorLine(item, i, section.mode, lineOpts));
      } else {
        wrap.appendChild(renderLine(item, i, section.mode, lineOpts));
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
        /* per-item past / register / tense — no section-level tense switch */
      }
      if (section.mode === "video-response") {
        secEl.querySelectorAll(".hw-worksheet__line--video").forEach((lineEl, index) => {
          const prompt = lineEl.querySelector("[data-video-prompt]")?.value?.trim();
          if (!prompt) return;
          section.items.push({
            id: lineEl.dataset.itemId || "vid-" + (index + 1),
            prompt,
            recordLabel: "Record your answer",
          });
        });
        assignment.sections.push(section);
        return;
      }
      if (section.mode === "audio-prompt") {
        secEl.querySelectorAll(".hw-worksheet__line--audio-prompt").forEach((lineEl, ai) => {
          const prompt = lineEl.querySelector("[data-audio-prompt]")?.value?.trim();
          if (!prompt) return;
          section.items.push({
            id: lineEl.dataset.itemId || "aud-" + (ai + 1),
            prompt,
            recordLabel: "Record your answer",
          });
        });
        assignment.sections.push(section);
        return;
      }

      secEl.querySelectorAll(".hw-worksheet__line").forEach((lineEl, index) => {
        if (lineEl.classList.contains("hw-worksheet__line--video")) return;
        const item = { id: lineEl.dataset.itemId || "item-" + (index + 1), parts: [] };
        if (section.mode === "audio-listening") {
          const audioUrl = lineEl.querySelector("[data-item-audio-url]")?.value?.trim();
          if (audioUrl) item.audioUrl = audioUrl;
          const imageUrl = lineEl.querySelector("[data-item-image-url]")?.value?.trim();
          if (imageUrl) item.imageUrl = imageUrl;
          const englishAnswer = lineEl.querySelector("[data-item-english-answer]")?.value?.trim();
          if (englishAnswer) item.englishAnswer = englishAnswer;
        }
        if (lineEl.querySelector(".hw-author-negative")?.checked) {
          item.negative = true;
        }
        const activeRegister = lineEl.querySelector(".hw-author-register__opt.is-active")?.dataset
          .register;
        if (activeRegister === "polite") item.register = "polite";
        if (lineEl.querySelector(".hw-author-question")?.checked) {
          item.question = true;
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
              content.querySelector('[data-hint-tense="' + name + '"]')?.value.trim() ||
              DEFAULT_HINT_TENSE;
            if (dict && section.mode === "grammar-blank") {
              part.hint = { dictionary: dict, conjugation: conj };
            }
            item.parts.push(part);
          }
        });

        if (item.parts.length) section.items.push(item);
      });

      if (section.mode === "audio-listening" && section.items[0]?.audioUrl) {
        section.audioUrl = section.items[0].audioUrl;
      }

      assignment.sections.push(section);
    });

    enrichGrammarVariants(assignment);
    return assignment;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * @param {object} assignment
   * @returns {HTMLElement|null}
   */
  function renderTopicBrief(assignment) {
    const explanation = String(assignment?.topicExplanation || "").trim();
    const videos = (Array.isArray(assignment?.topicVideos) ? assignment.topicVideos : [])
      .map((url) => String(url || "").trim())
      .filter((url) => url && /youtube\.com|youtu\.be/i.test(url));
    if (!explanation && !videos.length) return null;

    const wrap = document.createElement("details");
    wrap.className = "hw-worksheet__topic-brief";

    const summary = document.createElement("summary");
    summary.className = "hw-worksheet__topic-brief-summary";

    const heading = document.createElement("span");
    heading.className = "hw-worksheet__topic-brief-title";
    heading.textContent = "Grammar description";

    summary.appendChild(heading);
    wrap.appendChild(summary);

    const body = document.createElement("div");
    body.className = "hw-worksheet__topic-brief-body";

    if (explanation) {
      const p = document.createElement("p");
      p.className = "hw-worksheet__topic-explanation";
      p.textContent = explanation;
      body.appendChild(p);
    }

    if (videos.length) {
      const list = document.createElement("ul");
      list.className = "hw-worksheet__topic-videos";
      videos.forEach((url, index) => {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.className = "hw-worksheet__topic-video-link";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent =
          videos.length > 1 ? "YouTube link " + (index + 1) : "YouTube link";
        li.appendChild(link);
        list.appendChild(li);
      });
      body.appendChild(list);
    } else if (explanation) {
      const soon = document.createElement("p");
      soon.className = "hw-worksheet__topic-video-soon";
      soon.textContent = "Video explanation — coming soon";
      body.appendChild(soon);
    }

    wrap.appendChild(body);
    return wrap;
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
    const prepared = enrichAssignmentMedia(JSON.parse(JSON.stringify(assignment || { sections: [] })));
    if (!options.preview && !authoring) {
      options = { ...options, assignment: prepared };
    }
    mount.innerHTML = "";

    const form = document.createElement("form");
    form.id = "hw-worksheet-form";
    form.className = "hw-worksheet" + (authoring ? " hw-worksheet--authoring" : "");
    if (options.preview) form.classList.add("hw-worksheet--hide-line-nums");
    form.lang = "ja";
    form.setAttribute("data-assignment-id", prepared.id || "");
    form.dataset.title = prepared.title || "";
    form.dataset.youtubeUrl = prepared.youtubeUrl || "";

    const meta = document.createElement("div");
    meta.className = "hw-worksheet__meta";
    const metaTop = document.createElement("div");
    metaTop.className = "hw-worksheet__meta-top";

    const interactive = false;

    const metaText = document.createElement("div");
    metaText.className = "hw-worksheet__meta-text";
    const omitMetaTitle = Boolean(options.omitMetaTitle);
    const omitMetaHint = Boolean(options.omitMetaHint);
    let metaInner = "";
    if (!omitMetaTitle) {
      metaInner +=
        '<p class="hw-worksheet__meta-title">' +
        escapeHtml(prepared.title || "Homework") +
        "</p>";
    }
    if (authoring) {
      metaInner +=
        '<p class="hw-worksheet__meta-hint">Teacher preview — use the block builder to edit layout.</p>';
    } else if (!omitMetaHint) {
      metaInner +=
        '<p class="hw-worksheet__meta-hint">Fill in each blank, then submit. For video prompts, record and save each clip (or send homework — unsaved clips upload automatically). JD will review your work.</p>';
    }
    if (metaInner) {
      metaText.innerHTML = metaInner;
      metaTop.appendChild(metaText);
      meta.appendChild(metaTop);
    }

    const topicBrief = renderTopicBrief(prepared);
    if (topicBrief) meta.appendChild(topicBrief);

    if (omitMetaTitle) form.dataset.omitMetaTitle = "1";
    if (omitMetaHint) form.dataset.omitMetaHint = "1";
    if (omitMetaTitle && omitMetaHint) form.classList.add("hw-worksheet--hub-chromeless");

    if (meta.childElementCount) form.appendChild(meta);

    const itemCounter = { value: 0 };
    (prepared.sections || []).forEach((section) => {
      form.appendChild(
        renderSection(form, section, interactive, authoring, { ...options, itemCounter })
      );
    });


    const actions = document.createElement("div");
    actions.className = "hw-worksheet__actions";
    if (!authoring) {
      actions.innerHTML =
        (options.preview
          ? ""
          : '<section class="hw-worksheet__actions-primary">' +
            '<p class="hw-worksheet__submit-tracker" data-hw-submit-tracker aria-live="polite"></p>' +
            '<div class="hw-worksheet__actions-submit">' +
            '<button type="submit" class="btn btn--primary" disabled>Send Homework to JD</button>' +
            "</div>" +
            '<p class="hw-worksheet__status hw-worksheet__status--inline" id="hw-save-status" role="status" aria-live="polite"></p>' +
            "</section>") +
        '<section class="hw-worksheet__actions-tools" aria-label="Worksheet tools"></section>';
      form.appendChild(actions);
    }

    const results = document.createElement("div");
    results.id = "hw-check-results";
    results.className = "hw-check-results";
    results.hidden = true;
    form.appendChild(results);

    mount.appendChild(form);

    if (!authoring && !options.preview) {
      initSlideMode(form);
      if (!options.readOnly) {
        initFocusMode(form);
        initSeeAnswers(form);
        initSubmitGate(form);
      }
    }
    if (!authoring && global.HwStarBlock?.initForm) {
      global.HwStarBlock.initForm(form);
    }
    if (!authoring) {
      initStarSentenceFit(form);
    }

    if (options.readOnly) {
      setFormReadOnly(form);
    }

    return form;
  }

  function setFormReadOnly(form) {
    if (!form) return;
    form.classList.add("hw-worksheet--readonly");
    form.dataset.hwReadOnly = "true";
    form.querySelectorAll("input.hw-blank, textarea.hw-blank").forEach((el) => {
      el.readOnly = true;
      el.setAttribute("aria-readonly", "true");
    });
    form.querySelectorAll(
      "button:not([data-hw-print]):not(.hw-worksheet__slide-btn):not(.hw-focus-mode__exit)"
    ).forEach((btn) => {
      if (btn.closest(".hw-worksheet__actions-tools")) {
        btn.hidden = true;
        return;
      }
      if (
        btn.type === "submit" ||
        btn.hasAttribute("data-hw-photo-take") ||
        btn.hasAttribute("data-hw-photo-choose") ||
        btn.closest(".hw-video-inline") ||
        btn.closest(".hw-audio-inline") ||
        btn.closest(".hw-star-block")
      ) {
        btn.disabled = true;
        btn.hidden = true;
      }
    });
    form.querySelectorAll(".hw-worksheet__actions-primary").forEach((el) => {
      el.hidden = true;
    });
    form.querySelectorAll(".hw-star-block--replay").forEach((line) => {
      const pool = line.querySelector(".hw-star-block__pool");
      const reset = line.querySelector(".hw-star-block__reset");
      if (pool) {
        pool.hidden = true;
        pool.style.pointerEvents = "none";
      }
      if (reset) reset.hidden = true;
      const zone = line.querySelector(".hw-star-block__answer-zone");
      if (zone) {
        zone.removeAttribute("aria-hidden");
        zone.style.pointerEvents = "none";
        zone.style.opacity = "1";
      }
      line.querySelectorAll(".hw-star-block__slot").forEach((slot) => {
        slot.draggable = false;
        slot.querySelector(".hw-star-block__slot-clear")?.remove();
      });
    });
    form.querySelectorAll(".hw-star-block__pool, .hw-star-block__answer-zone").forEach((el) => {
      if (el.closest(".hw-star-block--replay")) return;
      el.setAttribute("aria-hidden", "true");
      el.style.pointerEvents = "none";
      el.style.opacity = "0.45";
    });
  }

  function applyAnswersMap(form, answersMap) {
    if (!form || !answersMap) return;
    form.querySelectorAll("input.hw-blank, textarea.hw-blank").forEach((inp) => {
      if (inp.name && answersMap[inp.name] != null) {
        inp.value = String(answersMap[inp.name]);
      }
    });
    if (global.HwWorksheet?.updateSubmitButtonState) {
      global.HwWorksheet.updateSubmitButtonState(form);
    }
  }

  /** Replay stored submission rows onto a rendered worksheet (read-only). */
  function applySubmissionAnswers(form, submission) {
    if (!form || !submission) return;

    function isMediaStatusText(text) {
      return /^(video|audio) submitted$/i.test(String(text || "").trim());
    }

    function applyReplayNote(lineEl, row) {
      if (!row?.student || isMediaStatusText(row.student)) return;
      const text = row.student === "(blank)" ? "" : String(row.student);
      if (!text) return;
      let note = lineEl.querySelector(".hw-submission-replay-note");
      if (!note) {
        note = document.createElement("p");
        note.className = "hw-submission-replay-note";
        lineEl.appendChild(note);
      }
      note.textContent = text;
    }

    function applyMediaReplay(lineEl, row) {
      lineEl.querySelector(".hw-submission-replay-note")?.remove();
      clearAudioAnswerReplay(lineEl);
      clearVideoAnswerReplay(lineEl);
      const mediaId = String(row?.mediaId || "").trim();
      const recorder =
        lineEl.querySelector(".hw-video-prompt__recorder") ||
        lineEl.querySelector(".hw-audio-prompt__recorder") ||
        lineEl.querySelector(".hw-audio-mimic__recorder");
      if (!mediaId) {
        applyReplayNote(lineEl, row);
        return;
      }

      const url = global.HwVideoInline?.mediaUrl
        ? global.HwVideoInline.mediaUrl(mediaId)
        : "/api/hw-m/" + encodeURIComponent(mediaId);
      const declared =
        row.mediaKind === "audio" ? "audio" : row.mediaKind === "video" ? "video" : "";
      const isVideoLine = lineEl.classList.contains("hw-worksheet__line--video");

      function mountKind(kind) {
        if (kind === "audio") {
          setAudioAnswerReplay(lineEl, url, { ariaLabel: "Student's recorded answer" });
          if (isVideoLine) {
            let note = lineEl.querySelector(".hw-video-audio-reply-note");
            if (!note) {
              note = document.createElement("p");
              note.className = "hw-video-audio-reply-note";
              const slot = lineEl.querySelector(".hw-listen-replay-slot");
              if (slot) slot.insertAdjacentElement("beforebegin", note);
              else lineEl.appendChild(note);
            }
            note.textContent = "Student answered with audio (no camera video on this clip).";
          }
        } else {
          lineEl.querySelector(".hw-video-audio-reply-note")?.remove();
          setVideoAnswerReplay(lineEl, url, { ariaLabel: "Student's recorded answer" });
        }
        if (recorder) recorder.hidden = true;
      }

      /* Prefer real Content-Type — mediaKind can disagree with the stored blob. */
      fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, cache: "no-store" })
        .then((res) => {
          const ct = String(res.headers.get("content-type") || "").toLowerCase();
          if (ct.startsWith("video/")) return "video";
          if (ct.startsWith("audio/")) return "audio";
          return declared || (isVideoLine ? "video" : "audio");
        })
        .catch(() => declared || (isVideoLine ? "video" : "audio"))
        .then((kind) => mountKind(kind));
    }

    const ordered =
      Array.isArray(submission.answers) && submission.answers.length ? submission.answers : null;

    if (ordered) {
      let rowIdx = 0;
      form.querySelectorAll(".hw-worksheet__section").forEach((secEl) => {
        const mode = secEl.dataset.mode || "";

        if (mode === "video-response") {
          secEl.querySelectorAll(".hw-worksheet__line--video").forEach((lineEl) => {
            applyMediaReplay(lineEl, ordered[rowIdx++]);
          });
          return;
        }

        if (mode === "audio-prompt") {
          secEl.querySelectorAll(".hw-worksheet__line--audio-prompt").forEach((lineEl) => {
            applyMediaReplay(lineEl, ordered[rowIdx++]);
          });
          return;
        }

        if (mode === "audio-mimic") {
          secEl.querySelectorAll(".hw-worksheet__line--audio-mimic").forEach((lineEl) => {
            applyMediaReplay(lineEl, ordered[rowIdx++]);
          });
          return;
        }

        secEl.querySelectorAll(".hw-worksheet__line").forEach((lineEl) => {
          const row = ordered[rowIdx++];
          if (!row) return;
          if (mode === "star-order") {
            if (global.HwStarBlock?.restoreLineFromSubmission) {
              global.HwStarBlock.restoreLineFromSubmission(lineEl, row);
            } else {
              applyReplayNote(lineEl, row);
            }
            return;
          }
          const input = lineEl.querySelector(STUDENT_BLANK_SELECTOR);
          if (input && row.student != null) {
            input.value = row.student === "(blank)" ? "" : String(row.student);
          }
        });
      });
      return;
    }

    const rows = [
      ...(submission.section1 || []),
      ...(submission.section2 || []),
      ...(submission.listening || []),
    ];
    let rowIdx = 0;

    form.querySelectorAll(".hw-worksheet__section").forEach((secEl) => {
      const mode = secEl.dataset.mode || "";

      if (mode === "video-response" || mode === "audio-prompt" || mode === "audio-mimic") {
        const selector =
          mode === "video-response"
            ? ".hw-worksheet__line--video"
            : mode === "audio-mimic"
              ? ".hw-worksheet__line--audio-mimic"
              : ".hw-worksheet__line--audio-prompt";
        secEl.querySelectorAll(selector).forEach((lineEl) => {
          applyMediaReplay(lineEl, rows[rowIdx++]);
        });
        return;
      }

      secEl.querySelectorAll("input.hw-blank, textarea.hw-blank").forEach((el) => {
        if (
          !el.name ||
          el.hasAttribute("data-section-audio-url") ||
          el.hasAttribute("data-item-audio-url") ||
          el.hasAttribute("data-item-image-url") ||
          el.hasAttribute("data-item-english-answer") ||
          el.hasAttribute("data-video-prompt") ||
          el.hasAttribute("data-audio-prompt") ||
          el.classList.contains("hw-star-block__answer")
        ) {
          return;
        }
        const row = rows[rowIdx++];
        if (row?.student != null) {
          el.value = row.student === "(blank)" ? "" : String(row.student);
        }
      });
    });
  }

  function hasListenTeacherAnswers(form) {
    return Boolean(
      form?.querySelector(".hw-blank-wrap--listen[data-teacher-answer]")
    );
  }

  function isSeeAnswersUnlocked(form) {
    return form?.dataset?.hwSeeAnswersUnlocked === "true";
  }

  function hideTeacherAnswers(form) {
    if (!form) return;
    form.querySelectorAll(".hw-worksheet__teacher-answer").forEach((el) => el.remove());
    const btn = form.querySelector("[data-hw-see-answers]");
    if (btn) {
      btn.textContent = "See Answers";
      btn.setAttribute("aria-pressed", "false");
      btn.disabled = !isSeeAnswersUnlocked(form);
    }
  }

  function revealTeacherAnswers(form) {
    if (!form || !isSeeAnswersUnlocked(form)) return;
    form.querySelectorAll(".hw-blank-wrap--listen[data-teacher-answer]").forEach((wrap) => {
      if (wrap.querySelector(".hw-worksheet__teacher-answer")) return;
      const answer = String(wrap.dataset.teacherAnswer || "").trim();
      if (!answer) return;
      const el = document.createElement("p");
      el.className = "hw-worksheet__teacher-answer";
      el.setAttribute("lang", "ja");
      if (hasBracketRubyNotation(answer)) {
        el.appendChild(renderBracketRubyText(answer));
      } else {
        el.textContent = answer;
      }
      wrap.appendChild(el);
    });
    const btn = form.querySelector("[data-hw-see-answers]");
    if (btn) {
      btn.textContent = "Hide Answers";
      btn.setAttribute("aria-pressed", "true");
      btn.disabled = false;
    }
  }

  function toggleTeacherAnswers(form) {
    const btn = form?.querySelector("[data-hw-see-answers]");
    if (!btn || btn.disabled || !isSeeAnswersUnlocked(form)) return;
    if (btn.getAttribute("aria-pressed") === "true") hideTeacherAnswers(form);
    else revealTeacherAnswers(form);
  }

  function enableSeeAnswers(form) {
    if (!form) return;
    form.dataset.hwSeeAnswersUnlocked = "true";
    const btn = form?.querySelector("[data-hw-see-answers]");
    if (!btn) return;
    btn.hidden = false;
    btn.disabled = false;
    global.HwStudentToolbar?.sync?.(form);
  }

  function disableSeeAnswers(form) {
    if (!form) return;
    delete form.dataset.hwSeeAnswersUnlocked;
    const btn = form?.querySelector("[data-hw-see-answers]");
    if (!btn) return;
    hideTeacherAnswers(form);
    btn.hidden = true;
    btn.disabled = true;
    global.HwStudentToolbar?.sync?.(form);
  }

  /**
   * @param {HTMLFormElement} form
   */
  function initSeeAnswers(form) {
    if (!hasListenTeacherAnswers(form)) return;
    const actions = form.querySelector(".hw-worksheet__actions");
    if (!actions || actions.querySelector("[data-hw-see-answers]")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--ghost";
    btn.setAttribute("data-hw-see-answers", "");
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = "See Answers";
    btn.hidden = true;
    btn.disabled = true;
    btn.addEventListener("click", () => toggleTeacherAnswers(form));

    const tools = actions.querySelector(".hw-worksheet__actions-tools");
    const submitBtn = actions.querySelector('button[type="submit"]');
    if (tools) {
      tools.appendChild(btn);
    } else if (submitBtn) {
      actions.insertBefore(btn, submitBtn);
    } else {
      actions.appendChild(btn);
    }
  }

  function hasMeaningfulStudentAnswer(value) {
    return String(value ?? "").trim().length > 0;
  }

  function questionsLeftLabel(form) {
    const total = totalQuestions(form);
    if (!total) return "";
    const left = Math.max(0, total - countAnsweredQuestions(form));
    if (left === 0) return "Ready to send";
    return left === 1 ? "1 question left" : left + " questions left";
  }

  /** Card shell inside a worksheet line (listen / video / audio / slide content). */
  function questionCardHost(line) {
    if (!line || !line.querySelector) return null;
    return (
      line.querySelector(".hw-listen-card") ||
      line.querySelector(".hw-video-prompt") ||
      line.querySelector(".hw-audio-prompt") ||
      line.querySelector(".hw-audio-mimic") ||
      line.querySelector(".hw-worksheet__content") ||
      null
    );
  }

  /**
   * Park the shared questions-left tracker near the top of the active question card
   * (e.g. .hw-listen-card with the anime still), never in the sticky grammar head.
   * @param {HTMLFormElement} form
   * @param {Element|null} line
   */
  function placeSubmitTrackerInCard(form, line) {
    const tracker = form?.querySelector("[data-hw-submit-tracker]");
    if (!tracker) return;

    const activeLine =
      line ||
      form.querySelector(".hw-worksheet--slide-mode .hw-worksheet__line:not([hidden])") ||
      form.querySelector(".hw-worksheet__line:not([hidden])");

    const host = questionCardHost(activeLine);
    tracker.classList.add("hw-worksheet__submit-tracker--in-card");
    tracker.classList.remove("hw-worksheet__submit-tracker--slide-head");

    if (host) {
      host.insertBefore(tracker, host.firstChild);
      return;
    }
    if (activeLine) activeLine.insertBefore(tracker, activeLine.firstChild);
  }

  function updateSubmitButtonState(form) {
    const submitBtn = form?.querySelector('.hw-worksheet__actions-submit button[type="submit"]');
    const tracker = form?.querySelector("[data-hw-submit-tracker]");
    const total = totalQuestions(form);
    const answered = countAnsweredQuestions(form);
    const left = Math.max(0, total - answered);
    const complete = total > 0 && left === 0;

    if (tracker) {
      if (!total) {
        tracker.hidden = true;
        tracker.textContent = "";
      } else {
        tracker.hidden = false;
        tracker.textContent = questionsLeftLabel(form);
        tracker.classList.toggle("hw-worksheet__submit-tracker--ready", complete);
      }
    }

    if (!submitBtn) return;
    submitBtn.disabled = !complete;
    if (!complete && total > 0) {
      submitBtn.title = questionsLeftLabel(form) + ".";
    } else {
      submitBtn.removeAttribute("title");
    }
    global.HwStudentToolbar?.sync?.(form);
  }

  function initSubmitGate(form) {
    updateSubmitButtonState(form);
    const refresh = () => updateSubmitButtonState(form);
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    form.addEventListener("hw-worksheet-answer", refresh);
  }

  function isWorksheetComplete(form) {
    const total = totalQuestions(form);
    if (!total) return false;
    return countAnsweredQuestions(form) >= total;
  }

  /**
   * One-question-at-a-time view for students (default). Toggle to see full worksheet.
   * @param {HTMLFormElement} form
   */
  function initSlideMode(form) {
    const lines = Array.from(form.querySelectorAll(".hw-worksheet__line"));
    if (lines.length <= 1) return;

    let current = 0;
    let seeAll = false;

    const nav = document.createElement("div");
    nav.className = "hw-worksheet__slide-nav";
    nav.setAttribute("role", "navigation");
    nav.setAttribute("aria-label", "Homework question navigation");

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "hw-worksheet__slide-btn";
    prevBtn.setAttribute("aria-label", "Previous question");
    prevBtn.textContent = "←";

    const counter = document.createElement("p");
    counter.className = "hw-worksheet__slide-counter";
    counter.setAttribute("aria-live", "polite");

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "hw-worksheet__slide-btn";
    nextBtn.setAttribute("aria-label", "Next question");
    nextBtn.textContent = "→";

    nav.append(prevBtn, counter, nextBtn);

    const navRow = document.createElement("div");
    navRow.className = "hw-worksheet__slide-nav-row";
    navRow.appendChild(nav);

    const firstSection = form.querySelector(".hw-worksheet__section");
    const insertBefore = firstSection || form.querySelector(".hw-worksheet__actions");
    const brief = form.querySelector(".hw-worksheet__topic-brief");
    const stickyHead = document.createElement("div");
    stickyHead.className = "hw-worksheet__slide-sticky-head";
    stickyHead.appendChild(navRow);
    if (brief) {
      brief.classList.add("hw-worksheet__topic-brief--slide");
      stickyHead.appendChild(brief);
    }
    form.insertBefore(stickyHead, insertBefore);

    form.classList.add("hw-worksheet--slide-mode", "hw-worksheet--hide-line-nums");

    const hint = form.querySelector(".hw-worksheet__meta-hint");
    if (hint && !form.dataset.omitMetaHint) {
      hint.textContent = "One question at a time — use the arrows above to move.";
    }

    function applySlideView() {
      if (seeAll) {
        form.classList.remove("hw-worksheet--slide-mode");
        nav.hidden = true;
        form.querySelectorAll(".hw-worksheet__section").forEach((sec) => {
          sec.hidden = false;
        });
        lines.forEach((line) => {
          line.hidden = false;
        });
        placeSubmitTrackerInCard(form, null);
        return;
      }

      form.classList.add("hw-worksheet--slide-mode");
      nav.hidden = false;
      counter.textContent = current + 1 + " of " + lines.length;

      prevBtn.disabled = current <= 0;
      nextBtn.disabled = current >= lines.length - 1;

      form.querySelectorAll(".hw-worksheet__section").forEach((sec) => {
        let sectionVisible = false;
        sec.querySelectorAll(".hw-worksheet__line").forEach((line) => {
          const show = lines[current] === line;
          line.hidden = !show;
          if (show) sectionVisible = true;
        });
        sec.hidden = !sectionVisible;
      });
      placeSubmitTrackerInCard(form, lines[current]);
    }

    function notifySlideChange() {
      form._hwSlideIndex = current;
      form._hwSlideCount = lines.length;
      form.dispatchEvent(
        new CustomEvent("hw-worksheet-slide", {
          bubbles: true,
          detail: { index: current, total: lines.length, seeAll },
        })
      );
    }

    function goTo(index) {
      current = Math.max(0, Math.min(index, lines.length - 1));
      applySlideView();
      notifySlideChange();
    }

    prevBtn.addEventListener("click", () => goTo(current - 1));
    nextBtn.addEventListener("click", () => goTo(current + 1));

    form.addEventListener("keydown", (e) => {
      if (seeAll || e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(current - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(current + 1);
      }
    });

    form._hwGoToSlide = goTo;
    form._hwPlaceSubmitTracker = () => placeSubmitTrackerInCard(form, lines[current]);

    applySlideView();
    notifySlideChange();
    /* Re-place after later inits (star/focus) so tracker isn't left in the sticky head. */
    queueMicrotask(() => placeSubmitTrackerInCard(form, lines[current]));
    requestAnimationFrame(() => placeSubmitTrackerInCard(form, lines[current]));
  }

  function getSlideIndex(form) {
    if (!form || typeof form._hwSlideIndex !== "number") return 0;
    return form._hwSlideIndex;
  }

  function setSlideIndex(form, index) {
    if (!form || typeof form._hwGoToSlide !== "function") return false;
    form._hwGoToSlide(Number(index) || 0);
    return true;
  }

  /**
   * @returns {void}
   */
  function exitHomeworkFocusMode() {
    const section =
      document.getElementById("hw-worksheet-section") ||
      document.getElementById("hw-hub-v4-homework") ||
      document.getElementById("hw-v5-homework-zone") ||
      document.querySelector(".hw-hub-v4-homework");
    global.HwWorksheetToolLayout?.beginFocusToolSwitch?.();
    document.body.classList.remove("hw-hw-focus-mode");
    document.querySelectorAll(".hw-focus-bar").forEach((bar) => {
      bar.hidden = true;
      bar.setAttribute("hidden", "");
    });
    section?.querySelector("[data-hw-focus]")?.removeAttribute("hidden");
    const exitFs = global.HwCompat?.exitFullscreen || (() => document.exitFullscreen?.());
    if (global.HwCompat?.getFullscreenElement?.() || document.fullscreenElement) {
      Promise.resolve(exitFs()).catch(() => {});
    }
    global.HwWorksheetToolLayout?.onFocusModeChange?.();
  }

  /**
   * Distraction-free fullscreen view — dark theater background, centered worksheet page.
   * @param {HTMLFormElement} form
   */
  function initFocusMode(form) {
    const section = form.closest(
      "#hw-worksheet-section, #hw-hub-v4-homework, #hw-v5-homework-zone, .hw-hub-v4-homework"
    );
    if (!section) return;

    const focusBtn = document.createElement("button");
    focusBtn.type = "button";
    focusBtn.className = "btn btn--ghost hw-worksheet__focus-btn";
    focusBtn.setAttribute("data-hw-focus", "");
    focusBtn.textContent = "Focus mode";

    const tools = form.querySelector(".hw-worksheet__actions-tools");
    const actions = form.querySelector(".hw-worksheet__actions");
    if (tools) {
      tools.insertBefore(focusBtn, tools.firstChild);
    } else if (actions) {
      actions.insertBefore(focusBtn, actions.firstChild);
    }

    const focusBar = document.createElement("div");
    focusBar.className = "hw-focus-bar";
    focusBar.hidden = true;
    focusBar.innerHTML =
      '<button type="button" class="hw-focus-bar__exit">Exit focus</button>' +
      '<span class="hw-focus-bar__title"></span>';
    section.querySelector(".hw-focus-bar")?.remove();
    section.insertBefore(focusBar, section.firstChild);

    const titleEl = focusBar.querySelector(".hw-focus-bar__title");
    const exitBtn = focusBar.querySelector(".hw-focus-bar__exit");

    function updateTitle() {
      const activeForm = section.querySelector("#hw-worksheet-form");
      const title =
        activeForm?.querySelector(".hw-worksheet__meta-title")?.textContent?.trim() || "Homework";
      titleEl.textContent = title;
    }

    async function enterFocus() {
      if (document.body.classList.contains("hw-hw-focus-mode")) return;
      updateTitle();
      global.HwWorksheetToolLayout?.beginFocusToolSwitch?.();
      document.body.classList.add("hw-hw-focus-mode");
      focusBar.hidden = false;
      focusBtn.hidden = true;
      section.scrollTop = 0;
      /*
       * Fullscreen the document (not the homework section) so the HW box /
       * Glass / Cloud / toolbar stay put. CSS turns the page background black.
       * Skip fullscreen when designFocus is on so Cursor design mode can run
       * (same Focus look/scale, no browser fullscreen takeover).
       */
      const skipFs = global.HwFeatureFlags?.designFocus?.() === true;
      if (!skipFs) {
        const reqFs =
          global.HwCompat?.requestFullscreen ||
          ((el) => el.requestFullscreen?.() || document.documentElement.requestFullscreen());
        try {
          await reqFs(document.documentElement);
        } catch (_) {
          /* Black-background focus still works when fullscreen is blocked. */
        }
      }
      global.HwWorksheetToolLayout?.onFocusModeChange?.();
    }

    focusBtn.addEventListener("click", () => enterFocus());
    exitBtn.addEventListener("click", () => exitHomeworkFocusMode());

    if (!section.dataset.hwFocusBound) {
      section.dataset.hwFocusBound = "1";
      const onFsChange = () => {
        const fsEl = global.HwCompat?.getFullscreenElement?.() || document.fullscreenElement;
        if (!fsEl && document.body.classList.contains("hw-hw-focus-mode")) {
          exitHomeworkFocusMode();
        }
      };
      if (global.HwCompat?.bindFullscreenChange) {
        global.HwCompat.bindFullscreenChange(onFsChange);
      } else {
        document.addEventListener("fullscreenchange", onFsChange);
      }
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || !document.body.classList.contains("hw-hw-focus-mode")) return;
        e.preventDefault();
        exitHomeworkFocusMode();
      });
    }
  }

  /**
   * Print empty worksheet — blanks cleared, compact one-page layout via CSS.
   * @param {HTMLFormElement} [formEl]
   * @returns {boolean}
   */
  function printBlank(formEl) {
    const form = formEl || document.getElementById("hw-worksheet-form");
    if (!form) return false;

    form.querySelectorAll(".hw-worksheet__topic-brief").forEach((el) => {
      el.open = true;
    });

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
    clone.querySelectorAll(
      ".hw-negative-badge, .hw-question-badge, .hw-register-badge, .hw-tense-badge, .hw-line-pills, .hw-listen-instruction, .hw-translation-block__instruction, .hw-recording-tip"
    ).forEach((el) => el.remove());
    clone.querySelectorAll(".ja-reading").forEach((el) => {
      el.replaceWith(document.createTextNode(el.textContent || ""));
    });
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

    const videoPrompts = [];
    const audioPrompts = [];
    const listening = [];

    form.querySelectorAll(".hw-worksheet__section").forEach((secEl) => {
      const mode = secEl.dataset.mode || "";
      let idx = 0;

      if (mode === "video-response") {
        secEl.querySelectorAll(".hw-worksheet__line--video").forEach((promptEl, vi) => {
          const num = promptEl.querySelector(".hw-item-num")?.textContent?.trim() || String(vi + 1);
          videoPrompts.push({
            label: num,
            prompt:
              promptEl.querySelector(".hw-video-prompt__question")?.textContent?.trim() ||
              promptEl.querySelector(".hw-video-prompt__text")?.textContent?.trim() ||
              "",
            student: "(submitted via video upload)",
          });
        });
        return;
      }

      if (mode === "audio-prompt") {
        secEl.querySelectorAll(".hw-worksheet__line--audio-prompt").forEach((promptEl, ai) => {
          const num = promptEl.querySelector(".hw-item-num")?.textContent?.trim() || String(ai + 1);
          audioPrompts.push({
            label: "Audio " + num,
            prompt:
              promptEl.querySelector(".hw-audio-prompt__text")?.textContent?.trim() || "",
            student: "(submitted via audio upload)",
          });
        });
        return;
      }

      if (mode === "audio-mimic") {
        secEl.querySelectorAll(".hw-worksheet__line--audio-mimic").forEach((promptEl, ai) => {
          const num = promptEl.querySelector(".hw-item-num")?.textContent?.trim() || String(ai + 1);
          audioPrompts.push({
            label: "Mimic " + num,
            prompt:
              promptEl.querySelector(".hw-audio-mimic__text")?.textContent?.trim() ||
              "Listen & mimic",
            student: "(submitted via audio upload)",
          });
        });
        return;
      }

      secEl.querySelectorAll("input.hw-blank, textarea.hw-blank").forEach((el) => {
        if (
          !el.name ||
          el.hasAttribute("data-section-audio-url") ||
          el.hasAttribute("data-item-audio-url") ||
          el.hasAttribute("data-item-image-url") ||
          el.hasAttribute("data-item-english-answer") ||
          el.hasAttribute("data-video-prompt") ||
          el.hasAttribute("data-audio-prompt")
        ) {
          return;
        }
        const student = el.value.trim();
        const contentEl = el.closest(".hw-worksheet__content");
        const topic = contentEl?.dataset?.topic || "";
        const row = {
          name: el.name,
          label: labelFromLineEl(el, mode, idx + 1),
          prompt: topic || promptForBlank(form, el.name),
          student,
          completed: completedSentenceForBlank(form, el.name, student),
        };
        if (mode === "grammar-blank") {
          section1.push(row);
          idx += 1;
        } else if (mode === "audio-listening") {
          listening.push(row);
          idx += 1;
        } else {
          section2.push(row);
        }
      });
    });

    return {
      section1,
      section2,
      videoPrompts,
      audioPrompts,
      listening,
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
    clone.querySelectorAll(
      ".hw-listen-instruction, .hw-translation-block__instruction, .hw-recording-tip"
    ).forEach((el) => el.remove());
    clone.querySelectorAll(".ja-reading").forEach((el) => {
      el.replaceWith(document.createTextNode(el.textContent || ""));
    });
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function starStaticDisplay(prefix, suffix, tokens) {
    if (Array.isArray(tokens) && tokens.length) {
      const fixed = tokens.filter((t) => t.fixed).map((t) => t.text).filter(Boolean);
      if (fixed.length) return fixed.join(" · ");
    }
    const p = String(prefix || "").trim();
    const s = String(suffix ?? "").trim();
    if (p && s && s !== "。") return p + " · " + s;
    return p || (s !== "。" ? s : "") || "";
  }

  function starOrderFromLine(lineEl) {
    const hidden = lineEl.querySelector(".hw-star-block__answer");
    let tokens = [];
    try {
      tokens = JSON.parse(lineEl.dataset.tokens || "[]");
      if (!Array.isArray(tokens)) tokens = [];
    } catch {
      tokens = [];
    }
    if (!tokens.length) {
      const prefix = lineEl.querySelector(".hw-star-block__prefix")?.textContent?.trim() || "";
      const suffix = lineEl.querySelector(".hw-star-block__suffix")?.textContent?.trim() || "";
      tokens = normalizeStarTokens({ prefix, suffix, pieces: JSON.parse(lineEl.dataset.pieces || "[]") });
    }

    let draggableAnswers = [];
    try {
      draggableAnswers = JSON.parse(hidden?.value || "[]");
      if (!Array.isArray(draggableAnswers)) draggableAnswers = [];
    } catch {
      draggableAnswers = [];
    }
    draggableAnswers = draggableAnswers.map((part) => String(part || "").trim());

    let dragIdx = 0;
    const assembledParts = [];
    tokens.forEach((token) => {
      if (token.fixed) {
        assembledParts.push(token.text);
      } else {
        assembledParts.push(draggableAnswers[dragIdx] || "");
        dragIdx += 1;
      }
    });

    const pieces = draggableAnswers.filter(Boolean);
    const prefix = tokens.filter((t) => t.fixed).map((t) => t.text).join("") || "";
    const suffix = "";
    const assembled = assembledParts.join("").replace(/\s+/g, " ").trim();
    const piecesDisplay = pieces.join(" · ");
    const staticDisplay = starStaticDisplay("", "", tokens);
    return { assembled, piecesDisplay, staticDisplay, prefix, suffix, tokens };
  }

  function mediaFromLine(lineEl, defaultKind) {
    const inline =
      lineEl.querySelector(".hw-video-inline") || lineEl.querySelector(".hw-audio-inline");
    return {
      mediaId: inline?.dataset?.mediaId?.trim() || "",
      mediaKind: inline?.dataset?.mediaKind?.trim() || defaultKind,
    };
  }

  const STUDENT_BLANK_SELECTOR =
    "input.hw-blank:not([data-item-audio-url]):not([data-item-image-url]):not([data-item-english-answer]), textarea.hw-blank:not([data-audio-prompt]):not([data-video-prompt])";

  function collectOrderedAnswers(form, report) {
    const byName = new Map();
    [...(report.section1 || []), ...(report.section2 || []), ...(report.listening || [])].forEach(
      (row) => {
        if (row.name) byName.set(row.name, row);
      }
    );

    const lines = [];
    form.querySelectorAll(".hw-worksheet__section").forEach((secEl) => {
      const mode = secEl.dataset.mode || "";
      if (mode === "video-response") {
        secEl.querySelectorAll(".hw-worksheet__line--video").forEach((lineEl) => {
          lines.push({ mode, lineEl });
        });
        return;
      }
      if (mode === "audio-prompt") {
        secEl.querySelectorAll(".hw-worksheet__line--audio-prompt").forEach((lineEl) => {
          lines.push({ mode, lineEl });
        });
        return;
      }
      if (mode === "audio-mimic") {
        secEl.querySelectorAll(".hw-worksheet__line--audio-mimic").forEach((lineEl) => {
          lines.push({ mode, lineEl });
        });
        return;
      }
      secEl.querySelectorAll(".hw-worksheet__line").forEach((lineEl) => {
        lines.push({ mode, lineEl });
      });
    });

    return lines
      .map(({ mode, lineEl }, index) => {
        const num =
          lineEl.querySelector(".hw-item-num")?.textContent?.trim() || String(index + 1);
        const progress = String(index + 1);

        if (mode === "video-response") {
          const prompt =
            lineEl.querySelector(".hw-video-prompt__question")?.textContent?.trim() ||
            lineEl.querySelector(".hw-video-prompt__text")?.textContent?.trim() ||
            "";
          const saved = lineEl.querySelector('.hw-video-inline__card[data-state="saved"]');
          const media = mediaFromLine(lineEl, "video");
          return {
            progress,
            blockType: blockTypeLabel(mode),
            label: num,
            question: prompt || undefined,
            student: saved ? "Video submitted" : "(video not saved)",
            mediaId: saved && media.mediaId ? media.mediaId : undefined,
            mediaKind: saved ? media.mediaKind || "video" : undefined,
          };
        }
        if (mode === "audio-prompt") {
          const prompt =
            lineEl.querySelector(".hw-audio-prompt__text")?.textContent?.trim() || "";
          const saved =
            lineEl.querySelector('[data-hw-answer-saved="true"]') ||
            lineEl.querySelector('.hw-audio-inline__card[data-state="saved"]') ||
            lineEl.querySelector('.hw-video-inline__card[data-state="saved"]');
          const media = mediaFromLine(lineEl, "audio");
          return {
            progress,
            blockType: blockTypeLabel(mode),
            label: "Audio " + num,
            question: prompt || undefined,
            student: saved ? "Audio submitted" : "(audio not saved)",
            mediaId: saved && media.mediaId ? media.mediaId : undefined,
            mediaKind: saved ? media.mediaKind || "audio" : undefined,
          };
        }
        if (mode === "audio-mimic") {
          const prompt =
            lineEl.querySelector(".hw-audio-mimic__text")?.textContent?.trim() ||
            "Listen & mimic";
          const saved =
            lineEl.querySelector('[data-hw-answer-saved="true"]') ||
            lineEl.querySelector('.hw-audio-inline__card[data-state="saved"]');
          const media = mediaFromLine(lineEl, "audio");
          return {
            progress,
            blockType: blockTypeLabel(mode),
            label: "Mimic " + num,
            question: prompt || undefined,
            student: saved ? "Audio submitted" : "(audio not saved)",
            mediaId: saved && media.mediaId ? media.mediaId : undefined,
            mediaKind: saved ? media.mediaKind || "audio" : undefined,
          };
        }
        if (mode === "star-order") {
          const { assembled, piecesDisplay, staticDisplay, prefix, suffix } = starOrderFromLine(lineEl);
          const slotHidden = lineEl.querySelector(".hw-star-block__answer");
          const slotOrder = slotHidden?.value?.trim() || "";
          return {
            progress,
            blockType: blockTypeLabel(mode),
            label: num,
            staticDisplay: staticDisplay || undefined,
            prefix,
            suffix,
            student: assembled || "(blank)",
            piecesDisplay: piecesDisplay || undefined,
            slotOrder: slotOrder || undefined,
          };
        }
        if (mode === "translation") {
          const input = lineEl.querySelector("textarea.hw-blank, .hw-blank");
          const jp =
            lineEl.querySelector(".hw-translation-block__japanese")?.textContent?.trim() || "";
          const student = input?.value?.trim() || "";
          return {
            progress,
            blockType: blockTypeLabel(mode),
            label: num,
            question: jp || undefined,
            student: student || "(blank)",
          };
        }
        if (mode === "audio-listening") {
          const input = lineEl.querySelector(STUDENT_BLANK_SELECTOR);
          const student = input?.value?.trim() || "";
          const reference =
            input?.closest(".hw-blank-wrap")?.dataset?.teacherAnswer?.trim() || "";
          return {
            progress,
            blockType: blockTypeLabel(mode),
            label: num,
            question: reference || undefined,
            reference: reference || undefined,
            student: student || "(blank)",
          };
        }
        const input = lineEl.querySelector(STUDENT_BLANK_SELECTOR);
        const row = input?.name ? byName.get(input.name) : null;
        if (!row) return null;
        return {
          progress,
          blockType: blockTypeLabel(mode),
          label: row.label,
          question: row.prompt ? stripWorksheetInstructions(row.prompt) : undefined,
          student: row.student,
        };
      })
      .filter(Boolean);
  }

  function stripWorksheetInstructions(text) {
    return String(text || "")
      .replace(
        /Listen to the clip and write down what you think it's saying(\s+in Japanese)?\.?/gi,
        ""
      )
      .replace(/Translate into English\.?/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getStudentQuestionLines(form) {
    if (!form) return [];
    return Array.from(
      form.querySelectorAll(".hw-worksheet__line:not(.hw-worksheet__line--author)")
    );
  }

  function inlineMediaSaved(inline) {
    if (!inline?.dataset?.mediaId?.trim()) return false;
    const card = inline.querySelector(".hw-video-inline__card");
    return card?.dataset.state === "saved";
  }

  function isWorksheetLineAnswered(lineEl) {
    if (!lineEl) return false;
    if (lineEl.classList.contains("hw-worksheet__line--video")) {
      return inlineMediaSaved(lineEl.querySelector(".hw-video-inline"));
    }
    if (lineEl.classList.contains("hw-worksheet__line--audio-prompt") ||
      lineEl.classList.contains("hw-worksheet__line--audio-mimic")) {
      const inline = lineEl.querySelector(".hw-audio-inline");
      if (inline?.dataset?.hwAnswerSaved === "true" && inline.dataset.mediaId?.trim()) {
        return true;
      }
      return inlineMediaSaved(lineEl.querySelector(".hw-video-inline"));
    }
    if (lineEl.classList.contains("hw-worksheet__line--star")) {
      const hidden = lineEl.querySelector(".hw-star-block__answer");
      if (!hidden?.value) return false;
      try {
        const order = JSON.parse(hidden.value);
        const need = Number(lineEl.dataset.pieceCount) || 0;
        return (
          Array.isArray(order) &&
          order.length === need &&
          order.every((part) => String(part || "").trim())
        );
      } catch {
        return false;
      }
    }
    const blanks = lineEl.querySelectorAll(STUDENT_BLANK_SELECTOR);
    if (!blanks.length) return false;
    return Array.from(blanks).every((el) => hasMeaningfulStudentAnswer(el.value));
  }

  function totalQuestions(form) {
    return getStudentQuestionLines(form).length;
  }

  function countAnsweredQuestions(form) {
    return getStudentQuestionLines(form).filter(isWorksheetLineAnswered).length;
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

    const listening = (report.listening || []).map((row) => ({
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
      register: meta.register || "casual",
      section1,
      section2,
      listening,
      answers: collectOrderedAnswers(form, report),
    };
  }

  global.HwWorksheet = {
    render,
    printBlank,
    formatHint,
    HINT_TENSE_OPTIONS,
    DEFAULT_HINT_TENSE,
    normalizeHintConjugation,
    getGrammarBlankTense,
    tenseShouldShowPill,
    tensePillText,
    checkHomework,
    collectHomeworkAnswers,
    renderCheckResults,
    normalizeAnswer,
    answersMatch,
    buildSubmitPayload,
    totalQuestions,
    countAnsweredQuestions,
    isWorksheetLineAnswered,
    isWorksheetComplete,
    updateSubmitButtonState,
    getSlideIndex,
    setSlideIndex,
    hasMeaningfulStudentAnswer,
    enableSeeAnswers,
    disableSeeAnswers,
    revealTeacherAnswers,
    hideTeacherAnswers,
    toggleTeacherAnswers,
    hasListenTeacherAnswers,
    exitFocusMode: exitHomeworkFocusMode,
    setFormReadOnly,
    applyAnswersMap,
    applySubmissionAnswers,
    fitStarLine,
    scheduleFitStarLine,
    scheduleFitAllStarSentences,
    assignmentFromAuthoringForm,
    buildRegisterVariants,
    enrichGrammarVariants,
    enrichAssignmentMedia,
    renderAudioPlayer,
    renderListenSlideAudio,
    setAudioAnswerReplay,
    clearAudioAnswerReplay,
    setVideoAnswerReplay,
    clearVideoAnswerReplay,
    applyAnswerVariants,
    isImmersionKitMediaUrl,
    parseImmersionKitMediaPaste,
    hasBracketRubyNotation,
    parseBracketRubyNotation,
    rubySegmentsToBracketString,
    textPartToEditorString,
    renderBracketRubyText,
  };
})(window);
