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
      ...new Set((String(text).match(/https?:\/\/[^\s<>"']+/gi) || []).map((u) => u.replace(/[),.;]+$/, ""))),
    ];
    let audioUrl = "";
    let imageUrl = "";
    urls.forEach((url) => {
      if (!isImmersionKitMediaUrl(url)) return;
      const lower = url.toLowerCase();
      if (/\.(mp3|m4a|wav|ogg|aac)(\?|#|$)/i.test(lower)) {
        if (!audioUrl) audioUrl = url;
        return;
      }
      if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(lower)) {
        if (!imageUrl) imageUrl = url;
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
    return Boolean(tense && tense !== DEFAULT_HINT_TENSE);
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

  function labelFromLineEl(el, mode, fallback) {
    const line = el.closest(".hw-worksheet__line");
    const num = line?.querySelector(".hw-item-num")?.textContent?.trim() || String(fallback);
    if (mode === "audio-listening") return "Listen " + num;
    if (mode === "context-blank") return "Question " + num;
    return num;
  }

  function formatHint(hint) {
    if (!hint) return "";
    const d = hint.dictionary || "—";
    const c = normalizeHintConjugation(hint.conjugation);
    if (!c || c === "ない") return "（" + d + "）";
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
    const listenStyle = Boolean(options.listenStyle);
    wrap.className =
      "hw-blank-wrap" +
      (part.multiline && !listenStyle ? " hw-blank-wrap--multiline" : "") +
      (listenStyle ? " hw-blank-wrap--listen" : "");

    let field;
    if (listenStyle) {
      field = document.createElement("input");
      field.type = "text";
      field.className = "hw-blank hw-blank--wide hw-blank--listen";
      field.setAttribute("aria-label", "What you heard");
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
      audioInput.type = "url";
      audioInput.className = "hw-blank hw-blank--wide hw-author-audio";
      audioInput.value = item.audioUrl || lineOptions.sectionAudioUrl || "";
      audioInput.setAttribute("data-item-audio-url", "1");
      audioInput.placeholder = "Paste audio URL from immersionkit.com";
      audioLabel.appendChild(audioInput);
      content.appendChild(audioLabel);

      const imageLabel = document.createElement("label");
      imageLabel.className = "hw-author-audio-url";
      imageLabel.textContent = "Screenshot URL (Immersion Kit)";
      const imageInput = document.createElement("input");
      imageInput.type = "url";
      imageInput.className = "hw-blank hw-blank--wide hw-author-audio";
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
    const clipUrl = String(url || "").trim();
    if (!clipUrl) {
      wrap.innerHTML = '<p class="hw-audio-player__missing">Audio clip not set yet.</p>';
      return wrap;
    }
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.className = "hw-audio-player__el";
    audio.src = clipUrl;
    audio.setAttribute("aria-label", "Listening clip — play as many times as you need");
    wrap.appendChild(audio);
    if (!options.inline) {
      const hint = document.createElement("p");
      hint.className = "hw-audio-player__hint";
      hint.textContent =
        "Play the clip as many times as you need, then write what you hear below.";
      wrap.appendChild(hint);
    }
    return wrap;
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

    const prompt = document.createElement("p");
    prompt.className = "hw-video-prompt__text";
    prompt.textContent = item.prompt || "Answer this question on video.";
    wrap.appendChild(prompt);

    const recorderMount = document.createElement("div");
    recorderMount.className = "hw-video-prompt__recorder";
    wrap.appendChild(recorderMount);

    if (renderOptions.preview) {
      recorderMount.innerHTML =
        '<p class="hw-video-prompt__note">Students record and send their answer here.</p>';
    } else if (renderOptions.studentMeta && global.HwVideoInline?.mount) {
      global.HwVideoInline.mount(recorderMount, {
        username: renderOptions.studentMeta.username,
        displayName: renderOptions.studentMeta.displayName,
        assignmentId: renderOptions.studentMeta.assignmentId,
        lessonName: renderOptions.studentMeta.lessonName,
        promptId: item.id || "vid-" + (index + 1),
        promptLabel: item.prompt || "",
      });
    } else {
      recorderMount.innerHTML =
        '<p class="hw-video-prompt__note">Sign in as a student to record here, or use the Video section below.</p>';
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

  function renderLine(item, index, sectionMode, lineOptions) {
    lineOptions = lineOptions || {};
    const openBlock = item.openResponse || (sectionMode === "context-blank" && item.parts?.[0]?.multiline);
    const line = document.createElement(openBlock ? "div" : "p");
    line.className =
      "hw-worksheet__line" +
      (item.negative ? " hw-worksheet__line--negative" : "") +
      (openBlock ? " hw-worksheet__line--open-response" : "") +
      (sectionMode === "audio-listening" ? " hw-worksheet__line--listen" : "");
    line.dataset.itemId = item.id || "";

    if (lineOptions.itemNum) {
      appendLineNumber(line, lineOptions.itemNum);
    }

    const content = document.createElement(openBlock ? "div" : "span");
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

    if (section.instructions) {
      const intro = document.createElement("p");
      intro.className = "hw-worksheet__section-intro";
      intro.textContent = section.instructions;
      wrap.appendChild(intro);
    }

    const sectionAudioUrl =
      section.mode === "audio-listening" ? String(section.audioUrl || "").trim() : "";

    (section.items || []).forEach((item, i) => {
      const itemCounter = renderOptions.itemCounter;
      if (itemCounter) itemCounter.value += 1;
      const itemNum = itemCounter ? itemCounter.value : i + 1;
      const lineOpts = { sectionAudioUrl, itemNum };

      if (section.mode === "video-response") {
        if (authoring) wrap.appendChild(renderAuthorVideoItem(item, i, lineOpts));
        else wrap.appendChild(renderVideoRecordCue(item, i, lineOpts));
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

    const wrap = document.createElement("div");
    wrap.className = "hw-worksheet__topic-brief";

    const heading = document.createElement("h4");
    heading.className = "hw-worksheet__topic-brief-title";
    heading.textContent = "Grammar description";
    wrap.appendChild(heading);

    if (explanation) {
      const p = document.createElement("p");
      p.className = "hw-worksheet__topic-explanation";
      p.textContent = explanation;
      wrap.appendChild(p);
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
      wrap.appendChild(list);
    }

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

    const interactive = false;

    const metaText = document.createElement("div");
    metaText.className = "hw-worksheet__meta-text";
    metaText.innerHTML =
      '<p class="hw-worksheet__meta-title">' +
      escapeHtml(prepared.title || "Homework") +
      "</p>" +
      (authoring
        ? '<p class="hw-worksheet__meta-hint">Teacher preview — use the block builder to edit layout.</p>'
        : '<p class="hw-worksheet__meta-hint">Fill in each blank, then submit. For video prompts, record in the Video section. JD will review your work.</p>');
    metaTop.appendChild(metaText);

    meta.appendChild(metaTop);

    const topicBrief = renderTopicBrief(prepared);
    if (topicBrief) meta.appendChild(topicBrief);

    form.appendChild(meta);

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

    if (!authoring && !options.preview) {
      initSlideMode(form);
      initFocusMode(form);
      initSeeAnswers(form);
    }

    return form;
  }

  function hasListenTeacherAnswers(form) {
    return Boolean(
      form?.querySelector(".hw-blank-wrap--listen[data-teacher-answer]")
    );
  }

  function revealTeacherAnswers(form) {
    if (!form) return;
    form.querySelectorAll(".hw-blank-wrap--listen[data-teacher-answer]").forEach((wrap) => {
      if (wrap.querySelector(".hw-worksheet__teacher-answer")) return;
      const answer = String(wrap.dataset.teacherAnswer || "").trim();
      if (!answer) return;
      const el = document.createElement("p");
      el.className = "hw-worksheet__teacher-answer";
      el.textContent = answer;
      wrap.appendChild(el);
    });
    const btn = form.querySelector("[data-hw-see-answers]");
    if (btn) {
      btn.textContent = "Answers shown";
      btn.disabled = true;
      btn.setAttribute("aria-pressed", "true");
    }
  }

  function enableSeeAnswers(form) {
    const btn = form?.querySelector("[data-hw-see-answers]");
    if (btn) btn.hidden = false;
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
    btn.addEventListener("click", () => revealTeacherAnswers(form));

    const submitBtn = actions.querySelector('button[type="submit"]');
    if (submitBtn) {
      actions.insertBefore(btn, submitBtn);
    } else {
      actions.appendChild(btn);
    }
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
    nav.setAttribute("role", "region");
    nav.setAttribute("aria-label", "Homework question navigation");

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "hw-worksheet__slide-btn";
    prevBtn.setAttribute("aria-label", "Previous question");
    prevBtn.textContent = "←";

    const counterWrap = document.createElement("div");
    counterWrap.className = "hw-worksheet__slide-counter-wrap";

    const counter = document.createElement("p");
    counter.className = "hw-worksheet__slide-counter";
    counter.setAttribute("aria-live", "polite");

    const sectionLabel = document.createElement("p");
    sectionLabel.className = "hw-worksheet__slide-section";

    counterWrap.append(counter, sectionLabel);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "hw-worksheet__slide-btn";
    nextBtn.setAttribute("aria-label", "Next question");
    nextBtn.textContent = "→";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn--ghost btn--sm hw-worksheet__slide-toggle";
    toggleBtn.textContent = "See all HW";

    const navControls = document.createElement("div");
    navControls.className = "hw-worksheet__slide-controls";
    navControls.append(prevBtn, toggleBtn, nextBtn);

    nav.append(counterWrap, navControls);

    const firstSection = form.querySelector(".hw-worksheet__section");
    const insertBefore = firstSection || form.querySelector(".hw-worksheet__actions");
    const brief = form.querySelector(".hw-worksheet__topic-brief");
    const stickyHead = document.createElement("div");
    stickyHead.className = "hw-worksheet__slide-sticky-head";
    if (brief) {
      brief.classList.add("hw-worksheet__topic-brief--slide");
      stickyHead.appendChild(brief);
    }
    stickyHead.appendChild(nav);
    form.insertBefore(stickyHead, insertBefore);

    form.classList.add("hw-worksheet--slide-mode");

    const hint = form.querySelector(".hw-worksheet__meta-hint");
    if (hint) {
      hint.textContent =
        "One question at a time — use the arrows to move, or see all homework at once.";
    }

    function sectionMetaForLine(line) {
      const section = line.closest(".hw-worksheet__section");
      if (!section) return "";
      const title = section.querySelector(".hw-worksheet__section-title")?.textContent?.trim() || "";
      return title;
    }

    function applySlideView() {
      if (seeAll) {
        form.classList.remove("hw-worksheet--slide-mode");
        nav.hidden = false;
        counterWrap.hidden = true;
        prevBtn.hidden = true;
        nextBtn.hidden = true;
        toggleBtn.textContent = "One at a time";
        form.querySelectorAll(".hw-worksheet__section").forEach((sec) => {
          sec.hidden = false;
        });
        lines.forEach((line) => {
          line.hidden = false;
        });
        return;
      }

      form.classList.add("hw-worksheet--slide-mode");
      counterWrap.hidden = false;
      prevBtn.hidden = false;
      nextBtn.hidden = false;
      toggleBtn.textContent = "See all HW";
      counter.textContent = current + 1 + " of " + lines.length;
      sectionLabel.textContent = sectionMetaForLine(lines[current]) || "";

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
    }

    function goTo(index) {
      current = Math.max(0, Math.min(index, lines.length - 1));
      applySlideView();
    }

    prevBtn.addEventListener("click", () => goTo(current - 1));
    nextBtn.addEventListener("click", () => goTo(current + 1));

    toggleBtn.addEventListener("click", () => {
      seeAll = !seeAll;
      applySlideView();
    });

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

    const printBtn = form.querySelector("[data-hw-print]");
    if (printBtn) {
      printBtn.addEventListener(
        "click",
        () => {
          if (form.classList.contains("hw-worksheet--slide-mode")) {
            seeAll = true;
            applySlideView();
          }
        },
        true
      );
    }

    applySlideView();
  }

  /**
   * @returns {void}
   */
  function exitHomeworkFocusMode() {
    const section = document.getElementById("hw-worksheet-section");
    document.body.classList.remove("hw-hw-focus-mode");
    section?.querySelector(".hw-focus-bar")?.setAttribute("hidden", "");
    section?.querySelector("[data-hw-focus]")?.removeAttribute("hidden");
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  /**
   * Distraction-free fullscreen view — dark theater background, centered worksheet page.
   * @param {HTMLFormElement} form
   */
  function initFocusMode(form) {
    const section = form.closest("#hw-worksheet-section");
    if (!section) return;

    const focusBtn = document.createElement("button");
    focusBtn.type = "button";
    focusBtn.className = "btn btn--ghost hw-worksheet__focus-btn";
    focusBtn.setAttribute("data-hw-focus", "");
    focusBtn.textContent = "Focus mode";

    const actions = form.querySelector(".hw-worksheet__actions");
    if (actions) {
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
      document.body.classList.add("hw-hw-focus-mode");
      focusBar.hidden = false;
      focusBtn.hidden = true;
      section.scrollTop = 0;
      try {
        await (section.requestFullscreen?.() || document.documentElement.requestFullscreen());
      } catch (_) {
        /* overlay-only focus is fine when fullscreen is blocked */
      }
    }

    focusBtn.addEventListener("click", () => enterFocus());
    exitBtn.addEventListener("click", () => exitHomeworkFocusMode());

    if (!section.dataset.hwFocusBound) {
      section.dataset.hwFocusBound = "1";
      document.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement && document.body.classList.contains("hw-hw-focus-mode")) {
          exitHomeworkFocusMode();
        }
      });
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

    const videoPrompts = [];
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
              promptEl.querySelector(".hw-video-prompt__text")?.textContent?.trim() || "",
            student: "(submitted via video upload)",
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
          el.hasAttribute("data-video-prompt")
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
    enableSeeAnswers,
    revealTeacherAnswers,
    hasListenTeacherAnswers,
    assignmentFromAuthoringForm,
    buildRegisterVariants,
    enrichGrammarVariants,
    applyAnswerVariants,
    isImmersionKitMediaUrl,
    parseImmersionKitMediaPaste,
  };
})(window);
