/**
 * Flat-block worksheet builder — blocks are worksheet functions, not section types.
 */
(function (global) {
  const LABELS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

  const PALETTE = [
    { type: "grammar-line", label: "Blank sentence", hint: "Sentence with a fill-in blank" },
    { type: "open-line", label: "Open response", hint: "Written answer box" },
    { type: "video-prompt", label: "Video prompt", hint: "Student records an answer" },
    { type: "audio-clip", label: "Audio clip", hint: "Short clip students can replay" },
    { type: "listen-line", label: "Audio transcript", hint: "Write what they hear" },
  ];

  const TEMPLATE_ORDER = ["blank", "grammar", "application", "listening"];

  const TEMPLATES = {
    blank: { label: "Blank canvas", templateType: "custom", sections: [] },
    grammar: {
      label: "Grammar worksheet",
      templateType: "grammar",
      sections: [
        {
          mode: "grammar-blank",
          title: "Section 1 — Grammar point",
          instructions:
            "Fill in the blank with the correct grammar form. The hint under each blank shows the dictionary form (and conjugation when needed).",
          tenseBubbles: ["Now-Later", "Past"],
          activeTense: "Now-Later",
          items: [1, 2, 3, 4, 5].map((n) => grammarItem(n)),
        },
        {
          mode: "context-blank",
          title: "Section 2 — Your words",
          instructions: "Write your own sentences using this grammar in the boxes below.",
          items: [1, 2, 3].map((n) => openItem(n, "s2")),
        },
      ],
    },
    application: {
      label: "Application worksheet",
      templateType: "application",
      sections: [
        {
          mode: "video-response",
          title: "Application — video answers",
          instructions:
            "Record a short video for each prompt so JD can hear how you apply the grammar in real speech.",
          items: [1, 2, 3].map((n) => videoItem(n)),
        },
      ],
    },
    listening: {
      label: "Audio listening",
      templateType: "listening",
      sections: [
        {
          mode: "audio-listening",
          title: "Listening practice",
          instructions: "Play the clip, then write the words you hear in each box.",
          audioUrl: "",
          items: [1, 2, 3].map((n) => listenItem(n)),
        },
      ],
    },
  };

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }

  function grammarItem(n) {
    const id = "s1-" + n;
    return {
      id,
      parts: [
        { type: "text", value: "" },
        { type: "blank", name: id, wide: true, answer: "", hint: { dictionary: "", conjugation: "plain" } },
      ],
    };
  }

  function openItem(n, prefix) {
    const id = (prefix || "open") + "-" + n;
    return { id, parts: [{ type: "blank", name: id, wide: true, multiline: true }] };
  }

  function videoItem(n) {
    const id = "vid-" + n;
    return { id, prompt: "", recordLabel: "Record your answer" };
  }

  function listenItem(n) {
    const id = "listen-" + n;
    return { id, parts: [{ type: "blank", name: id, wide: true, multiline: true }] };
  }

  function createBlock(type, index) {
    const n = (index || 0) + 1;
    const id = uid("blk");
    switch (type) {
      case "grammar-line":
        return {
          id,
          type,
          negative: false,
          parts: [
            { type: "text", value: "" },
            { type: "blank", name: id, wide: true, answer: "", hint: { dictionary: "", conjugation: "plain" } },
          ],
        };
      case "open-line":
        return { id, type, parts: [{ type: "blank", name: id, wide: true, multiline: true }] };
      case "video-prompt":
        return { id, type, prompt: "", recordLabel: "Record your answer" };
      case "audio-clip":
        return { id, type, audioUrl: "" };
      case "listen-line":
        return { id, type, parts: [{ type: "blank", name: id, wide: true, multiline: true }] };
      default:
        return null;
    }
  }

  function cloneBlocks(blocks) {
    return JSON.parse(JSON.stringify(blocks || []));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sectionsToBlocks(sections) {
    const blocks = [];
    (sections || []).forEach((sec) => {
      if (sec.mode === "audio-listening") {
        blocks.push({ id: uid("blk"), type: "audio-clip", audioUrl: sec.audioUrl || "" });
      }
      (sec.items || []).forEach((item) => {
        if (sec.mode === "video-response") {
          blocks.push({
            id: item.id || uid("blk"),
            type: "video-prompt",
            prompt: item.prompt || "",
            recordLabel: item.recordLabel || "Record your answer",
          });
        } else if (sec.mode === "grammar-blank") {
          blocks.push({
            id: item.id || uid("blk"),
            type: "grammar-line",
            negative: Boolean(item.negative),
            parts: JSON.parse(JSON.stringify(item.parts || [])),
          });
        } else if (sec.mode === "context-blank") {
          blocks.push({
            id: item.id || uid("blk"),
            type: "open-line",
            parts: JSON.parse(JSON.stringify(item.parts || [])),
          });
        } else if (sec.mode === "audio-listening") {
          blocks.push({
            id: item.id || uid("blk"),
            type: "listen-line",
            parts: JSON.parse(JSON.stringify(item.parts || [])),
          });
        }
      });
    });
    return blocks;
  }

  function blocksToSections(blocks) {
    const sections = [];
    let i = 0;

    while (i < blocks.length) {
      const block = blocks[i];

      if (block.type === "audio-clip") {
        const sec = {
          id: uid("sec"),
          mode: "audio-listening",
          title: "",
          instructions: "",
          audioUrl: String(block.audioUrl || "").trim(),
          items: [],
        };
        i++;
        while (i < blocks.length && blocks[i].type === "listen-line") {
          sec.items.push(blockToListenItem(blocks[i], sec.items.length));
          i++;
        }
        if (sec.audioUrl || sec.items.length) sections.push(sec);
        continue;
      }

      if (block.type === "grammar-line") {
        const sec = {
          id: uid("sec"),
          mode: "grammar-blank",
          title: "",
          instructions: "",
          tenseBubbles: ["Now-Later", "Past"],
          activeTense: "Now-Later",
          items: [],
        };
        while (i < blocks.length && blocks[i].type === "grammar-line") {
          sec.items.push(blockToGrammarItem(blocks[i], sec.items.length));
          i++;
        }
        if (sec.items.length) sections.push(sec);
        continue;
      }

      if (block.type === "open-line") {
        const sec = { id: uid("sec"), mode: "context-blank", title: "", instructions: "", items: [] };
        while (i < blocks.length && blocks[i].type === "open-line") {
          sec.items.push(blockToOpenItem(blocks[i], sec.items.length));
          i++;
        }
        if (sec.items.length) sections.push(sec);
        continue;
      }

      if (block.type === "video-prompt") {
        const sec = { id: uid("sec"), mode: "video-response", title: "", instructions: "", items: [] };
        while (i < blocks.length && blocks[i].type === "video-prompt") {
          const prompt = String(blocks[i].prompt || "").trim();
          if (prompt) {
            sec.items.push({
              id: blocks[i].id || "vid-" + (sec.items.length + 1),
              prompt,
              recordLabel: blocks[i].recordLabel || "Record your answer",
            });
          }
          i++;
        }
        if (sec.items.length) sections.push(sec);
        continue;
      }

      if (block.type === "listen-line") {
        const sec = { id: uid("sec"), mode: "audio-listening", title: "", instructions: "", audioUrl: "", items: [] };
        while (i < blocks.length && blocks[i].type === "listen-line") {
          sec.items.push(blockToListenItem(blocks[i], sec.items.length));
          i++;
        }
        if (sec.items.length) sections.push(sec);
        continue;
      }

      i++;
    }

    return sections;
  }

  function blockToGrammarItem(block, index) {
    const out = { id: block.id || "item-" + (index + 1), parts: [] };
    if (block.negative) out.negative = true;
    (block.parts || []).forEach((part) => {
      if (part.type === "text") {
        const value = String(part.value || "").trim();
        if (value) out.parts.push({ type: "text", value });
      } else if (part.type === "blank") {
        const blank = { type: "blank", name: part.name || out.id, wide: true };
        const answer = String(part.answer || "").trim();
        if (answer) blank.answer = answer;
        if (part.hint?.dictionary) {
          blank.hint = { dictionary: part.hint.dictionary, conjugation: part.hint.conjugation || "plain" };
        }
        out.parts.push(blank);
      }
    });
    return out;
  }

  function blockToOpenItem(block, index) {
    const out = { id: block.id || "open-" + (index + 1), parts: [] };
    (block.parts || []).forEach((part) => {
      if (part.type === "blank") {
        const blank = { type: "blank", name: part.name || out.id, wide: true, multiline: true };
        const answer = String(part.answer || "").trim();
        if (answer) blank.answer = answer;
        out.parts.push(blank);
      }
    });
    return out;
  }

  function blockToListenItem(block, index) {
    return blockToOpenItem(block, index);
  }

  /**
   * @param {HTMLElement} mount
   * @param {{ onChange?: () => void, getTitle?: () => string }} options
   */
  function mount(mount, options) {
    options = options || {};
    let state = { templateType: "custom", blocks: [] };
    let previewOpen = false;
    const DRAG_TYPE = "application/x-hw-block-type";

    mount.innerHTML = "";
    const root = document.createElement("div");
    root.className = "hw-builder";

    const toolbar = document.createElement("div");
    toolbar.className = "hw-builder__toolbar";
    toolbar.innerHTML =
      '<p class="hw-builder__toolbar-label">Start from a template</p>' +
      '<div class="hw-builder__templates" role="group" aria-label="Worksheet templates"></div>' +
      '<div class="hw-builder__toolbar-actions">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-builder-preview>Student preview</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-builder-back hidden>Edit layout</button>' +
      "</div>";

    const layout = document.createElement("div");
    layout.className = "hw-builder__layout";

    const palette = document.createElement("aside");
    palette.className = "hw-builder__palette";
    palette.innerHTML =
      '<h4 class="hw-builder__palette-title">Blocks</h4>' +
      '<p class="hw-builder__palette-hint">Click or drag a block onto the canvas. Mix any types in any order.</p>';

    const paletteList = document.createElement("div");
    paletteList.className = "hw-builder__palette-list";
    PALETTE.forEach((entry) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-builder__palette-block hw-builder__palette-block--" + entry.type;
      btn.dataset.blockType = entry.type;
      btn.draggable = true;
      btn.innerHTML =
        "<span class=\"hw-builder__palette-block-label\">" +
        escapeHtml(entry.label) +
        "</span>" +
        "<span class=\"hw-builder__palette-block-hint\">" +
        escapeHtml(entry.hint) +
        "</span>";
      btn.addEventListener("click", () => addBlock(entry.type));
      btn.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData(DRAG_TYPE, entry.type);
        e.dataTransfer.effectAllowed = "copy";
      });
      paletteList.appendChild(btn);
    });
    palette.appendChild(paletteList);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "hw-builder__canvas-wrap";
    const canvas = document.createElement("div");
    canvas.className = "hw-builder__canvas";
    canvas.setAttribute("aria-label", "Worksheet blocks");
    canvasWrap.appendChild(canvas);

    const previewMount = document.createElement("div");
    previewMount.className = "hw-builder__preview";
    previewMount.hidden = true;
    canvasWrap.appendChild(previewMount);

    layout.append(palette, canvasWrap);
    root.append(toolbar, layout);
    mount.appendChild(root);

    const templateRow = toolbar.querySelector(".hw-builder__templates");
    TEMPLATE_ORDER.forEach((key) => {
      const t = TEMPLATES[key];
      if (!t) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-builder__template-btn";
      btn.dataset.template = key;
      btn.textContent = t.label;
      btn.addEventListener("click", () => applyTemplate(key));
      templateRow.appendChild(btn);
    });

    function notifyChange() {
      if (options.onChange) options.onChange();
    }

    function addBlock(type, atIndex) {
      const block = createBlock(type, state.blocks.length);
      if (!block) return;
      if (atIndex === undefined || atIndex >= state.blocks.length) {
        state.blocks.push(block);
      } else {
        state.blocks.splice(atIndex, 0, block);
      }
      renderCanvas();
      notifyChange();
    }

    function removeBlock(index) {
      state.blocks.splice(index, 1);
      renderCanvas();
      notifyChange();
    }

    function bindDropZone(el) {
      el.addEventListener("dragover", (e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        el.classList.add("hw-builder__drop-zone--over");
      });
      el.addEventListener("dragleave", (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove("hw-builder__drop-zone--over");
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("hw-builder__drop-zone--over");
        const type = e.dataTransfer.getData(DRAG_TYPE);
        if (type) addBlock(type);
      });
    }

    function renderBlockEl(block, index) {
      const el = document.createElement("article");
      el.className =
        "hw-builder__block hw-builder__block--" +
        block.type +
        (block.negative ? " hw-builder__block--negative" : "");

      const head = document.createElement("div");
      head.className = "hw-builder__block-head";
      const typeLabel = PALETTE.find((p) => p.type === block.type)?.label || block.type;
      const label = document.createElement("span");
      label.className = "hw-builder__block-type";
      label.textContent = typeLabel;
      head.appendChild(label);

      if (block.negative) {
        const badge = document.createElement("span");
        badge.className = "hw-negative-badge";
        badge.textContent = "NEGATIVE";
        head.appendChild(badge);
      }

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "hw-builder__remove-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removeBlock(index));
      head.appendChild(removeBtn);
      el.appendChild(head);

      if (block.type === "video-prompt") {
        const prompt = document.createElement("textarea");
        prompt.className = "hw-builder__field hw-builder__field--area";
        prompt.rows = 2;
        prompt.placeholder = "Question or prompt for the student";
        prompt.value = block.prompt || "";
        prompt.addEventListener("input", () => {
          block.prompt = prompt.value;
          notifyChange();
        });
        el.appendChild(prompt);
        return el;
      }

      if (block.type === "audio-clip") {
        const audioLabel = document.createElement("label");
        audioLabel.className = "hw-builder__audio-label";
        audioLabel.textContent = "Audio clip URL or file path";
        const audioInput = document.createElement("input");
        audioInput.type = "url";
        audioInput.className = "hw-builder__field";
        audioInput.placeholder = "https://… or /homework/audio/clip.mp3";
        audioInput.value = block.audioUrl || "";
        audioInput.addEventListener("input", () => {
          block.audioUrl = audioInput.value.trim();
          notifyChange();
        });
        audioLabel.appendChild(audioInput);
        el.appendChild(audioLabel);
        return el;
      }

      const partsWrap = document.createElement("div");
      partsWrap.className = "hw-builder__parts";

      (block.parts || []).forEach((part) => {
        if (part.type === "text") {
          const textInput = document.createElement("input");
          textInput.type = "text";
          textInput.className = "hw-builder__field hw-builder__field--jp";
          textInput.placeholder = "Sentence text before the blank";
          textInput.value = part.value || "";
          textInput.addEventListener("input", () => {
            part.value = textInput.value;
            notifyChange();
          });
          partsWrap.appendChild(textInput);
        } else if (part.type === "blank") {
          const blankInput = document.createElement("input");
          blankInput.type = "text";
          blankInput.className = "hw-builder__field";
          blankInput.placeholder =
            block.type === "grammar-line"
              ? "Answer key (optional)"
              : part.multiline
                ? "Model response (optional)"
                : "Answer key (optional)";
          blankInput.value = part.answer || "";
          blankInput.addEventListener("input", () => {
            part.answer = blankInput.value;
            notifyChange();
          });
          partsWrap.appendChild(blankInput);

          if (block.type === "grammar-line" && !part.multiline) {
            const hintRow = document.createElement("div");
            hintRow.className = "hw-builder__hint-row";
            const dictInput = document.createElement("input");
            dictInput.type = "text";
            dictInput.className = "hw-builder__field hw-builder__field--sm";
            dictInput.placeholder = "Dictionary form (e.g. いく)";
            dictInput.value = part.hint?.dictionary || "";
            dictInput.addEventListener("input", () => {
              part.hint = part.hint || { dictionary: "", conjugation: "plain" };
              part.hint.dictionary = dictInput.value;
              notifyChange();
            });
            const conjInput = document.createElement("input");
            conjInput.type = "text";
            conjInput.className = "hw-builder__field hw-builder__field--sm";
            conjInput.placeholder = "Conjugation";
            conjInput.value = part.hint?.conjugation || "plain";
            conjInput.addEventListener("input", () => {
              part.hint = part.hint || { dictionary: "", conjugation: "plain" };
              part.hint.conjugation = conjInput.value;
              notifyChange();
            });
            hintRow.append(dictInput, conjInput);
            partsWrap.appendChild(hintRow);
          }
        }
      });

      if (block.type === "grammar-line") {
        const negLabel = document.createElement("label");
        negLabel.className = "hw-builder__check";
        const neg = document.createElement("input");
        neg.type = "checkbox";
        neg.checked = Boolean(block.negative);
        neg.addEventListener("change", () => {
          block.negative = neg.checked;
          renderCanvas();
          notifyChange();
        });
        negLabel.append(neg, document.createTextNode(" Negative form"));
        partsWrap.appendChild(negLabel);
      }

      el.appendChild(partsWrap);
      return el;
    }

    function renderCanvas() {
      canvas.innerHTML = "";

      const list = document.createElement("div");
      list.className = "hw-builder__block-list";

      if (!state.blocks.length) {
        const hint = document.createElement("p");
        hint.className = "hw-builder__canvas-hint";
        hint.textContent = "Your worksheet is empty. Click or drag blocks from the left.";
        list.appendChild(hint);
      } else {
        state.blocks.forEach((block, index) => {
          list.appendChild(renderBlockEl(block, index));
        });
      }

      const dropZone = document.createElement("div");
      dropZone.className = "hw-builder__drop-zone";
      dropZone.setAttribute("role", "button");
      dropZone.tabIndex = 0;
      dropZone.innerHTML =
        '<span class="hw-builder__drop-zone-icon" aria-hidden="true">➕</span>' +
        '<span class="hw-builder__drop-zone-text">Drop blocks here</span>';
      dropZone.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          paletteList.querySelector(".hw-builder__palette-block")?.focus();
        }
      });
      bindDropZone(dropZone);

      canvas.append(list, dropZone);
    }

    function applyTemplate(key) {
      const t = TEMPLATES[key];
      if (!t) return;
      state = {
        templateType: t.templateType,
        blocks: sectionsToBlocks(t.sections || []),
      };
      previewOpen = false;
      previewMount.hidden = true;
      canvas.hidden = false;
      toolbar.querySelector("[data-builder-back]").hidden = true;
      toolbar.querySelector("[data-builder-preview]").hidden = false;
      renderCanvas();
      notifyChange();
    }

    function toAssignment(meta) {
      const assignment = {
        id: meta?.id || "",
        title: meta?.title || "Homework",
        youtubeUrl: meta?.youtubeUrl || "",
        templateType: state.templateType || "custom",
        status: "draft",
        forSale: false,
        salePrice: 0.99,
        sections: blocksToSections(state.blocks),
      };
      if (global.HwWorksheet?.enrichGrammarVariants) {
        global.HwWorksheet.enrichGrammarVariants(assignment);
      }
      return assignment;
    }

    function loadAssignment(assignment) {
      const data = assignment || {};
      state = {
        templateType: data.templateType || "custom",
        blocks: sectionsToBlocks(data.sections || []),
      };
      previewOpen = false;
      previewMount.hidden = true;
      canvas.hidden = false;
      toolbar.querySelector("[data-builder-back]").hidden = true;
      toolbar.querySelector("[data-builder-preview]").hidden = false;
      renderCanvas();
      notifyChange();
    }

    function showPreview(title) {
      if (!global.HwWorksheet?.render) return;
      const assignment = toAssignment({ title });
      previewMount.innerHTML = "";
      global.HwWorksheet.render(previewMount, assignment, { preview: true });
      previewOpen = true;
      previewMount.hidden = false;
      canvas.hidden = true;
      toolbar.querySelector("[data-builder-back]").hidden = false;
      toolbar.querySelector("[data-builder-preview]").hidden = true;
    }

    function hidePreview() {
      previewOpen = false;
      previewMount.hidden = true;
      canvas.hidden = false;
      toolbar.querySelector("[data-builder-back]").hidden = true;
      toolbar.querySelector("[data-builder-preview]").hidden = false;
    }

    toolbar.querySelector("[data-builder-preview]")?.addEventListener("click", () => {
      showPreview(options.getTitle?.() || "Preview");
    });
    toolbar.querySelector("[data-builder-back]")?.addEventListener("click", hidePreview);

    applyTemplate("blank");

    return {
      toAssignment,
      loadAssignment,
      applyTemplate,
      showPreview,
      hidePreview,
      getState: () => state,
      isPreviewOpen: () => previewOpen,
    };
  }

  global.HwWorksheetBuilder = {
    mount,
    TEMPLATES,
    TEMPLATE_ORDER,
    grammarItem,
    openItem,
    videoItem,
    listenItem,
    createBlock,
    sectionsToBlocks,
    blocksToSections,
  };
})(window);
