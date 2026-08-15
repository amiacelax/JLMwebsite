/**
 * Account Settings — Profile / Subscription / Notifications.
 * On the hub this fills the worksheet space; account.html redirects logged-in users there.
 */
(function (global) {
  const PROMO_SUBSCRIBED_KEY = "jlm-promo-subscribed";
  const PLATFORM_PATH = "/homework/platform.html";
  const ACCOUNT_TABS = ["profile", "subscription", "notifications"];
  let bound = false;
  let teacherAppBound = false;
  let openFromHashLock = false;

  function setStatus(el, msg, isError) {
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.classList.toggle("hw-login-inlay__error", !!isError);
    if (msg && !isError) el.style.color = "var(--color-text-muted)";
    else el.style.color = "";
  }

  function isStandalonePage() {
    return /\/account\.html$/i.test(global.location.pathname || "");
  }

  function parseHash(raw) {
    const hash = String(raw || global.location.hash || "")
      .replace(/^#/, "")
      .trim()
      .toLowerCase();
    if (!hash) return null;
    if (hash === "account" || hash === "account-profile" || hash === "profile") {
      return { tab: "profile" };
    }
    if (hash === "account-subscription" || hash === "subscription") {
      return { tab: "subscription" };
    }
    if (hash === "account-notifications" || hash === "notifications") {
      return { tab: "notifications" };
    }
    return null;
  }

  function isAccountHash(raw) {
    return !!parseHash(raw);
  }

  function hashForTab(tab) {
    const id = ACCOUNT_TABS.includes(tab) ? tab : "profile";
    if (id === "profile") return "#account";
    return "#account-" + id;
  }

  function setHash(tab, mode) {
    const next = hashForTab(tab);
    if (global.location.hash === next) return;
    openFromHashLock = true;
    try {
      const url = global.location.pathname + global.location.search + next;
      if (mode === "replace") {
        global.history.replaceState(null, "", url);
      } else {
        global.location.hash = next.slice(1);
      }
    } finally {
      window.setTimeout(() => {
        openFromHashLock = false;
      }, 0);
    }
  }

  function clearAccountHash() {
    if (!isAccountHash()) return;
    openFromHashLock = true;
    try {
      global.history.replaceState(
        null,
        "",
        global.location.pathname + global.location.search
      );
    } finally {
      window.setTimeout(() => {
        openFromHashLock = false;
      }, 0);
    }
  }

  function session() {
    return global.HwAuth?.getSession?.() || null;
  }

  function loginIdValue(s) {
    const email = String(s?.email || "").trim();
    if (email && email.includes("@")) return email;
    return String(s?.username || "").trim();
  }

  function stripHubSuffix(name) {
    return String(name || "")
      .replace(/\s*'s\s+Hub\s*$/i, "")
      .trim();
  }

  function hasPaidPlan() {
    const s = session();
    if (!s || s.role === "teacher") return false;
    return Boolean(global.HwAuth?.hasActiveSubscription?.(s));
  }

  function setProfileEditing(on) {
    const panel = document.getElementById("hw-account-panel");
    const saveBar = document.getElementById("hw-account-save-bar");
    const editBtn = document.getElementById("hw-account-edit");
    if (!panel) return;
    panel.classList.toggle("is-editing", !!on);
    panel.querySelectorAll("[data-hw-account-edit]").forEach((el) => {
      if (el instanceof HTMLInputElement) el.readOnly = !on;
    });
    if (saveBar) {
      saveBar.setAttribute("aria-hidden", on ? "false" : "true");
    }
    if (editBtn) {
      editBtn.setAttribute("aria-pressed", on ? "true" : "false");
      editBtn.setAttribute("aria-label", on ? "Cancel editing" : "Edit profile");
      editBtn.title = on ? "Cancel" : "Edit";
    }
    if (on) {
      window.setTimeout(() => {
        saveBar?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 80);
    }
  }

  function fillSession(root) {
    const scope = root || document;
    const s = session();
    const guest = scope.querySelector
      ? scope.querySelector("#hw-account-guest")
      : document.getElementById("hw-account-guest");
    const panel = scope.querySelector
      ? scope.querySelector("#hw-account-panel")
      : document.getElementById("hw-account-panel");
    if (!s) {
      if (guest) guest.hidden = false;
      if (panel) panel.hidden = true;
      return;
    }
    if (guest) guest.hidden = true;
    if (panel) panel.hidden = false;

    const loginEl = document.getElementById("hw-account-login-id");
    const emailEl = document.getElementById("hw-account-email-input");
    const nameInput = document.getElementById("hw-account-display-name");
    if (loginEl) loginEl.value = loginIdValue(s);
    if (emailEl) emailEl.value = String(s.email || "").trim();
    if (nameInput) {
      nameInput.value = stripHubSuffix(s.displayName || s.username || "");
    }
    setProfileEditing(false);
    const oldPw = document.getElementById("hw-account-old-password");
    const newPw = document.getElementById("hw-account-new-password");
    if (oldPw) oldPw.value = "";
    if (newPw) newPw.value = "";
  }

  function currentPlanCopy() {
    const s = session();
    if (!s) return "Log in to see your plan.";
    if (s.role === "teacher") {
      return "Teacher account — no Homework Hub plan.";
    }
    const tier = s.tier || "pending";
    const label = s.accountLabel || "homework_only";
    if (label === "current_student" && tier === "pending") {
      return "Lessons student — no weekly homework plan yet.";
    }
    if (tier === "pending" || !global.HwAuth?.hasActiveSubscription?.(s)) {
      return "No plan yet — pick a Homework Hub plan below.";
    }
    const name = String(global.HwAuth?.TIERS?.[tier]?.name || "Your plan").replace(
      /\s+Tier$/i,
      ""
    );
    return "You’re on " + name + ".";
  }

  function promoSubscribed() {
    try {
      return localStorage.getItem(PROMO_SUBSCRIBED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function markPromoSubscribed() {
    try {
      localStorage.setItem(PROMO_SUBSCRIBED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function profileMarkup() {
    const pencil =
      '<svg class="hw-account-edit__icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    return (
      '<article class="hw-hub-worksheet-card hw-account-card" id="hw-account-panel">' +
      '<button type="button" class="hw-account-edit" id="hw-account-edit" aria-pressed="false" aria-label="Edit profile" title="Edit">' +
      pencil +
      "</button>" +
      '<form id="hw-account-profile-form" class="hw-account-form">' +
      '<h2 class="hw-account-card__sub" style="margin-top:0">General Info</h2>' +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-login-id">Login ID</label>' +
      '<input type="text" id="hw-account-login-id" name="loginId" readonly autocomplete="username" placeholder="you@email.com">' +
      "</div>" +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-display-name">Display Name <span class="hw-login-inlay__optional">(first name recommended)</span></label>' +
      '<div class="hw-account-name-row">' +
      '<input type="text" id="hw-account-display-name" name="displayName" maxlength="40" data-hw-account-edit readonly autocomplete="nickname" placeholder="Alex">' +
      '<span class="hw-account-name-hub" aria-hidden="true">\'s Hub</span>' +
      "</div>" +
      "</div>" +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-email-input">Email</label>' +
      '<input type="email" id="hw-account-email-input" name="email" data-hw-account-edit readonly autocomplete="email" placeholder="you@email.com">' +
      "</div>" +
      '<h2 class="hw-account-card__sub">Password</h2>' +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-old-password">Current</label>' +
      '<input type="password" id="hw-account-old-password" data-hw-account-edit readonly autocomplete="current-password">' +
      "</div>" +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-new-password">New</label>' +
      '<input type="password" id="hw-account-new-password" data-hw-account-edit readonly minlength="6" autocomplete="new-password">' +
      "</div>" +
      '<p class="hw-login-inlay__error" id="hw-account-save-status" hidden role="status"></p>' +
      '<div class="hw-account-save-bar" id="hw-account-save-bar" aria-hidden="true">' +
      '<button type="submit" class="hw-login-inlay__submit" id="hw-account-save">Save new changes?</button>' +
      "</div>" +
      "</form>" +
      '<div class="hw-account-card__actions">' +
      '<button type="button" class="btn hw-account-delete-btn" id="hw-account-delete">Delete account</button>' +
      "</div>" +
      '<p class="hw-login-inlay__note hw-account-card__legal">' +
      '<a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>' +
      '<div class="hw-account-delete-dialog" id="hw-account-delete-dialog" hidden>' +
      '<div class="hw-account-delete-dialog__backdrop" data-hw-account-delete-close></div>' +
      '<div class="hw-account-delete-dialog__box" role="dialog" aria-modal="true" aria-labelledby="hw-account-delete-title">' +
      '<h3 class="hw-account-delete-dialog__title" id="hw-account-delete-title">Delete account?</h3>' +
      '<p class="hw-account-delete-dialog__body">This will delete everything on your account.</p>' +
      '<p class="hw-account-delete-dialog__warn">WARNING: this will NOT cancel your subscription.</p>' +
      '<p class="hw-account-delete-dialog__body" id="hw-account-delete-paypal-note" hidden>' +
      'Cancel your PayPal plan first — we can’t stop billing from here. ' +
      '<a href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noopener noreferrer">Open PayPal</a>, then check the box below.</p>' +
      '<label class="hw-account-delete-dialog__check" id="hw-account-delete-paypal-check-wrap" hidden>' +
      '<input type="checkbox" id="hw-account-delete-paypal-check"> I cancelled my PayPal plan' +
      "</label>" +
      '<div class="hw-login-inlay__field">' +
      '<label for="hw-account-delete-password">Password</label>' +
      '<input type="password" id="hw-account-delete-password" autocomplete="current-password">' +
      "</div>" +
      '<p class="hw-login-inlay__error" id="hw-account-delete-status" hidden role="status"></p>' +
      '<div class="hw-account-delete-dialog__actions">' +
      '<button type="button" class="btn btn--ghost" data-hw-account-delete-close>Cancel</button>' +
      '<button type="button" class="btn hw-account-delete-btn" id="hw-account-delete-confirm">Delete account</button>' +
      "</div>" +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function subscriptionMarkup() {
    return (
      '<article class="hw-hub-worksheet-card hw-account-card" id="hw-account-subscription-card">' +
      '<h2 class="hw-account-card__title">Subscription</h2>' +
      '<p class="hw-account-card__lead" id="hw-account-plan-copy"></p>' +
      '<p class="hw-hub-v5-sellup-caption" id="hw-v5-account-sellup-caption" hidden></p>' +
      '<div class="hw-hub-v5-sellup-frame" id="hw-v5-account-sellup-frame">' +
      '<div class="hw-hub-v5-sellup" id="hw-v5-account-sellup" aria-label="Homework Hub plans"></div>' +
      "</div>" +
      '<p class="hw-login-inlay__note" id="hw-account-plan-empty" hidden>No plan changes here for this account.</p>' +
      "</article>"
    );
  }

  function notificationsMarkup() {
    const joined = promoSubscribed();
    return (
      '<article class="hw-hub-worksheet-card hw-account-card" id="hw-account-notifications-card">' +
      '<h2 class="hw-account-card__title">Notifications</h2>' +
      '<p class="hw-account-card__lead">Homework and feedback alerts go to JD on Discord for now. Email or text alerts for you may come later.</p>' +
      '<form id="hw-account-promo-form" class="hw-login-inlay__form hw-account-form">' +
      '<h3 class="hw-account-card__sub">Email list</h3>' +
      '<p class="hw-login-inlay__note">Deals and new features — a few emails a year, only when there’s something worth sharing.</p>' +
      (joined
        ? '<p class="hw-login-inlay__note" id="hw-account-promo-status" role="status">You’re on the email list.</p>'
        : '<button type="submit" class="hw-login-inlay__submit" id="hw-account-promo-submit">Join the email list</button>' +
          '<p class="hw-login-inlay__error" id="hw-account-promo-status" hidden role="status"></p>') +
      "</form>" +
      "</article>"
    );
  }

  function fillPlanCopy() {
    const el = document.getElementById("hw-account-plan-copy");
    if (el) el.textContent = currentPlanCopy();
  }

  function syncNav(inAccount) {
    document.querySelectorAll("[data-hw-account-nav]").forEach((link) => {
      if (inAccount) {
        link.textContent = "Your Hub";
        link.setAttribute("href", "#");
        link.setAttribute("aria-current", "page");
      } else {
        link.textContent = "Account Settings";
        link.setAttribute("href", "#account");
        link.removeAttribute("aria-current");
      }
    });
  }

  function isStudentHub() {
    return Boolean(
      global.HwHubV5Live && document.body.classList.contains("hw-role-student")
    );
  }

  function isTeacherHub() {
    return document.body.classList.contains("hw-role-teacher");
  }

  function paintTeacherTabs(app, activeTab) {
    const tabs = app.querySelector("#hw-account-teacher-tabs");
    if (!tabs) return;
    const slider = tabs.querySelector(".hw-hub-v5-tabs__slider") || document.createElement("span");
    slider.className = "hw-hub-v5-tabs__slider";
    slider.setAttribute("aria-hidden", "true");
    const labels = {
      profile: "Profile",
      subscription: "Subscription",
      notifications: "Notifications",
    };
    const active = ACCOUNT_TABS.includes(activeTab) ? activeTab : "profile";
    tabs.replaceChildren(slider);
    ACCOUNT_TABS.forEach((id) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-hub-v5-tabs__btn" + (id === active ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.id = "hw-account-teacher-tab-" + id;
      btn.setAttribute("data-hw-account-tab", id);
      btn.setAttribute("aria-selected", id === active ? "true" : "false");
      btn.setAttribute("aria-controls", "hw-account-teacher-panel-" + id);
      btn.textContent = labels[id];
      tabs.appendChild(btn);
    });
    tabs.classList.remove("is-slider-ready");
    requestAnimationFrame(() => {
      const activeBtn = tabs.querySelector(".hw-hub-v5-tabs__btn.is-active");
      if (!activeBtn) return;
      const listRect = tabs.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      slider.style.width = Math.max(0, btnRect.width) + "px";
      slider.style.height = Math.max(0, btnRect.height) + "px";
      slider.style.transform =
        "translate(" +
        (btnRect.left - listRect.left) +
        "px, " +
        (btnRect.top - listRect.top) +
        "px)";
      tabs.classList.add("is-slider-ready");
    });
  }

  function showTeacherPanel(app, tab) {
    const active = ACCOUNT_TABS.includes(tab) ? tab : "profile";
    app.querySelectorAll("[data-hw-account-panel]").forEach((panel) => {
      const on = panel.getAttribute("data-hw-account-panel") === active;
      panel.classList.toggle("is-active", on);
      panel.hidden = !on;
    });
    paintTeacherTabs(app, active);
    fillSession(app);
    fillPlanCopy();
    const empty = document.getElementById("hw-account-plan-empty");
    const frame = document.getElementById("hw-v5-account-sellup-frame");
    if (empty) empty.hidden = false;
    if (frame) frame.hidden = true;
  }

  function ensureTeacherAccountApp() {
    let app = document.getElementById("hw-account-teacher-app");
    if (app) return app;
    const teacherHub = document.getElementById("hw-teacher-hub");
    if (!teacherHub || !teacherHub.parentNode) return null;
    app = document.createElement("div");
    app.id = "hw-account-teacher-app";
    app.className = "hw-hub-v5-app hw-account-teacher-app";
    app.hidden = true;
    app.innerHTML =
      '<div class="hw-hub-v5-tabs-wrap">' +
      '<nav class="hw-hub-v5-tabs" id="hw-account-teacher-tabs" role="tablist" aria-label="Account Settings">' +
      '<span class="hw-hub-v5-tabs__slider" aria-hidden="true"></span>' +
      "</nav>" +
      "</div>" +
      '<div class="hw-hub-v5-panels hw-account-teacher-panels">' +
      '<div class="hw-hub-v5-panel is-active" id="hw-account-teacher-panel-profile" data-hw-account-panel="profile" role="tabpanel" aria-labelledby="hw-account-teacher-tab-profile">' +
      profileMarkup() +
      "</div>" +
      '<div class="hw-hub-v5-panel" id="hw-account-teacher-panel-subscription" data-hw-account-panel="subscription" role="tabpanel" aria-labelledby="hw-account-teacher-tab-subscription" hidden>' +
      subscriptionMarkup() +
      "</div>" +
      '<div class="hw-hub-v5-panel" id="hw-account-teacher-panel-notifications" data-hw-account-panel="notifications" role="tabpanel" aria-labelledby="hw-account-teacher-tab-notifications" hidden>' +
      notificationsMarkup() +
      "</div>" +
      "</div>";
    teacherHub.parentNode.insertBefore(app, teacherHub.nextSibling);
    if (!teacherAppBound) {
      teacherAppBound = true;
      app.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-hw-account-tab]");
        if (!btn || !app.contains(btn)) return;
        open(btn.getAttribute("data-hw-account-tab") || "profile", { replaceHash: true });
      });
    }
    return app;
  }

  function showTeacherOverlay(tab) {
    const app = ensureTeacherAccountApp();
    const teacherHub = document.getElementById("hw-teacher-hub");
    if (!app) return;
    if (teacherHub) teacherHub.hidden = true;
    app.hidden = false;
    showTeacherPanel(app, tab);
  }

  function hideTeacherOverlay() {
    const app = document.getElementById("hw-account-teacher-app");
    const teacherHub = document.getElementById("hw-teacher-hub");
    if (app) app.hidden = true;
    if (teacherHub && isTeacherHub()) teacherHub.hidden = false;
  }

  let studentOpenRetries = 0;

  function open(tab, options) {
    if (isStandalonePage()) return;
    const id = ACCOUNT_TABS.includes(tab) ? tab : "profile";
    const already = isOpen();
    document.body.classList.add("hw-account-mode");
    syncNav(true);
    if (!options?.fromHash) {
      setHash(id, already || options?.replaceHash ? "replace" : "push");
    }

    if (document.body.classList.contains("hw-role-student") && !global.HwHubV5Live) {
      if (studentOpenRetries < 40) {
        studentOpenRetries += 1;
        window.setTimeout(() => open(id, { fromHash: true }), 50);
      }
      return;
    }
    studentOpenRetries = 0;

    if (isStudentHub()) {
      hideTeacherOverlay();
      global.HwHubV5Live.enterAccountMode(id);
      fillSession();
      fillPlanCopy();
      return;
    }
    if (isTeacherHub()) {
      showTeacherOverlay(id);
    }
  }

  function close(options) {
    document.body.classList.remove("hw-account-mode");
    syncNav(false);
    if (!options?.fromHash) clearAccountHash();
    if (global.HwHubV5Live?.exitAccountMode) global.HwHubV5Live.exitAccountMode();
    hideTeacherOverlay();
  }

  function isOpen() {
    return document.body.classList.contains("hw-account-mode");
  }

  function maybeRedirectStandalone() {
    if (!isStandalonePage()) return;
    if (!session()) return;
    const parsed = parseHash();
    const dest = PLATFORM_PATH + hashForTab(parsed?.tab || "profile");
    global.location.replace(dest);
  }

  function onHubReady() {
    const parsed = parseHash();
    if (parsed) open(parsed.tab, { fromHash: true });
  }

  function openDeleteDialog() {
    const dialog = document.getElementById("hw-account-delete-dialog");
    const note = document.getElementById("hw-account-delete-paypal-note");
    const checkWrap = document.getElementById("hw-account-delete-paypal-check-wrap");
    const check = document.getElementById("hw-account-delete-paypal-check");
    const paid = hasPaidPlan();
    if (note) note.hidden = !paid;
    if (checkWrap) checkWrap.hidden = !paid;
    if (check) check.checked = false;
    const pw = document.getElementById("hw-account-delete-password");
    if (pw) pw.value = "";
    setStatus(document.getElementById("hw-account-delete-status"), "", false);
    if (dialog) dialog.hidden = false;
  }

  function closeDeleteDialog() {
    const dialog = document.getElementById("hw-account-delete-dialog");
    if (dialog) dialog.hidden = true;
  }

  async function saveProfileChanges() {
    const status = document.getElementById("hw-account-save-status");
    const s = session();
    if (!s?.username) return;
    const displayName = stripHubSuffix(
      document.getElementById("hw-account-display-name")?.value || ""
    );
    const email = String(
      document.getElementById("hw-account-email-input")?.value || ""
    ).trim();
    const password = String(
      document.getElementById("hw-account-old-password")?.value || ""
    );
    const newPassword = String(
      document.getElementById("hw-account-new-password")?.value || ""
    );
    if (!password) {
      setStatus(status, "Enter your current password to save.", true);
      document.getElementById("hw-account-old-password")?.focus();
      return;
    }
    setStatus(status, "Saving…", false);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: s.username,
          password,
          displayName,
          email,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save.");
      if (data.session && global.HwAuth?.persistSession) {
        const remember = !!global.localStorage?.getItem?.("jlm-hw-session");
        global.HwAuth.persistSession(data.session, remember);
      }
      if (newPassword) {
        const pwRes = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: s.username,
            password,
            newPassword,
          }),
        });
        const pwData = await pwRes.json().catch(() => ({}));
        if (!pwRes.ok) throw new Error(pwData.error || "Could not update password.");
      }
      fillSession();
      setStatus(status, data.message || "Saved.", false);
    } catch (err) {
      setStatus(status, (err && err.message) || "Could not save.", true);
    }
  }

  async function deleteAccount() {
    const status = document.getElementById("hw-account-delete-status");
    const s = session();
    if (!s?.username) return;
    if (hasPaidPlan()) {
      const checked = document.getElementById("hw-account-delete-paypal-check");
      if (!checked?.checked) {
        setStatus(
          status,
          "Cancel your PayPal plan first, then check the box.",
          true
        );
        return;
      }
    }
    const password = String(
      document.getElementById("hw-account-delete-password")?.value || ""
    );
    if (!password) {
      setStatus(status, "Enter your password to delete this account.", true);
      return;
    }
    setStatus(status, "Deleting…", false);
    try {
      const res = await fetch("/api/auth/delete-own-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: s.username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not delete.");
      global.HwAuth?.logout?.();
      global.location.href = "/homework.html?deleted=1";
    } catch (err) {
      setStatus(status, (err && err.message) || "Could not delete.", true);
    }
  }

  async function joinEmailList() {
    const status = document.getElementById("hw-account-promo-status");
    const s = session();
    const email = String(s?.email || "").trim();
    if (!email || !email.includes("@")) {
      setStatus(
        status,
        "Add an email on your account first, or join from the homepage email list.",
        true
      );
      return;
    }
    setStatus(status, "Joining…", false);
    try {
      const res = await fetch("/api/promo-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          page: "Account Settings",
          interests: ["homework"],
          interestOther: "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not join.");
      markPromoSubscribed();
      const form = document.getElementById("hw-account-promo-form");
      const btn = document.getElementById("hw-account-promo-submit");
      if (btn) btn.remove();
      setStatus(status, data.message || "You’re on the email list.", false);
      if (form && status) status.hidden = false;
    } catch (err) {
      setStatus(status, (err && err.message) || "Could not join.", true);
    }
  }

  function bind() {
    if (bound) return;
    bound = true;

    fillSession();

    document.addEventListener("click", (e) => {
      if (e.target.closest("#hw-account-edit")) {
        e.preventDefault();
        const panel = document.getElementById("hw-account-panel");
        const on = !panel?.classList.contains("is-editing");
        if (!on) fillSession();
        else setProfileEditing(true);
        return;
      }
      if (e.target.closest("#hw-account-delete-confirm")) {
        e.preventDefault();
        void deleteAccount();
        return;
      }
      if (e.target.closest("[data-hw-account-delete-close]")) {
        e.preventDefault();
        closeDeleteDialog();
        return;
      }
      if (e.target.closest("#hw-account-delete")) {
        e.preventDefault();
        openDeleteDialog();
        return;
      }
      const nav = e.target.closest("[data-hw-account-nav]");
      if (!nav) return;
      if (isStandalonePage()) return;
      e.preventDefault();
      if (isOpen()) close();
      else open("profile");
    });

    document.addEventListener("submit", (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.id === "hw-account-profile-form") {
        e.preventDefault();
        void saveProfileChanges();
      } else if (form.id === "hw-account-promo-form") {
        e.preventDefault();
        void joinEmailList();
      }
    });

    window.addEventListener("hashchange", () => {
      if (openFromHashLock) return;
      const parsed = parseHash();
      if (parsed) open(parsed.tab, { fromHash: true, replaceHash: true });
      else if (isOpen()) close({ fromHash: true });
    });
  }

  global.HwAccount = {
    parseHash,
    isAccountHash,
    hashForTab,
    setHash,
    profileMarkup,
    subscriptionMarkup,
    notificationsMarkup,
    fillSession,
    fillPlanCopy,
    bindRoot: fillSession,
    open,
    close,
    isOpen,
    onHubReady,
    ACCOUNT_TABS,
  };

  maybeRedirectStandalone();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  if (!isStandalonePage()) {
    window.addEventListener("load", () => {
      if (parseHash()) onHubReady();
    });
  }
})(window);
