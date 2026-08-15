/**
 * Flat-block worksheet builder — blocks are worksheet functions, not section types.
 */
(function (global) {
  const PALETTE = [
    { type: "grammar-line", label: "Blank sentence", hint: "Use {answer} for the blank" },
    { type: "open-line", label: "Open response", hint: "Written answer box" },
    { type: "translation-line", label: "Translation", hint: "Japanese → English blank" },
    { type: "star-line", label: "Sentence order", hint: "Drag & drop pieces" },
    {
      type: "mc-line",
      label: "Multiple choice",
      hint: "Click or drag into the blank",
    },
    { type: "video-prompt", label: "Video prompt", hint: "Student records an answer" },
    { type: "audio-prompt", label: "Audio prompt", hint: "Student records an answer" },
    {
      type: "audio-mimic",
      label: "Listen & mimic",
      hint: "Teacher audio + student records their version",
    },
    { type: "listen-line", label: "Audio listening", hint: "Immersion Kit clip + screenshot" },
  ];

  const TEMPLATE_ORDER = ["blank", "grammar", "application", "listening", "multipleChoice", "penPal"];
  const CUSTOM_TEMPLATES_KEY = "jlm-hw-worksheet-templates-v1";
  const CUSTOM_TEMPLATE_PREFIX = "custom:";

  /** Pen Pal ask, shown above the letter paper. */
  const PEN_PAL_INSTRUCTIONS =
    "愛子ちゃんがあなたの返事を待ってるのよ！\n早く手紙書いてあげて～";

  /** Built-in Pen Pal letter body (住田愛子 → フェイさん, 福井県鯖江市). */
  const PEN_PAL_LETTER_BODY =
    "初めまして！わたし、住田愛子っていいます。\n" +
    "福井県の鯖江市に住んでるよ～。中学二年生！\n" +
    "\n" +
    "フェイさんも中学生だってきいて、ペンパルしてみたくて手紙書いたネ♡\n" +
    "ちょっとどきどきしてるｗ\n" +
    "\n" +
    "わたしがめっちゃ好きなアニメはフルーツバスケット（略してフルバ）なの！！\n" +
    "まんがもくりかえしよんでるよ。フェイさんはなにか好きなまんがとかある？\n" +
    "\n" +
    "学校では男子サッカー部のマネージャーやってるよ。\n" +
    "練習見てると時間すぎるの早いネ。マジでつかれる日もあるけど、たのしい～。\n" +
    "\n" +
    "フェイさんの町はどんな感じ？学校のこととか、好きなこととか、おしえてほしいな♪\n" +
    "へんじ、まってるネ！\n" +
    "\n" +
    "ばいばい♡";

  function mcTemplateItem(id, prompt, choices, answer) {
    return {
      id,
      prompt,
      choices: choices.slice(0, 4),
      answer,
    };
  }

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
          items: [1, 2, 3, 4, 5, 6].map((n) => grammarItem(n)),
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
          instructions: "Listen to the clip and write down what you think it's saying in Japanese.",
          audioUrl: "",
          items: [1, 2, 3].map((n) => listenItem(n)),
        },
      ],
    },
    multipleChoice: {
      label: "Multiple Choice Quiz",
      templateType: "multiple-choice",
      sections: [
        {
          mode: "multiple-choice",
          title: "Multiple choice",
          instructions: "Click or drag the best answer into the blank.",
          items: [
            mcTemplateItem(
              "mc-1",
              "この甘い匂いを嗅ぐと、ケーキを______。",
              [
                "食べずにはいられない",
                "食べるどころではない",
                "食べるわけにはいかない",
                "食べないではおかない",
              ],
              "食べずにはいられない"
            ),
            mcTemplateItem(
              "mc-2",
              "周囲の反対______、彼女は起業を決めた。",
              ["をよそに", "をめぐって", "を通じて", "をはじめ"],
              "をよそに"
            ),
            mcTemplateItem(
              "mc-3",
              "管理職______、私情だけで判断するわけにはいかない。",
              ["ともなると", "にかかわらず", "といえども", "に限らず"],
              "ともなると"
            ),
            mcTemplateItem(
              "mc-4",
              "合格______、彼は遊びを一切やめた。",
              ["せんがために", "するがゆえに", "するにすぎず", "するばかりに"],
              "せんがために"
            ),
            mcTemplateItem(
              "mc-5",
              "目の前でたばこを吸うなんて、______。",
              ["迷惑極まりない", "迷惑きわめない", "迷惑に過ぎない", "迷惑でならない"],
              "迷惑極まりない"
            ),
          ],
        },
      ],
    },
    penPal: {
      label: "Pen Pal",
      templateType: "pen-pal",
      sections: [
        {
          mode: "context-blank",
          title: "Pen Pal",
          instructions: PEN_PAL_INSTRUCTIONS,
          items: [
            {
              id: "penpal-reply-1",
              letterTo: "フェイさん",
              letterFrom: "住田愛子",
              letterLocation: "福井県鯖江市",
              letterBody: PEN_PAL_LETTER_BODY,
              parts: [{ type: "blank", name: "penpal-reply-1", wide: true, multiline: true }],
            },
          ],
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
    return {
      id,
      audioUrl: "",
      imageUrl: "",
      englishAnswer: "",
      parts: [{ type: "blank", name: id, wide: true }],
    };
  }

  function ensureListenBlock(block) {
    block.audioUrl = String(block.audioUrl || "").trim();
    block.imageUrl = String(block.imageUrl || "").trim();
    block.englishAnswer = String(block.englishAnswer || "").trim();
    if (!block.parts?.length) {
      block.parts = [{ type: "blank", name: block.id, wide: true, answer: "" }];
    }
    return block;
  }

  function syncListenMediaPreview(previewMount, block) {
    if (!previewMount) return;
    previewMount.replaceChildren();
    if (block.imageUrl) {
      const thumb = document.createElement("img");
      thumb.className = "hw-builder__listen-thumb";
      thumb.src = block.imageUrl;
      thumb.alt = "Immersion Kit screenshot preview";
      thumb.loading = "lazy";
      previewMount.appendChild(thumb);
    }
    if (block.audioUrl) {
      const preview = document.createElement("audio");
      preview.controls = true;
      preview.preload = "none";
      preview.className = "hw-builder__audio-preview";
      preview.src = global.HwCompat?.normalizeMediaUrl
        ? global.HwCompat.normalizeMediaUrl(block.audioUrl)
        : block.audioUrl;
      preview.setAttribute("aria-label", "Preview audio clip");
      previewMount.appendChild(preview);
    }
  }

  function applyImmersionKitPaste(block, parsed) {
    if (!parsed) return false;
    let changed = false;
    if (parsed.audioUrl) {
      block.audioUrl = parsed.audioUrl;
      changed = true;
    }
    if (parsed.imageUrl) {
      block.imageUrl = parsed.imageUrl;
      changed = true;
    }
    return changed;
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
      .map((p) =>
        global.HwWorksheet?.textPartToEditorString
          ? global.HwWorksheet.textPartToEditorString(p)
          : p.value || ""
      )
      .join("");
    const after = parts
      .slice(blankIdx + 1)
      .filter((p) => p.type === "text")
      .map((p) =>
        global.HwWorksheet?.textPartToEditorString
          ? global.HwWorksheet.textPartToEditorString(p)
          : p.value || ""
      )
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
        return {
          id,
          type,
          topic: "",
          imageUrl: "",
          parts: [{ type: "blank", name: id, wide: true, multiline: true }],
        };
      case "video-prompt":
        return { id, type, prompt: "", recordLabel: "Record your answer" };
      case "audio-prompt":
        return { id, type, prompt: "", recordLabel: "Record your answer" };
      case "audio-mimic":
        return {
          id,
          type,
          prompt: "",
          audioUrl: "",
          promptMediaId: "",
          recordLabel: "Record your version",
        };
      case "listen-line":
        return ensureListenBlock({
          id,
          type,
          audioUrl: "",
          imageUrl: "",
          englishAnswer: "",
          parts: [{ type: "blank", name: id, wide: true, answer: "" }],
        });
      case "translation-line":
        return {
          id,
          type,
          japanese: "今日は学校に行きました。",
          englishAnswer: "I went to school today.",
          parts: [
            {
              type: "blank",
              name: id,
              wide: true,
              answer: "I went to school today.",
            },
          ],
        };
      case "star-line":
        return {
          id,
          type,
          tokens: [{ text: "", fixed: false }],
        };
      case "mc-line":
        return {
          id,
          type,
          prompt: "",
          choices: ["", "", "", ""],
          answer: "",
        };
      default:
        return null;
    }
  }

  function cloneBlocks(blocks) {
    return JSON.parse(JSON.stringify(blocks || []));
  }

  function slugifyTemplateLabel(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function loadCustomTemplates() {
    try {
      const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function writeCustomTemplates(list) {
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(list || []));
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

  function parseTopicVideoUrls(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && /youtube\.com|youtu\.be/i.test(line));
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
          const openBlock = {
            id: item.id || uid("blk"),
            type: "open-line",
            topic: item.topic || "",
            imageUrl: String(item.imageUrl || "").trim(),
            parts: JSON.parse(JSON.stringify(item.parts || [])),
          };
          if (Object.prototype.hasOwnProperty.call(item, "letterBody")) {
            openBlock.letterBody = String(item.letterBody || "");
            openBlock.letterTo = String(item.letterTo || "").trim();
            openBlock.letterFrom = String(item.letterFrom || "").trim();
            openBlock.letterLocation = String(item.letterLocation || "").trim();
            /* Pen Pal asks live in the block instructions, not in a prompt under the letter. */
            openBlock.topic = "";
          }
          blocks.push(openBlock);
        } else if (sec.mode === "audio-listening") {
          blocks.push(
            ensureListenBlock({
              id: item.id || uid("blk"),
              type: "listen-line",
              audioUrl: String(item.audioUrl || "").trim() || sectionAudio,
              imageUrl: String(item.imageUrl || "").trim(),
              englishAnswer: String(item.englishAnswer || "").trim(),
              parts: JSON.parse(JSON.stringify(item.parts || [])),
            })
          );
        } else if (sec.mode === "audio-prompt") {
          blocks.push({
            id: item.id || uid("blk"),
            type: "audio-prompt",
            prompt: item.prompt || "",
            recordLabel: item.recordLabel || "Record your answer",
          });
        } else if (sec.mode === "audio-mimic") {
          blocks.push({
            id: item.id || uid("blk"),
            type: "audio-mimic",
            prompt: item.prompt || "",
            audioUrl: String(item.audioUrl || "").trim(),
            promptMediaId: String(item.promptMediaId || "").trim(),
            recordLabel: item.recordLabel || "Record your version",
          });
        } else if (sec.mode === "translation") {
          const blank = (item.parts || []).find((p) => p.type === "blank");
          blocks.push({
            id: item.id || uid("blk"),
            type: "translation-line",
            japanese: item.japanese || "",
            englishAnswer: blank?.answer || "",
            parts: JSON.parse(JSON.stringify(item.parts || [])),
          });
        } else if (sec.mode === "star-order") {
          blocks.push({
            id: item.id || uid("blk"),
            type: "star-line",
            tokens: normalizeStarTokens(item),
          });
        } else if (sec.mode === "multiple-choice") {
          blocks.push(normalizeMcBlock({
            id: item.id || uid("blk"),
            type: "mc-line",
            prompt: String(item.prompt || ""),
            choices: Array.isArray(item.choices) ? item.choices.slice(0, 4) : ["", "", "", ""],
            answer: String(item.answer || ""),
          }));
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
        if (sec.items.some((item) => Object.prototype.hasOwnProperty.call(item, "letterBody"))) {
          sec.title = "Pen Pal";
          sec.instructions = PEN_PAL_INSTRUCTIONS;
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
        const sec = {
          id: uid("sec"),
          mode: "audio-listening",
          title: "",
          instructions: "Listen to the clip and write down what you think it's saying in Japanese.",
          audioUrl: "",
          items: [],
        };
        while (i < blocks.length && blocks[i].type === "listen-line") {
          sec.items.push(blockToListenItem(blocks[i], sec.items.length));
          i++;
        }
        if (sec.items[0]?.audioUrl) sec.audioUrl = sec.items[0].audioUrl;
        if (sec.items.length) sections.push(sec);
        continue;
      }

      if (block.type === "audio-prompt") {
        const sec = { id: uid("sec"), mode: "audio-prompt", title: "", instructions: "", items: [] };
        while (i < blocks.length && blocks[i].type === "audio-prompt") {
          const prompt = String(blocks[i].prompt || "").trim();
          if (prompt) {
            sec.items.push({
              id: blocks[i].id || "aud-" + (sec.items.length + 1),
              prompt,
              recordLabel: blocks[i].recordLabel || "Record your answer",
            });
          }
          i++;
        }
        if (sec.items.length) sections.push(sec);
        continue;
      }

      if (block.type === "audio-mimic") {
        const sec = {
          id: uid("sec"),
          mode: "audio-mimic",
          title: "",
          instructions: "Listen to the teacher, then record yourself sounding as close as you can.",
          items: [],
        };
        while (i < blocks.length && blocks[i].type === "audio-mimic") {
          const audioUrl = String(blocks[i].audioUrl || "").trim();
          if (audioUrl) {
            const item = {
              id: blocks[i].id || "mimic-" + (sec.items.length + 1),
              prompt: String(blocks[i].prompt || "").trim(),
              audioUrl,
              recordLabel: blocks[i].recordLabel || "Record your version",
            };
            const promptMediaId = String(blocks[i].promptMediaId || "").trim();
            if (promptMediaId) item.promptMediaId = promptMediaId;
            sec.items.push(item);
          }
          i++;
        }
        if (sec.items.length) sections.push(sec);
        continue;
      }

      if (block.type === "translation-line") {
        const sec = {
          id: uid("sec"),
          mode: "translation",
          title: "",
          instructions: "",
          items: [],
        };
        while (i < blocks.length && blocks[i].type === "translation-line") {
          const item = blockToTranslationItem(blocks[i], sec.items.length);
          if (item.japanese) sec.items.push(item);
          i++;
        }
        if (sec.items.length) sections.push(sec);
        continue;
      }

      if (block.type === "star-line") {
        const sec = {
          id: uid("sec"),
          mode: "star-order",
          title: "",
          instructions: "Drag/drop the words to form the best answer!",
          items: [],
        };
        while (i < blocks.length && blocks[i].type === "star-line") {
          const item = blockToStarItem(blocks[i], sec.items.length);
          if (item.pieces?.length) sec.items.push(item);
          i++;
        }
        if (sec.items.length) sections.push(sec);
        continue;
      }

      if (block.type === "mc-line") {
        const sec = {
          id: uid("sec"),
          mode: "multiple-choice",
          title: "",
          instructions: "Click or drag the best answer into the blank.",
          items: [],
        };
        while (i < blocks.length && blocks[i].type === "mc-line") {
          const item = blockToMcItem(blocks[i], sec.items.length);
          if (item.prompt && item.choices?.length) sec.items.push(item);
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
    if (block.register === "polite") out.register = "polite";
    (block.parts || []).forEach((part) => {
      if (part.type === "text") {
        if (part.ruby?.length) {
          out.parts.push({ type: "text", ruby: JSON.parse(JSON.stringify(part.ruby)) });
        } else {
          const value = String(part.value || "").trim();
          if (value) out.parts.push({ type: "text", value });
        }
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

  function blockToTranslationItem(block, index) {
    const out = {
      id: block.id || "tr-" + (index + 1),
      japanese: String(block.japanese || "").trim(),
      parts: [],
    };
    const answer = String(block.englishAnswer || "").trim();
    const blank = {
      type: "blank",
      name: block.id || out.id,
      wide: true,
    };
    if (answer) blank.answer = answer;
    out.parts.push(blank);
    return out;
  }

  function normalizeStarTokens(source, options) {
    const keepEmpty = options?.keepEmpty === true;
    if (Array.isArray(source?.tokens) && (source.tokens.length || keepEmpty)) {
      const mapped = source.tokens.map((t) => ({
        text: String(t.text || "").trim(),
        fixed: !!t.fixed,
      }));
      return keepEmpty ? mapped : mapped.filter((t) => t.text);
    }
    const tokens = [];
    const prefix = String(source?.prefix || "").trim();
    const suffix = String(source?.suffix ?? "").trim();
    const pieces = (source?.pieces || []).map((p) => String(p).trim()).filter(Boolean);
    if (prefix) tokens.push({ text: prefix, fixed: true });
    pieces.forEach((p) => tokens.push({ text: p, fixed: false }));
    if (suffix) tokens.push({ text: suffix, fixed: true });
    if (!tokens.length) {
      return keepEmpty ? [{ text: "", fixed: false }] : [];
    }
    return tokens;
  }

  function draggablePiecesFromTokens(tokens) {
    return tokens.filter((t) => !t.fixed).map((t) => t.text);
  }

  function blockToStarItem(block, index) {
    const tokens = normalizeStarTokens(block);
    const pieces = draggablePiecesFromTokens(tokens);
    return {
      id: block.id || "star-" + (index + 1),
      tokens,
      prefix: String(block.prefix || "").trim(),
      suffix: String(block.suffix || "。").trim(),
      pieces,
    };
  }

  function normalizeMcChoices(choices) {
    const list = Array.isArray(choices) ? choices.map((c) => String(c ?? "")) : [];
    while (list.length < 4) list.push("");
    return list.slice(0, 4);
  }

  function normalizeMcBlock(block) {
    const choices = normalizeMcChoices(block.choices);
    const answer = String(block.answer || "").trim();
    return {
      id: block.id,
      type: "mc-line",
      prompt: String(block.prompt || ""),
      choices,
      answer: answer || choices.find((c) => String(c).trim()) || "",
    };
  }

  function blockToMcItem(block, index) {
    const choices = normalizeMcChoices(block.choices)
      .map((c) => String(c || "").trim())
      .filter(Boolean)
      .slice(0, 4);
    const prompt = String(block.prompt || "").trim();
    let answer = String(block.answer || "").trim();
    if (answer && !choices.includes(answer)) {
      /* Keep teacher answer even if it drifted from the four chips. */
    }
    if (!answer && choices.length) answer = choices[0];
    return {
      id: block.id || "mc-" + (index + 1),
      prompt,
      choices,
      answer,
    };
  }

  function blockToOpenItem(block, index) {
    const out = { id: block.id || "open-" + (index + 1), parts: [] };
    const isLetter = Object.prototype.hasOwnProperty.call(block, "letterBody");
    const topic = String(block.topic || "").trim();
    if (topic && !isLetter) out.topic = topic;
    const imageUrl = String(block.imageUrl || "").trim();
    if (imageUrl) out.imageUrl = imageUrl;
    if (isLetter) {
      out.letterBody = String(block.letterBody || "");
      const letterTo = String(block.letterTo || "").trim();
      const letterFrom = String(block.letterFrom || "").trim();
      const letterLocation = String(block.letterLocation || "").trim();
      if (letterTo) out.letterTo = letterTo;
      if (letterFrom) out.letterFrom = letterFrom;
      if (letterLocation) out.letterLocation = letterLocation;
    }
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
    const imageUrl = String(block.imageUrl || "").trim();
    if (imageUrl) out.imageUrl = imageUrl;
    const englishAnswer = String(block.englishAnswer || "").trim();
    if (englishAnswer) out.englishAnswer = englishAnswer;
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
    let state = {
      templateType: "custom",
      blocks: [],
      topicExplanation: "",
      topicExplanationAudioUrl: "",
      topicExplanationMediaId: "",
      topicVideoText: "",
    };
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
      '<span class="hw-builder__toolbar-label">Most recently used</span>' +
      '<select class="hw-builder__toolbar-select hw-builder__toolbar-select--sm" id="hw-teacher-maker-edit-select" aria-label="Choose worksheet to edit">' +
      '<option value="">— New blank sheet —</option>' +
      "</select></label></div>";

    const layout = document.createElement("div");
    layout.className = "hw-builder__layout";

    const palette = document.createElement("aside");
    palette.className = "hw-builder__palette";
    palette.innerHTML =
      '<h4 class="hw-builder__palette-title">Blocks</h4>' +
      '<p class="hw-builder__palette-hint">Drag blocks onto the canvas · ⠿ reorder · right-click copy/paste</p>';

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

    const metaStack = document.createElement("div");
    metaStack.className = "hw-builder__meta-stack";

    const titleField = document.createElement("label");
    titleField.className = "hw-builder__field-row hw-maker-field";
    titleField.innerHTML =
      'Grammar point / title<input type="text" name="grammarPoint" id="hw-teacher-maker-grammar" placeholder="Enter title here" autocomplete="off">';

    const topicFields = document.createElement("div");
    topicFields.className = "hw-builder__topic-fields";

    const explainWrap = document.createElement("div");
    explainWrap.className = "hw-builder__field-row";
    const explainInput = document.createElement("textarea");
    explainInput.className = "hw-builder__topic-textarea";
    explainInput.rows = 2;
    explainInput.setAttribute("aria-label", "Grammar description");
    explainInput.placeholder =
      "Grammar description";
    explainInput.addEventListener("input", () => {
      state.topicExplanation = explainInput.value;
      notifyChange();
    });
    explainWrap.appendChild(explainInput);

    const topicAudioMount = document.createElement("div");
    topicAudioMount.className = "hw-builder__topic-audio";
    explainWrap.appendChild(topicAudioMount);
    topicFields.appendChild(explainWrap);

    function remountTopicAudioClip() {
      topicAudioMount.replaceChildren();
      delete topicAudioMount.dataset.bound;
      const teacherUsername = String(
        global.HwAuth?.getTeacherSession?.()?.username ||
          global.HwAuth?.getSession?.()?.username ||
          ""
      ).trim();
      if (global.HwAudioInline?.mountTeacherClip) {
        global.HwAudioInline.mountTeacherClip(topicAudioMount, {
          teacherUsername,
          audioUrl: state.topicExplanationAudioUrl || "",
          mediaId: state.topicExplanationMediaId || "",
          startLabel: "Record grammar audio",
          uploadLabel: "Upload audio",
          urlLabel: "Or paste grammar audio URL",
          previewAriaLabel: "Grammar description audio",
          onChange: (next) => {
            state.topicExplanationAudioUrl = String(next?.audioUrl || "").trim();
            state.topicExplanationMediaId = String(next?.mediaId || "").trim();
            notifyChange();
          },
        });
        return;
      }
      const fallbackLabel = document.createElement("label");
      fallbackLabel.className = "hw-builder__audio-label";
      fallbackLabel.textContent = "Grammar audio URL";
      const audioInput = document.createElement("input");
      audioInput.type = "text";
      audioInput.className = "hw-builder__field hw-builder__field--compact";
      audioInput.spellcheck = false;
      audioInput.placeholder = "Paste audio URL";
      audioInput.value = state.topicExplanationAudioUrl || "";
      audioInput.addEventListener("input", () => {
        state.topicExplanationAudioUrl = audioInput.value.trim();
        state.topicExplanationMediaId = "";
        notifyChange();
      });
      fallbackLabel.appendChild(audioInput);
      topicAudioMount.appendChild(fallbackLabel);
    }

    const videosWrap = document.createElement("div");
    videosWrap.className = "hw-builder__field-row";
    const videosInput = document.createElement("textarea");
    videosInput.className = "hw-builder__topic-textarea hw-builder__topic-textarea--links";
    videosInput.rows = 2;
    videosInput.setAttribute("aria-label", "YouTube link");
    videosInput.placeholder = "YouTube link — one link per line";
    videosInput.addEventListener("input", () => {
      state.topicVideoText = videosInput.value;
      notifyChange();
    });
    videosWrap.appendChild(videosInput);
    topicFields.appendChild(videosWrap);

    const collapseAllRow = document.createElement("div");
    collapseAllRow.className = "hw-builder__collapse-all-row";
    const collapseAllBtn = document.createElement("button");
    collapseAllBtn.type = "button";
    collapseAllBtn.className = "hw-builder__collapse-all-btn";
    collapseAllBtn.textContent = "Collapse all";
    collapseAllBtn.hidden = true;
    collapseAllBtn.addEventListener("click", () => {
      if (!state.blocks.length) return;
      const expand = state.blocks.every((b) => b.collapsed);
      state.blocks.forEach((b) => {
        b.collapsed = !expand;
      });
      renderCanvas();
      notifyChange();
    });
    collapseAllRow.appendChild(collapseAllBtn);
    topicFields.appendChild(collapseAllRow);

    function updateCollapseAllBtn() {
      if (!state.blocks.length) {
        collapseAllBtn.hidden = true;
        return;
      }
      collapseAllBtn.hidden = false;
      const allCollapsed = state.blocks.every((b) => b.collapsed);
      collapseAllBtn.textContent = allCollapsed ? "Expand all" : "Collapse all";
    }

    metaStack.append(titleField, topicFields);

    const canvas = document.createElement("div");
    canvas.className = "hw-builder__canvas";
    canvas.setAttribute("aria-label", "Worksheet blocks");
    canvasWrap.append(metaStack, canvas);

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
    function refreshTemplateSelectOptions() {
      if (!templateSelect) return;
      const keep = templateSelect.value;
      templateSelect.innerHTML = '<option value="">— Choose template —</option>';

      const builtInGroup = document.createElement("optgroup");
      builtInGroup.label = "Built-in";
      TEMPLATE_ORDER.forEach((key) => {
        const t = TEMPLATES[key];
        if (!t) return;
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = t.label;
        builtInGroup.appendChild(opt);
      });
      templateSelect.appendChild(builtInGroup);

      const custom = loadCustomTemplates();
      if (custom.length) {
        const customGroup = document.createElement("optgroup");
        customGroup.label = "My templates";
        custom.forEach((entry) => {
          const opt = document.createElement("option");
          opt.value = CUSTOM_TEMPLATE_PREFIX + entry.id;
          opt.textContent = entry.label || entry.id;
          customGroup.appendChild(opt);
        });
        templateSelect.appendChild(customGroup);
      }

      if (keep && templateSelect.querySelector('option[value="' + keep + '"]')) {
        templateSelect.value = keep;
      }
    }

    refreshTemplateSelectOptions();
    templateSelect?.addEventListener("change", () => {
      const key = templateSelect.value;
      if (!key) return;
      if (key.startsWith(CUSTOM_TEMPLATE_PREFIX)) {
        applyCustomTemplateById(key.slice(CUSTOM_TEMPLATE_PREFIX.length));
      } else {
        applyTemplate(key);
      }
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

    function blockSummary(block) {
      function clip(text, max) {
        const t = String(text || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!t) return "";
        return t.length > max ? t.slice(0, max) + "…" : t;
      }

      if (block.type === "video-prompt") {
        return clip(block.prompt) || "Video prompt";
      }
      if (block.type === "audio-prompt") {
        return clip(block.prompt) || "Audio prompt";
      }
      if (block.type === "audio-mimic") {
        return (
          clip(block.prompt) ||
          (block.audioUrl ? "Teacher audio ready" : "Listen & mimic")
        );
      }
      if (block.type === "listen-line") {
        const jp = (block.parts || []).find((p) => p.type === "blank")?.answer;
        return clip(jp || block.englishAnswer) || (block.audioUrl ? "Audio clip added" : "Listening block");
      }
      if (block.type === "open-line") {
        if (Object.prototype.hasOwnProperty.call(block, "letterBody")) return "Pen Pal letter";
        return clip(block.topic) || (block.imageUrl ? "Open response + image" : "Open response");
      }
      if (block.type === "grammar-line") {
        return clip(grammarSentenceFromBlock(block)) || "Blank sentence";
      }
      if (block.type === "translation-line") {
        return clip(block.japanese) || "Translation";
      }
      if (block.type === "star-line") {
        const tokens = normalizeStarTokens(block);
        const preview = tokens
          .map((t) => String(t.text || "").trim())
          .filter(Boolean)
          .join("");
        return clip(preview) || "Sentence order";
      }
      if (block.type === "mc-line") {
        return clip(block.prompt) || "Multiple choice";
      }
      return "Block";
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
        (block.negative ? " hw-builder__block--negative" : "");
      el.dataset.blockIndex = String(index);

      el.addEventListener("contextmenu", (e) => openBlockContextMenu(e, index));

      const head = document.createElement("div");
      head.className = "hw-builder__block-head";

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

      if (block.type === "grammar-line") {
        const tense = blockTense(block);
        if (global.HwWorksheet?.tenseShouldShowPill?.(tense)) {
          const badge = document.createElement("span");
          badge.className = "hw-tense-badge";
          badge.textContent = global.HwWorksheet.tensePillText(tense);
          head.appendChild(badge);
        }
      }

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "hw-builder__remove-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => removeBlock(index));

      const summaryEl = document.createElement("span");
      summaryEl.className = "hw-builder__block-summary";
      summaryEl.textContent = blockSummary(block);
      summaryEl.hidden = !block.collapsed;
      head.appendChild(summaryEl);

      const collapseBtn = document.createElement("button");
      collapseBtn.type = "button";
      collapseBtn.className = "hw-builder__collapse-btn";
      collapseBtn.textContent = block.collapsed ? "Expand" : "Collapse";
      collapseBtn.setAttribute("aria-expanded", block.collapsed ? "false" : "true");
      collapseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        block.collapsed = !block.collapsed;
        renderCanvas();
        notifyChange();
      });
      head.appendChild(collapseBtn);
      head.appendChild(removeBtn);
      el.appendChild(head);

      if (block.collapsed) el.classList.add("hw-builder__block--collapsed");

      const body = document.createElement("div");
      body.className = "hw-builder__block-body";
      body.hidden = Boolean(block.collapsed);
      el.appendChild(body);

      bindBlockDropTarget(el, index);

      if (block.type === "video-prompt") {
        const prompt = document.createElement("textarea");
        prompt.className = "hw-builder__field hw-builder__field--area";
        prompt.rows = 2;
        prompt.placeholder = "Question or prompt for the student";
        prompt.value = block.prompt || "";
        prompt.addEventListener("input", () => {
          block.prompt = prompt.value;
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
          notifyChange();
        });
        body.appendChild(prompt);
        return el;
      }

      if (block.type === "audio-prompt") {
        const prompt = document.createElement("textarea");
        prompt.className = "hw-builder__field hw-builder__field--area";
        prompt.rows = 2;
        prompt.placeholder = "Question or prompt for the student to answer on audio";
        prompt.value = block.prompt || "";
        prompt.addEventListener("input", () => {
          block.prompt = prompt.value;
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
          notifyChange();
        });
        body.appendChild(prompt);
        return el;
      }

      if (block.type === "audio-mimic") {
        const hint = document.createElement("p");
        hint.className = "hw-builder__inline-hint";
        hint.textContent =
          "Record the phrase students should copy (or paste a URL). Students hear yours, then record theirs.";
        body.appendChild(hint);

        const promptLabel = document.createElement("label");
        promptLabel.className = "hw-builder__field-label";
        promptLabel.textContent = "Phrase / note (optional)";
        const prompt = document.createElement("textarea");
        prompt.className = "hw-builder__field hw-builder__field--area hw-builder__field--compact-area";
        prompt.rows = 2;
        prompt.placeholder = "e.g. Could we reschedule for Thursday?";
        prompt.value = block.prompt || "";
        prompt.addEventListener("input", () => {
          block.prompt = prompt.value;
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
          notifyChange();
        });
        promptLabel.appendChild(prompt);
        body.appendChild(promptLabel);

        const clipMount = document.createElement("div");
        clipMount.className = "hw-builder__mimic-clip";
        body.appendChild(clipMount);

        const teacherUsername = String(
          global.HwAuth?.getTeacherSession?.()?.username ||
            global.HwAuth?.getSession?.()?.username ||
            ""
        ).trim();

        if (global.HwAudioInline?.mountTeacherClip) {
          global.HwAudioInline.mountTeacherClip(clipMount, {
            teacherUsername,
            audioUrl: block.audioUrl || "",
            mediaId: block.promptMediaId || "",
            onChange: (next) => {
              block.audioUrl = String(next?.audioUrl || "").trim();
              block.promptMediaId = String(next?.mediaId || "").trim();
              if (block.collapsed) summaryEl.textContent = blockSummary(block);
              notifyChange();
            },
          });
        } else {
          const fallbackLabel = document.createElement("label");
          fallbackLabel.className = "hw-builder__audio-label";
          fallbackLabel.textContent = "Teacher audio URL";
          const audioInput = document.createElement("input");
          audioInput.type = "text";
          audioInput.className = "hw-builder__field hw-builder__field--compact";
          audioInput.spellcheck = false;
          audioInput.placeholder = "Paste audio URL";
          audioInput.value = block.audioUrl || "";
          audioInput.addEventListener("input", () => {
            block.audioUrl = audioInput.value.trim();
            block.promptMediaId = "";
            if (block.collapsed) summaryEl.textContent = blockSummary(block);
            notifyChange();
          });
          fallbackLabel.appendChild(audioInput);
          body.appendChild(fallbackLabel);
        }
        return el;
      }

      if (block.type === "listen-line") {
        ensureListenBlock(block);
        const blankPart =
          (block.parts || []).find((p) => p.type === "blank") ||
          { type: "blank", name: block.id, wide: true, answer: "" };

        const partsWrap = document.createElement("div");
        partsWrap.className = "hw-builder__parts hw-builder__parts--listen";

        const previewMount = document.createElement("div");
        previewMount.className = "hw-builder__listen-preview";

        const audioLabel = document.createElement("label");
        audioLabel.className = "hw-builder__audio-label";
        audioLabel.textContent = "Immersion Kit audio URL";
        const audioInput = document.createElement("input");
        audioInput.type = "text";
        audioInput.className = "hw-builder__field hw-builder__field--compact";
        audioInput.spellcheck = false;
        audioInput.placeholder = "Paste audio URL from immersionkit.com";
        audioInput.value = block.audioUrl || "";
        audioInput.addEventListener("input", () => {
          block.audioUrl = audioInput.value.trim();
          syncListenMediaPreview(previewMount, block);
          notifyChange();
        });
        audioInput.addEventListener("paste", (e) => {
          const text = e.clipboardData?.getData("text") || "";
          const parsed = global.HwWorksheet?.parseImmersionKitMediaPaste?.(text);
          if (!applyImmersionKitPaste(block, parsed)) return;
          e.preventDefault();
          audioInput.value = block.audioUrl || "";
          imageInput.value = block.imageUrl || "";
          syncListenMediaPreview(previewMount, block);
          notifyChange();
        });
        audioLabel.appendChild(audioInput);
        partsWrap.appendChild(audioLabel);

        const imageLabel = document.createElement("label");
        imageLabel.className = "hw-builder__audio-label";
        imageLabel.textContent = "Screenshot URL (Immersion Kit)";
        const imageInput = document.createElement("input");
        imageInput.type = "text";
        imageInput.className = "hw-builder__field hw-builder__field--compact";
        imageInput.spellcheck = false;
        imageInput.placeholder = "Paste screenshot URL from the same clip";
        imageInput.value = block.imageUrl || "";
        imageInput.addEventListener("input", () => {
          block.imageUrl = imageInput.value.trim();
          syncListenMediaPreview(previewMount, block);
          notifyChange();
        });
        imageInput.addEventListener("paste", (e) => {
          const text = e.clipboardData?.getData("text") || "";
          const parsed = global.HwWorksheet?.parseImmersionKitMediaPaste?.(text);
          if (!applyImmersionKitPaste(block, parsed)) return;
          e.preventDefault();
          audioInput.value = block.audioUrl || "";
          imageInput.value = block.imageUrl || "";
          syncListenMediaPreview(previewMount, block);
          notifyChange();
        });
        imageLabel.appendChild(imageInput);
        partsWrap.appendChild(imageLabel);

        partsWrap.appendChild(previewMount);
        syncListenMediaPreview(previewMount, block);

        const transcriptLabel = document.createElement("label");
        transcriptLabel.className = "hw-builder__field-label";
        transcriptLabel.textContent = "Japanese answer (optional)";
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

        const englishLabel = document.createElement("label");
        englishLabel.className = "hw-builder__field-label";
        englishLabel.textContent = "English meaning (optional)";
        const englishInput = document.createElement("textarea");
        englishInput.className = "hw-builder__field hw-builder__field--area hw-builder__field--compact-area";
        englishInput.rows = 2;
        englishInput.placeholder = "e.g. I want to go to city hall.";
        englishInput.value = block.englishAnswer || "";
        englishInput.addEventListener("input", () => {
          block.englishAnswer = englishInput.value.trim();
          notifyChange();
        });
        englishLabel.appendChild(englishInput);
        partsWrap.appendChild(englishLabel);

        body.appendChild(partsWrap);
        return el;
      }

      if (block.type === "open-line") {
        const isLetterBlock = Object.prototype.hasOwnProperty.call(block, "letterBody");
        if (isLetterBlock) {
          const letterNote = document.createElement("p");
          letterNote.className = "hw-builder__penpal-note";
          letterNote.textContent =
            "Pen Pal letter — students see handwritten letter paper (AP Japanese) with a show/hide button. The ask above it is “" +
            PEN_PAL_INSTRUCTIONS +
            "”.";
          body.appendChild(letterNote);

          const toLabel = document.createElement("label");
          toLabel.className = "hw-builder__audio-label";
          toLabel.textContent = "To";
          const toInput = document.createElement("input");
          toInput.type = "text";
          toInput.className = "hw-builder__field";
          toInput.placeholder = "フェイさん";
          toInput.value = block.letterTo || "";
          toInput.addEventListener("input", () => {
            block.letterTo = toInput.value;
            notifyChange();
          });
          toLabel.appendChild(toInput);
          body.appendChild(toLabel);

          const fromLabel = document.createElement("label");
          fromLabel.className = "hw-builder__audio-label";
          fromLabel.textContent = "From";
          const fromInput = document.createElement("input");
          fromInput.type = "text";
          fromInput.className = "hw-builder__field";
          fromInput.placeholder = "住田愛子";
          fromInput.value = block.letterFrom || "";
          fromInput.addEventListener("input", () => {
            block.letterFrom = fromInput.value;
            notifyChange();
          });
          fromLabel.appendChild(fromInput);
          body.appendChild(fromLabel);

          const locLabel = document.createElement("label");
          locLabel.className = "hw-builder__audio-label";
          locLabel.textContent = "Location";
          const locInput = document.createElement("input");
          locInput.type = "text";
          locInput.className = "hw-builder__field";
          locInput.placeholder = "福井県鯖江市";
          locInput.value = block.letterLocation || "";
          locInput.addEventListener("input", () => {
            block.letterLocation = locInput.value;
            notifyChange();
          });
          locLabel.appendChild(locInput);
          body.appendChild(locLabel);

          const bodyLabel = document.createElement("label");
          bodyLabel.className = "hw-builder__audio-label";
          bodyLabel.textContent = "Letter body (Japanese)";
          const bodyInput = document.createElement("textarea");
          bodyInput.className = "hw-builder__field hw-builder__field--area hw-builder__field--penpal";
          bodyInput.rows = 12;
          bodyInput.placeholder = "Letter text…";
          bodyInput.value = block.letterBody || "";
          bodyInput.addEventListener("input", () => {
            block.letterBody = bodyInput.value;
            if (block.collapsed) summaryEl.textContent = blockSummary(block);
            notifyChange();
          });
          bodyLabel.appendChild(bodyInput);
          body.appendChild(bodyLabel);
        }

        if (!isLetterBlock) {
          const topicLabel = document.createElement("label");
          topicLabel.className = "hw-builder__audio-label";
          topicLabel.textContent = "Topic / question for the student";
          const topicInput = document.createElement("textarea");
          topicInput.className =
            "hw-builder__field hw-builder__field--area hw-builder__field--compact-area";
          topicInput.rows = 2;
          topicInput.placeholder = "e.g. Describe your weekend using ～たことがある";
          topicInput.value = block.topic || "";
          topicInput.addEventListener("input", () => {
            block.topic = topicInput.value;
            if (block.collapsed) summaryEl.textContent = blockSummary(block);
            notifyChange();
          });
          topicLabel.appendChild(topicInput);
          body.appendChild(topicLabel);
        }

        const imageZone = document.createElement("div");
        imageZone.className = "hw-builder__image-drop";
        imageZone.tabIndex = 0;
        imageZone.setAttribute(
          "aria-label",
          "Paste or drop an image for this open response"
        );

        const imageHint = document.createElement("p");
        imageHint.className = "hw-builder__image-drop-hint";
        imageHint.textContent = "Paste (Ctrl+V) or drop an image here — no need to save a file first.";

        const thumbWrap = document.createElement("div");
        thumbWrap.className = "hw-builder__image-drop-thumb-wrap";
        thumbWrap.hidden = !String(block.imageUrl || "").trim();

        const thumb = document.createElement("img");
        thumb.className = "hw-builder__image-drop-thumb";
        thumb.alt = "Open response image";
        if (block.imageUrl) thumb.src = block.imageUrl;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn--ghost btn--sm hw-builder__image-drop-remove";
        removeBtn.textContent = "Remove image";

        const statusEl = document.createElement("p");
        statusEl.className = "hw-builder__image-drop-status";
        statusEl.hidden = true;

        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/jpeg,image/png,image/gif,image/webp,image/*";
        fileInput.hidden = true;

        const pickBtn = document.createElement("button");
        pickBtn.type = "button";
        pickBtn.className = "btn btn--ghost btn--sm";
        pickBtn.textContent = "Choose image…";

        function setImageStatus(msg, isError) {
          if (!msg) {
            statusEl.hidden = true;
            statusEl.textContent = "";
            statusEl.classList.remove("hw-maker-status--error");
            return;
          }
          statusEl.hidden = false;
          statusEl.textContent = msg;
          statusEl.classList.toggle("hw-maker-status--error", !!isError);
        }

        function refreshImageUi() {
          const url = String(block.imageUrl || "").trim();
          thumbWrap.hidden = !url;
          if (url) thumb.src = url;
          else thumb.removeAttribute("src");
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
        }

        async function prepareImageFile(file) {
          if (!file || !String(file.type || "").startsWith("image/")) {
            throw new Error("Use a JPEG, PNG, GIF, or WebP image.");
          }
          if (file.size <= 1.5 * 1024 * 1024 && ["image/jpeg", "image/webp"].includes(file.type)) {
            return file;
          }
          const bitmap = await createImageBitmap(file);
          const maxSide = 1600;
          const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
          const width = Math.max(1, Math.round(bitmap.width * scale));
          const height = Math.max(1, Math.round(bitmap.height * scale));
          const canvasEl = document.createElement("canvas");
          canvasEl.width = width;
          canvasEl.height = height;
          const ctx = canvasEl.getContext("2d");
          if (!ctx) return file;
          ctx.drawImage(bitmap, 0, 0, width, height);
          bitmap.close();
          const blob = await new Promise((resolve) => {
            canvasEl.toBlob(resolve, "image/jpeg", 0.85);
          });
          if (!blob) return file;
          const baseName = String(file.name || "image").replace(/\.[^.]+$/, "") || "image";
          return new File([blob], baseName + ".jpg", { type: "image/jpeg" });
        }

        async function uploadOpenImage(file) {
          const session =
            options.getTeacherSession?.() ||
            global.HwAuth?.getTeacherSession?.() ||
            global.HwAuth?.getSession?.();
          if (!session || session.role !== "teacher") {
            throw new Error("Teacher login required.");
          }
          const prepared = await prepareImageFile(file);
          if (prepared.size > 4 * 1024 * 1024) {
            throw new Error("Image must be under 4 MB.");
          }
          setImageStatus("Uploading image…");
          const body = new FormData();
          body.append("teacherUsername", session.username);
          body.append("image", prepared, prepared.name || "image.jpg");
          const res = await fetch("/api/homework-worksheet-image-upload", {
            method: "POST",
            body,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Could not upload image.");
          block.imageUrl = String(data.url || "").trim();
          refreshImageUi();
          notifyChange();
          setImageStatus("Image attached.");
        }

        async function takeImageFiles(fileList) {
          const files = [...(fileList || [])].filter((f) =>
            String(f.type || "").startsWith("image/")
          );
          if (!files.length) {
            setImageStatus("Only image files can be attached.", true);
            return;
          }
          try {
            await uploadOpenImage(files[0]);
          } catch (err) {
            setImageStatus((err && err.message) || "Upload failed.", true);
          }
        }

        removeBtn.addEventListener("click", () => {
          block.imageUrl = "";
          refreshImageUi();
          notifyChange();
          setImageStatus("");
        });
        pickBtn.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", () => {
          void takeImageFiles(fileInput.files);
          fileInput.value = "";
        });

        imageZone.addEventListener("dragenter", (e) => {
          e.preventDefault();
          imageZone.classList.add("is-dragover");
        });
        imageZone.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          imageZone.classList.add("is-dragover");
        });
        imageZone.addEventListener("dragleave", (e) => {
          if (!imageZone.contains(e.relatedTarget)) {
            imageZone.classList.remove("is-dragover");
          }
        });
        imageZone.addEventListener("drop", (e) => {
          e.preventDefault();
          e.stopPropagation();
          imageZone.classList.remove("is-dragover");
          void takeImageFiles(e.dataTransfer?.files);
        });
        imageZone.addEventListener("paste", (e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          const imageFiles = [];
          for (const item of items) {
            if (item.type && item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file) imageFiles.push(file);
            }
          }
          if (!imageFiles.length) return;
          e.preventDefault();
          e.stopPropagation();
          void takeImageFiles(imageFiles);
        });
        // Catch paste while typing in the topic box (clipboard screenshot)
        topicInput.addEventListener("paste", (e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          const imageFiles = [];
          for (const item of items) {
            if (item.type && item.type.startsWith("image/")) {
              const file = item.getAsFile();
              if (file) imageFiles.push(file);
            }
          }
          if (!imageFiles.length) return;
          e.preventDefault();
          void takeImageFiles(imageFiles);
        });

        thumbWrap.append(thumb, removeBtn);
        imageZone.append(imageHint, thumbWrap, pickBtn, statusEl, fileInput);
        body.appendChild(imageZone);
        return el;
      }

      if (block.type === "translation-line") {
        const jpLabel = document.createElement("label");
        jpLabel.className = "hw-builder__field-label";
        jpLabel.textContent = "Japanese";
        const jpInput = document.createElement("textarea");
        jpInput.className =
          "hw-builder__field hw-builder__field--jp hw-builder__field--area hw-builder__field--compact-area";
        jpInput.rows = 2;
        jpInput.value = block.japanese || "";
        jpInput.addEventListener("input", () => {
          block.japanese = jpInput.value;
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
          notifyChange();
        });
        jpLabel.appendChild(jpInput);
        body.appendChild(jpLabel);

        const enLabel = document.createElement("label");
        enLabel.className = "hw-builder__field-label";
        enLabel.textContent = "English answer (for JD / See Answers)";
        const enInput = document.createElement("textarea");
        enInput.className = "hw-builder__field hw-builder__field--area hw-builder__field--compact-area";
        enInput.rows = 2;
        enInput.value = block.englishAnswer || "";
        enInput.addEventListener("input", () => {
          block.englishAnswer = enInput.value;
          const blank = (block.parts || []).find((p) => p.type === "blank");
          if (blank) blank.answer = enInput.value;
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
          notifyChange();
        });
        enLabel.appendChild(enInput);
        body.appendChild(enLabel);
        return el;
      }

      if (block.type === "star-line") {
        block.tokens = normalizeStarTokens(block, { keepEmpty: true });

        const hint = document.createElement("p");
        hint.className = "hw-builder__star-hint";
        hint.textContent =
          "Words in order — check Fixed to lock a word in place anywhere in the sentence.";
        body.appendChild(hint);

        const tokensWrap = document.createElement("div");
        tokensWrap.className = "hw-builder__star-tokens";
        const tokenInputs = [];

        function syncStarFromTokens() {
          /* Keep blank boxes so Add word works anytime — empties drop on save. */
          block.tokens = tokenInputs.map((row) => ({
            text: row.input.value.trim(),
            fixed: row.fixed.checked,
          }));
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
          notifyChange();
        }

        function renderTokenRows() {
          tokensWrap.replaceChildren();
          tokenInputs.length = 0;
          (block.tokens || []).forEach((token, ti) => {
            const row = document.createElement("div");
            row.className = "hw-builder__star-token-row";

            const fixedLabel = document.createElement("label");
            fixedLabel.className = "hw-builder__star-fixed-label";
            const fixedBox = document.createElement("input");
            fixedBox.type = "checkbox";
            fixedBox.className = "hw-builder__star-fixed";
            fixedBox.checked = !!token.fixed;
            fixedBox.title = "Fixed in sentence";
            fixedBox.addEventListener("change", syncStarFromTokens);
            fixedLabel.append(fixedBox, document.createTextNode(" Fixed"));

            const input = document.createElement("input");
            input.type = "text";
            input.className = "hw-builder__field hw-builder__field--jp hw-builder__field--compact";
            input.value = token.text;
            input.placeholder = "Word " + (ti + 1);
            input.addEventListener("input", syncStarFromTokens);

            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "btn btn--ghost btn--sm hw-builder__star-token-remove";
            removeBtn.textContent = "Remove";
            removeBtn.addEventListener("click", () => {
              block.tokens = (block.tokens || []).filter((_, idx) => idx !== ti);
              if (!block.tokens.length) block.tokens = [{ text: "", fixed: false }];
              renderTokenRows();
              syncStarFromTokens();
            });

            row.append(fixedLabel, input, removeBtn);
            tokensWrap.appendChild(row);
            tokenInputs.push({ input, fixed: fixedBox });
          });
        }

        renderTokenRows();
        body.appendChild(tokensWrap);

        const addTokenBtn = document.createElement("button");
        addTokenBtn.type = "button";
        addTokenBtn.className = "btn btn--ghost btn--sm";
        addTokenBtn.textContent = "Add word";
        addTokenBtn.addEventListener("click", () => {
          syncStarFromTokens();
          block.tokens = (block.tokens || []).concat([{ text: "", fixed: false }]);
          renderTokenRows();
          notifyChange();
          const last = tokenInputs[tokenInputs.length - 1];
          last?.input.focus();
        });
        body.appendChild(addTokenBtn);
        return el;
      }

      if (block.type === "mc-line") {
        const normalized = normalizeMcBlock(block);
        block.prompt = normalized.prompt;
        block.choices = normalized.choices;
        block.answer = normalized.answer;

        const hint = document.createElement("p");
        hint.className = "hw-builder__mc-hint";
        hint.textContent =
          "Put ______ where the blank goes. Add 4 choices, then pick which one is correct.";
        body.appendChild(hint);

        const promptLabel = document.createElement("label");
        promptLabel.className = "hw-builder__field-label";
        promptLabel.textContent = "Prompt";
        const promptInput = document.createElement("textarea");
        promptInput.className =
          "hw-builder__field hw-builder__field--jp hw-builder__field--area hw-builder__field--compact-area";
        promptInput.rows = 2;
        promptInput.placeholder = "この甘い匂いを嗅ぐと、ケーキを______。";
        promptInput.value = block.prompt || "";
        promptInput.addEventListener("input", () => {
          block.prompt = promptInput.value;
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
          notifyChange();
        });
        promptLabel.appendChild(promptInput);
        body.appendChild(promptLabel);

        const choicesWrap = document.createElement("div");
        choicesWrap.className = "hw-builder__mc-choices";
        const choiceInputs = [];

        function syncMcAnswerOptions() {
          const current = String(block.answer || "").trim();
          const options = choiceInputs
            .map((input) => String(input.value || "").trim())
            .filter(Boolean);
          answerSelect.replaceChildren();
          const emptyOpt = document.createElement("option");
          emptyOpt.value = "";
          emptyOpt.textContent = "— Correct answer —";
          answerSelect.appendChild(emptyOpt);
          options.forEach((opt) => {
            const o = document.createElement("option");
            o.value = opt;
            o.textContent = opt;
            answerSelect.appendChild(o);
          });
          if (current && options.includes(current)) {
            answerSelect.value = current;
          } else if (options.length) {
            answerSelect.value = options[0];
            block.answer = options[0];
          } else {
            answerSelect.value = "";
            block.answer = "";
          }
        }

        function syncMcFromInputs() {
          block.choices = choiceInputs.map((input) => input.value);
          syncMcAnswerOptions();
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
          notifyChange();
        }

        for (let ci = 0; ci < 4; ci += 1) {
          const label = document.createElement("label");
          label.className = "hw-builder__field-label";
          label.textContent = "Choice " + (ci + 1);
          const input = document.createElement("input");
          input.type = "text";
          input.className = "hw-builder__field hw-builder__field--jp hw-builder__field--compact";
          input.value = block.choices[ci] || "";
          input.placeholder = "Answer option " + (ci + 1);
          input.addEventListener("input", syncMcFromInputs);
          label.appendChild(input);
          choicesWrap.appendChild(label);
          choiceInputs.push(input);
        }
        body.appendChild(choicesWrap);

        const answerLabel = document.createElement("label");
        answerLabel.className = "hw-builder__field-label";
        answerLabel.textContent = "Correct answer";
        const answerSelect = document.createElement("select");
        answerSelect.className = "hw-builder__field hw-builder__field--sm";
        answerSelect.setAttribute("aria-label", "Correct multiple-choice answer");
        answerSelect.addEventListener("change", () => {
          block.answer = answerSelect.value;
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
          notifyChange();
        });
        answerLabel.appendChild(answerSelect);
        body.appendChild(answerLabel);
        syncMcAnswerOptions();
        return el;
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
          if (block.collapsed) summaryEl.textContent = blockSummary(block);
          notifyChange();
        });
        sentenceLabel.appendChild(sentenceInput);
        partsWrap.appendChild(sentenceLabel);

        const sentenceHint = document.createElement("p");
        sentenceHint.className = "hw-builder__inline-hint";
        sentenceHint.textContent =
          "Put {answer} where the blank goes. Hover readings are added when you save or send. Override anytime: 食べました[たべました].";
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

        body.appendChild(partsWrap);
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

      body.appendChild(partsWrap);
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
      updateCollapseAllBtn();
    }

    function syncTopicFieldsFromState() {
      explainInput.value = state.topicExplanation || "";
      videosInput.value = state.topicVideoText || "";
      remountTopicAudioClip();
    }

    function setTopicFieldsHidden(hidden) {
      metaStack.hidden = hidden;
    }

    function applyTemplate(key) {
      const t = TEMPLATES[key];
      if (!t) return;
      canvasAssignmentId = null;
      state = {
        templateType: t.templateType,
        blocks: sectionsToBlocks(t.sections || []),
        topicExplanation: "",
        topicExplanationAudioUrl: "",
        topicExplanationMediaId: "",
        topicVideoText: "",
      };
      previewOpen = false;
      previewMount.hidden = true;
      canvas.hidden = false;
      setTopicFieldsHidden(false);
      syncTopicFieldsFromState();
      notifyPreviewChange();
      renderCanvas();
      notifyChange();
    }

    function applyCustomTemplate(entry) {
      if (!entry) return;
      canvasAssignmentId = null;
      state = {
        templateType: entry.templateType || "custom",
        blocks: normalizeBlocks(cloneBlocks(entry.blocks || [])),
        topicExplanation: entry.topicExplanation || "",
        topicExplanationAudioUrl: entry.topicExplanationAudioUrl || "",
        topicExplanationMediaId: entry.topicExplanationMediaId || "",
        topicVideoText: entry.topicVideoText || "",
      };
      previewOpen = false;
      previewMount.hidden = true;
      canvas.hidden = false;
      setTopicFieldsHidden(false);
      syncTopicFieldsFromState();
      notifyPreviewChange();
      renderCanvas();
      notifyChange();
    }

    function applyCustomTemplateById(id) {
      const entry = loadCustomTemplates().find((t) => t.id === id);
      applyCustomTemplate(entry);
    }

    function exportTemplateSnapshot() {
      return {
        templateType: state.templateType || "custom",
        blocks: cloneBlocks(state.blocks),
        topicExplanation: state.topicExplanation || "",
        topicExplanationAudioUrl: state.topicExplanationAudioUrl || "",
        topicExplanationMediaId: state.topicExplanationMediaId || "",
        topicVideoText: state.topicVideoText || "",
      };
    }

    function saveCustomTemplate(label) {
      const name = String(label || "").trim();
      if (!name) return null;
      if (!state.blocks.length) return null;

      const templates = loadCustomTemplates();
      const id =
        "tpl-" +
        (slugifyTemplateLabel(name) || "template") +
        "-" +
        Date.now().toString(36);
      const entry = {
        id,
        label: name,
        createdAt: new Date().toISOString(),
        ...exportTemplateSnapshot(),
      };
      templates.unshift(entry);
      writeCustomTemplates(templates);
      refreshTemplateSelectOptions();
      return entry;
    }

    function toAssignment(meta) {
      const topicExplanation = String(state.topicExplanation || "").trim();
      const topicExplanationAudioUrl = String(state.topicExplanationAudioUrl || "").trim();
      const topicExplanationMediaId = String(state.topicExplanationMediaId || "").trim();
      const topicVideos = parseTopicVideoUrls(state.topicVideoText);
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
      if (topicExplanation) assignment.topicExplanation = topicExplanation;
      if (topicExplanationAudioUrl) {
        assignment.topicExplanationAudioUrl = topicExplanationAudioUrl;
        if (topicExplanationMediaId) {
          assignment.topicExplanationMediaId = topicExplanationMediaId;
        }
      }
      if (topicVideos.length) assignment.topicVideos = topicVideos;
      if (global.HwWorksheet?.enrichGrammarVariants) {
        global.HwWorksheet.enrichGrammarVariants(assignment);
      }
      if (global.HwWorksheet?.enrichAssignmentMedia) {
        global.HwWorksheet.enrichAssignmentMedia(assignment);
      }
      return assignment;
    }

    function loadAssignment(assignment) {
      const data = assignment || {};
      canvasAssignmentId = data.id || null;
      const blocks = sectionsToBlocks(data.sections || [], data.register);
      // Loaded sheets start collapsed so you can scan the list first.
      blocks.forEach((b) => {
        b.collapsed = true;
      });
      state = {
        templateType: data.templateType || "custom",
        blocks,
        topicExplanation: data.topicExplanation || "",
        topicExplanationAudioUrl: data.topicExplanationAudioUrl || "",
        topicExplanationMediaId: data.topicExplanationMediaId || "",
        topicVideoText: Array.isArray(data.topicVideos) ? data.topicVideos.join("\n") : "",
      };
      previewOpen = false;
      previewMount.hidden = true;
      canvas.hidden = false;
      setTopicFieldsHidden(false);
      syncTopicFieldsFromState();
      notifyPreviewChange();
      renderCanvas();
      notifyChange();
    }

    async function showPreview(title) {
      if (!global.HwWorksheet?.render) return;
      const assignment = toAssignment({ title });
      previewMount.innerHTML = "";
      global.HwWorksheet.render(previewMount, assignment, { preview: true });
      previewOpen = true;
      previewMount.hidden = false;
      canvas.hidden = true;
      setTopicFieldsHidden(true);
      notifyPreviewChange();
      previewMount.scrollIntoView({ behavior: "smooth", block: "nearest" });

      if (!global.HwFuriganaAuto?.annotateAssignment) return;
      try {
        const annotated = toAssignment({ title });
        const annotate = global.HwFuriganaAuto.annotateAssignment(annotated);
        const timed = global.HwFuriganaAuto.withTimeout
          ? global.HwFuriganaAuto.withTimeout(annotate, 8000, "reading-timeout")
          : annotate;
        await timed;
        if (!previewOpen) return;
        previewMount.innerHTML = "";
        global.HwWorksheet.render(previewMount, annotated, { preview: true });
      } catch {
        /* preview without readings */
      }
    }

    function hidePreview() {
      previewOpen = false;
      previewMount.hidden = true;
      canvas.hidden = false;
      setTopicFieldsHidden(false);
      notifyPreviewChange();
    }

    applyTemplate("blank");

    return {
      toAssignment,
      loadAssignment,
      applyTemplate,
      applyCustomTemplate,
      showPreview,
      hidePreview,
      getState: () => state,
      getBlockCount: () => state.blocks.length,
      exportTemplateSnapshot,
      saveCustomTemplate,
      refreshCustomTemplates: refreshTemplateSelectOptions,
      getCanvasAssignmentId: () => canvasAssignmentId,
      isPreviewOpen: () => previewOpen,
    };
  }

  global.HwWorksheetBuilder = {
    mount,
    TEMPLATES,
    TEMPLATE_ORDER,
    loadCustomTemplates,
    grammarItem,
    openItem,
    videoItem,
    listenItem,
    createBlock,
    sectionsToBlocks,
    blocksToSections,
  };
})(window);
