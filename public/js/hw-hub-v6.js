/**
 * Teacher Hub v6 — primary teacher chrome when HwFeatureFlags.hubV6().
 * Mounts live teacher panels into v6 panes. Classic layout is Hub Preview → Hub v1.
 */
(function (global) {
  const RECYCLE_KEY = "hw-hubv6-recycle";
  const RECYCLE_MS = 14 * 24 * 60 * 60 * 1000;
  const FEED_MAX = 5;
  const V6_TAB_KEY = "jlm-hw-hubv6-tab";

  /** @type {{ id: string, homeParent: Node, homeNext: ChildNode | null }[]} */
  const mountHomes = [];
  let bound = false;
  let tabsBound = false;
  let notifications = [];
  let activeId = null;
  let teacherSession = null;
  let activeV6Tab = "preview";

  const TAB_DEFS = [
    { id: "preview", label: "Home" },
    { id: "maker", label: "Worksheet Maker" },
    { id: "students", label: "Student/Email List" },
    { id: "websites", label: "Websites" },
    { id: "gamelab", label: "Game Lab" },
    { id: "ideas", label: "Ideas & Memos" },
    { id: "hubpreview", label: "Hub Preview" },
  ];

  const TAB_MOUNTS = {
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

    const [subResult, promoResult] = await Promise.all([
      fetchJson("/api/homework-submissions?teacherUsername=" + teacher + "&limit=40").catch(() => null),
      fetchJson("/api/promo-signups").catch(() => null),
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
      '<a class="btn btn--ghost btn--sm" href="/preview/jem-appraisals/" target="_blank" rel="noopener noreferrer">JEM Appraisals</a>';
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

  function syncTabButtons(tabId) {
    document.querySelectorAll("[data-hub-v6-tab]").forEach((btn) => {
      const on = btn.getAttribute("data-hub-v6-tab") === tabId;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-hub-v6-pane]").forEach((pane) => {
      pane.hidden = pane.getAttribute("data-hub-v6-pane") !== tabId;
    });
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

    const actions = document.createElement("div");
    actions.className = "hw-hub-v6__main-actions";

    if (note.submission || note.demo || note.promo || note.birthday) {
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
    if (note.submission?.type === "online" && global.HwTeacherReview?.openOnlineSubmission) {
      await global.HwTeacherReview.openOnlineSubmission(note.submission);
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
      document.getElementById("hw-hub-v6-email-anchor")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      return;
    }
    if (note.birthday) {
      activateV6Tab("students");
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
        list.innerHTML = "";
        setStageMode("feed");
      }
    }

    try {
      const data = await buildNotifications(session);
      notifications = data.items;
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
      if (list) {
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
    const existingRefresh = document.getElementById("hw-hub-v6-refresh");

    panel.replaceChildren();

    const banner = document.createElement("div");
    banner.className = "hw-hub-v6__banner";
    banner.innerHTML =
      "<div><h2>Teacher Hub</h2>" +
      "<p>Home notifications, maker, students, and tools — classic layout is Hub Preview → Hub v1.</p></div>";
    if (existingRefresh) {
      existingRefresh.id = "hw-hub-v6-refresh";
      banner.appendChild(existingRefresh);
    } else {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--ghost btn--sm";
      btn.id = "hw-hub-v6-refresh";
      btn.textContent = "Refresh";
      banner.appendChild(btn);
    }
    panel.appendChild(banner);

    const tablist = document.createElement("div");
    tablist.className = "hw-hub-v6-tabs";
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", "Teacher Hub sections");
    TAB_DEFS.forEach((t, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v6-tabs__btn" + (i === 0 ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-hub-v6-tab", t.id);
      btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
      btn.id = "hw-hub-v6-tab-" + t.id;
      btn.setAttribute("aria-controls", "hw-hub-v6-pane-" + t.id);
      btn.textContent = t.label;
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

    pane(
      "maker",
      '<div class="hw-hub-v6-mount" data-v6-mount="maker"></div>' +
        '<details class="hw-hub-v6-fold" id="hw-hub-v6-fold-library">' +
        "<summary>Worksheet library</summary>" +
        '<div class="hw-hub-v6-mount" data-v6-mount="library"></div>' +
        "</details>" +
        makerDownloadFooterHtml()
    );

    pane(
      "students",
      '<div class="hw-hub-v6-mount" data-v6-mount="account"></div>' +
        '<section class="hw-hub-v6-section">' +
        '<h3 class="hw-hub-v6-section__title">Birthdays</h3>' +
        '<div class="hw-hub-v6-mount" data-v6-mount="birthdays"></div>' +
        "</section>" +
        '<section class="hw-hub-v6-section" id="hw-hub-v6-email-anchor">' +
        '<h3 class="hw-hub-v6-section__title">Email list</h3>' +
        '<p class="hw-hub-v6-pane-lead">Contacts and promo signups — separate from student IDs above.</p>' +
        '<div class="hw-hub-v6-mount" data-v6-mount="promo"></div>' +
        "</section>" +
        '<details class="hw-hub-v6-fold" id="hw-hub-v6-fold-submissions">' +
        "<summary>Submissions</summary>" +
        '<div class="hw-hub-v6-mount" data-v6-mount="submissions"></div>' +
        "</details>" +
        '<details class="hw-hub-v6-fold" id="hw-hub-v6-fold-mistakes">' +
        "<summary>Mistakes</summary>" +
        '<div class="hw-hub-v6-mount" data-v6-mount="mistakes"></div>' +
        "</details>"
    );

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
    /* Prefer Home first in the tab strip */
    const tablist = pane.closest(".hw-hub-v6")?.querySelector(".hw-hub-v6-tabs");
    if (tablist && homeTab && tablist.firstElementChild !== homeTab) {
      tablist.insertBefore(homeTab, tablist.firstElementChild);
    }
  }

  function mountUi() {
    document.body.classList.add("hw-hub-v6-enabled");
    const versionBtn = document.getElementById("hw-hub-version-tab-v6");
    if (versionBtn) versionBtn.hidden = true;
    ensureShellMarkup();
    ensureMakerFooter();
    ensureHomeTickerMarkup();
    ensureHubPreviewTab();
    bindTabs();
  }

  function ensureHubPreviewTab() {
    const panel = document.getElementById("hw-hub-v6-panel");
    if (!panel) return;
    const tablist = panel.querySelector(".hw-hub-v6-tabs");
    if (tablist && !document.getElementById("hw-hub-v6-tab-hubpreview")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v6-tabs__btn";
      btn.setAttribute("role", "tab");
      btn.setAttribute("data-hub-v6-tab", "hubpreview");
      btn.setAttribute("aria-selected", "false");
      btn.id = "hw-hub-v6-tab-hubpreview";
      btn.setAttribute("aria-controls", "hw-hub-v6-pane-hubpreview");
      btn.textContent = "Hub Preview";
      tablist.appendChild(btn);
    }
    if (!document.getElementById("hw-hub-v6-pane-hubpreview")) {
      const el = document.createElement("div");
      el.className = "hw-hub-v6-pane";
      el.id = "hw-hub-v6-pane-hubpreview";
      el.setAttribute("role", "tabpanel");
      el.setAttribute("data-hub-v6-pane", "hubpreview");
      el.setAttribute("aria-labelledby", "hw-hub-v6-tab-hubpreview");
      el.hidden = true;
      el.innerHTML = '<div class="hw-hub-v6-mount" data-v6-mount="hubv2"></div>';
      panel.appendChild(el);
    }
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
    document.getElementById("hw-hub-v6-refresh")?.addEventListener("click", () => {
      if (activeV6Tab === "preview") {
        void refreshNotifications();
        void refreshBirthdayTicker();
      } else afterMountHooks(activeV6Tab);
    });
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
