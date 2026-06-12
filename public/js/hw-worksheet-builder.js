/**
 * Flat-block worksheet builder — blocks are worksheet functions, not section types.
 */
(function (global) {
  const PALETTE = [
    { type: "grammar-line", label: "Blank sentence", hint: "Use {answer} for the blank" },
    { type: "open-line", label: "Open response", hint: "Written answer box" },
    { type: "video-prompt", label: "Video prompt", hint: "Student records an answer" },
    { type: "listen-line", label: "Audio listening", hint: "Clip + transcript" },
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
          instructions: "Play each clip, then write what you hear in the box below it.",
          audioUrl: "",
          items: [1, 2, 3].map((n) => listenItem(n)),
        },
      ],
    },
  };

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }

  function normalizeGrammarBlock(block, fallbackRegister) {
    block.register = block.register || fallbackRegister || "casual";
    block.negative = Boolean(block.negative);
    const blank = getGrammarBlankPart(block);
    if (blank) {
      blank.hint = blank.hint || { dictionary: "", conjugation: "Now-later" };
      blank.hint.conjugation = global.HwWorksheet?.normalizeHintConjugation
        ? global.HwWorksheet.normalizeHintConjugation(blank.hint.conjugation)
        : blank.hint.conjugation === "plain"
          ? "Now-later"
          : blank.hint.conjugation || "Now-later";
    }
    if (block.past) {
      if (blank) blank.hint.conjugation = "Past";
      delete block.past;
    }
    return block;
  }

  function blockTense(block) {
    return global.HwWorksheet?.getGrammarBlankTense
      ? global.HwWorksheet.getGrammarBlankTense(block)
      : "Now-later";
  }

  function grammarItem(n) {
    const id = "s1-" + n;
    return {
      id,
      parts: [
        { type: "text", value: "" },
        { type: "blank", name: id, wide: true, answer: "", hint: { dictionary: "", conjugation: "Now-later" } },
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
    return { id, audioUrl: "", parts: [{ type: "blank", name: id, wide: true }] };
  }

  function ensureListenBlock(block) {
    block.audioUrl = String(block.audioUrl || "").trim();
    if (!block.parts?.length) {
      block.parts = [{ type: "blank", name: block.id, wide: true, answer: "" }];
    }
    return block;
  }

  /** Merge legacy audio-clip blocks into the following listen-line blocks. */
  function normalizeBlocks(blocks) {
    const out = [];
    let sharedAudioUrl = "";
    (blocks || []).forEach((block) => {
      if (block.type === "audio-clip") {
        sharedAudioUrl = String(block.audioUrl || "").trim();
        return;
      }
      if (block.type === "listen-line") {
        const next = ensureListenBlock({ ...block });
        if (!next.audioUrl && sharedAudioUrl) next.audioUrl = sharedAudioUrl;
        out.push(next);
        return;
      }
      sharedAudioUrl = "";
      out.push(block);
    });
    return out;
  }

  function getGrammarBlankPart(block) {
    return (block.parts || []).find((p) => p.type === "blank") || null;
  }

  const GRAMMAR_BLANK_PATTERN = /\{([^}]*)\}/;

  function grammarTextAroundBlank(block) {
    const parts = block.parts || [];
    const blankIdx = parts.findIndex((p) => p.type === "blank");
    if (blankIdx < 0) return { before: "", after: "" };
    const before = parts
      .slice(0, blankIdx)
      .filter((p) => p.type === "text")
      .map((p) => p.value || "")
      .join("");
    const after = parts
      .slice(blankIdx + 1)
      .filter((p) => p.type === "text")
      .map((p) => p.value || "")
      .join("");
    return { before, after };
  }

  function grammarSentenceFromBlock(block) {
    const { before, after } = grammarTextAroundBlank(block);
    const blank = getGrammarBlankPart(block);
    const answer = blank?.answer || "";
    return before + "{" + answer + "}" + after;
  }

  function syncGrammarPartsFromSentence(block, sentence) {
    const raw = String(sentence ?? "");
    const match = raw.match(GRAMMAR_BLANK_PATTERN);
    let blank =
      getGrammarBlankPart(block) ||
      {
        type: "blank",
        name: block.id,
        wide: true,
        answer: "",
        hint: { dictionary: "", conjugation: "Now-later" },
      };

    if (!match) {
      blank.answer = "";
      syncGrammarParts(block, raw, "", blank);
      return;
    }

    const answer = String(match[1] ?? "").trim();
    blank.answer = answer;
    syncGrammarParts(
      block,
      raw.slice(0, match.index),
      raw.slice(match.index + match[0].length),
      blank
    );
  }

  function syncGrammarParts(block, before, after, blankPart) {
    const blank =
      blankPart ||
      getGrammarBlankPart(block) ||
      {
        type: "blank",
        name: block.id,
        wide: true,
        answer: "",
        hint: { dictionary: "", conjugation: "Now-later" },
      };
    block.parts = [];
    if (before) block.parts.push({ type: "text", value: before });
    block.parts.push(blank);
    if (after) block.parts.push({ type: "text", value: after });
  }

  function createBlock(type, index) {
    const n = (index || 0) + 1;
    const id = uid("blk");
    switch (type) {
      case "grammar-line":
        return normalizeGrammarBlock({
          id,
          type,
          register: "casual",
          negative: false,
          parts: [
            { type: "text", value: "" },
            { type: "blank", name: id, wide: true, answer: "", hint: { dictionary: "", conjugation: "Now-later" } },
          ],
        });
      case "open-line":
        return { id, type, topic: "", parts: [{ type: "blank", name: id, wide: true, multiline: true }] };
      case "video-prompt":
        return { id, type, prompt: "", recordLabel: "Record your answer" };
      case "listen-line":
        return ensureListenBlock({
          id,
          type,
          audioUrl: "",
          parts: [{ type: "blank", name: id, wide: true, answer: "" }],
        });
      default:
        return null;
    }
  }

  function cloneBlocks(blocks) {
    return JSON.parse(JSON.stringify(blocks || []));
  }

  function duplicateBlockData(block) {
    const oldId = block.id;
    const copy = JSON.parse(JSON.stringify(block));
    const newId = uid("blk");
    copy.id = newId;
    (copy.parts || []).forEach((part) => {
      if (part.type === "blank" && part.name === oldId) {
        part.name = newId;
      }
    });
    if (copy.type === "grammar-line") {
      normalizeGrammarBlock(copy);
    }
    return copy;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sectionsToBlocks(sections, assignmentRegister) {
    const blocks = [];
    (sections || []).forEach((sec) => {
      const sectionAudio =
        sec.mode === "audio-listening" ? String(sec.audioUrl || "").trim() : "";
      (sec.items || []).forEach((item) => {
        if (sec.mode === "video-response") {
          blocks.push({
            id: item.id || uid("blk"),
            type: "video-prompt",
            prompt: item.prompt || "",
            recordLabel: item.recordLabel || "Record your answer",
          });
        } else if (sec.mode === "grammar-blank") {
          blocks.push(
            normalizeGrammarBlock(
              {
                id: item.id || uid("blk"),
                type: "grammar-line",
                register: item.register || assignmentRegister || "casual",
                past: Boolean(item.past),
                negative: Boolean(item.negative),
                parts: JSON.parse(JSON.stringify(item.parts || [])),
              },
              assignmentRegister
            )
          );
        } else if (sec.mode === "context-blank") {
          blocks.push({
            id: item.id || uid("blk"),
            type: "open-line",
            topic: item.topic || "",
            parts: JSON.parse(JSON.stringify(item.parts || [])),
          });
        } else if (sec.mode === "audio-listening") {
          blocks.push(
            ensureListenBlock({
              id: item.id || uid("blk"),
              type: "listen-line",
              audioUrl: String(item.audioUrl || "").trim() || sectionAudio,
              parts: JSON.parse(JSON.stringify(item.parts || [])),
            })
          );
        }
      });
    });
    return normalizeBlocks(blocks);
  }

  function blocksToSections(blocks) {
    const sections = [];
    let i = 0;

    while (i < blocks.length) {
      const block = blocks[i];

      if (block.type === "grammar-line") {
        const sec = {
          id: uid("sec"),
          mode: "grammar-blank",
          title: "",
          instructions: "",
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
        if (sec.items[0]?.audioUrl) sec.audioUrl = sec.items[0].audioUrl;
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
    if (block.register === "polite") out.register = "polite";
    (block.parts || []).forEach((part) => {
      if (part.type === "text") {
        const value = String(part.value || "").trim();
        if (value) out.parts.push({ type: "text", value });
      } else if (part.type === "blank") {
        const blank = { type: "blank", name: part.name || out.id, wide: true };
        const answer = String(part.answer || "").trim();
        if (answer) blank.answer = answer;
        if (part.hint?.dictionary) {
          blank.hint = { dictionary: part.hint.dictionary, conjugation: part.hint.conjugation || "Now-later" };
        }
        out.parts.push(blank);
      }
    });
    return out;
  }

  function blockToOpenItem(block, index) {
    const out = { id: block.id || "open-" + (index + 1), parts: [] };
    const topic = String(block.topic || "").trim();
    if (topic) out.topic = topic;
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
    const out = { id: block.id || "listen-" + (index + 1), parts: [] };
    const audioUrl = String(block.audioUrl || "").trim();
    if (audioUrl) out.audioUrl = audioUrl;
    (block.parts || []).forEach((part) => {
      if (part.type === "blank") {
        const blank = { type: "blank", name: part.name || out.id, wide: true };
        const answer = String(part.answer || "").trim();
        if (answer) blank.answer = answer;
        out.parts.push(blank);
      }
    });
    return out;
  }

  /**
   * @param {HTMLElement} mount
   * @param {{ onChange?: () => void, getTitle?: () => string }} options
   */
  function mount(mount, options) {
    options = options || {};
    let state = { templateType: "custom", blocks: [] };
    let previewOpen = false;
    let canvasAssignmentId = null;
    let clipboardBlock = null;
    let ctxTargetIndex = null;
    const DRAG_TYPE = "application/x-hw-block-type";
    const REORDER_TYPE = "application/x-hw-block-reorder";

    mount.innerHTML = "";
    const root = document.createElement("div");
    root.className = "hw-builder";

    const toolbar = document.createElement("div");
    toolbar.className = "hw-builder__toolbar";
    toolbar.innerHTML =
      '<div class="hw-builder__toolbar-row">' +
      '<label class="hw-builder__toolbar-field">' +
      '<span class="hw-builder__toolbar-label">Start from a template</span>' +
      '<select class="hw-builder__toolbar-select" data-builder-template aria-label="Worksheet template">' +
      '<option value="">— Choose template —</option>' +
      "</select></label>" +
      '<label class="hw-builder__toolbar-field hw-builder__toolbar-field--sm hw-builder__toolbar-field--end">' +
      '<span class="hw-builder__toolbar-label">Load worksheet</span>' +
      '<select class="hw-builder__toolbar-select hw-builder__toolbar-select--sm" id="hw-teacher-maker-edit-select" aria-label="Choose worksheet to edit">' +
      '<option value="">— New blank sheet —</option>' +
      "</select></label></div>";

    const layout = document.createElement("div");
    layout.className = "hw-builder__layout";

    const palette = document.createElement("aside");
    palette.className = "hw-builder__palette";
    palette.innerHTML =
      '<h4 class="hw-builder__palette-title">Blocks</h4>' +
      '<p class="hw-builder__palette-hint">Click or drag blocks onto the canvas. Use ⠿ to reorder. Right-click a block to copy or paste.</p>';

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

    const dockSlot = document.createElement("div");
    dockSlot.className = "hw-builder__dock";
    dockSlot.id = "hw-teacher-maker-dock";
    palette.appendChild(dockSlot);

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "hw-builder__canvas-wrap";

    const titleField = document.createElement("label");
    titleField.className = "hw-builder__title-field hw-maker-field";
    titleField.innerHTML =
      'Grammar point / title<input type="text" name="grammarPoint" id="hw-teacher-maker-grammar" placeholder="Enter title here" autocomplete="off">';

    const canvas = document.createElement("div");
    canvas.className = "hw-builder__canvas";
    canvas.setAttribute("aria-label", "Worksheet blocks");
    canvasWrap.append(titleField, canvas);

    const previewMount = document.createElement("div");
    previewMount.className = "hw-builder__preview";
    previewMount.hidden = true;
    canvasWrap.appendChild(previewMount);

    layout.append(palette, canvasWrap);
    root.append(toolbar, layout);
    mount.appendChild(root);

    const ctxMenu = document.createElement("div");
    ctxMenu.className = "hw-builder__ctx-menu";
    ctxMenu.hidden = true;
    ctxMenu.setAttribute("role", "menu");
    ctxMenu.innerHTML =
      '<button type="button" class="hw-builder__ctx-item" role="menuitem" data-ctx="copy">Copy block</button>' +
      '<button type="button" class="hw-builder__ctx-item" role="menuitem" data-ctx="paste" disabled>Paste below</button>' +
      '<button type="button" class="hw-builder__ctx-item" role="menuitem" data-ctx="duplicate">Duplicate below</button>';
    root.appendChild(ctxMenu);

    const templateSelect = toolbar.querySelector("[data-builder-template]");
    TEMPLATE_ORDER.forEach((key) => {
      const t = TEMPLATES[key];
      if (!t) return;
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = t.label;
      templateSelect.appendChild(opt);
    });
    templateSelect?.addEventListener("change", () => {
      const key = templateSelect.value;
      if (!key) return;
      applyTemplate(key);
      templateSelect.value = "";
    });

    function notifyPreviewChange() {
      if (options.onPreviewChange) options.onPreviewChange(previewOpen);
    }

    function notifyChange() {
      if (options.onChange) options.onChange();
    }

    function hideCtxMenu() {
      ctxMenu.hidden = true;
    }

    function isEditableFieldTarget(target) {
      return Boolean(target?.closest("input, textarea, select, button"));
    }

    function positionCtxMenu(clientX, clientY) {
      ctxMenu.hidden = false;
      const pad = 8;
      const rect = ctxMenu.getBoundingClientRect();
      let left = clientX;
      let top = clientY;
      if (left + rect.width > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - rect.width - pad);
      }
      if (top + rect.height > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - rect.height - pad);
      }
      ctxMenu.style.left = left + "px";
      ctxMenu.style.top = top + "px";
    }

    function showCtxMenu(clientX, clientY, opts) {
      opts = opts || {};
      const copyBtn = ctxMenu.querySelector('[data-ctx="copy"]');
      const pasteBtn = ctxMenu.querySelector('[data-ctx="paste"]');
      const dupBtn = ctxMenu.querySelector('[data-ctx="duplicate"]');
      copyBtn.hidden = !opts.canCopy;
      dupBtn.hidden = !opts.canCopy;
      pasteBtn.hidden = false;
      pasteBtn.disabled = !clipboardBlock;
      pasteBtn.textContent = opts.pasteLabel || "Paste below";
      positionCtxMenu(clientX, clientY);
    }

    function copyBlock(index) {
      const block = state.blocks[index];
      if (!block) return;
      clipboardBlock = JSON.parse(JSON.stringify(block));
      ctxMenu.querySelector('[data-ctx="paste"]').disabled = false;
    }

    function pasteBlock(afterIndex) {
      if (!clipboardBlock) return;
      const block = duplicateBlockData(clipboardBlock);
      const insertAt =
        afterIndex === null || afterIndex === undefined
          ? state.blocks.length
          : Math.min(afterIndex + 1, state.blocks.length);
      state.blocks.splice(insertAt, 0, block);
      renderCanvas();
      notifyChange();
    }

    function duplicateBlock(index) {
      copyBlock(index);
      pasteBlock(index);
    }

    function openBlockContextMenu(e, index) {
      if (previewOpen || isEditableFieldTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      ctxTargetIndex = index;
      showCtxMenu(e.clientX, e.clientY, { canCopy: true, pasteLabel: "Paste below" });
    }

    function openCanvasContextMenu(e) {
      if (previewOpen || isEditableFieldTarget(e.target)) return;
      if (!clipboardBlock) return;
      e.preventDefault();
      ctxTargetIndex = null;
      showCtxMenu(e.clientX, e.clientY, { canCopy: false, pasteLabel: "Paste at end" });
    }

    ctxMenu.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ctx]");
      if (!btn || btn.disabled || btn.hidden) return;
      e.preventDefault();
      const action = btn.dataset.ctx;
      if (action === "copy" && ctxTargetIndex !== null) copyBlock(ctxTargetIndex);
      else if (action === "paste") pasteBlock(ctxTargetIndex);
      else if (action === "duplicate" && ctxTargetIndex !== null) duplicateBlock(ctxTargetIndex);
      hideCtxMenu();
    });

    document.addEventListener("click", hideCtxMenu);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideCtxMenu();
    });
    window.addEventListener("scroll", hideCtxMenu, true);
    canvasWrap.addEventListener("contextmenu", openCanvasContextMenu);

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

    function reorderBlock(fromIndex, toIndex) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
      if (fromIndex >= state.blocks.length || toIndex >= state.blocks.length) return;
      const [block] = state.blocks.splice(fromIndex, 1);
      state.blocks.splice(toIndex, 0, block);
      renderCanvas();
      notifyChange();
    }

    function isCanvasDrag(dataTransfer) {
      const types = Array.from(dataTransfer.types || []);
      return types.includes(DRAG_TYPE) || types.includes(REORDER_TYPE);
    }

    function bindDropZone(el) {
      el.addEventListener("dragover", (e) => {
        if (!isCanvasDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes(REORDER_TYPE) ? "move" : "copy";
        el.classList.add("hw-builder__drop-zone--over");
      });
      el.addEventListener("dragleave", (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove("hw-builder__drop-zone--over");
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("hw-builder__drop-zone--over");
        const reorderFrom = e.dataTransfer.getData(REORDER_TYPE);
        if (reorderFrom !== "") {
          const from = parseInt(reorderFrom, 10);
          if (!Number.isNaN(from)) reorderBlock(from, state.blocks.length - 1);
          return;
        }
        const type = e.dataTransfer.getData(DRAG_TYPE);
        if (type) addBlock(type);
      });
    }

    function bindBlockDropTarget(el, index) {
      el.addEventListener("dragover", (e) => {
        if (!isCanvasDrag(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = e.dataTransfer.types.includes(REORDER_TYPE) ? "move" : "copy";
        el.classList.add("hw-builder__block--drag-over");
      });
      el.addEventListener("dragleave", (e) => {
        if (!el.contains(e.relatedTarget)) el.classList.remove("hw-builder__block--drag-over");
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove("hw-builder__block--drag-over");
        const reorderFrom = e.dataTransfer.getData(REORDER_TYPE);
        if (reorderFrom !== "") {
          const from = parseInt(reorderFrom, 10);
          if (!Number.isNaN(from) && from !== index) reorderBlock(from, index);
          return;
        }
        const type = e.dataTransfer.getData(DRAG_TYPE);
        if (type) addBlock(type, index);
      });
    }

    function renderBlockEl(block, index) {
      if (block.type === "audio-clip") {
        block.type = "listen-line";
        ensureListenBlock(block);
      }
      const el = document.createElement("article");
      el.className =
        "hw-builder__block hw-builder__block--" +
        block.type +
        (block.negative ? " hw-builder__block--negative" : "") +
        (global.HwWorksheet?.tenseShouldShowPill?.(blockTense(block))
          ? " hw-builder__block--tense"
          : "");
      el.dataset.blockIndex = String(index);

      el.addEventListener("contextmenu", (e) => openBlockContextMenu(e, index));

      const head = document.createElement("div");
      head.className = "hw-builder__block-head";

      const numBadge = document.createElement("span");
      numBadge.className = "hw-item-num hw-item-num--builder";
      numBadge.setAttribute("aria-label", "Block " + (index + 1));
      numBadge.textContent = String(index + 1);
      head.appendChild(numBadge);

      const dragHandle = document.createElement("span");
      dragHandle.className = "hw-builder__block-drag";
      dragHandle.draggable = true;
      dragHandle.title = "Drag to reorder";
      dragHandle.setAttribute("aria-label", "Drag to reorder block");
      dragHandle.textContent = "⠿";
      dragHandle.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData(REORDER_TYPE, String(index));
        e.dataTransfer.effectAllowed = "move";
        el.classList.add("hw-builder__block--dragging");
      });
      dragHandle.addEventListener("dragend", () => {
        el.classList.remove("hw-builder__block--dragging");
        canvas.querySelectorAll(".hw-builder__block--drag-over").forEach((node) => {
          node.classList.remove("hw-builder__block--drag-over");
        });
      });
      head.appendChild(dragHandle);

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

      const tense = blockTense(block);
      if (global.HwWorksheet?.tenseShouldShowPill?.(tense)) {
        const badge = document.createElement("span");
        badge.className = "hw-tense-badge";
        badge.textContent = global.HwWorksheet.tensePillText(tense);
        head.appendChild(badge);
      }

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "hw-builder__remove-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removeBlock(index));
      head.appendChild(removeBtn);
      el.appendChild(head);

      bindBlockDropTarget(el, index);

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

      if (block.type === "listen-line") {
        ensureListenBlock(block);
        const blankPart =
          (block.parts || []).find((p) => p.type === "blank") ||
          { type: "blank", name: block.id, wide: true, answer: "" };

        const partsWrap = document.createElement("div");
        partsWrap.className = "hw-builder__parts hw-builder__parts--listen";

        const audioLabel = document.createElement("label");
        audioLabel.className = "hw-builder__audio-label";
        audioLabel.textContent = "Audio clip URL or file path";
        const audioInput = document.createElement("input");
        audioInput.type = "url";
        audioInput.className = "hw-builder__field hw-builder__field--compact";
        audioInput.placeholder = "https://… or /homework/audio/clip.mp3";
        audioInput.value = block.audioUrl || "";
        audioInput.addEventListener("input", () => {
          block.audioUrl = audioInput.value.trim();
          renderCanvas();
          notifyChange();
        });
        audioLabel.appendChild(audioInput);
        partsWrap.appendChild(audioLabel);

        if (block.audioUrl) {
          const preview = document.createElement("audio");
          preview.controls = true;
          preview.preload = "none";
          preview.className = "hw-builder__audio-preview";
          preview.src = block.audioUrl;
          preview.setAttribute("aria-label", "Preview audio clip");
          partsWrap.appendChild(preview);
        }

        const transcriptLabel = document.createElement("label");
        transcriptLabel.className = "hw-builder__field-label";
        transcriptLabel.textContent = "Answer key (optional)";
        const transcriptInput = document.createElement("input");
        transcriptInput.type = "text";
        transcriptInput.className = "hw-builder__field hw-builder__field--jp";
        transcriptInput.placeholder = "What students should hear";
        transcriptInput.value = blankPart.answer || "";
        transcriptInput.addEventListener("input", () => {
          blankPart.answer = transcriptInput.value;
          notifyChange();
        });
        transcriptLabel.appendChild(transcriptInput);
        partsWrap.appendChild(transcriptLabel);

        const transcriptHint = document.createElement("p");
        transcriptHint.className = "hw-builder__inline-hint";
        transcriptHint.textContent = "Students get a player above and write what they hear below.";
        partsWrap.appendChild(transcriptHint);

        el.appendChild(partsWrap);
        return el;
      }

      if (block.type === "open-line") {
        const topicLabel = document.createElement("label");
        topicLabel.className = "hw-builder__audio-label";
        topicLabel.textContent = "Topic / question for the student";
        const topicInput = document.createElement("textarea");
        topicInput.className = "hw-builder__field hw-builder__field--area hw-builder__field--compact-area";
        topicInput.rows = 2;
        topicInput.placeholder = "e.g. Describe your weekend using ～たことがある";
        topicInput.value = block.topic || "";
        topicInput.addEventListener("input", () => {
          block.topic = topicInput.value;
          notifyChange();
        });
        topicLabel.appendChild(topicInput);
        el.appendChild(topicLabel);
      }

      if (block.type === "grammar-line") {
        const partsWrap = document.createElement("div");
        partsWrap.className = "hw-builder__parts";
        const blankPart =
          getGrammarBlankPart(block) ||
          {
            type: "blank",
            name: block.id,
            wide: true,
            answer: "",
            hint: { dictionary: "", conjugation: "Now-later" },
          };

        const sentenceLabel = document.createElement("label");
        sentenceLabel.className = "hw-builder__field-label";
        sentenceLabel.textContent = "Sentence";
        const sentenceInput = document.createElement("textarea");
        sentenceInput.className = "hw-builder__field hw-builder__field--jp hw-builder__field--area hw-builder__field--compact-area";
        sentenceInput.rows = 2;
        sentenceInput.placeholder = "どうだった？レッスンはちょっと{難しかった}。";
        sentenceInput.value = grammarSentenceFromBlock(block);
        sentenceInput.addEventListener("input", () => {
          syncGrammarPartsFromSentence(block, sentenceInput.value);
          notifyChange();
        });
        sentenceLabel.appendChild(sentenceInput);
        partsWrap.appendChild(sentenceLabel);

        const sentenceHint = document.createElement("p");
        sentenceHint.className = "hw-builder__inline-hint";
        sentenceHint.textContent = "Put {answer} where the blank goes. Use {} if you do not need an answer key.";
        partsWrap.appendChild(sentenceHint);

        const hintRow = document.createElement("div");
        hintRow.className = "hw-builder__hint-row";
        const dictInput = document.createElement("input");
        dictInput.type = "text";
        dictInput.className = "hw-builder__field hw-builder__field--sm";
        dictInput.placeholder = "Dictionary form (e.g. むずかしい)";
        dictInput.value = blankPart.hint?.dictionary || "";
        dictInput.addEventListener("input", () => {
          blankPart.hint = blankPart.hint || { dictionary: "", conjugation: "Now-later" };
          blankPart.hint.dictionary = dictInput.value;
          syncGrammarPartsFromSentence(block, sentenceInput.value);
          notifyChange();
        });

        const tenseSelect = document.createElement("select");
        tenseSelect.className = "hw-builder__field hw-builder__field--sm hw-builder__tense-select";
        tenseSelect.setAttribute("aria-label", "Tense");
        const tenseOptions = global.HwWorksheet?.HINT_TENSE_OPTIONS || [
          { value: "Now-later", label: "Now-later" },
          { value: "～たい", label: "～たい" },
          { value: "てform", label: "てform" },
        ];
        const normalizeTense = global.HwWorksheet?.normalizeHintConjugation || ((v) => v || "Now-later");
        const currentTense = normalizeTense(blankPart.hint?.conjugation);
        const knownValues = tenseOptions.map((o) => o.value);
        const allTenseOptions = tenseOptions.slice();
        if (currentTense && !knownValues.includes(currentTense)) {
          allTenseOptions.push({ value: currentTense, label: currentTense });
        }
        allTenseOptions.forEach((opt) => {
          const option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.label;
          if (opt.value === currentTense) option.selected = true;
          tenseSelect.appendChild(option);
        });
        tenseSelect.addEventListener("change", () => {
          blankPart.hint = blankPart.hint || { dictionary: "", conjugation: "Now-later" };
          blankPart.hint.conjugation = tenseSelect.value;
          syncGrammarPartsFromSentence(block, sentenceInput.value);
          renderCanvas();
          notifyChange();
        });
        hintRow.append(dictInput, tenseSelect);
        partsWrap.appendChild(hintRow);

        const markerRow = document.createElement("div");
        markerRow.className = "hw-builder__marker-row";

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
        markerRow.appendChild(negLabel);
        partsWrap.appendChild(markerRow);

        const registerRow = document.createElement("div");
        registerRow.className = "hw-builder__register-row";
        const registerLabel = document.createElement("span");
        registerLabel.className = "hw-builder__register-label";
        registerLabel.textContent = "Register";
        registerRow.appendChild(registerLabel);

        const registerSwitch = document.createElement("div");
        registerSwitch.className = "hw-builder__register-switch";
        registerSwitch.setAttribute("role", "group");
        registerSwitch.setAttribute("aria-label", "Plain or polite");
        ["casual", "polite"].forEach((key) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className =
            "hw-builder__register-opt hw-builder__register-opt--" +
            key +
            ((block.register || "casual") === key ? " is-active" : "");
          btn.textContent = key === "casual" ? "Casual" : "Polite";
          btn.addEventListener("click", () => {
            block.register = key;
            renderCanvas();
            notifyChange();
          });
          registerSwitch.appendChild(btn);
        });
        registerRow.appendChild(registerSwitch);
        partsWrap.appendChild(registerRow);

        el.appendChild(partsWrap);
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
          blankInput.placeholder = part.multiline ? "Model response (optional)" : "Answer key (optional)";
          blankInput.value = part.answer || "";
          blankInput.addEventListener("input", () => {
            part.answer = blankInput.value;
            notifyChange();
          });
          partsWrap.appendChild(blankInput);
        }
      });

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
      canvasAssignmentId = null;
      state = {
        templateType: t.templateType,
        blocks: sectionsToBlocks(t.sections || []),
      };
      previewOpen = false;
      previewMount.hidden = true;
      canvas.hidden = false;
      titleField.hidden = false;
      notifyPreviewChange();
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
        sections: blocksToSections(normalizeBlocks(state.blocks)),
      };
      if (global.HwWorksheet?.enrichGrammarVariants) {
        global.HwWorksheet.enrichGrammarVariants(assignment);
      }
      return assignment;
    }

    function loadAssignment(assignment) {
      const data = assignment || {};
      canvasAssignmentId = data.id || null;
      state = {
        templateType: data.templateType || "custom",
        blocks: sectionsToBlocks(data.sections || [], data.register),
      };
      previewOpen = false;
      previewMount.hidden = true;
      canvas.hidden = false;
      titleField.hidden = false;
      notifyPreviewChange();
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
      titleField.hidden = true;
      notifyPreviewChange();
      previewMount.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function hidePreview() {
      previewOpen = false;
      previewMount.hidden = true;
      canvas.hidden = false;
      titleField.hidden = false;
      notifyPreviewChange();
    }

    applyTemplate("blank");

    return {
      toAssignment,
      loadAssignment,
      applyTemplate,
      showPreview,
      hidePreview,
      getState: () => state,
      getCanvasAssignmentId: () => canvasAssignmentId,
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
