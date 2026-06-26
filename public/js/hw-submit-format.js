/**
 * Normalize homework answer rows for teacher checker + Discord-style display.
 */
(function (global) {
  const LISTEN_RE =
    /Listen to the clip and write down what you think it's saying(\s+in Japanese)?\.?/gi;
  const TRANSLATE_RE = /Translate into English\.?/gi;

  function stripFurigana(text) {
    return String(text || "")
      .replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, "")
      .replace(/\[[^\]\s]{1,16}\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripInstructions(text) {
    return String(text || "")
      .replace(LISTEN_RE, "")
      .replace(TRANSLATE_RE, "")
      .replace(/___+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseStarPieces(raw) {
    const s = String(raw || "").trim();
    if (!s.startsWith("[")) return null;
    try {
      const arr = JSON.parse(s);
      if (!Array.isArray(arr)) return null;
      return arr.map((p) => String(p || "").trim()).filter(Boolean);
    } catch {
      return null;
    }
  }

  function starStaticDisplay(prefix, suffix) {
    const p = String(prefix || "").trim();
    const s = String(suffix ?? "").trim();
    if (p && s && s !== "。") return p + " · " + s;
    return p || (s !== "。" ? s : "") || "";
  }

  function assignmentLinesInOrder(sections) {
    const lines = [];
    (sections || []).forEach((section) => {
      const mode = section.mode || "";
      (section.items || []).forEach((item) => {
        lines.push({ mode, item });
      });
    });
    return lines;
  }

  function enrichRowsFromAssignment(rows, sections) {
    const assignmentLines = assignmentLinesInOrder(sections);
    return (rows || []).map((row, index) => {
      const line = assignmentLines[index];
      if (!line) return row;
      const enriched = Object.assign({}, row);
      const mode = line.mode;
      const item = line.item || {};

      if (mode === "audio-listening") {
        const reference = (item.parts || [])
          .find((part) => part.type === "blank")
          ?.answer?.trim();
        if (reference) {
          enriched.reference = stripFurigana(reference);
          enriched.question = enriched.reference;
        }
      }

      if (mode === "star-order") {
        const prefix = String(item.prefix || "").trim();
        const suffix = String(item.suffix ?? "。").trim();
        const staticDisplay = starStaticDisplay(prefix, suffix);
        enriched.prefix = prefix;
        enriched.suffix = suffix;
        enriched.staticDisplay = staticDisplay;
        const pieces = parseStarPieces(enriched.student);
        if (pieces?.length) {
          enriched.student = prefix + pieces.join("") + suffix;
          enriched.piecesDisplay = pieces.join(" · ");
        }
      }

      if (mode === "translation" && item.japanese?.trim()) {
        enriched.question = item.japanese.trim();
      }

      return enriched;
    });
  }

  async function fetchAssignmentSections(assignmentId) {
    const id = String(assignmentId || "").trim();
    if (!id) return null;
    try {
      const res = await fetch("/api/homework-assignment?id=" + encodeURIComponent(id));
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.sections) ? data.sections : null;
    } catch {
      return null;
    }
  }

  async function enrichRowsForEntry(rows, assignmentId) {
    const sections = await fetchAssignmentSections(assignmentId);
    if (!sections?.length) return rows;
    return enrichRowsFromAssignment(rows, sections);
  }

  function itemNumber(row, index) {
    const progress = row?.progress?.trim();
    if (progress) {
      const match = progress.match(/^(\d+)/);
      if (match) return match[1];
    }
    if (index >= 0) return String(index + 1);
    return row?.label?.trim() || "—";
  }

  function isMediaRow(row, blockType) {
    const kind = row?.mediaKind;
    if (kind === "video" || kind === "audio") return true;
    const bt = (blockType || row?.blockType || "").toLowerCase();
    if (bt === "video" || bt === "audio") return true;
    const student = String(row?.student || "").toLowerCase();
    return (
      student.includes("video submitted") ||
      student.includes("video upload") ||
      student.includes("audio submitted") ||
      student.includes("audio upload") ||
      student.includes("(submitted via video") ||
      student.includes("(submitted via audio")
    );
  }

  function mediaLabelFor(row, blockType) {
    const kind = row?.mediaKind || (blockType === "audio" ? "audio" : "video");
    const student = String(row?.student || "").toLowerCase();
    if (student.includes("not saved")) return row.student.trim();
    return kind === "audio" ? "Audio submitted" : "Video submitted";
  }

  function normalizeSubmissionRow(row, index) {
    const blockType = (row?.blockType || "").toLowerCase();
    const num = itemNumber(row, index);
    let question = stripInstructions(
      row?.question?.trim() || row?.reference?.trim() || row?.staticDisplay?.trim() || ""
    );
    let answer = stripInstructions(row?.student?.trim() || "");
    let piecesLine = row?.piecesDisplay?.trim() || "";

    if (blockType === "order") {
      if (!question) question = starStaticDisplay(row.prefix, row.suffix);
      const pieces = parseStarPieces(answer);
      if (pieces?.length && (row.prefix !== undefined || row.suffix !== undefined)) {
        answer = String(row.prefix || "") + pieces.join("") + String(row.suffix ?? "");
        piecesLine = pieces.join(" · ");
      } else if (pieces?.length) {
        answer = pieces.join("");
        piecesLine = pieces.join(" · ");
      }
      question = "";
    } else if (!piecesLine) {
      const pieces = parseStarPieces(answer);
      if (pieces) {
        answer = pieces.join("");
        piecesLine = pieces.join(" · ");
      }
    }

    if (blockType === "translation") {
      if (!question && row?.prompt) question = stripInstructions(row.prompt);
      if (!question && row?.completed) {
        const completed = stripInstructions(row.completed);
        if (completed && answer && completed.endsWith(answer)) {
          question = completed.slice(0, completed.length - answer.length).trim();
        }
      }
    }

    if (blockType === "listening") {
      if (!question && row?.reference?.trim()) question = stripInstructions(row.reference);
      if (!answer && row?.completed) answer = stripInstructions(row.completed);
    }

    if (row?.completed && !blockType.includes("translation") && blockType !== "listening" && blockType !== "order") {
      const completed = stripInstructions(row.completed);
      if (completed && answer && completed !== answer && completed.includes(answer)) {
        const maybeQuestion = completed.replace(answer, "").trim();
        if (maybeQuestion) question = stripInstructions(maybeQuestion);
      }
    }

    let mediaLabel = "";
    let mediaId = row?.mediaId?.trim() || "";
    let mediaKind = row?.mediaKind || "";

    if (isMediaRow(row, blockType)) {
      mediaLabel = mediaLabelFor(row, blockType);
      if (!mediaKind) mediaKind = blockType === "audio" ? "audio" : "video";
      answer = "";
    } else if (!answer) {
      answer = "(blank)";
    }

    question = stripFurigana(question);
    if (blockType !== "translation") {
      answer = stripFurigana(answer);
    }

    return { num, question, answer, piecesLine, mediaLabel, mediaId, mediaKind };
  }

  global.HwSubmitFormat = {
    normalizeSubmissionRow,
    stripInstructions,
    itemNumber,
    starStaticDisplay,
    enrichRowsFromAssignment,
    enrichRowsForEntry,
  };
})(window);
