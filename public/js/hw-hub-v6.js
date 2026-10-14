/**
 * Teacher Hub v6 — primary teacher chrome when HwFeatureFlags.hubV6().
 * Mounts live teacher panels into v6 panes. Classic layout is Hub Preview → Hub v1.
 */
(function (global) {
  const FEED_CACHE_KEY = "jlm-hw-teacher-notifications-v1";
  const RECYCLE_KEY = "hw-hubv6-recycle";
  const RECYCLE_MS = 14 * 24 * 60 * 60 * 1000;
  const FEED_MAX = 5;
  const V6_TAB_KEY = "jlm-hw-hubv6-tab";
  const V6_TAB_ORDER_KEY = "jlm-hw-hubv6-tab-order";
  const V6_TAB_LABELS_KEY = "jlm-hw-hubv6-tab-labels";

  /** @type {{ id: string, homeParent: Node, homeNext: ChildNode | null }[]} */
  const mountHomes = [];
  let bound = false;
  let tabsBound = false;
  let tabReorderBound = false;
  let tabEditMode = false;
  let tabDragId = null;
  /** @type {{ btn: HTMLButtonElement, input: HTMLInputElement, tabId: string, original: string } | null} */
  let tabLabelEditing = null;
  let notifications = [];
  let activeId = null;
  let teacherSession = null;
  let activeV6Tab = "preview";

  const TAB_DEFS = [
    { id: "preview", label: "Home" },
    { id: "review", label: "Review Deck" },
    { id: "hwnotes", label: "HW Notes" },
    { id: "maker", label: "Worksheet Maker" },
    { id: "students", label: "Student/Email List" },
    { id: "websites", label: "Websites" },
    { id: "gamelab", label: "Game Lab" },
    { id: "ideas", label: "Ideas & Memos" },
    { id: "hubpreview", label: "Hub Preview" },
  ];

  const TAB_MOUNTS = {
    review: [],
    hwnotes: [],
    maker: ["maker", "library"],
    students: ["account", "birthdays", "promo", "submissions", "mistakes"],
    /* Simple link strips — do not mount heavy Harris/JEM/Game lab panels */
    websites: [],
    gamelab: [],
    preview: [],
    ideas: ["ideas", "lookup-lexicon"],
    hubpreview: ["hubv2"],
  };

  let simpleLinksBound = false;

  function makerDownloadFooterHtml() {
    return (
      '<div class="hw-hub-v6-maker-footer">' +
      '<button type="button" class="btn btn--primary" id="hw-hub-v6-maker-download">Download</button>' +
      "</div>"
    );
  }

  function studentsPaneHtml() {
    return (
      '<div class="hw-hub-v6-mount" data-v6-mount="account"></div>' +
      '<details class="hw-hub-v6-fold" id="hw-hub-v6-fold-submissions">' +
      "<summary>Submissions</summary>" +
      '<div class="hw-hub-v6-mount" data-v6-mount="submissions"></div>' +
      "</details>" +
      '<details class="hw-hub-v6-fold" id="hw-hub-v6-fold-birthdays">' +
      "<summary>Birthdays</summary>" +
      '<div class="hw-hub-v6-mount" data-v6-mount="birthdays"></div>' +
      "</details>" +
      '<details class="hw-hub-v6-fold" id="hw-hub-v6-email-anchor">' +
      "<summary>Email list</summary>" +
      '<p class="hw-hub-v6-pane-lead">Contacts and promo signups — separate from student IDs above.</p>' +
      '<div class="hw-hub-v6-mount" data-v6-mount="promo"></div>' +
      "</details>" +
      '<details class="hw-hub-v6-fold" id="hw-hub-v6-fold-mistakes">' +
      "<summary>Mistakes</summary>" +
      '<div class="hw-hub-v6-mount" data-v6-mount="mistakes"></div>' +
      "</details>"
    );
  }

  /** Retrofit older Student/Email panes: Submissions on top; Birthdays + Email collapsed. */
  function ensureStudentsPaneLayout() {
    const pane = document.getElementById("hw-hub-v6-pane-students");
    if (!pane) return;

    const account = pane.querySelector('[data-v6-mount="account"]');
    const submissions = document.getElementById("hw-hub-v6-fold-submissions");
    const mistakes = document.getElementById("hw-hub-v6-fold-mistakes");
    const bdayMount = pane.querySelector('[data-v6-mount="birthdays"]');
    const promoMount = pane.querySelector('[data-v6-mount="promo"]');

    let birthdays = document.getElementById("hw-hub-v6-fold-birthdays");
    if (!birthdays && bdayMount) {
      const oldSection = bdayMount.closest(".hw-hub-v6-section");
      birthdays = document.createElement("details");
      birthdays.className = "hw-hub-v6-fold";
      birthdays.id = "hw-hub-v6-fold-birthdays";
      const sum = document.createElement("summary");
      sum.textContent = "Birthdays";
      birthdays.appendChild(sum);
      birthdays.appendChild(bdayMount);
      if (oldSection) oldSection.replaceWith(birthdays);
      else pane.appendChild(birthdays);
    }

    let email = document.getElementById("hw-hub-v6-email-anchor");
    if (email && !(email instanceof HTMLDetailsElement) && promoMount) {
      const oldSection = promoMount.closest(".hw-hub-v6-section") || email;
      const fold = document.createElement("details");
      fold.className = "hw-hub-v6-fold";
      fold.id = "hw-hub-v6-email-anchor";
      const sum = document.createElement("summary");
      sum.textContent = "Email list";
      fold.appendChild(sum);
      const lead = oldSection.querySelector?.(".hw-hub-v6-pane-lead");
      if (lead) fold.appendChild(lead);
      else {
        const p = document.createElement("p");
        p.className = "hw-hub-v6-pane-lead";
        p.textContent = "Contacts and promo signups — separate from student IDs above.";
        fold.appendChild(p);
      }
      fold.appendChild(promoMount);
      if (oldSection?.parentNode) oldSection.replaceWith(fold);
      else pane.appendChild(fold);
      email = fold;
    } else if (!email && promoMount) {
      email = document.createElement("details");
      email.className = "hw-hub-v6-fold";
      email.id = "hw-hub-v6-email-anchor";
      const sum = document.createElement("summary");
      sum.textContent = "Email list";
      email.appendChild(sum);
      const p = document.createElement("p");
      p.className = "hw-hub-v6-pane-lead";
      p.textContent = "Contacts and promo signups — separate from student IDs above.";
      email.appendChild(p);
      email.appendChild(promoMount);
      pane.appendChild(email);
    }

    [account, submissions, birthdays, email, mistakes]
      .filter(Boolean)
      .forEach((el) => {
        if (el.parentNode === pane) pane.appendChild(el);
      });
  }

  function downloadMakerWorksheet() {
    if (global.HwTeacherEditor?.downloadCurrent) {
      global.HwTeacherEditor.downloadCurrent();
      return;
    }
    const id = String(
      document.getElementById("hw-teacher-maker-edit-select")?.value || ""
    ).trim();
    if (!id) return;
    const a = document.createElement("a");
    a.href = new URL(
      "/homework/assignments/" + encodeURIComponent(id) + ".json",
      location.origin
    ).href;
    a.download = id + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function enabled() {
    return global.HwFeatureFlags?.hubV6?.() === true;
  }

  function getSession() {
    if (teacherSession?.role === "teacher") return teacherSession;
    const teacher = global.HwAuth?.getTeacherSession?.();
    if (teacher) return teacher;
    try {
      const raw = JSON.parse(localStorage.getItem("jlm-hw-session") || "null");
      if (raw?.role === "teacher") return raw;
    } catch {
      /* ignore */
    }
    return null;
  }

  function isV6PanelVisible() {
    const panel = document.getElementById("hw-hub-v6-panel");
    return !!(panel && !panel.hidden && panel.offsetParent !== null);
  }

  function demoNotifications() {
    return [
      {
        id: "demo-josh-sub",
        type: "submitted",
        at: new Date().toISOString(),
        title: "Josh S submitted HW",
        body: "Josh S submitted “〜たい” (online worksheet).",
        openLabel: "Preview in stage",
        demo: true,
      },
      {
        id: "demo-faye-sub",
        type: "submitted",
        at: new Date(Date.now() - 3600000).toISOString(),
        title: "Faye submitted HW",
        body: "Faye submitted photo homework.",
        openLabel: "Preview in stage",
        demo: true,
      },
      {
        id: "demo-promo",
        type: "promo",
        at: new Date(Date.now() - 7200000).toISOString(),
        title: "New email list subscriber",
        body: "demo@example.com joined the promotions list.",
        openLabel: "View signup",
        demo: true,
        promo: { email: "demo@example.com" },
      },
      {
        id: "demo-ack",
        type: "ack",
        at: new Date(Date.now() - 86400000).toISOString(),
        title: "Josh S finished your notes and is ready for new HW",
        body: "Josh S finished reviewing your notes. They’re waiting for the next assignment.",
        openLabel: "Preview in stage",
        demo: true,
      },
    ];
  }

  function readRecycle() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECYCLE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }

  function writeRecycle(map) {
    try {
      localStorage.setItem(RECYCLE_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  function purgeRecycle(map) {
    const now = Date.now();
    let changed = false;
    Object.keys(map).forEach((id) => {
      const at = Number(map[id]?.dismissedAt || 0);
      if (!at || now - at > RECYCLE_MS) {
        delete map[id];
        changed = true;
      }
    });
    if (changed) writeRecycle(map);
    return map;
  }

  function isRecycled(id) {
    const map = purgeRecycle(readRecycle());
    return !!map[id];
  }

  function dismissToRecycle(id) {
    const map = purgeRecycle(readRecycle());
    map[id] = { dismissedAt: Date.now() };
    writeRecycle(map);
  }

  function displayName(entry) {
    return entry.displayName || entry.name || entry.username || "Student";
  }

  function reviewStatus(entry) {
    const raw = String(entry.reviewStatus || "").toLowerCase();
    if (raw === "reviewed" || raw === "acknowledged" || raw === "submitted") return raw;
    if (entry.studentNotesAckedAt) return "acknowledged";
    if (entry.reviewedAt || entry.teacherNotesSubmittedAt) return "reviewed";
    return "submitted";
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Request failed");
    }
    return res.json();
  }

  async function buildNotifications(session) {
    const items = [];
    const teacher = encodeURIComponent(session.username);

    const [subResult, promoResult, reportResult] = await Promise.all([
      fetchJson("/api/homework-submissions?teacherUsername=" + teacher + "&limit=40").catch(() => null),
      fetchJson("/api/promo-signups?teacherUsername=" + teacher + "&limit=20").catch(() => null),
      fetchJson("/api/feature-reports?teacherUsername=" + teacher + "&limit=40").catch(() => null),
    ]);

    const submissions = Array.isArray(subResult?.submissions) ? subResult.submissions : [];
    submissions.forEach((entry) => {
      const status = reviewStatus(entry);
      const who = displayName(entry);
      const lesson = entry.lessonName || entry.title || entry.assignmentId || "homework";
      const kind = entry.type === "online" ? "online" : entry.type || "photo";
      const baseId = "sub-" + entry.id;

      if (status === "acknowledged") {
        items.push({
          id: baseId + "-ack",
          type: "ack",
          at: entry.studentNotesAckedAt || entry.reviewedAt || entry.submittedAt,
          title: who + " finished your notes and is ready for new HW",
          body:
            who +
            " finished reviewing your notes on “" +
            lesson +
            "”. They’re waiting for the next assignment.",
          submission: entry,
          openLabel: kind === "online" ? "Open worksheet" : "Open submission",
        });
      } else if (status === "submitted") {
        items.push({
          id: baseId + "-sub",
          type: "submitted",
          at: entry.submittedAt,
          title: who + " submitted HW",
          body:
            who +
            " submitted “" +
            lesson +
            "” (" +
            (kind === "online" ? "online worksheet" : kind) +
            ").",
          submission: entry,
          openLabel: kind === "online" ? "Open worksheet" : "View in Submissions",
        });
      } else if (status === "reviewed") {
        items.push({
          id: baseId + "-rev",
          type: "reviewed",
          at: entry.reviewedAt || entry.teacherNotesSubmittedAt || entry.submittedAt,
          title: "Reviewed — " + who,
          body:
            "Your notes on “" +
            lesson +
            "” for " +
            who +
            " are submitted. Open to re-check their sheet and your feedback.",
          submission: entry,
          openLabel: kind === "online" ? "View submission" : "View in Submissions",
        });
      }
    });

    const signups = Array.isArray(promoResult?.signups) ? promoResult.signups : [];
    signups.slice(0, 20).forEach((row) => {
      items.push({
        id: "promo-" + (row.id || row.email),
        type: "promo",
        at: row.createdAt || row.signedUpAt || row.at,
        title: "New email list subscriber",
        body: (row.email || "Someone") + " joined the promotions list.",
        promo: row,
        openLabel: "View signup",
      });
    });

    const reports = Array.isArray(reportResult?.reports) ? reportResult.reports : [];
    reports.forEach((row) => {
      const who =
        row.displayName || row.username || "A student";
      const kind = String(row.kind || "").toLowerCase();
      const isBug = kind === "bug";
      const isReminder = kind === "reminder";
      items.push({
        id: "report-" + row.id,
        type: isReminder ? "reminder" : isBug ? "bug" : "feature",
        at: row.createdAt,
        title: isReminder
          ? row.displayName || row.page || "Shorts / Reels reminder"
          : isBug
            ? "Bug report from " + who
            : "Feature request from " + who,
        body: String(row.message || "").trim(),
        report: row,
        openLabel: isReminder ? "Copy-ready details" : "View message",
      });
    });

    /* Demo cards only on local/dev — never mix into production feed. */
    const local = global.HwFeatureFlags?.isLocalDev?.() === true;
    let list = items.filter((n) => !isRecycled(n.id));
    if (local) {
      let demos = demoNotifications().filter((n) => !isRecycled(n.id));
      if (!demos.length) {
        const map = purgeRecycle(readRecycle());
        Object.keys(map).forEach((id) => {
          if (String(id).startsWith("demo-")) delete map[id];
        });
        writeRecycle(map);
        demos = demoNotifications();
      }
      const ids = new Set(list.map((n) => n.id));
      demos.forEach((d) => {
        if (!ids.has(d.id)) list.push(d);
      });
    }

    list.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    return { items: list.slice(0, FEED_MAX) };
  }

  /* ── Mount / restore existing teacher panels into v6 hosts ── */

  function panelSourceId(mountKey) {
    return "hw-teacher-" + mountKey;
  }

  function activeMainTeacherTab() {
    return (
      document
        .querySelector('.hw-teacher-tabs [aria-selected="true"]')
        ?.getAttribute("data-teacher-tab") || ""
    );
  }

  const ACCOUNT_DESC_DEFAULT =
    "Lesson links, account type, and current homework for each student’s hub.";
  let accountDescBound = false;

  function accountDescEl() {
    return (
      document.getElementById("hw-teacher-account-desc") ||
      document.querySelector("#hw-teacher-account > .hw-platform-card__desc")
    );
  }

  function isAccountMountedInV6() {
    return !!document
      .getElementById("hw-teacher-account")
      ?.classList.contains("hw-hub-v6-mounted-panel");
  }

  function restoreAccountDescDefault() {
    const desc = accountDescEl();
    if (!desc) return;
    const fallback = desc.getAttribute("data-default-desc") || ACCOUNT_DESC_DEFAULT;
    desc.textContent = fallback;
  }

  function birthdaySubtitleForStudent(studentKey) {
    const key = String(studentKey || "").trim();
    if (!key) return "Select a student";

    const entry = global.HwTeacherBirthdays?.lookup?.(key);
    if (!entry) return "Birthday unknown";

    if (entry.month == null || entry.day == null) {
      return entry.note || "Birthday unknown";
    }

    const label =
      entry.label ||
      global.HwTeacherBirthdays?.formatLabel?.(entry) ||
      "Birthday unknown";
    return "Birthday · " + label;
  }

  function syncAccountBirthdayBlurb() {
    const desc = accountDescEl();
    if (!desc) return;
    if (!isAccountMountedInV6()) {
      restoreAccountDescDefault();
      return;
    }
    const student = document.getElementById("hw-teacher-account-student")?.value || "";
    desc.textContent = birthdaySubtitleForStudent(student);
  }

  function bindAccountBirthdayBlurb() {
    if (accountDescBound) return;
    accountDescBound = true;
    document
      .getElementById("hw-teacher-account-student")
      ?.addEventListener("change", () => {
        if (isAccountMountedInV6()) syncAccountBirthdayBlurb();
      });
  }

  function releaseMounts() {
    const activeMain = activeMainTeacherTab();
    while (mountHomes.length) {
      const home = mountHomes.pop();
      const el = document.getElementById(home.id);
      if (!el || !home.homeParent) continue;
      if (home.homeNext && home.homeNext.parentNode === home.homeParent) {
        home.homeParent.insertBefore(el, home.homeNext);
      } else {
        home.homeParent.appendChild(el);
      }
      const key = String(home.id || "").replace(/^hw-teacher-/, "");
      /* Match main tab visibility: only the active main panel stays shown. */
      if (home.id === "hw-lantern-words-editor") {
        el.hidden = true;
      } else {
        el.hidden = activeMain !== key;
      }
      el.classList.remove("hw-hub-v6-mounted-panel");
    }
    restoreAccountDescDefault();
    document.querySelectorAll("[data-v6-mount]").forEach((host) => {
      host.querySelectorAll(".hw-hub-v6-stub").forEach((s) => s.remove());
      host
        .querySelectorAll(
          ".hw-hub-v6-websites-fallback, .hw-hub-v6-gamelab-fallback, .hw-hub-v6-simple-links, [data-v6-mount=\"lantern-words\"]"
        )
        .forEach((s) => s.remove());
    });
  }

  function stubHtml(title, platformTab) {
    const url =
      "/homework/platform.html?tab=hubv6&hubv6=1" +
      (platformTab ? "#" + platformTab : "");
    return (
      '<div class="hw-hub-v6-stub">' +
      "<p><strong>" +
      title +
      "</strong> mounts live when Hub v6 is open inside the Teacher Hub (Hub preview → Hub v6).</p>" +
      '<p><a class="btn btn--ghost btn--sm" href="' +
      url +
      '">Open Teacher Hub · Hub v6</a></p>' +
      "</div>"
    );
  }

  function ensureSimpleWebsites(host) {
    if (!host) return;
    host.querySelectorAll(".hw-hub-v6-websites-fallback, .hw-hub-v6-site-card, .hw-hub-v6-stub").forEach((n) =>
      n.remove()
    );
    if (host.querySelector(".hw-hub-v6-simple-links--websites")) return;
    const wrap = document.createElement("div");
    wrap.className = "hw-hub-v6-simple-links hw-hub-v6-simple-links--websites";
    wrap.innerHTML =
      '<a class="btn btn--ghost btn--sm" href="/preview/harris-notarization/" target="_blank" rel="noopener noreferrer">Harris Firm</a>' +
      '<a class="btn btn--ghost btn--sm" href="/preview/jem-appraisals/" target="_blank" rel="noopener noreferrer">JEM Appraisals</a>' +
      '<a class="btn btn--ghost btn--sm" href="/preview/jd-websites/" target="_blank" rel="noopener noreferrer">JD Website Builder</a>';
    host.appendChild(wrap);
  }

  function ensureSimpleGamelab(host) {
    if (!host) return;
    host.querySelectorAll(".hw-hub-v6-gamelab-fallback, .hw-hub-v6-stub").forEach((n) => n.remove());
    if (host.querySelector(".hw-hub-v6-simple-links--games")) return;
    const wrap = document.createElement("div");
    wrap.className = "hw-hub-v6-simple-links hw-hub-v6-simple-links--games";
    wrap.innerHTML =
      '<a class="btn btn--ghost btn--sm" href="/game/lantern-hunt/" target="_blank" rel="noopener noreferrer">Lantern Word Hunt</a>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="hw-hub-v6-word-list" aria-expanded="false">Word list</button>' +
      '<a class="btn btn--ghost btn--sm" href="/game/otsukai/" target="_blank" rel="noopener noreferrer">はじめてのおつかい</a>' +
      '<a class="btn btn--ghost btn--sm" href="/game/obachan-counters/" target="_blank" rel="noopener noreferrer">Counter Toss</a>' +
      '<a class="btn btn--ghost btn--sm" href="/game/yugen-gatherer/" target="_blank" rel="noopener noreferrer">Yūgen Gatherer</a>' +
      '<a class="btn btn--ghost btn--sm" href="/game/yugen-gatherer/kanji-ray-test-v2.html" target="_blank" rel="noopener noreferrer">Kanji World</a>';
    host.appendChild(wrap);
    if (!host.querySelector('[data-v6-mount="lantern-words"]')) {
      const slot = document.createElement("div");
      slot.className = "hw-hub-v6-mount";
      slot.setAttribute("data-v6-mount", "lantern-words");
      host.appendChild(slot);
    }
    bindSimpleLinkActions();
  }

  function toggleLanternWordsInV6() {
    const btn = document.getElementById("hw-hub-v6-word-list");
    const slot = document.querySelector('[data-v6-mount="lantern-words"]');
    const editor = document.getElementById("hw-lantern-words-editor");
    if (!btn || !slot) return;
    const open = btn.getAttribute("aria-expanded") === "true";
    if (open) {
      /* release editor back via releaseMounts path — unmount just this node */
      const home = mountHomes.find((h) => h.id === "hw-lantern-words-editor");
      if (home && editor && home.homeParent) {
        if (home.homeNext && home.homeNext.parentNode === home.homeParent) {
          home.homeParent.insertBefore(editor, home.homeNext);
        } else {
          home.homeParent.appendChild(editor);
        }
        editor.hidden = true;
        editor.classList.remove("hw-hub-v6-mounted-panel");
        mountHomes.splice(mountHomes.indexOf(home), 1);
      }
      btn.setAttribute("aria-expanded", "false");
      return;
    }
    if (!editor) {
      slot.innerHTML =
        '<p class="hw-hub-v6-pane-lead">Word list editor is available in Teacher Hub → Game lab.</p>';
      btn.setAttribute("aria-expanded", "true");
      return;
    }
    if (editor.parentNode !== slot) {
      mountHomes.push({
        id: "hw-lantern-words-editor",
        homeParent: editor.parentNode,
        homeNext: editor.nextSibling,
      });
      slot.appendChild(editor);
    }
    editor.hidden = false;
    editor.classList.add("hw-hub-v6-mounted-panel");
    btn.setAttribute("aria-expanded", "true");
    global.HwTeacherLanternWords?.reloadIfNeeded?.();
    editor.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function bindSimpleLinkActions() {
    if (simpleLinksBound) return;
    simpleLinksBound = true;
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.id === "hw-hub-v6-word-list" || t.closest("#hw-hub-v6-word-list")) {
        e.preventDefault();
        toggleLanternWordsInV6();
      }
    });
  }

  function mountPanel(mountKey) {
    const host = document.querySelector('[data-v6-mount="' + mountKey + '"]');
    if (!host) return false;
    const sourceId = panelSourceId(mountKey);
    const source = document.getElementById(sourceId);
    if (!source) {
      if (mountKey === "harris" || mountKey === "jem") {
        /* websites use combined host — handled in activateV6Tab */
        return false;
      }
      if (!host.querySelector(".hw-hub-v6-stub")) {
        const titles = {
          maker: "Worksheet maker",
          library: "Worksheet library",
          account: "Student info",
          birthdays: "Birthdays",
          promo: "Email list",
          submissions: "Submissions",
          mistakes: "Mistakes",
          gamelab: "Game lab",
          ideas: "Ideas & memos",
        };
        host.insertAdjacentHTML("beforeend", stubHtml(titles[mountKey] || mountKey, mountKey));
      }
      return false;
    }
    if (source.parentNode === host) {
      source.hidden = false;
      return true;
    }
    mountHomes.push({
      id: sourceId,
      homeParent: source.parentNode,
      homeNext: source.nextSibling,
    });
    host.appendChild(source);
    source.hidden = false;
    source.classList.add("hw-hub-v6-mounted-panel");
    return true;
  }

  function afterMountHooks(tabId) {
    if (tabId === "ideas" || (TAB_MOUNTS[tabId] || []).includes("ideas")) {
      global.HwTeacherIdeas?.reloadIfNeeded?.();
    }
    if ((TAB_MOUNTS[tabId] || []).includes("mistakes")) {
      global.HwTeacherMistakes?.reloadIfNeeded?.();
    }
    if ((TAB_MOUNTS[tabId] || []).includes("account")) {
      global.HwTeacherEditor?.syncPublishPicker?.();
      bindAccountBirthdayBlurb();
      syncAccountBirthdayBlurb();
    }
    if ((TAB_MOUNTS[tabId] || []).includes("submissions")) {
      global.HwTeacherSubmissions?.reload?.();
    }
    if ((TAB_MOUNTS[tabId] || []).includes("birthdays")) {
      const reload = global.HwTeacherBirthdays?.reload?.();
      if (reload && typeof reload.then === "function") {
        void reload.then(() => syncAccountBirthdayBlurb());
      } else {
        syncAccountBirthdayBlurb();
      }
    }
    if ((TAB_MOUNTS[tabId] || []).includes("promo")) {
      document.getElementById("hw-promo-refresh")?.click();
    }
    if ((TAB_MOUNTS[tabId] || []).includes("library")) {
      document.getElementById("hw-library-search")?.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if ((TAB_MOUNTS[tabId] || []).includes("lookup-lexicon")) {
      global.HwTeacherLookupLexicon?.reloadIfNeeded?.();
    }
  }

  function getHubV6Tablist() {
    return (
      document.querySelector("#hw-hub-v6-panel .hw-hub-v6-tabs") ||
      document.querySelector(".hw-hub-v6-tabs")
    );
  }

  function getHubV6TabIdsFromDom() {
    const tablist = getHubV6Tablist();
    if (!tablist) return TAB_DEFS.map((t) => t.id);
    return [...tablist.querySelectorAll("[data-hub-v6-tab]")]
      .map((btn) => String(btn.getAttribute("data-hub-v6-tab") || "").trim())
      .filter(Boolean);
  }

  function hasSavedTabOrder() {
    try {
      const raw = localStorage.getItem(V6_TAB_ORDER_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }

  function mergeTabOrder(saved) {
    const defaults = TAB_DEFS.map((t) => t.id);
    const domIds = getHubV6TabIdsFromDom();
    const allIds = [...new Set([...defaults, ...domIds])];
    if (!Array.isArray(saved) || !saved.length) return allIds;
    const ordered = [];
    const seen = new Set();
    saved.forEach((id) => {
      const key = String(id || "").trim();
      if (key && allIds.includes(key) && !seen.has(key)) {
        ordered.push(key);
        seen.add(key);
      }
    });
    allIds.forEach((id) => {
      if (!seen.has(id)) ordered.push(id);
    });
    return ordered;
  }

  function readSavedTabOrder() {
    try {
      const raw = localStorage.getItem(V6_TAB_ORDER_KEY);
      if (!raw) return mergeTabOrder(null);
      return mergeTabOrder(JSON.parse(raw));
    } catch {
      return mergeTabOrder(null);
    }
  }

  function saveTabOrderFromDom() {
    const order = getHubV6TabIdsFromDom();
    try {
      localStorage.setItem(V6_TAB_ORDER_KEY, JSON.stringify(order));
    } catch {
      /* ignore */
    }
    return order;
  }

  function defaultTabLabel(tabId) {
    const key = String(tabId || "").trim();
    const def = TAB_DEFS.find((t) => t.id === key);
    return def?.label || key;
  }

  function readSavedTabLabels() {
    try {
      const raw = localStorage.getItem(V6_TAB_LABELS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function tabLabelFor(tabId) {
    const key = String(tabId || "").trim();
    if (!key) return "";
    const custom = String(readSavedTabLabels()[key] || "").trim();
    return custom || defaultTabLabel(key);
  }

  function saveTabLabel(tabId, label) {
    const key = String(tabId || "").trim();
    if (!key) return;
    const text = String(label || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 48);
    const labels = readSavedTabLabels();
    if (!text || text === defaultTabLabel(key)) {
      delete labels[key];
    } else {
      labels[key] = text;
    }
    try {
      localStorage.setItem(V6_TAB_LABELS_KEY, JSON.stringify(labels));
    } catch {
      /* ignore */
    }
  }

  function applySavedTabLabels() {
    getHubV6Tablist()
      ?.querySelectorAll("[data-hub-v6-tab]")
      .forEach((btn) => {
        const id = btn.getAttribute("data-hub-v6-tab");
        if (!id || btn.classList.contains("is-label-editing")) return;
        btn.textContent = tabLabelFor(id);
      });
  }

  function finishTabLabelEdit(save) {
    if (!tabLabelEditing) return;
    const { btn, input, tabId, original } = tabLabelEditing;
    input.remove();
    btn.classList.remove("is-label-editing");
    btn.draggable = tabEditMode;
    if (save) {
      const next =
        String(input.value || "")
          .trim()
          .replace(/\s+/g, " ") || defaultTabLabel(tabId);
      saveTabLabel(tabId, next);
      btn.textContent = tabLabelFor(tabId);
    } else {
      btn.textContent = original;
    }
    tabLabelEditing = null;
    syncHubV6TabSlider();
  }

  function startTabLabelEdit(btn) {
    if (!tabEditMode || !btn) return;
    const tabId = String(btn.getAttribute("data-hub-v6-tab") || "").trim();
    if (!tabId) return;
    if (tabLabelEditing?.btn === btn) return;
    finishTabLabelEdit(true);

    const original = btn.textContent.trim() || tabLabelFor(tabId);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "hw-hub-v6-tabs__label-input";
    input.value = original;
    input.setAttribute("aria-label", "Tab name");
    input.maxLength = 48;

    btn.classList.add("is-label-editing");
    btn.draggable = false;
    btn.textContent = "";
    btn.appendChild(input);
    input.focus();
    input.select();

    tabLabelEditing = { btn, input, tabId, original };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finishTabLabelEdit(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finishTabLabelEdit(false);
      }
    });
    input.addEventListener("blur", () => finishTabLabelEdit(true));
  }

  function applySavedTabOrder() {
    const tablist = getHubV6Tablist();
    if (!tablist) return;
    const slider = tablist.querySelector(".hw-hub-v6-tabs__slider");
    readSavedTabOrder().forEach((id) => {
      const btn = document.getElementById("hw-hub-v6-tab-" + id);
      if (btn) tablist.appendChild(btn);
    });
    if (slider && tablist.firstChild !== slider) {
      tablist.insertBefore(slider, tablist.firstChild);
    }
  }

  /** Always keep the banner control as Edit (never leave a cached "Refresh"). */
  function ensureEditButton() {
    let editBtn =
      document.getElementById("hw-hub-v6-edit") ||
      document.getElementById("hw-hub-v6-refresh");
    if (!editBtn) {
      const banner = document.querySelector("#hw-hub-v6-panel .hw-hub-v6__banner");
      if (!banner) return null;
      editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn--ghost btn--sm";
      banner.appendChild(editBtn);
    }
    editBtn.id = "hw-hub-v6-edit";
    if (!tabEditMode && editBtn.textContent.trim() !== "Edit") {
      editBtn.textContent = "Edit";
    }
    if (!editBtn.hasAttribute("aria-pressed")) {
      editBtn.setAttribute("aria-pressed", "false");
    }
    return editBtn;
  }

  function setTabEditMode(on) {
    if (!on && tabLabelEditing) finishTabLabelEdit(true);
    tabEditMode = !!on;
    const tablist = getHubV6Tablist();
    const editBtn = ensureEditButton();
    tablist?.classList.toggle("is-tab-edit", tabEditMode);
    if (editBtn) {
      editBtn.textContent = tabEditMode ? "Done" : "Edit";
      editBtn.setAttribute("aria-pressed", tabEditMode ? "true" : "false");
      editBtn.classList.toggle("is-active", tabEditMode);
      editBtn.title = tabEditMode
        ? "Drag tabs to reorder · double-click a tab to rename"
        : "";
    }
    tablist?.querySelectorAll("[data-hub-v6-tab]").forEach((btn) => {
      btn.draggable = tabEditMode && !btn.classList.contains("is-label-editing");
    });
    const slider = tablist?.querySelector(".hw-hub-v6-tabs__slider");
    if (slider) slider.style.opacity = tabEditMode ? "0" : "";
    if (!tabEditMode) {
      saveTabOrderFromDom();
      applySavedTabLabels();
    }
    syncHubV6TabSlider();
  }

  function bindTabReorder() {
    if (tabReorderBound) return;
    const panel = document.getElementById("hw-hub-v6-panel");
    if (!panel) return;
    tabReorderBound = true;
    ensureEditButton();

    const editBtn =
      document.getElementById("hw-hub-v6-edit") ||
      document.getElementById("hw-hub-v6-refresh");
    if (editBtn) {
      if (editBtn.id === "hw-hub-v6-refresh") editBtn.id = "hw-hub-v6-edit";
      if (editBtn.textContent.trim() === "Refresh") editBtn.textContent = "Edit";
      editBtn.setAttribute("aria-pressed", "false");
      editBtn.addEventListener("click", () => setTabEditMode(!tabEditMode));
    }

    panel.addEventListener("dragstart", (ev) => {
      if (!tabEditMode) return;
      if (tabLabelEditing) finishTabLabelEdit(true);
      const btn = ev.target.closest?.("[data-hub-v6-tab]");
      if (!btn || !panel.contains(btn)) return;
      if (btn.classList.contains("is-label-editing")) {
        ev.preventDefault();
        return;
      }
      tabDragId = btn.getAttribute("data-hub-v6-tab");
      btn.classList.add("is-dragging");
      ev.dataTransfer?.setData("text/plain", tabDragId || "");
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
    });

    panel.addEventListener("dblclick", (ev) => {
      if (!tabEditMode) return;
      const btn = ev.target.closest?.("[data-hub-v6-tab]");
      if (!btn || !panel.contains(btn)) return;
      if (ev.target.closest?.(".hw-hub-v6-tabs__label-input")) return;
      ev.preventDefault();
      ev.stopPropagation();
      startTabLabelEdit(btn);
    });

    panel.addEventListener("dragover", (ev) => {
      if (!tabEditMode || !tabDragId) return;
      const btn = ev.target.closest?.("[data-hub-v6-tab]");
      if (!btn || !panel.contains(btn)) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      getHubV6Tablist()
        ?.querySelectorAll("[data-hub-v6-tab].is-drop-target")
        .forEach((el) => el.classList.remove("is-drop-target"));
      if (btn.getAttribute("data-hub-v6-tab") !== tabDragId) {
        btn.classList.add("is-drop-target");
      }
    });

    panel.addEventListener("drop", (ev) => {
      if (!tabEditMode || !tabDragId) return;
      const btn = ev.target.closest?.("[data-hub-v6-tab]");
      if (!btn || !panel.contains(btn)) return;
      ev.preventDefault();
      const dropId = btn.getAttribute("data-hub-v6-tab");
      const tablist = getHubV6Tablist();
      const dragged = document.getElementById("hw-hub-v6-tab-" + tabDragId);
      if (!tablist || !dragged || !dropId || dropId === tabDragId) return;
      tablist.insertBefore(dragged, btn);
      btn.classList.remove("is-drop-target");
    });

    panel.addEventListener("dragend", (ev) => {
      const btn = ev.target.closest?.("[data-hub-v6-tab]");
      btn?.classList.remove("is-dragging");
      getHubV6Tablist()
        ?.querySelectorAll("[data-hub-v6-tab].is-drop-target")
        .forEach((el) => el.classList.remove("is-drop-target"));
      tabDragId = null;
    });
  }

  function syncTabButtons(tabId) {
    document.querySelectorAll("[data-hub-v6-tab]").forEach((btn) => {
      const on = btn.getAttribute("data-hub-v6-tab") === tabId;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-hub-v6-pane]").forEach((pane) => {
      pane.hidden = pane.getAttribute("data-hub-v6-pane") !== tabId;
    });
    syncHubV6TabSlider();
  }

  function ensureHubV6TabSlider(tablist) {
    if (!tablist) return null;
    let slider = tablist.querySelector(".hw-hub-v6-tabs__slider");
    if (!slider) {
      slider = document.createElement("span");
      slider.className = "hw-hub-v6-tabs__slider";
      slider.setAttribute("aria-hidden", "true");
      tablist.insertBefore(slider, tablist.firstChild);
    }
    return slider;
  }

  function syncHubV6TabSlider() {
    const tablist =
      document.querySelector("#hw-hub-v6-panel .hw-hub-v6-tabs") ||
      document.querySelector(".hw-hub-v6-tabs");
    if (!tablist) return;
    const slider = ensureHubV6TabSlider(tablist);
    const active =
      tablist.querySelector(".hw-hub-v6-tabs__btn.is-active") ||
      tablist.querySelector('[aria-selected="true"]');
    if (!slider || !active || active.hidden) {
      if (slider) slider.style.opacity = "0";
      return;
    }
    slider.style.opacity = "1";
    const listRect = tablist.getBoundingClientRect();
    const btnRect = active.getBoundingClientRect();
    const x = btnRect.left - listRect.left + tablist.scrollLeft;
    const y = btnRect.top - listRect.top + tablist.scrollTop;
    slider.style.width = Math.max(0, btnRect.width) + "px";
    slider.style.height = Math.max(0, btnRect.height) + "px";
    slider.style.transform = "translate(" + x + "px, " + y + "px)";

    if (!tablist.classList.contains("is-slider-ready")) {
      requestAnimationFrame(() => {
        tablist.classList.add("is-slider-ready");
      });
    }
  }

  function bindHubV6TabSliderLayout() {
    if (bindHubV6TabSliderLayout.bound) return;
    bindHubV6TabSliderLayout.bound = true;
    window.addEventListener("resize", syncHubV6TabSlider);
    if (typeof ResizeObserver === "function") {
      const tablist =
        document.querySelector("#hw-hub-v6-panel .hw-hub-v6-tabs") ||
        document.querySelector(".hw-hub-v6-tabs");
      if (tablist) {
        const ro = new ResizeObserver(() => syncHubV6TabSlider());
        ro.observe(tablist);
      }
    }
  }

  function birthdayTickerPhrase(entry) {
    const name = String(entry.name || entry.id || "Student").trim() || "Student";
    const date =
      global.HwTeacherBirthdays?.formatLabel?.(entry) ||
      (entry.label ? String(entry.label) : "");
    let when = global.HwTeacherBirthdays?.countdownLabel?.(entry) || "";
    if (/^\s*In\s+/i.test(when)) when = when.replace(/^\s*In\s+/i, "in ");
    else when = when.toLowerCase();
    return (
      "🎂 Upcoming birthday " +
      name +
      (date && date !== "—" ? " " + date : "") +
      (when ? " · " + when : "")
    );
  }

  function renderBirthdayTicker(entries) {
    const track = document.getElementById("hw-hub-v6-bday-ticker-track");
    const wrap = document.getElementById("hw-hub-v6-bday-ticker");
    if (!track) return;
    const list = Array.isArray(entries) ? entries.slice(0, 2) : [];
    track.replaceChildren();
    if (!list.length) {
      const span = document.createElement("span");
      span.className = "hw-hub-v6-bday-ticker__item";
      span.textContent = "🎂 No upcoming birthdays on the list yet";
      track.appendChild(span);
      if (wrap) wrap.setAttribute("data-empty", "1");
      return;
    }
    if (wrap) wrap.removeAttribute("data-empty");
    /* One sequence (each birthday once), then one clone for seamless loop */
    const text = list.map(birthdayTickerPhrase).join("     ···     ");
    const gap = "     ···     ";
    const makeItem = (clone) => {
      const span = document.createElement("span");
      span.className = "hw-hub-v6-bday-ticker__item";
      span.textContent = text + gap;
      if (clone) span.setAttribute("aria-hidden", "true");
      return span;
    };
    track.appendChild(makeItem(false));
    track.appendChild(makeItem(true));
    track.style.animation = "none";
    void track.offsetWidth;
    track.style.animation = "";
  }

  async function refreshBirthdayTicker() {
    try {
      if (global.HwTeacherBirthdays?.reload) {
        await global.HwTeacherBirthdays.reload();
      }
      let next = global.HwTeacherBirthdays?.upcoming?.(2) || [];
      if (!next.length && getSession()) {
        const teacher = encodeURIComponent(getSession().username || "jlm");
        const data = await fetchJson("/api/student-birthdays?teacherUsername=" + teacher);
        const all = Array.isArray(data.birthdays) ? data.birthdays : [];
        next = all
          .filter((e) => e && e.daysUntil != null)
          .sort((a, b) => Number(a.daysUntil) - Number(b.daysUntil))
          .slice(0, 2);
      }
      renderBirthdayTicker(next);
    } catch {
      renderBirthdayTicker([]);
    }
  }

  function activateV6Tab(tabId) {
    if (!TAB_DEFS.some((t) => t.id === tabId)) tabId = "preview";
    activeV6Tab = tabId;
    try {
      localStorage.setItem(V6_TAB_KEY, tabId);
    } catch {
      /* ignore */
    }

    if (tabId !== "hubpreview") {
      document.body.classList.remove("hw-hub-v1-classic");
    }

    const tablist =
      document.querySelector("#hw-hub-v6-panel .hw-hub-v6-tabs") ||
      document.querySelector(".hw-hub-v6-tabs");
    const tabsTopBefore = tablist?.getBoundingClientRect().top;

    releaseMounts();
    syncTabButtons(tabId);

    const keys = TAB_MOUNTS[tabId] || [];
    keys.forEach((key) => mountPanel(key));

    if (tabId === "websites") {
      const host =
        document.querySelector("#hw-hub-v6-pane-websites [data-v6-mount=\"websites\"]") ||
        document.querySelector("#hw-hub-v6-pane-websites .hw-hub-v6-mount--split") ||
        document.getElementById("hw-hub-v6-pane-websites");
      ensureSimpleWebsites(host);
    }
    if (tabId === "gamelab") {
      const host =
        document.querySelector('[data-v6-mount="gamelab"]') ||
        document.getElementById("hw-hub-v6-pane-gamelab");
      ensureSimpleGamelab(host);
    }

    afterMountHooks(tabId);

    if (tabId === "preview") {
      void refreshNotifications();
      void refreshBirthdayTicker();
    }
    if (tabId === "review") {
      global.HwGlassDeck?.open?.(document.getElementById("hw-hub-v6-glass-deck-host"));
    } else {
      global.HwGlassDeck?.close?.();
    }
    if (tabId === "hwnotes") {
      bindReviewDeck();
      void refreshReviewDeck();
    }
    if (tabId === "hubpreview") {
      const iframe = document.getElementById("hw-hub-version-iframe");
      if (iframe?.dataset?.pendingSrc) {
        iframe.src = iframe.dataset.pendingSrc;
        delete iframe.dataset.pendingSrc;
      }
      try {
        const ver = localStorage.getItem("jlm-hw-teacher-hub-version") || "3";
        if (ver === "1") document.body.classList.add("hw-hub-v1-classic");
      } catch {
        /* ignore */
      }
    }

    /* Keep the tab row visually stable when pane height changes. */
    if (tablist && tabsTopBefore != null) {
      const delta = tablist.getBoundingClientRect().top - tabsTopBefore;
      if (Math.abs(delta) > 1) window.scrollBy(0, delta);
      syncHubV6TabSlider();
    }
  }

  /* ── HW Notes — pick a waiting submission, Start opens full-sheet review ── */

  let reviewDeckBound = false;
  let reviewPending = [];
  let reviewSelectedId = "";

  function reviewSession() {
    return teacherSession || global.HwAuth?.getTeacherSession?.() || null;
  }

  function selectedReviewEntry() {
    if (!reviewSelectedId) return null;
    return reviewPending.find((s) => String(s.id) === reviewSelectedId) || null;
  }

  function syncReviewSelectionUi() {
    const list = document.getElementById("hw-hub-v6-review-list");
    const startBtn = document.getElementById("hw-hub-v6-review-start");
    const deleteBtn = document.getElementById("hw-hub-v6-review-delete");
    list?.querySelectorAll("[data-submission-id]").forEach((btn) => {
      const on = btn.getAttribute("data-submission-id") === reviewSelectedId;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (startBtn) {
      startBtn.disabled = !selectedReviewEntry();
    }
    if (deleteBtn) {
      deleteBtn.disabled = !selectedReviewEntry();
    }
  }

  async function openSelectedFullSheetReview() {
    const entry = selectedReviewEntry();
    if (!entry) {
      global.HwToast?.show?.("Pick a student submission first.");
      return;
    }
    if (reviewStatus(entry) !== "submitted") {
      global.HwToast?.show?.("That submission is already finished — refresh the list.");
      await refreshReviewDeck();
      return;
    }
    if (global.HwTeacherReview?.openOnlineSubmission) {
      await global.HwTeacherReview.openOnlineSubmission(entry);
      return;
    }
    global.HwToast?.show?.("Full-sheet review isn’t available yet — hard-refresh.");
  }

  async function deleteReviewSubmission(submissionId, label) {
    const id = String(submissionId || "").trim();
    if (!id) return;
    const session = reviewSession();
    if (!session?.username) {
      global.HwToast?.show?.("Teacher login required.");
      return;
    }
    const who = String(label || "this submission").trim() || "this submission";
    if (
      !window.confirm(
        "Delete " + who + "?\n\nThis removes the submission permanently. You can’t undo it."
      )
    ) {
      return;
    }

    try {
      const res = await fetch("/api/homework-submissions/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherUsername: session.username,
          submissionId: id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete submission.");
      if (reviewSelectedId === id) reviewSelectedId = "";
      global.HwToast?.show?.(data.message || "Submission deleted.");
      await refreshReviewDeck();
    } catch (err) {
      global.HwToast?.show?.(err?.message || "Could not delete submission.");
    }
  }

  function bindReviewDeck() {
    if (reviewDeckBound) return;
    const pane = document.getElementById("hw-hub-v6-pane-hwnotes");
    if (!pane) return;
    reviewDeckBound = true;
    pane.addEventListener("click", (ev) => {
      const delRow = ev.target.closest?.("[data-delete-submission-id]");
      if (delRow && pane.contains(delRow)) {
        ev.preventDefault();
        ev.stopPropagation();
        const id = delRow.getAttribute("data-delete-submission-id") || "";
        const label = delRow.getAttribute("data-delete-label") || "";
        void deleteReviewSubmission(id, label);
        return;
      }
      const pick = ev.target.closest?.("[data-submission-id]");
      if (pick && pane.contains(pick)) {
        ev.preventDefault();
        reviewSelectedId = pick.getAttribute("data-submission-id") || "";
        syncReviewSelectionUi();
        return;
      }
      if (ev.target.closest?.("#hw-hub-v6-review-start")) {
        ev.preventDefault();
        void openSelectedFullSheetReview();
        return;
      }
      if (ev.target.closest?.("#hw-hub-v6-review-delete")) {
        ev.preventDefault();
        const entry = selectedReviewEntry();
        if (!entry) {
          global.HwToast?.show?.("Pick a student submission first.");
          return;
        }
        const label =
          (entry.displayName || entry.username || "Student") +
          " — " +
          (entry.lessonName || entry.title || entry.assignmentId || "Homework");
        void deleteReviewSubmission(entry.id, label);
        return;
      }
      if (ev.target.closest?.("#hw-hub-v6-review-refresh")) {
        ev.preventDefault();
        void refreshReviewDeck();
      }
    });
    pane.addEventListener("dblclick", (ev) => {
      if (ev.target.closest?.("[data-delete-submission-id]")) return;
      const pick = ev.target.closest?.("[data-submission-id]");
      if (!pick || !pane.contains(pick)) return;
      ev.preventDefault();
      reviewSelectedId = pick.getAttribute("data-submission-id") || "";
      syncReviewSelectionUi();
      void openSelectedFullSheetReview();
    });
  }

  async function refreshReviewDeck() {
    ensureHwNotesDeleteControls();
    const summary = document.getElementById("hw-hub-v6-review-summary");
    const list = document.getElementById("hw-hub-v6-review-list");
    const startBtn = document.getElementById("hw-hub-v6-review-start");
    const deleteBtn = document.getElementById("hw-hub-v6-review-delete");
    if (!summary) return;

    const session = reviewSession();
    if (!session?.username) {
      summary.textContent = "Teacher login required.";
      return;
    }

    summary.textContent = "Loading…";
    if (startBtn) startBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = true;

    try {
      const res = await fetch(
        "/api/homework-submissions?teacherUsername=" + encodeURIComponent(session.username)
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load submissions.");

      reviewPending = (Array.isArray(data.submissions) ? data.submissions : [])
        .filter((s) => s?.type === "online" && reviewStatus(s) === "submitted")
        .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));

      if (!reviewPending.length) {
        reviewSelectedId = "";
        summary.textContent = "Nothing waiting — every submission has your notes.";
        if (list) list.replaceChildren();
        if (startBtn) startBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;
        return;
      }

      summary.textContent =
        reviewPending.length +
        (reviewPending.length === 1 ? " submission" : " submissions") +
        " waiting on your notes. Pick one, then Start deck — or Delete to remove a duplicate.";

      if (
        reviewSelectedId &&
        !reviewPending.some((s) => String(s.id) === reviewSelectedId)
      ) {
        reviewSelectedId = "";
      }

      if (list) {
        list.replaceChildren();
        reviewPending.forEach((entry) => {
          const id = String(entry.id || "");
          const label =
            (entry.displayName || entry.username || "Student") +
            " — " +
            (entry.lessonName || entry.title || entry.assignmentId || "Homework");
          const li = document.createElement("li");
          li.className = "hw-hub-v6-review-list__row";
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "hw-hub-v6-review-list__item";
          btn.setAttribute("data-submission-id", id);
          btn.setAttribute("aria-pressed", "false");
          btn.textContent = label;
          const del = document.createElement("button");
          del.type = "button";
          del.className = "btn btn--ghost btn--sm hw-btn--danger hw-hub-v6-review-list__delete";
          del.setAttribute("data-delete-submission-id", id);
          del.setAttribute("data-delete-label", label);
          del.setAttribute("aria-label", "Delete " + label);
          del.textContent = "Delete";
          li.appendChild(btn);
          li.appendChild(del);
          list.appendChild(li);
        });
      }
      syncReviewSelectionUi();
    } catch (err) {
      summary.textContent = err?.message || "Could not load submissions.";
    }
  }

  function ensureHwNotesDeleteControls() {
    const actions = document.querySelector(
      "#hw-hub-v6-pane-hwnotes .hw-hub-v6-review-actions"
    );
    if (!actions) return;
    if (document.getElementById("hw-hub-v6-review-delete")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--ghost btn--sm hw-btn--danger";
    btn.id = "hw-hub-v6-review-delete";
    btn.disabled = true;
    btn.textContent = "Delete";
    const refresh = document.getElementById("hw-hub-v6-review-refresh");
    if (refresh) actions.insertBefore(btn, refresh);
    else actions.appendChild(btn);
  }

  /* ── Notifications (Hub Preview tab) ── */

  function setStageMode(mode) {
    const feed = document.getElementById("hw-hub-v6-stage-feed");
    const detail = document.getElementById("hw-hub-v6-stage-detail");
    if (feed) feed.hidden = mode !== "feed";
    if (detail) detail.hidden = mode !== "detail";
  }

  function renderMain(note) {
    const detail = document.getElementById("hw-hub-v6-stage-detail");
    if (!detail) return;

    if (!note) {
      activeId = null;
      detail.replaceChildren();
      setStageMode("feed");
      return;
    }

    setStageMode("detail");
    detail.replaceChildren();

    const title = document.createElement("h3");
    title.className = "hw-hub-v6__main-title";
    title.textContent = note.title;
    detail.appendChild(title);

    const body = document.createElement("p");
    body.className = "hw-hub-v6__main-body";
    body.textContent = note.body || "";
    detail.appendChild(body);

    if (note.report?.hasImage && note.report.id) {
      const shot = document.createElement("img");
      shot.className = "hw-hub-v6__report-shot";
      shot.alt = "Bug report screenshot";
      const teacher = String(
        global.HwAuth?.getSession?.()?.username ||
          global.HwAuth?.getTeacherSession?.()?.username ||
          "jlm"
      );
      shot.src =
        "/api/feature-report-image?id=" +
        encodeURIComponent(note.report.id) +
        "&teacherUsername=" +
        encodeURIComponent(teacher);
      shot.loading = "lazy";
      detail.appendChild(shot);
    }

    const actions = document.createElement("div");
    actions.className = "hw-hub-v6__main-actions";

    if (note.submission || note.demo || note.promo || note.birthday || note.report) {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn btn--primary btn--sm";
      openBtn.textContent = note.openLabel || "Open";
      openBtn.addEventListener("click", () => void openNoteTarget(note));
      actions.appendChild(openBtn);
    }

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn--ghost btn--sm";
    clearBtn.textContent = "Back to notifications";
    clearBtn.addEventListener("click", () => {
      activeId = null;
      renderMain(null);
    });
    actions.appendChild(clearBtn);

    detail.appendChild(actions);
  }

  async function openNoteTarget(note) {
    if (note.submission?.type === "online") {
      if (global.HwTeacherReview?.openOnlineSubmission) {
        await global.HwTeacherReview.openOnlineSubmission(note.submission);
        return;
      }
      /* Fallback: open Submissions with this student filtered if review API missing. */
      activateV6Tab("students");
      const fold = document.getElementById("hw-hub-v6-fold-submissions");
      if (fold) fold.open = true;
      const studentFilter = document.getElementById("hw-submissions-student");
      if (studentFilter && note.submission.username) {
        studentFilter.value = String(note.submission.username);
        studentFilter.dispatchEvent(new Event("change", { bubbles: true }));
      }
      global.HwToast?.show?.("Open Review / View submission under Submissions.");
      return;
    }
    if (note.submission) {
      activateV6Tab("students");
      const fold = document.getElementById("hw-hub-v6-fold-submissions");
      if (fold) fold.open = true;
      global.HwToast?.show?.("Opened Submissions under Student/Email List.");
      return;
    }
    if (note.promo) {
      activateV6Tab("students");
      const emailFold = document.getElementById("hw-hub-v6-email-anchor");
      if (emailFold instanceof HTMLDetailsElement) emailFold.open = true;
      emailFold?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      return;
    }
    if (note.report) {
      /* Full message is already on the detail card. */
      const rk = String(note.report.kind || "").toLowerCase();
      if (rk === "reminder") {
        global.HwToast?.show?.("Shorts / Reels reminder — copy text from the card.");
        return;
      }
      global.HwToast?.show?.(
        (rk === "bug" ? "Bug report" : "Feature request") +
          " from " +
          (note.report.displayName || note.report.username || "student")
      );
      return;
    }
    if (note.birthday) {
      activateV6Tab("students");
      const bdayFold = document.getElementById("hw-hub-v6-fold-birthdays");
      if (bdayFold instanceof HTMLDetailsElement) bdayFold.open = true;
      bdayFold?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      return;
    }
    global.HwToast?.show?.("Demo notification — wire a real submission to open HW.");
  }

  function renderList() {
    const list = document.getElementById("hw-hub-v6-list");
    const meta = document.getElementById("hw-hub-v6-feed-meta");
    const recycle = document.getElementById("hw-hub-v6-recycle");
    if (!list) return;

    const recycleMap = purgeRecycle(readRecycle());
    const recycleCount = Object.keys(recycleMap).length;
    if (recycle) {
      recycle.textContent = recycleCount
        ? recycleCount + " dismissed note" + (recycleCount === 1 ? "" : "s") + " in recycle (auto-delete after 2 weeks)"
        : "Dismiss with ✕ sends a note to recycle (auto-deletes after 2 weeks).";
    }

    const visible = notifications.filter((n) => !isRecycled(n.id));
    if (meta) {
      meta.textContent = visible.length ? visible.length + " active" : "Caught up";
    }

    list.replaceChildren();
    if (!visible.length) {
      const li = document.createElement("li");
      li.className = "hw-hub-v6__item hw-hub-v6__item--empty";
      li.textContent = "No notifications right now.";
      list.appendChild(li);
      return;
    }

    function openNote(note) {
      activeId = note.id;
      renderMain(note);
    }

    visible.forEach((note) => {
      const li = document.createElement("li");
      li.className = "hw-hub-v6__item";

      const title = document.createElement("a");
      title.className = "hw-hub-v6__item-title";
      title.href = "#";
      title.textContent = note.title;
      title.addEventListener("click", (e) => {
        e.preventDefault();
        openNote(note);
      });
      li.appendChild(title);

      const actions = document.createElement("div");
      actions.className = "hw-hub-v6__item-actions";

      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "hw-hub-v6__dismiss";
      dismiss.setAttribute("aria-label", "Dismiss to recycle");
      dismiss.textContent = "×";
      dismiss.addEventListener("click", () => {
        dismissToRecycle(note.id);
        if (activeId === note.id) {
          activeId = null;
          renderMain(null);
        }
        notifications = notifications.filter((n) => n.id !== note.id);
        renderList();
      });
      actions.appendChild(dismiss);

      li.appendChild(actions);
      list.appendChild(li);
    });
  }

  /** Last feed we painted — reopening the tab shows it instantly while the APIs run. */
  function readCachedFeed() {
    try {
      const raw = localStorage.getItem(FEED_CACHE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.items) ? parsed.items : [];
    } catch {
      return [];
    }
  }

  function writeCachedFeed(items) {
    try {
      localStorage.setItem(
        FEED_CACHE_KEY,
        JSON.stringify({ savedAt: new Date().toISOString(), items })
      );
    } catch {
      /* quota / private mode — cache is optional */
    }
  }

  async function refreshNotifications() {
    const session = getSession() || {
      username: "jlm",
      displayName: "JD",
      role: "teacher",
      demo: true,
    };
    teacherSession = session;
    const list = document.getElementById("hw-hub-v6-list");
    const local = global.HwFeatureFlags?.isLocalDev?.() === true;

    /* Fast first paint: local demos immediately, or empty chrome — never a long Loading… stare. */
    if (list && !activeId) {
      if (local) {
        notifications = demoNotifications()
          .filter((n) => !isRecycled(n.id))
          .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
          .slice(0, FEED_MAX);
        renderList();
        renderMain(null);
      } else {
        const cached = readCachedFeed().filter((n) => !isRecycled(n.id));
        if (cached.length) {
          notifications = cached;
          renderList();
          renderMain(null);
        } else {
          list.innerHTML = "";
          setStageMode("feed");
        }
      }
    }

    try {
      const data = await buildNotifications(session);
      notifications = data.items;
      writeCachedFeed(notifications);
      renderList();
      if (activeId) {
        const still = notifications.find((n) => n.id === activeId);
        renderMain(still || null);
        if (!still) activeId = null;
      } else {
        renderMain(null);
      }
    } catch (err) {
      if (local) {
        notifications = demoNotifications()
          .filter((n) => !isRecycled(n.id))
          .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
          .slice(0, FEED_MAX);
        renderList();
        renderMain(null);
        return;
      }
      /* Keep whatever we already painted from cache rather than blanking it. */
      if (list && !notifications.length) {
        list.innerHTML =
          '<li class="hw-hub-v6__item hw-hub-v6__item--empty">' +
          (err?.message || "Could not load notifications.") +
          "</li>";
        setStageMode("feed");
      }
    }
  }

  function ensureShellMarkup() {
    const panel = document.getElementById("hw-hub-v6-panel");
    if (!panel) return;
    if (panel.querySelector("[data-hub-v6-tab]")) return;

    /* Upgrade legacy notifications-only markup into tabbed shell */
    const existingMain = panel.querySelector(".hw-hub-v6__main");
    const existingRecycle = panel.querySelector(".hw-hub-v6__recycle");
    const existingEdit =
      document.getElementById("hw-hub-v6-edit") ||
      document.getElementById("hw-hub-v6-refresh");

    panel.replaceChildren();

    const banner = document.createElement("div");
    banner.className = "hw-hub-v6__banner";
    if (existingEdit) {
      existingEdit.id = "hw-hub-v6-edit";
      if (existingEdit.textContent.trim() === "Refresh") {
        existingEdit.textContent = "Edit";
      }
      existingEdit.setAttribute("aria-pressed", "false");
      banner.appendChild(existingEdit);
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--ghost btn--sm";
      btn.id = "hw-hub-v6-edit";
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = "Edit";
      banner.appendChild(btn);
    }
    panel.appendChild(banner);

    const tablist = document.createElement("div");
    tablist.className = "hw-hub-v6-tabs";
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", "Teacher Hub sections");
    const slider = document.createElement("span");
    slider.className = "hw-hub-v6-tabs__slider";
    slider.setAttribute("aria-hidden", "true");
    tablist.appendChild(slider);
    TAB_DEFS.forEach((t, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v6-tabs__btn" + (i === 0 ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-hub-v6-tab", t.id);
      btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
      btn.id = "hw-hub-v6-tab-" + t.id;
      btn.setAttribute("aria-controls", "hw-hub-v6-pane-" + t.id);
      btn.textContent = tabLabelFor(t.id);
      tablist.appendChild(btn);
    });
    panel.appendChild(tablist);

    function pane(id, html) {
      const el = document.createElement("div");
      el.className = "hw-hub-v6-pane";
      el.id = "hw-hub-v6-pane-" + id;
      el.setAttribute("role", "tabpanel");
      el.setAttribute("data-hub-v6-pane", id);
      el.setAttribute("aria-labelledby", "hw-hub-v6-tab-" + id);
      el.hidden = id !== "preview";
      el.innerHTML = html;
      panel.appendChild(el);
    }

    const previewHtml =
      '<div class="hw-hub-v6-bday-ticker" id="hw-hub-v6-bday-ticker" aria-label="Upcoming birthdays">' +
      '<div class="hw-hub-v6-bday-ticker__track" id="hw-hub-v6-bday-ticker-track"></div>' +
      "</div>" +
      '<div class="hw-hub-v6__main" id="hw-hub-v6-main" aria-live="polite"></div>' +
      '<p class="hw-hub-v6__recycle" id="hw-hub-v6-recycle"></p>';
    pane("preview", previewHtml);

    pane("review", '<div class="hw-hub-v6-mount" id="hw-hub-v6-glass-deck-host"></div>');

    pane(
      "hwnotes",
      '<section class="hw-hub-v6-section">' +
        '<h3 class="hw-hub-v6-section__title">Homework notes</h3>' +
        '<p class="hw-hub-v6-pane-lead">Pick a waiting submission, then Start deck — opens the same full-sheet review as Submissions → Open full sheet.</p>' +
        '<p class="hw-hub-v6-review-summary" id="hw-hub-v6-review-summary" aria-live="polite">Loading…</p>' +
        '<div class="hw-hub-v6-review-actions">' +
        '<button type="button" class="btn btn--primary" id="hw-hub-v6-review-start" disabled>Start deck</button>' +
        '<button type="button" class="btn btn--ghost btn--sm hw-btn--danger" id="hw-hub-v6-review-delete" disabled>Delete</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="hw-hub-v6-review-refresh">Refresh</button>' +
        "</div>" +
        '<ul class="hw-hub-v6-review-list" id="hw-hub-v6-review-list"></ul>' +
        "</section>"
    );

    pane(
      "maker",
      '<div class="hw-hub-v6-mount" data-v6-mount="maker"></div>' +
        '<details class="hw-hub-v6-fold" id="hw-hub-v6-fold-library">' +
        "<summary>Worksheet library</summary>" +
        '<div class="hw-hub-v6-mount" data-v6-mount="library"></div>' +
        "</details>" +
        makerDownloadFooterHtml()
    );

    pane("students", studentsPaneHtml());

    pane("websites", '<div class="hw-hub-v6-mount" data-v6-mount="websites"></div>');

    pane("gamelab", '<div class="hw-hub-v6-mount" data-v6-mount="gamelab"></div>');

    const previewPane = document.getElementById("hw-hub-v6-pane-preview");
    const mainHost = previewPane?.querySelector("#hw-hub-v6-main");
    if (mainHost && existingMain) {
      while (existingMain.firstChild) mainHost.appendChild(existingMain.firstChild);
      /* drop old birthday strip from notifications — birthdays live under Student/Email */
      const bday = mainHost.querySelector("#hw-hub-v6-birthdays");
      if (bday) bday.remove();
    } else if (mainHost) {
      mainHost.innerHTML =
        '<div class="hw-hub-v6__stage-feed" id="hw-hub-v6-stage-feed">' +
        '<div class="hw-hub-v6__feed-head"><h3>Notifications</h3>' +
        '<p class="hw-hub-v6__feed-meta" id="hw-hub-v6-feed-meta"></p></div>' +
        '<ul class="hw-hub-v6__list" id="hw-hub-v6-list"></ul></div>' +
        '<div class="hw-hub-v6__stage-detail" id="hw-hub-v6-stage-detail" hidden></div>';
    }
    if (existingRecycle && previewPane) {
      const recycleSlot = previewPane.querySelector("#hw-hub-v6-recycle");
      if (recycleSlot && existingRecycle !== recycleSlot) {
        recycleSlot.replaceWith(existingRecycle);
        existingRecycle.id = "hw-hub-v6-recycle";
      }
    }

    pane(
      "ideas",
      '<div class="hw-hub-v6-mount" data-v6-mount="ideas"></div>' +
        '<details class="hw-hub-v6-fold" id="hw-hub-v6-fold-lookup">' +
        "<summary>Lookup Lexicon</summary>" +
        '<div class="hw-hub-v6-mount" data-v6-mount="lookup-lexicon"></div>' +
        "</details>"
    );

    pane("hubpreview", '<div class="hw-hub-v6-mount" data-v6-mount="hubv2"></div>');
  }

  function bindTabs() {
    if (tabsBound) return;
    const panel = document.getElementById("hw-hub-v6-panel");
    if (!panel) return;
    tabsBound = true;
    panel.addEventListener("click", (ev) => {
      if (ev.target.closest?.("#hw-hub-v6-maker-download")) {
        ev.preventDefault();
        downloadMakerWorksheet();
        return;
      }
      const btn = ev.target.closest?.("[data-hub-v6-tab]");
      if (!btn || !panel.contains(btn)) return;
      if (tabEditMode) return;
      activateV6Tab(btn.getAttribute("data-hub-v6-tab") || "maker");
    });
  }

  function ensureMakerFooter() {
    const pane = document.getElementById("hw-hub-v6-pane-maker");
    if (!pane) return;
    pane.querySelectorAll(".hw-hub-v6-library-fold").forEach((el) => el.remove());
    if (!document.getElementById("hw-hub-v6-maker-download")) {
      pane.insertAdjacentHTML("beforeend", makerDownloadFooterHtml());
    }
  }

  function ensureHomeTickerMarkup() {
    const pane = document.getElementById("hw-hub-v6-pane-preview");
    if (!pane) return;
    pane.querySelectorAll(".hw-hub-v6-pane-lead").forEach((el) => {
      if (el.textContent && /Notifications for the new teacher hub|Notifications feed for the new teacher hub/i.test(el.textContent)) {
        el.remove();
      }
    });
    if (!document.getElementById("hw-hub-v6-bday-ticker")) {
      pane.insertAdjacentHTML(
        "afterbegin",
        '<div class="hw-hub-v6-bday-ticker" id="hw-hub-v6-bday-ticker" aria-label="Upcoming birthdays">' +
          '<div class="hw-hub-v6-bday-ticker__track" id="hw-hub-v6-bday-ticker-track"></div>' +
          "</div>"
      );
    }
    const homeTab = document.getElementById("hw-hub-v6-tab-preview");
    if (homeTab && homeTab.textContent.trim() === "Hub Preview") {
      homeTab.textContent = "Home";
    }
    /* Prefer Home first in the tab strip (after the sliding pill). */
    const tablist = pane.closest(".hw-hub-v6")?.querySelector(".hw-hub-v6-tabs");
    if (tablist && homeTab && !hasSavedTabOrder()) {
      const slider = tablist.querySelector(".hw-hub-v6-tabs__slider");
      const firstBtn = tablist.querySelector(".hw-hub-v6-tabs__btn");
      if (firstBtn !== homeTab) {
        tablist.insertBefore(homeTab, slider ? slider.nextSibling : tablist.firstChild);
      }
    }
  }

  function mountUi() {
    document.body.classList.add("hw-hub-v6-enabled");
    const versionBtn = document.getElementById("hw-hub-version-tab-v6");
    if (versionBtn) versionBtn.hidden = true;
    ensureShellMarkup();
    ensureMakerFooter();
    ensureHomeTickerMarkup();
    ensureStudentsPaneLayout();
    ensureDeckTabs();
    ensureHubPreviewTab();
    ensureEditButton();
    applySavedTabOrder();
    applySavedTabLabels();
    bindTabs();
    bindTabReorder();
    bindHubV6TabSliderLayout();
    syncHubV6TabSlider();
  }

  function ensureTabAndPane(tabId, label, paneHtml, insertAfterTabId) {
    const panel = document.getElementById("hw-hub-v6-panel");
    if (!panel) return;
    const tablist = panel.querySelector(".hw-hub-v6-tabs");
    if (tablist && !document.getElementById("hw-hub-v6-tab-" + tabId)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v6-tabs__btn";
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-hub-v6-tab", tabId);
      btn.setAttribute("aria-selected", "false");
      btn.id = "hw-hub-v6-tab-" + tabId;
      btn.setAttribute("aria-controls", "hw-hub-v6-pane-" + tabId);
      btn.textContent = tabLabelFor(tabId) || label;
      const after = insertAfterTabId
        ? document.getElementById("hw-hub-v6-tab-" + insertAfterTabId)
        : null;
      if (after?.nextSibling) tablist.insertBefore(btn, after.nextSibling);
      else if (after) tablist.appendChild(btn);
      else tablist.appendChild(btn);
    }
    if (!document.getElementById("hw-hub-v6-pane-" + tabId)) {
      const el = document.createElement("div");
      el.className = "hw-hub-v6-pane";
      el.id = "hw-hub-v6-pane-" + tabId;
      el.setAttribute("role", "tabpanel");
      el.setAttribute("data-hub-v6-pane", tabId);
      el.setAttribute("aria-labelledby", "hw-hub-v6-tab-" + tabId);
      el.hidden = true;
      el.innerHTML = paneHtml;
      const afterPane = insertAfterTabId
        ? document.getElementById("hw-hub-v6-pane-" + insertAfterTabId)
        : null;
      if (afterPane?.nextSibling) panel.insertBefore(el, afterPane.nextSibling);
      else if (afterPane) panel.appendChild(el);
      else panel.appendChild(el);
    }
  }

  function ensureDeckTabs() {
    /* Older shells were built before Review Deck / HW Notes existed — retrofit them. */
    ensureTabAndPane(
      "review",
      "Review Deck",
      '<div class="hw-hub-v6-mount" id="hw-hub-v6-glass-deck-host"></div>',
      "preview"
    );
    ensureTabAndPane(
      "hwnotes",
      "HW Notes",
      '<section class="hw-hub-v6-section">' +
        '<h3 class="hw-hub-v6-section__title">Homework notes</h3>' +
        '<p class="hw-hub-v6-pane-lead">Pick a waiting submission, then Start deck — opens the same full-sheet review as Submissions → Open full sheet.</p>' +
        '<p class="hw-hub-v6-review-summary" id="hw-hub-v6-review-summary" aria-live="polite">Loading…</p>' +
        '<div class="hw-hub-v6-review-actions">' +
        '<button type="button" class="btn btn--primary" id="hw-hub-v6-review-start" disabled>Start deck</button>' +
        '<button type="button" class="btn btn--ghost btn--sm hw-btn--danger" id="hw-hub-v6-review-delete" disabled>Delete</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="hw-hub-v6-review-refresh">Refresh</button>' +
        "</div>" +
        '<ul class="hw-hub-v6-review-list" id="hw-hub-v6-review-list"></ul>' +
        "</section>",
      "review"
    );

    /* If Review Deck still has the old homework-notes markup, swap it to the glass host. */
    const reviewPane = document.getElementById("hw-hub-v6-pane-review");
    if (reviewPane && !document.getElementById("hw-hub-v6-glass-deck-host")) {
      reviewPane.innerHTML =
        '<div class="hw-hub-v6-mount" id="hw-hub-v6-glass-deck-host"></div>';
    }
    const reviewTab = document.getElementById("hw-hub-v6-tab-review");
    if (reviewTab && /homework notes/i.test(reviewTab.textContent || "")) {
      reviewTab.textContent = "Review Deck";
    }
  }

  function ensureHubPreviewTab() {
    const panel = document.getElementById("hw-hub-v6-panel");
    if (!panel) return;
    ensureTabAndPane(
      "hubpreview",
      "Hub Preview",
      '<div class="hw-hub-v6-mount" data-v6-mount="hubv2"></div>'
    );
    const makerPane = document.getElementById("hw-hub-v6-pane-maker");
    if (makerPane && !document.getElementById("hw-hub-v6-fold-library")) {
      const footer = makerPane.querySelector(".hw-hub-v6-maker-footer");
      const fold =
        '<details class="hw-hub-v6-fold" id="hw-hub-v6-fold-library">' +
        "<summary>Worksheet library</summary>" +
        '<div class="hw-hub-v6-mount" data-v6-mount="library"></div>' +
        "</details>";
      if (footer) footer.insertAdjacentHTML("beforebegin", fold);
      else makerPane.insertAdjacentHTML("beforeend", fold);
    }
    const ideasPane = document.getElementById("hw-hub-v6-pane-ideas");
    if (ideasPane && !document.getElementById("hw-hub-v6-fold-lookup")) {
      ideasPane.insertAdjacentHTML(
        "beforeend",
        '<details class="hw-hub-v6-fold" id="hw-hub-v6-fold-lookup">' +
          "<summary>Lookup Lexicon</summary>" +
          '<div class="hw-hub-v6-mount" data-v6-mount="lookup-lexicon"></div>' +
          "</details>"
      );
    }
  }

  function init(options) {
    if (!enabled()) {
      document.getElementById("hw-teacher-tab-hubv6")?.setAttribute("hidden", "");
      return;
    }
    teacherSession = options?.session || getSession();
    mountUi();
    if (bound) {
      if (
        isV6PanelVisible() ||
        document.body.classList.contains("hw-hub-v6-page") ||
        document.body.classList.contains("hw-hub-v6-primary")
      ) {
        activateV6Tab(readSavedV6Tab());
      }
      return;
    }
    bound = true;
    bindTabReorder();
    document.addEventListener("hw-teacher-tab-change", (ev) => {
      /* Primary shell owns mounts; classic tabs only under Hub Preview → Hub v1. */
      if (document.body.classList.contains("hw-hub-v6-primary")) return;
      const tab = ev.detail?.tab;
      if (tab === "hubv2" || tab === "hubv6") {
        try {
          if (localStorage.getItem("jlm-hw-teacher-hub-version") === "6") {
            activateV6Tab(readSavedV6Tab());
          }
        } catch {
          /* ignore */
        }
      } else {
        releaseMounts();
      }
    });
  }

  function readSavedV6Tab() {
    let saved = "preview";
    try {
      /* One-time: Home (notifications) is the default landing tab */
      if (!localStorage.getItem(V6_TAB_KEY + "-home1")) {
        localStorage.setItem(V6_TAB_KEY, "preview");
        localStorage.setItem(V6_TAB_KEY + "-home1", "1");
      }
      saved = localStorage.getItem(V6_TAB_KEY) || "preview";
      if (!TAB_DEFS.some((t) => t.id === saved)) saved = "preview";
    } catch {
      /* ignore */
    }
    return saved;
  }

  function onTabActivated() {
    if (!enabled()) return;
    mountUi();
    activateV6Tab(readSavedV6Tab());
  }

  async function refresh() {
    if (activeV6Tab === "preview") await refreshNotifications();
    else afterMountHooks(activeV6Tab);
  }

  global.HwHubV6 = {
    init,
    refresh,
    onTabActivated,
    enabled,
    releaseMounts,
    activateTab: activateV6Tab,
  };

  function selfBoot() {
    if (!enabled()) return;
    const hub = document.getElementById("hw-teacher-hub");
    const page = document.body.classList.contains("hw-hub-v6-page");
    const primary = document.body.classList.contains("hw-hub-v6-primary");
    if ((hub && !hub.hidden) || page || primary) {
      init();
      try {
        if (
          page ||
          primary ||
          document.body.classList.contains("hw-hub-v6-primary")
        ) {
          onTabActivated();
        }
      } catch {
        if (page || primary) onTabActivated();
      }
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", selfBoot);
  } else {
    selfBoot();
  }
})(window);
