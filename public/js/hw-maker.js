/**
 * Teacher homework maker — AI draft or manual lines → preview → download / catalog.
 */
(function (global) {
  const MAKER_STUDENT_KEY = "jlm-hw-maker-student";
  const DEFAULT_STUDENT = "joshs";

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function makeAssignmentId(studentUsername, grammarPoint) {
    const student = slugify(studentUsername) || "student";
    const grammar = slugify(grammarPoint) || "homework";
    return student + "-" + grammar;
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

  function buildFromLines(meta, section1Text, section2Text) {
    const grammarPoint = meta.grammarPoint || meta.title || "Homework";
    const studentUsername = meta.studentUsername;
    const id = makeAssignmentId(studentUsername, grammarPoint);

    const assignment = {
      id,
      title: grammarPoint,
      youtubeUrl: meta.youtubeUrl || "",
      status: "draft",
      forSale: false,
      salePrice: 0.99,
      sections: [
        {
          id: "grammar",
          title: "Section 1 — Grammar point",
          instructions:
            "Fill in the blank with the correct grammar form. The hint under each blank shows the dictionary form (and conjugation when needed).",
          mode: "grammar-blank",
          tenseBubbles: ["Now-Later", "Past"],
          activeTense: "Now-Later",
          items: parseLines(section1Text, "grammar-blank", "s1"),
        },
        {
          id: "context",
          title: "Section 2 — Your words",
          instructions:
            "Fill in the blank with your own Japanese. Any correct answer is fine — be creative.",
          mode: "context-blank",
          items: parseLines(section2Text, "context-blank", "s2"),
        },
      ],
    };

    const catalogEntry = {
      id,
      title: grammarPoint,
      studentLabel: studentUsername,
      lessonName: grammarPoint,
      students: studentUsername ? [studentUsername] : [],
      youtubeUrl: meta.youtubeUrl || "",
      forSale: false,
      salePrice: 0.99,
      summary: "Homework: " + grammarPoint,
    };

    return { assignment, catalogEntry };
  }

  function readMeta(form) {
    const studentUsername = String(
      form.querySelector('[name="studentUsername"]')?.value || ""
    )
      .trim()
      .toLowerCase();
    const grammarPoint = String(
      form.querySelector('[name="grammarPoint"]')?.value || ""
    ).trim();
    return {
      studentUsername,
      grammarPoint,
      title: grammarPoint,
      youtubeUrl: String(form.querySelector('[name="youtubeUrl"]')?.value || "").trim(),
      notes: String(form.querySelector('[name="notes"]')?.value || "").trim(),
    };
  }

  /** Built-in lines when /api/homework-generate is unavailable (offline or not deployed). */
  const FALLBACK_S1_NAI =
    "明日、学校に {行かないといけない} 。 | いく | plain\n" +
    "もう {帰らないといけない} 。 | かえる | plain\n" +
    "薬を {飲まないといけない} 。 | のむ | plain\n" +
    "{勉強しないといけない} 。 | べんきょう | する\n" +
    "!今日は遊んでは {いけない} 。 | あそぶ | ない";

  const FALLBACK_S2 =
    "{ } について書いてください。 | かく | plain\n" +
    "私は { } と思います。 | おもう | plain\n" +
    "{ } ことがあります。 | ある | plain\n" +
    "友達に { } と言いました。 | いう | plain\n" +
    "{ } を見ました。 | みる | plain";

  function generateLocalFallback(meta) {
    const gp = meta.grammarPoint || "";
    const isNai = /ないといけない|なければならない|なくちゃ/i.test(gp.replace(/～/g, ""));
    const s1 = isNai ? FALLBACK_S1_NAI : FALLBACK_S1_NAI;
    return buildFromLines(meta, s1, FALLBACK_S2);
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

  function itemsToLines(items) {
    return items
      .map((item) => {
        let line = "";
        (item.parts || []).forEach((p) => {
          if (p.type === "text") line += p.value || "";
          if (p.type === "blank") line += "{" + (p.answer || "") + "}";
        });
        const blank = (item.parts || []).find((p) => p.type === "blank");
        if (blank?.hint) {
          line += " | " + (blank.hint.dictionary || "") + " | " + (blank.hint.conjugation || "");
        }
        if (item.negative) line = "!" + line;
        return line;
      })
      .join("\n");
  }

  function fillLinesFromAssignment(form, assignment) {
    if (!form || !assignment) return;
    const s1 = (assignment.sections || []).find((s) => s.mode === "grammar-blank");
    const s2 = (assignment.sections || []).find((s) => s.mode === "context-blank");
    if (form.elements.section1Lines && s1) {
      form.elements.section1Lines.value = itemsToLines(s1.items || []);
    }
    if (form.elements.section2Lines && s2) {
      form.elements.section2Lines.value = itemsToLines(s2.items || []);
    }
  }

  function fillFormFromAssignment(form, assignment, catalogEntry) {
    if (!form || !assignment) return;
    const studentInput = form.querySelector('[name="studentUsername"]');
    const grammarInput = form.querySelector('[name="grammarPoint"]');
    const youtubeInput = form.querySelector('[name="youtubeUrl"]');
    if (studentInput) {
      studentInput.value =
        (catalogEntry?.students || [])[0] || assignment.studentLabel || "";
    }
    if (grammarInput) grammarInput.value = assignment.title || "";
    if (youtubeInput) {
      youtubeInput.value = assignment.youtubeUrl || catalogEntry?.youtubeUrl || "";
    }
    fillLinesFromAssignment(form, assignment);
  }

  function init(options) {
    const form = document.getElementById("hw-maker-form");
    const previewMount = document.getElementById("hw-maker-preview");
    const statusEl = document.getElementById("hw-maker-status");
    const catalogOut = document.getElementById("hw-maker-catalog-snippet");
    const idNote = document.getElementById("hw-maker-id-note");
    const templateSelect = document.getElementById("hw-maker-template");
    const publishBtn = document.getElementById("hw-maker-publish-btn");
    const downloadBtn = document.getElementById("hw-maker-download-btn");
    const copyLinkBtn = document.getElementById("hw-maker-copy-link-btn");

    const showToast = options.showToast || function () {};
    const copyText = options.copyText || function () {};
    const studentWorksheetUrl = options.studentWorksheetUrl || function () {
      return "";
    };
    const getTeacherSession = options.getTeacherSession || function () {
      return null;
    };
    const getStudentAccounts = options.getStudentAccounts || function () {
      return [];
    };
    const isStudentAccount = options.isStudentAccount || function () {
      return true;
    };

    if (!form || form.dataset.bound === "true") return;
    form.dataset.bound = "true";

    form.addEventListener("submit", (e) => e.preventDefault());
    form.setAttribute("novalidate", "novalidate");

    const studentField = form.querySelector('[name="studentUsername"]');
    const studentList = document.getElementById("hw-maker-students");
    const accounts = getStudentAccounts();
    if (studentList && accounts.length) {
      studentList.innerHTML = accounts
        .map(
          (a) =>
            '<option value="' +
            a.username +
            '">' +
            (a.displayName || a.username) +
            "</option>"
        )
        .join("");
    }

    function defaultStudentId() {
      try {
        const params = new URLSearchParams(global.location.search);
        const fromUrl = String(params.get("for") || "")
          .trim()
          .toLowerCase();
        if (fromUrl && isStudentAccount(fromUrl)) return fromUrl;
        const stored = String(localStorage.getItem(MAKER_STUDENT_KEY) || "")
          .trim()
          .toLowerCase();
        if (stored && isStudentAccount(stored)) return stored;
      } catch {
        /* ignore */
      }
      return isStudentAccount(DEFAULT_STUDENT) ? DEFAULT_STUDENT : accounts[0]?.username || "";
    }

    if (studentField && !String(studentField.value || "").trim()) {
      studentField.value = defaultStudentId();
    }

    function rememberStudent(username) {
      try {
        localStorage.setItem(MAKER_STUDENT_KEY, username);
      } catch {
        /* ignore */
      }
    }

    function validateStudent(meta) {
      if (!meta.studentUsername) {
        setStatus("Student id is required.", true);
        return false;
      }
      if (!isStudentAccount(meta.studentUsername)) {
        const ids = accounts.map((a) => a.username).join(", ") || "—";
        setStatus(
          'No account for "' +
            meta.studentUsername +
            '". Pick a student id from the list: ' +
            ids,
          true
        );
        showToast("Unknown student id");
        return false;
      }
      return true;
    }

    let lastResult = null;

    function setStatus(msg, isError) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.classList.toggle("hw-maker-status--error", !!isError);
      statusEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function focusStatus() {
      statusEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function setActionsEnabled(on) {
      [publishBtn, downloadBtn, copyLinkBtn].forEach((btn) => {
        if (btn) btn.disabled = !on;
      });
    }

    function renderPreview(assignment) {
      if (!previewMount) return;
      if (typeof global.HwWorksheet?.render !== "function") {
        previewMount.innerHTML =
          '<p class="hw-maker-preview-empty">Worksheet renderer failed to load. Hard-refresh the page.</p>';
        return;
      }
      if (!assignment?.sections?.length) {
        previewMount.innerHTML =
          '<p class="hw-maker-preview-empty">Generate homework to see a preview.</p>';
        return;
      }
      try {
        previewMount.innerHTML = "";
        global.HwWorksheet.render(previewMount, assignment, { preview: true });
        previewMount.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (err) {
        previewMount.innerHTML =
          '<p class="hw-maker-preview-empty">Preview error: ' +
          (err && err.message ? err.message : "unknown") +
          "</p>";
      }
    }

    function applyResult(result) {
      lastResult = result;
      setActionsEnabled(true);
      renderPreview(result.assignment);
      if (idNote) {
        idNote.hidden = false;
        const who =
          (result.catalogEntry.students || [])[0] ||
          studentField?.value ||
          "student";
        idNote.textContent =
          "After you publish, " +
          who +
          " sees this on their Homework Hub · #" +
          result.assignment.id +
          " (benm and other students are unaffected)";
      }
      fillLinesFromAssignment(form, result.assignment);
      const s1 = result.assignment.sections[0]?.items?.length || 0;
      const s2 = result.assignment.sections[1]?.items?.length || 0;
      setStatus(
        "Ready — " +
          s1 +
          " grammar items, " +
          s2 +
          " open items · id " +
          result.assignment.id
      );
    }

    document.getElementById("hw-maker-generate-btn")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const meta = readMeta(form);
      if (!meta.grammarPoint) {
        setStatus("Grammar point is required.", true);
        return;
      }
      if (!validateStudent(meta)) return;

      const session = getTeacherSession();
      if (!session || session.role !== "teacher") {
        setStatus("Teacher login required.", true);
        return;
      }
      rememberStudent(meta.studentUsername);

      const btn = document.getElementById("hw-maker-generate-btn");
      if (btn) btn.disabled = true;
      setStatus("Generating homework…");
      focusStatus();

      try {
        const ac = new AbortController();
        const abortTimer = window.setTimeout(() => ac.abort(), 15000);
        const res = await fetch("/api/homework-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grammarPoint: meta.grammarPoint,
            studentUsername: meta.studentUsername,
            youtubeUrl: meta.youtubeUrl,
            notes: meta.notes,
            teacherUsername: session.username,
          }),
          signal: ac.signal,
        });
        window.clearTimeout(abortTimer);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || "Generation failed.");
        }
        if (!data.assignment?.sections?.length) {
          throw new Error("Server returned an empty worksheet.");
        }
        const catalogEntry = data.catalogEntry || {
          id: data.assignment.id,
          title: data.assignment.title,
          students: [meta.studentUsername],
          youtubeUrl: meta.youtubeUrl,
        };
        applyResult({ assignment: data.assignment, catalogEntry });
        const src = data.source || "template";
        const srcLabel =
          src === "openai"
            ? "OpenAI"
            : src === "cloudflare"
              ? "Cloudflare AI"
              : "built-in template (no API key)";
        setStatus(
          "Generated via " +
            srcLabel +
            " for " +
            meta.studentUsername +
            " — review, then Publish to student hub."
        );
        showToast("Homework generated");
      } catch (err) {
        const apiFailed =
          err &&
          (err.name === "AbortError" ||
            err.name === "TypeError" ||
            /failed|fetch|network/i.test(String(err.message || "")));
        if (apiFailed) {
          try {
            const fallback = generateLocalFallback(meta);
            if (fallback.assignment.sections[0]?.items?.length) {
              applyResult(fallback);
              setStatus(
                "Server unreachable — used built-in worksheet for " +
                  meta.studentUsername +
                  ". You can still Publish to student hub."
              );
              showToast("Generated locally (offline fallback)");
              return;
            }
          } catch {
            /* fall through */
          }
        }
        const msg =
          err && err.name === "AbortError"
            ? "Request timed out — try again or use “Apply lines to preview” below."
            : (err && err.message) || "Could not generate homework.";
        setStatus(msg, true);
        showToast("Generate failed");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    document.getElementById("hw-maker-apply-lines-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      const meta = readMeta(form);
      if (!meta.grammarPoint) {
        setStatus("Grammar point is required.", true);
        return;
      }
      if (!validateStudent(meta)) return;
      const result = buildFromLines(
        meta,
        form.elements.section1Lines?.value,
        form.elements.section2Lines?.value
      );
      if (!result.assignment.sections[0].items.length) {
        setStatus("Section 1 needs at least one valid line.", true);
        return;
      }
      applyResult(result);
      showToast("Manual lines applied");
    });

    downloadBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      if (!lastResult) return;
      downloadJson(lastResult.assignment.id + ".json", lastResult.assignment);
      showToast("Downloaded " + lastResult.assignment.id + ".json");
    });

    publishBtn?.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!lastResult) return;

      const session = getTeacherSession();
      if (!session || session.role !== "teacher") {
        setStatus("Teacher login required.", true);
        return;
      }

      const meta = readMeta(form);
      if (!validateStudent(meta)) return;
      if (publishBtn) publishBtn.disabled = true;
      setStatus("Publishing to " + meta.studentUsername + "'s hub…");
      rememberStudent(meta.studentUsername);

      try {
        const res = await fetch("/api/homework-publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherUsername: session.username,
            studentUsername: meta.studentUsername,
            assignment: lastResult.assignment,
            catalogEntry: lastResult.catalogEntry,
            youtubeUrl: meta.youtubeUrl,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Publish failed.");

        setStatus(
          (data.message ||
            "Published! " + meta.studentUsername + " can refresh their Homework Hub.") +
            " Worksheet id: " +
            lastResult.assignment.id
        );
        showToast("Published for " + meta.studentUsername);
        if (data.studentUrl && copyLinkBtn) {
          copyText(data.studentUrl, "Student link copied");
        }
        if (options.onPublished) options.onPublished();
      } catch (err) {
        setStatus((err && err.message) || "Could not publish.", true);
        showToast("Publish failed");
      } finally {
        if (publishBtn) publishBtn.disabled = false;
      }
    });

    copyLinkBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      if (!lastResult) return;
      copyText(
        studentWorksheetUrl(lastResult.assignment.id),
        "Student link copied"
      );
    });

    if (templateSelect) {
      templateSelect.addEventListener("change", async () => {
        const id = templateSelect.value;
        if (!id) return;
        try {
          const loadAssignment =
            options.fetchAssignmentJson ||
            (async (assignmentId) => {
              const res = await fetch(
                "/api/homework-assignment?id=" + encodeURIComponent(assignmentId),
                { cache: "no-store" }
              );
              if (!res.ok) throw new Error("load");
              return res.json();
            });
          const assignment = await loadAssignment(id);
          const catalogEntry = options.getCatalogEntry
            ? options.getCatalogEntry(id)
            : null;
          fillFormFromAssignment(form, assignment, catalogEntry);
          applyResult({
            assignment,
            catalogEntry: catalogEntry || {
              id: assignment.id,
              title: assignment.title,
              students: assignment.studentLabel ? [assignment.studentLabel] : [],
              youtubeUrl: assignment.youtubeUrl,
            },
          });
          showToast("Loaded " + id);
        } catch {
          showToast("Could not load worksheet");
        }
      });
    }

    setActionsEnabled(false);
  }

  function populateTemplates(select, entries) {
    if (!select) return;
    select.innerHTML = '<option value="">Choose to edit or duplicate…</option>';
    (entries || [])
      .slice()
      .sort((a, b) => String(b.title || b.id).localeCompare(String(a.title || a.id)))
      .forEach((entry) => {
        const opt = document.createElement("option");
        opt.value = entry.id;
        opt.textContent = (entry.title || entry.id) + " · " + (entry.students || []).join(", ");
        select.appendChild(opt);
      });
  }

  global.HwMaker = {
    init,
    buildFromLines,
    makeAssignmentId,
    populateTemplates,
    fillFormFromAssignment,
  };
})(window);
