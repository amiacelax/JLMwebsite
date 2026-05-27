/**
 * Teacher homework maker — build assignment JSON + catalog entry from line templates.
 */
(function (global) {
  const DEFAULT_S1 =
    "トイレに {行きたい} 。 | いく | たい\n" +
    "コーヒーが {飲みたい} 。 | のむ | たい\n" +
    "!彼女が {ほしくない} 。 | ほしい | ない";

  const DEFAULT_S2 =
    "{ } やめたい。 | やめる | たい\n" +
    "!{ } が {ほしくない} 。 | ほしい | ない";

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function makeAssignmentId(date, studentLabel) {
    const slug = slugify(studentLabel) || "student";
    return (date || todayIso()) + "-" + slug;
  }

  function parseLine(line, mode, index, sectionPrefix) {
    let raw = String(line || "").trim();
    if (!raw || raw.startsWith("#")) return null;

    let negative = false;
    if (raw.startsWith("!")) {
      negative = true;
      raw = raw.slice(1).trim();
    }

    const pipeParts = raw.split("|").map((s) => s.trim());
    const main = pipeParts[0];
    const dictionary = pipeParts[1] || "";
    const conjugation = pipeParts[2] || "";

    const match = main.match(/^(.*?)\{([^}]*)\}(.*)$/s);
    if (!match) return null;

    const before = match[1];
    const answer = match[2].trim();
    const after = match[3];
    const id = sectionPrefix + "-" + (index + 1);
    const parts = [];

    if (before) parts.push({ type: "text", value: before });

    const blank = { type: "blank", name: id, wide: true };
    if (answer && mode === "grammar-blank") blank.answer = answer;
    if (dictionary) {
      blank.hint = {
        dictionary,
        conjugation: conjugation || "plain",
      };
    }
    parts.push(blank);

    if (after) parts.push({ type: "text", value: after });

    const item = { id, parts };
    if (negative) item.negative = true;
    return item;
  }

  function parseLines(text, mode, sectionPrefix) {
    const lines = String(text || "").split(/\r?\n/);
    const items = [];
    lines.forEach((line) => {
      const item = parseLine(line, mode, items.length, sectionPrefix);
      if (item) items.push(item);
    });
    return items;
  }

  function buildAssignment(meta, section1Text, section2Text) {
    const date = meta.date || todayIso();
    const id = meta.id || makeAssignmentId(date, meta.studentLabel);
    const lessonNum = String(meta.lessonNumber || "").trim();
    const lessonName =
      meta.lessonName ||
      (lessonNum ? date + " — Lesson " + lessonNum : date + " — Lesson");

    const tags = String(meta.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const assignment = {
      id,
      title: meta.title || "Homework",
      date,
      register: meta.register || "casual",
      studentLabel: meta.studentLabel || "",
      lessonName,
      youtubeUrl: meta.youtubeUrl || "",
      status: "draft",
      forSale: false,
      salePrice: 0.99,
      sections: [
        {
          id: "grammar",
          title: meta.section1Title || "Section 1 — Grammar point",
          instructions:
            meta.section1Instructions ||
            "Fill in the blank with the correct grammar form. The hint under each blank shows the dictionary form (and conjugation when needed).",
          mode: "grammar-blank",
          tenseBubbles: ["Now-Later", "Past"],
          activeTense: "Now-Later",
          items: parseLines(section1Text, "grammar-blank", "s1"),
        },
        {
          id: "context",
          title: meta.section2Title || "Section 2 — Your words",
          instructions:
            meta.section2Instructions ||
            "Fill in the blank with your own Japanese. Any correct answer is fine — be creative.",
          mode: "context-blank",
          items: parseLines(section2Text, "context-blank", "s2"),
        },
      ],
    };

    if (meta.sourceVideo) assignment.sourceVideo = meta.sourceVideo;

    const catalogEntry = {
      id,
      title: assignment.title,
      date,
      level: meta.level || "Low-Intermediate",
      studentLabel: meta.studentLabel || "",
      lessonName,
      students: meta.studentUsername ? [meta.studentUsername.toLowerCase()] : [],
      youtubeUrl: meta.youtubeUrl || "",
      forSale: false,
      salePrice: 0.99,
      tags,
      summary: meta.summary || "",
    };

    return { assignment, catalogEntry };
  }

  function readMeta(form) {
    const fd = new FormData(form);
    return {
      id: String(fd.get("id") || "").trim(),
      date: String(fd.get("date") || "").trim(),
      studentUsername: String(fd.get("studentUsername") || "").trim().toLowerCase(),
      studentLabel: String(fd.get("studentLabel") || "").trim(),
      lessonNumber: String(fd.get("lessonNumber") || "").trim(),
      lessonName: String(fd.get("lessonName") || "").trim(),
      title: String(fd.get("title") || "").trim(),
      level: String(fd.get("level") || "").trim(),
      register: String(fd.get("register") || "casual"),
      youtubeUrl: String(fd.get("youtubeUrl") || "").trim(),
      tags: String(fd.get("tags") || "").trim(),
      summary: String(fd.get("summary") || "").trim(),
      section1Title: String(fd.get("section1Title") || "").trim(),
      section1Instructions: String(fd.get("section1Instructions") || "").trim(),
      section2Title: String(fd.get("section2Title") || "").trim(),
      section2Instructions: String(fd.get("section2Instructions") || "").trim(),
    };
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function syncIdField(form) {
    const date = form.elements.date?.value || todayIso();
    const label = form.elements.studentLabel?.value || "";
    const idField = form.elements.id;
    if (idField && !idField.dataset.manual) {
      idField.value = makeAssignmentId(date, label);
    }
  }

  function fillFormFromAssignment(form, assignment, catalogEntry) {
    if (!form || !assignment) return;
    form.elements.date.value = assignment.date || todayIso();
    form.elements.studentLabel.value = assignment.studentLabel || catalogEntry?.studentLabel || "";
    form.elements.studentUsername.value = (catalogEntry?.students || [])[0] || "";
    form.elements.title.value = assignment.title || "";
    form.elements.register.value = assignment.register || "casual";
    form.elements.youtubeUrl.value = assignment.youtubeUrl || catalogEntry?.youtubeUrl || "";
    form.elements.tags.value = (catalogEntry?.tags || []).join(", ");
    form.elements.summary.value = catalogEntry?.summary || "";
    form.elements.level.value = catalogEntry?.level || "Low-Intermediate";
    form.elements.id.value = assignment.id || "";
    form.elements.id.dataset.manual = "true";

    const lessonMatch = String(assignment.lessonName || "").match(/Lesson\s+(\d+)/i);
    form.elements.lessonNumber.value = lessonMatch ? lessonMatch[1] : "";
    form.elements.lessonName.value = assignment.lessonName || "";

    const s1 = (assignment.sections || []).find((s) => s.mode === "grammar-blank");
    const s2 = (assignment.sections || []).find((s) => s.mode === "context-blank");
    if (s1) {
      form.elements.section1Title.value = s1.title || "";
      form.elements.section1Instructions.value = s1.instructions || "";
      form.elements.section1Lines.value = itemsToLines(s1.items || []);
    }
    if (s2) {
      form.elements.section2Title.value = s2.title || "";
      form.elements.section2Instructions.value = s2.instructions || "";
      form.elements.section2Lines.value = itemsToLines(s2.items || []);
    }
  }

  function itemsToLines(items) {
    return items
      .map((item) => {
        let line = "";
        const parts = item.parts || [];
        parts.forEach((p) => {
          if (p.type === "text") line += p.value || "";
          if (p.type === "blank") {
            line += "{" + (p.answer || "") + "}";
          }
        });
        const blank = parts.find((p) => p.type === "blank");
        if (blank?.hint) {
          line += " | " + (blank.hint.dictionary || "") + " | " + (blank.hint.conjugation || "");
        }
        if (item.negative) line = "!" + line;
        return line;
      })
      .join("\n");
  }

  function init(options) {
    const form = document.getElementById("hw-maker-form");
    const previewMount = document.getElementById("hw-maker-preview");
    const statusEl = document.getElementById("hw-maker-status");
    const catalogOut = document.getElementById("hw-maker-catalog-snippet");
    const templateSelect = document.getElementById("hw-maker-template");
    const showToast = options.showToast || function () {};
    const copyText = options.copyText || function () {};
    const studentWorksheetUrl = options.studentWorksheetUrl || function () {
      return "";
    };

    if (!form || form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    if (form.elements.section1Lines && !form.elements.section1Lines.value) {
      form.elements.section1Lines.value = DEFAULT_S1;
    }
    if (form.elements.section2Lines && !form.elements.section2Lines.value) {
      form.elements.section2Lines.value = DEFAULT_S2;
    }
    if (form.elements.date && !form.elements.date.value) {
      form.elements.date.value = todayIso();
    }

    form.elements.date?.addEventListener("change", () => syncIdField(form));
    form.elements.studentLabel?.addEventListener("input", () => syncIdField(form));
    form.elements.id?.addEventListener("input", () => {
      form.elements.id.dataset.manual = "true";
    });

    function currentBuild() {
      const meta = readMeta(form);
      return buildAssignment(
        meta,
        form.elements.section1Lines?.value,
        form.elements.section2Lines?.value
      );
    }

    function setStatus(msg, isError) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.classList.toggle("hw-maker-status--error", !!isError);
    }

    function renderPreview() {
      if (!previewMount || typeof global.HwWorksheet?.render !== "function") return;
      const { assignment } = currentBuild();
      if (!assignment.sections[0].items.length && !assignment.sections[1].items.length) {
        previewMount.innerHTML =
          '<p class="hw-maker-preview-empty">Add at least one line in Section 1 or 2 to preview.</p>';
        setStatus("No valid lines parsed — check the format below.", true);
        return;
      }
      previewMount.innerHTML = "";
      global.HwWorksheet.render(previewMount, assignment, { preview: true });
      const s1 = assignment.sections[0].items.length;
      const s2 = assignment.sections[1].items.length;
      setStatus(
        "Preview: " +
          s1 +
          " Section 1 item" +
          (s1 === 1 ? "" : "s") +
          ", " +
          s2 +
          " Section 2 item" +
          (s2 === 1 ? "" : "s") +
          " · ID " +
          assignment.id
      );
    }

    form.addEventListener("input", () => {
      window.clearTimeout(form._previewTimer);
      form._previewTimer = window.setTimeout(renderPreview, 280);
    });

    document.getElementById("hw-maker-preview-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      renderPreview();
      showToast("Preview updated");
    });

    document.getElementById("hw-maker-download-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      const { assignment } = currentBuild();
      if (!assignment.sections[0].items.length) {
        setStatus("Section 1 needs at least one valid line before download.", true);
        return;
      }
      downloadJson(assignment.id + ".json", assignment);
      showToast("Downloaded " + assignment.id + ".json");
    });

    document.getElementById("hw-maker-copy-catalog-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      const { catalogEntry } = currentBuild();
      const snippet = JSON.stringify(catalogEntry, null, 2);
      if (catalogOut) {
        catalogOut.hidden = false;
        catalogOut.textContent = snippet;
      }
      copyText(snippet, "Catalog entry copied — paste into catalog.json assignments");
    });

    document.getElementById("hw-maker-copy-link-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      const { assignment, catalogEntry } = currentBuild();
      const user = catalogEntry.students[0];
      if (!user) {
        setStatus("Enter student Discord username (login id) so they can see this sheet.", true);
        return;
      }
      copyText(
        studentWorksheetUrl(assignment.id),
        "Student link copied for " + user
      );
    });

    document.getElementById("hw-maker-new-id-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      delete form.elements.id.dataset.manual;
      syncIdField(form);
      renderPreview();
    });

    if (templateSelect) {
      templateSelect.addEventListener("change", async () => {
        const id = templateSelect.value;
        if (!id) return;
        try {
          const res = await fetch("/homework/assignments/" + id + ".json", { cache: "no-store" });
          if (!res.ok) throw new Error("load");
          const assignment = await res.json();
          let catalogEntry = null;
          if (options.getCatalogEntry) {
            catalogEntry = options.getCatalogEntry(id);
          }
          fillFormFromAssignment(form, assignment, catalogEntry);
          renderPreview();
          showToast("Loaded template " + id);
        } catch {
          showToast("Could not load template");
        }
      });
    }

    syncIdField(form);
    renderPreview();
  }

  function populateTemplates(select, entries) {
    if (!select) return;
    select.innerHTML = '<option value="">Load existing worksheet as template…</option>';
    (entries || [])
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .forEach((entry) => {
        const opt = document.createElement("option");
        opt.value = entry.id;
        opt.textContent = (entry.date || "") + " · " + (entry.title || entry.id);
        select.appendChild(opt);
      });
  }

  global.HwMaker = {
    init,
    buildAssignment,
    parseLines,
    makeAssignmentId,
    populateTemplates,
    fillFormFromAssignment,
  };
})(window);
